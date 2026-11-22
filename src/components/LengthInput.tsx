import { useState } from 'react'
import { useHud, useStore } from '../store'
import { mapApi } from './mapApi'

/** Ketik panjang segmen berikutnya (meter) lalu Enter; arahnya mengikuti kursor. */
export function LengthInput() {
  const count = useHud((s) => s.drawCount)
  const tool = useStore((s) => s.tool)
  const [v, setV] = useState('')
  const lengthTools = ['distance', 'polyline', 'area', 'pipe']
  if (count === 0 || !lengthTools.includes(tool)) return null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const n = Number(v.replace(',', '.'))
    if (mapApi.current?.drawLength(n)) {
      setV('')
      ;(document.activeElement as HTMLElement | null)?.blur()
    } else useStore.getState().setNotice({ kind: 'error', text: 'Panjang harus berupa angka lebih dari 0.' })
  }

  return (
    <form className="length-input" onSubmit={submit}>
      <label htmlFor="length-input">Panjang berikutnya</label>
      <input
        id="length-input"
        inputMode="decimal"
        autoComplete="off"
        placeholder="mis. 12,5"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setV(''); (e.target as HTMLElement).blur() } }}
      />
      <span className="unit">m</span>
      <kbd>Enter</kbd>
    </form>
  )
}
