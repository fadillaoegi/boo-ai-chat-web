import type { PhrasingContent, Root } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'

export interface InlineRun {
  text: string
  bold?: boolean
  italic?: boolean
  strike?: boolean
  code?: boolean
  link?: string
}

type InlineMarks = Omit<InlineRun, 'text'>

export function parseMarkdown(markdown: string): Root {
  return fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })
}

/** Ratakan inline markdown menjadi potongan teks bergaya yang dipahami pembuat PDF dan DOCX. */
export function inlineRuns(nodes: PhrasingContent[], marks: InlineMarks = {}): InlineRun[] {
  return nodes.flatMap((node): InlineRun[] => {
    switch (node.type) {
      case 'text':
        return [{ ...marks, text: node.value }]
      case 'strong':
        return inlineRuns(node.children, { ...marks, bold: true })
      case 'emphasis':
        return inlineRuns(node.children, { ...marks, italic: true })
      case 'delete':
        return inlineRuns(node.children, { ...marks, strike: true })
      case 'inlineCode':
        return [{ ...marks, code: true, text: node.value }]
      case 'link':
        return inlineRuns(node.children, { ...marks, link: node.url })
      case 'linkReference':
        return inlineRuns(node.children, marks)
      case 'break':
        return [{ ...marks, text: '\n' }]
      case 'image':
      case 'imageReference':
        return node.alt ? [{ ...marks, italic: true, text: node.alt }] : []
      case 'html':
        return [{ ...marks, text: node.value }]
      default:
        return []
    }
  })
}
