import assert from 'node:assert/strict'
import test from 'node:test'
import { UI_TEXT } from '../src/presentation/i18n.ts'

test('English and Indonesian UI text define exactly the same keys', () => {
  const english = Object.keys(UI_TEXT.en).sort()
  const indonesian = Object.keys(UI_TEXT.id).sort()

  assert.deepEqual(indonesian.filter((key) => !english.includes(key)), [], 'hanya ada di ID')
  assert.deepEqual(english.filter((key) => !indonesian.includes(key)), [], 'hanya ada di EN')
})

test('no UI text is left empty', () => {
  for (const [language, texts] of Object.entries(UI_TEXT)) {
    for (const [key, value] of Object.entries(texts)) assert.ok(value.trim(), `${language}.${key} kosong`)
  }
})
