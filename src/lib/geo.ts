import proj4 from 'proj4'

export class GeoError extends Error {}

export interface GeoScale {
  meters_per_px: number
  crs: string
  notes: string[]
}

const WGS84_GEOGRAPHIC = new Set([4326, 4269, 4979])

export function utmDefinition(lon: number, lat: number): { zone: number; def: string; label: string } {
  const zone = Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1))
  const south = lat < 0
  return { zone, def: `+proj=utm +zone=${zone}${south ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`, label: `UTM ${zone}${south ? 'S' : 'N'}` }
}

export interface GeoTags {
  /** ProjectedCSTypeGeoKey atau GeographicTypeGeoKey. */
  epsg: number | null
  isGeographic: boolean
  /** ProjLinearUnitsGeoKey: 9001 meter, 9002 feet, 9003 US survey feet. */
  linearUnits: number | null
  /** Resolusi per piksel pada gambar yang ditampilkan (sudah memperhitungkan resampling). */
  resX: number
  resY: number
  /** Pusat gambar dalam satuan CRS (untuk CRS geografis: derajat bujur, lintang). */
  centerX: number
  centerY: number
}

/** Hitung meter per piksel dari tag GeoTIFF. CRS proyeksi (mis. UTM) memakai satuan berkas; CRS geografis diubah lewat UTM di pusat gambar. */
export function geoScale(t: GeoTags): GeoScale {
  const notes: string[] = []
  let mx: number
  let my: number
  let crs: string

  if (t.isGeographic) {
    if (t.epsg && !WGS84_GEOGRAPHIC.has(t.epsg)) notes.push(`CRS geografis EPSG:${t.epsg} dianggap setara WGS84.`)
    const u = utmDefinition(t.centerX, t.centerY)
    const to = proj4('EPSG:4326', u.def)
    const c = to.forward([t.centerX, t.centerY])
    const px = to.forward([t.centerX + Math.abs(t.resX), t.centerY])
    const py = to.forward([t.centerX, t.centerY + Math.abs(t.resY)])
    mx = Math.hypot(px[0] - c[0], px[1] - c[1])
    my = Math.hypot(py[0] - c[0], py[1] - c[1])
    crs = `EPSG:${t.epsg ?? 4326} (dihitung di ${u.label})`
    notes.push('Skala dihitung di pusat gambar; area sangat luas bisa sedikit bergeser.')
  } else {
    const unit = t.linearUnits === 9002 ? 0.3048 : t.linearUnits === 9003 ? 1200 / 3937 : 1
    mx = Math.abs(t.resX) * unit
    my = Math.abs(t.resY) * unit
    const epsg = t.epsg ?? 0
    const utm = epsg >= 32601 && epsg <= 32660 ? `UTM ${epsg - 32600}N` : epsg >= 32701 && epsg <= 32760 ? `UTM ${epsg - 32700}S` : null
    crs = `EPSG:${t.epsg ?? '?'}${utm ? ` (${utm})` : ''}`
    if (!t.epsg) notes.push('CRS tidak tercatat; satuan dianggap meter.')
    else if (!utm) notes.push('CRS bukan UTM; satuan berkas dianggap sudah benar dalam meter.')
  }
  if (!(mx > 0 && my > 0)) throw new GeoError('Resolusi GeoTIFF tidak valid.')
  if (Math.abs(mx - my) / Math.max(mx, my) > 0.01) notes.push('Piksel tidak persegi; dipakai rata-rata sumbu X dan Y.')
  return { meters_per_px: (mx + my) / 2, crs, notes }
}
