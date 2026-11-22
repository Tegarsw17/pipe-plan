import { useCallback, useEffect, useRef, useState } from 'react'
import { ImagePlus, FolderOpen, X } from 'lucide-react'
import { Toolbar } from './components/Toolbar'
import { SidePanel } from './components/SidePanel'
import { MapView } from './components/MapView'
import { CalibrateDialog } from './components/CalibrateDialog'
import { StatusBar } from './components/StatusBar'
import { useStore } from './store'
import { ImageError, readImageInfo } from './lib/image'
import { openProjectZip, ProjectFileError, saveProjectZip } from './lib/project'
import { autosave, restoreSession } from './lib/storage'
import { downloadBlob, safeName } from './lib/download'
import { CatalogDialog } from './components/CatalogDialog'


export function App() {
  const imgInput = useRef<HTMLInputElement>(null)
  const zipInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const hasImage = useStore((s) => !!s.project.image)
  const imageUrl = useStore((s) => s.imageUrl)
  const notice = useStore((s) => s.notice)
  const setNotice = useStore((s) => s.setNotice)

  const openImage = useCallback(async (file: File) => {
    try {
      const info = await readImageInfo(file, file.name)
      useStore.getState().loadImage(file, info)
      useStore.getState().setNotice({ kind: 'info', text: `Foto dibuka: ${info.width_px} × ${info.height_px} px. Kalibrasi skala dengan tombol R.` })
    } catch (e) {
      useStore.getState().setNotice({ kind: 'error', text: e instanceof ImageError ? e.message : 'Foto tidak bisa dibuka.' })
    }
  }, [])

  const openProject = useCallback(async (file: File) => {
    try {
      const { project, image } = await openProjectZip(file)
      useStore.getState().loadProject(project, image)
      useStore.getState().setNotice({
        kind: image || !project.image ? 'info' : 'error',
        text: image || !project.image ? `Proyek "${project.project.name}" dibuka.` : 'Proyek dibuka, tetapi fotonya tidak ada di dalam berkas.',
      })
    } catch (e) {
      useStore.getState().setNotice({ kind: 'error', text: e instanceof ProjectFileError ? e.message : 'Proyek tidak bisa dibuka.' })
    }
  }, [])

  const save = useCallback(async () => {
    const { project, imageBlob } = useStore.getState()
    const blob = await saveProjectZip(project, imageBlob)
    const filename = `${safeName(project.project.name)}.zip`
    downloadBlob(blob, filename)
    useStore.getState().markSaved()
    useStore.getState().setNotice({ kind: 'info', text: `Tersimpan sebagai ${filename}. Simpan salinan ke cloud drive Anda secara rutin.` })
  }, [])

  // Pulihkan sesi terakhir dari simpan otomatis.
  useEffect(() => {
    restoreSession().then((s) => {
      if (s?.project.image && s.image) {
        useStore.getState().loadProject(s.project, s.image)
        useStore.getState().setNotice({ kind: 'info', text: 'Sesi terakhir dipulihkan dari simpan otomatis.' })
      }
    })
  }, [])

  // Simpan otomatis ke IndexedDB, ditunda agar tidak menulis di tiap gerakan.
  useEffect(() => {
    let t: number | undefined
    const unsub = useStore.subscribe((s, prev) => {
      if (s.project === prev.project && s.imageBlob === prev.imageBlob) return
      if (!s.project.image) return
      window.clearTimeout(t)
      t = window.setTimeout(() => autosave({ project: s.project, image: s.imageBlob }), 800)
    })
    return () => { unsub(); window.clearTimeout(t) }
  }, [])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (useStore.getState().dirty) e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), notice.kind === 'error' ? 8000 : 4500)
    return () => window.clearTimeout(t)
  }, [notice, setNotice])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (!f) return
    if (/\.zip$/i.test(f.name)) openProject(f)
    else openImage(f)
  }

  return (
    <div className="app" onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <Toolbar onOpenImage={() => imgInput.current?.click()} onOpenProject={() => zipInput.current?.click()} onSave={save} />
      <input ref={imgInput} type="file" accept="image/jpeg,image/png,.tif,.tiff" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openImage(f); e.target.value = '' }} />
      <input ref={zipInput} type="file" accept=".zip,application/zip" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openProject(f); e.target.value = '' }} />
      <main className="work">
        <div className="canvas">
          {hasImage && imageUrl ? (
            <MapView key={imageUrl} />
          ) : (
            <div className="empty">
              <h1>Ukur foto drone dengan presisi</h1>
              <p>Buka foto JPG atau PNG, kalibrasi skala dengan garis referensi, lalu ukur jarak, polyline, dan luas. Semua berjalan di browser Anda; foto tidak dikirim ke mana pun.</p>
              <div className="actions">
                <button type="button" className="btn primary big" onClick={() => imgInput.current?.click()}><ImagePlus size={18} aria-hidden /> Buka foto</button>
                <button type="button" className="btn big" onClick={() => zipInput.current?.click()}><FolderOpen size={18} aria-hidden /> Buka proyek (.zip)</button>
              </div>
              <p className="hint">Atau seret berkas ke jendela ini.</p>
            </div>
          )}
          {dragging && <div className="drop" aria-hidden>Lepas berkas di sini</div>}
        </div>
        <SidePanel />
      </main>
      <StatusBar />
      <CalibrateDialog />
      <CatalogDialog />
      <div className="toasts" role="status" aria-live="polite">
        {notice && (
          <div className={`toast ${notice.kind}`}>
            <span>{notice.text}</span>
            <button type="button" className="icon-btn" aria-label="Tutup pemberitahuan" onClick={() => setNotice(null)}><X size={16} aria-hidden /></button>
          </div>
        )}
      </div>
    </div>
  )
}
