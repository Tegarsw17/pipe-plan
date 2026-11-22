import { describe, expect, it } from 'vitest'
import { angleDeg, measure } from './geometry'
import { collectTargets, constrainAngle, pointAtLength, snapPoint } from './snap'
import { addVerification, calibrationFromExif, gsdFromExif, isNadir, sensorWidthFrom35mm } from './scale'
import { geoScale, utmDefinition } from './geo'
import { newProject } from './project'

describe('sudut', () => {
  it('siku-siku 90° dan lurus 180°', () => {
    expect(angleDeg([10, 0], [0, 0], [0, 10])).toBeCloseTo(90)
    expect(angleDeg([-5, 0], [0, 0], [7, 0])).toBeCloseTo(180)
  })
  it('measure sudut', () => expect(measure('angle', [[10, 0], [0, 0], [10, 10]], 1).angle_deg).toBeCloseTo(45))
})

describe('snap dan kunci sudut', () => {
  it('titik didahulukan dari garis, di luar toleransi tidak snap', () => {
    const p = newProject()
    p.measurements.push({ id: 'm1', layer_id: 'x', type: 'polyline', points_px: [[0, 0], [100, 0]], label: '' })
    const t = collectTargets(p)
    expect(snapPoint([3, 3], t, 8)).toEqual({ point: [0, 0], kind: 'vertex' })
    expect(snapPoint([50, 4], t, 8)).toEqual({ point: [50, 0], kind: 'edge' })
    expect(snapPoint([50, 20], t, 8)).toBeNull()
  })
  it('kunci 0/45/90', () => {
    const near = constrainAngle([0, 0], [100, 9])
    expect(near[1]).toBeCloseTo(0)
    expect(near[0]).toBeCloseTo(100 * Math.cos(Math.atan2(9, 100)) * 1 + 9 * 0, 0)
    const diag = constrainAngle([0, 0], [100, 90])
    expect(diag[0]).toBeCloseTo(diag[1])
    const vert = constrainAngle([10, 10], [14, 100])
    expect(vert[0]).toBeCloseTo(10)
  })
  it('titik pada panjang tertentu searah kursor', () => {
    const p = pointAtLength([0, 0], [0, 50], 120)
    expect(p[0]).toBeCloseTo(0)
    expect(p[1]).toBeCloseTo(120)
    expect(pointAtLength([5, 5], null, 10)).toEqual([15, 5])
  })
})

describe('skala dari EXIF', () => {
  it('contoh PRD: sensor 13,2 / focal 8,8 / 5472 px / 100 m = ±2,7 cm', () => {
    expect(gsdFromExif({ sensor_width_mm: 13.2, focal_mm: 8.8, altitude_m: 100, image_width_px: 5472 })).toBeCloseTo(0.02741, 4)
  })
  it('lebar sensor dari ekuivalen 35 mm (Mini 3 Pro: 6,7 mm / 24 mm)', () => {
    expect(sensorWidthFrom35mm(6.7, 24)).toBeCloseTo(9.66, 1)
  })
  it('input tidak valid memberi null', () => {
    expect(calibrationFromExif({ sensor_width_mm: 9.6, focal_mm: 6.7, altitude_m: 0, image_width_px: 4000 }, 'c', -90)).toBeNull()
  })
  it('peringatan gimbal dan tinggi relatif', () => {
    const c = calibrationFromExif({ sensor_width_mm: 9.6, focal_mm: 6.7, altitude_m: 60, image_width_px: 4032 }, 'c', -60)!
    expect(c.accuracy_level).toBe('Estimasi')
    expect(c.notes?.length).toBe(2)
    expect(isNadir(-89)).toBe(true)
    expect(isNadir(-60)).toBe(false)
  })
  it('verifikasi mencatat selisih persen', () => {
    const base = calibrationFromExif({ sensor_width_mm: 9.6, focal_mm: 6.7, altitude_m: 60, image_width_px: 4032 }, 'c', -90)!
    const v = addVerification(base, { id: 'v', points_px: [[0, 0], [1, 0]], measured_m: 10.3, known_m: 10 })
    expect(v.verifications![0].diff_pct).toBeCloseTo(3)
    expect(v.error_pct).toBeCloseTo(3)
  })
})

describe('GeoTIFF', () => {
  it('UTM meter: skala = resolusi berkas', () => {
    const s = geoScale({ epsg: 32649, isGeographic: false, linearUnits: 9001, resX: 0.1, resY: 0.1, centerX: 0, centerY: 0 })
    expect(s.meters_per_px).toBeCloseTo(0.1)
    expect(s.crs).toContain('UTM 49N')
  })
  it('feet diubah ke meter', () => {
    expect(geoScale({ epsg: 2263, isGeographic: false, linearUnits: 9002, resX: 1, resY: 1, centerX: 0, centerY: 0 }).meters_per_px).toBeCloseTo(0.3048)
  })
  it('CRS geografis: 1e-5 derajat di khatulistiwa = sekitar 1,11 m', () => {
    const s = geoScale({ epsg: 4326, isGeographic: true, linearUnits: null, resX: 1e-5, resY: -1e-5, centerX: 110.4, centerY: -7.0 })
    expect(s.meters_per_px).toBeGreaterThan(1.09)
    expect(s.meters_per_px).toBeLessThan(1.13)
  })
  it('zona UTM Indonesia', () => {
    expect(utmDefinition(106.8, -6.2).zone).toBe(48)
    expect(utmDefinition(106.8, -6.2).label).toBe('UTM 48S')
    expect(utmDefinition(119.4, 0.5).label).toBe('UTM 50N')
  })
  it('piksel tidak persegi diberi catatan', () => {
    expect(geoScale({ epsg: 32649, isGeographic: false, linearUnits: 9001, resX: 0.1, resY: 0.12, centerX: 0, centerY: 0 }).notes.some((n) => n.includes('persegi'))).toBe(true)
  })
})
