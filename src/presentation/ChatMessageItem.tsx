import { useEffect, useRef, useState } from 'react'
import booLogo from '../assets/logoBooAgent.png'
import type { ChatFile, ChatImage, ChatMessage } from '../domain/chat'
import { copyPlainText } from './clipboard'
import { FileCard } from './FilePreview'
import { Icon } from './Icon'
import type { UiText } from './i18n'
import { MarkdownMessage } from './MarkdownMessage'

const ACTION_BUTTON = 'grid size-7 place-items-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-30'
const ACTION_IDLE = 'border-black/15 bg-white text-neutral-500 hover:border-black hover:text-black dark:border-white/15 dark:bg-neutral-900 dark:hover:border-white dark:hover:text-white'

function getMessageImages(message: ChatMessage): ChatImage[] {
  if (message.images?.length) return message.images
  return message.image ? [message.image] : []
}

function MessageImage({ image, onPreview, ui }: { image: ChatImage; onPreview: (image: ChatImage) => void; ui: UiText }) {
  if (image.kind === 'generated' && !image.watermarked) {
    return <div className="grid min-h-32 place-items-center rounded-xl border-2 border-dashed border-current p-4 text-center text-xs font-black">{ui.rawImageHidden}</div>
  }

  return (
    <button aria-label={ui.previewImage} className="block cursor-zoom-in overflow-hidden rounded-xl border-2 border-current transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2" onClick={() => onPreview(image)} type="button">
      <img alt={image.alt} className="max-h-[480px] w-full object-contain" loading="lazy" src={image.url} />
    </button>
  )
}

function EditMessageForm({
  initialContent,
  isLoading,
  laterMessages,
  onCancel,
  onSubmit,
  ui,
}: {
  initialContent: string
  isLoading: boolean
  laterMessages: number
  onCancel: () => void
  onSubmit: (content: string) => void
  ui: UiText
}) {
  const [draft, setDraft] = useState(initialContent)
  const unchanged = draft.trim() === initialContent

  return (
    <form className="min-w-[min(28rem,70vw)]" onSubmit={(event) => { event.preventDefault(); if (draft.trim() && !unchanged) onSubmit(draft.trim()) }}>
      <textarea
        aria-label={ui.editMessage}
        autoFocus
        className="block max-h-72 min-h-20 w-full resize-y bg-transparent leading-6 outline-none"
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.currentTarget.setSelectionRange(event.currentTarget.value.length, event.currentTarget.value.length)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            event.currentTarget.form?.requestSubmit()
          }
        }}
        value={draft}
      />
      {laterMessages > 0 && <p className="mt-2 text-[10px] font-bold uppercase tracking-wider opacity-70">{laterMessages} {ui.editReplacesLater}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button className="rounded-lg border-2 border-current px-3 py-1.5 text-[10px] font-black uppercase" onClick={onCancel} type="button">{ui.cancel}</button>
        <button className="rounded-lg border-2 border-current bg-white px-3 py-1.5 text-[10px] font-black uppercase text-black disabled:cursor-not-allowed disabled:opacity-40 dark:bg-black dark:text-white" disabled={!draft.trim() || unchanged || isLoading} type="submit">{ui.sendEdit}</button>
      </div>
    </form>
  )
}

function useCopyFeedback() {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
  }, [])

  async function copy(text: string) {
    try {
      await copyPlainText(text)
      setCopied(true)
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(() => {
        setCopied(false)
        timeoutRef.current = null
      }, 2000)
    } catch (cause) {
      console.error('[boo-client] Gagal menyalin pesan.', cause)
    }
  }

  return { copied, copy }
}

export interface ChatMessageItemProps {
  isEditing: boolean
  isLastAnswer: boolean
  isLoading: boolean
  isSpeaking: boolean
  isStreaming: boolean
  laterMessages: number
  message: ChatMessage
  onCancelEdit: () => void
  onDownloadFile: (file: ChatFile) => Promise<void>
  onPreviewFile: (file: ChatFile) => void
  onPreviewImage: (image: ChatImage) => void
  onRegenerate: () => void
  onStartEdit: (message: ChatMessage) => void
  onSubmitEdit: (messageId: string, content: string) => void
  onToggleSpeech: (message: ChatMessage) => void
  speechSupported: boolean
  ui: UiText
}

export function ChatMessageItem({
  isEditing,
  isLastAnswer,
  isLoading,
  isSpeaking,
  isStreaming,
  laterMessages,
  message,
  onCancelEdit,
  onDownloadFile,
  onPreviewFile,
  onPreviewImage,
  onRegenerate,
  onStartEdit,
  onSubmitEdit,
  onToggleSpeech,
  speechSupported,
  ui,
}: ChatMessageItemProps) {
  const { copied, copy } = useCopyFeedback()
  const isUser = message.role === 'user'
  const attachedImages = getMessageImages(message)
  const author = isUser ? ui.you : ui.booAi

  return (
    <article className={`flex gap-3 sm:gap-4 ${isUser ? 'flex-row-reverse' : ''}`}>
      {isUser
        ? <div aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-black bg-white text-[10px] font-black dark:border-white/40 dark:bg-neutral-900">{ui.you}</div>
        : <img alt="" className="size-9 shrink-0 rounded-xl border-2 border-black bg-white object-contain dark:border-white/40" src={booLogo} />}
      <div className={`flex max-w-[90%] flex-col sm:max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`${isEditing ? 'w-full' : 'w-fit'} max-w-full rounded-2xl border-2 p-3 text-sm font-medium leading-7 sm:p-4 sm:text-base ${isUser ? 'border-black bg-black text-white shadow-boo-inverse-lg dark:border-white dark:bg-white dark:text-black' : 'border-black/20 bg-white dark:border-white/20 dark:bg-[#171717]'}`}>
          <span className="sr-only">{author}: </span>
          {message.references?.length ? <div className="mb-2 flex flex-wrap gap-1.5">{message.references.map((reference) => <span className="rounded-md border border-current px-2 py-0.5 text-[9px] font-black uppercase tracking-wide opacity-75" key={reference.sessionId}>@ {reference.title}</span>)}</div> : null}
          {attachedImages.length > 0 && <div className={`mb-3 grid gap-2 ${attachedImages.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>{attachedImages.map((image, index) => <MessageImage image={image} key={`${image.url.slice(0, 40)}-${index}`} onPreview={onPreviewImage} ui={ui} />)}</div>}
          {!isUser
            ? <MarkdownMessage content={message.content} copiedCodeLabel={ui.codeCopied} copyCodeLabel={ui.copyCode} openLinkLabel={ui.openLink} streaming={isStreaming} />
            : isEditing
              ? <EditMessageForm initialContent={message.content} isLoading={isLoading} laterMessages={laterMessages} onCancel={onCancelEdit} onSubmit={(content) => onSubmitEdit(message.id, content)} ui={ui} />
              : <p className="whitespace-pre-wrap">{message.content}</p>}
          {message.files?.length ? <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2">{message.files.map((file) => <FileCard file={file} key={file.id} onDownload={onDownloadFile} onPreview={onPreviewFile} ui={ui} />)}</div> : null}
          {attachedImages.filter((image) => image.kind === 'generated' && image.watermarked).map((image, index) => <a className="mt-3 inline-flex items-center gap-2 text-xs font-black underline underline-offset-4" download={image.name || 'boo-ai-watermarked.png'} href={image.url} key={`${image.url.slice(0, 40)}-${index}`}><Icon name="image" className="size-3" /> {ui.downloadWatermark}</a>)}
        </div>
        {!isStreaming && !isEditing && (
          <div aria-label={`${ui.messageActions} ${author}`} className="mt-2 flex items-center gap-1 px-1" role="group">
            <button aria-label={isSpeaking ? ui.stopReading : `${ui.readMessage} ${author}`} aria-pressed={isSpeaking} className={`${ACTION_BUTTON} ${isSpeaking ? 'border-red-600 bg-red-500 text-white shadow-boo-danger-sm' : ACTION_IDLE}`} disabled={!speechSupported || !message.content.trim()} onClick={() => onToggleSpeech(message)} title={isSpeaking ? ui.stopReading : ui.readMessage} type="button"><Icon name={isSpeaking ? 'stop' : 'volume'} className="size-3.5" /></button>
            {isSpeaking && <span aria-live="polite" className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-red-500" role="status"><span className="size-1.5 animate-pulse rounded-full bg-red-500" /> {ui.readingActive}</span>}
            <button aria-label={copied ? ui.messageCopied : `${ui.copyMessage} ${author}`} className={`${ACTION_BUTTON} ${copied ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black' : ACTION_IDLE}`} disabled={!message.content.trim()} onClick={() => void copy(message.content)} title={ui.copyMessage} type="button"><Icon name={copied ? 'check' : 'copy'} className="size-3.5" /></button>
            {copied && <span aria-live="polite" className="text-[9px] font-black uppercase tracking-wider text-neutral-500" role="status">{ui.copied}</span>}
            {isUser && <button aria-label={ui.editMessage} className={`${ACTION_BUTTON} ${ACTION_IDLE}`} disabled={isLoading} onClick={() => onStartEdit(message)} title={ui.editMessage} type="button"><Icon name="pencil" className="size-3.5" /></button>}
            {isLastAnswer && <button aria-label={ui.regenerate} className={`${ACTION_BUTTON} ${ACTION_IDLE}`} disabled={isLoading} onClick={onRegenerate} title={ui.regenerate} type="button"><Icon name="refresh" className="size-3.5" /></button>}
          </div>
        )}
      </div>
    </article>
  )
}
