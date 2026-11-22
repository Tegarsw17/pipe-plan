import type { Project, Pt } from './types'
import { dist } from './geometry'
import { projectOnSegment, nodeById } from './pipes'

export interface SnapTargets {
  vertices: Pt[]
  segments: [Pt, Pt][]
}

/** Kumpulkan titik dan garis yang bisa jadi sasaran snap: pengukuran, jaringan pipa, dan gambar yang sedang dibuat. */
export function collectTargets(p: Project, drawing: Pt[] = []): SnapTargets {
  const vertices: Pt[] = [...drawing]
  const segments: [Pt, Pt][] = []
  for (let i = 1; i < drawing.length; i++) segments.push([drawing[i - 1], drawing[i]])
  for (const m of p.measurements) {
    vertices.push(...m.points_px)
    for (let i = 1; i < m.points_px.length; i++) segments.push([m.points_px[i - 1], m.points_px[i]])
    if (m.type === 'area' && m.points_px.length > 2) segments.push([m.points_px[m.points_px.length - 1], m.points_px[0]])
  }
  for (const n of p.pipe_nodes) vertices.push(n.point_px)
  for (const s of p.pipe_segments) {
    const a = nodeById(p, s.from_node_id)
    const b = nodeById(p, s.to_node_id)
    if (a && b) segments.push([a.point_px, b.point_px])
  }
  return { vertices, segments }
}

/** Snap ke titik terdekat dulu, lalu ke garis terdekat. Mengembalikan null bila tak ada dalam `tol` piksel. */
export function snapPoint(q: Pt, t: SnapTargets, tol: number): { point: Pt; kind: 'vertex' | 'edge' } | null {
  let best: Pt | null = null
  let bestD = tol
  for (const v of t.vertices) {
    const d = dist(v, q)
    if (d <= bestD) { bestD = d; best = v }
  }
  if (best) return { point: best, kind: 'vertex' }
  bestD = tol
  for (const [a, b] of t.segments) {
    const r = projectOnSegment(a, b, q)
    if (r.d <= bestD) { bestD = r.d; best = r.point }
  }
  return best ? { point: best, kind: 'edge' } : null
}

/** Kunci arah ke kelipatan 45° (0/45/90/...) terhadap sumbu gambar, panjang mengikuti proyeksi kursor. */
export function constrainAngle(from: Pt, q: Pt): Pt {
  const dx = q[0] - from[0]
  const dy = q[1] - from[1]
  if (dx === 0 && dy === 0) return q
  const step = Math.PI / 4
  const a = Math.round(Math.atan2(dy, dx) / step) * step
  const len = dx * Math.cos(a) + dy * Math.sin(a)
  return [from[0] + len * Math.cos(a), from[1] + len * Math.sin(a)]
}

/** Titik berikutnya pada jarak `lengthPx` dari `from`, searah kursor (atau mendatar bila kursor tepat di `from`). */
export function pointAtLength(from: Pt, towards: Pt | null, lengthPx: number): Pt {
  let dx = towards ? towards[0] - from[0] : 1
  let dy = towards ? towards[1] - from[1] : 0
  const m = Math.hypot(dx, dy)
  if (m === 0) { dx = 1; dy = 0 } else { dx /= m; dy /= m }
  return [from[0] + dx * lengthPx, from[1] + dy * lengthPx]
}
