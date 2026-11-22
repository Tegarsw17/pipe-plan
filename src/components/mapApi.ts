import type { Pt } from '../lib/types'

/** Perintah viewer yang dipanggil dari toolbar. Diisi oleh MapView saat aktif. */
export interface MapApi {
  fit: () => void
  zoomBy: (factor: number) => void
  rotateBy: (deg: number) => void
  resetRotation: () => void
  focusPoints: (pts: Pt[]) => void
  finishDrawing: () => void
  undoLastPoint: () => void
  abortDrawing: () => void
}

export const mapApi: { current: MapApi | null } = { current: null }
