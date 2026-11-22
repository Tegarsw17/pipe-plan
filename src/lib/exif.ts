import exifr from 'exifr'

export interface PhotoMeta {
  make: string | null
  model: string | null
  focal_mm: number | null
  focal35_mm: number | null
  altitude_rel_m: number | null
  gimbal_pitch_deg: number | null
  gimbal_yaw_deg: number | null
  lat: number | null
  lon: number | null
  taken_at: string | null
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Baca EXIF dan XMP (DJI). Mengembalikan null bila foto tidak punya metadata sama sekali. */
export async function readPhotoMeta(file: Blob): Promise<PhotoMeta | null> {
  let raw: Record<string, unknown> | undefined
  try {
    raw = await exifr.parse(file, { xmp: true, tiff: true, exif: true, gps: true, mergeOutput: true, translateValues: false })
  } catch {
    return null
  }
  if (!raw) return null
  const taken = raw.DateTimeOriginal
  const meta: PhotoMeta = {
    make: str(raw.Make),
    model: str(raw.Model),
    focal_mm: num(raw.FocalLength),
    focal35_mm: num(raw.FocalLengthIn35mmFormat),
    altitude_rel_m: num(raw.RelativeAltitude),
    gimbal_pitch_deg: num(raw.GimbalPitchDegree),
    gimbal_yaw_deg: num(raw.GimbalYawDegree) ?? num(raw.FlightYawDegree),
    lat: num(raw.latitude),
    lon: num(raw.longitude),
    taken_at: taken instanceof Date ? taken.toISOString() : str(taken),
  }
  return Object.values(meta).every((v) => v === null) ? null : meta
}
