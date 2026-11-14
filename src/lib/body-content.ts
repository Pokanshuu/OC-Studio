export type StoredBodyContent = Record<string, unknown> | string

/** Read historical JSON strings without interpreting text inside an existing document. */
export function readStoredBody(value: unknown): StoredBodyContent | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value !== 'string') return null
  if (value.trim() === '') return ''
  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) &&
        (parsed as { type?: unknown }).type === 'doc') {
      return parsed as Record<string, unknown>
    }
  } catch {
    // Plain text and Markdown are valid historical bodies, including malformed JSON examples.
  }
  return value
}

export interface LegacyBodySection {
  heading?: string
  content: string
}

export interface LegacyBodySections {
  format: 'legacy-body-sections'
  sections: LegacyBodySection[]
}

/** Keep fragment formats separate until the shared editor schema can parse legacy HTML. */
export function legacyBodySections(sections: LegacyBodySection[]): LegacyBodySections | undefined {
  const present = sections.filter((section) => section.content.trim() !== '')
  return present.length > 0 ? { format: 'legacy-body-sections', sections: present } : undefined
}
