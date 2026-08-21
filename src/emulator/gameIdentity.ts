const CHEAT_SETTING_PREFIX = 'fc-center:cheats:'

export function gameIdFromRomName(name: string) {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .toLowerCase() || 'game'
}

export function isCurrentGameId(gameId: string) {
  return /\p{Script=Han}/u.test(gameId)
}

function gameIdFromCheatSettingKey(key: string) {
  if (!key.startsWith(CHEAT_SETTING_PREFIX)) return null
  const fileName = key.slice(CHEAT_SETTING_PREFIX.length).split('/').pop()
  return fileName ? gameIdFromRomName(fileName) : null
}

function cheatCodes(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return new Set<string>()
    return new Set(parsed.flatMap(item => (
      typeof item === 'object' && item !== null && 'code' in item && typeof item.code === 'string'
        ? [item.code]
        : []
    )))
  } catch {
    return new Set<string>()
  }
}

// Infer renamed ROMs from the backup's own cheat lists. No legacy catalog ID
// is retained in application code or used for new data.
export function inferRenamedGameIds(settings: Record<string, string>) {
  const cheatSettings = Object.entries(settings).flatMap(([key, value]) => {
    const gameId = gameIdFromCheatSettingKey(key)
    return gameId ? [{ gameId, codes: cheatCodes(value) }] : []
  })
  const current = cheatSettings.filter(item => isCurrentGameId(item.gameId) && item.codes.size)
  const renamed = new Map<string, string>()

  for (const legacy of cheatSettings.filter(item => !isCurrentGameId(item.gameId) && item.codes.size)) {
    const matches = current
      .map(candidate => ({
        gameId: candidate.gameId,
        overlap: [...legacy.codes].filter(code => candidate.codes.has(code)).length,
      }))
      .filter(match => match.overlap / legacy.codes.size >= 0.8)
      .sort((left, right) => right.overlap - left.overlap)
    if (matches.length && (!matches[1] || matches[0].overlap > matches[1].overlap)) {
      renamed.set(legacy.gameId, matches[0].gameId)
    }
  }
  return renamed
}

export function removeStaleCheatSettings(settings: Record<string, string>) {
  return Object.fromEntries(Object.entries(settings).filter(([key]) => {
    const gameId = gameIdFromCheatSettingKey(key)
    return gameId === null || isCurrentGameId(gameId)
  }))
}

export function removeStaleLocalSettings() {
  const staleKeys: string[] = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key) continue
    const gameId = gameIdFromCheatSettingKey(key)
    if (gameId !== null && !isCurrentGameId(gameId)) staleKeys.push(key)
  }
  staleKeys.forEach(key => localStorage.removeItem(key))
}
