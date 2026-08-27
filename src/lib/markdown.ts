export function normalizeLegacyEscapedMarkdown(markdown: string) {
  const hasEscapedBlocks = /(^|\n)\\(?:#{1,6}\s|[-*>]\s|\d+\.\s|`{3,})/m.test(markdown);
  if (!hasEscapedBlocks) return markdown;

  return markdown
    .replace(/^\\(?=#{1,6}\s|[-*>]\s|\d+\.\s|`{3,})/gm, "")
    .replace(/\\([*_`[\]|])/g, "$1")
    .replace(/&#x20;/g, " ");
}
