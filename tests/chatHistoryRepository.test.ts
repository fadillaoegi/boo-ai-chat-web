import assert from 'node:assert/strict'
import test from 'node:test'
import { IDBFactory } from 'fake-indexeddb'
import { IndexedDbChatHistoryRepository, LEGACY_STORAGE_KEY } from '../src/infrastructure/indexedDbChatHistoryRepository.ts'

function session(id: string, updatedAt: number, title = id) {
  return { id, title, modelId: 'm', mode: 'chat' as const, messages: [{ id: `${id}-1`, role: 'user' as const, content: 'halo' }], createdAt: 1, updatedAt }
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    removeItem: (key: string) => { data.delete(key) },
    has: (key: string) => data.has(key),
  }
}

test('sessions are saved, listed newest first, and deleted', async () => {
  const repository = new IndexedDbChatHistoryRepository({ indexedDB: new IDBFactory(), legacyStorage: null })
  await repository.save(session('a', 10))
  await repository.save(session('b', 30))
  await repository.save({ ...session('a', 50), title: 'a diperbarui' })

  assert.deepEqual((await repository.list()).map((item) => [item.id, item.title]), [['a', 'a diperbarui'], ['b', 'b']])
  await repository.delete('a')
  assert.deepEqual((await repository.list()).map((item) => item.id), ['b'])
})

test('there is no 50-session cap anymore', async () => {
  const repository = new IndexedDbChatHistoryRepository({ indexedDB: new IDBFactory(), legacyStorage: null })
  for (let index = 0; index < 120; index += 1) await repository.save(session(`s${index}`, index))
  assert.equal((await repository.list()).length, 120)
})

test('legacy localStorage history is migrated once, invalid entries skipped, and the old key removed', async () => {
  const factory = new IDBFactory()
  const legacy = memoryStorage({ [LEGACY_STORAGE_KEY]: JSON.stringify([session('lama', 5), { id: 'rusak' }]) })

  const first = new IndexedDbChatHistoryRepository({ indexedDB: factory, legacyStorage: legacy })
  assert.deepEqual((await first.list()).map((item) => item.id), ['lama'])
  assert.equal(legacy.has(LEGACY_STORAGE_KEY), false)

  const reopened = new IndexedDbChatHistoryRepository({ indexedDB: factory, legacyStorage: legacy })
  assert.equal((await reopened.list()).length, 1)
})

test('migration never overwrites a newer copy that already lives in IndexedDB', async () => {
  const factory = new IDBFactory()
  await new IndexedDbChatHistoryRepository({ indexedDB: factory, legacyStorage: null }).save(session('x', 100, 'versi baru'))

  const legacy = memoryStorage({ [LEGACY_STORAGE_KEY]: JSON.stringify([session('x', 1, 'versi lama'), session('y', 2)]) })
  const repository = new IndexedDbChatHistoryRepository({ indexedDB: factory, legacyStorage: legacy })

  assert.deepEqual((await repository.list()).map((item) => [item.id, item.title]), [['x', 'versi baru'], ['y', 'y']])
})

test('corrupt legacy JSON is discarded without breaking the history', async () => {
  const legacy = memoryStorage({ [LEGACY_STORAGE_KEY]: '{bukan json' })
  const repository = new IndexedDbChatHistoryRepository({ indexedDB: new IDBFactory(), legacyStorage: legacy })

  assert.deepEqual(await repository.list(), [])
  assert.equal(legacy.has(LEGACY_STORAGE_KEY), false)
})

test('a missing IndexedDB surfaces a clear error instead of silently losing data', async () => {
  // Node tidak punya indexedDB global, jadi tanpa factory repository tidak punya penyimpanan.
  const repository = new IndexedDbChatHistoryRepository({ legacyStorage: null })
  await assert.rejects(repository.save(session('a', 1)), /IndexedDB/)
})
