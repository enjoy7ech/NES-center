import { isCurrentGameId } from './gameIdentity'

export type SaveStateSlot = {
  gameId: string
  slot: number
  updatedAt: number
  thumbnail: string
}

type SaveStateRecord = SaveStateSlot & {
  id: string
  data: Uint8Array
  virtualPath: string
}

export type SaveStateBackupRecord = Omit<SaveStateRecord, 'id'>

const DATABASE_NAME = 'fc-center-saves'
const STORE_NAME = 'save-states'
const DATABASE_VERSION = 1

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法打开浏览器存档数据库。'))
  })
}

function slotId(gameId: string, slot: number) {
  return `${gameId}:${slot}`
}

async function readAllRecords(database: IDBDatabase) {
  return new Promise<SaveStateRecord[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result as SaveStateRecord[])
    request.onerror = () => reject(request.error ?? new Error('读取存档失败。'))
  })
}

function normalizeRecords(records: SaveStateRecord[]) {
  const normalized = new Map<string, SaveStateRecord>()
  for (const record of records) {
    if (record.slot < -2 || record.slot >= 8 || !isCurrentGameId(record.gameId)) continue
    const gameId = record.gameId
    const id = slotId(gameId, record.slot)
    const candidate = { ...record, id, gameId }
    const previous = normalized.get(id)
    if (!previous || candidate.updatedAt >= previous.updatedAt) normalized.set(id, candidate)
  }
  return [...normalized.values()]
}

export async function removeStaleSaveStateData(staleGameIds: ReadonlySet<string> = new Set()): Promise<void> {
  const database = await openDatabase()
  try {
    const records = await readAllRecords(database)
    const normalized = normalizeRecords(records)
    const normalizedIds = new Set(normalized.map(record => record.id))
    const needsCleanup = records.some(record => (
      record.slot < -2
      || record.slot >= 8
      || !isCurrentGameId(record.gameId)
      || staleGameIds.has(record.gameId)
      || record.id !== slotId(record.gameId, record.slot)
      || !normalizedIds.has(record.id)
    ))
    if (!needsCleanup && !staleGameIds.size) return
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      records.forEach(record => store.delete(record.id))
      normalized.filter(record => !staleGameIds.has(record.gameId)).forEach(record => store.put(record))
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('清理陈旧存档失败。'))
      transaction.onabort = () => reject(transaction.error ?? new Error('清理陈旧存档已中止。'))
    })
  } finally {
    database.close()
  }
}

export async function writeSaveState(
  gameId: string,
  slot: number,
  data: Uint8Array,
  thumbnail: string,
  virtualPath: string,
): Promise<SaveStateSlot> {
  const database = await openDatabase()
  const record: SaveStateRecord = {
    id: slotId(gameId, slot),
    gameId,
    slot,
    updatedAt: Date.now(),
    thumbnail,
    data: data.slice(),
    virtualPath,
  }

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(record)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('写入存档失败。'))
  })
  database.close()
  return { gameId, slot, updatedAt: record.updatedAt, thumbnail }
}

export async function readSaveState(gameId: string, slot: number): Promise<SaveStateRecord | null> {
  const database = await openDatabase()
  const record = await new Promise<SaveStateRecord | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).get(slotId(gameId, slot))
    request.onsuccess = () => resolve(request.result as SaveStateRecord | undefined)
    request.onerror = () => reject(request.error ?? new Error('读取存档失败。'))
  })
  database.close()
  return record ?? null
}

export async function deleteSaveState(gameId: string, slot: number): Promise<void> {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(slotId(gameId, slot))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('删除存档失败。'))
  })
  database.close()
}

export async function listSaveStates(gameId: string): Promise<SaveStateSlot[]> {
  await removeStaleSaveStateData()
  const database = await openDatabase()
  const records = await readAllRecords(database)
  database.close()
  return records
    .filter(record => record.gameId === gameId)
    .map(({ gameId: id, slot, updatedAt, thumbnail }) => ({ gameId: id, slot, updatedAt, thumbnail }))
    .sort((left, right) => left.slot - right.slot)
}

export async function exportAllSaveStates(): Promise<SaveStateBackupRecord[]> {
  await removeStaleSaveStateData()
  const database = await openDatabase()
  const records = await readAllRecords(database)
  database.close()
  return records.map(({ gameId, slot, updatedAt, thumbnail, data, virtualPath }) => ({
    gameId,
    slot,
    updatedAt,
    thumbnail,
    data: data.slice(),
    virtualPath,
  }))
}

export async function importAllSaveStates(records: SaveStateBackupRecord[]): Promise<void> {
  const normalizedRecords = normalizeRecords(records.map(record => ({
    ...record,
    id: slotId(record.gameId, record.slot),
  })))
  if (!normalizedRecords.length) return
  await removeStaleSaveStateData()
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      normalizedRecords.forEach(record => {
        store.put({
          ...record,
          id: slotId(record.gameId, record.slot),
          data: record.data.slice(),
        } satisfies SaveStateRecord)
      })
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('导入存档失败。'))
      transaction.onabort = () => reject(transaction.error ?? new Error('导入存档已中止。'))
    })
  } finally {
    database.close()
  }
}
