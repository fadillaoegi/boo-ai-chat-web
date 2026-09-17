import { useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react'
import type { ContextUsage } from '../application/chatContext'
import type { ChatImage, ChatMode, ChatSession, ChatSessionReference } from '../domain/chat'
import { Icon } from './Icon'
import type { AppLanguage, UiText } from './i18n'

const MAX_MENTION_RESULTS = 6
const TOOL_BUTTON = 'grid size-8 place-items-center rounded-md border-2'

function formatTokens(tokens: number): string {
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}K` : String(tokens)
}

export interface ComposerProps {
  activeSessionId: string | null
  contextUsage: ContextUsage
  draft: string
  errorMessage: string
  imageSize: string
  isListening: boolean
  isLoading: boolean
  language: AppLanguage
  maxPendingImages: number
  maxReferences: number
  mode: ChatMode
  onAddImages: (files: File[]) => void
  onAddReference: (session: ChatSession) => void
  onDraftChange: (draft: string) => void
  onImageSizeChange: (size: string) => void
  onMic: () => void
  onModeChange: (mode: ChatMode) => void
  onPreviewImage: (image: ChatImage) => void
  onRemoveImage: (index: number) => void
  onRemoveReference: (sessionId: string) => void
  onStop: () => void
  onSubmit: () => void
  pendingImages: ChatImage[]
  references: ChatSessionReference[]
  sendDisabled: boolean
  sessions: ChatSession[]
  ui: UiText
  voiceSupported: boolean
}

export function Composer({
  activeSessionId,
  contextUsage,
  draft,
  errorMessage,
  imageSize,
  isListening,
  isLoading,
  language,
  maxPendingImages,
  maxReferences,
  mode,
  onAddImages,
  onAddReference,
  onDraftChange,
  onImageSizeChange,
  onMic,
  onModeChange,
  onPreviewImage,
  onRemoveImage,
  onRemoveReference,
  onStop,
  onSubmit,
  pendingImages,
  references,
  sendDisabled,
  sessions,
  ui,
  voiceSupported,
}: ComposerProps) {
  const [mentionDismissed, setMentionDismissed] = useState(false)
  const [mentionIndex, setMentionIndex] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isImageMode = mode === 'image'
  const locale = language === 'id' ? 'id-ID' : 'en-US'

  const mentionMatch = !isImageMode && !mentionDismissed ? draft.match(/@([^@\n]*)$/) : null
  const mentionQuery = mentionMatch?.[1].trim().toLocaleLowerCase(locale) ?? ''
  const mentionSessions = mentionMatch
    ? sessions
      .filter((session) => session.id !== activeSessionId)
      .filter((session) => !references.some((reference) => reference.sessionId === session.id))
      .filter((session) => session.title.toLocaleLowerCase(locale).includes(mentionQuery))
      .slice(0, MAX_MENTION_RESULTS)
    : []
  const activeMention = mentionSessions[Math.min(mentionIndex, mentionSessions.length - 1)]

  function focusTextarea() {
    window.requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function changeDraft(value: string) {
    onDraftChange(value)
    setMentionDismissed(false)
    setMentionIndex(0)
  }

  function selectMention(session: ChatSession) {
    if (references.length >= maxReferences) return
    onAddReference(session)
    const prefix = draft.slice(0, mentionMatch?.index ?? draft.length).trimEnd()
    onDraftChange(prefix ? `${prefix} ` : '')
    setMentionDismissed(true)
    setMentionIndex(0)
    focusTextarea()
  }

  function openMention() {
    if (isImageMode || references.length >= maxReferences) return
    changeDraft(`${draft}${draft && !/\s$/.test(draft) ? ' ' : ''}@`)
    focusTextarea()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionMatch && mentionSessions.length) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        setMentionIndex((current) => (current + step + mentionSessions.length) % mentionSessions.length)
        return
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        selectMention(activeMention)
        return
      }
    }
    if (mentionMatch && event.key === 'Escape') {
      event.preventDefault()
      setMentionDismissed(true)
      return
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit()
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length) onAddImages(files)
  }

  const modeTab = (active: boolean) => `flex items-center gap-1 border-b-2 px-1 py-1 text-[9px] font-black uppercase transition ${active ? 'border-black text-black dark:border-white dark:text-white' : 'border-transparent text-neutral-400 hover:text-black dark:hover:text-white'}`

  return (
    <div className="sticky bottom-0 mx-auto w-full max-w-2xl bg-gradient-to-t from-[#f3f3f1] via-[#f3f3f1] to-transparent pb-2 pt-3 dark:from-[#0d0d0d] dark:via-[#0d0d0d] sm:pb-3">
      {errorMessage && <p className="mb-2 rounded-lg border-2 border-black bg-white px-3 py-1.5 text-xs font-bold shadow-boo-sm dark:border-white/30 dark:bg-neutral-900" role="alert">{errorMessage}</p>}
      <form className="rounded-xl border-2 border-black bg-white p-1 shadow-boo-md transition focus-within:-translate-y-0.5 focus-within:shadow-boo-xl dark:border-white/35 dark:bg-[#171717]" onSubmit={handleSubmit}>
        <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
          <div className="flex items-center gap-2">
            <button aria-pressed={!isImageMode} className={modeTab(!isImageMode)} onClick={() => onModeChange('chat')} type="button"><Icon name="chat" className="size-3" /> {ui.chat}</button>
            <button aria-pressed={isImageMode} className={modeTab(isImageMode)} onClick={() => onModeChange('image')} type="button"><Icon name="image" className="size-3" /> {ui.createImage}</button>
          </div>
          {isImageMode && <label className="relative inline-block"><span className="sr-only">{ui.imageSize}</span><select aria-label={ui.imageSize} className="cursor-pointer appearance-none rounded-lg border-2 border-black bg-white py-1.5 pl-3 pr-8 text-[10px] font-black outline-none shadow-boo-sm transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-boo-lg focus-visible:-translate-x-0.5 focus-visible:-translate-y-0.5 focus-visible:shadow-boo-lg active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-white dark:bg-neutral-900" onChange={(event) => onImageSizeChange(event.target.value)} value={imageSize}><option value="1024x1024">1:1</option><option value="1792x1024">16:9</option><option value="1024x1792">9:16</option></select><Icon name="chevron-down" className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2" /></label>}
        </div>

        {mentionMatch && (
          <div aria-label={ui.mentionPicker} className="mx-2 mt-2 overflow-hidden rounded-xl border-2 border-black bg-white shadow-boo-md dark:border-white dark:bg-neutral-900" id="session-mention-list" role="listbox">
            <p className="border-b border-black/10 px-3 py-2 text-[9px] font-black uppercase tracking-[0.16em] text-neutral-500 dark:border-white/10">{ui.mentionPreviousChat}</p>
            {mentionSessions.length
              ? <div className="max-h-44 overflow-y-auto p-1">{mentionSessions.map((session, index) => <button aria-selected={index === mentionIndex} className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs font-bold ${index === mentionIndex ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`} id={`session-mention-${session.id}`} key={session.id} onClick={() => selectMention(session)} role="option" type="button"><span className="truncate">@ {session.title}</span><span className="shrink-0 text-[9px] opacity-60">{session.messages.length} {ui.messages}</span></button>)}</div>
              : <p className="px-3 py-3 text-xs font-semibold text-neutral-500">{ui.noMatchingSessions}</p>}
          </div>
        )}

        {references.length > 0 && <div className="mx-2 mt-2 flex flex-wrap gap-1.5">{references.map((reference) => <span className="inline-flex items-center gap-1.5 rounded-lg border-2 border-black bg-sky-200 py-1 pl-2 pr-1 text-[10px] font-black text-sky-950 shadow-boo-sm dark:border-white" key={reference.sessionId}>@ {reference.title}<button aria-label={`${ui.removeReference}: ${reference.title}`} className="grid size-5 place-items-center rounded-md hover:bg-black/10" onClick={() => onRemoveReference(reference.sessionId)} type="button"><Icon className="size-2.5" name="x" /></button></span>)}</div>}

        {pendingImages.length > 0 && <div className="mx-2 mt-2 flex flex-wrap gap-2">{pendingImages.map((image, index) => <div className="relative rounded-lg border-2 border-black bg-neutral-100 p-1 shadow-boo-sm dark:border-white/30 dark:bg-neutral-800" key={`${image.name ?? image.alt}-${index}`}><button aria-label={ui.previewImage} className="block cursor-zoom-in rounded-md" onClick={() => onPreviewImage(image)} type="button"><img alt={image.alt} className="size-14 rounded-md object-cover" src={image.url} /></button><span className="absolute bottom-1 left-1 rounded bg-black/75 px-1 text-[8px] font-black text-white">{index + 1}</span><button aria-label={`${ui.removeImage} ${index + 1}`} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-black bg-white text-black shadow-boo-xs" onClick={() => onRemoveImage(index)} type="button"><Icon name="x" className="size-2.5" /></button></div>)}</div>}

        <textarea
          aria-activedescendant={mentionMatch && activeMention ? `session-mention-${activeMention.id}` : undefined}
          aria-controls={mentionMatch ? 'session-mention-list' : undefined}
          aria-expanded={Boolean(mentionMatch)}
          aria-label={isImageMode ? ui.imageDescription : ui.aiMessage}
          className="max-h-24 min-h-8 w-full resize-none bg-transparent px-2 py-1.5 text-sm font-semibold leading-5 outline-none placeholder:text-neutral-400"
          onChange={(event) => changeDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isImageMode ? ui.imagePlaceholder : pendingImages.length ? ui.visionPlaceholder : ui.chatPlaceholder}
          ref={textareaRef}
          rows={1}
          value={draft}
        />

        <div className="flex items-center justify-between px-0.5 pb-0.5">
          <div className="flex items-center gap-1.5">
            <input accept="image/jpeg,image/png,image/webp" className="hidden" multiple onChange={handleFiles} ref={fileInputRef} type="file" />
            {!isImageMode && <button aria-label={ui.mentionSession} className={`${TOOL_BUTTON} border-black/20 text-sm font-black hover:border-black disabled:cursor-not-allowed disabled:opacity-30 dark:border-white/20 dark:hover:border-white`} disabled={references.length >= maxReferences || sessions.every((session) => session.id === activeSessionId)} onClick={openMention} title={ui.mentionSession} type="button">@</button>}
            <button aria-label={isImageMode ? ui.addReference : ui.uploadImage} className={`${TOOL_BUTTON} border-black/20 hover:border-black dark:border-white/20 dark:hover:border-white`} disabled={pendingImages.length >= maxPendingImages} onClick={() => fileInputRef.current?.click()} title={isImageMode ? ui.addReference : ui.uploadImage} type="button"><Icon name="paperclip" className="size-3.5" /></button>
            <button aria-label={isListening ? ui.stopListening : isImageMode ? ui.startImageVoice : ui.startVoiceChat} className={`${TOOL_BUTTON} ${isListening ? 'animate-pulse border-black bg-black text-white dark:bg-white dark:text-black' : 'border-black/20 dark:border-white/20'} disabled:opacity-30`} disabled={!voiceSupported} onClick={onMic} type="button"><Icon name="mic" className="size-3.5" /></button>
            {mode === 'vision' && <span className="text-[9px] font-black uppercase tracking-wider">{ui.visionMode}</span>}
            {isImageMode && pendingImages.length > 0 && <span className="text-[9px] font-black uppercase tracking-wider text-neutral-500">{pendingImages.length}/{maxPendingImages} {ui.references}</span>}
            {!isImageMode && <span className="hidden text-[9px] font-black uppercase tracking-wider text-neutral-500 sm:inline" title={`${ui.contextWindowHint} ~${formatTokens(contextUsage.estimatedTokens)} / ${formatTokens(contextUsage.maxTokens)} token.${contextUsage.omittedMessages ? ` ${contextUsage.omittedMessages} ${ui.olderMessagesExcluded}` : ''}`}>{ui.contextWindow} {contextUsage.percent}%</span>}
          </div>
          {isLoading
            ? <button aria-label={ui.stopGenerating} className="grid size-8 place-items-center rounded-md border-2 border-black bg-black text-white shadow-boo-inverse-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-white dark:bg-white dark:text-black" onClick={onStop} title={ui.stopGenerating} type="button"><Icon name="stop" className="size-3.5" /></button>
            : <button aria-label={isImageMode ? ui.createImage : ui.sendMessage} className="grid size-8 place-items-center rounded-md border-2 border-black bg-black text-white shadow-boo-inverse-sm disabled:cursor-not-allowed disabled:opacity-30 dark:border-white dark:bg-white dark:text-black" disabled={sendDisabled} title={isImageMode ? ui.createImage : ui.sendMessage} type="submit"><Icon name={isImageMode ? 'sparkles' : 'arrow-up'} className="size-3.5" /></button>}
        </div>
      </form>
    </div>
  )
}
