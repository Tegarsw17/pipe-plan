/** Diameter nominal pipa dalam inci, ditulis seperti di toko bangunan: 3/4, 1 1/2, 4. */

export function fmtInch(n: number): string {
  const eighths = Math.round(n * 8)
  if (Math.abs(eighths / 8 - n) > 0.005) return String(Math.round(n * 100) / 100).replace('.', ',')
  const whole = Math.floor(eighths / 8)
  let num = eighths % 8
  let den = 8
  while (num > 0 && num % 2 === 0) { num /= 2; den /= 2 }
  if (num === 0) return String(whole)
  return whole > 0 ? `${whole} ${num}/${den}` : `${num}/${den}`
}

/** Teks diameter untuk label: Ø3/4" */
export const fmtDia = (n: number): string => `Ø${fmtInch(n)}"`

/** Terima "1 1/2", "1-1/2", "3/4", "2,5", '2"', "2 inci". Kembalikan null bila tidak valid. */
export function parseInch(raw: string): number | null {
  const s = raw.toLowerCase().replace(/["”″]|inci|inch|in\b/g, '').replace(',', '.').trim()
  if (!s) return null
  let m = s.match(/^(\d+)\s*[- ]\s*(\d+)\s*\/\s*(\d+)$/)
  if (m) return Number(m[3]) === 0 ? null : Number(m[1]) + Number(m[2]) / Number(m[3])
  m = s.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (m) return Number(m[2]) === 0 ? null : Number(m[1]) / Number(m[2])
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s)
    return n > 0 ? n : null
  }
  return null
}

/** Ukuran nominal umum di Indonesia untuk migrasi dari milimeter (diameter luar) ke inci. */
const MM_TO_INCH: [number, number][] = [
  [20, 0.5], [25, 0.75], [32, 1], [40, 1.25], [50, 1.5], [63, 2], [75, 2.5], [90, 3], [110, 4], [125, 5], [160, 6], [200, 8], [250, 10], [315, 12],
]

export function mmToNominalInch(mm: number): number {
  const hit = MM_TO_INCH.find(([m]) => Math.abs(m - mm) <= 1)
  if (hit) return hit[1]
  return Math.max(0.125, Math.round((mm / 25.4) * 8) / 8)
}
