import { describe, expect, it } from 'vitest'
import { measure, polygonArea, polylineLength } from './geometry'
import { calibrateFromReference, CalibrationError } from './calibration'
import { newProject, saveProjectZip, openProjectZip, checkSchema, ProjectFileError } from './project'

describe('geometri', () => {
  it('panjang polyline', () => expect(polylineLength([[0, 0], [3, 4], [3, 10]])).toBeCloseTo(11))
  it('luas persegi 10x10', () => expect(polygonArea([[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(100))
  it('ukur luas dengan skala 0,5 m/px', () => {
    const r = measure('area', [[0, 0], [10, 0], [10, 10], [0, 10]], 0.5)
    expect(r.area_m2).toBeCloseTo(25)
    expect(r.length_m).toBeCloseTo(20)
  })
})

describe('kalibrasi', () => {
  it('100 px = 10 m -> 0,1 m/px', () => {
    const c = calibrateFromReference([0, 0], [100, 0], 10, 'm', 'c1')
    expect(c.meters_per_px).toBeCloseTo(0.1)
    expect(c.accuracy_level).toBe('Sedang')
  })
  it('konversi satuan', () => {
    expect(calibrateFromReference([0, 0], [100, 0], 1000, 'cm', 'c').meters_per_px).toBeCloseTo(0.1)
  })
  it('menolak input tidak valid', () => {
    expect(() => calibrateFromReference([1, 1], [1, 1], 5, 'm', 'c')).toThrow(CalibrationError)
    expect(() => calibrateFromReference([0, 0], [5, 0], 0, 'm', 'c')).toThrow(CalibrationError)
  })
})

describe('berkas proyek', () => {
  it('round-trip zip', async () => {
    const p = newProject('Uji')
    p.image = { file_name: 'a.png', file_type: 'image/png', width_px: 2, height_px: 2, exif: null, crs: null, geotransform: null }
    p.measurements.push({ id: 'm1', layer_id: 'layer-ukur', type: 'distance', points_px: [[0, 0], [1, 1]], label: '' })
    const blob = await saveProjectZip(p, new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }))
    const back = await openProjectZip(blob)
    expect(back.project.project.schema_version).toBe(2)
    expect(back.project.measurements).toHaveLength(1)
    expect(back.image?.size).toBe(3)
  })
  it('menolak versi lebih baru', () => {
    expect(() => checkSchema({ project: { schema_version: 99 } })).toThrow(ProjectFileError)
  })
})
