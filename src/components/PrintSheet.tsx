import { activeCalibration } from '../lib/calibration'
import { angleDeg, fmtAngle, fmtArea, fmtLength, measure } from '../lib/geometry'
import { fmtDia } from '../lib/inch'
import { FITTING_LABEL, allFittings, computeBom, nodeById, pipeName, typeById } from '../lib/pipes'
import { niceScaleBar, printTransform, scaleLabel, sheetGeometry, type Rect } from '../lib/print'
import type { Project, Pt } from '../lib/types'

const NAVY = '#1E3A5F'
const BLUE = '#2563EB'
const FIT_SHORT: Record<string, string> = { elbow: 'E', tee: 'T', cross: '+', reducer: 'R', valve: 'V', cap: 'C', meter: 'M', manhole: 'MH' }

const trunc = (s: string, widthMm: number, fontMm: number): string => {
  const max = Math.max(3, Math.floor(widthMm / (fontMm * 0.52)))
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function Label({ x, y, size = 2.6, children, anchor = 'middle', color = NAVY, rotate = 0, dy = 0 }: { x: number; y: number; size?: number; children: string; anchor?: 'start' | 'middle' | 'end'; color?: string; rotate?: number; dy?: number }) {
  return (
    <text
      transform={`translate(${x} ${y}) rotate(${rotate})`}
      dy={dy}
      fontSize={size}
      fontWeight={600}
      textAnchor={anchor}
      fill={color}
      stroke="#fff"
      strokeWidth={size * 0.28}
      strokeLinejoin="round"
      paintOrder="stroke"
    >
      {children}
    </text>
  )
}

/** Lembar cetak: halaman SVG berukuran milimeter. Garis dan teks tetap vektor di atas foto. */
export function PrintSheet({ project, imageUrl }: { project: Project; imageUrl: string }) {
  const image = project.image!
  const layout = project.print_layout
  const cal = activeCalibration(project.calibrations)
  const mpp = cal?.meters_per_px ?? null
  const g = sheetGeometry(layout)
  const [W, H] = g.page
  const t = mpp ? printTransform(layout, { w: image.width_px, h: image.height_px }, mpp, g) : null
  const k = t?.mmPerPx ?? 1
  const P = (p: Pt): [number, number] => [(t?.tx ?? 0) + p[0] * k, (t?.ty ?? 0) + p[1] * k]
  const tb = layout.title_block

  const usedTypes = Array.from(new Set(project.pipe_segments.map((s) => s.pipe_type_id)))
    .map((id) => typeById(project, id))
    .filter((x) => !!x)
  const bom = mpp ? computeBom(project, mpp) : null
  const fittings = allFittings(project)

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={`${W}mm`} height={`${H}mm`} viewBox={`0 0 ${W} ${H}`} fontFamily='"Fira Sans", sans-serif' className="print-svg" data-testid="print-svg">
      <defs>
        <clipPath id="clip-drawing"><rect x={g.drawing.x} y={g.drawing.y} width={g.drawing.w} height={g.drawing.h} /></clipPath>
      </defs>
      <rect width={W} height={H} fill="#fff" />

      {/* Gambar */}
      {t && (
        <g clipPath="url(#clip-drawing)">
          <image href={imageUrl} x={t.tx} y={t.ty} width={image.width_px * k} height={image.height_px * k} preserveAspectRatio="none" />
          {project.measurements.map((m) => {
            const layer = project.layers.find((l) => l.id === m.layer_id)
            if (layer && !layer.visible) return null
            const pts = m.points_px.map(P)
            const r = measure(m.type, m.points_px, mpp!)
            const path = pts.map((p) => p.join(',')).join(' ')
            const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
            return (
              <g key={m.id}>
                {m.type === 'area' ? <polygon points={path} fill={BLUE} fillOpacity={0.12} stroke={BLUE} strokeWidth={0.4} /> : <polyline points={path} fill="none" stroke={BLUE} strokeWidth={0.4} />}
                {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={0.7} fill="#fff" stroke={BLUE} strokeWidth={0.3} />)}
                {m.type === 'distance' && <Label x={mid(pts[0], pts[1])[0]} y={mid(pts[0], pts[1])[1]} dy={-1}>{fmtLength(r.length_m)}</Label>}
                {m.type === 'polyline' && r.segments_m.map((len, i) => <Label key={i} x={mid(pts[i], pts[i + 1])[0]} y={mid(pts[i], pts[i + 1])[1]} size={2.3} dy={-1}>{fmtLength(len)}</Label>)}
                {m.type === 'polyline' && <Label x={pts[pts.length - 1][0]} y={pts[pts.length - 1][1]} dy={-2.2}>{`Total ${fmtLength(r.length_m)}`}</Label>}
                {m.type === 'area' && (() => {
                  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length
                  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length
                  return <><Label x={cx} y={cy - 0.5}>{fmtArea(r.area_m2 ?? 0)}</Label><Label x={cx} y={cy + 3} size={2.2}>{`Keliling ${fmtLength(r.length_m)}`}</Label></>
                })()}
                {m.type === 'angle' && pts.length >= 3 && <Label x={pts[1][0]} y={pts[1][1]} dy={-2.5}>{fmtAngle(angleDeg(m.points_px[0], m.points_px[1], m.points_px[2]))}</Label>}
              </g>
            )
          })}
          {project.pipe_segments.map((s) => {
            const layer = project.layers.find((l) => l.id === s.layer_id)
            if (layer && !layer.visible) return null
            const a = nodeById(project, s.from_node_id)
            const b = nodeById(project, s.to_node_id)
            const pt = typeById(project, s.pipe_type_id)
            if (!a || !b) return null
            const [x1, y1] = P(a.point_px)
            const [x2, y2] = P(b.point_px)
            const w = 0.6 + (pt?.diameter_in ?? 2) * 0.25
            let ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
            if (ang > 90) ang -= 180
            if (ang < -90) ang += 180
            const len = Math.hypot(b.point_px[0] - a.point_px[0], b.point_px[1] - a.point_px[1]) * mpp!
            // Label panjang dipersingkat atau dihilangkan bila segmen terlalu pendek di kertas, supaya tidak menimpa fitting.
            const segMm = Math.hypot(x2 - x1, y2 - y1)
            const full = `${pipeName(pt)} · ${fmtLength(len)}`
            const fits = (txt: string) => txt.length * 2.4 * 0.52 <= segMm * 0.9
            const segLabel = fits(full) ? full : fits(fmtLength(len)) ? fmtLength(len) : null
            return (
              <g key={s.id}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={w + 0.8} strokeLinecap="round" />
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={pt?.color ?? BLUE} strokeWidth={w} strokeLinecap="round" />
                {segLabel && <Label x={(x1 + x2) / 2} y={(y1 + y2) / 2} rotate={ang} dy={-(w / 2 + 0.9)} size={2.4}>{segLabel}</Label>}
              </g>
            )
          })}
          {project.pipe_nodes.map((n) => {
            const layer = project.layers.find((l) => l.id === n.layer_id)
            if (layer && !layer.visible) return null
            const [x, y] = P(n.point_px)
            const fits = fittings.filter((f) => f.node_id === n.id)
            const special = ['valve', 'cap', 'meter', 'manhole'].includes(n.node_type)
            return (
              <g key={n.id}>
                {special ? <rect x={x - 1.1} y={y - 1.1} width={2.2} height={2.2} fill="#DC2626" stroke="#fff" strokeWidth={0.3} /> : <circle cx={x} cy={y} r={0.9} fill="#fff" stroke={NAVY} strokeWidth={0.35} />}
                {fits.length > 0 && <Label x={x} y={y} dy={-2.2} size={2.4}>{fits.map((f) => FIT_SHORT[f.kind] + (f.angle_deg ?? '')).join(' ')}</Label>}
              </g>
            )
          })}
        </g>
      )}
      {!t && <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={5} fill="#991b1b">Kalibrasi skala dulu untuk mencetak berskala.</text>}

      {/* Bingkai */}
      <rect x={g.frame.x} y={g.frame.y} width={g.frame.w} height={g.frame.h} fill="none" stroke="#000" strokeWidth={0.5} />
      <line x1={g.strip.x} y1={g.strip.y} x2={g.strip.x + g.strip.w} y2={g.strip.y} stroke="#000" strokeWidth={0.5} />
      <line x1={g.bom.x} y1={g.strip.y} x2={g.bom.x} y2={g.strip.y + g.strip.h} stroke="#000" strokeWidth={0.3} />
      <line x1={g.titleBlock.x} y1={g.strip.y} x2={g.titleBlock.x} y2={g.strip.y + g.strip.h} stroke="#000" strokeWidth={0.3} />

      {/* Legenda, panah utara, scale bar */}
      {layout.show_legend && t && (
        <g>
          <Section r={g.legend} title="LEGENDA" />
          {usedTypes.slice(0, 5).map((pt, i) => (
            <g key={pt!.id}>
              <line x1={g.legend.x + 3} y1={g.legend.y + 10 + i * 3.8} x2={g.legend.x + 11} y2={g.legend.y + 10 + i * 3.8} stroke={pt!.color} strokeWidth={0.6 + pt!.diameter_in * 0.25} />
              <text x={g.legend.x + 13} y={g.legend.y + 10.9 + i * 3.8} fontSize={2.5} fill="#000">{trunc(`${pipeName(pt)} · ${pt!.service}`, g.legend.w - 30, 2.5)}</text>
            </g>
          ))}
          {usedTypes.length > 5 && <text x={g.legend.x + 3} y={g.legend.y + 10.9 + 5 * 3.8} fontSize={2.3} fill="#555">{`+${usedTypes.length - 5} jenis lain`}</text>}
          {usedTypes.length === 0 && <text x={g.legend.x + 3} y={g.legend.y + 11} fontSize={2.5} fill="#555">Belum ada pipa.</text>}
          <text x={g.legend.x + 3} y={g.legend.y + 31} fontSize={2.2} fill="#444">E elbow · T tee · R reducer · V valve · C cap</text>
          <NorthArrow cx={g.legend.x + g.legend.w - 9} cy={g.legend.y + 15} deg={layout.north_deg} />
          <ScaleBar x={g.legend.x + 4} y={g.legend.y + g.legend.h - 10} maxMm={g.legend.w - 10} scaleDen={t.scaleDen} />
          <text x={g.legend.x + 3} y={g.legend.y + g.legend.h - 2.5} fontSize={2.1} fill="#444">Cetak 100% (actual size).</text>
        </g>
      )}

      {/* BOM */}
      {layout.show_bom && bom && (
        <g>
          <Section r={g.bom} title="DAFTAR MATERIAL (BOM)" />
          {(() => {
            const rows: { a: string; b: string }[] = [
              ...bom.pipes.map((r) => ({ a: `${fmtDia(r.diameter_in)} ${r.material}`, b: `${r.length_m.toFixed(2).replace('.', ',')} m · ${r.pieces} btg` })),
              ...bom.fittings.map((f) => ({ a: `${FITTING_LABEL[f.kind]}${f.angle_deg ? ' ' + f.angle_deg + '°' : ''} ${fmtDia(f.diameter_in)}`, b: `${f.count}` })),
            ]
            const maxRows = Math.floor((g.bom.h - 11) / 3.5)
            const shown = rows.length > maxRows ? rows.slice(0, maxRows - 1) : rows
            return (
              <>
                {shown.map((r, i) => (
                  <g key={i}>
                    <text x={g.bom.x + 3} y={g.bom.y + 11 + i * 3.5} fontSize={2.5} fill="#000">{trunc(r.a, g.bom.w * 0.55, 2.5)}</text>
                    <text x={g.bom.x + g.bom.w - 3} y={g.bom.y + 11 + i * 3.5} fontSize={2.5} fill="#000" textAnchor="end">{r.b}</text>
                  </g>
                ))}
                {rows.length > shown.length && <text x={g.bom.x + 3} y={g.bom.y + 11 + shown.length * 3.5} fontSize={2.3} fill="#555">{`+${rows.length - shown.length} baris lainnya (lihat ekspor CSV)`}</text>}
                {rows.length === 0 && <text x={g.bom.x + 3} y={g.bom.y + 11} fontSize={2.5} fill="#555">Belum ada pipa.</text>}
                <text x={g.bom.x + 3} y={g.bom.y + g.bom.h - 2.5} fontSize={2.1} fill="#444">{`Cadangan ${project.settings.waste_pct}%`}</text>
              </>
            )
          })()}
        </g>
      )}

      {/* Kop gambar */}
      <TitleBlock r={g.titleBlock} rows={[
        [{ l: 'Proyek', v: tb.project_name || project.project.name, big: true }],
        [{ l: 'Lokasi', v: tb.location }],
        [{ l: 'Tanggal', v: tb.date }, { l: 'Skala', v: t ? scaleLabel(t.scaleDen) : '—' }],
        [{ l: 'Digambar', v: tb.drawn_by }, { l: 'Diperiksa', v: tb.checked_by }],
        [{ l: 'Lembar', v: tb.sheet_no }, { l: 'Kertas', v: `${layout.paper_size} ${layout.orientation === 'landscape' ? 'lanskap' : 'potret'}` }],
        [{ l: 'Akurasi', v: cal ? `${cal.accuracy_level}${cal.error_pct != null ? ` · selisih uji ${cal.error_pct.toFixed(1).replace('.', ',')}%` : ''}` : '—' }],
        [{ l: 'Catatan', v: tb.notes }],
      ]} />
    </svg>
  )
}

function Section({ r, title }: { r: Rect; title: string }) {
  return <text x={r.x + 3} y={r.y + 5.5} fontSize={2.8} fontWeight={700} fill="#000">{title}</text>
}

function NorthArrow({ cx, cy, deg }: { cx: number; cy: number; deg: number }) {
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${deg})`}>
      <polygon points="0,-7 3,4 0,2 -3,4" fill="#000" />
      <polygon points="0,-7 3,4 0,2" fill="#fff" stroke="#000" strokeWidth={0.3} />
      <text y={-8.3} fontSize={3.2} fontWeight={700} textAnchor="middle" fill="#000">U</text>
    </g>
  )
}

function ScaleBar({ x, y, maxMm, scaleDen }: { x: number; y: number; maxMm: number; scaleDen: number }) {
  const bar = niceScaleBar(maxMm, scaleDen)
  const seg = bar.mm / bar.divisions
  return (
    <g data-testid="scale-bar" data-length-mm={bar.mm} data-meters={bar.meters}>
      {Array.from({ length: bar.divisions }, (_, i) => (
        <rect key={i} x={x + i * seg} y={y} width={seg} height={1.6} fill={i % 2 === 0 ? '#000' : '#fff'} stroke="#000" strokeWidth={0.25} />
      ))}
      {Array.from({ length: bar.divisions + 1 }, (_, i) => (
        <text key={i} x={x + i * seg} y={y - 0.8} fontSize={2.2} textAnchor="middle" fill="#000">{i === bar.divisions ? `${bar.meters} m` : String((bar.meters / bar.divisions) * i).replace('.', ',')}</text>
      ))}
    </g>
  )
}

interface Cell { l: string; v: string; big?: boolean }

function TitleBlock({ r, rows }: { r: Rect; rows: Cell[][] }) {
  const rowH = r.h / rows.length
  return (
    <g>
      {rows.map((cells, ri) => {
        const y = r.y + ri * rowH
        const cw = r.w / cells.length
        return (
          <g key={ri}>
            {ri > 0 && <line x1={r.x} y1={y} x2={r.x + r.w} y2={y} stroke="#000" strokeWidth={0.2} />}
            {cells.map((c, ci) => {
              const x = r.x + ci * cw
              return (
                <g key={ci}>
                  {ci > 0 && <line x1={x} y1={y} x2={x} y2={y + rowH} stroke="#000" strokeWidth={0.2} />}
                  <text x={x + 1.5} y={y + 2.3} fontSize={1.8} fill="#555">{c.l}</text>
                  <text x={x + 1.5} y={y + rowH - 1.2} fontSize={c.big ? 3.4 : 2.6} fontWeight={c.big ? 700 : 500} fill="#000">{trunc(c.v, cw - 3, c.big ? 3.4 : 2.6)}</text>
                </g>
              )
            })}
          </g>
        )
      })}
    </g>
  )
}
