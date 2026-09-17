import type { ChatFile, ChatFileFormat, ChatMessage } from '../domain/chat'

export const FILE_ARTIFACT_INSTRUCTION = `Pembuatan file:
- Jika pengguna meminta file atau dokumen yang dapat diunduh (PDF, Word/DOCX, Markdown, TXT, CSV, JSON, atau HTML), tulis isi file di dalam blok berikut:
<boo-file name="nama-file.pdf">
isi file
</boo-file>
- Nama file wajib memakai salah satu ekstensi: .pdf, .docx, .md, .txt, .csv, .json, .html.
- Untuk .pdf, .docx, dan .md, tulis isi dokumen dalam Markdown (judul, subjudul, paragraf, daftar, tabel, kutipan). Aplikasi mengubahnya menjadi file asli yang dapat di-preview dan diunduh.
- Untuk .txt, .csv, .json, dan .html, tulis isi mentah file tanpa code fence. HTML harus statis tanpa JavaScript.
- Jangan bungkus blok <boo-file> dengan code fence. Di luar blok cukup beri penjelasan singkat; jangan ulangi isi file.
- Anda mampu membuat file dengan format di atas, jadi jangan menolak dengan alasan tidak bisa membuat file. Untuk format lain (misalnya XLSX atau PPTX), jelaskan keterbatasannya dan tawarkan CSV atau DOCX.
- Saat pengguna meminta revisi file sebelumnya, kirim ulang file lengkap dengan nama yang sama.
- Buat blok <boo-file> hanya jika pengguna memang meminta file atau dokumen.`

export const FILE_FORMATS: readonly ChatFileFormat[] = ['pdf', 'docx', 'md', 'txt', 'csv', 'json', 'html']

const EXTENSION_FORMATS: Record<string, ChatFileFormat> = {
  pdf: 'pdf',
  docx: 'docx',
  doc: 'docx',
  md: 'md',
  markdown: 'md',
  txt: 'txt',
  text: 'txt',
  csv: 'csv',
  json: 'json',
  html: 'html',
  htm: 'html',
}

const OPEN_TAG = /<boo-file\s+name\s*=\s*(["'])(.*?)\1\s*>/i
const CLOSE_TAG = /<\/boo-file\s*>/i
const MAX_STEM_LENGTH = 80

export interface ExtractedFileArtifacts {
  content: string
  files: ChatFile[]
}

export function normalizeFileName(rawName: string): { name: string; format: ChatFileFormat } {
  const baseName = rawName.split(/[\\/]/).at(-1) ?? ''
  // eslint-disable-next-line no-control-regex
  const clean = baseName.replace(/[\u0000-\u001f<>:"|?*]/g, '').replace(/\s+/g, ' ').trim()
  const extensionMatch = /\.([a-z0-9]+)$/i.exec(clean)
  const extension = extensionMatch?.[1].toLowerCase() ?? ''
  const format = EXTENSION_FORMATS[extension] ?? (extension ? 'txt' : 'md')
  const stem = (extensionMatch ? clean.slice(0, extensionMatch.index) : clean)
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, MAX_STEM_LENGTH)
    .trim()
  return { name: `${stem || 'boo-file'}.${format}`, format }
}

function unwrapSingleFence(body: string): string {
  const match = /^(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n\1[ \t]*$/.exec(body)
  if (!match || match[2].includes(`\n${match[1]}`)) return body
  return match[2]
}

function removeEmptyFences(content: string): string {
  return content.replace(/^(`{3,}|~{3,})[^\n]*\n\s*\1[ \t]*$/gm, '')
}

/**
 * Pisahkan blok <boo-file> dari balasan AI. Blok tanpa tag penutup (balasan terpotong)
 * tetap dianggap file sampai akhir teks agar isinya tidak hilang.
 */
export function extractFileArtifacts(answer: string, createId: () => string): ExtractedFileArtifacts {
  const files: ChatFile[] = []
  const textParts: string[] = []
  let rest = answer

  for (let open = OPEN_TAG.exec(rest); open; open = OPEN_TAG.exec(rest)) {
    textParts.push(rest.slice(0, open.index))
    const afterOpen = rest.slice(open.index + open[0].length)
    const close = CLOSE_TAG.exec(afterOpen)
    const rawBody = close ? afterOpen.slice(0, close.index) : afterOpen
    rest = close ? afterOpen.slice(close.index + close[0].length) : ''

    const body = unwrapSingleFence(rawBody.replace(/^[ \t]*\r?\n/, '').trimEnd())
    if (!body.trim()) continue
    const { name, format } = normalizeFileName(open[2])
    files.push({ id: createId(), name, format, content: body })
  }
  textParts.push(rest)

  if (textParts.length === 1) return { content: answer, files }
  const content = removeEmptyFences(textParts.join(''))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { content, files }
}

export function serializeFileArtifacts(files: ChatFile[]): string {
  return files.map((file) => `<boo-file name="${file.name}">\n${file.content}\n</boo-file>`).join('\n\n')
}

/** Teks pesan beserta file yang dilampirkan, untuk konteks AI dan estimasi token. */
export function messageTextWithFiles(message: ChatMessage): string {
  if (!message.files?.length) return message.content
  const files = serializeFileArtifacts(message.files)
  return message.content ? `${message.content}\n\n${files}` : files
}

export function parseCsv(content: string): string[][] {
  const delimiter = detectCsvDelimiter(content)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]
    if (quoted) {
      if (char === '"' && content[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
      continue
    }

    if (char === '"' && !field) {
      quoted = true
    } else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && content[index + 1] === '\n') index += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim()))
}

function detectCsvDelimiter(content: string): string {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? ''
  const candidates = [',', ';', '\t']
  return candidates.reduce((best, candidate) => firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best, ',')
}
