import { Download } from 'lucide-react'
import { useStore } from '../store'
import { activeCalibration } from '../lib/calibration'
import { FITTING_LABEL, bomCsv, computeBom } from '../lib/pipes'
import { fmtLength } from '../lib/geometry'
import { fmtDia, fmtInch } from '../lib/inch'
import { downloadCsv, safeName } from '../lib/download'

const nf = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function BomPanel() {
  const project = useStore((s) => s.project)
  const mpp = activeCalibration(project.calibrations)?.meters_per_px ?? null
  const waste = project.settings.waste_pct
  if (!mpp) return <p className="muted">BOM dihitung setelah skala dikalibrasi.</p>
  const bom = computeBom(project, mpp)
  const empty = bom.pipes.length === 0
  return (
    <div className="stack-lg" aria-live="polite">
      <section className="card" aria-labelledby="h-waste">
        <h2 id="h-waste">Cadangan (waste)</h2>
        <label className="field inline">
          <span>Persen</span>
          <input
            type="number" min={0} max={100} step={1} value={waste}
            onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) useStore.getState().setSettings({ waste_pct: Math.min(100, Math.max(0, n)) }) }}
          />
        </label>
        <p className="hint">Jumlah batang = pembulatan ke atas dari panjang × (1 + cadangan) ÷ panjang batang.</p>
      </section>

      {empty ? (
        <p className="muted">Belum ada pipa. Gunakan alat Pipa (L) untuk menggambar rangkaian.</p>
      ) : (
        <>
          <section className="card" aria-labelledby="h-bp">
            <h2 id="h-bp">Pipa <span className="count">{fmtLength(bom.total_length_m)}</span></h2>
            <div className="table-wrap">
              <table className="grid compact">
                <thead><tr><th>Jenis</th><th className="r">Panjang</th><th className="r">Batang</th></tr></thead>
                <tbody>
                  {bom.pipes.map((r) => (
                    <tr key={`${r.material}${r.diameter_in}${r.stock_length_m}`}>
                      <td>{fmtDia(r.diameter_in)} {r.material}<small>{r.segments} segmen · batang {r.stock_length_m} m</small></td>
                      <td className="r mono">{nf.format(r.length_m)} m<small>{nf.format(r.length_with_waste_m)} m +{waste}%</small></td>
                      <td className="r mono strong">{r.pieces}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card" aria-labelledby="h-bf">
            <h2 id="h-bf">Fitting</h2>
            {bom.fittings.length === 0 ? <p className="muted">Belum ada fitting.</p> : (
              <div className="table-wrap">
                <table className="grid compact">
                  <thead><tr><th>Fitting</th><th className="r">Jumlah</th></tr></thead>
                  <tbody>
                    {bom.fittings.map((f, i) => (
                      <tr key={i}>
                        <td>{FITTING_LABEL[f.kind]}{f.angle_deg ? ` ${f.angle_deg}°` : ''} <small>{f.kind === 'reducer' && f.diameter_small_in ? `Ø${fmtInch(f.diameter_in)}"×${fmtInch(f.diameter_small_in)}"` : fmtDia(f.diameter_in)} {f.material}</small></td>
                        <td className="r mono strong">{f.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <button type="button" className="btn" onClick={() => downloadCsv(bomCsv(bom, waste), `${safeName(project.project.name)}-bom.csv`)}>
            <Download size={16} aria-hidden /> Ekspor BOM (CSV)
          </button>
        </>
      )}
    </div>
  )
}
