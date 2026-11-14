/** Remote URLs retain their URL encoding; local image nodes hold file paths. */
function isRemoteImageSrc(src: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(src) || src.startsWith('//')
}

/** Decode Markdown's URI once before resolving a local file through the asset API. */
export function localImageSrc(src: string): string {
  if (isRemoteImageSrc(src)) return src
  try {
    return decodeURIComponent(src)
  } catch {
    return src
  }
}

/** Preserve literal percent signs and delimit paths containing spaces or parentheses. */
export function imageMarkdown(src: string): string {
  const target = isRemoteImageSrc(src) ? src : src.replace(/%/g, '%25')
  const escaped = target.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
  return `![](${/[\s()]/.test(escaped) ? `<${escaped}>` : escaped})`
}
