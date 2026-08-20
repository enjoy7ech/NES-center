export type RomInfo = {
  format: 'iNES' | 'UNIF'
  mapper: number
  prgBytes: number
  chrBytes: number
  batteryBacked: boolean
  resetVector: number
}

export function inspectRom(buffer: ArrayBuffer): RomInfo {
  const bytes = new Uint8Array(buffer)
  if (bytes.length >= 4 && bytes[0] === 0x55 && bytes[1] === 0x4e && bytes[2] === 0x49 && bytes[3] === 0x46) {
    return inspectUnifRom(bytes)
  }
  if (bytes.length < 16 || bytes[0] !== 0x4e || bytes[1] !== 0x45 || bytes[2] !== 0x53 || bytes[3] !== 0x1a) {
    throw new Error('不是有效的 iNES 或 UNIF ROM 文件。')
  }

  const flags6 = bytes[6]
  const flags7 = bytes[7]
  const trainerBytes = flags6 & 0x04 ? 512 : 0
  const prgBytes = bytes[4] * 16 * 1024
  const chrBytes = bytes[5] * 8 * 1024
  const mapper = (flags6 >> 4) | (flags7 & 0xf0)
  const contentEnd = 16 + trainerBytes + prgBytes + chrBytes

  if (prgBytes === 0) throw new Error('ROM 没有 PRG 程序数据。')
  if (bytes.length < contentEnd) throw new Error('ROM 文件不完整，声明容量与实际文件大小不一致。')

  const vectorOffset = 16 + trainerBytes + prgBytes - 4
  const resetVector = bytes[vectorOffset] | (bytes[vectorOffset + 1] << 8)
  if (resetVector < 0x8000) {
    throw new Error(`ROM 的复位向量无效（0x${resetVector.toString(16).padStart(4, '0').toUpperCase()}），无法启动 CPU。`)
  }

  return {
    format: 'iNES',
    mapper,
    prgBytes,
    chrBytes,
    batteryBacked: Boolean(flags6 & 0x02),
    resetVector,
  }
}

function inspectUnifRom(bytes: Uint8Array): RomInfo {
  if (bytes.length < 32) throw new Error('UNIF ROM 文件头不完整。')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const prgChunks: Array<{ id: string; data: Uint8Array }> = []
  let chrBytes = 0
  let batteryBacked = false
  let offset = 32

  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error('UNIF ROM 区块头不完整。')
    const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
    const length = view.getUint32(offset + 4, true)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd > bytes.length) throw new Error(`UNIF ROM 区块 ${id} 长度无效。`)
    const data = bytes.subarray(dataStart, dataEnd)
    if (/^PRG[0-9A-F]$/.test(id)) prgChunks.push({ id, data })
    if (/^CHR[0-9A-F]$/.test(id)) chrBytes += length
    if (id === 'BATR') batteryBacked = true
    offset = dataEnd
  }

  if (!prgChunks.length) throw new Error('UNIF ROM 没有 PRG 程序数据。')
  prgChunks.sort((left, right) => left.id.localeCompare(right.id))
  const lastPrg = prgChunks[prgChunks.length - 1].data
  if (lastPrg.length < 4) throw new Error('UNIF ROM 的末尾 PRG 区块不完整。')
  const resetVector = lastPrg[lastPrg.length - 4] | (lastPrg[lastPrg.length - 3] << 8)
  if (resetVector < 0x8000) {
    throw new Error(`UNIF ROM 的复位向量无效（0x${resetVector.toString(16).padStart(4, '0').toUpperCase()}）。`)
  }

  return {
    format: 'UNIF',
    mapper: -1,
    prgBytes: prgChunks.reduce((total, chunk) => total + chunk.data.length, 0),
    chrBytes,
    batteryBacked,
    resetVector,
  }
}
