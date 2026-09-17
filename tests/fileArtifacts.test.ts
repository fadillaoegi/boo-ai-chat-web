import assert from 'node:assert/strict'
import test from 'node:test'
import { estimateMessageTokens, selectContextMessages } from '../src/application/chatContext.ts'
import {
  extractFileArtifacts,
  messageTextWithFiles,
  normalizeFileName,
  parseCsv,
} from '../src/application/fileArtifacts.ts'

function sequentialIds() {
  let next = 0
  return () => `file-${++next}`
}

test('file blocks are moved out of the visible answer', () => {
  const answer = [
    'Berikut laporannya.',
    '<boo-file name="laporan.pdf">',
    '# Laporan',
    '',
    '| A | B |',
    '|---|---|',
    '| 1 | 2 |',
    '</boo-file>',
    'Silakan dicek.',
  ].join('\n')

  const result = extractFileArtifacts(answer, sequentialIds())

  assert.equal(result.content, 'Berikut laporannya.\n\nSilakan dicek.')
  assert.deepEqual(result.files, [{
    id: 'file-1',
    name: 'laporan.pdf',
    format: 'pdf',
    content: '# Laporan\n\n| A | B |\n|---|---|\n| 1 | 2 |',
  }])
})

test('answers without file blocks are returned unchanged', () => {
  const answer = 'Halo!\n\n```html\n<b>bukan file</b>\n```'
  assert.deepEqual(extractFileArtifacts(answer, sequentialIds()), { content: answer, files: [] })
})

test('multiple blocks, single quotes, and an unterminated final block are all captured', () => {
  const answer = "<boo-file name='data.csv'>\na,b\n1,2\n</boo-file>\n<boo-file name=\"catatan.txt\">\nterpotong di sini"
  const result = extractFileArtifacts(answer, sequentialIds())

  assert.equal(result.content, '')
  assert.deepEqual(result.files.map((file) => [file.name, file.content]), [
    ['data.csv', 'a,b\n1,2'],
    ['catatan.txt', 'terpotong di sini'],
  ])
})

test('a fence wrapping the whole block or the whole body is removed', () => {
  const answer = 'Ini JSON-nya:\n```xml\n<boo-file name="config.json">\n```json\n{"a": 1}\n```\n</boo-file>\n```'
  const result = extractFileArtifacts(answer, sequentialIds())

  assert.equal(result.content, 'Ini JSON-nya:')
  assert.equal(result.files[0].content, '{"a": 1}')
})

test('a markdown document that contains several code fences keeps them', () => {
  const body = '```js\na()\n```\n\nTeks\n\n```js\nb()\n```'
  const result = extractFileArtifacts(`<boo-file name="panduan.md">\n${body}\n</boo-file>`, sequentialIds())
  assert.equal(result.files[0].content, body)
})

test('empty file blocks are dropped', () => {
  const result = extractFileArtifacts('Maaf.\n<boo-file name="kosong.pdf">\n  \n</boo-file>', sequentialIds())
  assert.deepEqual(result, { content: 'Maaf.', files: [] })
})

test('file names are sanitized and mapped to supported formats', () => {
  assert.deepEqual(normalizeFileName('../../etc/Surat Lamaran.DOC'), { name: 'Surat Lamaran.docx', format: 'docx' })
  assert.deepEqual(normalizeFileName('index.htm'), { name: 'index.html', format: 'html' })
  assert.deepEqual(normalizeFileName('catatan'), { name: 'catatan.md', format: 'md' })
  assert.deepEqual(normalizeFileName('tabel.xlsx'), { name: 'tabel.txt', format: 'txt' })
  assert.deepEqual(normalizeFileName('a<b>:c?.pdf'), { name: 'abc.pdf', format: 'pdf' })
  assert.deepEqual(normalizeFileName('.pdf'), { name: 'boo-file.pdf', format: 'pdf' })
})

test('files stay in the AI context so the model can revise them later', () => {
  const message = {
    id: '1',
    role: 'assistant' as const,
    content: 'File siap.',
    files: [{ id: 'f', name: 'a.md', format: 'md' as const, content: '# Judul' }],
  }

  assert.equal(messageTextWithFiles(message), 'File siap.\n\n<boo-file name="a.md">\n# Judul\n</boo-file>')
  assert.ok(estimateMessageTokens(message) > estimateMessageTokens({ ...message, files: undefined }))

  const [shortened] = selectContextMessages([{ ...message, files: [{ ...message.files[0], content: 'x'.repeat(4_000) }] }], 200).messages
  assert.equal(shortened.files, undefined)
  assert.match(shortened.content, /<boo-file name="a.md">/)
})

test('csv parsing handles quotes, escaped quotes, CRLF, and semicolons', () => {
  assert.deepEqual(parseCsv('nama,catatan\r\n"Budi, S.T.","kata ""oke"""\r\n\r\n'), [
    ['nama', 'catatan'],
    ['Budi, S.T.', 'kata "oke"'],
  ])
  assert.deepEqual(parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']])
})
