import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { ReactNodeViewProps } from '@tiptap/react'
import { useState } from 'react'
import { ImageIcon, Crop } from 'lucide-react'
import { uploadImage, getImageUrl } from '@/lib/image-service'
import { InlineCrop } from '@/components/shared/InlineCrop'

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
    return [{ tag: 'div[data-type="image-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'image-block' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockView)
  },
})

function ImageBlockView({ node, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const src = node.attrs.src as string | null
  const [cropping, setCropping] = useState(false)

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
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line bg-paper-card py-12"
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

  return (
    <NodeViewWrapper>
      <div className="group relative flex justify-center" contentEditable={false}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getImageUrl(src, 'avatar')}
          alt=""
          className="max-w-full"
          style={width ? { width: `${width}px` } : undefined}
          draggable={true}
        />
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => setCropping(true)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60"
            title="裁剪"
          >
            <Crop size={14} strokeWidth={2} />
          </button>
          <button
            onClick={() => deleteNode()}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60"
            title="删除"
          >
            <ImageIcon size={14} strokeWidth={2} />
          </button>
        </div>
        <div
          className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize opacity-0 group-hover:opacity-100"
          style={{
            background: 'linear-gradient(135deg, transparent 50%, var(--color-ink-muted) 50%)',
          }}
          onMouseDown={(e) => {
            e.preventDefault()
            const startX = e.clientX
            const startWidth = width || 300
            function onMouseMove(ev: MouseEvent) {
              const diff = ev.clientX - startX
              updateAttributes({ width: Math.max(50, startWidth + diff) })
            }
            function onMouseUp() {
              document.removeEventListener('mousemove', onMouseMove)
              document.removeEventListener('mouseup', onMouseUp)
            }
            document.addEventListener('mousemove', onMouseMove)
            document.addEventListener('mouseup', onMouseUp)
          }}
        />
      </div>
    </NodeViewWrapper>
  )
}
