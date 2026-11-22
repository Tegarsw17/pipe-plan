/** Titik dalam koordinat piksel gambar: x ke kanan, y ke bawah (asal di kiri-atas). */
export type Pt = [number, number]

export const SCHEMA_VERSION = 1

export type LengthUnit = 'm' | 'cm' | 'mm' | 'ft'

export type AccuracyLevel = 'Tinggi' | 'Sedang' | 'Estimasi'

export interface ProjectMeta {
  schema_version: number
  name: string
  location: string
  created_at: string
  updated_at: string
}

export interface ImageInfo {
  file_name: string
  file_type: string
  width_px: number
  height_px: number
  exif: Record<string, unknown> | null
  crs: string | null
  geotransform: number[] | null
}

export interface Calibration {
  id: string
  method: 'reference' | 'exif' | 'geotiff'
  input: { length: number; unit: LengthUnit; points_px: [Pt, Pt] } | null
  /** [a, b, c, d, e, f]: piksel -> meter. Untuk skala seragam: [mpp,0,0,0,mpp,0]. */
  affine: number[]
  meters_per_px: number
  accuracy_level: AccuracyLevel
  error_pct: number | null
  is_active: boolean
}

export interface Layer {
  id: string
  name: string
  kind: 'measure' | 'pipe' | 'note'
  color: string
  visible: boolean
  locked: boolean
}

export type MeasureType = 'distance' | 'polyline' | 'area'

export interface Measurement {
  id: string
  layer_id: string
  type: MeasureType
  points_px: Pt[]
  label: string
}

export interface Project {
  project: ProjectMeta
  image: ImageInfo | null
  calibrations: Calibration[]
  layers: Layer[]
  measurements: Measurement[]
}
