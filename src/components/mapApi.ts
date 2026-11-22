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
  /** true bila ada gambar yang sedang dibuat dan dibatalkan. */
  abortDrawing: () => boolean
  /** Titik berikutnya pada panjang tertentu (meter) searah kursor. */
  drawLength: (meters: number) => boolean
}

export const mapApi: { current: MapApi | null } = { current: null }
