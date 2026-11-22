import { describe, expect, it } from 'vitest'
import { newProject } from './project'
import { niceScaleBar, pageSize, printTransform, scaleLabel, sheetGeometry } from './print'

const layout = (o: Partial<ReturnType<typeof newProject>['print_layout']> = {}) => ({ ...newProject().print_layout, ...o })

describe('cetak', () => {
  it('ukuran kertas', () => {
    expect(pageSize(layout({ paper_size: 'A3', orientation: 'landscape' }))).toEqual([420, 297])
    expect(pageSize(layout({ paper_size: 'A4', orientation: 'portrait' }))).toEqual([210, 297])
    expect(pageSize(layout({ paper_size: 'A1', orientation: 'portrait' }))).toEqual([594, 841])
  })
  it('skala tetap 1:200: 0,1 m/px -> 0,5 mm per px, scale bar 10 m = 50 mm', () => {
    const l = layout({ scale_denominator: 200 })
    const g = sheetGeometry(l)
    const t = printTransform(l, { w: 600, h: 400 }, 0.1, g)
    expect(t.mmPerPx).toBeCloseTo(0.5)
    expect(t.scaleDen).toBeCloseTo(200)
    expect(t.clipped).toBe(false)
    expect(niceScaleBar(100, t.scaleDen).mm).toBeCloseTo(100) // 20 m = 100 mm
    expect(niceScaleBar(60, 200)).toMatchObject({ meters: 10, mm: 50 })
  })
  it('area terlalu besar untuk skala tetap ditandai terpotong', () => {
    const l = layout({ paper_size: 'A4', orientation: 'portrait', scale_denominator: 100 })
    const t = printTransform(l, { w: 4000, h: 3000 }, 0.05, sheetGeometry(l))
    expect(t.clipped).toBe(true)
  })
  it('fit to page: skala dihitung dan area muat tepat', () => {
    const l = layout({ scale_denominator: null })
    const g = sheetGeometry(l)
    const t = printTransform(l, { w: 1500, h: 844 }, 0.07619, g)
    expect(1500 * t.mmPerPx).toBeLessThanOrEqual(g.drawing.w + 1e-6)
    expect(844 * t.mmPerPx).toBeLessThanOrEqual(g.drawing.h + 1e-6)
    expect(t.scaleDen).toBeCloseTo((0.07619 * 1000) / t.mmPerPx)
    expect(scaleLabel(317.4)).toMatch(/^1:317$/)
  })
  it('area terpilih dipusatkan di area gambar', () => {
    const l = layout({ scale_denominator: 200, bbox_px: [100, 100, 300, 200] })
    const g = sheetGeometry(l)
    const t = printTransform(l, { w: 600, h: 400 }, 0.1, g)
    expect(t.tx + 200 * t.mmPerPx).toBeCloseTo(g.drawing.x + g.drawing.w / 2)
    expect(t.ty + 150 * t.mmPerPx).toBeCloseTo(g.drawing.y + g.drawing.h / 2)
  })
})
