import assert from 'node:assert/strict'
import test from 'node:test'
import { selectContextMessages } from '../src/application/chatContext.ts'
import { buildImageGenerationContext } from '../src/application/imageContext.ts'

function message(
  id: string,
  role: 'user' | 'assistant',
  content: string,
  images: Array<{ kind: 'upload' | 'generated', url: string, alt: string }> = [],
) {
  return { id, role, content, ...(images.length ? { images } : {}) }
}

test('chat context keeps the latest messages in their original order', () => {
  const messages = [
    message('1', 'user', 'Topik A '.repeat(80)),
    message('2', 'assistant', 'Jawaban lama '.repeat(80)),
    message('3', 'user', 'Lanjutkan pembahasan A'),
    message('4', 'assistant', 'Jawaban terbaru'),
  ]

  const result = selectContextMessages(messages, 40)

  assert.deepEqual(result.messages.map((item) => item.id), ['3', '4'])
  assert.equal(result.omittedMessages, 2)
})

test('first image request remains unchanged without prior generated image', () => {
  const result = buildImageGenerationContext([], 'Buat gambar Pak Prabowo')

  assert.equal(result.prompt, 'Buat gambar Pak Prabowo')
  assert.deepEqual(result.images, [])
  assert.equal(result.continuedFromPrevious, false)
})

test('follow-up image request carries the successful prompt and latest generated image', () => {
  const generated = { kind: 'generated' as const, url: 'data:image/png;base64,previous', alt: 'Pak Prabowo' }
  const history = [
    message('1', 'user', 'Buat gambar Pak Prabowo'),
    message('2', 'assistant', 'Gambar berhasil dibuat.', [generated]),
  ]

  const result = buildImageGenerationContext(history, 'Tambahkan Mayor Teddy di sebelahnya')

  assert.match(result.prompt, /Buat gambar Pak Prabowo/)
  assert.match(result.prompt, /Tambahkan Mayor Teddy di sebelahnya/)
  assert.match(result.prompt, /Preserve the people, objects, setting, composition/)
  assert.deepEqual(result.images, [generated])
  assert.equal(result.continuedFromPrevious, true)
})

test('explicitly uploaded references take precedence over the automatic previous image', () => {
  const generated = { kind: 'generated' as const, url: 'generated-url', alt: 'previous' }
  const uploaded = { kind: 'upload' as const, url: 'uploaded-url', alt: 'new reference' }
  const history = [
    message('1', 'user', 'Buat gambar awal'),
    message('2', 'assistant', 'Selesai', [generated]),
  ]

  const result = buildImageGenerationContext(history, 'Gunakan pakaian dari referensi ini', [uploaded])

  assert.deepEqual(result.images, [uploaded])
  assert.equal(result.continuedFromPrevious, true)
})

test('unsuccessful image prompts are not treated as established visual context', () => {
  const history = [
    message('1', 'user', 'Permintaan yang gagal'),
    message('2', 'assistant', 'Tidak dapat membuat gambar.'),
  ]

  const result = buildImageGenerationContext(history, 'Permintaan baru')

  assert.equal(result.prompt, 'Permintaan baru')
  assert.equal(result.continuedFromPrevious, false)
})

test('context budget follows the model and stays within the hard cap', async () => {
  const { contextBudgetForModel, DEFAULT_INPUT_CONTEXT_TOKENS, MAX_INPUT_CONTEXT_TOKENS } = await import('../src/application/chatContext.ts')

  assert.equal(contextBudgetForModel(undefined), DEFAULT_INPUT_CONTEXT_TOKENS)
  assert.equal(contextBudgetForModel({ contextLength: 1_048_576, maxOutputTokens: 65_536 }), MAX_INPUT_CONTEXT_TOKENS)
  assert.equal(contextBudgetForModel({ contextLength: 200_000, maxOutputTokens: 64_000 }), 134_000)
  assert.equal(contextBudgetForModel({ contextLength: 128_000, maxOutputTokens: 64_000 }), 80_000)
  assert.equal(contextBudgetForModel({ contextLength: 8_000 }), 4_000)
})

test('only the most recent uploaded images are resent', async () => {
  const { limitContextImages } = await import('../src/application/chatContext.ts')
  const upload = (name: string) => ({ kind: 'upload' as const, url: name, alt: name })
  const generated = { kind: 'generated' as const, url: 'g', alt: 'g' }
  const messages = [
    message('1', 'user', 'lama', [upload('a'), upload('b'), upload('c')]),
    message('2', 'assistant', 'hasil', [generated]),
    message('3', 'user', 'baru', [upload('d'), upload('e')]),
  ]

  const limited = limitContextImages(messages, 3)

  assert.deepEqual(limited[2].images?.map((image) => image.url), ['d', 'e'])
  assert.deepEqual(limited[0].images?.map((image) => image.url), ['a'])
  assert.match(limited[0].content, /2 earlier image attachments omitted/)
  assert.equal(limited[1], messages[1])
  assert.equal(messages[0].images?.length, 3)
})
