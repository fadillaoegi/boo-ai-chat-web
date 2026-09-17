import type { List, RootContent } from 'mdast'
import type * as PdfMake from 'pdfmake/build/pdfmake'
import vfs from 'pdfmake/build/vfs_fonts'
import type { Content, ContentText, TDocumentDefinitions } from 'pdfmake/interfaces'
import type { ChatFile } from '../domain/chat'
import { inlineRuns, parseMarkdown, type InlineRun } from './markdownAst'

const PAGE_CONTENT_WIDTH = 595.28 - 56 * 2
const HEADING_SIZES = [22, 17, 14, 12, 11, 10]

let pdfMakePromise: Promise<typeof PdfMake> | null = null

function loadPdfMake(): Promise<typeof PdfMake> {
  pdfMakePromise ??= import('pdfmake/build/pdfmake').then((loaded) => {
    // Build browser pdfmake berupa CommonJS; bentuk hasil import berbeda antara dev dan build.
    const pdfMake = ((loaded as { default?: typeof PdfMake }).default ?? loaded) as typeof PdfMake
    pdfMake.addVirtualFileSystem(vfs)
    return pdfMake
  })
  return pdfMakePromise
}

function toPdfText(runs: InlineRun[]): ContentText[] {
  return runs.map((run) => ({
    text: run.text,
    bold: run.bold,
    italics: run.italic,
    decoration: run.strike ? 'lineThrough' : run.link ? 'underline' : undefined,
    link: run.link,
    color: run.link ? '#0369a1' : run.code ? '#9f1239' : undefined,
    background: run.code ? '#f3f4f6' : undefined,
  }))
}

function listToPdf(list: List): Content {
  const items = list.children.map((item): Content => {
    const [first, ...rest] = item.children
    if (typeof item.checked !== 'boolean' || first?.type !== 'paragraph') return { stack: blocksToPdf(item.children, 3) }
    const checkbox = { text: item.checked ? '[x] ' : '[ ] ', bold: true }
    return { stack: [{ text: [checkbox, ...toPdfText(inlineRuns(first.children))], margin: [0, 0, 0, 3] }, ...blocksToPdf(rest, 3)] }
  })
  return list.ordered
    ? { ol: items, start: list.start ?? 1, margin: [0, 0, 0, 8] }
    : { ul: items, margin: [0, 0, 0, 8] }
}

function blocksToPdf(nodes: RootContent[], paragraphSpacing = 8): Content[] {
  return nodes.flatMap((node): Content[] => {
    switch (node.type) {
      case 'heading':
        return [{
          text: toPdfText(inlineRuns(node.children)),
          bold: true,
          fontSize: HEADING_SIZES[node.depth - 1],
          margin: [0, node.depth === 1 ? 0 : 12, 0, 6],
        }]
      case 'paragraph':
        return [{ text: toPdfText(inlineRuns(node.children)), margin: [0, 0, 0, paragraphSpacing] }]
      case 'list':
        return [listToPdf(node)]
      case 'blockquote':
        return [{
          table: { widths: ['*'], body: [[{ stack: blocksToPdf(node.children), color: '#404040' }]] },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: (index) => index === 0 ? 3 : 0,
            vLineColor: () => '#38bdf8',
            paddingLeft: () => 10,
          },
          margin: [0, 0, 0, 8],
        }]
      case 'code':
        return [{
          table: { widths: ['*'], body: [[{ text: node.value, fontSize: 9, preserveLeadingSpaces: true }]] },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            fillColor: () => '#f3f4f6',
            paddingLeft: () => 8,
            paddingRight: () => 8,
            paddingTop: () => 6,
            paddingBottom: () => 6,
          },
          margin: [0, 0, 0, 8],
        }]
      case 'table': {
        const columns = Math.max(1, ...node.children.map((row) => row.children.length))
        const body = node.children.map((row, rowIndex) => Array.from({ length: columns }, (_, cellIndex) => ({
          text: toPdfText(inlineRuns(row.children[cellIndex]?.children ?? [])),
          bold: rowIndex === 0,
          fillColor: rowIndex === 0 ? '#e5e7eb' : undefined,
        })))
        return [{
          table: { headerRows: 1, widths: Array(columns).fill('*'), body },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#a3a3a3',
            vLineColor: () => '#a3a3a3',
          },
          fontSize: 9,
          margin: [0, 0, 0, 10],
        }]
      }
      case 'thematicBreak':
        return [{
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: PAGE_CONTENT_WIDTH, y2: 0, lineWidth: 1, lineColor: '#d4d4d4' }],
          margin: [0, 6, 0, 12],
        }]
      case 'html':
        return [{ text: node.value, margin: [0, 0, 0, 8] }]
      case 'footnoteDefinition':
        return blocksToPdf(node.children)
      default:
        return []
    }
  })
}

export async function createPdfBlob(file: ChatFile): Promise<Blob> {
  const pdfMake = await loadPdfMake()
  const definition: TDocumentDefinitions = {
    info: { title: file.name.replace(/\.pdf$/i, ''), creator: 'Boo AI' },
    pageSize: 'A4',
    pageMargins: [56, 56, 56, 64],
    content: blocksToPdf(parseMarkdown(file.content).children),
    defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.25, color: '#171717' },
    footer: (currentPage, pageCount) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: 'center',
      fontSize: 8,
      color: '#737373',
      margin: [0, 24, 0, 0],
    }),
  }
  return pdfMake.createPdf(definition).getBlob()
}
