import type { CheatRule, ControllerButton, ControllerEvent, EmulatorAdapter, EmulatorSpeed, EmulatorStatus } from './types'
import { deleteSaveState, listSaveStates, readSaveState, writeSaveState } from './saveStateStore'

type RetroArchModule = {
  canvas?: HTMLCanvasElement
  arguments?: string[]
  noInitialRun?: boolean
  locateFile?: (path: string) => string
  onRuntimeInitialized?: () => void
  onAbort?: (reason: string) => void
  onExit?: (status: number) => void
  print?: (message: string) => void
  printErr?: (message: string) => void
  callMain?: (args: string[]) => void
  pauseMainLoop?: () => void
  resumeMainLoop?: () => void
  setCanvasSize?: (width: number, height: number) => void
  _cmd_reset?: () => void
  _cmd_toggle_menu?: () => void
  _cmd_reload_config?: () => void
  _cmd_pause?: () => void
  _cmd_unpause?: () => void
  _cmd_save_state?: () => void
  _cmd_load_state?: () => void
  _cmd_take_screenshot?: () => void
  _cmd_cheat_toggle?: () => void
  _cmd_cheat_set_code?: (index: number, pointer: number) => void
  _cmd_cheat_toggle_index?: (apply: boolean, index: number) => void
  _cmd_cheat_realloc?: (size: number) => boolean
  _cmd_cheat_apply_cheats?: () => void
  _malloc?: (size: number) => number
  _free?: (pointer: number) => void
  HEAPU8?: Uint8Array
  FS?: {
    mkdir: (path: string) => void
    writeFile: (path: string, data: Uint8Array) => void
    readFile: (path: string) => Uint8Array
    readdir: (path: string) => string[]
    stat: (path: string) => { mode: number }
    isDir: (mode: number) => boolean
    unlink?: (path: string) => void
  }
}

type RetroArchFactory = (module: RetroArchModule) => Promise<unknown>

declare global {
  interface Window {
    Module?: RetroArchModule
  }
}

type AdapterOptions = {
  onStatus: (status: EmulatorStatus) => void
  onError: (message: string) => void
}

const CORE_SCRIPT = '/cores/fceumm_libretro.js'
const ROM_PATH = '/rom/game.nes'
const SAVE_STATE_DIRECTORY = '/save-states'
const SAVE_STATE_PATH = `${SAVE_STATE_DIRECTORY}/game.state`
const CORE_SAVE_STATE_DIRECTORY = `${SAVE_STATE_DIRECTORY}/FCEUmm`
const CORE_SAVE_STATE_PATH = `${CORE_SAVE_STATE_DIRECTORY}/game.state`
const SCREENSHOT_DIRECTORY = '/screenshots'
const MIN_VIRTUAL_PRESS_MS = 48

const keyboardMap: Record<ControllerButton, { code: string; key: string; keyCode: number }> = {
  up: { code: 'ArrowUp', key: 'ArrowUp', keyCode: 38 },
  down: { code: 'ArrowDown', key: 'ArrowDown', keyCode: 40 },
  left: { code: 'ArrowLeft', key: 'ArrowLeft', keyCode: 37 },
  right: { code: 'ArrowRight', key: 'ArrowRight', keyCode: 39 },
  // Keep the core-facing A key away from user-configurable shortcuts (X is
  // the default speed toggle). F13 is only an internal transport key.
  a: { code: 'F13', key: 'F13', keyCode: 124 },
  b: { code: 'F14', key: 'F14', keyCode: 125 },
  start: { code: 'Enter', key: 'Enter', keyCode: 13 },
  select: { code: 'ShiftRight', key: 'Shift', keyCode: 16 },
}

export class RetroArchAdapter implements EmulatorAdapter {
  private canvas: HTMLCanvasElement | null = null
  private module: RetroArchModule | null = null
  private runtimeReady = false
  private romLoaded = false
  private loadGeneration = 0
  private heldButtons = new Set<ControllerButton>()
  private pressTimes = new Map<ControllerButton, number>()
  private releaseTimers = new Map<ControllerButton, number>()
  private coreErrorListener: ((event: ErrorEvent) => void) | null = null
  private cheats: CheatRule[] = []
  private appliedCheatCount = 0
  private speed: EmulatorSpeed = 1
  private speedTransitionTimer: number | null = null
  private gameId = 'game'

  public constructor(
    private readonly container: HTMLElement,
    private readonly options: AdapterOptions,
  ) {}

  public loadRom(rom: ArrayBuffer, name: string) {
    if (this.romLoaded) {
      this.options.onError('模拟器核心已经启动。请刷新页面后再加载其他 ROM。')
      return
    }

    const generation = ++this.loadGeneration
    this.gameId = name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]+/gu, '-').toLowerCase() || 'game'
    this.options.onStatus('loading')
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'emulator-canvas'
    this.canvas.id = 'canvas'
    this.canvas.tabIndex = 0
    this.canvas.setAttribute('aria-label', `正在运行 ${name}`)
    this.container.replaceChildren(this.canvas)

    const module: RetroArchModule = {
      canvas: this.canvas,
      noInitialRun: true,
      arguments: [ROM_PATH, '--verbose'],
      locateFile: path => `/cores/${path}`,
      print: message => this.logCoreMessage(message),
      printErr: message => this.logCoreMessage(message),
      onAbort: reason => {
        if (generation === this.loadGeneration) this.fail(`RetroArch 核心中止：${reason}`)
      },
      onExit: status => {
        if (generation === this.loadGeneration && status !== 0) this.fail(`RetroArch 核心退出，状态码：${status}`)
      },
      onRuntimeInitialized: () => {
        if (generation !== this.loadGeneration || this.module !== module) return
        try {
          this.prepareRom(rom)
          this.prepareConfig()
          module.callMain?.(module.arguments ?? [ROM_PATH])
          this.runtimeReady = true
          this.romLoaded = true
          this.applyCheats()
          this.options.onStatus('ready')
          this.options.onStatus('running')
        } catch (error) {
          this.fail(error instanceof Error ? error.message : 'ROM 初始化失败。')
        }
      },
    }

    this.module = module
    window.Module = module
    this.coreErrorListener = event => {
      if (generation !== this.loadGeneration) return
      console.error('[RetroArch] runtime error', event.error ?? event.message)
      this.fail(event.message || 'RetroArch 运行时发生未知错误。')
    }
    window.addEventListener('error', this.coreErrorListener)
    void this.loadCore(module, generation)
  }

  public setInput(event: ControllerEvent) {
    if (!keyboardMap[event.button] || !this.runtimeReady || !this.canvas) return
    if (event.pressed) {
      const pendingRelease = this.releaseTimers.get(event.button)
      if (pendingRelease !== undefined) {
        window.clearTimeout(pendingRelease)
        this.releaseTimers.delete(event.button)
      }
      if (this.heldButtons.has(event.button)) return
      this.heldButtons.add(event.button)
      this.pressTimes.set(event.button, performance.now())
      this.dispatchKeyboardEvent(event.button, true)
      return
    }

    if (!this.heldButtons.has(event.button) || this.releaseTimers.has(event.button)) return
    const elapsed = performance.now() - (this.pressTimes.get(event.button) ?? 0)
    const delay = Math.max(0, MIN_VIRTUAL_PRESS_MS - elapsed)
    if (delay > 0) {
      const timer = window.setTimeout(() => {
        this.releaseTimers.delete(event.button)
        this.releaseButton(event.button)
      }, delay)
      this.releaseTimers.set(event.button, timer)
      return
    }
    this.releaseButton(event.button)
  }

  public releaseInputs() {
    for (const timer of this.releaseTimers.values()) window.clearTimeout(timer)
    this.releaseTimers.clear()
    for (const button of [...this.heldButtons]) this.releaseButton(button)
  }

  private releaseButton(button: ControllerButton) {
    if (!this.heldButtons.delete(button)) return
    this.pressTimes.delete(button)
    this.dispatchKeyboardEvent(button, false)
  }

  private dispatchKeyboardEvent(button: ControllerButton, pressed: boolean) {
    const binding = keyboardMap[button]
    this.dispatchCoreKeyboardEvent(binding, pressed)
  }

  private dispatchCoreKeyboardEvent(
    binding: { code: string; key: string; keyCode: number },
    pressed: boolean,
  ) {
    if (!this.canvas) return
    if (pressed) this.canvas.focus({ preventScroll: true })
    const keyboardEvent = new KeyboardEvent(pressed ? 'keydown' : 'keyup', {
      bubbles: true,
      cancelable: true,
      code: binding.code,
      key: binding.key,
    })
    Object.defineProperties(keyboardEvent, {
      keyCode: { get: () => binding.keyCode },
      which: { get: () => binding.keyCode },
      charCode: { get: () => 0 },
    })
    this.canvas.dispatchEvent(keyboardEvent)
  }

  public setSpeed(speed: EmulatorSpeed) {
    if (!this.runtimeReady || this.speedTransitionTimer !== null || speed === this.speed) return false
    const wasFastForwarding = this.speed > 1
    const fastSpeed = speed === 2 || speed === 5 ? speed : null
    const willFastForward = fastSpeed !== null

    if (wasFastForwarding && willFastForward) {
      // RetroArch caches the ratio when fast-forward starts. Leave the mode,
      // wait for the synthetic hotkey release, reload, then enter it again.
      this.pressFastForwardToggle()
      this.speedTransitionTimer = window.setTimeout(() => {
        this.prepareConfig(fastSpeed)
        this.module?._cmd_reload_config?.()
        this.pressFastForwardToggle()
        this.speed = speed
        this.speedTransitionTimer = null
      }, MIN_VIRTUAL_PRESS_MS + 20)
      return true
    }

    if (willFastForward) {
      this.prepareConfig(fastSpeed)
      this.module?._cmd_reload_config?.()
    }
    if (wasFastForwarding !== willFastForward) {
      this.pressFastForwardToggle()
    }
    this.speed = speed
    return true
  }

  private pressFastForwardToggle() {
    const binding = { code: 'F10', key: 'F10', keyCode: 121 }
    this.dispatchCoreKeyboardEvent(binding, true)
    window.setTimeout(() => this.dispatchCoreKeyboardEvent(binding, false), MIN_VIRTUAL_PRESS_MS)
  }

  public toggleMenu() {
    if (!this.runtimeReady) return
    this.module?._cmd_toggle_menu?.()
  }

  public start() {
    if (this.module?._cmd_unpause) this.module._cmd_unpause()
    else this.module?.resumeMainLoop?.()
    if (this.runtimeReady) this.options.onStatus('running')
  }

  public pause() {
    if (this.module?._cmd_pause) this.module._cmd_pause()
    else this.module?.pauseMainLoop?.()
    if (this.runtimeReady) this.options.onStatus('paused')
  }

  public reset() {
    this.module?._cmd_reset?.()
    if (this.runtimeReady) this.options.onStatus('running')
  }

  public async saveState(slot: number) {
    if (!this.runtimeReady || !this.module?._cmd_save_state || !this.module.FS) {
      throw new Error('游戏尚未准备好，不能存档。')
    }
    const screenshotsBefore = new Set(this.findScreenshotFiles(this.module.FS))
    this.module._cmd_take_screenshot?.()
    if (this.module._cmd_take_screenshot) {
      await new Promise(resolve => window.setTimeout(resolve, 160))
    }
    this.module._cmd_save_state()
    await new Promise(resolve => window.setTimeout(resolve, 140))
    let stateFilePath = SAVE_STATE_PATH
    let data: Uint8Array
    try {
      data = this.module.FS.readFile(SAVE_STATE_PATH)
    } catch {
      stateFilePath = this.findStateFile(this.module.FS) ?? SAVE_STATE_PATH
      data = this.module.FS.readFile(stateFilePath)
    }
    const thumbnail = await this.captureThumbnail(screenshotsBefore)
    // Persist the canonical load target even when an older core happened to
    // create the source state under a core-specific subdirectory.
    return writeSaveState(this.gameId, slot, data, thumbnail, SAVE_STATE_PATH)
  }

  public async loadState(slot: number) {
    if (!this.runtimeReady || !this.module?._cmd_load_state || !this.module.FS) {
      throw new Error('游戏尚未准备好，不能读档。')
    }
    const record = await readSaveState(this.gameId, slot)
    if (!record) return null
    // Different RetroArch builds may resolve the same configured directory to
    // either the root or a core-specific subdirectory. Populate every known
    // target so old saves remain loadable after configuration changes.
    for (const path of new Set([SAVE_STATE_PATH, CORE_SAVE_STATE_PATH, record.virtualPath])) {
      if (!path) continue
      try {
        this.module.FS.writeFile(path, record.data)
      } catch {
        // Ignore obsolete paths whose parent directory no longer exists.
      }
    }
    this.module._cmd_load_state()
    return {
      gameId: record.gameId,
      slot: record.slot,
      updatedAt: record.updatedAt,
      thumbnail: record.thumbnail,
    }
  }

  public async listSaveStates() {
    const states = await listSaveStates(this.gameId)
    if (!states.some(state => state.slot === -1) && states.some(state => state.slot === 9)) {
      const previousTenthSlot = await readSaveState(this.gameId, 9)
      if (previousTenthSlot) {
        const quickSlot = await writeSaveState(
          this.gameId,
          -1,
          previousTenthSlot.data,
          previousTenthSlot.thumbnail,
          previousTenthSlot.virtualPath || SAVE_STATE_PATH,
        )
        return [quickSlot, ...states.filter(state => state.slot >= 0 && state.slot < 9)]
      }
    }
    return states.filter(state => state.slot >= -1 && state.slot < 9)
  }

  public async deleteState(slot: number) {
    await deleteSaveState(this.gameId, slot)
  }

  public setCheats(cheats: CheatRule[]) {
    this.cheats = cheats
    if (this.runtimeReady) this.applyCheats()
  }

  public destroy() {
    this.loadGeneration++
    if (this.speedTransitionTimer !== null) window.clearTimeout(this.speedTransitionTimer)
    this.speedTransitionTimer = null
    this.releaseInputs()
    this.module?.pauseMainLoop?.()
    if (this.coreErrorListener) window.removeEventListener('error', this.coreErrorListener)
    this.canvas?.remove()
    this.module = null
    this.canvas = null
    this.coreErrorListener = null
    this.runtimeReady = false
    this.romLoaded = false
    this.cheats = []
    this.appliedCheatCount = 0
    this.speed = 1
    this.gameId = 'game'
    if (window.Module) delete window.Module
  }

  private prepareRom(rom: ArrayBuffer) {
    const fileSystem = this.module?.FS
    if (!fileSystem) throw new Error('RetroArch 虚拟文件系统尚未准备好。')
    try {
      fileSystem.mkdir('/rom')
    } catch {
      // The directory may already exist after a core reload.
    }
    let bytes = new Uint8Array(rom)
    if (
      this.gameId === '吞食天地2-星云完美版-中文版'
      && bytes.length === 16 + 640 * 1024
      && bytes[4] === 40
    ) {
      // This 640 KiB Destiny of an Emperor II hack uses the two-chip MMC3
      // board assigned to iNES mapper 198, but was distributed with a
      // mapper-4 header. Mapper 198 maps fixed banks to $4E/$4F and exposes
      // the additional 4 KiB WRAM at $5000-$5FFF.
      bytes = bytes.slice()
      bytes[6] = (bytes[6] & 0x0f) | 0x60
      bytes[7] = (bytes[7] & 0x0f) | 0xc0
    }
    fileSystem.writeFile(ROM_PATH, bytes)
  }

  private async loadCore(module: RetroArchModule, generation: number) {
    try {
      const coreUrl = `${CORE_SCRIPT}?runtime`
      const dynamicImport = new Function('url', 'return import(url)') as (url: string) => Promise<{ default?: RetroArchFactory }>
      const imported = await dynamicImport(coreUrl)
      if (generation !== this.loadGeneration || this.module !== module) return
      const factory = imported.default
      if (!factory) throw new Error('RetroArch 核心没有导出 Emscripten 工厂。')
      await factory(module)
    } catch (error) {
      if (generation === this.loadGeneration) {
        this.fail(error instanceof Error ? error.message : 'RetroArch WASM 核心加载失败。')
      }
    }
  }

  private prepareConfig(fastForwardRatio: 2 | 5 = 2) {
    const fileSystem = this.module?.FS
    if (!fileSystem) throw new Error('RetroArch 虚拟文件系统尚未准备好。')
    for (const path of [
      '/home',
      '/home/web_user',
      '/home/web_user/retroarch',
      '/home/web_user/retroarch/userdata',
      '/home/web_user/.config',
      '/home/web_user/.config/retroarch',
      SAVE_STATE_DIRECTORY,
      CORE_SAVE_STATE_DIRECTORY,
      SCREENSHOT_DIRECTORY,
    ]) {
      try {
        fileSystem.mkdir(path)
      } catch {
        // The directory can already exist when the core is reloaded.
      }
    }
    const config = new TextEncoder().encode([
      'input_player1_up = "up"',
      'input_player1_down = "down"',
      'input_player1_left = "left"',
      'input_player1_right = "right"',
      'input_player1_a = "f13"',
      'input_player1_b = "f14"',
      'input_player1_start = "enter"',
      'input_player1_select = "rshift"',
      'input_menu_toggle = "f1"',
      'input_pause_toggle = "f2"',
      'input_toggle_fast_forward = "f10"',
      'input_audio_mute = "nul"',
      `fastforward_ratio = "${fastForwardRatio}.000000"`,
      'audio_fastforward_mute = "false"',
      'audio_fastforward_speedup = "true"',
      'video_force_aspect = "true"',
      'video_aspect_ratio_auto = "true"',
      'video_scale_integer = "false"',
      'video_font_enable = "false"',
      'menu_enable_widgets = "false"',
      `savestate_directory = "${SAVE_STATE_DIRECTORY}"`,
      'savestate_auto_index = "false"',
      'sort_savestates_enable = "false"',
      'sort_savestates_by_content_enable = "false"',
      `screenshot_directory = "${SCREENSHOT_DIRECTORY}"`,
      'rgui_show_start_screen = "false"',
      'notification_show_remap_load = "false"',
      'notification_show_fast_forward = "false"',
      'menu_mouse_enable = "true"',
      'menu_pointer_enable = "true"',
    ].join('\n'))
    fileSystem.writeFile('/home/web_user/retroarch/userdata/retroarch.cfg', config)
    fileSystem.writeFile('/home/web_user/.config/retroarch/retroarch.cfg', config)
  }

  private applyCheats() {
    const module = this.module
    if (!module?._cmd_cheat_realloc || !module._cmd_cheat_set_code || !module._cmd_cheat_apply_cheats) return
    const enabledCheats = this.cheats.filter(cheat => cheat.enabled)
    if (enabledCheats.length === 0) {
      if (this.appliedCheatCount > 0) {
        module._cmd_cheat_realloc(0)
        module._cmd_cheat_apply_cheats()
        this.appliedCheatCount = 0
      }
      return
    }
    if (!module._cmd_cheat_realloc(enabledCheats.length)) return

    enabledCheats.forEach((cheat, index) => {
      const bytes = new TextEncoder().encode(`${cheat.code}\0`)
      const pointer = module._malloc?.(bytes.length)
      if (!pointer || !module.HEAPU8) return
      module.HEAPU8.set(bytes, pointer)
      module._cmd_cheat_set_code?.(index, pointer)
      module._free?.(pointer)
    })
    module._cmd_cheat_apply_cheats()
    this.appliedCheatCount = enabledCheats.length
  }

  private async captureThumbnail(previousScreenshots: Set<string>) {
    const fileSystem = this.module?.FS
    if (fileSystem) {
      const screenshotPath = this.findScreenshotFiles(fileSystem)
        .find(path => !previousScreenshots.has(path))
      if (screenshotPath) {
        try {
          const thumbnail = await this.resizeScreenshot(fileSystem.readFile(screenshotPath))
          fileSystem.unlink?.(screenshotPath)
          if (thumbnail) return thumbnail
        } catch {
          // Fall through to the browser-rendered frame.
        }
      }
    }
    const canvas = this.canvas
    if (!canvas) return ''
    if (typeof canvas.captureStream === 'function') {
      const stream = canvas.captureStream(30)
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.srcObject = stream
      try {
        await video.play()
        await new Promise(resolve => window.setTimeout(resolve, 100))
        const thumbnail = this.renderThumbnail(video)
        if (thumbnail) return thumbnail
      } catch {
        // Fall through for browsers that block canvas stream playback.
      } finally {
        stream.getTracks().forEach(track => track.stop())
        video.srcObject = null
      }
    }
    return this.captureCanvasThumbnail()
  }

  private async resizeScreenshot(png: Uint8Array) {
    const bytes = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    try {
      return this.renderThumbnail(bitmap)
    } finally {
      bitmap.close()
    }
  }

  private findScreenshotFiles(fileSystem: NonNullable<RetroArchModule['FS']>) {
    const pending = [SCREENSHOT_DIRECTORY]
    const screenshots: string[] = []
    while (pending.length > 0) {
      const directory = pending.pop()!
      let entries: string[]
      try {
        entries = fileSystem.readdir(directory)
      } catch {
        continue
      }
      for (const entry of entries) {
        if (entry === '.' || entry === '..') continue
        const path = `${directory}/${entry}`
        try {
          if (fileSystem.isDir(fileSystem.stat(path).mode)) pending.push(path)
          else if (/\.png$/i.test(entry)) screenshots.push(path)
        } catch {
          // Ignore transient screenshot tasks.
        }
      }
    }
    return screenshots
  }

  private captureCanvasThumbnail() {
    if (!this.canvas) return ''
    return this.renderThumbnail(this.canvas)
  }

  private renderThumbnail(source: CanvasImageSource) {
    try {
      const preview = document.createElement('canvas')
      preview.width = 256
      preview.height = 144
      const context = preview.getContext('2d')
      if (!context) return ''
      context.imageSmoothingEnabled = false
      context.fillStyle = '#050606'
      context.fillRect(0, 0, preview.width, preview.height)
      context.drawImage(source, 0, 0, preview.width, preview.height)
      const pixels = context.getImageData(0, 0, preview.width, preview.height).data
      let visibleSamples = 0
      for (let index = 0; index < pixels.length; index += 64) {
        if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 36) visibleSamples++
      }
      if (visibleSamples < 20) return ''
      return preview.toDataURL('image/jpeg', .72)
    } catch {
      return ''
    }
  }

  private findStateFile(fileSystem: NonNullable<RetroArchModule['FS']>) {
    const pending = ['/', SAVE_STATE_DIRECTORY, '/home', '/tmp']
    const visited = new Set<string>()
    while (pending.length > 0 && visited.size < 400) {
      const directory = pending.pop()!
      if (visited.has(directory)) continue
      visited.add(directory)
      let entries: string[]
      try {
        entries = fileSystem.readdir(directory)
      } catch {
        continue
      }
      for (const entry of entries) {
        if (entry === '.' || entry === '..') continue
        const path = directory === '/' ? `/${entry}` : `${directory}/${entry}`
        try {
          const stat = fileSystem.stat(path)
          if (fileSystem.isDir(stat.mode)) {
            if (!path.startsWith('/dev') && !path.startsWith('/proc')) pending.push(path)
          } else if (/\.state\d*$/i.test(entry)) {
            return path
          }
        } catch {
          // Ignore virtual devices and transient files.
        }
      }
    }
    return null
  }

  private logCoreMessage(message: string) {
    console.info('[RetroArch]', message)
    const logs = ((window as Window & { __fcCoreLogs?: string[] }).__fcCoreLogs ??= [])
    logs.push(message)
    if (logs.length > 80) logs.shift()
  }

  private fail(message: string) {
    this.options.onStatus('error')
    this.options.onError(message)
  }
}
