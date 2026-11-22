# Pipe Plan — Aplikasi Ukur Foto Drone

Aplikasi web statis untuk mengukur jarak, polyline, dan luas di atas foto drone. Berjalan sepenuhnya di browser, tanpa server dan tanpa biaya. Lihat PRD dan backlog untuk rancangan lengkap.

## Status

**Tahap 1 (Ukur dasar) selesai**: T001–T015. T016 (uji lapangan dengan foto Mini 3 Pro) menunggu foto nyata.

**Tahap 2 (Pipa dan BOM) selesai**: T017–T032. Format proyek: `schema_version` 2 menambah data pipa; proyek versi 1 otomatis dimigrasi.

Diameter pipa memakai **inci nominal** (3/4", 1 1/2", 4"). Di katalog bisa diketik `3/4`, `1 1/2`, `1-1/2`, atau `2,5`. `schema_version` 3; proyek versi 2 (mm) otomatis dikonversi (mis. 110 mm menjadi 4").

**Tahap 3 (Cetak dan presisi)**: T033–T046 dan T049 selesai; `schema_version` 4. T047 (uji satu proyek nyata sampai PDF) dan T016 menunggu foto dan pengukuran lapangan Anda.

Tambahan Tahap 3: cetak berskala A4–A1 (1:100, 1:200, 1:250, 1:500, atau pas ke halaman) dengan kop gambar, legenda, panah utara, scale bar, dan tabel BOM, lewat Print browser ke PDF vektor; GeoTIFF dengan skala otomatis (geotiff.js, proj4js); EXIF/XMP drone (exifr) dengan kalibrasi GSD dan peringatan gimbal; verifikasi kalibrasi dengan objek kedua dan badge akurasi; snapping, kunci sudut Shift, input panjang dari keyboard, dan alat ukur sudut. Panduan: [docs/CARA-PAKAI.md](docs/CARA-PAKAI.md).

Tambahan Tahap 2: katalog pipa (awal: PVC 3/4"–4", HDPE 2" dan 4", GI 1" dan 2"; bisa diubah dan diimpor dari proyek lain), alat Pipa (`L`) dengan node dan segmen, sambung ke node atau tengah segmen (percabangan), label `Ø4" PVC · 12,45 m`, saran fitting otomatis (elbow, tee, cross, reducer; elbow dibulatkan ke 45°/90°), node khusus (valve, cap, meteran, manhole), geser/sisip/pecah/hapus node dengan graf tetap valid, panel BOM realtime (waste %, jumlah batang) dengan ekspor CSV, ekspor daftar pengukuran CSV, layer tampil/kunci, undo/redo (Ctrl+Z, Ctrl+Shift+Z).

Fitur: buka JPG/PNG, zoom sub-piksel (sampai ±50x), pan, putar, kalibrasi garis referensi, ukur jarak/polyline/luas dengan label realtime, geser/hapus titik, simpan/buka proyek `.zip` (`project.json` + foto, `schema_version` tercatat), simpan otomatis ke IndexedDB.

## Pakai

```bash
npm install
npm run dev      # pengembangan
npm test         # uji geometri, kalibrasi, berkas proyek
npm run build    # hasil: dist/index.html (satu file)
```

`dist/index.html` bisa dibuka langsung dari folder (`file://`), atau di hosting statis gratis. Versi library dikunci di `package.json` dan `package-lock.json`.

## Pintasan

`V` pilih · `R` referensi · `D` jarak · `P` polyline · `A` luas · `L` pipa · `S` sudut · `K` verifikasi · `Ctrl+Z` urungkan · `Enter` selesai · `Backspace` batalkan titik · `Esc` batal · `Delete` hapus objek · `Alt`+klik titik hapus titik.

## Catatan akurasi

Kalibrasi manual berakurasi sekitar 1–2% bila garis referensi panjang dan sebidang dengan objek. Foto dengan kamera miring atau tanah tidak datar akan kurang akurat.

## Desain

Gaya Swiss/minimal dari UI/UX Pro Max: navy `#1E3A5F`, biru `#2563EB`, Fira Sans/Fira Code, fokus keyboard terlihat, kontras teks minimal 4,5:1.
