import type { Calibration, LengthUnit, Pt } from './types'
import { dist, UNIT_TO_M } from './geometry'

export class CalibrationError extends Error {}

/** Buat kalibrasi dari garis referensi dengan panjang nyata yang diketahui. */
export function calibrateFromReference(p1: Pt, p2: Pt, length: number, unit: LengthUnit, id: string): Calibration {
  const px = dist(p1, p2)
  if (!(px > 0)) throw new CalibrationError('Garis referensi harus punya panjang lebih dari 0 piksel.')
  if (!(length > 0) || !Number.isFinite(length)) throw new CalibrationError('Panjang nyata harus berupa angka lebih dari 0.')
  const mpp = (length * UNIT_TO_M[unit]) / px
  return {
    id,
    method: 'reference',
    input: { length, unit, points_px: [p1, p2] },
    affine: [mpp, 0, 0, 0, mpp, 0],
    meters_per_px: mpp,
    accuracy_level: 'Sedang',
    error_pct: null,
    is_active: true,
  }
}

/** Tambahkan kalibrasi baru dan jadikan satu-satunya yang aktif. */
export function activateCalibration(list: Calibration[], next: Calibration): Calibration[] {
  return [...list.map((c) => ({ ...c, is_active: false })), { ...next, is_active: true }]
}

export const activeCalibration = (list: Calibration[]): Calibration | null => list.find((c) => c.is_active) ?? null
