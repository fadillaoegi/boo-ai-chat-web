import type { ChatHistoryRepository, ChatImage, ChatMessage, ChatSession } from '../domain/chat'

const STORAGE_KEY = 'boo-ai-chat-history:v1'
const MAX_SESSIONS = 50

function isImage(value: unknown): value is ChatImage {
  if (!value || typeof value !== 'object') return false
  const image = value as Partial<ChatImage>
  return (image.kind === 'upload' || image.kind === 'generated')
    && typeof image.url === 'string'
    && typeof image.alt === 'string'
    && (image.watermarked === undefined || typeof image.watermarked === 'boolean')
}

function isSessionReference(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const reference = value as { sessionId?: unknown; title?: unknown }
  return typeof reference.sessionId === 'string' && typeof reference.title === 'string'
}

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<ChatMessage>
  return typeof message.id === 'string'
    && (message.role === 'user' || message.role === 'assistant')
    && typeof message.content === 'string'
    && (message.image === undefined || isImage(message.image))
    && (message.images === undefined || (Array.isArray(message.images) && message.images.every(isImage)))
    && (message.references === undefined || (Array.isArray(message.references) && message.references.every(isSessionReference)))
}

function isSession(value: unknown): value is ChatSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<ChatSession>
  return typeof session.id === 'string'
    && typeof session.title === 'string'
    && typeof session.modelId === 'string'
    && (session.mode === undefined || session.mode === 'chat' || session.mode === 'vision' || session.mode === 'image')
    && Array.isArray(session.messages)
    && session.messages.every(isMessage)
    && typeof session.createdAt === 'number'
    && typeof session.updatedAt === 'number'
}

export class LocalChatHistoryRepository implements ChatHistoryRepository {
  list(): ChatSession[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return []
      const parsed: unknown = JSON.parse(stored)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isSession).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSIONS)
    } catch (error) {
      console.error('[boo-history] Gagal membaca riwayat lokal.', error)
      return []
    }
  }

  save(session: ChatSession): void {
    const sessions = [session, ...this.list().filter((item) => item.id !== session.id)]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SESSIONS)

    for (let count = sessions.length; count > 0; count -= 1) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, count)))
        return
      } catch {
        // Reduce old sessions until the browser quota accepts the image cache.
      }
    }
    console.error('[boo-history] Penyimpanan browser penuh; sesi bergambar tidak dapat disimpan.')
  }

  delete(sessionId: string): void {
    try {
      const sessions = this.list().filter((session) => session.id !== sessionId)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
    } catch (error) {
      console.error('[boo-history] Gagal menghapus riwayat lokal.', error)
    }
  }
}
