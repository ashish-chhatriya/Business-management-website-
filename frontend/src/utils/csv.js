const escapeCsv = (value) => {
  if (value == null) return ''
  const text = String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export const downloadCsv = (filename, headers, rows) => {
  const csv = [
    headers.join(','),
    ...rows.map(row => headers.map(header => escapeCsv(row[header])).join(',')),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const parseCsvText = (text) => {
  const rows = []
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  let row = []
  let value = ''
  let inQuotes = false

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i]
    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          value += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        value += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(value)
      value = ''
    } else if (char === '\n') {
      row.push(value)
      rows.push(row)
      row = []
      value = ''
    } else {
      value += char
    }
  }
  if (value !== '' || row.length > 0) {
    row.push(value)
    rows.push(row)
  }
  return rows
}

export const parseCsvFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => {
    try {
      resolve(reader.result)
    } catch (err) {
      reject(err)
    }
  }
  reader.onerror = () => reject(reader.error)
  reader.readAsText(file)
})

export const downloadTemplate = (filename, headers, sampleRow) => {
  downloadCsv(filename, headers, [sampleRow])
}
