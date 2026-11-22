import JSZip from 'jszip'
import { SCHEMA_VERSION, type Project } from './types'

export class ProjectFileError extends Error {}

export function newProject(name = 'Proyek baru'): Project {
  const now = new Date().toISOString()
  return {
    project: { schema_version: SCHEMA_VERSION, name, location: '', created_at: now, updated_at: now },
    image: null,
    calibrations: [],
    layers: [{ id: 'layer-ukur', name: 'Pengukuran', kind: 'measure', color: '#2563EB', visible: true, locked: false }],
    measurements: [],
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
  return { ...p, calibrations: p.calibrations ?? [], layers: p.layers ?? [], measurements: p.measurements ?? [] }
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
