export type EmulatorStatus = 'idle' | 'loading' | 'ready' | 'running' | 'paused' | 'error'
export type EmulatorSpeed = 1 | 2 | 5

export type ControllerButton =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'a'
  | 'b'
  | 'start'
  | 'select'

export type ControllerEvent = {
  button: ControllerButton
  pressed: boolean
}

export type CheatRule = {
  id: string
  name?: string
  code: string
  enabled: boolean
  builtIn?: boolean
}

export type SaveStateSlot = {
  gameId: string
  slot: number
  updatedAt: number
  thumbnail: string
}

export type EmulatorAdapter = {
  loadRom: (rom: ArrayBuffer, name: string) => void
  setInput: (event: ControllerEvent) => void
  releaseInputs: () => void
  start: () => void
  pause: () => void
  reset: () => void
  saveState: (slot: number) => Promise<SaveStateSlot>
  loadState: (slot: number) => Promise<SaveStateSlot | null>
  deleteState: (slot: number) => Promise<void>
  listSaveStates: () => Promise<SaveStateSlot[]>
  setSpeed: (speed: EmulatorSpeed) => boolean
  toggleMenu: () => void
  setCheats: (cheats: CheatRule[]) => void
  destroy: () => void
}
