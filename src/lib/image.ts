import { fromBlob } from 'geotiff'
import type { Calibration, ImageInfo } from './types'
import { readPhotoMeta, type PhotoMeta } from './exif'
import { geoScale, GeoError } from './geo'

export class ImageError extends Error {}

export interface LoadedImage {
  blob: Blob
  info: ImageInfo
  meta: PhotoMeta | null
  /** Terisi untuk GeoTIFF: skala otomatis dari georeferensi. */
  geoCalibration: Calibration | null
}

const MAX_SOURCE_PIXELS = 120_000_000
const MAX_SIDE = 8192

const isTiff = (f: Blob, name: string) => f.type === 'image/tiff' || /\.tiff?$/i.test(name)

async function decodeDimensions(blob: Blob): Promise<{ w: number; h: number }> {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = url
    await img.decode().catch(() => {
      throw new ImageError('Foto tidak bisa dibuka. Berkas mungkin rusak.')
    })
    return { w: img.naturalWidth, h: img.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Buka JPG/PNG/GeoTIFF. GeoTIFF diubah menjadi JPEG untuk ditampilkan; georeferensi dicatat di proyek. */
export async function loadImageFile(file: File | Blob, name: string, newId: () => string): Promise<LoadedImage> {
  if (isTiff(file, name)) return loadGeoTiff(file, name, newId)
  const type = file.type || 'application/octet-stream'
  if (type !== 'image/jpeg' && type !== 'image/png') throw new ImageError('Format foto harus JPG, PNG, atau GeoTIFF.')
  const { w, h } = await decodeDimensions(file)
  const meta = type === 'image/jpeg' ? await readPhotoMeta(file) : null
  return {
    blob: file,
    meta,
    geoCalibration: null,
    info: { file_name: name, file_type: type, width_px: w, height_px: h, exif: meta ? { ...meta } : null, crs: null, geotransform: null },
  }
}

async function loadGeoTiff(file: Blob, name: string, newId: () => string): Promise<LoadedImage> {
  let image
  try {
    image = await (await fromBlob(file)).getImage()
  } catch {
    throw new ImageError('Berkas TIFF tidak bisa dibaca.')
  }
  const w = image.getWidth()
  const h = image.getHeight()
  if (w * h > MAX_SOURCE_PIXELS) {
    throw new ImageError(`GeoTIFF ${w}×${h} px terlalu besar untuk browser. Ekspor ortomosaik dengan resolusi lebih kecil atau potong ke area kerja.`)
  }
  const dir = image.getFileDirectory() as Record<string, unknown>
  if (dir.ModelTransformation) throw new ImageError('GeoTIFF dengan rotasi atau shear belum didukung. Ekspor ulang dengan orientasi utara di atas.')
  let origin: number[]
  let res: number[]
  try {
    origin = image.getOrigin()
    res = image.getResolution()
  } catch {
    throw new ImageError('Berkas TIFF ini tidak punya georeferensi. Buka sebagai JPG/PNG lalu kalibrasi manual.')
  }
  const keys = (image.getGeoKeys() ?? {}) as Record<string, number | undefined>
  const projected = keys.ProjectedCSTypeGeoKey && keys.ProjectedCSTypeGeoKey !== 32767 ? keys.ProjectedCSTypeGeoKey : null
  const geographic = keys.GeographicTypeGeoKey && keys.GeographicTypeGeoKey !== 32767 ? keys.GeographicTypeGeoKey : null
  const isGeographic = !projected && (keys.GTModelTypeGeoKey === 2 || !!geographic)

  // Tampilkan paling besar MAX_SIDE piksel; skala dihitung ulang sesuai faktor pengecilan.
  const f = Math.max(1, Math.max(w, h) / MAX_SIDE)
  const outW = Math.round(w / f)
  const outH = Math.round(h / f)
  let scale
  try {
    scale = geoScale({
      epsg: projected ?? geographic,
      isGeographic,
      linearUnits: keys.ProjLinearUnitsGeoKey ?? null,
      resX: res[0] * (w / outW),
      resY: res[1] * (h / outH),
      centerX: origin[0] + (res[0] * w) / 2,
      centerY: origin[1] + (res[1] * h) / 2,
    })
  } catch (e) {
    throw new ImageError(e instanceof GeoError ? e.message : 'Georeferensi GeoTIFF tidak bisa dibaca.')
  }

  const rgb = (await image.readRGB({ width: outW, height: outH, interleave: true, resampleMethod: 'bilinear' })) as unknown as ArrayLike<number> & { BYTES_PER_ELEMENT: number }
  const shift = rgb.BYTES_PER_ELEMENT === 2 ? 8 : 0
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ImageError('Browser tidak bisa memproses gambar ini.')
  const data = ctx.createImageData(outW, outH)
  for (let i = 0, j = 0; i < outW * outH; i++, j += 4) {
    data.data[j] = Number(rgb[i * 3]) >> shift
    data.data[j + 1] = Number(rgb[i * 3 + 1]) >> shift
    data.data[j + 2] = Number(rgb[i * 3 + 2]) >> shift
    data.data[j + 3] = 255
  }
  ctx.putImageData(data, 0, 0)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92))
  if (!blob) throw new ImageError('Gagal membuat pratinjau GeoTIFF.')

  const notes = [...scale.notes]
  if (f > 1) notes.push(`Ditampilkan ${outW}×${outH} px (asli ${w}×${h}); skala sudah disesuaikan.`)
  const cal: Calibration = {
    id: newId(),
    method: 'geotiff',
    input: null,
    affine: [scale.meters_per_px, 0, 0, 0, scale.meters_per_px, 0],
    meters_per_px: scale.meters_per_px,
    accuracy_level: 'Tinggi',
    error_pct: null,
    is_active: true,
    notes,
  }
  return {
    blob,
    meta: null,
    geoCalibration: cal,
    info: {
      file_name: name.replace(/\.tiff?$/i, '') + '.jpg',
      file_type: 'image/jpeg',
      width_px: outW,
      height_px: outH,
      exif: null,
      crs: scale.crs,
      geotransform: [origin[0], res[0] * (w / outW), 0, origin[1], 0, res[1] * (h / outH)],
    },
  }
}
