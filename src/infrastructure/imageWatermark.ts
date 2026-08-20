import booLogo from '../assets/logoBooAgent.png'
import type { ChatImage } from '../domain/chat'

function loadImage(source: string, label: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    if (/^https?:\/\//i.test(source)) image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`${label} tidak dapat dimuat untuk proses watermark.`))
    image.src = source
  })
}

function roundedRectangle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.arcTo(x + width, y, x + width, y + height, safeRadius)
  context.arcTo(x + width, y + height, x, y + height, safeRadius)
  context.arcTo(x, y + height, x, y, safeRadius)
  context.arcTo(x, y, x + width, y, safeRadius)
  context.closePath()
}

export async function applyBooWatermark(image: ChatImage): Promise<ChatImage> {
  const [sourceImage, logoImage] = await Promise.all([
    loadImage(image.url, 'Gambar hasil'),
    loadImage(booLogo, 'Logo Boo AI'),
  ])

  const width = sourceImage.naturalWidth
  const height = sourceImage.naturalHeight
  if (!width || !height) throw new Error('Dimensi gambar hasil tidak valid untuk watermark.')

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Browser tidak dapat membuat watermark gambar.')

  context.drawImage(sourceImage, 0, 0, width, height)

  const shortestSide = Math.min(width, height)
  const badgeSize = Math.round(Math.min(180, Math.max(60, shortestSide * 0.13)))
  const margin = Math.round(Math.min(40, Math.max(14, shortestSide * 0.025)))
  const padding = Math.max(8, Math.round(badgeSize * 0.1))
  const radius = Math.max(10, Math.round(badgeSize * 0.18))
  const badgeX = width - badgeSize - margin
  const badgeY = margin

  context.save()
  context.shadowColor = 'rgba(0, 0, 0, 0.45)'
  context.shadowBlur = Math.max(6, Math.round(shortestSide * 0.012))
  context.shadowOffsetX = Math.max(3, Math.round(shortestSide * 0.005))
  context.shadowOffsetY = context.shadowOffsetX
  roundedRectangle(context, badgeX, badgeY, badgeSize, badgeSize, radius)
  context.fillStyle = 'rgba(255, 255, 255, 0.9)'
  context.fill()
  context.shadowColor = 'transparent'
  context.lineWidth = Math.max(2, Math.round(shortestSide * 0.003))
  context.strokeStyle = 'rgba(0, 0, 0, 0.8)'
  context.stroke()
  context.restore()

  const availableSize = badgeSize - (padding * 2)
  const logoScale = Math.min(
    availableSize / logoImage.naturalWidth,
    availableSize / logoImage.naturalHeight,
  )
  const logoWidth = logoImage.naturalWidth * logoScale
  const logoHeight = logoImage.naturalHeight * logoScale
  context.drawImage(
    logoImage,
    badgeX + ((badgeSize - logoWidth) / 2),
    badgeY + ((badgeSize - logoHeight) / 2),
    logoWidth,
    logoHeight,
  )

  let watermarkedUrl: string
  try {
    watermarkedUrl = canvas.toDataURL('image/png')
  } catch (cause) {
    console.error('[boo-watermark] Canvas tidak dapat diekspor.', cause)
    throw new Error(
      'Watermark gagal diterapkan karena gambar provider tidak mengizinkan pemrosesan CORS.',
      { cause },
    )
  }
  if (!watermarkedUrl.startsWith('data:image/png;base64,')) {
    throw new Error('Watermark gagal menghasilkan gambar PNG yang valid.')
  }

  return {
    ...image,
    url: watermarkedUrl,
    mimeType: 'image/png',
    name: 'boo-ai-watermarked.png',
    watermarked: true,
  }
}
