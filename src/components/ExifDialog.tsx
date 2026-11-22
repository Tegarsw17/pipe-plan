import { useEffect, useRef, useState } from 'react'
import { calibrationFromExif, CAMERA_PROFILES, gsdFromExif, isNadir, sensorWidthFrom35mm } from '../lib/scale'
import type { PhotoMeta } from '../lib/exif'
import { uid, useStore } from '../store'

const fmt = (n: number, d = 2) => n.toFixed(d).replace('.', ',')

/** Nilai awal lebar sensor: dari ekuivalen 35 mm bila ada, kalau tidak dari profil kamera yang dikenal. */
export function defaultSensorWidth(m: PhotoMeta | null): { value: number | null; source: string } {
  if (m?.focal_mm && m.focal35_mm) return { value: Math.round(sensorWidthFrom35mm(m.focal_mm, m.focal35_mm) * 100) / 100, source: 'dihitung dari focal length dan ekuivalen 35 mm (sensor 4:3)' }
  const prof = m?.model ? CAMERA_PROFILES[m.model] : undefined
  if (prof) return { value: prof.sensor_width_mm, source: `profil ${prof.name} (perkiraan)` }
  return { value: null, source: 'isi dari spesifikasi kamera' }
}

export function ExifDialog() {
  const open = useStore((s) => s.dialog === 'exif')
  const image = useStore((s) => s.project.image)
  const ref = useRef<HTMLDialogElement>(null)
  const meta = (image?.exif as PhotoMeta | null) ?? null
  const [alt, setAlt] = useState('')
  const [sensor, setSensor] = useState('')
  const [focal, setFocal] = useState('')

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setAlt(meta?.altitude_rel_m != null ? String(meta.altitude_rel_m) : '')
      setSensor(String(defaultSensorWidth(meta).value ?? ''))
      setFocal(meta?.focal_mm != null ? String(meta.focal_mm) : '')
      d.showModal()
    } else if (!open && d.open) d.close()
  }, [open, meta])

  const close = () => useStore.getState().openDialog(null)
  const n = (v: string) => Number(v.replace(',', '.'))
  const input = { sensor_width_mm: n(sensor), focal_mm: n(focal), altitude_m: n(alt), image_width_px: image?.width_px ?? 0 }
  const gsd = gsdFromExif(input)
  const pitch = meta?.gimbal_pitch_deg ?? null
  const src = defaultSensorWidth(meta)

  const apply = (e: React.FormEvent) => {
    e.preventDefault()
    const cal = calibrationFromExif(input, uid('cal'), pitch)
    if (!cal) return
    useStore.getState().addCalibration(cal)
    useStore.getState().openDialog(null)
    useStore.getState().setNotice({ kind: 'info', text: `Skala dari EXIF: ${fmt(cal.meters_per_px * 100, 3)} cm per piksel (estimasi). Verifikasi dengan objek kedua (K).` })
  }

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="exif-title" onCancel={(e) => { e.preventDefault(); close() }}>
      <form onSubmit={apply} noValidate>
        <h2 id="exif-title">Skala dari EXIF</h2>
        <p className="muted">Perkiraan cepat tanpa input apa pun. Akurasi sekitar 2–5% untuk foto tegak lurus di tanah datar.</p>
        <div className="row">
          <label className="field grow"><span>Tinggi terbang (m)</span><input inputMode="decimal" value={alt} onChange={(e) => setAlt(e.target.value)} /></label>
          <label className="field grow"><span>Focal length (mm)</span><input inputMode="decimal" value={focal} onChange={(e) => setFocal(e.target.value)} /></label>
        </div>
        <label className="field"><span>Lebar sensor (mm)</span><input inputMode="decimal" value={sensor} onChange={(e) => setSensor(e.target.value)} /></label>
        <p className="hint">Lebar sensor: {src.source}. Koreksi bila Anda tahu nilai yang tepat.</p>
        <p className="result" aria-live="polite">{Number.isFinite(gsd) ? <>Skala: <strong>{fmt(gsd * 100, 3)} cm per piksel</strong></> : 'Lengkapi ketiga angka di atas.'}</p>
        <ul className="warnings">
          <li>Tinggi di EXIF DJI adalah relatif terhadap titik take-off, bukan terhadap tanah di lokasi foto. Bila lokasi lebih tinggi atau rendah dari titik take-off, skala meleset.</li>
          {!isNadir(pitch) && <li>Gimbal {pitch}°, bukan sekitar -90°. Skala tidak seragam; pakai kalibrasi garis referensi.</li>}
          {pitch === null && <li>Sudut gimbal tidak tercatat. Pastikan foto diambil tegak lurus ke bawah.</li>}
        </ul>
        <div className="actions">
          <button type="button" className="btn" onClick={close}>Batal</button>
          <button type="submit" className="btn primary" disabled={!Number.isFinite(gsd)}>Pakai skala ini</button>
        </div>
      </form>
    </dialog>
  )
}
