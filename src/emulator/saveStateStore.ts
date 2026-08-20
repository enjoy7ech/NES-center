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
  const database = await openDatabase()
  const records = await new Promise<SaveStateRecord[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result as SaveStateRecord[])
    request.onerror = () => reject(request.error ?? new Error('读取存档列表失败。'))
  })
  database.close()
  return records
    .filter(record => record.gameId === gameId)
    .map(({ gameId: id, slot, updatedAt, thumbnail }) => ({ gameId: id, slot, updatedAt, thumbnail }))
    .sort((left, right) => left.slot - right.slot)
}
