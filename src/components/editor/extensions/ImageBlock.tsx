import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { ReactNodeViewProps } from '@tiptap/react'
import { useState, useRef, useEffect } from 'react'
import { ImageIcon } from 'lucide-react'
import { uploadImage, getImageUrl } from '@/lib/image-service'
import { useMediaDownload } from '@/lib/use-media-download'
import { useMediaMenu } from '@/lib/use-media-menu'
import { InlineCrop } from '@/components/shared/InlineCrop'
import { FullscreenViewer } from '@/components/shared/FullscreenViewer'
import { MediaContextMenu, type MediaMenuItem } from '@/components/shared/MediaContextMenu'

export const ImageBlock = Node.create({
  name: 'imageBlock',

  group: 'block',

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute('src'),
        renderHTML: (attributes) => ({ src: attributes.src }),
      },
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-width'),
        renderHTML: (attributes) => ({ 'data-width': attributes.width }),
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="image-block"]' },
      {
        // 从网页 / Word 粘贴进来的图片：保留可用的远程或本地地址；
        // data: 图片体积失控且导出带不走，直接丢（与粘贴清洗的规则一致）。
        tag: 'img[src]',
        getAttrs: (element) => {
          const src = (element as HTMLElement).getAttribute('src') ?? ''
          if (src === '' || /^data:/i.test(src)) return false
          return { src, width: null }
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'image-block' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockView)
  },
})

/**
 * 正文图片块：单击看大图，右键 / 长按出菜单（更换 / 编辑 / 保存到… / 删除）。
 * 缩放拖柄保留；图上不再压裁剪 / 删除圆钮。
 */
function ImageBlockView({ node, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const src = node.attrs.src as string | null
  const [cropping, setCropping] = useState(false)
  const [viewing, setViewing] = useState(false)
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ move: (ev: MouseEvent) => void; up: () => void } | null>(null)
  const { save } = useMediaDownload()
  const handlersFor = useMediaMenu<never>((_, at) => setMenuAt(at))
  const imageMenuHandlers = handlersFor()

  useEffect(() => {
    return () => {
      if (dragRef.current) {
        document.removeEventListener('mousemove', dragRef.current.move)
        document.removeEventListener('mouseup', dragRef.current.up)
        dragRef.current = null
      }
    }
  }, [])

  async function handleUpload() {
    const path = await uploadImage('avatar')
    if (path) {
      updateAttributes({ src: path })
    }
  }

  function handleCropComplete(dataUrl: string) {
    updateAttributes({ src: dataUrl })
    setCropping(false)
  }

  if (!src) {
    return (
      <NodeViewWrapper>
        <div
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-item border border-dashed border-line bg-paper-card py-12"
          contentEditable={false}
          onClick={handleUpload}
        >
          <ImageIcon size={24} strokeWidth={1.5} className="text-ink-faint" />
          <span className="text-sm text-ink-faint">点击上传图片</span>
        </div>
      </NodeViewWrapper>
    )
  }

  if (cropping) {
    return (
      <NodeViewWrapper>
        <div contentEditable={false}>
          <InlineCrop
            src={getImageUrl(src, 'avatar')}
            onComplete={handleCropComplete}
            onCancel={() => setCropping(false)}
          />
        </div>
      </NodeViewWrapper>
    )
  }

  const width = node.attrs.width as number | null
  const menuItems: MediaMenuItem[] = [
    { label: '查看大图', onSelect: () => setViewing(true) },
    { label: '更换', onSelect: () => void handleUpload() },
    { label: '编辑', onSelect: () => setCropping(true) },
    { label: '保存到…', onSelect: () => void save(src, '图片.png') },
    { label: '删除', danger: true, onSelect: () => deleteNode() },
  ]

  return (
    <NodeViewWrapper>
      <div className="group relative flex justify-center" contentEditable={false}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getImageUrl(src, 'avatar')}
          alt=""
          className="max-w-full cursor-zoom-in"
          style={width ? { width: `${width}px` } : undefined}
          draggable={true}
          {...imageMenuHandlers}
          onClick={() => setViewing(true)}
        />
        <div
          className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize opacity-0 group-hover:opacity-100"
          style={{
            background: 'linear-gradient(135deg, transparent 50%, var(--color-ink-muted) 50%)',
          }}
          onMouseDown={(e) => {
            e.preventDefault()
            const startX = e.clientX
            const startWidth = width || 300
            const move = (ev: MouseEvent) => {
              const diff = ev.clientX - startX
              updateAttributes({ width: Math.max(50, startWidth + diff) })
            }
            const up = () => {
              document.removeEventListener('mousemove', move)
              document.removeEventListener('mouseup', up)
              dragRef.current = null
            }
            dragRef.current = { move, up }
            document.addEventListener('mousemove', move)
            document.addEventListener('mouseup', up)
          }}
        />
      </div>

      {menuAt ? (
        <MediaContextMenu at={menuAt} items={menuItems} onClose={() => setMenuAt(null)} />
      ) : null}

      {viewing ? (
        <FullscreenViewer images={[src]} initialIndex={0} onClose={() => setViewing(false)} />
      ) : null}
    </NodeViewWrapper>
  )
}
