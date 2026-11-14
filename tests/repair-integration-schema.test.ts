import { expect, test, vi } from 'vitest'
import { getSchema } from '@tiptap/core'

vi.mock('@/lib/db', () => ({ db: {} }))

import { buildEditorConfig } from '@/components/editor/editor-config'
import { remapRowRefs } from '@/lib/import-remap'
import { createLinkSerializer, serializeBody } from '@/lib/vault/markdown-bridge'

test('imported mention and wiki anchors survive the shared editor schema', () => {
  const input = {
    id: 1,
    document: { type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'mention', attrs: { entityType: 'character', id: '1', label: '角色别名', raw: '旧角色#角色小节|角色别名' } },
      { type: 'wikiLink', attrs: { id: '1', label: '笔记别名', raw: '旧笔记#笔记小节|笔记别名' } },
    ] }] },
  }
  const maps = {
    characters: new Map([[1, 101]]), countries: new Map<number, number>(),
    events: new Map<number, number>(), worldEntries: new Map([[1, 201]]), tags: new Map<number, number>(),
  }
  const remapped = { ...input, ...remapRowRefs('worldEntry', input, maps).patch }
  const config = buildEditorConfig({
    isMobile: true, editorId: 'schema-regression', getEditor: () => null,
    isKeyboardVisible: () => false, setEditor: () => {}, setActiveEditor: () => {}, onReady: () => {},
  })
  const schema = getSchema(config.extensions ?? [])
  const document = schema.nodeFromJSON(remapped.document).toJSON()
  const result = serializeBody('worldEntry', { ...remapped, document }, createLinkSerializer(
    (kind) => kind === 'character' ? '角色' : '笔记',
    (kind) => kind === 'character' ? '新角色' : '新笔记',
  ))
  expect(result?.markdown).toContain('[[新角色#角色小节|角色别名]]')
  expect(result?.markdown).toContain('[[新笔记#笔记小节|笔记别名]]')
})
