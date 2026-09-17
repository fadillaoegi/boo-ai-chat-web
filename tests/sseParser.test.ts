import assert from 'node:assert/strict'
import test from 'node:test'
import { createSseParser } from '../src/infrastructure/sseParser.ts'

function collect(chunks: string[]): string[] {
  const events: string[] = []
  const parser = createSseParser((data) => events.push(data))
  chunks.forEach((chunk) => parser.push(chunk))
  parser.flush()
  return events
}

test('events split across network chunks are reassembled', () => {
  assert.deepEqual(collect(['data: {"a"', ':1}\n', '\ndata: [DO', 'NE]\n\n']), ['{"a":1}', '[DONE]'])
})

test('CRLF line endings, comments, and other fields are handled', () => {
  assert.deepEqual(collect([': keep-alive\r\n\r\nevent: message\r\ndata: halo\r\n\r\n']), ['halo'])
})

test('multi-line data joins with newlines and a final event without a blank line is flushed', () => {
  assert.deepEqual(collect(['data: baris 1\ndata: baris 2\n\ndata:tanpa-spasi']), ['baris 1\nbaris 2', 'tanpa-spasi'])
})
