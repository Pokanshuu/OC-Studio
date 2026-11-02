'use client'

import { useState } from 'react'
import {
  Users,
  CalendarDays,
  Flag,
  BookOpen,
  Clock,
  GitBranch,
  Settings,
  Trash2,
  Images,
  FolderOpen,
  Map as MapIcon,
  Table2,
  Plus,
  Shapes,
  GripVertical,
  PenLine,
  Sword,
  PawPrint,
} from 'lucide-react'
import { useNavigation } from './NavigationContext'
import { useSettingsTrigger } from './SettingsTriggerContext'
import { useTrashOverlay } from './TrashOverlayContext'
import { useCustomSections, type CustomSection } from '@/features/custom-sections'
import { AppConfirm } from '@/components/shared/AppConfirm'
import { createPortal } from 'react-dom'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function SortableCustomSection({
  section,
  isActive,
  onSelect,
  onDelete,
}: {
  section: CustomSection
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : undefined,
        zIndex: isDragging ? 30 : undefined,
        position: 'relative',
      }}
      className="group flex items-center gap-0.5"
    >
      <span
        {...attributes}
        {...listeners}
        className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center rounded text-ink-faint transition-transform hover:scale-125 hover:text-ink-muted active:scale-95"
        title="拖动排序"
      >
        <GripVertical size={13} strokeWidth={2} />
      </span>
      <button
        onClick={onSelect}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
          isActive
            ? 'bg-black/5 text-ink dark:bg-white/5'
            : 'text-ink-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/5'
        }`}
      >
        {section.preset === 'weapon' ? (
          <Sword size={15} strokeWidth={2} className="shrink-0 text-ink-faint" />
        ) : section.preset === 'pet' ? (
          <PawPrint size={15} strokeWidth={2} className="shrink-0 text-ink-faint" />
        ) : (
          <Shapes size={15} strokeWidth={2} className="shrink-0 text-ink-faint" />
        )}
        <span className="truncate">{section.name}</span>
      </button>
      <button
        onClick={onDelete}
        className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-ink-faint hover:text-error group-hover:flex"
        title="删除分类"
      >
        ×
      </button>
    </div>
  )
}

const navItems = [
  { label: '角色', icon: Users },
  { label: '事件', icon: CalendarDays },
  { label: '国家', icon: Flag },
  { label: '武器', icon: Sword },
  { label: '宠物', icon: PawPrint },
  { label: '世界观', icon: BookOpen },
  { label: '树表', icon: Table2 },
  { label: '小说', icon: PenLine },
  { label: '地图生成器', icon: MapIcon },
  { label: '地图', icon: FolderOpen },
  { label: '时间线', icon: Clock },
  { label: '关系图', icon: GitBranch },
] as const

export function Sidebar() {
  const { activeItem, setActiveItem } = useNavigation()
  const { openSettings } = useSettingsTrigger()
  const { openTrash } = useTrashOverlay()
  const { sections, createSection, reorderSections, deleteSection } = useCustomSections()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [pendingDelete, setPendingDelete] = useState<CustomSection | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )
  const handleSectionDragEnd = (event: DragEndEvent): void => {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    if (!overId || activeId === overId) return
    reorderSections(activeId, overId)
  }
  const handleCreateSection = (): void => {
    const name = newName.trim()
    if (!name) return
    const section = createSection(name, newDescription)
    setActiveItem(`custom:${section.id}`)
    setNewName('')
    setNewDescription('')
    setCreating(false)
  }

  const renderNavItem = (item: (typeof navItems)[number]) => {
    const isActive = activeItem === item.label
    return (
      <button
        key={item.label}
        onClick={() => setActiveItem(item.label)}
        className={`flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
          isActive
            ? 'bg-black/5 text-ink dark:bg-white/5'
            : 'text-ink-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/5'
        }`}
      >
        <item.icon size={16} strokeWidth={2} />
        <span className="transparent-text">{item.label}</span>
      </button>
    )
  }

  const customSections = sections.filter((section) => !section.preset)

  return (
    <aside data-sidebar className="max-md:hidden flex h-full w-[140px] shrink-0 flex-col overflow-y-auto border-r border-line bg-transparent aside-scroll">
      <nav className="flex flex-1 flex-col gap-1 p-3">
        <p className="px-2 pb-1 pt-1 text-[9px] uppercase tracking-widest text-ink-faint">创作</p>
        {navItems.slice(0, 8).map(renderNavItem)}

        <p className="mt-2 px-2 pb-1 text-[9px] uppercase tracking-widest text-ink-faint">世界</p>
        {navItems.slice(8).map(renderNavItem)}

        <div className="mt-3 flex items-center gap-2 border-t border-line px-2 pb-1 pt-3">
          <Shapes size={12} strokeWidth={2} className="text-ink-faint" />
          <span className="text-[9px] uppercase tracking-widest text-ink-faint">自定义分类</span>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleSectionDragEnd}
        >
          <SortableContext
            items={customSections.map((section) => section.id)}
            strategy={verticalListSortingStrategy}
          >
            {customSections.map((section) => (
              <SortableCustomSection
                key={section.id}
                section={section}
                isActive={activeItem === `custom:${section.id}`}
                onSelect={() => setActiveItem(`custom:${section.id}`)}
                onDelete={() => setPendingDelete(section)}
              />
            ))}
          </SortableContext>
        </DndContext>

        <button
          onClick={() => setCreating(true)}
          className="mt-1 flex items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-ink-faint transition-colors hover:bg-black/5 hover:text-ink dark:hover:bg-white/5"
        >
          <Plus size={14} strokeWidth={2} />
          新建分类
        </button>
      </nav>

      <div className="flex flex-col gap-1 border-t border-line p-3">
        <button
          onClick={() => setActiveItem('相册')}
          className={`flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
            activeItem === '相册'
              ? 'bg-black/5 dark:bg-white/5 text-ink'
              : 'text-ink-muted hover:text-ink hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          <Images size={16} strokeWidth={2} />
          <span className="transparent-text">相册</span>
        </button>
        <button
          onClick={openTrash}
          className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-ink-muted transition-colors hover:text-ink hover:bg-black/5 dark:hover:bg-white/5"
        >
          <Trash2 size={16} strokeWidth={2} />
          <span className="transparent-text">回收站</span>
        </button>
        <button
          onClick={() => openSettings()}
          className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-ink-muted transition-colors hover:text-ink hover:bg-black/5 dark:hover:bg-white/5"
        >
          <Settings size={16} strokeWidth={2} />
          <span className="transparent-text">设置</span>
        </button>
      </div>

      {creating ? createPortal(
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/25 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) setCreating(false)
          }}
        >
          <div className="w-[340px] rounded-xl border border-line bg-paper p-4 shadow-xl">
            <h3 className="font-serif text-base text-ink">新建分类</h3>
            <p className="mt-1 text-[11px] text-ink-muted">
              给这个分类起一个名字，例如「势力」「地区」「组织」。
            </p>
            <input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleCreateSection()
                if (event.key === 'Escape') setCreating(false)
              }}
              placeholder="分类名称，例如：信仰"
              className="mt-3 h-9 w-full rounded-lg border border-line bg-paper-card px-3 text-sm text-ink outline-none focus:border-line-hover"
            />
            <input
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleCreateSection()
              }}
              placeholder="分类描述，例如：地图分类"
              className="mt-2 h-9 w-full rounded-lg border border-line bg-paper-card px-3 text-sm text-ink outline-none focus:border-line-hover"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setCreating(false)}
                className="h-8 rounded-lg border border-line px-3 text-xs text-ink-muted hover:border-line-hover hover:text-ink"
              >
                取消
              </button>
              <button
                onClick={handleCreateSection}
                disabled={!newName.trim()}
                className="h-8 rounded-lg bg-ink px-3 text-xs text-paper hover:opacity-90 disabled:opacity-40"
              >
                创建
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      <AppConfirm
        open={pendingDelete !== null}
        title="删除分类"
        description={
          pendingDelete
            ? `确定删除分类「${pendingDelete.name}」？分类中的所有条目和关联关系都会一起删除，原人物、国家等内容不会受影响。`
            : undefined
        }
        confirmLabel="删除分类"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return
          deleteSection(pendingDelete.id)
          if (activeItem === `custom:${pendingDelete.id}`) setActiveItem(null)
          setPendingDelete(null)
        }}
      />
    </aside>
  )
}
