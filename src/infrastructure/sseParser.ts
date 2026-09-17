/**
 * Parser Server-Sent Events inkremental. Potongan dari jaringan bisa memotong baris di
 * tengah, jadi sisa baris yang belum lengkap disimpan sampai potongan berikutnya datang.
 */
export function createSseParser(onData: (data: string) => void) {
  let buffer = ''
  let dataLines: string[] = []

  function processLine(rawLine: string) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (!line) {
      if (!dataLines.length) return
      const data = dataLines.join('\n')
      dataLines = []
      onData(data)
      return
    }
    if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
  }

  return {
    push(chunk: string) {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      lines.forEach(processLine)
    },
    flush() {
      if (buffer) processLine(buffer)
      buffer = ''
      processLine('')
    },
  }
}
