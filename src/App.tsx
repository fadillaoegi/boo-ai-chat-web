import { useEffect, useMemo, useState } from 'react'
import { MAX_SESSION_REFERENCES } from './application/chatContext'
import { useChat } from './application/useChat'
import type { ChatFile, ChatImage, ChatMessage, ChatMode, ChatSession, ChatSessionReference } from './domain/chat'
import { createFileBlob, downloadChatFile } from './infrastructure/fileExport'
import { HttpChatGateway } from './infrastructure/httpChatGateway'
import { prepareImageUpload } from './infrastructure/imageProcessing'
import { IndexedDbChatHistoryRepository } from './infrastructure/indexedDbChatHistoryRepository'
import { useBrowserVoice } from './infrastructure/useBrowserVoice'
import { ChatHeader } from './presentation/ChatHeader'
import { ChatMessageItem } from './presentation/ChatMessageItem'
import { Composer } from './presentation/Composer'
import { RetryNotice, ThinkingIndicator } from './presentation/ConversationStatus'
import { EmptyState } from './presentation/EmptyState'
import { FilePreviewDialog } from './presentation/FilePreview'
import { UI_TEXT } from './presentation/i18n'
import { ImagePreviewDialog } from './presentation/ImagePreviewDialog'
import { DeleteSessionDialog, RenameSessionDialog } from './presentation/SessionDialogs'
import { Sidebar } from './presentation/Sidebar'
import { useLanguage, useTheme } from './presentation/usePreferences'
import { useStickToBottom } from './presentation/useStickToBottom'
import './App.css'

const MAX_PENDING_IMAGES = 4

function App() {
  const gateway = useMemo(() => new HttpChatGateway(), [])
  const historyRepository = useMemo(() => new IndexedDbChatHistoryRepository(), [])
  const chat = useChat(gateway, historyRepository)
  const { messages, sessions, activeSessionId, mode, selectedModel, streamingMessage, isLoading, error } = chat
  const [language, setLanguage] = useLanguage()
  const [theme, setTheme] = useTheme()
  const ui = UI_TEXT[language]
  const voice = useBrowserVoice(language)

  const [draft, setDraft] = useState('')
  const [pendingImages, setPendingImages] = useState<ChatImage[]>([])
  const [sessionReferences, setSessionReferences] = useState<ChatSessionReference[]>([])
  const [uploadError, setUploadError] = useState('')
  const [imageSize, setImageSize] = useState('1024x1024')
  const [voiceMode, setVoiceMode] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarHidden, setSidebarHidden] = useState(false)
  const [sessionToRename, setSessionToRename] = useState<ChatSession | null>(null)
  const [sessionToDelete, setSessionToDelete] = useState<ChatSession | null>(null)
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<ChatImage | null>(null)
  const [previewFile, setPreviewFile] = useState<ChatFile | null>(null)

  const followConversation = useStickToBottom(`${messages.length}:${messages.at(-1)?.id ?? ''}`, isLoading, streamingMessage)
  const isImageMode = mode === 'image'
  const canRetry = !isLoading && !editingMessageId && messages.at(-1)?.role === 'user'
  const referenceModelError = isImageMode && pendingImages.length > 1 && !selectedModel.startsWith('cx/')
    ? ui.referenceModelError
    : ''
  const visibleMessages = streamingMessage ? [...messages, streamingMessage] : messages

  useEffect(() => {
    if (!sessionToRename && !sessionToDelete && !previewImage && !previewFile) return
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setSessionToRename(null)
      setSessionToDelete(null)
      setPreviewImage(null)
      setPreviewFile(null)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [previewFile, previewImage, sessionToDelete, sessionToRename])

  function speakAnswer(answer: string | null, shouldSpeak = voiceMode) {
    if (answer && shouldSpeak && !isImageMode) voice.speak(answer)
  }

  function resetComposer() {
    setDraft('')
    setPendingImages([])
    setSessionReferences([])
    setUploadError('')
  }

  function stopReading() {
    voice.stopSpeaking()
    setSpeakingMessageId(null)
  }

  async function deliver(text: string, shouldSpeak = voiceMode) {
    const fallbackPrompt = pendingImages.length ? (isImageMode ? ui.fallbackMergePrompt : ui.fallbackVisionPrompt) : ''
    const prompt = text.trim() || fallbackPrompt
    if (!prompt || isLoading || referenceModelError) return
    const images = pendingImages
    const references = sessionReferences
    resetComposer()
    followConversation()
    speakAnswer(await chat.sendMessage(prompt, images, imageSize, language, references), shouldSpeak)
  }

  async function submitEdit(messageId: string, content: string) {
    if (isLoading) return
    setEditingMessageId(null)
    followConversation()
    speakAnswer(await chat.editMessage(messageId, content, imageSize, language))
  }

  async function regenerate() {
    followConversation()
    speakAnswer(await chat.regenerateLast(imageSize, language))
  }

  function handleMic() {
    if (voice.isListening) {
      voice.stopListening()
      return
    }
    if (!isImageMode) setVoiceMode(true)
    voice.startListening((transcript) => void deliver(transcript, true))
  }

  function handleModeChange(nextMode: ChatMode) {
    setPendingImages([])
    setSessionReferences([])
    setUploadError('')
    chat.setMode(nextMode)
  }

  async function addImages(files: File[]) {
    const availableSlots = MAX_PENDING_IMAGES - pendingImages.length
    if (availableSlots <= 0) {
      setUploadError(ui.maxReferences)
      return
    }
    try {
      const prepared: ChatImage[] = []
      for (const file of files.slice(0, availableSlots)) prepared.push(await prepareImageUpload(file))
      setPendingImages((current) => [...current, ...prepared].slice(0, MAX_PENDING_IMAGES))
      if (!isImageMode) chat.setMode('vision')
      setUploadError(files.length > availableSlots ? ui.maxReferences : '')
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : ui.imageProcessingError)
    }
  }

  function removePendingImage(index: number) {
    const nextImages = pendingImages.filter((_, imageIndex) => imageIndex !== index)
    setPendingImages(nextImages)
    setUploadError('')
    if (!nextImages.length && mode === 'vision') chat.setMode('chat')
  }

  function addSessionReference(session: ChatSession) {
    setSessionReferences((current) => current.length >= MAX_SESSION_REFERENCES || current.some((reference) => reference.sessionId === session.id)
      ? current
      : [...current, { sessionId: session.id, title: session.title }])
  }

  function toggleMessageSpeech(message: ChatMessage) {
    if (speakingMessageId === message.id) {
      stopReading()
      return
    }
    setSpeakingMessageId(message.id)
    voice.speak(message.content, () => {
      setSpeakingMessageId((current) => current === message.id ? null : current)
    })
  }

  function switchConversation(open: () => void) {
    stopReading()
    open()
    setEditingMessageId(null)
    resetComposer()
    setSidebarOpen(false)
  }

  function renameSession(title: string) {
    if (!sessionToRename) return
    chat.renameSession(sessionToRename.id, title)
    const cleanTitle = title.replace(/\s+/g, ' ').trim()
    setSessionReferences((current) => current.map((reference) => reference.sessionId === sessionToRename.id
      ? { ...reference, title: cleanTitle }
      : reference))
    setSessionToRename(null)
  }

  function deleteSession() {
    if (!sessionToDelete || (isLoading && activeSessionId === sessionToDelete.id)) return
    chat.deleteSession(sessionToDelete.id)
    setSessionReferences((current) => current.filter((reference) => reference.sessionId !== sessionToDelete.id))
    if (activeSessionId === sessionToDelete.id) {
      stopReading()
      resetComposer()
    }
    setSessionToDelete(null)
  }

  return (
    <div className="min-h-dvh bg-[#f3f3f1] text-black transition-colors duration-300 dark:bg-[#0d0d0d] dark:text-white">
      {previewImage && <ImagePreviewDialog image={previewImage} key={previewImage.url} onClose={() => setPreviewImage(null)} ui={ui} />}
      {previewFile && <FilePreviewDialog createBlob={createFileBlob} file={previewFile} key={previewFile.id} onClose={() => setPreviewFile(null)} onDownload={downloadChatFile} ui={ui} />}
      {sessionToRename && <RenameSessionDialog initialTitle={sessionToRename.title} key={sessionToRename.id} onCancel={() => setSessionToRename(null)} onSave={renameSession} ui={ui} />}
      {sessionToDelete && <DeleteSessionDialog deleteDisabled={isLoading && activeSessionId === sessionToDelete.id} onCancel={() => setSessionToDelete(null)} onConfirm={deleteSession} title={sessionToDelete.title} ui={ui} />}

      <Sidebar
        activeSessionId={activeSessionId}
        deleteLockedSessionId={isLoading ? activeSessionId : null}
        hidden={sidebarHidden}
        historyReady={chat.historyReady}
        language={language}
        logs={chat.logs}
        onClose={() => setSidebarOpen(false)}
        onDeleteSession={setSessionToDelete}
        onHide={() => setSidebarHidden(true)}
        onNewChat={() => switchConversation(chat.startNewChat)}
        onOpenSession={(sessionId) => switchConversation(() => chat.openSession(sessionId))}
        onRenameSession={setSessionToRename}
        open={sidebarOpen}
        sessions={sessions}
        ui={ui}
      />

      <main className={`flex min-h-dvh flex-col transition-[padding] duration-300 ${sidebarHidden ? 'lg:pl-0' : 'lg:pl-[280px]'}`}>
        <ChatHeader
          language={language}
          models={chat.models}
          onLanguageChange={setLanguage}
          onModelChange={chat.setSelectedModel}
          onOpenSidebar={() => setSidebarOpen(true)}
          onShowSidebar={() => setSidebarHidden(false)}
          onToggleTheme={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
          onToggleVoiceReplies={() => setVoiceMode((current) => !current)}
          selectedModel={selectedModel}
          showOpenSidebar={!sidebarOpen}
          showShowSidebar={sidebarHidden}
          speechSupported={voice.isSpeechSupported}
          theme={theme}
          ui={ui}
          voiceReplies={voiceMode}
        />

        <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 sm:px-8">
          {!messages.length ? <EmptyState imageMode={isImageMode} ui={ui} /> : (
            <div className="flex-1 space-y-7 py-8 sm:py-12">
              {visibleMessages.map((message, index) => {
                const isStreaming = message.id === streamingMessage?.id
                return (
                  <ChatMessageItem
                    isEditing={message.id === editingMessageId}
                    isLastAnswer={message.role === 'assistant' && !isStreaming && index === messages.length - 1}
                    isLoading={isLoading}
                    isSpeaking={speakingMessageId === message.id}
                    isStreaming={isStreaming}
                    key={message.id}
                    laterMessages={messages.length - index - 1}
                    message={message}
                    onCancelEdit={() => setEditingMessageId(null)}
                    onDownloadFile={downloadChatFile}
                    onPreviewFile={setPreviewFile}
                    onPreviewImage={setPreviewImage}
                    onRegenerate={() => void regenerate()}
                    onStartEdit={(item) => setEditingMessageId(item.id)}
                    onSubmitEdit={(messageId, content) => void submitEdit(messageId, content)}
                    onToggleSpeech={toggleMessageSpeech}
                    speechSupported={voice.isSpeechSupported}
                    ui={ui}
                  />
                )
              })}
              {canRetry && <RetryNotice message={error || ui.noAnswer} onRetry={() => void regenerate()} ui={ui} />}
              {isLoading && !streamingMessage && <ThinkingIndicator ui={ui} />}
            </div>
          )}

          <Composer
            activeSessionId={activeSessionId}
            contextUsage={chat.contextUsage}
            draft={draft}
            errorMessage={uploadError || referenceModelError || (canRetry ? '' : error)}
            imageSize={imageSize}
            isListening={voice.isListening}
            isLoading={isLoading}
            language={language}
            maxPendingImages={MAX_PENDING_IMAGES}
            maxReferences={MAX_SESSION_REFERENCES}
            mode={mode}
            onAddImages={(files) => void addImages(files)}
            onAddReference={addSessionReference}
            onDraftChange={setDraft}
            onImageSizeChange={setImageSize}
            onMic={handleMic}
            onModeChange={handleModeChange}
            onPreviewImage={setPreviewImage}
            onRemoveImage={removePendingImage}
            onRemoveReference={(sessionId) => setSessionReferences((current) => current.filter((reference) => reference.sessionId !== sessionId))}
            onStop={chat.stopGeneration}
            onSubmit={() => void deliver(draft)}
            pendingImages={pendingImages}
            references={sessionReferences}
            sendDisabled={(!draft.trim() && !pendingImages.length) || Boolean(referenceModelError) || !selectedModel}
            sessions={sessions}
            ui={ui}
            voiceSupported={voice.isSupported}
          />
        </section>
      </main>
    </div>
  )
}

export default App
