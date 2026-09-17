/**
 * Memeriksa apakah 9Router meneruskan function calling dengan utuh.
 *
 * Wajib dijalankan ulang setiap kali menambah provider atau mengganti versi
 * 9Router: dukungan tool calling berbeda-beda per provider dan bisa berubah
 * tanpa pemberitahuan. Agent Boo tidak bisa dibangun di atas model yang gagal
 * di sini.
 *
 *   pnpm check:tools                      # model kurasi
 *   pnpm check:tools ag/claude-sonnet-4-6 # model tertentu
 *   pnpm check:tools --all                # semua model yang terdaftar
 *
 * Tiga lapis pemeriksaan:
 *   1. emit   — model mengeluarkan tool_calls dengan arguments JSON valid
 *   2. stream — arguments tetap utuh setelah disambung dari chunk SSE
 *   3. loop   — model menerima hasil tool dan melanjutkan jawaban
 */

const BASE = process.env.NINEROUTER_URL ?? 'http://localhost:20128'
const KEY = process.env.NINEROUTER_KEY
const TIMEOUT_MS = 90_000

/** Model yang dites kalau tidak ada argumen. */
const CURATED = [
  'ag/claude-sonnet-4-6',
  'ag/claude-opus-4-6-thinking',
  'ag/gemini-3.7-flash-medium',
  'ag/gpt-oss-120b-medium',
  'cx/gpt-5.5',
]

const READ_FILE_TOOL = {
  type: 'function',
  function: {
    name: 'read_file',
    description: 'Read the contents of a file from the local filesystem',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path to the file' } },
      required: ['path'],
    },
  },
}

const SYSTEM_PROMPT = 'You are a coding agent. Use the provided tools to inspect the project before answering.'
const USER_PROMPT = 'How many lines are in package.json? Read it first, then answer with the number.'
/** Isi file palsu yang dikembalikan sebagai hasil tool pada lapis 3. */
const FAKE_FILE = '{\n  "name": "boo-agent",\n  "version": "0.0.0"\n}'

interface ToolCall {
  id: string
  function: { name: string; arguments: string }
}

interface Message {
  role: string
  content?: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

interface Check {
  ok: boolean
  detail: string
}

/**
 * `stream` selalu dikirim eksplisit — provider ag/* default-nya streaming,
 * sehingga request tanpa field ini membalas SSE saat JSON yang diharapkan.
 */
function requestBody(model: string, messages: Message[], stream: boolean) {
  return JSON.stringify({
    model,
    messages,
    tools: [READ_FILE_TOOL],
    tool_choice: 'auto',
    stream,
  })
}

async function post(model: string, messages: Message[], stream: boolean): Promise<Response> {
  return fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: requestBody(model, messages, stream),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

function baseMessages(): Message[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: USER_PROMPT },
  ]
}

function shorten(text: string, length = 60): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > length ? `${clean.slice(0, length)}…` : clean
}

/** Lapis 1 — model mengeluarkan tool_calls yang bisa dipakai. */
async function checkEmit(model: string): Promise<Check & { message?: Message }> {
  const response = await post(model, baseMessages(), false)
  const raw = await response.text()
  if (!response.ok) return { ok: false, detail: `HTTP ${response.status}: ${shorten(raw, 80)}` }

  let message: Message | undefined
  try {
    message = JSON.parse(raw).choices?.[0]?.message
  } catch {
    return { ok: false, detail: 'respons bukan JSON — kemungkinan SSE tak diminta' }
  }

  const call = message?.tool_calls?.[0]
  if (!call) return { ok: false, detail: `tanpa tool_calls (content: ${shorten(String(message?.content), 40)})` }
  if (call.function.name !== READ_FILE_TOOL.function.name) {
    return { ok: false, detail: `nama tool salah: ${call.function.name}` }
  }

  let args: { path?: unknown }
  try {
    args = JSON.parse(call.function.arguments)
  } catch {
    return { ok: false, detail: `arguments bukan JSON: ${shorten(call.function.arguments, 40)}` }
  }
  if (typeof args.path !== 'string') return { ok: false, detail: `argumen path hilang: ${call.function.arguments}` }

  return { ok: true, detail: `read_file(${JSON.stringify(args)})`, message }
}

/** Lapis 2 — arguments tetap utuh setelah disambung dari potongan SSE. */
async function checkStream(model: string): Promise<Check> {
  const response = await post(model, baseMessages(), true)
  if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` }

  const body = await response.text()
  if (!body.startsWith('data:')) return { ok: false, detail: 'bukan SSE — streaming tidak diteruskan' }

  let name = ''
  let args = ''
  let chunks = 0
  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ') || line.includes('[DONE]')) continue
    chunks += 1
    try {
      const call = JSON.parse(line.slice(6)).choices?.[0]?.delta?.tool_calls?.[0]
      if (call?.function?.name) name = call.function.name
      if (call?.function?.arguments) args += call.function.arguments
    } catch {
      // Chunk parsial bukan kegagalan; potongan berikutnya melengkapinya.
    }
  }

  if (!name) return { ok: false, detail: `${chunks} chunk SSE tapi tanpa tool_calls` }
  try {
    JSON.parse(args)
  } catch {
    return { ok: false, detail: `arguments pecah saat disambung: ${shorten(args, 40)}` }
  }
  return { ok: true, detail: `${name}(${args}) utuh dari ${chunks} chunk` }
}

/**
 * Lapis 3 — hasil tool dikirim balik dan model melanjutkan.
 * Balasan berupa tool_calls baru tetap dihitung lolos: agent loop memang boleh
 * memanggil tool beberapa putaran sebelum menjawab.
 */
async function checkLoop(model: string, first: Message): Promise<Check> {
  const call = first.tool_calls?.[0]
  if (!call) return { ok: false, detail: 'tidak ada tool_calls dari lapis 1' }

  const messages: Message[] = [
    ...baseMessages(),
    first,
    { role: 'tool', tool_call_id: call.id, content: FAKE_FILE },
  ]

  const response = await post(model, messages, false)
  const raw = await response.text()
  if (!response.ok) return { ok: false, detail: `HTTP ${response.status}: ${shorten(raw, 60)}` }

  const message: Message | undefined = JSON.parse(raw).choices?.[0]?.message
  if (message?.tool_calls?.length) {
    return { ok: true, detail: `meminta tool lagi: ${message.tool_calls[0].function.name}` }
  }
  const content = message?.content?.trim()
  if (!content) return { ok: false, detail: 'balasan kosong — hasil tool tidak diterima' }
  return { ok: true, detail: shorten(content) }
}

async function listModels(): Promise<string[]> {
  const response = await fetch(`${BASE}/v1/models`, {
    headers: { Authorization: `Bearer ${KEY}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Daftar model gagal diambil (HTTP ${response.status}).`)
  const body = await response.json()
  return (body.data ?? []).map((model: { id: string }) => model.id)
}

async function attempt(run: () => Promise<Check>): Promise<Check> {
  try {
    return await run()
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : 'error tak dikenal' }
  }
}

async function main() {
  if (!KEY) {
    console.error('NINEROUTER_KEY belum di-set. Jalankan lewat `pnpm check:tools` yang membaca .env.local.')
    process.exitCode = 1
    return
  }

  const args = process.argv.slice(2)
  const models = args.includes('--all')
    ? await listModels()
    : args.length ? args : CURATED

  console.info(`Menguji ${models.length} model lewat ${BASE}\n`)
  let passed = 0

  for (const model of models) {
    const emit = await attempt(() => checkEmit(model)) as Check & { message?: Message }
    const stream = await attempt(() => checkStream(model))
    const loop = emit.ok && emit.message
      ? await attempt(() => checkLoop(model, emit.message!))
      : { ok: false, detail: 'dilewati — lapis 1 gagal' }

    const allOk = emit.ok && stream.ok && loop.ok
    if (allOk) passed += 1
    const mark = (check: Check) => check.ok ? '✅' : '❌'

    console.info(`${allOk ? '✅' : '❌'} ${model}`)
    console.info(`   emit   ${mark(emit)}  ${emit.detail}`)
    console.info(`   stream ${mark(stream)}  ${stream.detail}`)
    console.info(`   loop   ${mark(loop)}  ${loop.detail}\n`)
  }

  console.info(`${passed}/${models.length} model lolos ketiga lapis.`)
  if (!passed) process.exitCode = 1
}

await main()
