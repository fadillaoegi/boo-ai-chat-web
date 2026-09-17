import assert from 'node:assert/strict'
import test from 'node:test'
import { planEdit, planRegenerate } from '../src/application/conversationEdits.ts'

type Image = { kind: 'upload' | 'generated', url: string, alt: string }

function message(id: string, role: 'user' | 'assistant', content: string, images: Image[] = []) {
  return { id, role, content, ...(images.length ? { images } : {}) }
}

const upload: Image = { kind: 'upload', url: 'data:image/png;base64,u', alt: 'foto' }
const generated: Image = { kind: 'generated', url: 'data:image/png;base64,g', alt: 'hasil' }

test('regenerate drops the last answer and resends the user message before it', () => {
  const messages = [message('1', 'user', 'A'), message('2', 'assistant', 'jawab A'), message('3', 'user', 'B'), message('4', 'assistant', 'jawab B')]
  const plan = planRegenerate(messages, 'chat')

  assert.deepEqual(plan?.history.map((item) => item.id), ['1', '2'])
  assert.equal(plan?.userMessage.id, '3')
  assert.equal(plan?.mode, 'chat')
  assert.equal(plan?.replacedCount, 1)
})

test('retry resends a trailing user message that never got an answer', () => {
  const plan = planRegenerate([message('1', 'user', 'A'), message('2', 'assistant', 'ok'), message('3', 'user', 'gagal')], 'chat')

  assert.equal(plan?.userMessage.id, '3')
  assert.equal(plan?.history.length, 2)
  assert.equal(plan?.replacedCount, 0)
})

test('nothing to regenerate in an empty or assistant-only conversation', () => {
  assert.equal(planRegenerate([], 'chat'), null)
  assert.equal(planRegenerate([message('1', 'assistant', 'halo')], 'chat'), null)
})

test('request mode follows the answer being replaced, not the active tab', () => {
  const imageTurn = [message('1', 'user', 'kucing'), message('2', 'assistant', 'Gambar berhasil dibuat.', [generated])]
  assert.equal(planRegenerate(imageTurn, 'chat')?.mode, 'image')

  const visionTurn = [message('1', 'user', 'ini apa?', [upload]), message('2', 'assistant', 'Sebuah foto.')]
  assert.equal(planRegenerate(visionTurn, 'image')?.mode, 'vision')

  assert.equal(planRegenerate([message('1', 'user', 'kucing')], 'image')?.mode, 'image')
})

test('editing a message keeps its id and attachments and replaces everything after it', () => {
  const messages = [
    message('1', 'user', 'A', [upload]),
    message('2', 'assistant', 'jawab A'),
    message('3', 'user', 'B'),
    message('4', 'assistant', 'jawab B'),
  ]
  const plan = planEdit(messages, '1', '  A versi baru  ', 'chat')

  assert.deepEqual(plan?.history, [])
  assert.deepEqual(plan?.userMessage, { ...messages[0], content: 'A versi baru' })
  assert.equal(plan?.mode, 'vision')
  assert.equal(plan?.replacedCount, 3)
})

test('edits to assistant messages, unknown ids, or blank text are rejected', () => {
  const messages = [message('1', 'user', 'A'), message('2', 'assistant', 'jawab')]
  assert.equal(planEdit(messages, '2', 'ubah', 'chat'), null)
  assert.equal(planEdit(messages, 'x', 'ubah', 'chat'), null)
  assert.equal(planEdit(messages, '1', '   ', 'chat'), null)
})
