'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Eye,
  ImagePlus,
  Italic,
  Bold,
  Heading1,
  Heading2,
  Loader2,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  Redo2,
  Trash2,
  Undo2,
} from 'lucide-react'
import type { Editor } from '@tiptap/core'
import { EditorCore } from '@/components/editor/EditorCore'
import { ImageUploader } from '@/components/shared/ImageUploader'
import { getImageUrl } from '@/lib/image-service'
import { AppConfirm } from '@/components/shared/AppConfirm'
import { useNovels } from './store'
import { makeChapter, type Novel, type NovelChapter } from './types'
import { NovelExportDialog } from './NovelExportDialog'
import { useNavigation } from '@/components/layout/NavigationContext'
import { useWordCount } from '@/components/layout/WordCountContext'

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  })
}

function countWords(html: string): number {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s/g, '').length
}

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  revising: '修改中',
  done: '完成',
}

const STATUS_DOTS: Record<string, string> = {
  draft: 'bg-ink-faint/50',
  revising: 'bg-[#b9975b]',
  done: 'bg-[#7d9367]',
}

export function NovelView() {
  const { novels, loading, createNovel, updateNovel, deleteNovel } = useNovels()
  const { activeItem } = useNavigation()
  const { setWordCount, setWordCountLabel } = useWordCount()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [pendingDeleteNovel, setPendingDeleteNovel] = useState<Novel | null>(null)
  const [creating, setCreating] = useState(false)

  const selected = useMemo(
    () => novels.find((novel) => novel.id === selectedId) ?? null,
    [novels, selectedId],
  )

  const activeChapter =
    selected?.chapters.find((chapter) => chapter.id === activeChapterId) ??
    selected?.chapters[0] ??
    null
  const [chapterTitleDraft, setChapterTitleDraft] = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [authorDraft, setAuthorDraft] = useState('')
  const [synopsisDraft, setSynopsisDraft] = useState('')
  const [novelEditor, setNovelEditor] = useState<Editor | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [focusMode, setFocusMode] = useState(false)
  const totalWords = selected
    ? selected.chapters.reduce((sum, chapter) => sum + countWords(chapter.content), 0)
    : 0
  const targetWords = selected?.targetWords ?? 0
  const goalPercent = targetWords > 0 ? Math.min(100, Math.round((totalWords / targetWords) * 100)) : 0

  useEffect(() => {
    if (activeItem !== '小说') return
    setWordCountLabel('全书字数')
    setWordCount(totalWords)
  }, [activeItem, setWordCount, setWordCountLabel, totalWords])

  useEffect(() => {
    setChapterTitleDraft(activeChapter?.title ?? '')
  }, [activeChapter?.id, activeChapter?.title])

  useEffect(() => {
    setTitleDraft(selected?.title ?? '')
    setAuthorDraft(selected?.author ?? '')
    setSynopsisDraft(selected?.synopsis ?? '')
  }, [selected?.id, selected?.title, selected?.author, selected?.synopsis])

  useEffect(() => {
    if (!selected || selected.title !== '未命名小说') return
    const timer = window.setTimeout(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }, 120)
    return () => window.clearTimeout(timer)
  }, [selected?.id, selected?.title])

  const openNovel = (novel: Novel): void => {
    setSelectedId(novel.id ?? null)
    setActiveChapterId(novel.chapters[0]?.id ?? null)
  }

  const handleCreate = async (): Promise<void> => {
    if (creating) return
    setCreating(true)
    try {
      const novel = await createNovel()
      openNovel(novel)
    } finally {
      setCreating(false)
    }
  }

  const saveChapters = (chapters: NovelChapter[]): void => {
    if (!selected?.id) return
    void updateNovel(selected.id, { chapters })
  }

  const noteItems = selected
    ? (selected.noteItems ??
      (selected.notes ? [{ id: 'legacy-note', text: selected.notes }] : []))
    : []

  const saveNotes = (items: Array<{ id: string; text: string }>): void => {
    if (!selected?.id) return
    void updateNovel(selected.id, { noteItems: items, notes: '' })
  }

  const selectedRef = useRef<Novel | null>(selected)
  selectedRef.current = selected
  const pendingContentRef = useRef<{ chapterId: string; html: string } | null>(null)
  const contentTimerRef = useRef<number | null>(null)

  const flushContent = useCallback((): void => {
    if (contentTimerRef.current !== null) {
      window.clearTimeout(contentTimerRef.current)
      contentTimerRef.current = null
    }
    const pending = pendingContentRef.current
    const novel = selectedRef.current
    pendingContentRef.current = null
    if (!pending || !novel?.id) return
    void updateNovel(novel.id, {
      chapters: novel.chapters.map((chapter) =>
        chapter.id === pending.chapterId ? { ...chapter, content: pending.html } : chapter,
      ),
    })
  }, [updateNovel])

  const handleContentChange = (html: string): void => {
    if (!selected || !activeChapter) return
    pendingContentRef.current = { chapterId: activeChapter.id, html }
    if (contentTimerRef.current !== null) window.clearTimeout(contentTimerRef.current)
    contentTimerRef.current = window.setTimeout(() => {
      contentTimerRef.current = null
      flushContent()
    }, 650)
  }

  useEffect(() => {
    return () => flushContent()
  }, [flushContent])

  const addChapter = (): void => {
    if (!selected) return
    flushContent()
    const chapter = makeChapter('新章节')
    saveChapters([...selected.chapters, chapter])
    setActiveChapterId(chapter.id)
  }

  const removeChapter = (id: string): void => {
    if (!selected || selected.chapters.length <= 1) return
    flushContent()
    const next = selected.chapters.filter((chapter) => chapter.id !== id)
    saveChapters(next)
    if (activeChapterId === id) setActiveChapterId(next[0]?.id ?? null)
  }

  const moveChapter = (id: string, direction: -1 | 1): void => {
    if (!selected) return
    flushContent()
    const index = selected.chapters.findIndex((chapter) => chapter.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= selected.chapters.length) return
    const next = [...selected.chapters]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    saveChapters(next)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-muted">
        加载小说…
      </div>
    )
  }

  if (selected) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="sticky top-0 z-10 flex h-[60px] shrink-0 items-center justify-between border-b border-line bg-paper/85 px-4 backdrop-blur-lg dark:bg-[#1C1B1A]/85">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => {
                flushContent()
                setSelectedId(null)
                setActiveChapterId(null)
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/5"
              title="返回小说列表"
            >
              <ArrowLeft size={19} strokeWidth={2} />
            </button>
            <input
              ref={titleInputRef}
              id="novel-title-input"
              value={titleDraft}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => {
                if (selected.id && titleDraft !== selected.title) {
                  void updateNovel(selected.id, { title: titleDraft.trim() || '未命名小说' })
                }
              }}
              placeholder="小说标题"
              className="min-w-0 flex-1 border-b border-transparent bg-transparent font-serif text-lg text-ink outline-none placeholder:text-ink-faint focus:border-line"
            />
            <button
              onClick={() => {
                titleInputRef.current?.focus()
                titleInputRef.current?.select()
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-faint hover:bg-black/5 hover:text-ink dark:hover:bg-white/5"
              title="修改小说名"
            >
              <Pencil size={13} strokeWidth={1.8} />
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => setFocusMode((value) => !value)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/5"
              title={focusMode ? '退出专注模式' : '专注模式'}
            >
              {focusMode ? <Minimize2 size={16} strokeWidth={2} /> : <Maximize2 size={16} strokeWidth={2} />}
            </button>
            <button
              onClick={() => setExportOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs text-ink-muted hover:border-line-hover hover:text-ink"
            >
              <Eye size={14} strokeWidth={2} />
              <span className="max-sm:hidden">预览 / 导出</span>
            </button>

          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <aside
            className={`w-[230px] shrink-0 overflow-y-auto border-r border-line bg-black/[0.015] p-3 dark:bg-white/[0.015] ${
              focusMode ? 'hidden' : 'max-md:hidden'
            }`}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest text-ink-faint">章节</p>
              <button
                onClick={addChapter}
                className="flex h-6 w-6 items-center justify-center rounded text-ink-faint hover:bg-black/5 hover:text-ink dark:hover:bg-white/5"
                title="添加章节"
              >
                <Plus size={14} strokeWidth={2} />
              </button>
            </div>
            <div className="space-y-1">
              {selected.chapters.map((chapter, index) => (
                <div
                  key={chapter.id}
                  className={`group flex items-center rounded-lg ${
                    chapter.id === activeChapter?.id
                      ? 'bg-black/5 text-ink dark:bg-white/10'
                      : 'text-ink-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/5'
                  }`}
                >
                  <button
                    onClick={() => {
                      flushContent()
                      setActiveChapterId(chapter.id)
                    }}
                    className="min-w-0 flex-1 px-2.5 py-2 text-left text-xs"
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          STATUS_DOTS[chapter.status ?? 'draft']
                        }`}
                      />
                      <span className="truncate">
                        <span className="mr-1 text-ink-faint">{index + 1}.</span>
                        {chapter.title || '未命名章节'}
                      </span>
                    </span>
                    <span className="mt-0.5 block pl-3 text-[9px] text-ink-faint">
                      {countWords(chapter.content)} 字
                    </span>
                  </button>
                  <div className="hidden shrink-0 items-center group-hover:flex">
                    <button
                      onClick={() => moveChapter(chapter.id, -1)}
                      className="flex h-5 w-4 items-center justify-center text-ink-faint hover:text-ink"
                      title="上移"
                    >
                      <ChevronUp size={11} strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => moveChapter(chapter.id, 1)}
                      className="flex h-5 w-4 items-center justify-center text-ink-faint hover:text-ink"
                      title="下移"
                    >
                      <ChevronDown size={11} strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => removeChapter(chapter.id)}
                      className="flex h-5 w-4 items-center justify-center text-ink-faint hover:text-error"
                      title="删除章节"
                    >
                      <Trash2 size={11} strokeWidth={2} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 space-y-3 border-t border-line pt-4">
              <div>
                <p className="mb-1 text-[10px] text-ink-faint">作者</p>
                <input
                  value={authorDraft}
                  onChange={(event) => setAuthorDraft(event.target.value)}
                  onBlur={() => {
                    if (selected.id && authorDraft !== selected.author) {
                      void updateNovel(selected.id, { author: authorDraft })
                    }
                  }}
                  placeholder="作者名"
                  className="h-7 w-full rounded border border-line bg-paper-card px-2 text-[11px] text-ink outline-none placeholder:text-ink-faint"
                />
              </div>
              <div>
                <p className="mb-1 text-[10px] text-ink-faint">简介</p>
                <textarea
                  value={synopsisDraft}
                  onChange={(event) => setSynopsisDraft(event.target.value)}
                  onBlur={() => {
                    if (selected.id && synopsisDraft !== selected.synopsis) {
                      void updateNovel(selected.id, { synopsis: synopsisDraft })
                    }
                  }}
                  placeholder="一句话介绍这个故事"
                  rows={4}
                  className="w-full resize-none rounded border border-line bg-paper-card px-2 py-1.5 text-[11px] leading-5 text-ink outline-none placeholder:text-ink-faint"
                />
              </div>
              <div>
                <p className="mb-1 text-[10px] text-ink-faint">封面</p>
                <ImageUploader
                  value={selected.coverUrl}
                  onChange={(path) => void updateNovel(selected.id!, { coverUrl: path })}
                  onRemove={() => void updateNovel(selected.id!, { coverUrl: '' })}
                  aspectRatio="3:4"
                  size="sm"
                  placeholderText="上传封面"
                />
              </div>

              <div className="border-t border-line pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-ink-faint">全书字数</p>
                  <p className="text-[10px] text-ink-muted">
                    {totalWords}
                    {targetWords > 0 ? ` / ${targetWords}` : ''}
                  </p>
                </div>
                {targetWords > 0 ? (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-[#b9975b] transition-[width]"
                      style={{ width: `${goalPercent}%` }}
                    />
                  </div>
                ) : null}
                <label className="mt-3 block text-[10px] text-ink-faint">
                  目标字数
                  <input
                    key={`${selected.id}-target`}
                    type="number"
                    min={0}
                    defaultValue={selected.targetWords ?? ''}
                    onBlur={(event) => {
                      const value = Number(event.target.value)
                      void updateNovel(selected.id!, {
                        targetWords: Number.isFinite(value) && value > 0 ? Math.round(value) : 0,
                      })
                    }}
                    placeholder="例如 100000"
                    className="mt-1 h-7 w-full rounded border border-line bg-paper-card px-2 text-[11px] text-ink outline-none placeholder:text-ink-faint"
                  />
                </label>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] text-ink-faint">作品笔记</p>
                  <button
                    onClick={() =>
                      saveNotes([
                        ...noteItems,
                        {
                          id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                          text: '',
                        },
                      ])
                    }
                    className="flex h-5 items-center gap-0.5 rounded px-1 text-[10px] text-ink-faint hover:bg-black/5 hover:text-ink dark:hover:bg-white/5"
                    title="添加一条笔记"
                  >
                    <Plus size={11} strokeWidth={2} />
                    添加
                  </button>
                </div>
                <div className="space-y-1.5">
                  {noteItems.map((note) => (
                    <div key={note.id} className="group relative">
                      <textarea
                        key={`${selected.id}-${note.id}`}
                        defaultValue={note.text}
                        onBlur={(event) =>
                          saveNotes(
                            noteItems.map((item) =>
                              item.id === note.id ? { ...item, text: event.target.value } : item,
                            ),
                          )
                        }
                        placeholder="记一条设定或灵感…"
                        rows={2}
                        className="w-full resize-none rounded-lg border border-line bg-paper-card px-2 py-1.5 pr-6 text-[11px] leading-5 text-ink outline-none placeholder:text-ink-faint"
                      />
                      <button
                        onClick={() => saveNotes(noteItems.filter((item) => item.id !== note.id))}
                        className="absolute right-1 top-1 hidden h-5 w-4 items-center justify-center text-ink-faint hover:text-error group-hover:flex"
                        title="删除这条笔记"
                      >
                        <Trash2 size={11} strokeWidth={2} />
                      </button>
                    </div>
                  ))}
                  {noteItems.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-line px-2 py-2 text-[10px] leading-4 text-ink-faint">
                      像备忘录一样，一条一条记录设定、灵感和待办。
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto bg-black/[0.035] dark:bg-black/20">
            {activeChapter ? (
              <div className="mx-auto w-full max-w-[880px] px-3 py-5 md:px-8 md:py-8">
                <div className="mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-line bg-paper/85 p-1.5 backdrop-blur">
                  {[
                    { icon: Bold, title: '加粗', action: () => novelEditor?.chain().focus().toggleBold().run() },
                    { icon: Italic, title: '斜体', action: () => novelEditor?.chain().focus().toggleItalic().run() },
                    { icon: Heading1, title: '一级标题', action: () => novelEditor?.chain().focus().toggleHeading({ level: 1 }).run() },
                    { icon: Heading2, title: '二级标题', action: () => novelEditor?.chain().focus().toggleHeading({ level: 2 }).run() },
                    {
                      icon: ImagePlus,
                      title: '插入图片',
                      action: () => novelEditor?.chain().focus().insertContent({ type: 'imageBlock' }).run(),
                    },
                  ].map((item) => (
                    <button
                      key={item.title}
                      onPointerDown={(event) => {
                        event.preventDefault()
                        item.action()
                      }}
                      title={item.title}
                      className="flex h-7 w-7 items-center justify-center rounded text-ink-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/5"
                    >
                      <item.icon size={14} strokeWidth={2} />
                    </button>
                  ))}
                  <span className="mx-1 h-4 w-px bg-line" />
                  <button
                    onPointerDown={(event) => {
                      event.preventDefault()
                      novelEditor?.chain().focus().undo().run()
                    }}
                    title="撤销"
                    className="flex h-7 w-7 items-center justify-center rounded text-ink-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/5"
                  >
                    <Undo2 size={14} strokeWidth={2} />
                  </button>
                  <button
                    onPointerDown={(event) => {
                      event.preventDefault()
                      novelEditor?.chain().focus().redo().run()
                    }}
                    title="重做"
                    className="flex h-7 w-7 items-center justify-center rounded text-ink-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/5"
                  >
                    <Redo2 size={14} strokeWidth={2} />
                  </button>
                  <span className="ml-auto pr-1 text-[10px] text-ink-faint">正文编辑器</span>
                </div>
                <div className="novel-paper min-h-[72vh] rounded-sm bg-[#fbf7ee] px-6 py-9 text-[#3b3227] shadow-[0_18px_50px_rgba(20,15,10,0.16)] md:min-h-[86vh] md:px-16 md:py-14">
                  <div className="flex items-start gap-2">
                    <input
                      value={chapterTitleDraft}
                      onChange={(event) => setChapterTitleDraft(event.target.value)}
                      onBlur={() => {
                        const title = chapterTitleDraft.trim() || '新章节'
                        if (title === activeChapter.title) return
                        saveChapters(
                          selected.chapters.map((chapter) =>
                            chapter.id === activeChapter.id ? { ...chapter, title } : chapter,
                          ),
                        )
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          event.currentTarget.blur()
                        }
                      }}
                      placeholder="输入章节名，例如：雨夜来客"
                      className="min-w-0 flex-1 border-none bg-transparent font-serif text-2xl font-semibold text-[#3b3227] outline-none placeholder:text-[#9b8b76] md:text-3xl"
                    />
                    <Pencil size={14} strokeWidth={1.8} className="mt-2 shrink-0 text-[#a3927b]" />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 border-b border-[#d9c9b4] pb-3 text-[10px] text-[#9b8b76]">
                    <span>{countWords(activeChapter.content)} 字</span>
                    <span>·</span>
                    <select
                      value={activeChapter.status ?? 'draft'}
                      onChange={(event) =>
                        saveChapters(
                          selected.chapters.map((chapter) =>
                            chapter.id === activeChapter.id
                              ? {
                                  ...chapter,
                                  status: event.target.value as NovelChapter['status'],
                                }
                              : chapter,
                          ),
                        )
                      }
                      className="rounded border-0 bg-transparent px-0 py-0 text-[10px] text-[#7a6650] outline-none"
                    >
                      <option value="draft">草稿</option>
                      <option value="revising">修改中</option>
                      <option value="done">完成</option>
                    </select>
                    <span>·</span>
                    <span>自动保存到本地</span>
                    <span className="ml-auto font-serif tracking-widest">OC STUDIO</span>
                  </div>

                  <details className="mt-4 rounded-lg border border-[#dfd0bc] bg-[#f7f0e3] px-3 py-2">
                    <summary className="cursor-pointer text-xs text-[#7a6650]">章节大纲 / 备注</summary>
                    <textarea
                      key={`${activeChapter.id}-summary`}
                      defaultValue={activeChapter.summary ?? ''}
                      onBlur={(event) =>
                        saveChapters(
                          selected.chapters.map((chapter) =>
                            chapter.id === activeChapter.id
                              ? { ...chapter, summary: event.target.value }
                              : chapter,
                          ),
                        )
                      }
                      placeholder="这一章要发生什么？"
                      rows={2}
                      className="mt-2 w-full resize-none bg-transparent text-xs leading-6 text-[#4c4032] outline-none placeholder:text-[#a3927b]"
                    />
                  </details>

                  <div className="novel-paper-editor mt-6">
                    <EditorCore
                      key={activeChapter.id}
                      plain
                      hideBubbleMenu
                      hideContextMenu
                      content={activeChapter.content}
                      placeholder="从这一页开始写故事…"
                      onReady={(editor) => setNovelEditor(editor)}
                      onContentChange={handleContentChange}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-ink-faint">
                这个章节不存在
              </div>
            )}
          </div>
        </div>

        <NovelExportDialog
          open={exportOpen}
          novel={selected}
          onClose={() => setExportOpen(false)}
        />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-5 py-6 md:px-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ink-faint">写作</p>
            <h1 className="mt-1 font-serif text-2xl text-ink">小说</h1>
            <p className="mt-1 text-xs text-ink-muted">
              分章节写作、插入图片，并按 9:16、16:9 或 A4 导出小说页。
            </p>
          </div>
          <button
            onClick={() => void handleCreate()}
            disabled={creating}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm text-paper hover:opacity-90 disabled:opacity-50"
          >
            {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} strokeWidth={2} />}
            新建小说
          </button>
        </div>

        {novels.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line py-20 text-center">
            <BookOpen size={28} strokeWidth={1.4} className="text-ink-faint" />
            <p className="mt-3 font-serif text-base text-ink-muted">还没有小说</p>
            <p className="mt-1 text-[11px] text-ink-faint">点“新建小说”开始写第一章。</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {novels.map((novel) => (
              <div
                key={novel.id}
                className="group relative overflow-hidden rounded-xl border border-line bg-paper-card/40 transition-shadow hover:shadow-md"
              >
                <button
                  onClick={() => openNovel(novel)}
                  className="block w-full text-left"
                >
                  <div className="aspect-[16/9] w-full bg-black/5 dark:bg-white/5">
                    {novel.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getImageUrl(novel.coverUrl, 'avatar')}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <BookOpen size={26} strokeWidth={1.3} className="text-ink-faint" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="truncate font-serif text-base text-ink">{novel.title || '未命名小说'}</h3>
                    <p className="mt-1 text-[11px] text-ink-faint">
                      {novel.chapters.length} 章 · {formatDate(novel.updatedAt)}
                      {novel.author ? ` · ${novel.author}` : ''}
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => setPendingDeleteNovel(novel)}
                  className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-lg bg-paper/85 text-ink-faint backdrop-blur hover:text-error group-hover:flex"
                  title="删除小说"
                >
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <AppConfirm
        open={pendingDeleteNovel !== null}
        title="删除小说"
        description={`确定删除《${pendingDeleteNovel?.title ?? ''}》吗？这会删除所有章节。`}
        confirmLabel="删除"
        danger
        onConfirm={() => {
          if (pendingDeleteNovel?.id) void deleteNovel(pendingDeleteNovel.id)
          setPendingDeleteNovel(null)
        }}
        onCancel={() => setPendingDeleteNovel(null)}
      />
    </div>
  )
}
