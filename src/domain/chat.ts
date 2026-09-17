export type MessageRole = 'user' | 'assistant'
export type ChatMode = 'chat' | 'vision' | 'image'
export type ModelKind = 'chat' | 'vision' | 'image'

export interface ChatImage {
  kind: 'upload' | 'generated'
  url: string
  alt: string
  mimeType?: string
  name?: string
  watermarked?: boolean
}

export type ChatFileFormat = 'pdf' | 'docx' | 'md' | 'txt' | 'csv' | 'json' | 'html'

export interface ChatFile {
  id: string
  name: string
  format: ChatFileFormat
  content: string
}

export interface ChatSessionReference {
  sessionId: string
  title: string
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  image?: ChatImage
  images?: ChatImage[]
  files?: ChatFile[]
  references?: ChatSessionReference[]
}

export interface ChatModel {
  id: string
  name: string
  provider: string
  /** Panjang konteks model dalam token, jika dilaporkan 9Router. */
  contextLength?: number
  /** Batas token jawaban model, jika dilaporkan 9Router. */
  maxOutputTokens?: number
}

export interface ChatSession {
  id: string
  title: string
  modelId: string
  mode?: ChatMode
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface ImageGenerationOptions {
  prompt: string
  size: string
  images?: ChatImage[]
}

export type ConnectionState = 'checking' | 'connected' | 'misconfigured' | 'error'

export interface GatewayConnection {
  state: ConnectionState
  message: string
  apiKeyConfigured: boolean
}

export interface CompletionOptions {
  signal?: AbortSignal
  /** Dipanggil setiap potongan jawaban tiba, dengan seluruh teks yang terkumpul sejauh ini. */
  onText?: (text: string) => void
}

export interface ChatGateway {
  listModels(kind: ModelKind): Promise<ChatModel[]>
  checkConnection(): Promise<GatewayConnection>
  complete(model: string, messages: ChatMessage[], options?: CompletionOptions): Promise<string>
  generateImage(model: string, options: ImageGenerationOptions, signal?: AbortSignal): Promise<ChatImage>
}

export interface ChatHistoryRepository {
  list(): Promise<ChatSession[]>
  save(session: ChatSession): Promise<void>
  delete(sessionId: string): Promise<void>
}
