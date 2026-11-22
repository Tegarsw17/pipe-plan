import type { Calibration } from './types'

export const SENSOR_4_3_FACTOR = 0.8
export const FULL_FRAME_DIAG_MM = 43.267

/** Lebar sensor (mm) dari focal length nyata dan ekuivalen 35 mm, dengan asumsi sensor 4:3 (kamera drone DJI umumnya). */
export const sensorWidthFrom35mm = (focal_mm: number, focal35_mm: number): number => (SENSOR_4_3_FACTOR * FULL_FRAME_DIAG_MM * focal_mm) / focal35_mm

/** Profil kamera yang dikenal; nilai perkiraan, pengguna bisa mengoreksinya. Kunci: nilai EXIF Model. */
export const CAMERA_PROFILES: Record<string, { name: string; sensor_width_mm: number }> = {
  FC3582: { name: 'DJI Mini 3 Pro', sensor_width_mm: 9.6 },
}

export interface ExifScaleInput {
  sensor_width_mm: number
  focal_mm: number
  altitude_m: number
  image_width_px: number
}

/** GSD (meter per piksel) untuk foto nadir: GSD = Sw x H / (F x Iw). */
export function gsdFromExif(i: ExifScaleInput): number {
  if (!(i.sensor_width_mm > 0 && i.focal_mm > 0 && i.altitude_m > 0 && i.image_width_px > 0)) return NaN
  return (i.sensor_width_mm * i.altitude_m) / (i.focal_mm * i.image_width_px)
}

/** Kamera dianggap tegak lurus bila pitch gimbal sekitar -90 derajat. */
export const isNadir = (pitchDeg: number | null | undefined, tolDeg = 3): boolean => pitchDeg == null || Math.abs(pitchDeg + 90) <= tolDeg

export function calibrationFromExif(input: ExifScaleInput, id: string, pitchDeg: number | null): Calibration | null {
  const gsd = gsdFromExif(input)
  if (!Number.isFinite(gsd)) return null
  const notes = ['Tinggi terbang dari EXIF DJI relatif terhadap titik take-off, bukan tanah di lokasi foto.']
  if (!isNadir(pitchDeg)) notes.push(`Gimbal ${pitchDeg}°, bukan sekitar -90°: skala tidak seragam di seluruh foto.`)
  return {
    id,
    method: 'exif',
    input: null,
    affine: [gsd, 0, 0, 0, gsd, 0],
    meters_per_px: gsd,
    accuracy_level: 'Estimasi',
    error_pct: null,
    is_active: true,
    notes,
  }
}

export function addVerification(c: Calibration, v: { id: string; points_px: [[number, number], [number, number]]; measured_m: number; known_m: number }): Calibration {
  const diff_pct = ((v.measured_m - v.known_m) / v.known_m) * 100
  const verifications = [...(c.verifications ?? []), { ...v, diff_pct }]
  return { ...c, verifications, error_pct: Math.abs(diff_pct) }
}
