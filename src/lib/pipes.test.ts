import { describe, expect, it } from 'vitest'
import { newProject, migrate } from './project'
import { addNode, addSegment, computeBom, deleteNode, deleteSegment, fittingsAt, nodeById, projectOnSegment, splitSegment, bomCsv, setNodeType } from './pipes'
import type { PipeNode, Project } from './types'

const node = (id: string, x: number, y: number): PipeNode => ({ id, layer_id: 'layer-pipa', point_px: [x, y], node_type: 'junction', fitting_angle_deg: null })
const seg = (id: string, a: string, b: string, t = 'pt-pvc-4') => ({ id, layer_id: 'layer-pipa', from_node_id: a, to_node_id: b, pipe_type_id: t, label: '' })

function build(nodes: PipeNode[], segs: ReturnType<typeof seg>[]): Project {
  let p = newProject()
  for (const n of nodes) p = addNode(p, n)
  for (const s of segs) p = addSegment(p, s)
  return p
}

describe('fitting otomatis', () => {
  it('lurus: tanpa fitting', () => {
    const p = build([node('a', 0, 0), node('b', 100, 0), node('c', 200, 0)], [seg('s1', 'a', 'b'), seg('s2', 'b', 'c')])
    expect(fittingsAt(p, nodeById(p, 'b')!)).toHaveLength(0)
  })
  it('belok 90° jadi elbow 90°', () => {
    const p = build([node('a', 0, 0), node('b', 100, 0), node('c', 100, 100)], [seg('s1', 'a', 'b'), seg('s2', 'b', 'c')])
    const f = fittingsAt(p, nodeById(p, 'b')!)
    expect(f.map((x) => [x.kind, x.angle_deg])).toEqual([['elbow', 90]])
  })
  it('belok 40° dibulatkan ke 45° bila snap aktif, tetap 40° bila nonaktif', () => {
    const rad = (40 * Math.PI) / 180
    let p = build([node('a', 0, 0), node('b', 100, 0), node('c', 100 + 100 * Math.cos(rad), 100 * Math.sin(rad))], [seg('s1', 'a', 'b'), seg('s2', 'b', 'c')])
    expect(fittingsAt(p, nodeById(p, 'b')!)[0].angle_deg).toBe(45)
    p = { ...p, settings: { ...p.settings, snap_elbow: false } }
    expect(fittingsAt(p, nodeById(p, 'b')!)[0].angle_deg).toBe(40)
  })
  it('3 segmen jadi tee; beda diameter jadi reducer', () => {
    const p = build([node('a', 0, 0), node('b', 100, 0), node('c', 200, 0), node('d', 100, 100)], [seg('s1', 'a', 'b'), seg('s2', 'b', 'c'), seg('s3', 'b', 'd', 'pt-pvc-2')])
    expect(fittingsAt(p, nodeById(p, 'b')!).map((f) => f.kind)).toEqual(['tee'])
    const q = build([node('a', 0, 0), node('b', 100, 0), node('c', 200, 0)], [seg('s1', 'a', 'b', 'pt-pvc-4'), seg('s2', 'b', 'c', 'pt-pvc-2')])
    const f = fittingsAt(q, nodeById(q, 'b')!)
    expect(f[0]).toMatchObject({ kind: 'reducer', diameter_in: 4, diameter_small_in: 2 })
  })
  it('node khusus menggantikan saran otomatis', () => {
    let p = build([node('a', 0, 0), node('b', 100, 0), node('c', 200, 0)], [seg('s1', 'a', 'b'), seg('s2', 'b', 'c')])
    p = setNodeType(p, 'b', 'valve')
    expect(fittingsAt(p, nodeById(p, 'b')!)[0]).toMatchObject({ kind: 'valve', manual: true })
  })
})

describe('edit graf', () => {
  it('pecah segmen menjaga panjang total', () => {
    let p = build([node('a', 0, 0), node('b', 200, 0)], [seg('s1', 'a', 'b')])
    p = splitSegment(p, 's1', node('m', 100, 0), 's2')
    expect(p.pipe_segments).toHaveLength(2)
    expect(computeBom(p, 0.1).total_length_m).toBeCloseTo(20)
  })
  it('hapus node di tengah menggabungkan segmen berjenis sama', () => {
    let p = build([node('a', 0, 0), node('b', 100, 0), node('c', 200, 0)], [seg('s1', 'a', 'b'), seg('s2', 'b', 'c')])
    p = deleteNode(p, 'b')
    expect(p.pipe_segments).toHaveLength(1)
    expect(p.pipe_segments[0]).toMatchObject({ from_node_id: 'a', to_node_id: 'c' })
  })
  it('hapus node percabangan menghapus segmennya dan membuang node yatim', () => {
    let p = build([node('a', 0, 0), node('b', 100, 0), node('c', 200, 0), node('d', 100, 100)], [seg('s1', 'a', 'b'), seg('s2', 'b', 'c'), seg('s3', 'b', 'd')])
    p = deleteNode(p, 'b')
    expect(p.pipe_segments).toHaveLength(0)
    expect(p.pipe_nodes).toHaveLength(0)
  })
  it('hapus segmen membuang node yatim', () => {
    let p = build([node('a', 0, 0), node('b', 100, 0), node('c', 200, 0)], [seg('s1', 'a', 'b'), seg('s2', 'b', 'c')])
    p = deleteSegment(p, 's2')
    expect(p.pipe_nodes.map((n) => n.id).sort()).toEqual(['a', 'b'])
  })
  it('segmen ke diri sendiri dan duplikat ditolak', () => {
    let p = build([node('a', 0, 0), node('b', 100, 0)], [seg('s1', 'a', 'b')])
    p = addSegment(p, seg('s2', 'b', 'a'))
    p = addSegment(p, seg('s3', 'a', 'a'))
    expect(p.pipe_segments).toHaveLength(1)
  })
  it('proyeksi titik ke segmen', () => {
    const r = projectOnSegment([0, 0], [100, 0], [30, 8])
    expect(r.point).toEqual([30, 0])
    expect(r.d).toBe(8)
  })
})

describe('BOM', () => {
  it('panjang, cadangan, dan batang dibulatkan ke atas', () => {
    // 100 px * 0,5 m/px = 50 m; +10% = 55 m; batang 4 m -> 14
    const p = build([node('a', 0, 0), node('b', 100, 0)], [seg('s1', 'a', 'b')])
    const bom = computeBom(p, 0.5)
    expect(bom.pipes[0]).toMatchObject({ material: 'PVC', diameter_in: 4, segments: 1, pieces: 14 })
    expect(bom.pipes[0].length_m).toBeCloseTo(50)
  })
  it('tepat kelipatan batang tidak menambah satu batang', () => {
    let p = build([node('a', 0, 0), node('b', 100, 0)], [seg('s1', 'a', 'b')])
    p = { ...p, settings: { ...p.settings, waste_pct: 0 } }
    expect(computeBom(p, 0.4).pipes[0].pieces).toBe(10) // 40 m / 4 m
  })
  it('CSV: header, jumlah, dan tidak menyulut rumus', () => {
    const p = build([node('a', 0, 0), node('b', 100, 0), node('c', 100, 100)], [seg('s1', 'a', 'b'), seg('s2', 'b', 'c')])
    const csv = bomCsv(computeBom(p, 0.1), 10)
    expect(csv).toContain('PIPA')
    expect(csv).toContain('Elbow')
    expect(csv.startsWith('﻿')).toBe(true)
  })
})

describe('migrasi', () => {
  it('proyek v1 naik ke v3 dengan katalog, layer pipa, dan pengaturan', () => {
    const v1 = { project: { schema_version: 1, name: 'x', location: '', created_at: '', updated_at: '' }, image: null, calibrations: [], layers: [{ id: 'layer-ukur', name: 'Pengukuran', kind: 'measure', color: '#000', visible: true, locked: false }], measurements: [] } as unknown as Project
    const m = migrate(v1)
    expect(m.project.schema_version).toBe(3)
    expect(m.layers.some((l) => l.kind === 'pipe')).toBe(true)
    expect(m.pipe_types.length).toBeGreaterThan(0)
    expect(m.settings.waste_pct).toBe(10)
  })
  it('proyek v2 (mm) dikonversi ke inci nominal tanpa memutus segmen', () => {
    const v2 = {
      ...newProject(),
      project: { schema_version: 2, name: 'x', location: '', created_at: '', updated_at: '' },
      pipe_types: [
        { id: 'pt-pvc-110', material: 'PVC', diameter_mm: 110, service: 'Air bersih', color: '#000', stock_length_m: 4 },
        { id: 'pt-pvc-63', material: 'PVC', diameter_mm: 63, service: 'Air bersih', color: '#000', stock_length_m: 4 },
        { id: 'x', material: 'PVC', diameter_mm: 50, service: 'a', color: '#000', stock_length_m: 4 },
      ],
      pipe_segments: [{ id: 's1', layer_id: 'layer-pipa', from_node_id: 'a', to_node_id: 'b', pipe_type_id: 'pt-pvc-110', label: '' }],
    } as unknown as Project
    const m = migrate(v2)
    expect(m.pipe_types.map((t) => t.diameter_in)).toEqual([4, 2, 1.5])
    expect(m.pipe_types.every((t) => !('diameter_mm' in t))).toBe(true)
    expect(m.pipe_segments[0].pipe_type_id).toBe('pt-pvc-110')
  })
})
