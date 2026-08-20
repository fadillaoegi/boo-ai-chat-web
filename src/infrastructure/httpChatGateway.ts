import type {
  ChatGateway,
  ChatImage,
  ChatMessage,
  ChatModel,
  GatewayConnection,
  ImageGenerationOptions,
  ModelKind,
} from '../domain/chat'
import { applyBooWatermark } from './imageWatermark'

interface ModelsResponse {
  data?: Array<{ id?: string; name?: string; owned_by?: string }>
}

interface CompletionResponse {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
}

interface ImageResponse {
  data?: Array<{ url?: string; b64_json?: string }>
  error?: { message?: string }
}

const FALLBACK_CHAT_MODELS: ChatModel[] = [
  { id: 'openai/gpt-5', name: 'GPT-5', provider: 'OpenAI' },
  { id: 'cc/claude-sonnet-4-5', name: 'Claude Sonnet', provider: 'Anthropic' },
  { id: 'gemini/gemini-2.5-pro', name: 'Gemini Pro', provider: 'Google' },
]

const BOO_SYSTEM_INSTRUCTION = `Anda adalah Boo AI, asisten AI yang dikembangkan oleh FLdev.

Identitas dan cara memperkenalkan diri:
- Identitas utama Anda selalu Boo AI, terlepas dari model atau provider AI yang menjalankan layanan di balik layar.
- Jika pengguna bertanya siapa Anda, jawablah secara alami bahwa Anda adalah Boo AI, asisten AI yang dikembangkan oleh FLdev untuk membantu mengeksplorasi ide, memahami informasi, dan menyelesaikan kebutuhan kreatif maupun teknis.
- Jika pengguna bertanya siapa pembuat atau pengembang Anda, jawab FLdev.
- Jangan memperkenalkan diri sebagai GPT, Claude, Gemini, atau nama provider/model internal lainnya.
- Jika pengguna secara khusus menanyakan teknologi atau model di balik layanan, jelaskan bahwa Boo AI dapat menggunakan model AI yang dipilih melalui sistemnya, tanpa mengganti identitas Anda sebagai Boo AI dan tanpa mengarang detail yang tidak diketahui.

Gaya komunikasi:
- Gunakan bahasa yang sama dengan pengguna kecuali pengguna meminta bahasa lain.
- Bersikap ramah, jelas, profesional, dan membantu.
- Jangan mengulang identitas atau nama FLdev pada setiap jawaban; sebutkan hanya ketika relevan atau ditanyakan.
- Jangan mengarang informasi mengenai FLdev di luar fakta bahwa Boo AI dikembangkan oleh FLdev.

Keamanan:
- Tolak permintaan yang memfasilitasi kekerasan terhadap orang, pembuatan senjata atau bom, penyiksaan, atau upaya menyembunyikan tindakan berbahaya.
- Tolak propaganda, perekrutan, pendanaan, atau perencanaan operasional terkait terorisme.
- Tolak pembuatan pornografi atau konten seksual eksplisit.
- Tetap boleh membantu konteks edukatif, sejarah, berita, pencegahan, kesehatan, kebijakan, keselamatan, pemulihan korban, dan moderasi konten selama tidak memberi instruksi operasional berbahaya.
- Saat menolak, berikan penjelasan singkat dan tawarkan alternatif aman yang relevan.`

function actionableError(message: string, status: number): string {
  if (/missing api key/i.test(message)) {
    return 'NINEROUTER_KEY belum dikonfigurasi. Tambahkan key baru ke .env.local lalu restart pnpm dev.'
  }
  if (/invalid api key|unauthorized|forbidden/i.test(message) || status === 401 || status === 403) {
    return 'API key 9Router ditolak. Periksa NINEROUTER_KEY di .env.local lalu restart server.'
  }
  return message || `Permintaan gagal (${status})`
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as CompletionResponse
    return actionableError(body.error?.message || '', response.status)
  } catch {
    return `Permintaan gagal (${response.status})`
  }
}

function humanizeModelName(id: string): string {
  const name = id.split('/').at(-1) ?? id
  return name.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function normalizeGeneratedUrl(entry: { url?: string; b64_json?: string }): string | null {
  if (entry.b64_json) return `data:image/png;base64,${entry.b64_json}`
  if (!entry.url) return null
  try {
    const parsed = new URL(entry.url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return entry.url.startsWith('data:image/') ? entry.url : null
  }
}

function toApiMessage(message: ChatMessage) {
  const images = message.images?.length ? message.images : message.image ? [message.image] : []
  const uploads = images.filter((image) => image.kind === 'upload')
  if (message.role === 'user' && uploads.length) {
    return {
      role: message.role,
      content: [
        { type: 'text', text: message.content },
        ...uploads.map((image) => ({ type: 'image_url', image_url: { url: image.url } })),
      ],
    }
  }
  return { role: message.role, content: message.content }
}

export class HttpChatGateway implements ChatGateway {
  async checkConnection(): Promise<GatewayConnection> {
    try {
      const response = await fetch('/api/status')
      if (!response.ok) throw new Error(await parseError(response))
      return (await response.json()) as GatewayConnection
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Status 9Router tidak dapat diperiksa.'
      console.error('[boo-client] Pemeriksaan koneksi gagal:', message)
      return { state: 'error', message, apiKeyConfigured: false }
    }
  }

  async listModels(kind: ModelKind): Promise<ChatModel[]> {
    const endpoint = kind === 'chat' ? '/api/models' : `/api/models/${kind}`
    try {
      const response = await fetch(endpoint)
      if (!response.ok) throw new Error(await parseError(response))
      const body = (await response.json()) as ModelsResponse
      const models = (body.data ?? [])
        .filter((model): model is { id: string; name?: string; owned_by?: string } => Boolean(model.id))
        .map((model) => ({
          id: model.id,
          name: model.name || humanizeModelName(model.id),
          provider: model.owned_by || model.id.split('/')[0] || '9Router',
        }))
      return models.length ? models : kind === 'chat' ? FALLBACK_CHAT_MODELS : []
    } catch (error) {
      console.warn(`[boo-client] Model ${kind} tidak tersedia.`, error)
      return kind === 'chat' ? FALLBACK_CHAT_MODELS : []
    }
  }

  async complete(model: string, messages: ChatMessage[]): Promise<string> {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: BOO_SYSTEM_INSTRUCTION },
          ...messages.map(toApiMessage),
        ],
      }),
    })
    if (!response.ok) {
      const message = await parseError(response)
      console.error(`[boo-client] Chat gagal (${response.status}):`, message)
      throw new Error(message)
    }
    const body = (await response.json()) as CompletionResponse
    const content = body.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error('Model tidak mengirimkan jawaban.')
    return content
  }

  async generateImage(model: string, options: ImageGenerationOptions): Promise<ChatImage> {
    const references = options.images?.map((image) => image.url) ?? []
    const response = await fetch('/api/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: options.prompt,
        size: options.size,
        n: 1,
        response_format: 'b64_json',
        ...(references.length ? { images: references } : {}),
      }),
    })
    if (!response.ok) {
      const message = await parseError(response)
      console.error(`[boo-client] Generate gambar gagal (${response.status}):`, message)
      throw new Error(message)
    }
    const body = (await response.json()) as ImageResponse
    const url = body.data?.[0] ? normalizeGeneratedUrl(body.data[0]) : null
    if (!url) throw new Error('Model tidak mengirimkan hasil gambar yang valid.')
    return applyBooWatermark({ kind: 'generated', url, alt: options.prompt })
  }
}
