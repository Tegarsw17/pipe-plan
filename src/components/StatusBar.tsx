import { useHud, useStore, type Tool } from '../store'

const HINT: Record<Tool, string> = {
  select: 'Klik objek untuk memilih. Seret titiknya untuk menggeser, Delete menghapus. Ctrl+Z urungkan, Ctrl+Shift+Z ulangi.',
  reference: 'Klik awal dan akhir garis pada objek yang panjangnya diketahui.',
  distance: 'Klik dua titik. Shift mengunci 0/45/90°; ketik angka untuk panjang pasti. Esc membatalkan.',
  polyline: 'Klik titik demi titik. Klik dua kali atau Enter untuk selesai. Shift kunci sudut, angka = panjang pasti, Backspace batalkan titik.',
  area: 'Klik sudut demi sudut. Klik dua kali atau Enter untuk menutup bidang.',
  angle: 'Klik tiga titik: ujung pertama, titik sudut, lalu ujung kedua. Shift mengunci 0/45/90°.',
  verify: 'Tarik garis pada objek kedua yang panjangnya Anda tahu, untuk memeriksa skala.',
  printarea: 'Tarik kotak pada area yang akan dicetak.',
  pipe: 'Klik titik demi titik. Klik node yang ada untuk menyambung (atau di tengah segmen untuk percabangan). Klik node terakhir, Enter, atau Esc untuk selesai.',
}

export function StatusBar() {
  const tool = useStore((s) => s.tool)
  const cursor = useHud((s) => s.cursor)
  return (
    <footer className="status">
      <span className="hint-line">{HINT[tool]}</span>
      <span className="mono" aria-hidden>{cursor ? `x ${cursor[0].toFixed(1)} · y ${cursor[1].toFixed(1)} px` : ''}</span>
    </footer>
  )
}
