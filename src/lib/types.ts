/** Titik dalam koordinat piksel gambar: x ke kanan, y ke bawah (asal di kiri-atas). */
export type Pt = [number, number]

export const SCHEMA_VERSION = 2

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

export interface PipeType {
  id: string
  material: string
  diameter_mm: number
  service: string
  color: string
  stock_length_m: number
}

export type NodeType = 'junction' | 'elbow' | 'tee' | 'reducer' | 'valve' | 'cap' | 'meter' | 'manhole'

export interface PipeNode {
  id: string
  layer_id: string
  point_px: Pt
  /** 'junction' = otomatis (fitting disarankan dari jumlah dan arah segmen). */
  node_type: NodeType
  fitting_angle_deg: number | null
}

export interface PipeSegment {
  id: string
  layer_id: string
  from_node_id: string
  to_node_id: string
  pipe_type_id: string
  label: string
}

export interface ProjectSettings {
  waste_pct: number
  snap_elbow: boolean
}

export interface Project {
  project: ProjectMeta
  image: ImageInfo | null
  calibrations: Calibration[]
  layers: Layer[]
  measurements: Measurement[]
  pipe_types: PipeType[]
  pipe_nodes: PipeNode[]
  pipe_segments: PipeSegment[]
  settings: ProjectSettings
}
