import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
  type ParagraphChild,
} from 'docx'
import type { List, RootContent } from 'mdast'
import type { ChatFile } from '../domain/chat'
import { inlineRuns, parseMarkdown, type InlineRun } from './markdownAst'

const NUMBERING_REFERENCE = 'boo-numbered'
const CODE_FONT = 'Consolas'
const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
]

type ParagraphExtras = Omit<IParagraphOptions, 'children'>
type Block = Paragraph | Table

function textRuns(run: InlineRun, style?: string): TextRun[] {
  return run.text.split('\n').map((text, index) => new TextRun({
    text,
    break: index > 0 ? 1 : undefined,
    bold: run.bold,
    italics: run.italic,
    strike: run.strike,
    style,
    font: run.code ? CODE_FONT : undefined,
    shading: run.code ? { type: ShadingType.CLEAR, fill: 'F3F4F6', color: 'auto' } : undefined,
  }))
}

function toParagraphChildren(runs: InlineRun[]): ParagraphChild[] {
  return runs.flatMap((run): ParagraphChild[] => run.link
    ? [new ExternalHyperlink({ link: run.link, children: textRuns(run, 'Hyperlink') })]
    : textRuns(run))
}

class DocxBuilder {
  private numberingInstance = 0

  blocks(nodes: RootContent[], extras: ParagraphExtras = {}, listLevel = 0): Block[] {
    return nodes.flatMap((node): Block[] => {
      switch (node.type) {
        case 'heading':
          return [new Paragraph({ ...extras, heading: HEADING_LEVELS[node.depth - 1], children: toParagraphChildren(inlineRuns(node.children)) })]
        case 'paragraph':
          return [new Paragraph({ ...extras, spacing: { after: 160 }, children: toParagraphChildren(inlineRuns(node.children)) })]
        case 'list':
          return this.list(node, listLevel)
        case 'blockquote':
          return this.blocks(node.children, {
            ...extras,
            indent: { left: 360 },
            border: { left: { style: BorderStyle.SINGLE, size: 18, color: '38BDF8', space: 8 } },
          }, listLevel)
        case 'code':
          return [new Paragraph({
            ...extras,
            shading: { type: ShadingType.CLEAR, fill: 'F3F4F6', color: 'auto' },
            spacing: { after: 160 },
            children: node.value.split('\n').map((line, index) => new TextRun({
              text: line,
              break: index > 0 ? 1 : undefined,
              font: CODE_FONT,
              size: 18,
            })),
          })]
        case 'table': {
          const columns = Math.max(1, ...node.children.map((row) => row.children.length))
          return [new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: node.children.map((row, rowIndex) => new TableRow({
              tableHeader: rowIndex === 0,
              children: Array.from({ length: columns }, (_, cellIndex) => new TableCell({
                shading: rowIndex === 0 ? { type: ShadingType.CLEAR, fill: 'E5E7EB', color: 'auto' } : undefined,
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                children: [new Paragraph({
                  children: toParagraphChildren(inlineRuns(row.children[cellIndex]?.children ?? [])
                    .map((run) => rowIndex === 0 ? { ...run, bold: true } : run)),
                })],
              })),
            })),
          }), new Paragraph({ children: [] })]
        }
        case 'thematicBreak':
          return [new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D4D4D4', space: 1 } },
            spacing: { after: 200 },
            children: [],
          })]
        case 'html':
          return [new Paragraph({ ...extras, children: [new TextRun(node.value)] })]
        case 'footnoteDefinition':
          return this.blocks(node.children, extras, listLevel)
        default:
          return []
      }
    })
  }

  private list(list: List, level: number): Block[] {
    const instance = list.ordered ? ++this.numberingInstance : 0
    return list.children.flatMap((item) => item.children.flatMap((child, childIndex) => {
      if (child.type === 'list') return this.list(child, level + 1)
      const marker: ParagraphExtras = childIndex > 0
        ? { indent: { left: 720 * (level + 1) } }
        : list.ordered
          ? { numbering: { reference: NUMBERING_REFERENCE, level, instance } }
          : { bullet: { level } }
      const blocks = this.blocks([child], { ...marker, spacing: { after: 60 } }, level + 1)
      if (childIndex === 0 && typeof item.checked === 'boolean' && blocks[0] instanceof Paragraph) {
        blocks[0].addRunToFront(new TextRun({ text: item.checked ? '☑ ' : '☐ ' }))
      }
      return blocks
    }))
  }
}

export async function createDocxBlob(file: ChatFile): Promise<Blob> {
  const document = new Document({
    creator: 'Boo AI',
    title: file.name.replace(/\.docx$/i, ''),
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    numbering: {
      config: [{
        reference: NUMBERING_REFERENCE,
        levels: Array.from({ length: 6 }, (_, level) => ({
          level,
          format: LevelFormat.DECIMAL,
          text: `%${level + 1}.`,
          alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
        })),
      }],
    },
    sections: [{ children: new DocxBuilder().blocks(parseMarkdown(file.content).children) }],
  })
  return Packer.toBlob(document)
}
