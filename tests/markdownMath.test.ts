import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeMathDelimiters } from '../src/presentation/markdownMath.ts'

test('LaTeX bracket delimiters become dollar delimiters', () => {
  assert.equal(normalizeMathDelimiters('Rumus \\(E = mc^2\\) terkenal.'), 'Rumus $E = mc^2$ terkenal.')
  assert.equal(normalizeMathDelimiters('Integral:\n\\[\n\\int_0^1 x\\,dx\n\\]'), 'Integral:\n\n$$\n\\int_0^1 x\\,dx\n$$\n')
})

test('prices are escaped but real inline math that starts with a digit is kept', () => {
  assert.equal(normalizeMathDelimiters('Harganya $5 atau $1,250.'), 'Harganya \\$5 atau \\$1,250.')
  assert.equal(normalizeMathDelimiters('Hitung $2x+1$ dan $5$.'), 'Hitung $2x+1$ dan $5$.')
  assert.equal(normalizeMathDelimiters('Sudah \\$5 lolos'), 'Sudah \\$5 lolos')
})

test('code blocks, unclosed fences, and inline code are left untouched', () => {
  const fenced = 'Contoh:\n```bash\necho $5 \\(tidak\\)\n```\nlalu \\(x\\)'
  assert.equal(normalizeMathDelimiters(fenced), 'Contoh:\n```bash\necho $5 \\(tidak\\)\n```\nlalu $x$')
  assert.equal(normalizeMathDelimiters('Stream:\n```js\nconst harga = "$5"'), 'Stream:\n```js\nconst harga = "$5"')
  assert.equal(normalizeMathDelimiters('Pakai `$5` dan \\(y\\)'), 'Pakai `$5` dan $y$')
})
