import { create } from 'zustand'
import type { Calibration, ImageInfo, Measurement, Project, Pt } from './lib/types'
import { newProject } from './lib/project'
import { activateCalibration } from './lib/calibration'

export type Tool = 'select' | 'reference' | 'distance' | 'polyline' | 'area'

export interface PendingReference {
  p1: Pt
  p2: Pt
}

interface State {
  project: Project
  imageBlob: Blob | null
  imageUrl: string | null
  tool: Tool
  selectedId: string | null
  pendingRef: PendingReference | null
  notice: { kind: 'info' | 'error'; text: string } | null
  dirty: boolean

  setTool: (t: Tool) => void
  select: (id: string | null) => void
  setNotice: (n: State['notice']) => void
  loadProject: (p: Project, image: Blob | null) => void
  loadImage: (blob: Blob, info: ImageInfo) => void
  setProjectName: (name: string) => void
  setPendingRef: (p: PendingReference | null) => void
  addCalibration: (c: Calibration) => void
  addMeasurement: (m: Measurement) => void
  updateMeasurementPoints: (id: string, pts: Pt[]) => void
  removeMeasurement: (id: string) => void
  markSaved: () => void
}

const touch = (p: Project): Project => ({ ...p, project: { ...p.project, updated_at: new Date().toISOString() } })

export const useStore = create<State>((set, get) => ({
  project: newProject(),
  imageBlob: null,
  imageUrl: null,
  tool: 'select',
  selectedId: null,
  pendingRef: null,
  notice: null,
  dirty: false,

  setTool: (tool) => set({ tool, pendingRef: null }),
  select: (selectedId) => set({ selectedId }),
  setNotice: (notice) => set({ notice }),

  loadProject: (project, image) => {
    const prev = get().imageUrl
    if (prev) URL.revokeObjectURL(prev)
    set({
      project,
      imageBlob: image,
      imageUrl: image ? URL.createObjectURL(image) : null,
      tool: 'select',
      selectedId: null,
      pendingRef: null,
      dirty: false,
    })
  },

  loadImage: (blob, info) => {
    const prev = get().imageUrl
    if (prev) URL.revokeObjectURL(prev)
    // Foto baru = skala baru: kalibrasi dan pengukuran lama tidak berlaku.
    const base = newProject(get().project.project.name)
    set({
      project: { ...base, image: info },
      imageBlob: blob,
      imageUrl: URL.createObjectURL(blob),
      tool: 'select',
      selectedId: null,
      pendingRef: null,
      dirty: true,
    })
  },

  setProjectName: (name) => set((s) => ({ project: touch({ ...s.project, project: { ...s.project.project, name } }), dirty: true })),
  setPendingRef: (pendingRef) => set({ pendingRef }),

  addCalibration: (c) =>
    set((s) => ({
      project: touch({ ...s.project, calibrations: activateCalibration(s.project.calibrations, c) }),
      pendingRef: null,
      tool: 'select',
      dirty: true,
    })),

  addMeasurement: (m) => set((s) => ({ project: touch({ ...s.project, measurements: [...s.project.measurements, m] }), selectedId: m.id, dirty: true })),

  updateMeasurementPoints: (id, pts) =>
    set((s) => ({
      project: touch({ ...s.project, measurements: s.project.measurements.map((m) => (m.id === id ? { ...m, points_px: pts } : m)) }),
      dirty: true,
    })),

  removeMeasurement: (id) =>
    set((s) => ({
      project: touch({ ...s.project, measurements: s.project.measurements.filter((m) => m.id !== id) }),
      selectedId: s.selectedId === id ? null : s.selectedId,
      dirty: true,
    })),

  markSaved: () => set({ dirty: false }),
}))

export const uid = (prefix: string): string => `${prefix}-${crypto.randomUUID().slice(0, 8)}`

/** Status bar: posisi kursor dan zoom. Dipisah supaya gerakan mouse tidak merender ulang seluruh aplikasi. */
interface Hud {
  cursor: Pt | null
  zoomPct: number
  rotationDeg: number
  set: (p: Partial<Omit<Hud, 'set'>>) => void
}
export const useHud = create<Hud>((set) => ({ cursor: null, zoomPct: 100, rotationDeg: 0, set: (p) => set(p) }))
