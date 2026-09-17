import { useEffect, useState } from 'react'
import { parseCsv } from '../application/fileArtifacts'
import type { ChatFile, ChatFileFormat } from '../domain/chat'
import { Icon } from './Icon'
import { MarkdownMessage } from './MarkdownMessage'
import type { UiText } from './i18n'

type DownloadState = 'idle' | 'busy' | 'error'

const FORMAT_STYLES: Record<ChatFileFormat, string> = {
  pdf: 'bg-red-400 text-red-950',
  docx: 'bg-sky-300 text-sky-950',
  md: 'bg-neutral-200 text-neutral-900',
  txt: 'bg-white text-black',
  csv: 'bg-emerald-300 text-emerald-950',
  json: 'bg-amber-300 text-amber-950',
  html: 'bg-violet-300 text-violet-950',
}

const MARKDOWN_FORMATS: ReadonlySet<ChatFileFormat> = new Set(['pdf', 'docx', 'md'])

const ICON_BUTTON = 'grid size-9 shrink-0 place-items-center rounded-xl border-2 border-black bg-white text-black shadow-boo-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-wait disabled:opacity-50 dark:border-white dark:bg-neutral-900 dark:text-white'

function formatSize(content: string): string {
  const bytes = new TextEncoder().encode(content).length
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
}

function useFileDownload(onDownload: (file: ChatFile) => Promise<void>) {
  const [state, setState] = useState<DownloadState>('idle')

  async function download(file: ChatFile) {
    setState('busy')
    try {
      await onDownload(file)
      setState('idle')
    } catch (error) {
      console.error('[boo-file] Gagal membuat file.', error)
      setState('error')
    }
  }

  return { state, download }
}

function FormatBadge({ format, className = '' }: { format: ChatFileFormat; className?: string }) {
  return <span className={`grid shrink-0 place-items-center rounded-lg border-2 border-black font-black uppercase shadow-boo-sm dark:border-white ${FORMAT_STYLES[format]} ${className}`}>{format}</span>
}

export function FileCard({
  file,
  onDownload,
  onPreview,
  ui,
}: {
  file: ChatFile
  onDownload: (file: ChatFile) => Promise<void>
  onPreview: (file: ChatFile) => void
  ui: UiText
}) {
  const { state, download } = useFileDownload(onDownload)

  return (
    <div className="w-full max-w-md">
      <div className="flex items-center gap-2 rounded-xl border-2 border-black bg-white p-2 text-black shadow-boo-md dark:border-white dark:bg-neutral-900 dark:text-white">
        <button aria-label={`${ui.previewFile}: ${file.name}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-current" onClick={() => onPreview(file)} type="button">
          <FormatBadge className="size-11 rotate-[-3deg] text-[10px]" format={file.format} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-black leading-5">{file.name}</span>
            <span className="block text-[10px] font-bold uppercase leading-4 tracking-wider text-neutral-500">{file.format} · {formatSize(file.content)}</span>
          </span>
        </button>
        <button aria-label={`${ui.previewFile}: ${file.name}`} className={ICON_BUTTON} onClick={() => onPreview(file)} title={ui.previewFile} type="button"><Icon className="size-4" name="eye" /></button>
        <button aria-label={`${state === 'busy' ? ui.preparingFile : ui.downloadFile}: ${file.name}`} className={ICON_BUTTON} disabled={state === 'busy'} onClick={() => void download(file)} title={ui.downloadFile} type="button"><Icon className={`size-4 ${state === 'busy' ? 'animate-pulse' : ''}`} name="download" /></button>
      </div>
      {state === 'error' && <p className="mt-1.5 px-1 text-xs font-bold text-red-500" role="alert">{ui.fileDownloadError}</p>}
    </div>
  )
}

function Paper({ children }: { children: React.ReactNode }) {
  return <article className="mx-auto w-full max-w-[794px] rounded-md border-2 border-black/10 bg-white px-5 py-7 text-sm leading-7 text-black shadow-boo-soft-md sm:px-14 sm:py-14 sm:text-base dark:border-white/10 dark:bg-[#171717] dark:text-white">{children}</article>
}

function PdfFrame({ createBlob, file, ui }: { createBlob: (file: ChatFile) => Promise<Blob>; file: ChatFile; ui: UiText }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    createBlob(file)
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch((error: unknown) => {
        console.error('[boo-file] Gagal merender PDF.', error)
        if (active) setFailed(true)
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [createBlob, file])

  if (failed) return <p className="grid h-full place-items-center text-sm font-bold text-red-500">{ui.fileDownloadError}</p>
  if (!url) return <p className="grid h-full place-items-center text-xs font-black uppercase tracking-[0.16em] text-neutral-500">{ui.renderingPdf}</p>
  return <iframe className="size-full min-h-[60vh] rounded-lg border-2 border-black bg-white dark:border-white" src={url} title={file.name} />
}

function FileBody({ createBlob, file, ui, view }: { createBlob: (file: ChatFile) => Promise<Blob>; file: ChatFile; ui: UiText; view: 'document' | 'pdf' }) {
  if (file.format === 'pdf' && view === 'pdf') return <PdfFrame createBlob={createBlob} file={file} ui={ui} />

  if (MARKDOWN_FORMATS.has(file.format)) {
    return <Paper><MarkdownMessage content={file.content} copiedCodeLabel={ui.codeCopied} copyCodeLabel={ui.copyCode} openLinkLabel={ui.openLink} /></Paper>
  }

  if (file.format === 'html') {
    return (
      <div className="flex h-full min-h-[60vh] flex-col gap-2">
        <p className="px-1 text-[10px] font-black uppercase tracking-[0.16em] text-neutral-500">{ui.htmlSandboxNote}</p>
        {/* sandbox kosong: tanpa script, form, maupun akses ke origin aplikasi. */}
        <iframe className="w-full flex-1 rounded-lg border-2 border-black bg-white dark:border-white" sandbox="" srcDoc={file.content} title={file.name} />
      </div>
    )
  }

  if (file.format === 'csv') {
    const [header = [], ...rows] = parseCsv(file.content)
    const columns = Math.max(header.length, ...rows.map((row) => row.length))
    return (
      <Paper>
        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-neutral-500">{rows.length} {ui.csvRows}</p>
        <div className="markdown-message">
          <div className="markdown-table-wrap">
            <table>
              <thead><tr>{Array.from({ length: columns }, (_, index) => <th key={index}>{header[index] ?? ''}</th>)}</tr></thead>
              <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{Array.from({ length: columns }, (_, index) => <td key={index}>{row[index] ?? ''}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      </Paper>
    )
  }

  let text = file.content
  if (file.format === 'json') {
    try {
      text = JSON.stringify(JSON.parse(file.content), null, 2)
    } catch {
      // Tampilkan apa adanya jika JSON dari AI tidak valid.
    }
  }
  return <Paper><pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-6">{text}</pre></Paper>
}

export function FilePreviewDialog({
  createBlob,
  file,
  onClose,
  onDownload,
  ui,
}: {
  createBlob: (file: ChatFile) => Promise<Blob>
  file: ChatFile
  onClose: () => void
  onDownload: (file: ChatFile) => Promise<void>
  ui: UiText
}) {
  const [view, setView] = useState<'document' | 'pdf'>('document')
  const { state, download } = useFileDownload(onDownload)
  const viewButton = (active: boolean) => `rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase transition ${active ? 'bg-black text-white dark:bg-white dark:text-black' : 'text-neutral-500 hover:text-black dark:hover:text-white'}`

  return (
    <div className="fixed inset-0 z-[80] grid grid-cols-[minmax(0,1fr)] place-items-center p-3 sm:p-8">
      <button aria-label={ui.closeFilePreview} className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} type="button" />
      <section aria-label={`${ui.filePreview}: ${file.name}`} aria-modal="true" className="relative z-10 flex h-[92dvh] w-full max-w-5xl flex-col rounded-2xl border-[3px] border-black bg-white p-3 shadow-boo-2xl dark:border-white dark:bg-[#171717]" role="dialog">
        <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
          <FormatBadge className="size-9 text-[9px]" format={file.format} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black">{file.name}</p>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-neutral-500">{ui.filePreview} · {formatSize(file.content)}</p>
          </div>
          {file.format === 'pdf' && (
            <div aria-label={ui.fileViewMode} className="flex rounded-xl border-2 border-black p-0.5 dark:border-white" role="group">
              <button aria-pressed={view === 'document'} className={viewButton(view === 'document')} onClick={() => setView('document')} type="button">{ui.documentView}</button>
              <button aria-pressed={view === 'pdf'} className={viewButton(view === 'pdf')} onClick={() => setView('pdf')} type="button">{ui.pdfView}</button>
            </div>
          )}
          <button className="flex h-9 items-center gap-2 rounded-xl border-2 border-black bg-black px-3 text-xs font-black uppercase text-white shadow-boo-inverse-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-wait disabled:opacity-60 dark:border-white dark:bg-white dark:text-black" disabled={state === 'busy'} onClick={() => void download(file)} type="button"><Icon className="size-3.5" name="download" /> {state === 'busy' ? ui.preparingFile : ui.downloadFile}</button>
          <button aria-label={ui.closeFilePreview} autoFocus className={ICON_BUTTON} onClick={onClose} type="button"><Icon className="size-4" name="x" /></button>
        </div>
        {state === 'error' && <p className="mb-2 px-1 text-xs font-bold text-red-500" role="alert">{ui.fileDownloadError}</p>}
        <div className="min-h-0 flex-1 overflow-auto rounded-xl bg-neutral-100 p-3 sm:p-6 dark:bg-black/30">
          <FileBody createBlob={createBlob} file={file} ui={ui} view={view} />
        </div>
      </section>
    </div>
  )
}
