/**
 * 实体正文的**默认骨架**（唯一源）。
 *
 * 两处用同一份：
 * 1. 编辑器的渲染兜底 —— 新建的角色 / 事件 / 国家还没写过正文时，先摆出这几行提示，
 *    **不落盘**（用户不写就一直是空的）
 * 2. 「正文预设」编辑器的起点 —— 与其让人对着空白页重打一遍，不如把这份骨架摆出来改
 *    （改了才存成预设，见 `components/settings/BodyPresetEditor.tsx`）
 *
 * `placeholder` 是 Tiptap 的占位属性：它只是提示，不计入正文文本。所以骨架**不能**
 * 直接当 Markdown 存 —— 预设编辑器只在用户真改过之后才落盘。
 */

export type BodySkeletonKind = 'character' | 'event' | 'country' | 'worldEntry'

interface SkeletonNode {
  type: string
  attrs?: Record<string, unknown>
  content?: SkeletonNode[]
  text?: string
}

function p(): SkeletonNode {
  return { type: 'paragraph' }
}
function pp(placeholder: string): SkeletonNode {
  return { type: 'paragraph', attrs: { placeholder } }
}
function h2b(text: string): SkeletonNode {
  return { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] }
}
function hr(): SkeletonNode {
  return { type: 'horizontalRule' }
}

export function defaultBodyDocument(kind: BodySkeletonKind): SkeletonNode {
  switch (kind) {
    case 'character':
      return {
        type: 'doc',
        content: [
          h2b('人物简介'),
          pp('编写角色简介...'),
          hr(),
          h2b('人物生平'),
          pp('编写角色生平...'),
        ],
      }
    case 'event':
      return { type: 'doc', content: [pp('开始编写事件内容...')] }
    case 'country':
      return {
        type: 'doc',
        content: [
          h2b('政治制度'),
          pp('政治制度、权力结构...'),
          hr(),
          h2b('地理环境'),
          pp('地形、气候、自然资源...'),
          hr(),
          h2b('人文风貌'),
          pp('文化、宗教、人口...'),
        ],
      }
    case 'worldEntry':
      return { type: 'doc', content: [p()] }
  }
}
