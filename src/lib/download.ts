export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export const downloadCsv = (csv: string, filename: string): void => downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename)

export const safeName = (s: string): string => s.trim().replace(/[^\w\-. ]+/g, '_') || 'proyek'
