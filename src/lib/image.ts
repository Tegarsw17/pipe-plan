import type { ImageInfo } from './types'

export class ImageError extends Error {}

/** Baca ukuran dan jenis foto. GeoTIFF masuk Tahap 3. */
export async function readImageInfo(file: File | Blob, name: string): Promise<ImageInfo> {
  const type = file.type || 'application/octet-stream'
  if (type === 'image/tiff' || /\.tiff?$/i.test(name)) {
    throw new ImageError('GeoTIFF belum didukung di versi ini (Tahap 3). Pakai JPG atau PNG.')
  }
  if (type !== 'image/jpeg' && type !== 'image/png') {
    throw new ImageError('Format foto harus JPG atau PNG.')
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode().catch(() => {
      throw new ImageError('Foto tidak bisa dibuka. Berkas mungkin rusak.')
    })
    return {
      file_name: name,
      file_type: type,
      width_px: img.naturalWidth,
      height_px: img.naturalHeight,
      exif: null,
      crs: null,
      geotransform: null,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}
