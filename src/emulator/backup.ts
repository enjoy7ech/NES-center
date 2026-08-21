import { exportAllSaveStates, importAllSaveStates, removeStaleSaveStateData } from './saveStateStore'
import type { SaveStateBackupRecord } from './saveStateStore'
import {
  inferRenamedGameIds,
  isCurrentGameId,
  removeStaleCheatSettings,
  removeStaleLocalSettings,
} from './gameIdentity'

const BACKUP_FORMAT = 'dong-ge-xiao-bawang-backup'
const BACKUP_VERSION = 1
const SETTINGS_PREFIX = 'fc-center:'
const MAX_SAVE_STATES = 1000
const MAX_STATE_BYTES = 16 * 1024 * 1024
const MAX_TOTAL_STATE_BYTES = 128 * 1024 * 1024
const MAX_TOTAL_SETTING_CHARACTERS = 5 * 1024 * 1024

type PortableSaveState = Omit<SaveStateBackupRecord, 'data'> & { data: string }

type AppBackup = {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: string
  saveStates: PortableSaveState[]
  settings: Record<string, string>
}

export type BackupSummary = {
  saveStateCount: number
  gameCount: number
  settingCount: number
}

function bytesToBase64(data: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    binary += String.fromCharCode(...data.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(value: string) {
  if (value.length > Math.ceil(MAX_STATE_BYTES / 3) * 4 + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error('备份包含无效或过大的存档数据。')
  }
  let binary: string
  try {
    binary = atob(value)
  } catch {
    throw new Error('备份中的存档编码无效。')
  }
  if (binary.length > MAX_STATE_BYTES) throw new Error('单个存档超过允许大小。')
  const data = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) data[index] = binary.charCodeAt(index)
  return data
}

function exportSettings(includedKeys?: Set<string>) {
  removeStaleLocalSettings()
  const settings: Record<string, string> = {}
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key?.startsWith(SETTINGS_PREFIX) || (includedKeys && !includedKeys.has(key))) continue
    const value = localStorage.getItem(key)
    if (value !== null) settings[key] = value
  }
  return settings
}

function backupSummary(saveStates: Array<{ gameId: string }>, settings: Record<string, string>): BackupSummary {
  return {
    saveStateCount: saveStates.length,
    gameCount: new Set(saveStates.map(record => record.gameId)).size,
    settingCount: Object.keys(settings).length,
  }
}

function dropLegacyTenthSlots<T extends { slot: number }>(records: T[]) {
  return records.filter(record => record.slot !== 9)
}

export async function createAppBackup() {
  const saveStates = dropLegacyTenthSlots(await exportAllSaveStates())
  const settings = exportSettings()
  const backup: AppBackup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    saveStates: saveStates.map(record => ({ ...record, data: bytesToBase64(record.data) })),
    settings,
  }
  const date = backup.exportedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return {
    fileName: `董哥的小霸王-全量备份-${date}.json`,
    json: JSON.stringify(backup),
    summary: backupSummary(saveStates, settings),
  }
}

export async function createGameBackup(gameId: string, gameTitle: string, settingKeys: string[]) {
  const saveStates = dropLegacyTenthSlots(await exportAllSaveStates())
    .filter(record => record.gameId === gameId)
  const settings = exportSettings(new Set(settingKeys))
  const exportedAt = new Date().toISOString()
  const backup: AppBackup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    saveStates: saveStates.map(record => ({ ...record, data: bytesToBase64(record.data) })),
    settings,
  }
  const date = exportedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const safeTitle = gameTitle.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').slice(0, 80) || gameId
  return {
    fileName: `${safeTitle}-游戏备份-${date}.json`,
    json: JSON.stringify(backup),
    summary: backupSummary(saveStates, settings),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseSaveState(value: unknown): SaveStateBackupRecord {
  if (!isRecord(value)) throw new Error('备份中的存档记录格式无效。')
  const { gameId, slot, updatedAt, thumbnail, virtualPath, data } = value
  if (typeof gameId !== 'string' || !gameId || gameId.length > 512) throw new Error('备份中的游戏标识无效。')
  if (!Number.isInteger(slot) || (slot as number) < -1 || (slot as number) > 9) throw new Error('备份中的存档槽位无效。')
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt < 0) throw new Error('备份中的存档时间无效。')
  if (typeof thumbnail !== 'string' || thumbnail.length > 4 * 1024 * 1024) throw new Error('备份中的缩略图无效。')
  if (typeof virtualPath !== 'string' || !virtualPath.startsWith('/save-states/') || virtualPath.length > 512) {
    throw new Error('备份中的存档路径无效。')
  }
  if (typeof data !== 'string') throw new Error('备份中的存档数据无效。')
  return { gameId, slot: slot as number, updatedAt, thumbnail, virtualPath, data: base64ToBytes(data) }
}

function parseSettings(value: unknown) {
  if (!isRecord(value) || Object.keys(value).length > 1000) throw new Error('备份中的配置格式无效。')
  const settings: Record<string, string> = {}
  let totalCharacters = 0
  for (const [key, setting] of Object.entries(value)) {
    if (!key.startsWith(SETTINGS_PREFIX) || key.length > 1024 || typeof setting !== 'string') {
      throw new Error('备份中包含不受支持的配置项。')
    }
    totalCharacters += key.length + setting.length
    if (totalCharacters > MAX_TOTAL_SETTING_CHARACTERS) throw new Error('备份中的配置总大小超过限制。')
    settings[key] = setting
  }
  return settings
}

function parseAppBackup(json: string) {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error('所选文件不是有效的 JSON 备份。')
  }
  if (!isRecord(value) || value.format !== BACKUP_FORMAT || value.version !== BACKUP_VERSION) {
    throw new Error('备份格式或版本不受支持。')
  }
  if (!Array.isArray(value.saveStates) || value.saveStates.length > MAX_SAVE_STATES) {
    throw new Error('备份中的存档数量无效。')
  }
  const parsedSaveStates = dropLegacyTenthSlots(value.saveStates.map(parseSaveState))
  const totalBytes = parsedSaveStates.reduce((total, record) => total + record.data.byteLength, 0)
  if (totalBytes > MAX_TOTAL_STATE_BYTES) throw new Error('备份中的存档总大小超过限制。')
  const parsedSettings = parseSettings(value.settings)
  const renamedGameIds = inferRenamedGameIds(parsedSettings)
  const staleGameIds = new Set<string>()
  const saveStates = parsedSaveStates.flatMap(record => {
    const renamed = renamedGameIds.get(record.gameId)
    if (renamed) {
      staleGameIds.add(record.gameId)
      return [{ ...record, gameId: renamed }]
    }
    if (!isCurrentGameId(record.gameId)) {
      staleGameIds.add(record.gameId)
      return []
    }
    return [record]
  })
  const settings = removeStaleCheatSettings(parsedSettings)

  return { saveStates, settings, staleGameIds }
}

export async function restoreAppBackup(json: string): Promise<BackupSummary> {
  const { saveStates, settings, staleGameIds } = parseAppBackup(json)

  await removeStaleSaveStateData(staleGameIds)
  await importAllSaveStates(saveStates)
  Object.entries(settings).forEach(([key, setting]) => localStorage.setItem(key, setting))
  return backupSummary(saveStates, settings)
}

export async function restoreGameBackup(
  json: string,
  gameId: string,
  settingKeys: string[],
): Promise<BackupSummary> {
  const parsed = parseAppBackup(json)
  const saveStates = parsed.saveStates.filter(record => record.gameId === gameId)
  const allowedSettings = new Set(settingKeys)
  const settings = Object.fromEntries(
    Object.entries(parsed.settings).filter(([key]) => allowedSettings.has(key)),
  )
  if (!saveStates.length && !Object.keys(settings).length) {
    throw new Error('备份中没有当前游戏的数据。')
  }

  await removeStaleSaveStateData(parsed.staleGameIds)
  await importAllSaveStates(saveStates)
  Object.entries(settings).forEach(([key, setting]) => localStorage.setItem(key, setting))
  return backupSummary(saveStates, settings)
}
