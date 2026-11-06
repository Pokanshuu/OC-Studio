/**
 * 旧 `kind` / `类别` 角色 → 分类条目的一次性导入。
 *
 * 旧版把武器 / 宠物放在角色表里（`kind` 或中文 `类别` 键）。新版分类条目是
 * `worldEntries` 的一行，所以这里做一次**非破坏性复制**：原角色保留，复制出一条
 * 分类条目（封面 / 简介 / 别名 / 标签 / 自定义字段 / 正文一起带过去）。
 *
 * 导入后把角色上的旧键删掉，避免下次再被列出来；盘上的 `kind` / `类别` 不在
 * `CHARACTER_KEYS` 里，写回时不会被我们碰，所以旧文件仍然保持原样。
 */
import { db } from '@/lib/db'
import type { Character } from '@/types'
import { getCategories, loadCategories, updateCategory } from '@/lib/categories/store'
import { createEntry } from '@/features/world/services'
import { notifyDataUpdated } from '@/lib/data-events'

export type LegacyKind = 'weapon' | 'pet'

interface LegacyCharacter {
  character: Character
  kind: LegacyKind
}

function rawField(character: Character, key: string): unknown {
  return (character as unknown as Record<string, unknown>)[key]
}

/** `武器 / 宠物 / weapon / pet` → 归一；角色 / 空 → null */
export function legacyKindOf(character: Character): LegacyKind | null {
  const value =
    character.legacyKind ?? rawField(character, 'kind') ?? rawField(character, '类别')
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'weapon' || normalized === '武器') return 'weapon'
  if (normalized === 'pet' || normalized === '宠物') return 'pet'
  return null
}

export async function listLegacyCharacters(): Promise<LegacyCharacter[]> {
  const rows = await db.characters.toArray()
  const out: LegacyCharacter[] = []
  for (const character of rows) {
    if (character.deleted) continue
    const kind = legacyKindOf(character)
    if (kind) out.push({ character, kind })
  }
  return out
}

function bodyOf(character: Character): string {
  if (typeof character.document === 'string' && character.document.trim() !== '') {
    return character.document
  }
  if (character.document !== undefined && character.document !== null) {
    try {
      return JSON.stringify(character.document)
    } catch {
      // 落回人生故事
    }
  }
  // 角色的 `lifeStory` 本来就是编辑器 HTML；原样交给词条正文，
  // 再 escape 一次会把标签当文字显示出来。
  return (character.lifeStory ?? '').trim()
}

function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function summaryOf(character: Character): string {
  const source = (character.bio || character.lifeStory || '').trim()
  return plainText(source).slice(0, 80)
}

async function ensureCategory(kind: LegacyKind): Promise<{ id: string; name: string; template: string } | null> {
  await loadCategories()
  const id = kind === 'pet' ? 'cat-pet' : 'cat-weapon'
  const category = getCategories().find((item) => item.id === id)
  if (!category) return null
  if (!category.enabled) await updateCategory(category.id, { enabled: true })
  return { id: category.id, name: category.name, template: category.template }
}

/** 导入一条旧角色；返回是否真的新建（同名同分类已存在时跳过） */
async function importOne({ character, kind }: LegacyCharacter): Promise<boolean> {
  const category = await ensureCategory(kind)
  if (!category) return false

  const title = character.name.trim() || '未命名'
  const existing = await db.worldEntries
    .filter((row) => !row.deleted && (row.category ?? '') === category.name && row.title === title)
    .count()
  if (existing > 0) {
    await clearLegacyKind(character.id)
    return false
  }

  const order = await db.worldEntries.filter((row) => (row.category ?? '') === category.name).count()
  const entry: Parameters<typeof createEntry>[0] = {
    title,
    content: bodyOf(character),
    summary: summaryOf(character),
    cover: character.headerUrl ?? undefined,
    category: category.name,
    template: category.template,
    parentId: null,
    order,
    isConcept: false,
    tags: character.tags ?? [],
    custom: character.custom,
  }
  await createEntry(entry)
  await clearLegacyKind(character.id)
  return true
}

async function clearLegacyKind(characterId: number): Promise<void> {
  await db.characters.where('id').equals(characterId).modify((row) => {
    const record = row as unknown as Record<string, unknown>
    delete record.kind
    delete record['类别']
    delete record.legacyKind
  })
}

export async function importLegacyCharacters(): Promise<{ imported: number; skipped: number }> {
  const rows = await listLegacyCharacters()
  let imported = 0
  let skipped = 0
  for (const row of rows) {
    try {
      if (await importOne(row)) imported += 1
      else skipped += 1
    } catch (err) {
      console.error('[legacy-kind-import] failed:', row.character.id, err)
      skipped += 1
    }
  }
  if (imported > 0) notifyDataUpdated()
  return { imported, skipped }
}

/** 给 UI 用的摘要（数量按 kind 分开，便于文案里说清） */
export async function legacyKindCount(): Promise<{ total: number; weapon: number; pet: number }> {
  const rows = await listLegacyCharacters()
  return {
    total: rows.length,
    weapon: rows.filter((row) => row.kind === 'weapon').length,
    pet: rows.filter((row) => row.kind === 'pet').length,
  }
}
