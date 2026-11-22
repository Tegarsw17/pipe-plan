import { Eye, EyeOff, Lock, LockOpen, Scissors, Trash2, Settings2 } from 'lucide-react'
import { useStore } from '../store'
import { fittingText, fittingsAt, nodeById, pipeName, segmentLengthPx, typeById } from '../lib/pipes'
import { activeCalibration } from '../lib/calibration'
import { fmtLength } from '../lib/geometry'
import type { NodeType } from '../lib/types'
import { catalogDialogOpen } from './CatalogDialog'

const NODE_OPTIONS: [NodeType, string][] = [
  ['junction', 'Otomatis (saran fitting)'],
  ['valve', 'Valve'],
  ['cap', 'Cap'],
  ['meter', 'Meteran'],
  ['manhole', 'Manhole'],
  ['elbow', 'Elbow (paksa)'],
  ['tee', 'Tee (paksa)'],
  ['reducer', 'Reducer (paksa)'],
]

function Inspector() {
  const selectedId = useStore((s) => s.selectedId)
  const project = useStore((s) => s.project)
  const mpp = activeCalibration(project.calibrations)?.meters_per_px ?? null
  const st = useStore.getState
  if (!selectedId) return <p className="muted">Pilih node atau segmen pipa di gambar untuk mengubahnya.</p>

  const seg = project.pipe_segments.find((x) => x.id === selectedId)
  if (seg) {
    const t = typeById(project, seg.pipe_type_id)
    return (
      <div className="stack">
        <h3>Segmen · {pipeName(t)}</h3>
        <p className="mono">{mpp ? fmtLength(segmentLengthPx(project, seg) * mpp) : '—'}</p>
        <label className="field">
          <span>Jenis pipa</span>
          <select value={seg.pipe_type_id} onChange={(e) => st().setSegmentPipeType(seg.id, e.target.value)}>
            {project.pipe_types.map((x) => <option key={x.id} value={x.id}>{pipeName(x)} · {x.service}</option>)}
          </select>
        </label>
        <div className="actions left">
          <button type="button" className="btn small" onClick={() => st().splitSelectedSegment()}><Scissors size={14} aria-hidden /> Pecah segmen</button>
          <button type="button" className="btn small danger" onClick={() => st().deleteSelected()}><Trash2 size={14} aria-hidden /> Hapus</button>
        </div>
      </div>
    )
  }
  const node = nodeById(project, selectedId)
  if (node) {
    const fits = fittingsAt(project, node)
    return (
      <div className="stack">
        <h3>Node</h3>
        <p className="muted">{fits.length ? fits.map(fittingText).join(' + ') : 'Tanpa fitting (lurus atau ujung pipa).'}</p>
        <label className="field">
          <span>Jenis node</span>
          <select value={node.node_type} onChange={(e) => st().setNodeKind(node.id, e.target.value as NodeType)}>
            {NODE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <div className="actions left">
          <button type="button" className="btn small danger" onClick={() => st().deleteSelected()}><Trash2 size={14} aria-hidden /> Hapus node</button>
        </div>
        <p className="hint">Menghapus node di tengah jalur menyambung kembali dua segmen berjenis sama.</p>
      </div>
    )
  }
  return null
}

export function PipePanel() {
  const types = useStore((s) => s.project.pipe_types)
  const active = useStore((s) => s.activePipeTypeId)
  const tool = useStore((s) => s.tool)
  const layers = useStore((s) => s.project.layers)
  const snap = useStore((s) => s.project.settings.snap_elbow)
  const st = useStore.getState
  return (
    <div className="stack-lg">
      <section className="card" aria-labelledby="h-type">
        <h2 id="h-type">Jenis pipa aktif</h2>
        <label className="field">
          <span className="sr">Jenis pipa aktif</span>
          <select value={active ?? ''} onChange={(e) => st().setActivePipeType(e.target.value)} disabled={types.length === 0}>
            {types.length === 0 && <option value="">Katalog kosong</option>}
            {types.map((t) => <option key={t.id} value={t.id}>{pipeName(t)} · {t.service}</option>)}
          </select>
        </label>
        <div className="actions left">
          <button type="button" className="btn small" onClick={() => catalogDialogOpen.open()}><Settings2 size={14} aria-hidden /> Katalog</button>
          <button type="button" className={`btn small ${tool === 'pipe' ? 'primary' : ''}`} onClick={() => st().setTool(tool === 'pipe' ? 'select' : 'pipe')}>
            {tool === 'pipe' ? 'Selesai menggambar' : 'Gambar pipa (L)'}
          </button>
        </div>
      </section>

      <section className="card" aria-labelledby="h-insp">
        <h2 id="h-insp">Objek terpilih</h2>
        <Inspector />
      </section>

      <section className="card" aria-labelledby="h-layer">
        <h2 id="h-layer">Layer</h2>
        <ul className="list">
          {layers.map((l) => (
            <li key={l.id} className="layer-row">
              <span className="dot" style={{ background: l.color }} aria-hidden />
              <span className="grow">{l.name}</span>
              <button type="button" className="icon-btn" aria-pressed={!l.visible} aria-label={`${l.visible ? 'Sembunyikan' : 'Tampilkan'} layer ${l.name}`} onClick={() => st().toggleLayer(l.id, 'visible')}>
                {l.visible ? <Eye size={16} aria-hidden /> : <EyeOff size={16} aria-hidden />}
              </button>
              <button type="button" className="icon-btn" aria-pressed={l.locked} aria-label={`${l.locked ? 'Buka kunci' : 'Kunci'} layer ${l.name}`} onClick={() => st().toggleLayer(l.id, 'locked')}>
                {l.locked ? <Lock size={16} aria-hidden /> : <LockOpen size={16} aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="h-set">
        <h2 id="h-set">Pengaturan</h2>
        <label className="check">
          <input type="checkbox" checked={snap} onChange={(e) => st().setSettings({ snap_elbow: e.target.checked })} />
          <span>Bulatkan elbow ke 45°/90°</span>
        </label>
      </section>
    </div>
  )
}
