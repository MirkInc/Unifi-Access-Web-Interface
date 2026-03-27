function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let j = 0; j < 8; j++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
    }
  }
  return (c ^ 0xffffffff) >>> 0
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear())
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const seconds = Math.floor(date.getSeconds() / 2)
  const dosTime = (hours << 11) | (minutes << 5) | seconds
  const dosDate = ((year - 1980) << 9) | (month << 5) | day
  return { time: dosTime, date: dosDate }
}

export function buildZip(files: Array<{ name: string; content: string | Buffer }>): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0
  const now = new Date()
  const dt = dosDateTime(now)

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8')
    const dataBuf = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8')
    const crc = crc32(dataBuf)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0) // local header signature
    localHeader.writeUInt16LE(20, 4) // version needed
    localHeader.writeUInt16LE(0, 6) // general purpose bit flag
    localHeader.writeUInt16LE(0, 8) // compression method: store
    localHeader.writeUInt16LE(dt.time, 10)
    localHeader.writeUInt16LE(dt.date, 12)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(dataBuf.length, 18)
    localHeader.writeUInt32LE(dataBuf.length, 22)
    localHeader.writeUInt16LE(nameBuf.length, 26)
    localHeader.writeUInt16LE(0, 28)

    localParts.push(localHeader, nameBuf, dataBuf)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0) // central file header signature
    centralHeader.writeUInt16LE(20, 4) // version made by
    centralHeader.writeUInt16LE(20, 6) // version needed
    centralHeader.writeUInt16LE(0, 8) // flags
    centralHeader.writeUInt16LE(0, 10) // compression method
    centralHeader.writeUInt16LE(dt.time, 12)
    centralHeader.writeUInt16LE(dt.date, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(dataBuf.length, 20)
    centralHeader.writeUInt32LE(dataBuf.length, 24)
    centralHeader.writeUInt16LE(nameBuf.length, 28)
    centralHeader.writeUInt16LE(0, 30) // extra len
    centralHeader.writeUInt16LE(0, 32) // comment len
    centralHeader.writeUInt16LE(0, 34) // disk number
    centralHeader.writeUInt16LE(0, 36) // int attrs
    centralHeader.writeUInt32LE(0, 38) // ext attrs
    centralHeader.writeUInt32LE(offset, 42) // local header offset

    centralParts.push(centralHeader, nameBuf)
    offset += localHeader.length + nameBuf.length + dataBuf.length
  }

  const centralSize = centralParts.reduce((n, b) => n + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0) // end signature
  end.writeUInt16LE(0, 4) // disk no
  end.writeUInt16LE(0, 6) // start disk
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([...localParts, ...centralParts, end])
}

