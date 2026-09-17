import { useState } from 'react'
import type { ChatImage } from '../domain/chat'
import { Icon } from './Icon'
import type { UiText } from './i18n'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 4
const ZOOM_STEP = 0.25
const ZOOM_BUTTON = 'grid size-9 place-items-center rounded-xl border-2 border-black bg-white text-lg font-black leading-none text-black shadow-boo-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-35 dark:border-white dark:bg-neutral-900 dark:text-white'

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/** Pasang dengan `key` per gambar agar zoom kembali 100% saat gambar berganti. */
export function ImagePreviewDialog({ image, onClose, ui }: { image: ChatImage; onClose: () => void; ui: UiText }) {
  const [zoom, setZoom] = useState(1)
  const changeZoom = (delta: number) => setZoom((current) => clampZoom(current + delta))

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4 sm:p-8">
      <button aria-label={ui.closePreview} className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} type="button" />
      <section aria-label={ui.previewImage} aria-modal="true" className="relative z-10 flex max-h-full w-full max-w-5xl flex-col rounded-2xl border-[3px] border-black bg-white p-3 shadow-boo-2xl dark:border-white dark:bg-[#171717]" role="dialog">
        <div className="mb-3 flex items-center gap-2 px-1">
          <p className="min-w-0 flex-1 truncate text-xs font-black uppercase tracking-[0.16em]">{ui.previewImage}</p>
          <div aria-label={ui.zoomControls} className="flex shrink-0 items-center gap-1" role="group">
            <button aria-label={ui.zoomOut} className={ZOOM_BUTTON} disabled={zoom <= MIN_ZOOM} onClick={() => changeZoom(-ZOOM_STEP)} type="button">−</button>
            <button aria-label={`${ui.resetZoom} (${Math.round(zoom * 100)}%)`} className="h-9 min-w-16 rounded-xl border-2 border-black bg-white px-2 text-xs font-black tabular-nums text-black shadow-boo-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-white dark:bg-neutral-900 dark:text-white" onClick={() => setZoom(1)} title={ui.resetZoom} type="button">{Math.round(zoom * 100)}%</button>
            <button aria-label={ui.zoomIn} className={ZOOM_BUTTON} disabled={zoom >= MAX_ZOOM} onClick={() => changeZoom(ZOOM_STEP)} type="button">+</button>
          </div>
          <button aria-label={ui.closePreview} autoFocus className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-black bg-white text-black shadow-boo-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-white dark:bg-neutral-900 dark:text-white" onClick={onClose} type="button"><Icon name="x" className="size-4" /></button>
        </div>
        <div
          className="grid min-h-0 flex-1 place-items-center overflow-auto rounded-xl bg-neutral-100 p-2 dark:bg-black/30"
          onWheel={(event) => {
            if (!event.ctrlKey && !event.metaKey) return
            event.preventDefault()
            changeZoom(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)
          }}
          title={ui.zoomHint}
        >
          <img
            alt={image.alt}
            className={`max-h-[76vh] max-w-full select-none object-contain transition-transform duration-150 ${zoom < MAX_ZOOM ? 'cursor-zoom-in' : 'cursor-zoom-out'}`}
            draggable={false}
            onDoubleClick={() => setZoom((current) => current === 1 ? 2 : 1)}
            src={image.url}
            style={{ transform: `scale(${zoom})` }}
          />
        </div>
        {image.kind === 'generated' && image.watermarked && <a className="mt-3 inline-flex w-fit items-center gap-2 px-1 text-xs font-black underline underline-offset-4" download={image.name || 'boo-ai-watermarked.png'} href={image.url}><Icon name="image" className="size-3" /> {ui.downloadWatermark}</a>}
      </section>
    </div>
  )
}
