import type { NodeType, PipeNode, PipeSegment, PipeType, Project, Pt } from './types'
import { dist } from './geometry'

/* ---------- Bantu ---------- */

export const nodeById = (p: Project, id: string): PipeNode | undefined => p.pipe_nodes.find((n) => n.id === id)
export const typeById = (p: Project, id: string): PipeType | undefined => p.pipe_types.find((t) => t.id === id)
export const segmentsAt = (p: Project, nodeId: string): PipeSegment[] =>
  p.pipe_segments.filter((s) => s.from_node_id === nodeId || s.to_node_id === nodeId)

export function segmentLengthPx(p: Project, s: PipeSegment): number {
  const a = nodeById(p, s.from_node_id)
  const b = nodeById(p, s.to_node_id)
  return a && b ? dist(a.point_px, b.point_px) : 0
}

export const pipeName = (t: PipeType | undefined): string => (t ? `Ø${t.diameter_mm} ${t.material}` : 'Tanpa jenis')

/* ---------- Operasi graf (murni: kembalikan Project baru) ---------- */

export function addNode(p: Project, node: PipeNode): Project {
  return { ...p, pipe_nodes: [...p.pipe_nodes, node] }
}

export function addSegment(p: Project, seg: PipeSegment): Project {
  if (seg.from_node_id === seg.to_node_id) return p
  const dup = p.pipe_segments.some(
    (s) => (s.from_node_id === seg.from_node_id && s.to_node_id === seg.to_node_id) || (s.from_node_id === seg.to_node_id && s.to_node_id === seg.from_node_id),
  )
  return dup ? p : { ...p, pipe_segments: [...p.pipe_segments, seg] }
}

export function moveNode(p: Project, id: string, pt: Pt): Project {
  return { ...p, pipe_nodes: p.pipe_nodes.map((n) => (n.id === id ? { ...n, point_px: pt } : n)) }
}

/** Pecah segmen di `node.point_px`: A-B menjadi A-node dan node-B, jenis pipa sama. */
export function splitSegment(p: Project, segId: string, node: PipeNode, newSegId: string): Project {
  const s = p.pipe_segments.find((x) => x.id === segId)
  if (!s) return p
  const first: PipeSegment = { ...s, to_node_id: node.id }
  const second: PipeSegment = { ...s, id: newSegId, from_node_id: node.id }
  return {
    ...p,
    pipe_nodes: [...p.pipe_nodes, node],
    pipe_segments: p.pipe_segments.flatMap((x) => (x.id === segId ? [first, second] : [x])),
  }
}

/** Buang node tanpa segmen, kecuali node khusus (valve, cap, meter, manhole) yang sengaja diletakkan. */
export function pruneOrphans(p: Project): Project {
  const used = new Set(p.pipe_segments.flatMap((s) => [s.from_node_id, s.to_node_id]))
  return { ...p, pipe_nodes: p.pipe_nodes.filter((n) => used.has(n.id)) }
}

export function deleteSegment(p: Project, segId: string): Project {
  return pruneOrphans({ ...p, pipe_segments: p.pipe_segments.filter((s) => s.id !== segId) })
}

/**
 * Hapus node dengan menjaga graf valid:
 * - 2 segmen dengan jenis pipa sama digabung jadi satu (jalur tidak putus);
 * - selain itu segmen yang menempel ikut dihapus dan node yatim dibuang.
 */
export function deleteNode(p: Project, nodeId: string): Project {
  const segs = segmentsAt(p, nodeId)
  if (segs.length === 2 && segs[0].pipe_type_id === segs[1].pipe_type_id) {
    const other = (s: PipeSegment) => (s.from_node_id === nodeId ? s.to_node_id : s.from_node_id)
    const a = other(segs[0])
    const b = other(segs[1])
    const merged: PipeSegment = { ...segs[0], from_node_id: a, to_node_id: b }
    const rest = p.pipe_segments.filter((s) => s.id !== segs[0].id && s.id !== segs[1].id)
    const exists = a === b || rest.some((s) => (s.from_node_id === a && s.to_node_id === b) || (s.from_node_id === b && s.to_node_id === a))
    return {
      ...p,
      pipe_nodes: p.pipe_nodes.filter((n) => n.id !== nodeId),
      pipe_segments: exists ? rest : [...rest, merged],
    }
  }
  return pruneOrphans({
    ...p,
    pipe_nodes: p.pipe_nodes.filter((n) => n.id !== nodeId),
    pipe_segments: p.pipe_segments.filter((s) => s.from_node_id !== nodeId && s.to_node_id !== nodeId),
  })
}

export function setNodeType(p: Project, id: string, node_type: NodeType): Project {
  return { ...p, pipe_nodes: p.pipe_nodes.map((n) => (n.id === id ? { ...n, node_type } : n)) }
}

export function setSegmentType(p: Project, segId: string, pipe_type_id: string): Project {
  return { ...p, pipe_segments: p.pipe_segments.map((s) => (s.id === segId ? { ...s, pipe_type_id } : s)) }
}

/** Titik terdekat di segmen untuk menyambung percabangan. */
export function projectOnSegment(a: Pt, b: Pt, q: Pt): { point: Pt; t: number; d: number } {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / len2))
  const point: Pt = [a[0] + t * dx, a[1] + t * dy]
  return { point, t, d: dist(point, q) }
}

/* ---------- Fitting ---------- */

export type FittingKind = 'elbow' | 'tee' | 'cross' | 'reducer' | 'valve' | 'cap' | 'meter' | 'manhole'

export interface Fitting {
  node_id: string
  kind: FittingKind
  material: string
  diameter_mm: number
  /** Hanya elbow. */
  angle_deg: number | null
  /** Untuk reducer: diameter sisi kecil. */
  diameter_small_mm: number | null
  /** true bila dipilih pengguna (bukan saran otomatis). */
  manual: boolean
}

const BEND_MIN_DEG = 10

/** Sudut belok (0 = lurus) pada node dengan dua segmen. */
export function deflectionDeg(center: Pt, a: Pt, b: Pt): number {
  const v1 = [center[0] - a[0], center[1] - a[1]]
  const v2 = [b[0] - center[0], b[1] - center[1]]
  const dot = v1[0] * v2[0] + v1[1] * v2[1]
  const m = Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1])
  if (m === 0) return 0
  return (Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180) / Math.PI
}

export const standardAngle = (deg: number): number => (Math.abs(deg - 45) <= Math.abs(deg - 90) ? 45 : 90)

/** Fitting yang disarankan/dipilih di satu node. */
export function fittingsAt(p: Project, node: PipeNode): Fitting[] {
  const segs = segmentsAt(p, node.id)
  const types = segs.map((s) => typeById(p, s.pipe_type_id)).filter((t): t is PipeType => !!t)
  if (types.length === 0) return []
  const big = types.reduce((m, t) => (t.diameter_mm > m.diameter_mm ? t : m))
  const base = { node_id: node.id, material: big.material, diameter_mm: big.diameter_mm, angle_deg: null, diameter_small_mm: null }
  const bend = (): number | null => {
    if (segs.length !== 2) return null
    const [a, b] = segs.map((s) => nodeById(p, s.from_node_id === node.id ? s.to_node_id : s.from_node_id)?.point_px)
    if (!a || !b) return null
    return deflectionDeg(node.point_px, a, b)
  }
  const angleFor = (deg: number) => (p.settings.snap_elbow ? standardAngle(deg) : Math.round(deg))

  const manualKinds: Partial<Record<NodeType, FittingKind>> = { valve: 'valve', cap: 'cap', meter: 'meter', manhole: 'manhole', tee: 'tee', reducer: 'reducer', elbow: 'elbow' }
  if (node.node_type !== 'junction') {
    const kind = manualKinds[node.node_type]!
    const small = types.reduce((m, t) => (t.diameter_mm < m.diameter_mm ? t : m))
    const deg = bend()
    return [
      {
        ...base,
        kind,
        manual: true,
        angle_deg: kind === 'elbow' ? (node.fitting_angle_deg ?? (deg !== null ? angleFor(deg) : 90)) : null,
        diameter_small_mm: kind === 'reducer' ? small.diameter_mm : null,
      },
    ]
  }

  const out: Fitting[] = []
  if (segs.length === 2) {
    const small = types.reduce((m, t) => (t.diameter_mm < m.diameter_mm ? t : m))
    if (small.diameter_mm !== big.diameter_mm) out.push({ ...base, kind: 'reducer', manual: false, diameter_small_mm: small.diameter_mm })
    const deg = bend()
    if (deg !== null && deg >= BEND_MIN_DEG) out.push({ ...base, kind: 'elbow', manual: false, angle_deg: angleFor(deg) })
  } else if (segs.length === 3) {
    out.push({ ...base, kind: 'tee', manual: false })
  } else if (segs.length >= 4) {
    out.push({ ...base, kind: 'cross', manual: false })
  }
  return out
}

export const allFittings = (p: Project): Fitting[] => p.pipe_nodes.flatMap((n) => fittingsAt(p, n))

export const FITTING_LABEL: Record<FittingKind, string> = {
  elbow: 'Elbow',
  tee: 'Tee',
  cross: 'Cross',
  reducer: 'Reducer',
  valve: 'Valve',
  cap: 'Cap',
  meter: 'Meteran',
  manhole: 'Manhole',
}

export function fittingText(f: Fitting): string {
  const d = f.kind === 'reducer' && f.diameter_small_mm ? `Ø${f.diameter_mm}×${f.diameter_small_mm}` : `Ø${f.diameter_mm}`
  return `${FITTING_LABEL[f.kind]}${f.angle_deg ? ` ${f.angle_deg}°` : ''} ${d} ${f.material}`
}

/* ---------- BOM ---------- */

export interface BomPipeRow {
  material: string
  diameter_mm: number
  stock_length_m: number
  length_m: number
  length_with_waste_m: number
  pieces: number
  segments: number
}

export interface BomFittingRow {
  kind: FittingKind
  material: string
  diameter_mm: number
  angle_deg: number | null
  diameter_small_mm: number | null
  count: number
}

export interface Bom {
  pipes: BomPipeRow[]
  fittings: BomFittingRow[]
  total_length_m: number
}

export function computeBom(p: Project, mpp: number): Bom {
  const rows = new Map<string, BomPipeRow>()
  for (const s of p.pipe_segments) {
    const t = typeById(p, s.pipe_type_id)
    if (!t) continue
    const key = `${t.material}|${t.diameter_mm}|${t.stock_length_m}`
    const row = rows.get(key) ?? { material: t.material, diameter_mm: t.diameter_mm, stock_length_m: t.stock_length_m, length_m: 0, length_with_waste_m: 0, pieces: 0, segments: 0 }
    row.length_m += segmentLengthPx(p, s) * mpp
    row.segments += 1
    rows.set(key, row)
  }
  const waste = 1 + Math.max(0, p.settings.waste_pct) / 100
  const pipes = [...rows.values()]
    .map((r) => {
      const withWaste = r.length_m * waste
      // toleransi 1e-9 agar hasil pembulatan float (mis. 12.000000001) tidak menambah satu batang.
      return { ...r, length_with_waste_m: withWaste, pieces: r.stock_length_m > 0 ? Math.ceil(withWaste / r.stock_length_m - 1e-9) : 0 }
    })
    .sort((a, b) => a.material.localeCompare(b.material) || a.diameter_mm - b.diameter_mm)

  const fit = new Map<string, BomFittingRow>()
  for (const f of allFittings(p)) {
    const key = [f.kind, f.material, f.diameter_mm, f.angle_deg, f.diameter_small_mm].join('|')
    const row = fit.get(key) ?? { kind: f.kind, material: f.material, diameter_mm: f.diameter_mm, angle_deg: f.angle_deg, diameter_small_mm: f.diameter_small_mm, count: 0 }
    row.count += 1
    fit.set(key, row)
  }
  const fittings = [...fit.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.diameter_mm - b.diameter_mm)
  return { pipes, fittings, total_length_m: pipes.reduce((s, r) => s + r.length_m, 0) }
}

/* ---------- CSV ---------- */

const csvCell = (v: string | number | null): string => {
  let s = v === null ? '' : String(v)
  // Cegah rumus tersulut saat dibuka di spreadsheet.
  if (/^[=+\-@]/.test(s) && typeof v === 'string') s = "'" + s
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const toCsv = (rows: (string | number | null)[][]): string => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')

const num = (n: number, d = 2) => n.toFixed(d)

export function bomCsv(bom: Bom, wastePct: number): string {
  const rows: (string | number | null)[][] = [
    ['PIPA'],
    ['Material', 'Diameter (mm)', 'Panjang total (m)', `Dengan cadangan ${wastePct}% (m)`, 'Panjang batang (m)', 'Jumlah batang', 'Jumlah segmen'],
    ...bom.pipes.map((r) => [r.material, r.diameter_mm, num(r.length_m), num(r.length_with_waste_m), r.stock_length_m, r.pieces, r.segments]),
    [],
    ['FITTING'],
    ['Jenis', 'Material', 'Diameter (mm)', 'Sudut', 'Jumlah'],
    ...bom.fittings.map((f) => [FITTING_LABEL[f.kind], f.material, f.kind === 'reducer' && f.diameter_small_mm ? `${f.diameter_mm}x${f.diameter_small_mm}` : f.diameter_mm, f.angle_deg ? `${f.angle_deg}°` : '', f.count]),
  ]
  return toCsv(rows)
}
