import type { Pt, LengthUnit, MeasureType } from './types'

export const UNIT_TO_M: Record<LengthUnit, number> = { m: 1, cm: 0.01, mm: 0.001, ft: 0.3048 }

export const dist = (a: Pt, b: Pt): number => Math.hypot(b[0] - a[0], b[1] - a[1])

/** Panjang tiap ruas dalam piksel. */
export function segmentLengths(pts: Pt[]): number[] {
  const out: number[] = []
  for (let i = 1; i < pts.length; i++) out.push(dist(pts[i - 1], pts[i]))
  return out
}

export const polylineLength = (pts: Pt[]): number => segmentLengths(pts).reduce((s, v) => s + v, 0)

/** Luas poligon (rumus tali sepatu), dalam piksel persegi. */
export function polygonArea(pts: Pt[]): number {
  if (pts.length < 3) return 0
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}

/** Keliling poligon tertutup, dalam piksel. */
export function polygonPerimeter(pts: Pt[]): number {
  if (pts.length < 2) return 0
  return polylineLength(pts) + dist(pts[pts.length - 1], pts[0])
}

/** Sudut di titik `v` antara garis v->a dan v->b, 0-180 derajat. */
export function angleDeg(a: Pt, v: Pt, b: Pt): number {
  const u = [a[0] - v[0], a[1] - v[1]]
  const w = [b[0] - v[0], b[1] - v[1]]
  const m = Math.hypot(u[0], u[1]) * Math.hypot(w[0], w[1])
  if (m === 0) return 0
  return (Math.acos(Math.max(-1, Math.min(1, (u[0] * w[0] + u[1] * w[1]) / m))) * 180) / Math.PI
}

export interface MeasureResult {
  /** Panjang (jarak/polyline) atau keliling (luas), meter. */
  length_m: number
  /** Hanya untuk luas, meter persegi. */
  area_m2: number | null
  segments_m: number[]
  /** Hanya untuk sudut. */
  angle_deg: number | null
}

export function measure(type: MeasureType, pts: Pt[], mpp: number): MeasureResult {
  if (type === 'angle') {
    return { length_m: 0, area_m2: null, segments_m: segmentLengths(pts).map((v) => v * mpp), angle_deg: pts.length >= 3 ? angleDeg(pts[0], pts[1], pts[2]) : null }
  }
  if (type === 'area') {
    return {
      length_m: polygonPerimeter(pts) * mpp,
      angle_deg: null,
      area_m2: polygonArea(pts) * mpp * mpp,
      segments_m: [...segmentLengths(pts), pts.length > 2 ? dist(pts[pts.length - 1], pts[0]) : 0]
        .filter((_, i) => i < pts.length)
        .map((v) => v * mpp),
    }
  }
  return {
    length_m: polylineLength(pts) * mpp,
    area_m2: null,
    angle_deg: null,
    segments_m: segmentLengths(pts).map((v) => v * mpp),
  }
}

const nf = (digits: number) =>
  new Intl.NumberFormat('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export const fmtLength = (m: number): string => (m < 1 ? `${nf(1).format(m * 100)} cm` : `${nf(2).format(m)} m`)
export const fmtAngle = (deg: number): string => `${nf(1).format(deg)}°`
export const fmtArea = (m2: number): string => (m2 >= 10000 ? `${nf(2).format(m2 / 10000)} ha` : `${nf(2).format(m2)} m²`)
