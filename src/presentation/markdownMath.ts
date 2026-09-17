// Blok kode berpagar (termasuk yang belum ditutup saat streaming) dan kode inline tidak disentuh.
const CODE_SEGMENT = /(?:^|\n)(?:`{3,}|~{3,})[\s\S]*?(?:\n(?:`{3,}|~{3,})[^\n]*(?=\n|$)|$)|`[^`\n]+`/g

// "$5" atau "$1,250." adalah harga, bukan pembuka rumus.
const CURRENCY_DOLLAR = /(^|[\s(])\$(?=\d[\d.,]*(?:[\s.,;:!?)]|$))/gm

function normalizeText(text: string): string {
  return text
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, formula: string) => `\n$$\n${formula.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, formula: string) => `$${formula.trim()}$`)
    .replace(CURRENCY_DOLLAR, '$1\\$')
}

/**
 * Seragamkan penulisan rumus sebelum Markdown diparsing: `\[..\]` dan `\(..\)` (gaya yang sering
 * dipakai model) diubah menjadi `$$..$$` dan `$..$` yang dipahami remark-math.
 */
export function normalizeMathDelimiters(markdown: string): string {
  let result = ''
  let lastIndex = 0
  for (const match of markdown.matchAll(CODE_SEGMENT)) {
    result += normalizeText(markdown.slice(lastIndex, match.index)) + match[0]
    lastIndex = match.index + match[0].length
  }
  return result + normalizeText(markdown.slice(lastIndex))
}
