import { FolderOpen, ImagePlus, Save, MousePointer2, Ruler, Spline, Hexagon, Crosshair, ZoomIn, ZoomOut, Maximize, RotateCcw, RotateCw, Compass } from 'lucide-react'
import type { ReactNode } from 'react'
import { useStore, useHud, type Tool } from '../store'
import { mapApi } from './mapApi'

interface Props {
  onOpenImage: () => void
  onOpenProject: () => void
  onSave: () => void
}

function ToolBtn({ id, label, keyHint, icon, needsScale }: { id: Tool; label: string; keyHint: string; icon: ReactNode; needsScale?: boolean }) {
  const tool = useStore((s) => s.tool)
  const calibrated = useStore((s) => s.project.calibrations.some((c) => c.is_active))
  const hasImage = useStore((s) => !!s.project.image)
  const locked = !hasImage || (needsScale && !calibrated)
  return (
    <button
      type="button"
      className="tool"
      aria-pressed={tool === id}
      disabled={locked}
      title={locked && hasImage ? `${label} (${keyHint}) — kalibrasi skala dulu` : `${label} (${keyHint})`}
      onClick={() => useStore.getState().setTool(id)}
    >
      {icon}
      <span>{label}</span>
      <kbd>{keyHint}</kbd>
    </button>
  )
}

function IconBtn({ label, onClick, icon, disabled }: { label: string; onClick: () => void; icon: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      {icon}
    </button>
  )
}

export function Toolbar({ onOpenImage, onOpenProject, onSave }: Props) {
  const hasImage = useStore((s) => !!s.project.image)
  const dirty = useStore((s) => s.dirty)
  const name = useStore((s) => s.project.project.name)
  const zoom = useHud((s) => s.zoomPct)
  const rot = useHud((s) => s.rotationDeg)
  const api = () => mapApi.current
  return (
    <header className="toolbar">
      <div className="brand" aria-label="Pipe Plan">
        <Compass size={20} aria-hidden /> Pipe Plan
      </div>
      <input
        className="name-input"
        aria-label="Nama proyek"
        value={name}
        onChange={(e) => useStore.getState().setProjectName(e.target.value)}
        maxLength={80}
      />
      <div className="group" role="group" aria-label="Berkas">
        <button type="button" className="btn" onClick={onOpenImage}><ImagePlus size={16} aria-hidden /> Foto</button>
        <button type="button" className="btn" onClick={onOpenProject}><FolderOpen size={16} aria-hidden /> Buka</button>
        <button type="button" className="btn primary" onClick={onSave} disabled={!hasImage}>
          <Save size={16} aria-hidden /> Simpan{dirty ? ' •' : ''}
        </button>
      </div>
      <div className="group" role="group" aria-label="Alat">
        <ToolBtn id="select" label="Pilih" keyHint="V" icon={<MousePointer2 size={16} aria-hidden />} />
        <ToolBtn id="reference" label="Referensi" keyHint="R" icon={<Crosshair size={16} aria-hidden />} />
        <ToolBtn id="distance" label="Jarak" keyHint="D" icon={<Ruler size={16} aria-hidden />} needsScale />
        <ToolBtn id="polyline" label="Polyline" keyHint="P" icon={<Spline size={16} aria-hidden />} needsScale />
        <ToolBtn id="area" label="Luas" keyHint="A" icon={<Hexagon size={16} aria-hidden />} needsScale />
      </div>
      <div className="group" role="group" aria-label="Tampilan">
        <IconBtn label="Perkecil" icon={<ZoomOut size={18} aria-hidden />} onClick={() => api()?.zoomBy(1 / 1.5)} disabled={!hasImage} />
        <span className="zoom" aria-live="off">{zoom}%</span>
        <IconBtn label="Perbesar" icon={<ZoomIn size={18} aria-hidden />} onClick={() => api()?.zoomBy(1.5)} disabled={!hasImage} />
        <IconBtn label="Pas ke layar" icon={<Maximize size={18} aria-hidden />} onClick={() => api()?.fit()} disabled={!hasImage} />
        <IconBtn label="Putar 15° ke kiri" icon={<RotateCcw size={18} aria-hidden />} onClick={() => api()?.rotateBy(-15)} disabled={!hasImage} />
        <IconBtn label="Putar 15° ke kanan" icon={<RotateCw size={18} aria-hidden />} onClick={() => api()?.rotateBy(15)} disabled={!hasImage} />
        {rot !== 0 && <button type="button" className="btn small" onClick={() => api()?.resetRotation()}>Reset {rot}°</button>}
      </div>
    </header>
  )
}
