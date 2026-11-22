import { Trash2, ShieldCheck, ShieldAlert } from 'lucide-react'
import { activeCalibration } from '../lib/calibration'
import { fmtArea, fmtLength, measure } from '../lib/geometry'
import { useStore } from '../store'
import { mapApi } from './mapApi'

const TYPE_LABEL = { distance: 'Jarak', polyline: 'Polyline', area: 'Luas' } as const

function Calibration() {
  const cals = useStore((s) => s.project.calibrations)
  const hasImage = useStore((s) => !!s.project.image)
  const active = activeCalibration(cals)
  if (!hasImage) return null
  if (!active) {
    return (
      <section aria-labelledby="h-cal" className="card warn">
        <h2 id="h-cal"><ShieldAlert size={16} aria-hidden /> Skala belum diatur</h2>
        <p>Alat ukur aktif setelah skala dikalibrasi. Tekan <kbd>R</kbd>, lalu tarik garis di objek yang panjangnya Anda tahu.</p>
        <button type="button" className="btn primary" onClick={() => useStore.getState().setTool('reference')}>Mulai kalibrasi</button>
      </section>
    )
  }
  return (
    <section aria-labelledby="h-cal" className="card">
      <h2 id="h-cal"><ShieldCheck size={16} aria-hidden /> Skala</h2>
      <dl className="kv">
        <dt>Per piksel</dt><dd>{(active.meters_per_px * 100).toFixed(3).replace('.', ',')} cm</dd>
        {active.input && (<><dt>Referensi</dt><dd>{String(active.input.length).replace('.', ',')} {active.input.unit}</dd></>)}
        <dt>Akurasi</dt>
        <dd><span className="badge mid">{active.accuracy_level}</span> sekitar 1–2%</dd>
      </dl>
      <p className="hint">Perkiraan 1–2% berlaku bila garis referensi panjang dan sebidang dengan objek yang diukur.</p>
      <button type="button" className="btn small" onClick={() => useStore.getState().setTool('reference')}>Kalibrasi ulang</button>
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
                    {r ? (m.type === 'area' ? fmtArea(r.area_m2 ?? 0) : fmtLength(r.length_m)) : '—'}
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
      )}
    </section>
  )
}

export function SidePanel() {
  return (
    <aside className="side" aria-label="Panel proyek">
      <Calibration />
      <Measurements />
    </aside>
  )
}
