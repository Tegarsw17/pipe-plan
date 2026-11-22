import JSZip from 'jszip'
import { SCHEMA_VERSION, type Project, type PipeType, type PrintLayout } from './types'
import { mmToNominalInch } from './inch'

export class ProjectFileError extends Error {}

export function newProject(name = 'Proyek baru'): Project {
  const now = new Date().toISOString()
  return {
    project: { schema_version: SCHEMA_VERSION, name, location: '', created_at: now, updated_at: now },
    image: null,
    calibrations: [],
    layers: defaultLayers(),
    measurements: [],
    pipe_types: defaultPipeTypes(),
    pipe_nodes: [],
    pipe_segments: [],
    settings: { waste_pct: 10, snap_elbow: true },
    print_layout: defaultPrintLayout(name),
  }
}

export const defaultPrintLayout = (name = ''): PrintLayout => ({
  paper_size: 'A3',
  orientation: 'landscape',
  scale_denominator: null,
  bbox_px: null,
  title_block: { project_name: name, location: '', date: new Date().toISOString().slice(0, 10), drawn_by: '', checked_by: '', sheet_no: '1/1', notes: '' },
  show_bom: true,
  show_legend: true,
  north_deg: 0,
})

export const defaultLayers = () => [
  { id: 'layer-ukur', name: 'Pengukuran', kind: 'measure' as const, color: '#2563EB', visible: true, locked: false },
  { id: 'layer-pipa', name: 'Pipa', kind: 'pipe' as const, color: '#0EA5E9', visible: true, locked: false },
]

/** Katalog awal; bisa diubah di aplikasi. */
export const defaultPipeTypes = (): PipeType[] => [
  { id: 'pt-pvc-075', material: 'PVC', diameter_in: 0.75, service: 'Air bersih', color: '#38BDF8', stock_length_m: 4 },
  { id: 'pt-pvc-1', material: 'PVC', diameter_in: 1, service: 'Air bersih', color: '#0EA5E9', stock_length_m: 4 },
  { id: 'pt-pvc-2', material: 'PVC', diameter_in: 2, service: 'Air bersih', color: '#2563EB', stock_length_m: 4 },
  { id: 'pt-pvc-3', material: 'PVC', diameter_in: 3, service: 'Air kotor', color: '#7C3AED', stock_length_m: 4 },
  { id: 'pt-pvc-4', material: 'PVC', diameter_in: 4, service: 'Air kotor', color: '#9333EA', stock_length_m: 4 },
  { id: 'pt-hdpe-2', material: 'HDPE', diameter_in: 2, service: 'Air bersih', color: '#059669', stock_length_m: 6 },
  { id: 'pt-hdpe-4', material: 'HDPE', diameter_in: 4, service: 'Air bersih', color: '#16A34A', stock_length_m: 6 },
  { id: 'pt-gi-1', material: 'GI', diameter_in: 1, service: 'Air bersih', color: '#EA580C', stock_length_m: 6 },
  { id: 'pt-gi-2', material: 'GI', diameter_in: 2, service: 'Air bersih', color: '#F97316', stock_length_m: 6 },
]

/** Naikkan proyek dari format lama ke versi sekarang. */
export function migrate(p: Project): Project {
  const base = newProject()
  const v = p.project.schema_version
  return {
    ...p,
    project: { ...p.project, schema_version: SCHEMA_VERSION },
    layers: v < 2 && !p.layers.some((l) => l.kind === 'pipe') ? [...p.layers, base.layers[1]] : p.layers,
    // v2 menyimpan diameter dalam mm (diameter_mm); v3 dalam inci nominal.
    pipe_types: (p.pipe_types ?? base.pipe_types).map((t) => {
      const legacy = (t as unknown as { diameter_mm?: number }).diameter_mm
      if (typeof legacy === 'number' && typeof t.diameter_in !== 'number') {
        const { diameter_mm: _drop, ...rest } = t as unknown as Record<string, unknown>
        void _drop
        return { ...rest, diameter_in: mmToNominalInch(legacy) } as unknown as PipeType
      }
      return t
    }),
    pipe_nodes: p.pipe_nodes ?? [],
    pipe_segments: p.pipe_segments ?? [],
    settings: { ...base.settings, ...(p.settings ?? {}) },
    print_layout: { ...defaultPrintLayout(p.project.name), ...(p.print_layout ?? {}), title_block: { ...defaultPrintLayout(p.project.name).title_block, ...(p.print_layout?.title_block ?? {}) } },
  }
}

export const IMAGE_DIR = 'images/'

/** Simpan proyek + foto asli jadi satu .zip. */
export async function saveProjectZip(project: Project, image: Blob | null): Promise<Blob> {
  const zip = new JSZip()
  const data: Project = { ...project, project: { ...project.project, updated_at: new Date().toISOString() } }
  zip.file('project.json', JSON.stringify(data, null, 2))
  if (image && project.image) zip.file(IMAGE_DIR + project.image.file_name, image)
  return zip.generateAsync({ type: 'blob', compression: 'STORE' })
}

export function checkSchema(raw: unknown): Project {
  if (typeof raw !== 'object' || raw === null || !('project' in raw)) {
    throw new ProjectFileError('Berkas ini bukan file proyek Pipe Plan.')
  }
  const p = raw as Project
  const v = p.project?.schema_version
  if (typeof v !== 'number') throw new ProjectFileError('Versi format proyek tidak tercatat.')
  if (v > SCHEMA_VERSION) {
    throw new ProjectFileError(`Proyek dibuat dengan format versi ${v}; aplikasi ini baru mendukung sampai versi ${SCHEMA_VERSION}.`)
  }
  return migrate({ ...p, calibrations: p.calibrations ?? [], layers: p.layers ?? [], measurements: p.measurements ?? [] })
}

export async function openProjectZip(file: Blob): Promise<{ project: Project; image: Blob | null }> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new ProjectFileError('Berkas tidak bisa dibaca sebagai .zip.')
  }
  const entry = zip.file('project.json')
  if (!entry) throw new ProjectFileError('project.json tidak ada di dalam berkas.')
  let raw: unknown
  try {
    raw = JSON.parse(await entry.async('string'))
  } catch {
    throw new ProjectFileError('project.json rusak.')
  }
  const project = checkSchema(raw)
  let image: Blob | null = null
  if (project.image) {
    const img = zip.file(IMAGE_DIR + project.image.file_name)
    if (img) image = new Blob([await img.async('arraybuffer')], { type: project.image.file_type })
  }
  return { project, image }
}
