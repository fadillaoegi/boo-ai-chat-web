import type { ChatFile, ChatFileFormat } from '../domain/chat'

const MIME_TYPES: Record<ChatFileFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  md: 'text/markdown;charset=utf-8',
  txt: 'text/plain;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
  json: 'application/json;charset=utf-8',
  html: 'text/html;charset=utf-8',
}

export async function createFileBlob(file: ChatFile): Promise<Blob> {
  // Pembuat PDF/DOCX cukup besar, jadi dimuat hanya saat dibutuhkan.
  if (file.format === 'pdf') return (await import('./pdfDocument')).createPdfBlob(file)
  if (file.format === 'docx') return (await import('./docxDocument')).createDocxBlob(file)
  // BOM membuat Excel membaca CSV UTF-8 dengan benar.
  const prefix = file.format === 'csv' ? '﻿' : ''
  return new Blob([prefix, file.content], { type: MIME_TYPES[file.format] })
}

export async function downloadChatFile(file: ChatFile): Promise<void> {
  const url = URL.createObjectURL(await createFileBlob(file))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
