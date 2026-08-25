import { renameSaveStateGameId } from './saveStateStore'

const FF2_RENAME_MIGRATION_KEY = 'fc-center:migration:ff2-to-yuzhou-zhanjiang-v1'
const PREVIOUS_ROM_PATH = '/ROMS/最终幻想II.nes'
const NEXT_ROM_PATH = '/ROMS/宇宙战将.nes'
const PREVIOUS_GAME_ID = '最终幻想ii'
const NEXT_GAME_ID = '宇宙战将'

function cheatSettingKey(romPath: string) {
  return `fc-center:cheats:${romPath}`
}

export async function migrateLegacyFf2Data(): Promise<void> {
  if (localStorage.getItem(FF2_RENAME_MIGRATION_KEY)) return

  const previousCheatsKey = cheatSettingKey(PREVIOUS_ROM_PATH)
  const nextCheatsKey = cheatSettingKey(NEXT_ROM_PATH)
  const previousCheats = localStorage.getItem(previousCheatsKey)
  if (previousCheats !== null && localStorage.getItem(nextCheatsKey) === null) {
    localStorage.setItem(nextCheatsKey, previousCheats)
  }
  localStorage.removeItem(previousCheatsKey)

  await renameSaveStateGameId(PREVIOUS_GAME_ID, NEXT_GAME_ID)
  localStorage.setItem(FF2_RENAME_MIGRATION_KEY, '1')
}
