import type { PaperSize, PrintLayout } from './types'

export const PAPER_MM: Record<PaperSize, [number, number]> = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841] }
export const PRESET_SCALES = [100, 200, 250, 500]
export const MARGIN_MM = 10
export const STRIP_MM = 52

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface SheetGeometry {
  page: [number, number]
  frame: Rect
  drawing: Rect
  strip: Rect
  legend: Rect
  bom: Rect
  titleBlock: Rect
}

export function pageSize(l: Pick<PrintLayout, 'paper_size' | 'orientation'>): [number, number] {
  const [w, h] = PAPER_MM[l.paper_size]
  return l.orientation === 'landscape' ? [h, w] : [w, h]
}

/** Pembagian lembar: area gambar di atas, strip bawah berisi legenda, BOM, dan kop gambar. */
export function sheetGeometry(l: Pick<PrintLayout, 'paper_size' | 'orientation'>): SheetGeometry {
  const page = pageSize(l)
  const frame: Rect = { x: MARGIN_MM, y: MARGIN_MM, w: page[0] - 2 * MARGIN_MM, h: page[1] - 2 * MARGIN_MM }
  const drawing: Rect = { x: frame.x, y: frame.y, w: frame.w, h: frame.h - STRIP_MM }
  const strip: Rect = { x: frame.x, y: drawing.y + drawing.h, w: frame.w, h: STRIP_MM }
  const wLegend = strip.w * 0.28
  const wBom = strip.w * 0.32
  return {
    page,
    frame,
    drawing,
    strip,
    legend: { x: strip.x, y: strip.y, w: wLegend, h: strip.h },
    bom: { x: strip.x + wLegend, y: strip.y, w: wBom, h: strip.h },
    titleBlock: { x: strip.x + wLegend + wBom, y: strip.y, w: strip.w - wLegend - wBom, h: strip.h },
  }
}

export interface PrintTransform {
  /** Penyebut skala, mis. 200 untuk 1:200. Dibulatkan hanya untuk tampilan. */
  scaleDen: number
  mmPerPx: number
  /** px gambar -> mm lembar: X = tx + x * mmPerPx. */
  tx: number
  ty: number
  bbox: [number, number, number, number]
  /** Area terpilih tidak muat pada skala tetap, sehingga sebagian terpotong. */
  clipped: boolean
}

export function printTransform(l: PrintLayout, image: { w: number; h: number }, mpp: number, g: SheetGeometry): PrintTransform {
  const bbox = l.bbox_px ?? [0, 0, image.w, image.h]
  const bw = Math.max(1, bbox[2] - bbox[0])
  const bh = Math.max(1, bbox[3] - bbox[1])
  let mmPerPx: number
  let clipped = false
  if (l.scale_denominator) {
    mmPerPx = (mpp * 1000) / l.scale_denominator
    clipped = bw * mmPerPx > g.drawing.w + 1e-6 || bh * mmPerPx > g.drawing.h + 1e-6
  } else {
    mmPerPx = Math.min(g.drawing.w / bw, g.drawing.h / bh)
  }
  const cx = (bbox[0] + bbox[2]) / 2
  const cy = (bbox[1] + bbox[3]) / 2
  return {
    scaleDen: (mpp * 1000) / mmPerPx,
    mmPerPx,
    tx: g.drawing.x + g.drawing.w / 2 - cx * mmPerPx,
    ty: g.drawing.y + g.drawing.h / 2 - cy * mmPerPx,
    bbox,
    clipped,
  }
}

const NICE_METERS = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]

/** Panjang scale bar yang "bulat" dalam meter dan panjangnya di kertas (mm), tidak melebihi `maxMm`. */
export function niceScaleBar(maxMm: number, scaleDen: number): { meters: number; mm: number; divisions: number } {
  let meters = NICE_METERS[0]
  for (const m of NICE_METERS) if ((m * 1000) / scaleDen <= maxMm) meters = m
  const divisions = 2
  return { meters, mm: (meters * 1000) / scaleDen, divisions }
}

export const scaleLabel = (scaleDen: number): string => `1:${Math.round(scaleDen).toLocaleString('id-ID')}`
