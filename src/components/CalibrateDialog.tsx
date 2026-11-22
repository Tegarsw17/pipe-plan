import { useEffect, useRef, useState } from 'react'
import { calibrateFromReference, CalibrationError } from '../lib/calibration'
import { dist } from '../lib/geometry'
import type { LengthUnit } from '../lib/types'
import { uid, useStore } from '../store'

export function CalibrateDialog() {
  const pending = useStore((s) => s.pendingRef)
  const ref = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState<LengthUnit>('m')
  const [error, setError] = useState('')

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (pending && !d.open) {
      setValue('')
      setError('')
      d.showModal()
      input.current?.focus()
    } else if (!pending && d.open) d.close()
  }, [pending])

  const cancel = () => useStore.getState().setPendingRef(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!pending) return
    const num = Number(value.replace(',', '.'))
    try {
      const c = calibrateFromReference(pending.p1, pending.p2, num, unit, uid('cal'))
      useStore.getState().addCalibration(c)
      useStore.getState().setNotice({ kind: 'info', text: `Skala tersimpan: ${(c.meters_per_px * 100).toFixed(3).replace('.', ',')} cm per piksel.` })
    } catch (err) {
      setError(err instanceof CalibrationError ? err.message : 'Kalibrasi gagal.')
    }
  }

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="cal-title" onCancel={(e) => { e.preventDefault(); cancel() }}>
      <form onSubmit={submit} noValidate>
        <h2 id="cal-title">Panjang garis referensi</h2>
        <p className="muted">
          Garis yang Anda tarik sepanjang {pending ? dist(pending.p1, pending.p2).toFixed(1).replace('.', ',') : 0} piksel. Berapa panjang aslinya di lapangan?
        </p>
        <div className="row">
          <label className="field grow">
            <span>Panjang nyata</span>
            <input ref={input} inputMode="decimal" value={value} onChange={(e) => { setValue(e.target.value); setError('') }} placeholder="mis. 10" autoComplete="off" aria-invalid={!!error} aria-describedby={error ? 'cal-err' : undefined} />
          </label>
          <label className="field">
            <span>Satuan</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value as LengthUnit)}>
              <option value="m">meter</option>
              <option value="cm">cm</option>
              <option value="mm">mm</option>
              <option value="ft">feet</option>
            </select>
          </label>
        </div>
        {error && <p id="cal-err" role="alert" className="error">{error}</p>}
        <p className="hint">Pakai objek yang lurus, sebidang dengan tanah, dan sepanjang mungkin. Semakin panjang, semakin akurat.</p>
        <div className="actions">
          <button type="button" className="btn" onClick={cancel}>Batal</button>
          <button type="submit" className="btn primary">Simpan skala</button>
        </div>
      </form>
    </dialog>
  )
}
