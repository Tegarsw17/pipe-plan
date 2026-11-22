import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Upload, X } from 'lucide-react'
import { useStore, uid } from '../store'
import { openProjectZip, ProjectFileError } from '../lib/project'
import type { PipeType } from '../lib/types'

export const catalogDialogOpen = { open: () => {} }

export function CatalogDialog() {
  const ref = useRef<HTMLDialogElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const [isOpen, setOpen] = useState(false)
  const types = useStore((s) => s.project.pipe_types)
  const segments = useStore((s) => s.project.pipe_segments)
  const used = useMemo(() => new Set(segments.map((x) => x.pipe_type_id)), [segments])

  useEffect(() => {
    catalogDialogOpen.open = () => { setOpen(true); ref.current?.showModal() }
  }, [])

  const close = () => { setOpen(false); ref.current?.close() }
  const st = useStore.getState

  const add = () => {
    const last = types[types.length - 1]
    const t: PipeType = { id: uid('pt'), material: last?.material ?? 'PVC', diameter_mm: 50, service: last?.service ?? 'Air bersih', color: '#2563EB', stock_length_m: last?.stock_length_m ?? 4 }
    st().upsertPipeType(t)
  }

  const importFrom = async (f: File) => {
    try {
      const { project } = await openProjectZip(f)
      const n = st().importPipeTypes(project.pipe_types)
      st().setNotice({ kind: 'info', text: n > 0 ? `${n} jenis pipa diimpor dari "${project.project.name}".` : 'Tidak ada jenis pipa baru: semuanya sudah ada di katalog.' })
    } catch (e) {
      st().setNotice({ kind: 'error', text: e instanceof ProjectFileError ? e.message : 'Katalog tidak bisa diimpor.' })
    }
  }

  const edit = (t: PipeType, patch: Partial<PipeType>) => st().upsertPipeType({ ...t, ...patch })
  const posNum = (v: string, fallback: number) => { const n = Number(v.replace(',', '.')); return n > 0 && Number.isFinite(n) ? n : fallback }

  return (
    <dialog ref={ref} className="dialog wide" aria-labelledby="cat-title" onCancel={(e) => { e.preventDefault(); close() }}>
      {isOpen && (
        <div>
          <div className="dlg-head">
            <h2 id="cat-title">Katalog jenis pipa</h2>
            <button type="button" className="icon-btn" aria-label="Tutup" onClick={close}><X size={18} aria-hidden /></button>
          </div>
          <p className="muted">Katalog tersimpan di file proyek. Isi sesuai pipa yang biasa dipakai.</p>
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr><th>Material</th><th>Ø (mm)</th><th>Layanan</th><th>Warna</th><th>Batang (m)</th><th><span className="sr">Hapus</span></th></tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id}>
                    <td><input aria-label="Material" value={t.material} maxLength={24} onChange={(e) => edit(t, { material: e.target.value })} /></td>
                    <td><input aria-label="Diameter dalam mm" inputMode="decimal" defaultValue={t.diameter_mm} key={t.diameter_mm} onBlur={(e) => edit(t, { diameter_mm: posNum(e.target.value, t.diameter_mm) })} /></td>
                    <td><input aria-label="Layanan" value={t.service} maxLength={32} onChange={(e) => edit(t, { service: e.target.value })} /></td>
                    <td><input aria-label="Warna" type="color" value={t.color} onChange={(e) => edit(t, { color: e.target.value })} /></td>
                    <td><input aria-label="Panjang per batang dalam meter" inputMode="decimal" defaultValue={t.stock_length_m} key={t.stock_length_m} onBlur={(e) => edit(t, { stock_length_m: posNum(e.target.value, t.stock_length_m) })} /></td>
                    <td>
                      <button type="button" className="icon-btn danger" aria-label={`Hapus Ø${t.diameter_mm} ${t.material}`} title={used.has(t.id) ? 'Dipakai di gambar' : 'Hapus'} onClick={() => st().removePipeType(t.id)}>
                        <Trash2 size={16} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions between">
            <div className="actions">
              <button type="button" className="btn" onClick={add}><Plus size={16} aria-hidden /> Tambah jenis</button>
              <button type="button" className="btn" onClick={() => file.current?.click()}><Upload size={16} aria-hidden /> Impor dari proyek lain</button>
            </div>
            <button type="button" className="btn primary" onClick={close}>Selesai</button>
          </div>
          <input ref={file} type="file" accept=".zip,application/zip" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFrom(f); e.target.value = '' }} />
        </div>
      )}
    </dialog>
  )
}
