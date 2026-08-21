import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react'
import booLogo from './assets/logoBooAgent.png'
import { MAX_SESSION_REFERENCES } from './application/chatContext'
import { useChat } from './application/useChat'
import type { ChatImage, ChatMessage, ChatMode, ChatSession, ChatSessionReference } from './domain/chat'
import { HttpChatGateway } from './infrastructure/httpChatGateway'
import { prepareImageUpload } from './infrastructure/imageProcessing'
import { LocalChatHistoryRepository } from './infrastructure/localChatHistoryRepository'
import { useBrowserVoice } from './infrastructure/useBrowserVoice'
import { Icon } from './presentation/Icon'
import { MarkdownMessage } from './presentation/MarkdownMessage'
import { UI_TEXT, type AppLanguage } from './presentation/i18n'
import './App.css'

type Theme = 'light' | 'dark'

const MAX_PENDING_IMAGES = 4
const MIN_PREVIEW_ZOOM = 0.5
const MAX_PREVIEW_ZOOM = 4
const PREVIEW_ZOOM_STEP = 0.25

function clampPreviewZoom(zoom: number): number {
  return Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, zoom))
}

function getMessageImages(message: ChatMessage): ChatImage[] {
  if (message.images?.length) return message.images
  return message.image ? [message.image] : []
}

function MessageImage({
  image,
  onPreview,
  previewLabel,
  rawImageHidden,
}: {
  image: ChatImage
  onPreview: (image: ChatImage) => void
  previewLabel: string
  rawImageHidden: string
}) {
  if (image.kind === 'generated' && !image.watermarked) {
    return (
      <div className="grid min-h-32 place-items-center rounded-xl border-2 border-dashed border-current p-4 text-center text-xs font-black">
        {rawImageHidden}
      </div>
    )
  }

  return (
    <button aria-label={previewLabel} className="block cursor-zoom-in overflow-hidden rounded-xl border-2 border-current transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2" onClick={() => onPreview(image)} type="button">
      <img alt={image.alt} className="max-h-[480px] w-full object-contain" loading="lazy" src={image.url} />
    </button>
  )
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.style.position = 'fixed'
  textArea.style.opacity = '0'
  document.body.appendChild(textArea)
  textArea.select()
  const copied = document.execCommand('copy')
  textArea.remove()
  if (!copied) throw new Error('Clipboard tidak tersedia.')
}

function formatSessionDate(timestamp: number, language: AppLanguage): string {
  return new Intl.DateTimeFormat(language === 'id' ? 'id-ID' : 'en-US', {
    day: '2-digit',
    month: 'short',
  }).format(timestamp)
}

function formatLogTime(timestamp: number, language: AppLanguage): string {
  return new Intl.DateTimeFormat(language === 'id' ? 'id-ID' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp)
}

function App() {
  const gateway = useMemo(() => new HttpChatGateway(), [])
  const historyRepository = useMemo(() => new LocalChatHistoryRepository(), [])
  const {
    messages, sessions, contextUsage, activeSessionId, mode, setMode, models, selectedModel, setSelectedModel,
    sendMessage, startNewChat, openSession, renameSession, deleteSession, isLoading, error, logs,
  } = useChat(gateway, historyRepository)
  const [language, setLanguage] = useState<AppLanguage>(() => localStorage.getItem('boo-language') === 'id' ? 'id' : 'en')
  const ui = UI_TEXT[language]
  const {
    isSupported, isSpeechSupported, isListening, startListening, stopListening, speak, stopSpeaking,
  } = useBrowserVoice(language)
  const [draft, setDraft] = useState('')
  const [pendingImages, setPendingImages] = useState<ChatImage[]>([])
  const [uploadError, setUploadError] = useState('')
  const [imageSize, setImageSize] = useState('1024x1024')
  const [theme, setTheme] = useState<Theme>(() => localStorage.getItem('boo-theme') === 'dark' ? 'dark' : 'light')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarHidden, setSidebarHidden] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const [sessionToRename, setSessionToRename] = useState<{ id: string; title: string } | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [sessionToDelete, setSessionToDelete] = useState<{ id: string; title: string } | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<ChatImage | null>(null)
  const [previewZoom, setPreviewZoom] = useState(1)
  const [sessionReferences, setSessionReferences] = useState<ChatSessionReference[]>([])
  const [mentionDismissed, setMentionDismissed] = useState(false)
  const [mentionIndex, setMentionIndex] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const copyFeedbackTimeoutRef = useRef<number | null>(null)
  const hasMessages = messages.length > 0
  const isImageMode = mode === 'image'
  const referenceModelError = isImageMode && pendingImages.length > 1 && !selectedModel.startsWith('cx/')
    ? ui.referenceModelError
    : ''
  const mentionMatch = !isImageMode && !mentionDismissed ? draft.match(/@([^@\n]*)$/) : null
  const mentionQuery = mentionMatch?.[1].trim().toLocaleLowerCase(language === 'id' ? 'id-ID' : 'en-US') ?? ''
  const mentionSessions = mentionMatch
    ? sessions
      .filter((session) => session.id !== activeSessionId)
      .filter((session) => !sessionReferences.some((reference) => reference.sessionId === session.id))
      .filter((session) => session.title.toLocaleLowerCase(language === 'id' ? 'id-ID' : 'en-US').includes(mentionQuery))
      .slice(0, 6)
    : []

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('boo-theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = language
    localStorage.setItem('boo-language', language)
  }, [language])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => () => {
    if (copyFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(copyFeedbackTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!sessionToRename && !sessionToDelete && !previewImage) return
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return
      setSessionToRename(null)
      setSessionToDelete(null)
      setPreviewImage(null)
      setPreviewZoom(1)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [previewImage, sessionToDelete, sessionToRename])

  function openImagePreview(image: ChatImage) {
    setPreviewZoom(1)
    setPreviewImage(image)
  }

  function closeImagePreview() {
    setPreviewImage(null)
    setPreviewZoom(1)
  }

  function changePreviewZoom(delta: number) {
    setPreviewZoom((current) => clampPreviewZoom(current + delta))
  }

  async function deliver(text: string, shouldSpeak = voiceMode) {
    const fallbackPrompt = pendingImages.length
      ? isImageMode
        ? ui.fallbackMergePrompt
        : ui.fallbackVisionPrompt
      : ''
    const prompt = text.trim() || fallbackPrompt
    if (!prompt) return
    if (referenceModelError) return
    const images = pendingImages
    const references = sessionReferences
    setDraft('')
    setPendingImages([])
    setSessionReferences([])
    setMentionDismissed(false)
    setUploadError('')
    const answer = await sendMessage(prompt, images, imageSize, language, references)
    if (answer && shouldSpeak && !isImageMode) speak(answer)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void deliver(draft)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionMatch && mentionSessions.length) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setMentionIndex((current) => (current + 1) % mentionSessions.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setMentionIndex((current) => (current - 1 + mentionSessions.length) % mentionSessions.length)
        return
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        selectSessionReference(mentionSessions[Math.min(mentionIndex, mentionSessions.length - 1)])
        return
      }
    }
    if (mentionMatch && event.key === 'Escape') {
      event.preventDefault()
      setMentionDismissed(true)
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  function handleDraftChange(value: string) {
    setDraft(value)
    setMentionDismissed(false)
    setMentionIndex(0)
  }

  function selectSessionReference(session: ChatSession) {
    if (sessionReferences.length >= MAX_SESSION_REFERENCES) return
    setSessionReferences((current) => current.some((reference) => reference.sessionId === session.id)
      ? current
      : [...current, { sessionId: session.id, title: session.title }])
    const triggerIndex = mentionMatch?.index ?? draft.length
    const prefix = draft.slice(0, triggerIndex).trimEnd()
    setDraft(prefix ? `${prefix} ` : '')
    setMentionDismissed(true)
    setMentionIndex(0)
    window.requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function removeSessionReference(sessionId: string) {
    setSessionReferences((current) => current.filter((reference) => reference.sessionId !== sessionId))
  }

  function openSessionMention() {
    if (isImageMode || sessionReferences.length >= MAX_SESSION_REFERENCES) return
    setDraft((current) => `${current}${current && !/\s$/.test(current) ? ' ' : ''}@`)
    setMentionDismissed(false)
    setMentionIndex(0)
    window.requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function handleMic() {
    if (isListening) {
      stopListening()
      return
    }
    if (!isImageMode) setVoiceMode(true)
    startListening((transcript) => void deliver(transcript, true))
  }

  function handleMode(nextMode: ChatMode) {
    setPendingImages([])
    setSessionReferences([])
    setMentionDismissed(false)
    setUploadError('')
    setMode(nextMode)
  }

  async function handleImageFile(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return

    const availableSlots = MAX_PENDING_IMAGES - pendingImages.length
    if (availableSlots <= 0) {
      setUploadError(ui.maxReferences)
      return
    }

    const filesToProcess = files.slice(0, availableSlots)
    try {
      const preparedImages: ChatImage[] = []
      for (const file of filesToProcess) {
        preparedImages.push(await prepareImageUpload(file))
      }
      setPendingImages((current) => [...current, ...preparedImages].slice(0, MAX_PENDING_IMAGES))
      if (!isImageMode) setMode('vision')
      setUploadError(files.length > availableSlots ? ui.maxReferences : '')
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : ui.imageProcessingError)
    }
  }

  function removePendingImage(index: number) {
    const nextImages = pendingImages.filter((_, imageIndex) => imageIndex !== index)
    setPendingImages(nextImages)
    setUploadError('')
    if (!nextImages.length && mode === 'vision') setMode('chat')
  }

  async function handleCopyMessage(messageId: string, content: string) {
    try {
      await copyToClipboard(content)
      setCopiedMessageId(messageId)
      if (copyFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(copyFeedbackTimeoutRef.current)
      }
      copyFeedbackTimeoutRef.current = window.setTimeout(() => {
        setCopiedMessageId(null)
        copyFeedbackTimeoutRef.current = null
      }, 2000)
    } catch (cause) {
      console.error('[boo-client] Gagal menyalin pesan.', cause)
    }
  }

  function handleToggleMessageSpeech(messageId: string, content: string) {
    if (speakingMessageId === messageId) {
      stopSpeaking()
      setSpeakingMessageId(null)
      return
    }

    setSpeakingMessageId(messageId)
    speak(content, () => {
      setSpeakingMessageId((current) => current === messageId ? null : current)
    })
  }

  function handleNewChat() {
    stopSpeaking()
    setSpeakingMessageId(null)
    startNewChat()
    setDraft('')
    setPendingImages([])
    setSessionReferences([])
    setMentionDismissed(false)
    setSidebarOpen(false)
  }

  function handleOpenSession(sessionId: string) {
    stopSpeaking()
    setSpeakingMessageId(null)
    openSession(sessionId)
    setDraft('')
    setPendingImages([])
    setSessionReferences([])
    setMentionDismissed(false)
    setSidebarOpen(false)
  }

  function handleRenameSession(sessionId: string, currentTitle: string) {
    setSessionToRename({ id: sessionId, title: currentTitle })
    setRenameTitle(currentTitle)
  }

  function confirmRenameSession(event: FormEvent) {
    event.preventDefault()
    if (!sessionToRename || !renameTitle.trim()) return
    renameSession(sessionToRename.id, renameTitle)
    const cleanTitle = renameTitle.replace(/\s+/g, ' ').trim()
    setSessionReferences((current) => current.map((reference) => reference.sessionId === sessionToRename.id
      ? { ...reference, title: cleanTitle }
      : reference))
    setSessionToRename(null)
    setRenameTitle('')
  }

  function handleDeleteSession(sessionId: string, title: string) {
    setSessionToDelete({ id: sessionId, title })
  }

  function confirmDeleteSession() {
    if (!sessionToDelete || (isLoading && activeSessionId === sessionToDelete.id)) return
    deleteSession(sessionToDelete.id)
    setSessionReferences((current) => current.filter((reference) => reference.sessionId !== sessionToDelete.id))
    if (activeSessionId === sessionToDelete.id) {
      stopSpeaking()
      setSpeakingMessageId(null)
      setDraft('')
      setPendingImages([])
      setUploadError('')
    }
    setSessionToDelete(null)
  }

  return (
    <div className="min-h-dvh bg-[#f3f3f1] text-black transition-colors duration-300 dark:bg-[#0d0d0d] dark:text-white">
      {previewImage && (
        <div className="fixed inset-0 z-[80] grid place-items-center p-4 sm:p-8">
          <button aria-label={ui.closePreview} className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={closeImagePreview} type="button" />
          <section aria-label={ui.previewImage} aria-modal="true" className="relative z-10 flex max-h-full w-full max-w-5xl flex-col rounded-2xl border-[3px] border-black bg-white p-3 shadow-[8px_8px_0_#000] dark:border-white dark:bg-[#171717] dark:shadow-[8px_8px_0_#525252]" role="dialog">
            <div className="mb-3 flex items-center gap-2 px-1">
              <p className="min-w-0 flex-1 truncate text-xs font-black uppercase tracking-[0.16em]">{ui.previewImage}</p>
              <div aria-label={ui.zoomControls} className="flex shrink-0 items-center gap-1" role="group">
                <button aria-label={ui.zoomOut} className="grid size-9 place-items-center rounded-xl border-2 border-black bg-white text-lg font-black leading-none text-black shadow-[2px_2px_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-35 dark:border-white dark:bg-neutral-900 dark:text-white dark:shadow-[2px_2px_0_#525252]" disabled={previewZoom <= MIN_PREVIEW_ZOOM} onClick={() => changePreviewZoom(-PREVIEW_ZOOM_STEP)} type="button">−</button>
                <button aria-label={`${ui.resetZoom} (${Math.round(previewZoom * 100)}%)`} className="h-9 min-w-16 rounded-xl border-2 border-black bg-white px-2 text-xs font-black tabular-nums text-black shadow-[2px_2px_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-white dark:bg-neutral-900 dark:text-white dark:shadow-[2px_2px_0_#525252]" onClick={() => setPreviewZoom(1)} title={ui.resetZoom} type="button">{Math.round(previewZoom * 100)}%</button>
                <button aria-label={ui.zoomIn} className="grid size-9 place-items-center rounded-xl border-2 border-black bg-white text-lg font-black leading-none text-black shadow-[2px_2px_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-35 dark:border-white dark:bg-neutral-900 dark:text-white dark:shadow-[2px_2px_0_#525252]" disabled={previewZoom >= MAX_PREVIEW_ZOOM} onClick={() => changePreviewZoom(PREVIEW_ZOOM_STEP)} type="button">+</button>
              </div>
              <button aria-label={ui.closePreview} autoFocus className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-black bg-white text-black shadow-[2px_2px_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-white dark:bg-neutral-900 dark:text-white dark:shadow-[2px_2px_0_#525252]" onClick={closeImagePreview} type="button"><Icon name="x" className="size-4" /></button>
            </div>
            <div
              className="grid min-h-0 flex-1 place-items-center overflow-auto rounded-xl bg-neutral-100 p-2 dark:bg-black/30"
              onWheel={(event) => {
                if (!event.ctrlKey && !event.metaKey) return
                event.preventDefault()
                changePreviewZoom(event.deltaY < 0 ? PREVIEW_ZOOM_STEP : -PREVIEW_ZOOM_STEP)
              }}
              title={ui.zoomHint}
            >
              <img
                alt={previewImage.alt}
                className={`max-h-[76vh] max-w-full select-none object-contain transition-transform duration-150 ${previewZoom < MAX_PREVIEW_ZOOM ? 'cursor-zoom-in' : 'cursor-zoom-out'}`}
                draggable={false}
                onDoubleClick={() => setPreviewZoom((current) => current === 1 ? 2 : 1)}
                src={previewImage.url}
                style={{ transform: `scale(${previewZoom})` }}
              />
            </div>
            {previewImage.kind === 'generated' && previewImage.watermarked && <a className="mt-3 inline-flex w-fit items-center gap-2 px-1 text-xs font-black underline underline-offset-4" download={previewImage.name || 'boo-ai-watermarked.png'} href={previewImage.url}><Icon name="image" className="size-3" /> {ui.downloadWatermark}</a>}
          </section>
        </div>
      )}

      {sessionToRename && (
        <div className="fixed inset-0 z-[70] grid place-items-center p-5">
          <button aria-label={ui.closeRenameDialog} className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => { setSessionToRename(null); setRenameTitle('') }} type="button" />
          <section aria-describedby="rename-session-description" aria-labelledby="rename-session-title" aria-modal="true" className="relative z-10 w-full max-w-sm rotate-[0.5deg] rounded-2xl border-[3px] border-black bg-white p-5 shadow-[8px_8px_0_#000] dark:border-white dark:bg-[#171717] dark:shadow-[8px_8px_0_#525252]" role="dialog">
            <form onSubmit={confirmRenameSession}>
              <div className="mb-4 flex items-start gap-4">
                <div className="grid size-12 shrink-0 rotate-[5deg] place-items-center rounded-xl border-2 border-black bg-sky-300 text-sky-950 shadow-[3px_3px_0_#000] dark:border-white"><Icon name="pencil" className="size-5" /></div>
                <div className="min-w-0">
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-sky-600 dark:text-sky-300">{ui.editHistory}</p>
                  <h2 className="text-xl font-black leading-tight tracking-[-0.03em]" id="rename-session-title">{ui.renameConversation}</h2>
                </div>
              </div>
              <p className="mb-4 text-sm font-semibold leading-6 text-neutral-600 dark:text-neutral-300" id="rename-session-description">{ui.renameDescription}</p>
              <label className="block">
                <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em]">{ui.conversationTitle}</span>
                <input autoFocus className="w-full rounded-xl border-2 border-black bg-white px-3 py-2.5 text-sm font-black outline-none shadow-[3px_3px_0_#000] transition focus:-translate-x-0.5 focus:-translate-y-0.5 focus:shadow-[5px_5px_0_#000] dark:border-white dark:bg-neutral-900 dark:shadow-[3px_3px_0_#525252] dark:focus:shadow-[5px_5px_0_#525252]" maxLength={80} onChange={(event) => setRenameTitle(event.target.value)} value={renameTitle} />
              </label>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button className="rounded-xl border-2 border-black bg-white px-4 py-2.5 text-xs font-black uppercase shadow-[3px_3px_0_#000] transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-white dark:bg-neutral-900 dark:shadow-[3px_3px_0_#525252] dark:hover:shadow-[5px_5px_0_#525252]" onClick={() => { setSessionToRename(null); setRenameTitle('') }} type="button">{ui.cancel}</button>
                <button className="rounded-xl border-2 border-black bg-sky-300 px-4 py-2.5 text-xs font-black uppercase text-sky-950 shadow-[3px_3px_0_#000] transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-sky-400 hover:shadow-[5px_5px_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 dark:border-white dark:shadow-[3px_3px_0_#525252] dark:hover:shadow-[5px_5px_0_#525252]" disabled={!renameTitle.trim()} type="submit">{ui.save}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {sessionToDelete && (
        <div className="fixed inset-0 z-[70] grid place-items-center p-5">
          <button aria-label={ui.closeDeleteDialog} className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setSessionToDelete(null)} type="button" />
          <section aria-describedby="delete-session-description" aria-labelledby="delete-session-title" aria-modal="true" className="relative z-10 w-full max-w-sm rotate-[-0.5deg] rounded-2xl border-[3px] border-black bg-white p-5 shadow-[8px_8px_0_#000] dark:border-white dark:bg-[#171717] dark:shadow-[8px_8px_0_#525252]" role="alertdialog">
            <div className="mb-4 flex items-start gap-4">
              <div className="grid size-12 shrink-0 rotate-[-5deg] place-items-center rounded-xl border-2 border-black bg-red-500 text-white shadow-[3px_3px_0_#000] dark:border-white"><Icon name="trash" className="size-5" /></div>
              <div className="min-w-0">
                <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-red-500">{ui.deleteHistory}</p>
                <h2 className="text-xl font-black leading-tight tracking-[-0.03em]" id="delete-session-title">{ui.confirmDelete}</h2>
              </div>
            </div>
            <p className="text-sm font-semibold leading-6 text-neutral-600 dark:text-neutral-300" id="delete-session-description">{ui.deleteBefore} <strong className="break-words text-black dark:text-white">“{sessionToDelete.title}”</strong> {ui.deleteAfter}</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button autoFocus className="rounded-xl border-2 border-black bg-white px-4 py-2.5 text-xs font-black uppercase shadow-[3px_3px_0_#000] transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-white dark:bg-neutral-900 dark:shadow-[3px_3px_0_#525252] dark:hover:shadow-[5px_5px_0_#525252]" onClick={() => setSessionToDelete(null)} type="button">{ui.cancel}</button>
              <button className="rounded-xl border-2 border-black bg-red-500 px-4 py-2.5 text-xs font-black uppercase text-white shadow-[3px_3px_0_#000] transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-red-600 hover:shadow-[5px_5px_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 dark:border-white dark:shadow-[3px_3px_0_#525252] dark:hover:shadow-[5px_5px_0_#525252]" disabled={isLoading && activeSessionId === sessionToDelete.id} onClick={confirmDeleteSession} type="button">{ui.delete}</button>
            </div>
          </section>
        </div>
      )}

      {sidebarOpen && <button aria-label={ui.closeSidebar} className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} type="button" />}

      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r-2 border-black bg-white p-5 transition-transform duration-300 dark:border-white/20 dark:bg-[#141414] ${sidebarHidden ? 'lg:-translate-x-full' : 'lg:translate-x-0'} ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-8 flex items-center justify-between">
          <button aria-label={ui.reloadBoo} className="flex items-center gap-3 rounded-xl text-left outline-none transition hover:opacity-75 focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white" onClick={() => window.location.reload()} title={ui.reloadBoo} type="button"><img alt="Logo Boo AI" className="size-11 shrink-0 rotate-[-3deg] rounded-xl border-2 border-black bg-white object-contain shadow-[3px_3px_0_#a3a3a3] dark:border-white/40 dark:shadow-[3px_3px_0_#525252]" src={booLogo} /><span><span className="block text-lg font-black tracking-[-0.04em]">BOO AI</span><span className="block text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-500">Think bigger</span></span></button>
          <div className="flex items-center">
            <button aria-label={ui.closeMenu} className="rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 lg:hidden" onClick={() => setSidebarOpen(false)} type="button"><Icon name="menu" /></button>
            <button aria-label={ui.hideSidebar} className="hidden rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 lg:block" onClick={() => setSidebarHidden(true)} type="button"><Icon name="menu" /></button>
          </div>
        </div>

        <button className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-black bg-black px-4 py-3 text-sm font-black text-white shadow-[4px_4px_0_#a3a3a3] active:translate-x-1 active:translate-y-1 active:shadow-none dark:border-white dark:bg-white dark:text-black dark:shadow-[4px_4px_0_#525252]" onClick={handleNewChat} type="button"><Icon name="plus" className="size-4" /> {ui.newChat}</button>

        <div className="mt-8 min-h-0 flex-1 overflow-y-auto pr-1">
          <p className="mb-3 px-2 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">{ui.localHistory}</p>
          <div className="space-y-2">
            {!sessions.length && <p className="px-2 py-3 text-xs font-semibold text-neutral-500">{ui.noSavedChats}</p>}
            {sessions.map((session) => (
              <div className={`group flex items-center rounded-xl border-2 transition ${activeSessionId === session.id ? 'border-black bg-neutral-100 dark:border-white/50 dark:bg-neutral-800' : 'border-transparent hover:border-black/40 hover:bg-neutral-50 dark:hover:border-white/30 dark:hover:bg-neutral-900'}`} key={session.id}>
                <button className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left" onClick={() => handleOpenSession(session.id)} type="button">
                  <Icon name={session.mode === 'image' ? 'image' : 'chat'} className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-black">{session.title}</span><span className="mt-1 block text-[9px] font-bold uppercase tracking-wider text-neutral-500">{session.mode === 'image' ? 'Gambar · ' : ''}{formatSessionDate(session.updatedAt, language)}</span></span>
                </button>
                <div className="flex shrink-0 items-center gap-0.5 pr-1.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <button aria-label={`Ubah judul ${session.title}`} className="grid size-7 place-items-center rounded-md text-neutral-500 transition hover:bg-sky-300 hover:text-sky-950 focus-visible:bg-sky-300 focus-visible:text-sky-950" onClick={() => handleRenameSession(session.id, session.title)} title="Ubah judul" type="button"><Icon name="pencil" className="size-3.5" /></button>
                  <button aria-label={`Hapus ${session.title}`} className="grid size-7 place-items-center rounded-md text-neutral-500 transition hover:bg-red-500 hover:text-white focus-visible:bg-red-500 focus-visible:text-white disabled:cursor-not-allowed disabled:opacity-30" disabled={isLoading && activeSessionId === session.id} onClick={() => handleDeleteSession(session.id, session.title)} title="Hapus percakapan" type="button"><Icon name="trash" className="size-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <details className="group rounded-xl border-2 border-black/20 bg-white p-3 dark:border-white/20 dark:bg-neutral-900">
            <summary className="cursor-pointer list-none text-[10px] font-black uppercase tracking-[0.16em]">Log sistem ({logs.length})</summary>
            <div className="mt-3 max-h-32 space-y-2 overflow-y-auto border-t border-black/10 pt-3 dark:border-white/10">
              {!logs.length && <p className="text-[10px] text-neutral-500">Belum ada log.</p>}
              {[...logs].reverse().slice(0, 6).map((log) => <div className="text-[10px] leading-relaxed" key={log.id}><span className="mr-2 font-mono text-neutral-500">{formatLogTime(log.timestamp, language)}</span><span className={log.level === 'error' ? 'font-black' : 'font-semibold'}>{log.message}</span></div>)}
            </div>
          </details>
        </div>
      </aside>

      <main className={`flex min-h-dvh flex-col transition-[padding] duration-300 ${sidebarHidden ? 'lg:pl-0' : 'lg:pl-[280px]'}`}>
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b-2 border-black/10 bg-[#f3f3f1]/90 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-[#0d0d0d]/90 sm:px-7">
          <div className="flex items-center gap-3">
            {!sidebarOpen && <button aria-label={ui.openMenu} className="rounded-xl border-2 border-black bg-white p-2 shadow-[2px_2px_0_#000] dark:border-white/30 dark:bg-neutral-900 dark:shadow-[2px_2px_0_#525252] lg:hidden" onClick={() => setSidebarOpen(true)} type="button"><Icon name="menu" /></button>}
            {sidebarHidden && <button aria-label={ui.showSidebar} className="hidden rounded-xl border-2 border-black bg-white p-2 shadow-[2px_2px_0_#000] dark:border-white/30 dark:bg-neutral-900 dark:shadow-[2px_2px_0_#525252] lg:grid" onClick={() => setSidebarHidden(false)} type="button"><Icon name="menu" /></button>}
            <label className="relative inline-block"><span className="sr-only">{ui.selectModel}</span><select className="max-w-[135px] cursor-pointer appearance-none rounded-xl border-2 border-black bg-white py-2.5 pl-3 pr-9 text-xs font-black outline-none shadow-[3px_3px_0_#000] transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#000] focus-visible:-translate-x-0.5 focus-visible:-translate-y-0.5 focus-visible:shadow-[5px_5px_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-white dark:bg-neutral-900 dark:shadow-[3px_3px_0_#525252] dark:hover:shadow-[5px_5px_0_#525252] dark:focus-visible:shadow-[5px_5px_0_#525252] sm:max-w-[300px] sm:text-sm" onChange={(event) => setSelectedModel(event.target.value)} value={selectedModel}><option disabled value="">{models.length ? ui.chooseModel : ui.modelsUnavailable}</option>{models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.provider}</option>)}</select><Icon name="chevron-down" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2" /></label>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="relative inline-block"><span className="sr-only">{ui.language}</span><select aria-label={ui.language} className="w-[52px] cursor-pointer appearance-none rounded-xl border-2 border-black bg-white py-2.5 pl-2 pr-5 text-[10px] font-black outline-none shadow-[2px_2px_0_#000] dark:border-white/30 dark:bg-neutral-900 dark:shadow-[2px_2px_0_#525252]" onChange={(event) => setLanguage(event.target.value as AppLanguage)} value={language}><option value="en">EN</option><option value="id">ID</option></select><Icon name="chevron-down" className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2" /></label>
            <button aria-label={ui.voiceReplies} className={`rounded-xl border-2 p-2.5 disabled:cursor-not-allowed disabled:opacity-30 ${voiceMode ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black' : 'border-black/20 bg-white dark:border-white/20 dark:bg-neutral-900'}`} disabled={!isSpeechSupported} onClick={() => setVoiceMode((current) => !current)} type="button"><Icon name="volume" className="size-4" /></button>
            <button aria-label={ui.switchTheme} className="rounded-xl border-2 border-black/20 bg-white p-2.5 dark:border-white/20 dark:bg-neutral-900" onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} type="button"><Icon name={theme === 'light' ? 'moon' : 'sun'} className="size-4" /></button>
            <div className="ml-1 hidden size-9 place-items-center rounded-full border-2 border-black bg-white text-[10px] font-black dark:border-white/40 dark:bg-neutral-900 sm:grid">You</div>
          </div>
        </header>

        <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 sm:px-8">
          {!hasMessages ? (
            <div className="flex flex-1 flex-col justify-center py-10 sm:py-16">
              <div className="mb-8 max-w-3xl">
                <div className="mb-5 inline-flex rotate-[-2deg] items-center gap-2 rounded-lg border-2 border-black bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] shadow-[3px_3px_0_#000] dark:border-white/40 dark:bg-neutral-900 dark:shadow-[3px_3px_0_#525252]"><span className="size-2 animate-pulse rounded-full bg-black dark:bg-white" /> {isImageMode ? ui.imageStudioReady : ui.aiReady}</div>
                <div className="flex items-center gap-4 sm:gap-6">
                  <img alt="Boo AI" className="size-16 shrink-0 object-contain sm:size-20" src={booLogo} />
                  <h1 className="text-5xl font-black leading-[0.93] tracking-[-0.065em] sm:text-7xl lg:text-8xl">{isImageMode ? ui.imagine : ui.helloBoo}<br /><span className="text-neutral-400 dark:text-neutral-600">{isImageMode ? ui.makeItReal : ui.whatToCreate}</span></h1>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 space-y-7 py-8 sm:py-12">
              {messages.map((message) => {
                const attachedImages = getMessageImages(message)
                return (
                  <article className={`flex gap-3 sm:gap-4 ${message.role === 'user' ? 'flex-row-reverse' : ''}`} key={message.id}>
                    {message.role === 'assistant' ? <img alt="Avatar Boo AI" className="size-9 shrink-0 rounded-xl border-2 border-black bg-white object-contain dark:border-white/40" src={booLogo} /> : <div className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-black bg-white text-[10px] font-black dark:border-white/40 dark:bg-neutral-900">You</div>}
                    <div className={`flex max-w-[90%] flex-col sm:max-w-[78%] ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`w-fit max-w-full rounded-2xl border-2 p-3 text-sm font-medium leading-7 sm:p-4 sm:text-base ${message.role === 'user' ? 'border-black bg-black text-white shadow-[4px_4px_0_#a3a3a3] dark:border-white dark:bg-white dark:text-black' : 'border-black/20 bg-white dark:border-white/20 dark:bg-[#171717]'}`}>
                        {message.references?.length ? <div className="mb-2 flex flex-wrap gap-1.5">{message.references.map((reference) => <span className="rounded-md border border-current px-2 py-0.5 text-[9px] font-black uppercase tracking-wide opacity-75" key={reference.sessionId}>@ {reference.title}</span>)}</div> : null}
                        {attachedImages.length > 0 && <div className={`mb-3 grid gap-2 ${attachedImages.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>{attachedImages.map((image, index) => <MessageImage image={image} key={`${image.url.slice(0, 40)}-${index}`} onPreview={openImagePreview} previewLabel={ui.previewImage} rawImageHidden={ui.rawImageHidden} />)}</div>}
                        {message.role === 'assistant'
                          ? <MarkdownMessage content={message.content} copiedCodeLabel={ui.codeCopied} copyCodeLabel={ui.copyCode} openLinkLabel={ui.openLink} />
                          : <p className="whitespace-pre-wrap">{message.content}</p>}
                        {attachedImages.filter((image) => image.kind === 'generated' && image.watermarked).map((image, index) => <a className="mt-3 inline-flex items-center gap-2 text-xs font-black underline underline-offset-4" download={image.name || 'boo-ai-watermarked.png'} href={image.url} key={`${image.url.slice(0, 40)}-${index}`}><Icon name="image" className="size-3" /> {ui.downloadWatermark}</a>)}
                      </div>
                      <div aria-label={`Aksi pesan ${message.role === 'assistant' ? 'Boo AI' : 'Anda'}`} className="mt-2 flex items-center gap-1 px-1" role="group">
                        <button aria-label={speakingMessageId === message.id ? 'Hentikan pembacaan pesan' : `Bacakan pesan ${message.role === 'assistant' ? 'Boo AI' : 'Anda'}`} aria-pressed={speakingMessageId === message.id} className={`grid size-7 place-items-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-30 ${speakingMessageId === message.id ? 'border-red-600 bg-red-500 text-white shadow-[2px_2px_0_#7f1d1d]' : 'border-black/15 bg-white text-neutral-500 hover:border-black hover:text-black dark:border-white/15 dark:bg-neutral-900 dark:hover:border-white dark:hover:text-white'}`} disabled={!isSpeechSupported || !message.content.trim()} onClick={() => handleToggleMessageSpeech(message.id, message.content)} title={speakingMessageId === message.id ? 'Hentikan pembacaan' : 'Bacakan pesan'} type="button"><Icon name={speakingMessageId === message.id ? 'stop' : 'volume'} className="size-3.5" /></button>
                        {speakingMessageId === message.id && <span aria-live="polite" className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-red-500" role="status"><span className="size-1.5 animate-pulse rounded-full bg-red-500" /> {ui.readingActive}</span>}
                        <button aria-label={copiedMessageId === message.id ? 'Pesan tersalin' : `Salin pesan ${message.role === 'assistant' ? 'Boo AI' : 'Anda'}`} className={`grid size-7 place-items-center rounded-lg border transition ${copiedMessageId === message.id ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black' : 'border-black/15 bg-white text-neutral-500 hover:border-black hover:text-black dark:border-white/15 dark:bg-neutral-900 dark:hover:border-white dark:hover:text-white'}`} disabled={!message.content.trim()} onClick={() => void handleCopyMessage(message.id, message.content)} title="Salin pesan" type="button"><Icon name={copiedMessageId === message.id ? 'check' : 'copy'} className="size-3.5" /></button>
                        {copiedMessageId === message.id && <span aria-live="polite" className="text-[9px] font-black uppercase tracking-wider text-neutral-500" role="status">{ui.copied}</span>}
                      </div>
                    </div>
                  </article>
                )
              })}
              {isLoading && <div className="flex items-center gap-4"><img alt="Boo AI sedang berpikir" className="size-9 rounded-xl border-2 border-black bg-white object-contain dark:border-white/40" src={booLogo} /><div className="flex gap-1.5 rounded-2xl border-2 border-black/20 bg-white px-5 py-4 dark:border-white/20 dark:bg-[#171717]"><span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" /></div></div>}
              <div ref={bottomRef} />
            </div>
          )}

          <div className="sticky bottom-0 mx-auto w-full max-w-2xl bg-gradient-to-t from-[#f3f3f1] via-[#f3f3f1] to-transparent pb-2 pt-3 dark:from-[#0d0d0d] dark:via-[#0d0d0d] sm:pb-3">
            {(error || uploadError || referenceModelError) && <p className="mb-2 rounded-lg border-2 border-black bg-white px-3 py-1.5 text-xs font-bold shadow-[2px_2px_0_#000] dark:border-white/30 dark:bg-neutral-900">{uploadError || referenceModelError || error}</p>}
            <form className="rounded-xl border-2 border-black bg-white p-1 shadow-[3px_3px_0_#000] transition focus-within:-translate-y-0.5 focus-within:shadow-[5px_5px_0_#000] dark:border-white/35 dark:bg-[#171717] dark:shadow-[3px_3px_0_#525252]" onSubmit={handleSubmit}>
              <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
                <div className="flex items-center gap-2"><button aria-pressed={!isImageMode} className={`flex items-center gap-1 border-b-2 px-1 py-1 text-[9px] font-black uppercase transition ${!isImageMode ? 'border-black text-black dark:border-white dark:text-white' : 'border-transparent text-neutral-400 hover:text-black dark:hover:text-white'}`} onClick={() => handleMode('chat')} type="button"><Icon name="chat" className="size-3" /> Chat</button><button aria-pressed={isImageMode} className={`flex items-center gap-1 border-b-2 px-1 py-1 text-[9px] font-black uppercase transition ${isImageMode ? 'border-black text-black dark:border-white dark:text-white' : 'border-transparent text-neutral-400 hover:text-black dark:hover:text-white'}`} onClick={() => handleMode('image')} type="button"><Icon name="image" className="size-3" /> {ui.createImage}</button></div>
                {isImageMode && <label className="relative inline-block"><span className="sr-only">{ui.imageSize}</span><select aria-label={ui.imageSize} className="cursor-pointer appearance-none rounded-lg border-2 border-black bg-white py-1.5 pl-3 pr-8 text-[10px] font-black outline-none shadow-[2px_2px_0_#000] transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#000] focus-visible:-translate-x-0.5 focus-visible:-translate-y-0.5 focus-visible:shadow-[4px_4px_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-white dark:bg-neutral-900 dark:shadow-[2px_2px_0_#525252] dark:hover:shadow-[4px_4px_0_#525252] dark:focus-visible:shadow-[4px_4px_0_#525252]" onChange={(event) => setImageSize(event.target.value)} value={imageSize}><option value="1024x1024">1:1</option><option value="1792x1024">16:9</option><option value="1024x1792">9:16</option></select><Icon name="chevron-down" className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2" /></label>}
              </div>
              {mentionMatch && <div aria-label={ui.mentionPicker} className="mx-2 mt-2 overflow-hidden rounded-xl border-2 border-black bg-white shadow-[3px_3px_0_#000] dark:border-white dark:bg-neutral-900 dark:shadow-[3px_3px_0_#525252]" id="session-mention-list" role="listbox"><p className="border-b border-black/10 px-3 py-2 text-[9px] font-black uppercase tracking-[0.16em] text-neutral-500 dark:border-white/10">{ui.mentionPreviousChat}</p>{mentionSessions.length ? <div className="max-h-44 overflow-y-auto p-1">{mentionSessions.map((session, index) => <button aria-selected={index === mentionIndex} className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs font-bold ${index === mentionIndex ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`} id={`session-mention-${session.id}`} key={session.id} onClick={() => selectSessionReference(session)} role="option" type="button"><span className="truncate">@ {session.title}</span><span className="shrink-0 text-[9px] opacity-60">{session.messages.length} {ui.messages}</span></button>)}</div> : <p className="px-3 py-3 text-xs font-semibold text-neutral-500">{ui.noMatchingSessions}</p>}</div>}
              {sessionReferences.length > 0 && <div className="mx-2 mt-2 flex flex-wrap gap-1.5">{sessionReferences.map((reference) => <span className="inline-flex items-center gap-1.5 rounded-lg border-2 border-black bg-sky-200 py-1 pl-2 pr-1 text-[10px] font-black text-sky-950 shadow-[2px_2px_0_#000] dark:border-white dark:shadow-[2px_2px_0_#525252]" key={reference.sessionId}>@ {reference.title}<button aria-label={`${ui.removeReference}: ${reference.title}`} className="grid size-5 place-items-center rounded-md hover:bg-black/10" onClick={() => removeSessionReference(reference.sessionId)} type="button"><Icon className="size-2.5" name="x" /></button></span>)}</div>}
              {pendingImages.length > 0 && <div className="mx-2 mt-2 flex flex-wrap gap-2">{pendingImages.map((image, index) => <div className="relative rounded-lg border-2 border-black bg-neutral-100 p-1 shadow-[2px_2px_0_#000] dark:border-white/30 dark:bg-neutral-800 dark:shadow-[2px_2px_0_#525252]" key={`${image.name ?? image.alt}-${index}`}><button aria-label={ui.previewImage} className="block cursor-zoom-in rounded-md" onClick={() => openImagePreview(image)} type="button"><img alt={image.alt} className="size-14 rounded-md object-cover" src={image.url} /></button><span className="absolute bottom-1 left-1 rounded bg-black/75 px-1 text-[8px] font-black text-white">{index + 1}</span><button aria-label={`Hapus gambar ${index + 1}`} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-black bg-white text-black shadow-[1px_1px_0_#000]" onClick={() => removePendingImage(index)} type="button"><Icon name="x" className="size-2.5" /></button></div>)}</div>}
              <textarea aria-activedescendant={mentionMatch && mentionSessions.length ? `session-mention-${mentionSessions[Math.min(mentionIndex, mentionSessions.length - 1)].id}` : undefined} aria-controls={mentionMatch ? 'session-mention-list' : undefined} aria-expanded={Boolean(mentionMatch)} aria-label={isImageMode ? ui.imageDescription : ui.aiMessage} className="max-h-24 min-h-8 w-full resize-none bg-transparent px-2 py-1.5 text-sm font-semibold leading-5 outline-none placeholder:text-neutral-400" onChange={(event) => handleDraftChange(event.target.value)} onKeyDown={handleKeyDown} placeholder={isImageMode ? ui.imagePlaceholder : pendingImages.length ? ui.visionPlaceholder : ui.chatPlaceholder} ref={textareaRef} rows={1} value={draft} />
              <div className="flex items-center justify-between px-0.5 pb-0.5">
                <div className="flex items-center gap-1.5">
                  <input accept="image/jpeg,image/png,image/webp" className="hidden" multiple onChange={(event) => void handleImageFile(event)} ref={fileInputRef} type="file" />
                  {!isImageMode && <button aria-label={ui.mentionSession} className="grid size-8 place-items-center rounded-md border-2 border-black/20 text-sm font-black hover:border-black disabled:cursor-not-allowed disabled:opacity-30 dark:border-white/20 dark:hover:border-white" disabled={sessionReferences.length >= MAX_SESSION_REFERENCES || sessions.every((session) => session.id === activeSessionId)} onClick={openSessionMention} type="button">@</button>}
                  <button aria-label={isImageMode ? ui.addReference : ui.uploadImage} className="grid size-8 place-items-center rounded-md border-2 border-black/20 hover:border-black dark:border-white/20 dark:hover:border-white" disabled={pendingImages.length >= MAX_PENDING_IMAGES} onClick={() => fileInputRef.current?.click()} type="button"><Icon name="paperclip" className="size-3.5" /></button>
                  <button aria-label={isListening ? ui.stopListening : isImageMode ? ui.startImageVoice : ui.startVoiceChat} className={`grid size-8 place-items-center rounded-md border-2 ${isListening ? 'animate-pulse border-black bg-black text-white dark:bg-white dark:text-black' : 'border-black/20 dark:border-white/20'} disabled:opacity-30`} disabled={!isSupported} onClick={handleMic} type="button"><Icon name="mic" className="size-3.5" /></button>
                  {mode === 'vision' && <span className="text-[9px] font-black uppercase tracking-wider">{ui.visionMode}</span>}
                  {isImageMode && pendingImages.length > 0 && <span className="text-[9px] font-black uppercase tracking-wider text-neutral-500">{pendingImages.length}/{MAX_PENDING_IMAGES} {ui.references}</span>}
                  {!isImageMode && <span className="hidden text-[9px] font-black uppercase tracking-wider text-neutral-500 sm:inline" title={`${ui.contextWindowHint}${contextUsage.omittedMessages ? ` ${contextUsage.omittedMessages} ${ui.olderMessagesExcluded}` : ''}`}>{ui.contextWindow} {contextUsage.percent}%</span>}
                </div>
                <button aria-label={isImageMode ? ui.createImage : ui.sendMessage} className="grid size-8 place-items-center rounded-md border-2 border-black bg-black text-white shadow-[2px_2px_0_#a3a3a3] disabled:cursor-not-allowed disabled:opacity-30 dark:border-white dark:bg-white dark:text-black" disabled={(!draft.trim() && !pendingImages.length) || Boolean(referenceModelError) || isLoading || !selectedModel} type="submit"><Icon name={isImageMode ? 'sparkles' : 'arrow-up'} className="size-3.5" /></button>
              </div>
            </form>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
