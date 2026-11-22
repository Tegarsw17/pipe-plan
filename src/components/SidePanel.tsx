import { useEffect, useState } from 'react'
import { Trash2, ShieldCheck, ShieldAlert, Download } from 'lucide-react'
import { PipePanel } from './PipePanel'
import { BomPanel } from './BomPanel'
import { downloadCsv, safeName } from '../lib/download'
import { toCsv } from '../lib/pipes'
import { activeCalibration } from '../lib/calibration'
import { fmtAngle, fmtArea, fmtLength, measure } from '../lib/geometry'
import { useStore } from '../store'
import { mapApi } from './mapApi'

const TYPE_LABEL = { distance: 'Jarak', polyline: 'Polyline', area: 'Luas', angle: 'Sudut' } as const

const METHOD_LABEL = { reference: 'Garis referensi', exif: 'EXIF drone', geotiff: 'GeoTIFF' } as const
const LEVEL_NOTE = { Tinggi: 'sampai beberapa cm bila RTK/PPK atau GCP', Sedang: 'sekitar 1–2% bila referensi panjang dan sebidang', Estimasi: 'sekitar 2–5%, memburuk bila kamera miring' } as const
const LEVEL_CLASS = { Tinggi: 'high', Sedang: 'mid', Estimasi: 'est' } as const

function Calibration() {
  const cals = useStore((s) => s.project.calibrations)
  const image = useStore((s) => s.project.image)
  const active = activeCalibration(cals)
  if (!image) return null
  const hasExif = !!image.exif && ((image.exif as { focal_mm?: number | null }).focal_mm != null || (image.exif as { altitude_rel_m?: number | null }).altitude_rel_m != null)
  const st = useStore.getState
  if (!active) {
    return (
      <section aria-labelledby="h-cal" className="card warn">
        <h2 id="h-cal"><ShieldAlert size={16} aria-hidden /> Skala belum diatur</h2>
        <p>Alat ukur aktif setelah skala dikalibrasi. Tekan <kbd>R</kbd>, lalu tarik garis di objek yang panjangnya Anda tahu.</p>
        <div className="actions left">
          <button type="button" className="btn primary" onClick={() => st().setTool('reference')}>Garis referensi</button>
          {hasExif && <button type="button" className="btn" onClick={() => st().openDialog('exif')}>Dari EXIF</button>}
        </div>
      </section>
    )
  }
  const ver = active.verifications?.[active.verifications.length - 1]
  const verClass = ver ? (Math.abs(ver.diff_pct) <= 2 ? 'ok' : Math.abs(ver.diff_pct) <= 5 ? 'warn' : 'bad') : ''
  return (
    <section aria-labelledby="h-cal" className="card">
      <h2 id="h-cal"><ShieldCheck size={16} aria-hidden /> Skala</h2>
      <dl className="kv">
        <dt>Per piksel</dt><dd>{(active.meters_per_px * 100).toFixed(3).replace('.', ',')} cm</dd>
        <dt>Metode</dt><dd className="plain">{METHOD_LABEL[active.method]}{active.input ? ` · ${String(active.input.length).replace('.', ',')} ${active.input.unit}` : ''}</dd>
        <dt>Akurasi</dt>
        <dd className="plain"><span className={`badge ${LEVEL_CLASS[active.accuracy_level]}`}>{active.accuracy_level}</span> {LEVEL_NOTE[active.accuracy_level]}</dd>
        {ver && (<><dt>Verifikasi</dt><dd className={`plain ver ${verClass}`}>selisih {ver.diff_pct >= 0 ? '+' : ''}{ver.diff_pct.toFixed(1).replace('.', ',')}%{verClass === 'bad' ? ' — terlalu besar, kalibrasi ulang' : ''}</dd></>)}
        {image.crs && (<><dt>CRS</dt><dd className="plain">{image.crs}</dd></>)}
      </dl>
      {(active.notes?.length ?? 0) > 0 && (
        <ul className="warnings">{active.notes!.map((n) => <li key={n}>{n}</li>)}</ul>
      )}
      {!ver && <p className="hint">Belum diverifikasi. Ukur objek kedua yang panjangnya diketahui (tombol K) sebelum dipakai menghitung material.</p>}
      <div className="actions left">
        <button type="button" className="btn small" onClick={() => st().setTool('verify')}>Verifikasi (K)</button>
        <button type="button" className="btn small" onClick={() => st().setTool('reference')}>Kalibrasi ulang</button>
        {hasExif && <button type="button" className="btn small" onClick={() => st().openDialog('exif')}>Dari EXIF</button>}
      </div>
    </section>
  )
}

function Measurements() {
  const items = useStore((s) => s.project.measurements)
  const selected = useStore((s) => s.selectedId)
  const mpp = useStore((s) => activeCalibration(s.project.calibrations)?.meters_per_px ?? null)
  const hasImage = useStore((s) => !!s.project.image)
  if (!hasImage) return null
  return (
    <section aria-labelledby="h-list" className="card grow-card">
      <h2 id="h-list">Pengukuran <span className="count">{items.length}</span></h2>
      {items.length === 0 ? (
        <p className="muted">Belum ada pengukuran. Pilih alat Jarak, Polyline, atau Luas lalu klik di foto. Enter atau klik dua kali untuk selesai.</p>
      ) : (
        <>
        <ul className="list">
          {items.map((m) => {
            const r = mpp ? measure(m.type, m.points_px, mpp) : null
            return (
              <li key={m.id} className={m.id === selected ? 'sel' : ''}>
                <button
                  type="button"
                  className="row-btn"
                  aria-current={m.id === selected}
                  onClick={() => {
                    useStore.getState().setTool('select')
                    useStore.getState().select(m.id)
                    mapApi.current?.focusPoints(m.points_px)
                  }}
                >
                  <span className="t">{m.label || TYPE_LABEL[m.type]}</span>
                  <span className="v">
                    {r ? (m.type === 'area' ? fmtArea(r.area_m2 ?? 0) : m.type === 'angle' ? fmtAngle(r.angle_deg ?? 0) : fmtLength(r.length_m)) : '—'}
                  </span>
                  <span className="s">
                    {TYPE_LABEL[m.type]} · {m.points_px.length} titik
                    {r && m.type === 'area' ? ` · keliling ${fmtLength(r.length_m)}` : ''}
                    {r && m.type === 'polyline' ? ` · ${r.segments_m.map(fmtLength).join(' + ')}` : ''}
                  </span>
                </button>
                <button type="button" className="icon-btn danger" aria-label={`Hapus ${m.label}`} onClick={() => useStore.getState().removeMeasurement(m.id)}>
                  <Trash2 size={16} aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
        <button type="button" className="btn small export" onClick={() => exportMeasurements()}><Download size={14} aria-hidden /> Ekspor daftar (CSV)</button>
        </>
      )}
    </section>
  )
}

function exportMeasurements() {
  const { project } = useStore.getState()
  const mpp = activeCalibration(project.calibrations)?.meters_per_px
  if (!mpp) return
  const rows: (string | number | null)[][] = [['Nama', 'Jenis', 'Titik', 'Panjang/keliling (m)', 'Luas (m2)', 'Sudut (derajat)']]
  for (const m of project.measurements) {
    const r = measure(m.type, m.points_px, mpp)
    rows.push([m.label, TYPE_LABEL[m.type], m.points_px.length, r.length_m.toFixed(3), r.area_m2 === null ? '' : r.area_m2.toFixed(3), r.angle_deg === null ? '' : r.angle_deg.toFixed(2)])
  }
  downloadCsv(toCsv(rows), `${safeName(project.project.name)}-pengukuran.csv`)
}

type Tab = 'ukur' | 'pipa' | 'bom'
const TABS: [Tab, string][] = [['ukur', 'Ukur'], ['pipa', 'Pipa'], ['bom', 'BOM']]

export function SidePanel() {
  const [tab, setTab] = useState<Tab>('ukur')
  const tool = useStore((s) => s.tool)
  const hasImage = useStore((s) => !!s.project.image)
  useEffect(() => { if (tool === 'pipe') setTab('pipa') }, [tool])
  return (
    <aside className="side" aria-label="Panel proyek">
      {hasImage && (
        <div className="tabs" role="tablist" aria-label="Panel">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      )}
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="panel-body">
        {tab === 'ukur' && (<><Calibration /><Measurements /></>)}
        {tab === 'pipa' && hasImage && <PipePanel />}
        {tab === 'bom' && hasImage && <BomPanel />}
      </div>
    </aside>
  )
}
