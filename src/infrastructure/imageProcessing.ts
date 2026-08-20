import type { ChatImage } from '../domain/chat'

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_SOURCE_BYTES = 8 * 1024 * 1024
const MAX_DATA_URL_LENGTH = 900_000
const MAX_DIMENSION = 1280

function canvasToDataUrl(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL('image/jpeg', quality)
}

export async function prepareImageUpload(file: File): Promise<ChatImage> {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new Error('Format gambar harus JPG, PNG, atau WebP.')
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('Ukuran gambar maksimal 8 MB.')
  }

  const bitmap = await createImageBitmap(file)
  const baseScale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('Browser tidak dapat memproses gambar ini.')
  }

  let scale = baseScale
  let dataUrl = ''
  for (const quality of [0.82, 0.7, 0.56]) {
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    dataUrl = canvasToDataUrl(canvas, quality)
    if (dataUrl.length <= MAX_DATA_URL_LENGTH) break
    scale *= 0.78
  }
  bitmap.close()

  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    throw new Error('Gambar masih terlalu besar setelah dikompresi. Pilih gambar yang lebih kecil.')
  }

  return {
    kind: 'upload',
    url: dataUrl,
    alt: file.name,
    mimeType: 'image/jpeg',
    name: file.name,
  }
}
