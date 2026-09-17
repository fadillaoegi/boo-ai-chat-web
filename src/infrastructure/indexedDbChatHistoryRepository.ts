import { FILE_FORMATS } from '../application/fileArtifacts.ts'
import type { ChatFile, ChatHistoryRepository, ChatImage, ChatMessage, ChatSession } from '../domain/chat'

const DB_NAME = 'boo-ai-chat'
const DB_VERSION = 1
const STORE = 'sessions'
/** Riwayat versi lama di localStorage; dipindahkan sekali lalu dihapus. */
export const LEGACY_STORAGE_KEY = 'boo-ai-chat-history:v1'

export const STORAGE_FULL_MESSAGE = 'Penyimpanan browser penuh. Hapus beberapa percakapan lama (terutama yang bergambar) agar riwayat baru bisa disimpan.'

type LegacyStorage = Pick<Storage, 'getItem' | 'removeItem'>

export interface IndexedDbChatHistoryOptions {
  indexedDB?: IDBFactory
  legacyStorage?: LegacyStorage | null
}

function isImage(value: unknown): value is ChatImage {
  if (!value || typeof value !== 'object') return false
  const image = value as Partial<ChatImage>
  return (image.kind === 'upload' || image.kind === 'generated')
    && typeof image.url === 'string'
    && typeof image.alt === 'string'
    && (image.watermarked === undefined || typeof image.watermarked === 'boolean')
}

function isFile(value: unknown): value is ChatFile {
  if (!value || typeof value !== 'object') return false
  const file = value as Partial<ChatFile>
  return typeof file.id === 'string'
    && typeof file.name === 'string'
    && typeof file.content === 'string'
    && FILE_FORMATS.includes(file.format as ChatFile['format'])
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
    && (message.files === undefined || (Array.isArray(message.files) && message.files.every(isFile)))
    && (message.references === undefined || (Array.isArray(message.references) && message.references.every(isSessionReference)))
}

export function isSession(value: unknown): value is ChatSession {
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

function byNewest(a: ChatSession, b: ChatSession): number {
  return b.updatedAt - a.updatedAt
}

function toStorageError(error: DOMException | null): Error {
  if (error?.name === 'QuotaExceededError') return new Error(STORAGE_FULL_MESSAGE)
  return new Error(`Riwayat gagal disimpan: ${error?.message || 'IndexedDB error'}`)
}

function browserLegacyStorage(): LegacyStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export class IndexedDbChatHistoryRepository implements ChatHistoryRepository {
  private readonly factory: IDBFactory | undefined
  private readonly legacyStorage: LegacyStorage | null
  private database: Promise<IDBDatabase> | null = null
  private migration: Promise<void> | null = null

  constructor(options: IndexedDbChatHistoryOptions = {}) {
    this.factory = options.indexedDB ?? globalThis.indexedDB
    this.legacyStorage = options.legacyStorage === undefined ? browserLegacyStorage() : options.legacyStorage
  }

  async list(): Promise<ChatSession[]> {
    await this.migrateLegacyHistory()
    const stored = await this.request<unknown[]>('readonly', (store) => store.getAll())
    return (stored ?? []).filter(isSession).sort(byNewest)
  }

  async save(session: ChatSession): Promise<void> {
    await this.request('readwrite', (store) => store.put(session))
  }

  async delete(sessionId: string): Promise<void> {
    await this.request('readwrite', (store) => store.delete(sessionId))
  }

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (!this.factory) {
        reject(new Error('Browser ini tidak mendukung IndexedDB; riwayat tidak dapat disimpan.'))
        return
      }
      const request = this.factory.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' })
      }
      request.onsuccess = () => {
        const database = request.result
        // Tab lain yang membuka versi skema lebih baru tidak boleh terblokir oleh tab ini.
        database.onversionchange = () => {
          database.close()
          this.database = null
        }
        resolve(database)
      }
      request.onerror = () => reject(toStorageError(request.error))
    }).catch((error: unknown) => {
      this.database = null
      throw error
    })
    return this.database
  }

  private async request<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
    const database = await this.open()
    return new Promise<T | undefined>((resolve, reject) => {
      let transaction: IDBTransaction
      let request: IDBRequest
      try {
        transaction = database.transaction(STORE, mode)
        request = operation(transaction.objectStore(STORE))
      } catch (error) {
        reject(toStorageError(error instanceof DOMException ? error : null))
        return
      }
      transaction.oncomplete = () => resolve(request.result as T)
      transaction.onerror = () => reject(toStorageError(transaction.error ?? request.error))
      transaction.onabort = () => reject(toStorageError(transaction.error))
    })
  }

  private migrateLegacyHistory(): Promise<void> {
    this.migration ??= this.runLegacyMigration().catch((error: unknown) => {
      // Data lama tetap di localStorage, jadi migrasi dicoba lagi pada pemanggilan berikutnya.
      this.migration = null
      console.error('[boo-history] Migrasi riwayat lama gagal.', error)
    })
    return this.migration
  }

  private async runLegacyMigration(): Promise<void> {
    const raw = this.legacyStorage?.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = []
    }
    const legacySessions = Array.isArray(parsed) ? parsed.filter(isSession) : []

    if (legacySessions.length) {
      const existing = await this.request<unknown[]>('readonly', (store) => store.getAll())
      const existingUpdatedAt = new Map((existing ?? []).filter(isSession).map((session) => [session.id, session.updatedAt]))
      const database = await this.open()
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE, 'readwrite')
        const store = transaction.objectStore(STORE)
        legacySessions
          .filter((session) => (existingUpdatedAt.get(session.id) ?? -1) < session.updatedAt)
          .forEach((session) => store.put(session))
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(toStorageError(transaction.error))
        transaction.onabort = () => reject(toStorageError(transaction.error))
      })
    }

    this.legacyStorage?.removeItem(LEGACY_STORAGE_KEY)
    console.info(`[boo-history] ${legacySessions.length} percakapan dipindahkan dari localStorage ke IndexedDB.`)
  }
}
