import type { ChatMessage, ChatModel, ChatSession, ChatSessionReference } from '../domain/chat'
import { messageTextWithFiles } from './fileArtifacts.ts'

/** Dipakai jika 9Router tidak melaporkan panjang konteks model. */
export const DEFAULT_INPUT_CONTEXT_TOKENS = 32_000
/** Batas atas demi biaya dan latensi, walau model sanggup 1 juta token. */
export const MAX_INPUT_CONTEXT_TOKENS = 200_000
export const MAX_REFERENCE_CONTEXT_TOKENS = 24_000
export const MAX_SESSION_REFERENCES = 3
/** Gambar unggahan terbaru yang dikirim ulang; yang lebih lama diganti catatan teks. */
export const MAX_CONTEXT_IMAGES = 4

const RESPONSE_RESERVE_TOKENS = 16_000
// Estimasi 4 karakter per token bisa meleset untuk kode dan bahasa Indonesia.
const CONTEXT_SAFETY_RATIO = 0.75

const APPROXIMATE_CHARS_PER_TOKEN = 4
const MESSAGE_OVERHEAD_TOKENS = 8
const IMAGE_ESTIMATE_TOKENS = 800

export interface ContextSelection {
  messages: ChatMessage[]
  estimatedTokens: number
  omittedMessages: number
  truncated: boolean
}

export interface ContextUsage {
  estimatedTokens: number
  maxTokens: number
  percent: number
  omittedMessages: number
}

export interface ReferenceContext {
  content: string
  estimatedTokens: number
  includedSessionIds: string[]
}

export function contextBudgetForModel(model?: Pick<ChatModel, 'contextLength' | 'maxOutputTokens'>): number {
  if (!model?.contextLength) return DEFAULT_INPUT_CONTEXT_TOKENS
  const reserve = Math.min(model.maxOutputTokens ?? RESPONSE_RESERVE_TOKENS, RESPONSE_RESERVE_TOKENS)
  const budget = Math.floor(model.contextLength * CONTEXT_SAFETY_RATIO) - reserve
  return Math.min(MAX_INPUT_CONTEXT_TOKENS, Math.max(Math.floor(model.contextLength / 2), budget))
}

export function referenceBudgetFor(inputBudget: number): number {
  return Math.min(MAX_REFERENCE_CONTEXT_TOKENS, Math.floor(inputBudget / 4))
}

export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / APPROXIMATE_CHARS_PER_TOKEN)
}

export function estimateMessageTokens(message: ChatMessage): number {
  const images = message.images?.length ?? (message.image ? 1 : 0)
  return MESSAGE_OVERHEAD_TOKENS + estimateTextTokens(messageTextWithFiles(message)) + (images * IMAGE_ESTIMATE_TOKENS)
}

function truncateText(text: string, maxTokens: number): string {
  const maxCharacters = Math.max(0, maxTokens * APPROXIMATE_CHARS_PER_TOKEN)
  if (text.length <= maxCharacters) return text
  if (maxCharacters <= 1) return text.slice(0, maxCharacters)

  const marker = '\n[… context truncated …]\n'
  if (maxCharacters <= marker.length + 2) return text.slice(0, maxCharacters)
  const contentCharacters = maxCharacters - marker.length
  const startCharacters = Math.ceil(contentCharacters * 0.7)
  const endCharacters = contentCharacters - startCharacters
  return `${text.slice(0, startCharacters)}${marker}${text.slice(-endCharacters)}`
}

function truncateMessage(message: ChatMessage, tokenBudget: number): ChatMessage | null {
  const images = message.images?.length ?? (message.image ? 1 : 0)
  const fixedTokens = MESSAGE_OVERHEAD_TOKENS + (images * IMAGE_ESTIMATE_TOKENS)
  if (fixedTokens >= tokenBudget) return null
  return { ...message, content: truncateText(messageTextWithFiles(message), tokenBudget - fixedTokens), files: undefined }
}

export function selectContextMessages(
  messages: ChatMessage[],
  tokenBudget = DEFAULT_INPUT_CONTEXT_TOKENS,
): ContextSelection {
  const budget = Math.max(0, Math.floor(tokenBudget))
  const selected: ChatMessage[] = []
  let estimatedTokens = 0
  let truncated = false

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    const messageTokens = estimateMessageTokens(message)
    if (estimatedTokens + messageTokens <= budget) {
      selected.push(message)
      estimatedTokens += messageTokens
      continue
    }

    if (!selected.length) {
      const shortened = truncateMessage(message, budget)
      if (shortened) {
        selected.push(shortened)
        estimatedTokens = estimateMessageTokens(shortened)
        truncated = shortened.content !== messageTextWithFiles(message)
      }
    }
    break
  }

  selected.reverse()
  return {
    messages: selected,
    estimatedTokens,
    omittedMessages: messages.length - selected.length,
    truncated,
  }
}

/**
 * Hanya gambar unggahan terbaru yang dikirim ulang. Tanpa batas ini, konteks besar bisa membawa
 * puluhan gambar base64 (hingga ~900 KB masing-masing) di setiap request.
 */
export function limitContextImages(messages: ChatMessage[], maxImages = MAX_CONTEXT_IMAGES): ChatMessage[] {
  let remaining = maxImages
  return messages.slice().reverse().map((message) => {
    const images = message.images?.length ? message.images : message.image ? [message.image] : []
    const uploads = images.filter((image) => image.kind === 'upload')
    if (!uploads.length) return message
    const kept = uploads.slice(0, Math.max(0, remaining))
    remaining -= kept.length
    const omitted = uploads.length - kept.length
    if (!omitted) return message
    return {
      ...message,
      image: undefined,
      images: [...images.filter((image) => image.kind !== 'upload'), ...kept],
      content: `${message.content}\n\n[${omitted} earlier image attachment${omitted === 1 ? '' : 's'} omitted]`,
    }
  }).reverse()
}

export function getContextUsage(messages: ChatMessage[], maxTokens = DEFAULT_INPUT_CONTEXT_TOKENS): ContextUsage {
  const totalTokens = messages.reduce((total, message) => total + estimateMessageTokens(message), 0)
  const selection = selectContextMessages(messages, maxTokens)
  return {
    estimatedTokens: Math.min(totalTokens, maxTokens),
    maxTokens,
    percent: Math.min(100, Math.round((totalTokens / maxTokens) * 100)),
    omittedMessages: selection.omittedMessages,
  }
}

function formatReferenceMessage(message: ChatMessage): string {
  const role = message.role === 'user' ? 'User' : 'Assistant'
  const images = message.images?.length ?? (message.image ? 1 : 0)
  const attachment = images ? ` [${images} image attachment${images === 1 ? '' : 's'} omitted]` : ''
  return `${role}: ${messageTextWithFiles(message)}${attachment}`
}

export function buildReferenceContext(
  sessions: ChatSession[],
  references: ChatSessionReference[],
  tokenBudget = MAX_REFERENCE_CONTEXT_TOKENS,
): ReferenceContext {
  const uniqueIds = [...new Set(references.map((reference) => reference.sessionId))]
    .slice(0, MAX_SESSION_REFERENCES)
  const referencedSessions = uniqueIds
    .map((sessionId) => sessions.find((session) => session.id === sessionId))
    .filter((session): session is ChatSession => Boolean(session?.messages.length))

  const blocks: string[] = []
  const includedSessionIds: string[] = []
  let remainingTokens = Math.max(0, Math.floor(tokenBudget))

  referencedSessions.forEach((session, index) => {
    const remainingSessions = referencedSessions.length - index
    const allocation = Math.floor(remainingTokens / remainingSessions)
    const header = `Referenced conversation: ${session.title}`
    const headerTokens = estimateTextTokens(header) + MESSAGE_OVERHEAD_TOKENS
    if (allocation <= headerTokens) return

    const selection = selectContextMessages(session.messages, allocation - headerTokens)
    if (!selection.messages.length) return

    const block = `${header}\n${selection.messages.map(formatReferenceMessage).join('\n')}`
    const limitedBlock = truncateText(block, allocation)
    const blockTokens = estimateTextTokens(limitedBlock)
    blocks.push(limitedBlock)
    includedSessionIds.push(session.id)
    remainingTokens -= blockTokens
  })

  const content = blocks.join('\n\n---\n\n')
  return {
    content,
    estimatedTokens: estimateTextTokens(content),
    includedSessionIds,
  }
}
