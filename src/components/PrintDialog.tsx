import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Printer, X, SquareDashedMousePointer } from 'lucide-react'
import { useStore } from '../store'
import { activeCalibration } from '../lib/calibration'
import { PRESET_SCALES, printTransform, scaleLabel, sheetGeometry } from '../lib/print'
import type { PaperSize } from '../lib/types'
import { PrintSheet } from './PrintSheet'

const MM_PX = 96 / 25.4

export function PrintDialog() {
  const open = useStore((s) => s.dialog === 'print')
  const project = useStore((s) => s.project)
  const imageUrl = useStore((s) => s.imageUrl)
  const patch = useStore((s) => s.patchPrintLayout)
  const box = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState(600)
  const l = project.print_layout
  const g = sheetGeometry(l)
  const mpp = activeCalibration(project.calibrations)?.meters_per_px ?? null

  useLayoutEffect(() => {
    if (!open || !box.current) return
    const el = box.current
    const update = () => setAvail(Math.max(200, el.clientWidth - 32))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement).closest('input, select, textarea')) useStore.getState().openDialog(null) }
    window.addEventListener('keydown', onKey)
    document.body.classList.add('printing-open')
    return () => { window.removeEventListener('keydown', onKey); document.body.classList.remove('printing-open') }
  }, [open])

  if (!open || !project.image || !imageUrl) return null
  const [W, H] = g.page
  const k = Math.min(1, avail / (W * MM_PX))
  const t = mpp ? printTransform(l, { w: project.image.width_px, h: project.image.height_px }, mpp, g) : null
  const tb = l.title_block
  const setTb = (p: Partial<typeof tb>) => patch({ title_block: { ...tb, ...p } })
  const close = () => useStore.getState().openDialog(null)

  return (
    <div className="print-root" role="dialog" aria-modal="true" aria-labelledby="print-title">
      <style>{`@page { size: ${W}mm ${H}mm; margin: 0 }`}</style>
      <div className="print-ui">
        <aside className="print-settings">
          <div className="dlg-head">
            <h2 id="print-title">Cetak berskala</h2>
            <button type="button" className="icon-btn" aria-label="Tutup" onClick={close}><X size={18} aria-hidden /></button>
          </div>

          <div className="row">
            <label className="field grow"><span>Kertas</span>
              <select value={l.paper_size} onChange={(e) => patch({ paper_size: e.target.value as PaperSize })}>
                {(['A4', 'A3', 'A2', 'A1'] as const).map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label className="field grow"><span>Orientasi</span>
              <select value={l.orientation} onChange={(e) => patch({ orientation: e.target.value as 'portrait' | 'landscape' })}>
                <option value="landscape">Lanskap</option>
                <option value="portrait">Potret</option>
              </select>
            </label>
          </div>
          <label className="field"><span>Skala</span>
            <select value={l.scale_denominator ?? 'fit'} onChange={(e) => patch({ scale_denominator: e.target.value === 'fit' ? null : Number(e.target.value) })}>
              <option value="fit">Pas ke halaman</option>
              {PRESET_SCALES.map((s) => <option key={s} value={s}>1:{s}</option>)}
            </select>
          </label>
          {t && <p className="print-scale" data-testid="print-scale">Skala di lembar: <strong>{scaleLabel(t.scaleDen)}</strong></p>}
          {!mpp && <p className="error" role="alert">Skala foto belum dikalibrasi. Tutup dialog ini dan kalibrasi dulu.</p>}
          {t?.clipped && <p className="error" role="alert">Area tidak muat pada skala ini; sebagian terpotong. Pilih skala lebih kecil, kertas lebih besar, atau area lebih kecil.</p>}

          <div className="field">
            <span>Area yang dicetak</span>
            <div className="actions left">
              <button type="button" className={`btn small ${l.bbox_px ? '' : 'primary'}`} onClick={() => patch({ bbox_px: null })}>Seluruh foto</button>
              <button type="button" className={`btn small ${l.bbox_px ? 'primary' : ''}`} onClick={() => { close(); useStore.getState().setTool('printarea') }}><SquareDashedMousePointer size={14} aria-hidden /> Pilih area di foto</button>
            </div>
          </div>

          <label className="check"><input type="checkbox" checked={l.show_legend} onChange={(e) => patch({ show_legend: e.target.checked })} /><span>Legenda, panah utara, scale bar</span></label>
          <label className="check"><input type="checkbox" checked={l.show_bom} onChange={(e) => patch({ show_bom: e.target.checked })} /><span>Tabel BOM</span></label>
          <label className="field inline"><span>Arah utara (°)</span><input type="number" step={5} value={l.north_deg} onChange={(e) => patch({ north_deg: Number(e.target.value) || 0 })} /></label>
          <p className="hint">Derajat searah jarum jam dari sisi atas foto. GeoTIFF: 0 (utara di atas).</p>

          <h3>Kop gambar</h3>
          <label className="field"><span>Nama proyek</span><input value={tb.project_name} maxLength={80} onChange={(e) => setTb({ project_name: e.target.value })} /></label>
          <label className="field"><span>Lokasi</span><input value={tb.location} maxLength={80} onChange={(e) => setTb({ location: e.target.value })} /></label>
          <div className="row">
            <label className="field grow"><span>Tanggal</span><input type="date" value={tb.date} onChange={(e) => setTb({ date: e.target.value })} /></label>
            <label className="field grow"><span>No. lembar</span><input value={tb.sheet_no} maxLength={12} onChange={(e) => setTb({ sheet_no: e.target.value })} /></label>
          </div>
          <div className="row">
            <label className="field grow"><span>Digambar oleh</span><input value={tb.drawn_by} maxLength={40} onChange={(e) => setTb({ drawn_by: e.target.value })} /></label>
            <label className="field grow"><span>Diperiksa oleh</span><input value={tb.checked_by} maxLength={40} onChange={(e) => setTb({ checked_by: e.target.value })} /></label>
          </div>
          <label className="field"><span>Catatan</span><input value={tb.notes} maxLength={120} onChange={(e) => setTb({ notes: e.target.value })} /></label>

          <div className="actions">
            <button type="button" className="btn" onClick={close}>Tutup</button>
            <button type="button" className="btn primary" disabled={!mpp} onClick={() => window.print()}><Printer size={16} aria-hidden /> Cetak / Simpan PDF</button>
          </div>
          <p className="hint">Di jendela cetak browser pilih “Save as PDF”, skala 100% (Default), margin None. Cek hasil dengan scale bar dan penggaris.</p>
        </aside>
        <div className="print-preview" ref={box}>
          <div className="sheet-box" style={{ width: W * MM_PX * k, height: H * MM_PX * k }}>
            <div className="print-sheet" style={{ width: `${W}mm`, height: `${H}mm`, transform: `scale(${k})` }}>
              <PrintSheet project={project} imageUrl={imageUrl} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
