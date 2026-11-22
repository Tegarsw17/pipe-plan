import { create } from 'zustand'
import type { Calibration, ImageInfo, Measurement, NodeType, PipeNode, PipeType, PrintLayout, Project, ProjectSettings, Pt } from './lib/types'
import { newProject } from './lib/project'
import { activateCalibration, activeCalibration } from './lib/calibration'
import { addVerification } from './lib/scale'
import { addNode, addSegment, deleteNode, deleteSegment, moveNode, nodeById, projectOnSegment, setNodeType, setSegmentType, splitSegment } from './lib/pipes'

export type Tool = 'select' | 'reference' | 'verify' | 'distance' | 'polyline' | 'area' | 'angle' | 'pipe' | 'printarea'

export interface PendingReference {
  p1: Pt
  p2: Pt
  mode: 'calibrate' | 'verify'
}

export type DialogName = 'print' | 'exif' | null

const HISTORY_LIMIT = 100

interface State {
  project: Project
  imageBlob: Blob | null
  imageUrl: string | null
  tool: Tool
  /** Id objek terpilih; awalan id menentukan jenisnya: m- pengukuran, n- node, s- segmen. */
  selectedId: string | null
  pendingRef: PendingReference | null
  activePipeTypeId: string | null
  /** Node terakhir pada rantai pipa yang sedang digambar. */
  pipeChain: string | null
  snapOn: boolean
  dialog: DialogName
  notice: { kind: 'info' | 'error'; text: string } | null
  dirty: boolean
  past: Project[]
  future: Project[]

  setTool: (t: Tool) => void
  select: (id: string | null) => void
  setNotice: (n: State['notice']) => void
  loadProject: (p: Project, image: Blob | null) => void
  loadImage: (blob: Blob, info: ImageInfo, calibration?: Calibration | null) => void
  setSnap: (on: boolean) => void
  openDialog: (d: DialogName) => void
  addVerificationResult: (v: { id: string; points_px: [Pt, Pt]; measured_m: number; known_m: number }) => void
  setPrintLayout: (patch: Partial<PrintLayout>) => void
  /** Ubah pengaturan cetak tanpa menambah riwayat undo (dipakai saat mengetik di dialog cetak). */
  patchPrintLayout: (patch: Partial<PrintLayout>) => void
  setProjectName: (name: string) => void
  setPendingRef: (p: PendingReference | null) => void
  addCalibration: (c: Calibration) => void
  addMeasurement: (m: Measurement) => void
  updateMeasurementPoints: (id: string, pts: Pt[]) => void
  removeMeasurement: (id: string) => void

  setActivePipeType: (id: string) => void
  /** Klik pada tool pipa. `tolPx` = toleransi snap dalam piksel gambar. */
  pipeClick: (pt: Pt, tolPx: number) => void
  endPipeChain: () => void
  moveNodeTo: (id: string, pt: Pt) => void
  splitSelectedSegment: () => void
  deleteSelected: () => void
  setNodeKind: (id: string, kind: NodeType) => void
  setSegmentPipeType: (segId: string, typeId: string) => void
  upsertPipeType: (t: PipeType) => void
  removePipeType: (id: string) => boolean
  importPipeTypes: (list: PipeType[]) => number
  setSettings: (s: Partial<ProjectSettings>) => void
  toggleLayer: (id: string, key: 'visible' | 'locked') => void

  undo: () => void
  redo: () => void
  markSaved: () => void
}

const touch = (p: Project): Project => ({ ...p, project: { ...p.project, updated_at: new Date().toISOString() } })

export const uid = (prefix: string): string => `${prefix}-${crypto.randomUUID().slice(0, 8)}`

export const useStore = create<State>((set, get) => {
  /** Ubah proyek dan catat satu langkah riwayat untuk undo. */
  const commit = (fn: (p: Project) => Project, extra: Partial<State> = {}) =>
    set((s) => {
      const next = fn(s.project)
      if (next === s.project) return extra
      return { project: touch(next), past: [...s.past, s.project].slice(-HISTORY_LIMIT), future: [], dirty: true, ...extra }
    })

  const resetHistory = { past: [] as Project[], future: [] as Project[] }
  const firstType = (p: Project) => p.pipe_types[0]?.id ?? null

  return {
    project: newProject(),
    imageBlob: null,
    imageUrl: null,
    tool: 'select',
    selectedId: null,
    pendingRef: null,
    activePipeTypeId: firstType(newProject()),
    pipeChain: null,
    snapOn: true,
    dialog: null,
    notice: null,
    dirty: false,
    ...resetHistory,

    setTool: (tool) => set({ tool, pendingRef: null, pipeChain: null }),
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
        pipeChain: null,
        activePipeTypeId: firstType(project),
        dirty: false,
        ...resetHistory,
      })
    },

    loadImage: (blob, info, calibration) => {
      const prev = get().imageUrl
      if (prev) URL.revokeObjectURL(prev)
      // Foto baru = skala baru: kalibrasi dan gambar lama tidak berlaku. Katalog dan pengaturan dipertahankan.
      const old = get().project
      const base = newProject(old.project.name)
      const project: Project = {
        ...base,
        image: info,
        pipe_types: old.pipe_types,
        settings: old.settings,
        calibrations: calibration ? [calibration] : [],
        print_layout: { ...old.print_layout, bbox_px: null, north_deg: 0, title_block: { ...old.print_layout.title_block, project_name: old.project.name } },
      }
      set({ project, imageBlob: blob, imageUrl: URL.createObjectURL(blob), tool: 'select', selectedId: null, pendingRef: null, pipeChain: null, dirty: true, ...resetHistory })
    },

    setProjectName: (name) => set((s) => ({ project: touch({ ...s.project, project: { ...s.project.project, name } }), dirty: true })),
    setSnap: (snapOn) => set({ snapOn }),
    openDialog: (dialog) => set({ dialog }),
    addVerificationResult: (v) =>
      commit((p) => {
        const cur = activeCalibration(p.calibrations)
        if (!cur) return p
        const next = addVerification(cur, v)
        return { ...p, calibrations: p.calibrations.map((c) => (c.id === cur.id ? next : c)) }
      }, { pendingRef: null, tool: 'select' }),
    patchPrintLayout: (patch) => set((s) => ({ project: touch({ ...s.project, print_layout: { ...s.project.print_layout, ...patch } }), dirty: true })),
    setPrintLayout: (patch) => commit((p) => ({ ...p, print_layout: { ...p.print_layout, ...patch } })),
    setPendingRef: (pendingRef) => set({ pendingRef }),

    addCalibration: (c) => commit((p) => ({ ...p, calibrations: activateCalibration(p.calibrations, c) }), { pendingRef: null, tool: 'select' }),
    addMeasurement: (m) => commit((p) => ({ ...p, measurements: [...p.measurements, m] }), { selectedId: m.id }),
    updateMeasurementPoints: (id, pts) => commit((p) => ({ ...p, measurements: p.measurements.map((m) => (m.id === id ? { ...m, points_px: pts } : m)) })),
    removeMeasurement: (id) =>
      commit((p) => ({ ...p, measurements: p.measurements.filter((m) => m.id !== id) }), { selectedId: get().selectedId === id ? null : get().selectedId }),

    setActivePipeType: (activePipeTypeId) => set({ activePipeTypeId, pipeChain: null }),

    pipeClick: (pt, tolPx) => {
      const { project, activePipeTypeId, pipeChain } = get()
      if (!activePipeTypeId || !project.pipe_types.some((t) => t.id === activePipeTypeId)) {
        get().setNotice({ kind: 'error', text: 'Pilih jenis pipa aktif dulu.' })
        return
      }
      // 1) snap ke node yang ada  2) snap ke tengah segmen (percabangan)  3) node baru
      let target: string | null = null
      let best = tolPx
      for (const n of project.pipe_nodes) {
        const d = Math.hypot(n.point_px[0] - pt[0], n.point_px[1] - pt[1])
        if (d <= best) { best = d; target = n.id }
      }
      if (target && target === pipeChain) {
        set({ pipeChain: null }) // klik ulang di node terakhir = selesai
        return
      }
      commit(
        (p) => {
          let q = p
          let id = target
          if (!id) {
            let hit: { segId: string; point: Pt } | null = null
            let bestD = tolPx
            for (const s of p.pipe_segments) {
              const a = nodeById(p, s.from_node_id)
              const b = nodeById(p, s.to_node_id)
              if (!a || !b) continue
              const r = projectOnSegment(a.point_px, b.point_px, pt)
              if (r.d <= bestD && r.t > 0 && r.t < 1) { bestD = r.d; hit = { segId: s.id, point: r.point } }
            }
            const node: PipeNode = { id: uid('n'), layer_id: 'layer-pipa', point_px: hit ? hit.point : pt, node_type: 'junction', fitting_angle_deg: null }
            id = node.id
            q = hit ? splitSegment(q, hit.segId, node, uid('s')) : addNode(q, node)
          }
          if (pipeChain && id !== pipeChain) {
            q = addSegment(q, { id: uid('s'), layer_id: 'layer-pipa', from_node_id: pipeChain, to_node_id: id, pipe_type_id: activePipeTypeId, label: '' })
          }
          target = id
          return q
        },
        {},
      )
      set({ pipeChain: target })
    },

    endPipeChain: () => set({ pipeChain: null }),
    moveNodeTo: (id, pt) => commit((p) => moveNode(p, id, pt)),

    splitSelectedSegment: () => {
      const { selectedId, project } = get()
      const seg = project.pipe_segments.find((s) => s.id === selectedId)
      if (!seg) return
      const a = nodeById(project, seg.from_node_id)
      const b = nodeById(project, seg.to_node_id)
      if (!a || !b) return
      const node: PipeNode = { id: uid('n'), layer_id: seg.layer_id, point_px: [(a.point_px[0] + b.point_px[0]) / 2, (a.point_px[1] + b.point_px[1]) / 2], node_type: 'junction', fitting_angle_deg: null }
      commit((p) => splitSegment(p, seg.id, node, uid('s')), { selectedId: node.id })
    },

    deleteSelected: () => {
      const { selectedId } = get()
      if (!selectedId) return
      if (selectedId.startsWith('m-')) get().removeMeasurement(selectedId)
      else if (selectedId.startsWith('n-')) commit((p) => deleteNode(p, selectedId), { selectedId: null })
      else if (selectedId.startsWith('s-')) commit((p) => deleteSegment(p, selectedId), { selectedId: null })
    },

    setNodeKind: (id, kind) => commit((p) => setNodeType(p, id, kind)),
    setSegmentPipeType: (segId, typeId) => commit((p) => setSegmentType(p, segId, typeId)),

    upsertPipeType: (t) =>
      commit((p) => ({ ...p, pipe_types: p.pipe_types.some((x) => x.id === t.id) ? p.pipe_types.map((x) => (x.id === t.id ? t : x)) : [...p.pipe_types, t] })),

    removePipeType: (id) => {
      const p = get().project
      if (p.pipe_segments.some((s) => s.pipe_type_id === id)) {
        get().setNotice({ kind: 'error', text: 'Jenis pipa ini dipakai di gambar. Ganti jenis segmennya dulu.' })
        return false
      }
      commit((q) => ({ ...q, pipe_types: q.pipe_types.filter((t) => t.id !== id) }))
      if (get().activePipeTypeId === id) set({ activePipeTypeId: get().project.pipe_types[0]?.id ?? null })
      return true
    },

    importPipeTypes: (list) => {
      let added = 0
      commit((p) => {
        const have = new Set(p.pipe_types.map((t) => `${t.material}|${t.diameter_in}|${t.service}`))
        const ids = new Set(p.pipe_types.map((t) => t.id))
        const fresh = list
          .filter((t) => !have.has(`${t.material}|${t.diameter_in}|${t.service}`))
          .map((t) => (ids.has(t.id) ? { ...t, id: uid('pt') } : t))
        added = fresh.length
        return fresh.length ? { ...p, pipe_types: [...p.pipe_types, ...fresh] } : p
      })
      if (!get().activePipeTypeId) set({ activePipeTypeId: get().project.pipe_types[0]?.id ?? null })
      return added
    },

    setSettings: (patch) => commit((p) => ({ ...p, settings: { ...p.settings, ...patch } })),
    toggleLayer: (id, key) => commit((p) => ({ ...p, layers: p.layers.map((l) => (l.id === id ? { ...l, [key]: !l[key] } : l)) })),

    undo: () =>
      set((s) => {
        const prev = s.past[s.past.length - 1]
        if (!prev) return {}
        const sel = s.selectedId
        return { project: prev, past: s.past.slice(0, -1), future: [s.project, ...s.future], dirty: true, pipeChain: null, selectedId: sel && !exists(prev, sel) ? null : sel }
      }),
    redo: () =>
      set((s) => {
        const next = s.future[0]
        if (!next) return {}
        const sel = s.selectedId
        return { project: next, past: [...s.past, s.project], future: s.future.slice(1), dirty: true, pipeChain: null, selectedId: sel && !exists(next, sel) ? null : sel }
      }),

    markSaved: () => set({ dirty: false }),
  }
})

function exists(p: Project, id: string): boolean {
  return p.measurements.some((m) => m.id === id) || p.pipe_nodes.some((n) => n.id === id) || p.pipe_segments.some((s) => s.id === id)
}

/** Status bar: posisi kursor dan zoom. Dipisah supaya gerakan mouse tidak merender ulang seluruh aplikasi. */
interface Hud {
  cursor: Pt | null
  zoomPct: number
  rotationDeg: number
  /** Jumlah titik pada gambar yang sedang dibuat (0 = tidak sedang menggambar). */
  drawCount: number
  set: (p: Partial<Omit<Hud, 'set'>>) => void
}
export const useHud = create<Hud>((set) => ({ cursor: null, zoomPct: 100, rotationDeg: 0, drawCount: 0, set: (p) => set(p) }))
