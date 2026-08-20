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
  references?: ChatSessionReference[]
}

export interface ChatModel {
  id: string
  name: string
  provider: string
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

export interface ChatGateway {
  listModels(kind: ModelKind): Promise<ChatModel[]>
  checkConnection(): Promise<GatewayConnection>
  complete(model: string, messages: ChatMessage[]): Promise<string>
  generateImage(model: string, options: ImageGenerationOptions): Promise<ChatImage>
}

export interface ChatHistoryRepository {
  list(): ChatSession[]
  save(session: ChatSession): void
  delete(sessionId: string): void
}
