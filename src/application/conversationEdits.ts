import type { ChatImage, ChatMessage, ChatMode } from '../domain/chat'

export interface TurnPlan {
  /** Pesan sebelum pesan pengguna yang dikirim ulang. */
  history: ChatMessage[]
  userMessage: ChatMessage
  mode: ChatMode
  /** Jumlah pesan lama setelah pesan pengguna yang akan diganti jawaban baru. */
  replacedCount: number
}

function messageImages(message: ChatMessage): ChatImage[] {
  if (message.images?.length) return message.images
  return message.image ? [message.image] : []
}

/**
 * Mode request mengikuti jawaban yang diganti: jawaban bergambar dibuat ulang sebagai gambar,
 * sisanya sebagai chat (atau vision jika pesan pengguna membawa gambar unggahan). Tanpa jawaban
 * (request sebelumnya gagal), pakai mode yang sedang aktif.
 */
export function requestModeFor(userMessage: ChatMessage, replacedAnswer: ChatMessage | undefined, activeMode: ChatMode): ChatMode {
  if (replacedAnswer && messageImages(replacedAnswer).some((image) => image.kind === 'generated')) return 'image'
  if (!replacedAnswer && activeMode === 'image') return 'image'
  return messageImages(userMessage).some((image) => image.kind === 'upload') ? 'vision' : 'chat'
}

/** Regenerate jawaban terakhir, atau coba lagi jika pesan terakhir masih pesan pengguna. */
export function planRegenerate(messages: ChatMessage[], activeMode: ChatMode): TurnPlan | null {
  const last = messages.at(-1)
  const replacedAnswer = last?.role === 'assistant' ? last : undefined
  const userIndex = messages.length - (replacedAnswer ? 2 : 1)
  const userMessage = messages[userIndex]
  if (!userMessage || userMessage.role !== 'user') return null
  return {
    history: messages.slice(0, userIndex),
    userMessage,
    mode: requestModeFor(userMessage, replacedAnswer, activeMode),
    replacedCount: replacedAnswer ? 1 : 0,
  }
}

/** Ganti isi pesan pengguna; semua pesan setelahnya dibuang dan dijawab ulang. */
export function planEdit(messages: ChatMessage[], messageId: string, content: string, activeMode: ChatMode): TurnPlan | null {
  const index = messages.findIndex((message) => message.id === messageId)
  const original = messages[index]
  const cleanContent = content.trim()
  if (!original || original.role !== 'user' || !cleanContent) return null
  const next = messages[index + 1]
  return {
    history: messages.slice(0, index),
    userMessage: { ...original, content: cleanContent },
    mode: requestModeFor(original, next?.role === 'assistant' ? next : undefined, activeMode),
    replacedCount: messages.length - index - 1,
  }
}
