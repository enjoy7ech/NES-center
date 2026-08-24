import { useEffect, useRef, useState } from 'react'
import { createAppBackup, createGameBackup, restoreAppBackup, restoreGameBackup } from './emulator/backup'
import { removeStaleLocalSettings } from './emulator/gameIdentity'
import { RetroArchAdapter } from './emulator/retroarchAdapter'
import { inspectRom } from './emulator/rom'
import type { CheatRule, ControllerButton, EmulatorSpeed, EmulatorStatus, SaveStateSlot } from './emulator/types'

const buttons: Array<{ id: ControllerButton; label: string; className?: string }> = [
  { id: 'select', label: 'SELECT', className: 'utility-button' },
  { id: 'start', label: 'START', className: 'utility-button' },
  { id: 'b', label: 'B', className: 'action-button' },
  { id: 'a', label: 'A', className: 'action-button' },
]

const games = [
  {
    title: '重装机兵 SUPER HACK',
    englishTitle: 'METAL MAX',
    rom: '/ROMS/重装机兵-SUPER-HACK.nes',
    accent: '#d26451',
    cover: '/covers/metal-max.png',
    available: true,
  },
  {
    title: '吞食天地2 星云完美版 中文版',
    englishTitle: 'DESTINY OF AN EMPEROR II',
    rom: '/ROMS/吞食天地2-星云完美版-中文版.nes',
    accent: '#b65b3f',
    cover: '/covers/28620_7dd03b349c0d8059bef6d1942e6494c6.png',
    available: true,
  },
  {
    title: '三国志2 霸王的大陆',
    englishTitle: 'SANGOKUSHI II',
    rom: '/ROMS/三国志2-霸王的大陆.nes',
    accent: '#d0a23d',
    cover: '/covers/sangokushi2-bawang.png',
    available: true,
  },
  {
    title: '爆笑三国（修改版）',
    englishTitle: 'BAOXIAO SANGUO MOD',
    rom: '/ROMS/爆笑三国-修改版.nes',
    accent: '#4d83b7',
    cover: '/covers/baoxiao-sanguo-mod.png',
    available: true,
  },
  {
    title: '雷电皇 比卡丘传说',
    englishTitle: 'PIKACHU LEGEND',
    rom: '/ROMS/雷电皇_比卡丘传说.nes',
    accent: '#e8a51d',
    cover: '/covers/pikachu-legend.png',
    available: true,
  },
  {
    title: '最终幻想II',
    englishTitle: 'FINAL FANTASY II',
    rom: '/ROMS/最终幻想II.nes',
    accent: '#4f7d8d',
    cover: '/covers/final-fantasy-ii.jpg',
    available: true,
  },
]

type KeyboardAction = ControllerButton | 'quickSave' | 'quickLoad' | 'speedToggle' | 'coreMenu'
type KeyboardBindings = Record<KeyboardAction, string>

const keyboardBindingsKey = 'fc-center:keyboard-bindings'
const defaultKeyboardBindings: KeyboardBindings = {
  up: 'w', down: 's', left: 'a', right: 'd', b: 'q', a: 'e', select: ' ', start: 'Enter',
  quickSave: 'F5', quickLoad: 'F8', speedToggle: 'x', coreMenu: 'F1',
}
const controllerBindingOrder: ControllerButton[] = ['up', 'down', 'left', 'right', 'b', 'a', 'select', 'start']
const bindingOrder: KeyboardAction[] = [...controllerBindingOrder, 'quickSave', 'quickLoad', 'speedToggle', 'coreMenu']
const bindingGroups: Array<{ title: string; hint: string; actions: KeyboardAction[] }> = [
  { title: '游戏控制', hint: 'PLAYER 1', actions: controllerBindingOrder },
  { title: '快捷功能', hint: 'SYSTEM', actions: ['quickSave', 'quickLoad', 'speedToggle', 'coreMenu'] },
]

function loadKeyboardBindings(): KeyboardBindings {
  try {
    const stored = localStorage.getItem(keyboardBindingsKey)
    const saved = JSON.parse(stored ?? '{}') as Partial<KeyboardBindings>
    const candidates: KeyboardBindings = { ...defaultKeyboardBindings }
    for (const action of bindingOrder) {
      if (typeof saved[action] === 'string' && saved[action]) {
        candidates[action] = normalizeKeyboardKey(saved[action])
      }
    }
    // Migrate former defaults, including F9 which conflicts with RetroArch's
    // built-in mute shortcut, while retaining genuinely custom bindings.
    if (saved.speedToggle === 'F9' || saved.speedToggle === 'F3') {
      candidates.speedToggle = defaultKeyboardBindings.speedToggle
    }
    if (!stored && localStorage.getItem('fc-center:direction-preset') === 'arrows') {
      Object.assign(candidates, { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' })
    }

    // Always return a complete, collision-free table. This repairs partial or
    // legacy localStorage data before it can make one key trigger two actions.
    const bindings = {} as KeyboardBindings
    const usedKeys = new Set<string>()
    for (const action of bindingOrder) {
      const requested = candidates[action]
      const fallback = defaultKeyboardBindings[action]
      const key = !usedKeys.has(requested)
        ? requested
        : !usedKeys.has(fallback)
          ? fallback
          : Object.values(defaultKeyboardBindings).find(candidate => !usedKeys.has(candidate)) ?? fallback
      bindings[action] = key
      usedKeys.add(key)
    }
    localStorage.setItem(keyboardBindingsKey, JSON.stringify(bindings))
    return bindings
  } catch {
    return { ...defaultKeyboardBindings }
  }
}

function normalizeKeyboardKey(key: string) {
  return key.length === 1 ? key.toLowerCase() : key
}

function displayKeyboardKey(key: string) {
  const labels: Record<string, string> = { ' ': 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }
  return labels[key] ?? (key.length === 1 ? key.toUpperCase() : key)
}

const controlLabels: Record<KeyboardAction, string> = {
  up: '上',
  down: '下',
  left: '左',
  right: '右',
  select: '选择',
  start: '开始',
  b: 'B 键',
  a: 'A 键',
  quickSave: '快速存档',
  quickLoad: '快速读档',
  speedToggle: '倍速切换',
  coreMenu: '内核菜单',
}

type ControlButtonProps = {
  button: ControllerButton
  label: string
  className?: string
  onInput: (button: ControllerButton, pressed: boolean) => void
}

type DirectionButton = Extract<ControllerButton, 'up' | 'down' | 'left' | 'right'>

const nativeSwitchProps = { switch: '' } as React.InputHTMLAttributes<HTMLInputElement>
const quickSlotHoldMs = 600

function triggerHapticFeedback() {
  if (!('vibrate' in navigator)) return
  try {
    navigator.vibrate(12)
  } catch {
    // Haptics are optional and can be blocked by the browser or device settings.
  }
}

async function shareBackupFile(file: File, title: string) {
  if (!navigator.canShare?.({ files: [file] })) return false
  try {
    await navigator.share({ files: [file], title })
    return true
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') throw reason
    return false
  }
}

function ControlButton({ button, label, className = '', onInput }: ControlButtonProps) {
  const element = useRef<HTMLLabelElement>(null)
  const activePointer = useRef<number | null>(null)
  const pressedRef = useRef(false)
  const inputHandler = useRef(onInput)
  const [pressed, setPressed] = useState(false)
  inputHandler.current = onInput

  const updatePressed = (next: boolean) => {
    pressedRef.current = next
    setPressed(next)
  }

  const release = (pointerId?: number) => {
    if (pointerId !== undefined && activePointer.current !== pointerId) return
    const capturedPointer = activePointer.current
    if (capturedPointer === null && !pressedRef.current) return
    activePointer.current = null
    updatePressed(false)
    inputHandler.current(button, false)
    if (capturedPointer !== null && element.current?.hasPointerCapture(capturedPointer)) {
      element.current.releasePointerCapture(capturedPointer)
    }
    element.current?.querySelector('input')?.blur()
    element.current?.blur()
  }

  useEffect(() => {
    const releasePointer = (event: PointerEvent) => release(event.pointerId)
    const releaseAll = () => release()
    window.addEventListener('pointerup', releasePointer, true)
    window.addEventListener('pointercancel', releasePointer, true)
    window.addEventListener('blur', releaseAll)
    window.addEventListener('pagehide', releaseAll)
    document.addEventListener('visibilitychange', releaseAll)
    return () => {
      window.removeEventListener('pointerup', releasePointer, true)
      window.removeEventListener('pointercancel', releasePointer, true)
      window.removeEventListener('blur', releaseAll)
      window.removeEventListener('pagehide', releaseAll)
      document.removeEventListener('visibilitychange', releaseAll)
      if (pressedRef.current) inputHandler.current(button, false)
    }
  }, [button])

  return (
    <label
      ref={element}
      className={`control-button ${className}${pressed ? ' is-pressed' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={controlLabels[button]}
      onPointerDown={event => {
        if (event.button !== 0 || activePointer.current !== null) return
        activePointer.current = event.pointerId
        updatePressed(true)
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // Window-level release listeners cover older Safari pointer-capture failures.
        }
        triggerHapticFeedback()
        inputHandler.current(button, true)
      }}
      onPointerUp={event => release(event.pointerId)}
      onPointerCancel={event => release(event.pointerId)}
      onLostPointerCapture={() => release()}
      onContextMenu={event => event.preventDefault()}
      onKeyDown={event => {
        if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        updatePressed(true)
        triggerHapticFeedback()
        inputHandler.current(button, true)
      }}
      onKeyUp={event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        updatePressed(false)
        inputHandler.current(button, false)
      }}
    >
      <input
        {...nativeSwitchProps}
        className="ios-haptic-switch"
        type="checkbox"
        tabIndex={-1}
        aria-hidden="true"
      />
      <span className="control-button-text" aria-hidden="true">{label}</span>
    </label>
  )
}

function DirectionalPad({ onInput }: { onInput: (button: ControllerButton, pressed: boolean) => void }) {
  const element = useRef<HTMLDivElement>(null)
  const activePointer = useRef<number | null>(null)
  const pointerDirections = useRef(new Set<DirectionButton>())
  const keyboardDirections = useRef(new Set<DirectionButton>())
  const emittedDirections = useRef(new Set<DirectionButton>())
  const inputHandler = useRef(onInput)
  const [pressedDirections, setPressedDirections] = useState<Set<DirectionButton>>(() => new Set())
  inputHandler.current = onInput

  const applyDirections = () => {
    const next = new Set<DirectionButton>([...pointerDirections.current, ...keyboardDirections.current])
    for (const direction of emittedDirections.current) {
      if (!next.has(direction)) inputHandler.current(direction, false)
    }
    for (const direction of next) {
      if (!emittedDirections.current.has(direction)) inputHandler.current(direction, true)
    }
    emittedDirections.current = next
    setPressedDirections(new Set(next))
  }

  const directionsAt = (clientX: number, clientY: number): DirectionButton[] => {
    const rect = element.current?.getBoundingClientRect()
    if (!rect) return []
    const x = (clientX - (rect.left + rect.width / 2)) / (rect.width / 2)
    const y = (clientY - (rect.top + rect.height / 2)) / (rect.height / 2)
    const radius = Math.hypot(x, y)
    if (radius > 1 || radius < 0.16) return []

    if (Math.abs(x) >= Math.abs(y)) return [x >= 0 ? 'right' : 'left']
    return [y >= 0 ? 'down' : 'up']
  }

  const updatePointer = (clientX: number, clientY: number) => {
    const next = new Set(directionsAt(clientX, clientY))
    const changed = next.size !== pointerDirections.current.size
      || [...next].some(direction => !pointerDirections.current.has(direction))
    if (!changed) return
    pointerDirections.current = next
    applyDirections()
    if (next.size) triggerHapticFeedback()
  }

  const releasePointer = (pointerId?: number) => {
    if (pointerId !== undefined && activePointer.current !== pointerId) return
    const capturedPointer = activePointer.current
    activePointer.current = null
    pointerDirections.current.clear()
    applyDirections()
    if (capturedPointer !== null && element.current?.hasPointerCapture(capturedPointer)) {
      element.current.releasePointerCapture(capturedPointer)
    }
  }

  const setKeyboardDirection = (direction: DirectionButton, pressed: boolean) => {
    if (pressed) keyboardDirections.current.add(direction)
    else keyboardDirections.current.delete(direction)
    applyDirections()
  }

  useEffect(() => {
    const releaseActivePointer = (event: PointerEvent) => releasePointer(event.pointerId)
    const releaseAll = () => {
      activePointer.current = null
      pointerDirections.current.clear()
      keyboardDirections.current.clear()
      applyDirections()
    }
    window.addEventListener('pointerup', releaseActivePointer, true)
    window.addEventListener('pointercancel', releaseActivePointer, true)
    window.addEventListener('blur', releaseAll)
    window.addEventListener('pagehide', releaseAll)
    document.addEventListener('visibilitychange', releaseAll)
    return () => {
      window.removeEventListener('pointerup', releaseActivePointer, true)
      window.removeEventListener('pointercancel', releaseActivePointer, true)
      window.removeEventListener('blur', releaseAll)
      window.removeEventListener('pagehide', releaseAll)
      document.removeEventListener('visibilitychange', releaseAll)
      for (const direction of emittedDirections.current) inputHandler.current(direction, false)
    }
  }, [])

  const directionKey = (direction: DirectionButton, label: string) => (
    <label
      className={`control-button${pressedDirections.has(direction) ? ' is-pressed' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={controlLabels[direction]}
      aria-pressed={pressedDirections.has(direction)}
      onKeyDown={event => {
        if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        setKeyboardDirection(direction, true)
      }}
      onKeyUp={event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        setKeyboardDirection(direction, false)
      }}
      onContextMenu={event => event.preventDefault()}
    >
      <input {...nativeSwitchProps} className="ios-haptic-switch" type="checkbox" tabIndex={-1} aria-hidden="true" />
      <span className="control-button-text" aria-hidden="true">{label}</span>
    </label>
  )

  return (
    <div
      ref={element}
      className="d-pad"
      aria-label="圆盘方向键，可按住滑动切换单个方向"
      onPointerDown={event => {
        if (event.button !== 0 || activePointer.current !== null) return
        event.preventDefault()
        activePointer.current = event.pointerId
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // Window-level listeners still release input if pointer capture is unavailable.
        }
        updatePointer(event.clientX, event.clientY)
      }}
      onPointerMove={event => {
        if (activePointer.current !== event.pointerId) return
        event.preventDefault()
        updatePointer(event.clientX, event.clientY)
      }}
      onPointerUp={event => releasePointer(event.pointerId)}
      onPointerCancel={event => releasePointer(event.pointerId)}
      onLostPointerCapture={() => releasePointer()}
    >
      {directionKey('up', '↑')}
      {directionKey('left', '←')}
      <span className="d-pad-center" aria-hidden="true" />
      {directionKey('right', '→')}
      {directionKey('down', '↓')}
    </div>
  )
}

function HoldActionButton({
  icon,
  label,
  disabled = false,
  onPress,
  onHold,
}: {
  icon: string
  label: string
  disabled?: boolean
  onPress: () => void
  onHold: () => void
}) {
  const timer = useRef<number | null>(null)
  const [holding, setHolding] = useState(false)

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
  }, [])

  const cancelHold = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
  }

  return (
    <button
      type="button"
      className={holding ? 'is-holding' : ''}
      disabled={disabled}
      aria-label={`${label}，短按选择槽位，长按约半秒使用快速槽位`}
      onPointerDown={event => {
        if (disabled || event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        setHolding(true)
        timer.current = window.setTimeout(() => {
          timer.current = null
          setHolding(false)
          triggerHapticFeedback()
          onHold()
        }, quickSlotHoldMs)
      }}
      onPointerUp={event => {
        const shouldPress = timer.current !== null
        cancelHold()
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        if (shouldPress) onPress()
      }}
      onPointerCancel={cancelHold}
      onLostPointerCapture={cancelHold}
      onClick={event => {
        // Keyboard-generated clicks have detail 0; pointer clicks are handled above.
        if (event.detail === 0 && !disabled) onPress()
      }}
      onContextMenu={event => event.preventDefault()}
    >
      <span>{icon}</span>{label}
    </button>
  )
}

type GameTool = 'save' | 'load' | 'cheats'

const saveSlots = [
  { slot: -2, label: 'AUTO' },
  { slot: -1, label: 'QUICK' },
  ...Array.from({ length: 8 }, (_, index) => ({
    slot: index,
    label: `SLOT ${String(index + 1).padStart(2, '0')}`,
  })),
]
const maxCheats = 16
const autoSaveIntervalMs = 30_000
const gameSpeeds: EmulatorSpeed[] = [1, 2, 5]
const gameGeniePattern = /^[APZLGITYEOXUKSVN]{6}(?:[APZLGITYEOXUKSVN]{2})?$/
const rawCheatPattern = /^(?:[0-9A-F]{4}:[0-9A-F]{2}|[0-9A-F]{4}\?[0-9A-F]{2}:[0-9A-F]{2})$/
const parCheatPattern = /^[0-9A-F]{8}$/

function normalizeCheatCode(value: string) {
  const parts = value.trim().toUpperCase().replace(/-/g, '').split(/[+,;._\s]+/).filter(Boolean)
  if (!parts.length) return null
  if (!parts.every(part => gameGeniePattern.test(part) || rawCheatPattern.test(part) || parCheatPattern.test(part))) {
    return null
  }
  return parts.join('+')
}

async function loadBuiltInCheats(fileName: string): Promise<CheatRule[]> {
  const romName = fileName.replace(/\.[^.]+$/, '')
  const response = await fetch(`/cheat/${encodeURIComponent(romName)}.json`)
  if (response.status === 404 || response.status === 204) return []
  if (!response.ok) throw new Error(`金手指文件请求失败：${response.status}`)
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('json')) return []
  const payload = await response.json().catch(() => null) as {
    cheats?: Array<{ id?: unknown; name?: unknown; code?: unknown; enabled?: unknown }>
  } | null
  if (!payload) return []
  if (!Array.isArray(payload.cheats)) return []
  return payload.cheats.flatMap((item, index) => {
    if (typeof item.code !== 'string') return []
    const code = normalizeCheatCode(item.code)
    if (!code) return []
    return [{
      id: `builtin:${romName}:${typeof item.id === 'string' && item.id ? item.id : index}`,
      name: typeof item.name === 'string' ? item.name : undefined,
      code,
      enabled: item.enabled === true,
      builtIn: true,
    }]
  })
}

function mergeBuiltInCheats(saved: CheatRule[], builtIns: CheatRule[]) {
  const builtInIds = new Set(builtIns.map(cheat => cheat.id))
  const builtInCodes = new Set(builtIns.map(cheat => cheat.code))
  const mergedBuiltIns = builtIns.map(cheat => {
    const previous = saved.find(item => item.id === cheat.id || item.code === cheat.code)
    return previous ? { ...cheat, enabled: previous.enabled } : cheat
  })
  const custom = saved.filter(cheat => !cheat.builtIn && !builtInIds.has(cheat.id) && !builtInCodes.has(cheat.code))
  return [...mergedBuiltIns, ...custom].slice(0, maxCheats)
}

function formatSaveTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(timestamp)
}

function SaveSlotCard({
  slot,
  label,
  saved,
  busy,
  disabled,
  isSaveMode,
  onActivate,
  onDelete,
}: {
  slot: number
  label: string
  saved?: SaveStateSlot
  busy: boolean
  disabled: boolean
  isSaveMode: boolean
  onActivate: () => void
  onDelete: () => void
}) {
  const holdTimer = useRef<number | null>(null)
  const suppressClick = useRef(false)
  const [showDelete, setShowDelete] = useState(false)

  const clearHold = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current)
    holdTimer.current = null
  }

  useEffect(() => clearHold, [])

  return (
    <div className={`save-slot${saved ? ' is-filled' : ''}${slot === -2 ? ' is-auto-slot' : ''}${slot === -1 ? ' is-quick-slot' : ''}${disabled ? ' is-disabled' : ''}${showDelete ? ' is-delete-visible' : ''}`}>
      <button
        type="button"
        className="save-slot-main"
        disabled={disabled}
        onPointerDown={event => {
          if (!saved || disabled || event.button !== 0) return
          suppressClick.current = false
          holdTimer.current = window.setTimeout(() => {
            holdTimer.current = null
            suppressClick.current = true
            setShowDelete(true)
            triggerHapticFeedback()
          }, 650)
        }}
        onPointerUp={() => {
          const wasLongPress = suppressClick.current
          clearHold()
          suppressClick.current = false
          if (!wasLongPress) {
            setShowDelete(false)
            onActivate()
          }
        }}
        onPointerCancel={() => {
          clearHold()
          suppressClick.current = false
        }}
        onPointerLeave={() => {
          if (!suppressClick.current) clearHold()
        }}
        onClick={event => {
          // Pointer activation is handled on pointerup. Keep native click only
          // for keyboard accessibility to prevent a second slot action.
          if (event.detail !== 0) {
            event.preventDefault()
          } else {
            setShowDelete(false)
            onActivate()
          }
        }}
      >
        <span className="save-slot-number">{label}</span>
        <span className="save-slot-preview">
          {saved?.thumbnail ? <img src={saved.thumbnail} alt="" /> : <i aria-hidden="true" />}
        </span>
        <span className="save-slot-time">
          {busy ? (isSaveMode ? '保存中…' : '处理中…') : saved ? formatSaveTime(saved.updatedAt) : '空槽位'}
        </span>
      </button>
      {showDelete && saved && (
        <button
          type="button"
          className="save-slot-delete"
          disabled={busy}
          onClick={() => {
            setShowDelete(false)
            onDelete()
          }}
        >删除</button>
      )}
    </div>
  )
}

function GameToolsDialog({
  mode,
  slots,
  busySlot,
  cheats,
  onSave,
  onLoad,
  onDelete,
  onAddCheat,
  onToggleCheat,
  onRemoveCheat,
  onExportGame,
  onImportGame,
  onClose,
}: {
  mode: GameTool
  slots: SaveStateSlot[]
  busySlot: number | null
  cheats: CheatRule[]
  onSave: (slot: number) => void
  onLoad: (slot: number) => void
  onDelete: (slot: number) => void
  onAddCheat: (code: string) => void
  onToggleCheat: (id: string) => void
  onRemoveCheat: (id: string) => void
  onExportGame: () => ReturnType<typeof createGameBackup>
  onImportGame: (json: string) => ReturnType<typeof restoreGameBackup>
  onClose: () => void
}) {
  const [cheatCode, setCheatCode] = useState('')
  const [cheatError, setCheatError] = useState('')
  const [exportBusy, setExportBusy] = useState(false)
  const [exportStatus, setExportStatus] = useState('')
  const [exportDownload, setExportDownload] = useState<{ url: string; fileName: string } | null>(null)
  const exportDownloadUrl = useRef('')
  const gameBackupInput = useRef<HTMLInputElement>(null)
  const isSaveMode = mode === 'save'
  const title = isSaveMode ? '存档' : mode === 'load' ? '读档' : '金手指'

  useEffect(() => () => {
    if (exportDownloadUrl.current) URL.revokeObjectURL(exportDownloadUrl.current)
  }, [])

  const clearExportDownload = () => {
    if (exportDownloadUrl.current) URL.revokeObjectURL(exportDownloadUrl.current)
    exportDownloadUrl.current = ''
    setExportDownload(null)
  }

  const downloadGameBackup = (file: File) => {
    clearExportDownload()
    const url = URL.createObjectURL(file)
    exportDownloadUrl.current = url
    setExportDownload({ url, fileName: file.name })
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const exportGame = async () => {
    if (exportBusy || busySlot !== null) return
    clearExportDownload()
    setExportBusy(true)
    setExportStatus('正在导出…')
    try {
      const { fileName, json, summary } = await onExportGame()
      const file = new File([json], fileName, { type: 'application/json' })
      const shared = await shareBackupFile(file, `${fileName.replace(/\.json$/i, '')}`)
      if (!shared) downloadGameBackup(file)
      setExportStatus(`已导出 ${summary.saveStateCount} 个槽位${summary.settingCount ? '和金手指配置' : ''}`)
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') setExportStatus('已取消')
      else setExportStatus(reason instanceof Error ? reason.message : '导出失败')
    } finally {
      setExportBusy(false)
    }
  }

  const importGame = async (file: File) => {
    if (exportBusy || busySlot !== null) return
    if (file.size > 192 * 1024 * 1024) {
      setExportStatus('备份文件超过 192 MB')
      return
    }
    clearExportDownload()
    setExportBusy(true)
    setExportStatus('正在导入…')
    try {
      const summary = await onImportGame(await file.text())
      setExportStatus(`已导入 ${summary.saveStateCount} 个槽位${summary.settingCount ? '；重新进入游戏后金手指生效' : ''}`)
    } catch (reason) {
      setExportStatus(reason instanceof Error ? reason.message : '导入失败')
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <div className="pixel-dialog-backdrop" onPointerDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="pixel-dialog" role="dialog" aria-modal="true" aria-labelledby="game-tool-title">
        <header className="pixel-dialog-heading">
          <div>
            <span>8-BIT SYSTEM</span>
            <h2 id="game-tool-title">{title}</h2>
          </div>
          <button type="button" aria-label={`关闭${title}`} onClick={onClose}>×</button>
        </header>

        {mode !== 'cheats' ? (
          <div className="save-slot-grid" aria-label="8 个普通槽位、1 个自动槽位和 1 个快速槽位">
            {saveSlots.map(({ slot, label }) => {
              const saved = slots.find(item => item.slot === slot)
              const isBusy = busySlot === slot
              return <SaveSlotCard
                key={slot}
                slot={slot}
                label={label}
                saved={saved}
                busy={isBusy}
                disabled={busySlot !== null || (!isSaveMode && !saved)}
                isSaveMode={isSaveMode}
                onActivate={() => isSaveMode ? onSave(slot) : onLoad(slot)}
                onDelete={() => onDelete(slot)}
              />
            })}
          </div>
        ) : (
          <div className="pixel-cheat-panel">
            <form className="pixel-cheat-form" onSubmit={event => {
              event.preventDefault()
              const normalized = normalizeCheatCode(cheatCode)
              if (!normalized) {
                setCheatError('代码格式无效，请输入 Game Genie、PAR 或 xxxx:xx')
                return
              }
              onAddCheat(normalized)
              setCheatCode('')
              setCheatError('')
            }}>
              <label htmlFor="cheat-code">输入 Game Genie / PAR 代码</label>
              <div>
                <input
                  id="cheat-code"
                  value={cheatCode}
                  maxLength={32}
                  disabled={cheats.length >= maxCheats}
                  placeholder="例如 SXIOPO"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(cheatError)}
                  aria-describedby={cheatError ? 'cheat-code-error' : undefined}
                  onChange={event => {
                    setCheatCode(event.target.value.toUpperCase())
                    if (cheatError) setCheatError('')
                  }}
                />
                <button type="submit" disabled={cheats.length >= maxCheats || !cheatCode.trim()}>添加</button>
              </div>
              {cheatError && <p id="cheat-code-error" className="pixel-cheat-error" role="alert">{cheatError}</p>}
            </form>
            <div className="pixel-cheat-list" aria-label="金手指列表">
              {cheats.length === 0 ? (
                <div className="pixel-empty-list">尚未添加代码</div>
              ) : cheats.map(cheat => (
                <div className="pixel-cheat-row" key={cheat.id}>
                  <button
                    type="button"
                    className={cheat.enabled ? 'is-enabled' : ''}
                    aria-pressed={cheat.enabled}
                    onClick={() => onToggleCheat(cheat.id)}
                  >{cheat.enabled ? 'ON' : 'OFF'}</button>
                  <span className="pixel-cheat-code">
                    {cheat.name && <strong>{cheat.name}</strong>}
                    <code>{cheat.code.replace(/\+/g, ' · ')}</code>
                  </span>
                  {cheat.builtIn
                    ? <span className="pixel-cheat-built-in">内置</span>
                    : <button type="button" aria-label={`删除 ${cheat.code}`} onClick={() => onRemoveCheat(cheat.id)}>×</button>}
                </div>
              ))}
            </div>
          </div>
        )}

        <footer className="pixel-dialog-footer">
          {isSaveMode && (
            <div className="game-export-actions">
              <button type="button" disabled={exportBusy || busySlot !== null} onClick={() => void exportGame()}>
                {exportBusy ? '处理中…' : '导出本游戏'}
              </button>
              <button type="button" disabled={exportBusy || busySlot !== null} onClick={() => gameBackupInput.current?.click()}>
                导入本游戏
              </button>
              <input
                ref={gameBackupInput}
                type="file"
                accept="application/json,.json"
                onChange={event => {
                  const file = event.currentTarget.files?.[0]
                  event.currentTarget.value = ''
                  if (file) void importGame(file)
                }}
              />
              {exportStatus && <span>{exportStatus}</span>}
              {exportDownload && (
                <a href={exportDownload.url} download={exportDownload.fileName}>保存文件</a>
              )}
            </div>
          )}
          <button type="button" onClick={onClose}>返回游戏</button>
        </footer>
      </section>
    </div>
  )
}

function HomePage({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [activeGame, setActiveGame] = useState(0)

  useEffect(() => {
    document.body.classList.add('home-page-active')
    return () => document.body.classList.remove('home-page-active')
  }, [])

  const moveCarousel = (direction: number) => {
    setActiveGame(current => (current + direction + games.length) % games.length)
  }

  const getOffset = (index: number) => {
    let offset = index - activeGame
    if (offset > games.length / 2) offset -= games.length
    if (offset < -games.length / 2) offset += games.length
    return offset
  }

  return (
    <main
      className="home-shell"
      onKeyDown={event => {
        if (event.key === 'ArrowLeft') moveCarousel(-1)
        if (event.key === 'ArrowRight') moveCarousel(1)
      }}
    >
      <div className="retro-atmosphere" aria-hidden="true">
        <div className="retro-grid" />
        <div className="retro-scan" />
        {Array.from({ length: 18 }, (_, index) => (
          <span
            className="pixel-star"
            key={index}
            style={{
              '--star-x': `${(index * 37 + 11) % 96}%`,
              '--star-y': `${(index * 53 + 7) % 84}%`,
              '--star-delay': `${(index % 6) * -.7}s`,
              '--star-size': `${index % 3 + 2}px`,
            } as React.CSSProperties}
          />
        ))}
        <div className="nes-ornament ornament-left">
          <span className="mini-dpad mini-dpad-horizontal" />
          <span className="mini-dpad mini-dpad-vertical" />
        </div>
        <div className="nes-ornament ornament-right">
          <span />
          <span />
        </div>
      </div>
      <section className="cartridge-carousel" aria-label="游戏卡带轮播">
        <button className="carousel-arrow carousel-arrow-left" aria-label="上一张卡带" onClick={() => moveCarousel(-1)}>←</button>
        <div className="carousel-stage">
          {games.map((game, index) => {
            const offset = getOffset(index)
            const distance = Math.abs(offset)
            const isActive = index === activeGame
            return (
              <button
                className={`carousel-item${isActive ? ' is-active' : ''}${distance > 1 ? ' is-far' : ''}`}
                style={{
                  '--offset': offset,
                  '--depth': Math.max(.7, 1 - distance * .14),
                  '--item-z': games.length - distance,
                  '--item-zpos': `${distance * -120}px`,
                } as React.CSSProperties}
                key={game.rom}
                aria-label={isActive && game.available ? `游玩${game.title}` : `选择${game.title}`}
                aria-current={isActive ? 'true' : undefined}
                tabIndex={isActive ? 0 : -1}
                onClick={() => {
                  if (!isActive) {
                    setActiveGame(index)
                    return
                  }
                  if (game.available && game.rom) window.location.href = `/?rom=${encodeURIComponent(game.rom)}`
                }}
              >
                <article className="cartridge" style={{ '--cartridge-accent': game.accent } as React.CSSProperties}>
                  <div className="cartridge-grip" aria-hidden="true">
                    {Array.from({ length: 7 }, (_, gripIndex) => <span key={gripIndex} />)}
                  </div>
                  <span className="cartridge-rail cartridge-rail-left" aria-hidden="true" />
                  <span className="cartridge-rail cartridge-rail-right" aria-hidden="true" />
                  <span className="cartridge-screw cartridge-screw-left" aria-hidden="true" />
                  <span className="cartridge-screw cartridge-screw-right" aria-hidden="true" />
                  <div className="cartridge-label">
                    {game.cover ? (
                      <img src={game.cover} alt="" />
                    ) : (
                      <div className="cover-placeholder" aria-hidden="true">
                        <span className="cover-pixels" />
                        <span className="cover-system">8-BIT / FC</span>
                        <span className="cover-code">{game.englishTitle}</span>
                      </div>
                    )}
                  </div>
                  <div className="cartridge-notch" aria-hidden="true" />
                </article>
              </button>
            )
          })}
        </div>
        <button className="carousel-arrow carousel-arrow-right" aria-label="下一张卡带" onClick={() => moveCarousel(1)}>→</button>
        <div className="carousel-caption" aria-live="polite">
          <strong>{games[activeGame].title}</strong>
          <span>{games[activeGame].available ? '点击卡带开始游戏' : '卡带未安装'}</span>
          <span>{activeGame + 1} / {games.length}</span>
        </div>
      </section>
      <button className="home-settings-button" aria-label="系统设置" onClick={onOpenSettings}>设置</button>
    </main>
  )
}

function EmulatorPage({ keyboardBindings }: { keyboardBindings: KeyboardBindings }) {
  const emulatorHost = useRef<HTMLDivElement>(null)
  const adapter = useRef<RetroArchAdapter | null>(null)
  const [status, setStatus] = useState<EmulatorStatus>('idle')
  const [error, setError] = useState('')
  const [activeTool, setActiveTool] = useState<GameTool | null>(null)
  const [saveStateSlots, setSaveStateSlots] = useState<SaveStateSlot[]>([])
  const [busySlot, setBusySlot] = useState<number | null>(null)
  const [quickBusy, setQuickBusy] = useState(false)
  const stateOperationBusy = useRef(false)
  const [gameSpeed, setGameSpeed] = useState<EmulatorSpeed>(1)
  const romPath = new URLSearchParams(window.location.search).get('rom') ?? 'game'
  const gameTitle = (romPath.split('/').pop() ?? 'game').replace(/\.[^.]+$/, '')
  const cheatStorageKey = `fc-center:cheats:${romPath}`
  const [cheats, setCheats] = useState<CheatRule[]>(() => {
    try {
      removeStaleLocalSettings()
      return JSON.parse(localStorage.getItem(cheatStorageKey) ?? '[]') as CheatRule[]
    } catch {
      return []
    }
  })

  useEffect(() => {
    if (!emulatorHost.current) return
    adapter.current = new RetroArchAdapter(emulatorHost.current, {
      onStatus: next => setStatus(next),
      onError: message => setError(message),
    })
    return () => adapter.current?.destroy()
  }, [])

  useEffect(() => {
    adapter.current?.setCheats(cheats)
    localStorage.setItem(cheatStorageKey, JSON.stringify(cheats))
  }, [cheatStorageKey, cheats])

  useEffect(() => {
    if (!activeTool) return
    adapter.current?.releaseInputs()
  }, [activeTool])

  useEffect(() => {
    const releaseInputs = () => adapter.current?.releaseInputs()
    const keyToButton = new Map(controllerBindingOrder.map(button => [keyboardBindings[button], button] as const))
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.isTrusted) return
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const button = keyToButton.get(normalizeKeyboardKey(event.key))
      if (button) {
        event.preventDefault()
        event.stopImmediatePropagation()
        adapter.current?.setInput({ button, pressed: true })
      }
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (!event.isTrusted) return
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const button = keyToButton.get(normalizeKeyboardKey(event.key))
      if (!button) return
      event.preventDefault()
      event.stopImmediatePropagation()
      adapter.current?.setInput({ button, pressed: false })
    }
    window.addEventListener('blur', releaseInputs)
    document.addEventListener('visibilitychange', releaseInputs)
    window.addEventListener('keydown', handleKeyDown, { capture: true, passive: false })
    window.addEventListener('keyup', handleKeyUp, { capture: true, passive: false })
    return () => {
      releaseInputs()
      window.removeEventListener('blur', releaseInputs)
      document.removeEventListener('visibilitychange', releaseInputs)
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
    }
  }, [keyboardBindings])

  const startRom = (buffer: ArrayBuffer, fileName: string) => {
    try {
      inspectRom(buffer)
      setError('')
      adapter.current?.loadRom(buffer, fileName)
    } catch (reason) {
      setStatus('error')
      setError(reason instanceof Error ? reason.message : 'ROM 校验失败。')
    }
  }

  const sendButton = (button: ControllerButton, pressed: boolean) => {
    adapter.current?.setInput({ button, pressed })
  }

  const openTool = (tool: GameTool) => {
    if (status !== 'running' && status !== 'paused') {
      setError('请等待游戏载入完成。')
      return
    }
    setActiveTool(tool)
    if (tool !== 'cheats') {
      void adapter.current?.listSaveStates()
        .then(setSaveStateSlots)
        .catch(reason => setError(reason instanceof Error ? reason.message : '读取槽位失败。'))
    }
  }

  const useQuickSlot = (mode: 'save' | 'load') => {
    if (status !== 'running' && status !== 'paused') {
      setError('请等待游戏载入完成。')
      return
    }
    if (quickBusy || busySlot !== null || stateOperationBusy.current) return
    stateOperationBusy.current = true
    setQuickBusy(true)
    const action = mode === 'save' ? adapter.current?.saveState(-1) : adapter.current?.loadState(-1)
    if (!action) {
      stateOperationBusy.current = false
      setQuickBusy(false)
      return
    }
    void action
      .then(saved => {
        if (mode === 'load' && !saved) {
          setError('快速槽位还没有存档。')
          return
        }
        setError('')
        triggerHapticFeedback()
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : `${mode === 'save' ? '存档' : '读档'}失败`))
      .finally(() => {
        stateOperationBusy.current = false
        setQuickBusy(false)
      })
  }

  useEffect(() => {
    if (status !== 'running') return
    const timer = window.setInterval(() => {
      if (
        document.visibilityState !== 'visible'
        || activeTool !== null
        || busySlot !== null
        || stateOperationBusy.current
      ) return
      const currentAdapter = adapter.current
      if (!currentAdapter) return
      stateOperationBusy.current = true
      setQuickBusy(true)
      void currentAdapter.saveState(-2)
        .catch(reason => console.warn(reason instanceof Error ? `定时存档失败：${reason.message}` : '定时存档失败。'))
        .finally(() => {
          stateOperationBusy.current = false
          setQuickBusy(false)
        })
    }, autoSaveIntervalMs)
    return () => window.clearInterval(timer)
  }, [activeTool, busySlot, status])

  const cycleGameSpeed = () => {
    if (status !== 'running' && status !== 'paused') {
      setError('请等待游戏载入完成。')
      return
    }
    const currentIndex = gameSpeeds.indexOf(gameSpeed)
    const nextSpeed = gameSpeeds[(currentIndex + 1) % gameSpeeds.length]
    if (!adapter.current?.setSpeed(nextSpeed)) return
    setGameSpeed(nextSpeed)
    setError('')
    triggerHapticFeedback()
  }

  useEffect(() => {
    const handleQuickAction = (event: KeyboardEvent) => {
      if (!event.isTrusted || event.repeat) return
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const key = normalizeKeyboardKey(event.key)
      const mode = key === keyboardBindings.quickSave ? 'save' : key === keyboardBindings.quickLoad ? 'load' : null
      const isSpeedToggle = key === keyboardBindings.speedToggle
      const isCoreMenu = key === keyboardBindings.coreMenu
      if (!mode && !isSpeedToggle && !isCoreMenu) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (isCoreMenu) adapter.current?.toggleMenu()
      else if (isSpeedToggle) cycleGameSpeed()
      else if (mode) useQuickSlot(mode)
    }
    const blockQuickActionKeyUp = (event: KeyboardEvent) => {
      const key = normalizeKeyboardKey(event.key)
      if (
        key !== keyboardBindings.quickSave
        && key !== keyboardBindings.quickLoad
        && key !== keyboardBindings.speedToggle
        && key !== keyboardBindings.coreMenu
      ) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', handleQuickAction, true)
    window.addEventListener('keyup', blockQuickActionKeyUp, true)
    return () => {
      window.removeEventListener('keydown', handleQuickAction, true)
      window.removeEventListener('keyup', blockQuickActionKeyUp, true)
    }
  }, [gameSpeed, keyboardBindings.coreMenu, keyboardBindings.quickLoad, keyboardBindings.quickSave, keyboardBindings.speedToggle, quickBusy, status])

  const saveToSlot = (slot: number) => {
    if (stateOperationBusy.current) return
    stateOperationBusy.current = true
    setBusySlot(slot)
    void adapter.current?.saveState(slot)
      .then(saved => {
        if (!saved) return
        setSaveStateSlots(current => [...current.filter(item => item.slot !== slot), saved].sort((a, b) => a.slot - b.slot))
        setError('')
        triggerHapticFeedback()
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : '保存失败。'))
      .finally(() => {
        stateOperationBusy.current = false
        setBusySlot(null)
      })
  }

  const loadFromSlot = (slot: number) => {
    if (stateOperationBusy.current) return
    stateOperationBusy.current = true
    setBusySlot(slot)
    void adapter.current?.loadState(slot)
      .then(saved => {
        if (!saved) setError('该槽位没有存档。')
        else setError('')
        if (saved) triggerHapticFeedback()
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : '读取失败。'))
      .finally(() => {
        stateOperationBusy.current = false
        setBusySlot(null)
      })
  }

  const deleteSlot = (slot: number) => {
    if (stateOperationBusy.current) return
    stateOperationBusy.current = true
    setBusySlot(slot)
    void adapter.current?.deleteState(slot)
      .then(() => {
        setSaveStateSlots(current => current.filter(item => item.slot !== slot))
        setError('')
        triggerHapticFeedback()
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : '删除存档失败。'))
      .finally(() => {
        stateOperationBusy.current = false
        setBusySlot(null)
      })
  }

  const updateCheats = (next: CheatRule[]) => {
    setCheats(next)
    triggerHapticFeedback()
  }

  useEffect(() => {
    const romPath = new URLSearchParams(window.location.search).get('rom')
    if (!romPath || !romPath.startsWith('/')) return
    const fileName = romPath.split('/').pop() ?? 'test.nes'
    setError('正在加载内置测试 ROM。')
    const romRequest = fetch(romPath).then(response => {
      if (!response.ok) throw new Error(`ROM 请求失败：${response.status}`)
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
      if (contentType.includes('text/html')) {
        throw new Error('ROM 地址返回了网页而不是游戏文件，请更新或重启 PWA 后重试。')
      }
      return response.arrayBuffer()
    })
    const cheatRequest = loadBuiltInCheats(fileName).catch(reason => {
      console.warn(reason instanceof Error ? reason.message : '内置金手指加载失败。')
      return []
    })
    void Promise.all([romRequest, cheatRequest])
      .then(([buffer, builtIns]) => {
        const mergedCheats = mergeBuiltInCheats(cheats, builtIns)
        setCheats(mergedCheats)
        adapter.current?.setCheats(mergedCheats)
        startRom(buffer, fileName)
      })
      .catch(reason => {
        setStatus('error')
        setError(reason instanceof Error ? reason.message : '内置测试 ROM 加载失败。')
      })
  }, [])

  return (
    <main className="app-shell">
      <section className="console" aria-label="FC 模拟器">
        <div className="side-controls side-controls-left">
          <DirectionalPad onInput={sendButton} />
        </div>

        <div className="game-column">
          <nav className="quick-tools" aria-label="游戏快捷功能">
            <HoldActionButton
              icon="▣"
              label="存档"
              disabled={quickBusy}
              onPress={() => openTool('save')}
              onHold={() => useQuickSlot('save')}
            />
            <HoldActionButton
              icon="▶"
              label="读档"
              disabled={quickBusy}
              onPress={() => openTool('load')}
              onHold={() => useQuickSlot('load')}
            />
            <button
              type="button"
              className={gameSpeed > 1 ? 'is-speed-active' : ''}
              aria-pressed={gameSpeed > 1}
              onClick={cycleGameSpeed}
            ><span>»</span>倍速 {gameSpeed}×</button>
            <button type="button" onClick={() => openTool('cheats')}><span>★</span>金手指</button>
          </nav>
          <div className="screen-wrap">
            <div ref={emulatorHost} className="emulator-host">
              <div className="empty-screen">
                <span className="signal-dot" />
                <strong>准备好开始</strong>
                <span>等待游戏载入</span>
              </div>
            </div>
          </div>
          <div className="center-controls">
            {buttons.slice(0, 2).map(button => (
              <ControlButton
                key={button.id}
                button={button.id}
                label={button.label}
                className={button.className}
                onInput={sendButton}
              />
            ))}
          </div>
        </div>

        <div className="side-controls side-controls-right">
          <div className="action-controls">
            {buttons.slice(2).map(button => (
              <ControlButton
                key={button.id}
                button={button.id}
                label={button.label}
                className={button.className}
                onInput={sendButton}
              />
            ))}
          </div>
        </div>
      </section>

      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {activeTool && (
        <GameToolsDialog
          mode={activeTool}
          slots={saveStateSlots}
          busySlot={busySlot}
          cheats={cheats}
          onSave={saveToSlot}
          onLoad={loadFromSlot}
          onDelete={deleteSlot}
          onAddCheat={code => {
            const normalized = normalizeCheatCode(code)
            if (!normalized || cheats.some(cheat => cheat.code === normalized) || cheats.length >= maxCheats) return
            updateCheats([...cheats, { id: crypto.randomUUID(), code: normalized, enabled: true }])
          }}
          onToggleCheat={id => updateCheats(cheats.map(cheat => cheat.id === id ? { ...cheat, enabled: !cheat.enabled } : cheat))}
          onRemoveCheat={id => updateCheats(cheats.filter(cheat => cheat.id !== id))}
          onExportGame={() => {
            const gameId = adapter.current?.getGameId()
            if (!gameId) throw new Error('游戏尚未准备好，不能导出。')
            return createGameBackup(gameId, gameTitle, [cheatStorageKey])
          }}
          onImportGame={async json => {
            const currentAdapter = adapter.current
            const gameId = currentAdapter?.getGameId()
            if (!currentAdapter || !gameId) throw new Error('游戏尚未准备好，不能导入。')
            const summary = await restoreGameBackup(json, gameId, [cheatStorageKey])
            setSaveStateSlots(await currentAdapter.listSaveStates())
            return summary
          }}
          onClose={() => setActiveTool(null)}
        />
      )}
    </main>
  )
}

function KeyboardSettings({
  bindings,
  onBind,
  onReset,
  onImported,
  onClose,
}: {
  bindings: KeyboardBindings
  onBind: (button: KeyboardAction, key: string) => void
  onReset: () => void
  onImported: () => void
  onClose: () => void
}) {
  const [capturing, setCapturing] = useState<KeyboardAction | null>(null)
  const [captureError, setCaptureError] = useState('')
  const [backupStatus, setBackupStatus] = useState('')
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupDownload, setBackupDownload] = useState<{ url: string; fileName: string } | null>(null)
  const backupInput = useRef<HTMLInputElement>(null)
  const backupDownloadUrl = useRef('')

  const clearBackupDownload = () => {
    if (backupDownloadUrl.current) URL.revokeObjectURL(backupDownloadUrl.current)
    backupDownloadUrl.current = ''
    setBackupDownload(null)
  }

  const offerBackupDownload = (file: File) => {
    clearBackupDownload()
    const url = URL.createObjectURL(file)
    backupDownloadUrl.current = url
    setBackupDownload({ url, fileName: file.name })
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  useEffect(() => () => {
    if (backupDownloadUrl.current) URL.revokeObjectURL(backupDownloadUrl.current)
  }, [])

  const exportBackup = async () => {
    if (backupBusy) return
    clearBackupDownload()
    setBackupBusy(true)
    setBackupStatus('正在生成全量备份…')
    try {
      const { fileName, json, summary } = await createAppBackup()
      const file = new File([json], fileName, { type: 'application/json' })
      let downloaded = false
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: '董哥的小霸王全量备份' })
          clearBackupDownload()
        } catch (reason) {
          if (reason instanceof DOMException && reason.name === 'AbortError') throw reason
          offerBackupDownload(file)
          downloaded = true
        }
      } else {
        offerBackupDownload(file)
        downloaded = true
      }
      setBackupStatus(
        `已导出 ${summary.gameCount} 个游戏、${summary.saveStateCount} 个存档槽位和 ${summary.settingCount} 项配置。${downloaded ? '若没有自动保存，请点击下方链接。' : ''}`,
      )
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') {
        setBackupStatus('已取消导出。')
      } else {
        setBackupStatus(reason instanceof Error ? reason.message : '导出备份失败。')
      }
    } finally {
      setBackupBusy(false)
    }
  }

  const importBackup = async (file: File) => {
    if (backupBusy) return
    if (file.size > 192 * 1024 * 1024) {
      setBackupStatus('备份文件超过 192 MB，无法导入。')
      return
    }
    setBackupBusy(true)
    setBackupStatus('正在校验并导入备份…')
    try {
      const summary = await restoreAppBackup(await file.text())
      onImported()
      setBackupStatus(`已导入 ${summary.gameCount} 个游戏、${summary.saveStateCount} 个存档槽位和 ${summary.settingCount} 项配置；重新进入游戏后全部配置生效。`)
    } catch (reason) {
      setBackupStatus(reason instanceof Error ? reason.message : '导入备份失败。')
    } finally {
      setBackupBusy(false)
    }
  }

  useEffect(() => {
    if (!capturing) return
    const captureKey = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.repeat) return
      if (event.key === 'Escape') {
        setCapturing(null)
        setCaptureError('')
        return
      }
      const key = normalizeKeyboardKey(event.key)
      if (key === 'p') {
        setCaptureError('P 键保留用于打开设置')
        return
      }
      onBind(capturing, key)
      setCapturing(null)
      setCaptureError('')
    }
    window.addEventListener('keydown', captureKey, true)
    return () => window.removeEventListener('keydown', captureKey, true)
  }, [capturing, onBind])

  return (
    <div className="keyboard-settings-backdrop" onPointerDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="keyboard-settings" role="dialog" aria-modal="true" aria-labelledby="keyboard-settings-title">
        <div className="keyboard-settings-heading">
          <div>
            <span>8-BIT SYSTEM</span>
            <h2 id="keyboard-settings-title">系统设置</h2>
          </div>
          <button aria-label="关闭系统设置" onClick={onClose}>×</button>
        </div>
        <div className="binding-sections">
          {bindingGroups.map(group => (
            <section className="binding-section" key={group.title} aria-label={group.title}>
              <div className="binding-section-heading">
                <h3>{group.title}</h3>
                <span>{group.hint}</span>
              </div>
              <div className="binding-grid">
                {group.actions.map(button => (
                  <button
                    className={capturing === button ? 'is-capturing' : ''}
                    key={button}
                    onClick={() => {
                      setCapturing(button)
                      setCaptureError('')
                    }}
                  >
                    <span>{controlLabels[button]}</span>
                    <kbd>{capturing === button ? '按新键…' : displayKeyboardKey(bindings[button])}</kbd>
                  </button>
                ))}
              </div>
            </section>
          ))}
          <section className="binding-section backup-section" aria-label="数据备份">
            <div className="binding-section-heading">
              <h3>数据备份</h3>
              <span>ALL GAMES</span>
            </div>
            <div className="backup-actions">
              <button type="button" disabled={backupBusy} onClick={() => void exportBackup()}>导出全部</button>
              <button type="button" disabled={backupBusy} onClick={() => backupInput.current?.click()}>导入备份</button>
              <input
                ref={backupInput}
                type="file"
                accept="application/json,.json"
                onChange={event => {
                  const file = event.currentTarget.files?.[0]
                  event.currentTarget.value = ''
                  if (file) void importBackup(file)
                }}
              />
            </div>
            <p className="backup-status" aria-live="polite">
              {backupStatus || '统一备份全部游戏存档、缩略图、金手指和键位配置；导入不会删除现有其他槽位。'}
              {backupDownload && (
                <a href={backupDownload.url} download={backupDownload.fileName}>点此保存备份文件</a>
              )}
            </p>
          </section>
        </div>
        <div className="keyboard-settings-footer">
          <p>{captureError || (capturing ? '按下新按键，Esc 取消' : '点击任意键位后按下新按键')}</p>
          <button onClick={() => {
            onReset()
            setCapturing(null)
            setCaptureError('')
          }}>恢复默认</button>
        </div>
        <p>重复键会自动交换；<kbd>P</kbd> 保留用于打开设置。</p>
      </section>
    </div>
  )
}

export default function App() {
  const romPath = new URLSearchParams(window.location.search).get('rom')
  const [keyboardBindings, setKeyboardBindings] = useState<KeyboardBindings>(loadKeyboardBindings)
  const [showKeyboardSettings, setShowKeyboardSettings] = useState(false)

  useEffect(() => {
    if (!romPath) return
    // Reload the complete mapping table whenever a game page is entered.
    setKeyboardBindings(loadKeyboardBindings())
  }, [romPath])

  useEffect(() => {
    const preventContextMenu = (event: MouseEvent) => event.preventDefault()
    const preventLongPressSelection = (event: Event) => {
      const target = event.target
      if (target instanceof HTMLTextAreaElement) return
      if (target instanceof HTMLInputElement && target.type !== 'checkbox') return
      event.preventDefault()
    }
    window.addEventListener('contextmenu', preventContextMenu, { capture: true })
    window.addEventListener('selectstart', preventLongPressSelection, { capture: true })
    window.addEventListener('dragstart', preventLongPressSelection, { capture: true })
    return () => {
      window.removeEventListener('contextmenu', preventContextMenu, true)
      window.removeEventListener('selectstart', preventLongPressSelection, true)
      window.removeEventListener('dragstart', preventLongPressSelection, true)
    }
  }, [])

  useEffect(() => {
    const toggleSettings = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'p' || event.repeat) return
      if (document.querySelector('.binding-grid .is-capturing')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      setShowKeyboardSettings(value => !value)
    }
    const blockSettingsKeyUp = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'p') return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', toggleSettings, true)
    window.addEventListener('keyup', blockSettingsKeyUp, true)
    return () => {
      window.removeEventListener('keydown', toggleSettings, true)
      window.removeEventListener('keyup', blockSettingsKeyUp, true)
    }
  }, [])

  const saveKeyboardBindings = (bindings: KeyboardBindings) => {
    localStorage.setItem(keyboardBindingsKey, JSON.stringify(bindings))
    // Read back through the same validation path so saved adjustments and
    // startup mappings can never diverge.
    setKeyboardBindings(loadKeyboardBindings())
  }

  const bindKeyboardKey = (button: KeyboardAction, key: string) => {
    const next = { ...keyboardBindings }
    const previousKey = next[button]
    const conflictingButton = bindingOrder.find(candidate => candidate !== button && next[candidate] === key)
    next[button] = key
    if (conflictingButton) next[conflictingButton] = previousKey
    saveKeyboardBindings(next)
  }

  return (
    <>
      {romPath
        ? <EmulatorPage keyboardBindings={keyboardBindings} />
        : <HomePage onOpenSettings={() => setShowKeyboardSettings(true)} />}
      {showKeyboardSettings && (
        <KeyboardSettings
          bindings={keyboardBindings}
          onBind={bindKeyboardKey}
          onReset={() => saveKeyboardBindings({ ...defaultKeyboardBindings })}
          onImported={() => setKeyboardBindings(loadKeyboardBindings())}
          onClose={() => setShowKeyboardSettings(false)}
        />
      )}
    </>
  )
}
