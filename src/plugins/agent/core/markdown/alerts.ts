/**
 * GFM alert blocks (`> [!NOTE]`) as a standalone remark transform.
 *
 * A *remark* plugin sees **mdast**, so the output element must be described
 * through `data.hName` / `data.hProperties` — the mdast-util-to-hast contract.
 * Assigning `tagName` / `properties` (the **hast** field names) is silently
 * ignored: the marker gets stripped and the block stays a plain quote. That bug
 * is why this lives in `core/` with its own test rather than inline in a
 * component where it cannot be exercised without a DOM.
 */

interface MdastNode {
  type?: string
  value?: string
  children?: MdastNode[]
  data?: Record<string, unknown>
}

const ALERT_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i

export function remarkAlerts() {
  return (tree: MdastNode) => {
    const visit = (node: MdastNode) => {
      for (const child of node.children ?? []) {
        if (child.type === 'blockquote') {
          const first = child.children?.[0]
          const textNode = first?.children?.[0]
          if (first?.type === 'paragraph' && textNode?.type === 'text' && textNode.value) {
            const match = ALERT_MARKER.exec(textNode.value)
            if (match) {
              textNode.value = textNode.value.slice(match[0].length)
              child.data = {
                ...(child.data ?? {}),
                hName: 'div',
                hProperties: {
                  className: ['alert'],
                  'data-alert': match[1].toUpperCase(),
                },
              }
            }
          }
        }
        visit(child)
      }
    }
    visit(tree)
  }
}
