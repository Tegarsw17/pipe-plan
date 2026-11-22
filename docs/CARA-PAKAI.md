# Cara pakai Pipe Plan

Aplikasi ini berjalan di browser Anda. Foto dan proyek tidak dikirim ke server mana pun.

## 1. Buka foto dan atur skala

1. Klik **Foto** (atau seret berkas ke jendela) dan pilih JPG, PNG, atau GeoTIFF.
2. Atur skala dengan salah satu cara:
   - **GeoTIFF**: skala otomatis dari georeferensi (akurasi Tinggi). CRS UTM memakai satuan berkas; CRS lat/long dihitung di zona UTM pada pusat gambar.
   - **Garis referensi** (`R`): tarik garis pada objek yang panjangnya Anda tahu (mis. 10 m), lalu isi panjangnya. Akurasi sekitar 1–2% bila garis panjang dan sebidang dengan objek.
   - **Dari EXIF**: untuk foto drone asli yang masih punya metadata. Akurasi sekitar 2–5%. Tinggi terbang di EXIF DJI relatif terhadap titik take-off, bukan tanah di lokasi.
3. **Verifikasi** (`K`): ukur objek kedua yang panjangnya diketahui. Aplikasi menampilkan selisihnya dalam persen. Lakukan sebelum hasil dipakai menghitung material.

Foto yang sudah di-resize atau diunggah lewat aplikasi pesan biasanya kehilangan EXIF. Pakai file asli dari drone.

## 2. Ukur

| Alat | Tombol | Cara |
| --- | --- | --- |
| Jarak | `D` | Klik dua titik |
| Polyline | `P` | Klik titik demi titik; klik dua kali atau `Enter` untuk selesai |
| Luas | `A` | Klik sudut demi sudut; klik dua kali atau `Enter` untuk menutup |
| Sudut | `S` | Klik ujung pertama, titik sudut, ujung kedua |

Bantuan presisi saat menggambar:
- **Snap**: titik menempel ke titik dan garis yang sudah ada (tombol magnet di toolbar).
- **Shift**: mengunci arah ke 0/45/90° terhadap sumbu gambar.
- **Ketik angka**: panjang segmen berikutnya (meter), lalu `Enter`. Arahnya mengikuti kursor.
- `Backspace` membatalkan titik terakhir, `Esc` membatalkan gambar.
- Zoom sampai sekitar 50x untuk menempatkan titik di level sub-piksel.

## 3. Gambar pipa dan BOM

1. Pilih jenis pipa aktif di tab **Pipa** (diameter dalam inci). Atur katalog lewat tombol **Katalog**.
2. Tekan `L` dan klik titik demi titik. Klik node yang ada atau di tengah segmen untuk membuat percabangan. Klik node terakhir, `Enter`, atau `Esc` untuk menyelesaikan satu rangkaian.
3. Fitting (elbow, tee, cross, reducer) disarankan otomatis. Node bisa diganti menjadi valve, cap, meteran, atau manhole.
4. Tab **BOM** menampilkan total per material dan diameter, cadangan (waste), jumlah batang, dan fitting. Ekspor ke CSV.
5. `Ctrl+Z` mengurungkan, `Ctrl+Shift+Z` mengulangi.

## 4. Cetak berskala

1. Klik **Cetak**. Pilih kertas (A4–A1), orientasi, dan skala (1:100, 1:200, 1:250, 1:500, atau pas ke halaman). Skala yang dipakai selalu tertulis di kop gambar.
2. Pilih **Seluruh foto** atau **Pilih area di foto**.
3. Isi kop gambar. Atur arah utara (derajat searah jarum jam dari sisi atas foto).
4. Klik **Cetak / Simpan PDF**. Di jendela cetak browser: tujuan *Save as PDF*, skala 100% (Default), margin *None*.
5. Cek hasil dengan scale bar dan penggaris sebelum dipakai di lapangan.

Garis dan teks di PDF tetap vektor di atas foto.

## 5. Simpan dan cadangkan

- **Simpan** membuat satu berkas `.zip` berisi foto asli dan `project.json`. **Buka** memuatnya kembali.
- Aplikasi juga menyimpan otomatis ke browser. Itu hanya cadangan sementara: data hilang jika Anda menghapus data situs.
- Simpan berkas `.zip` secara rutin dan salin ke cloud drive pribadi (Google Drive, OneDrive, dll.) atau flash disk. Berkas lama tetap bisa dibuka setelah aplikasi diperbarui (nomor versi format tercatat; format lama dikonversi otomatis).

## Batas yang perlu diketahui

- GeoTIFF dengan rotasi atau shear belum didukung. GeoTIFF yang sangat besar (lebih dari 120 juta piksel) ditolak; yang lebih dari sekitar 8.000 piksel pada sisi terpanjang ditampilkan lebih kecil dan skalanya disesuaikan.
- Satu lembar per cetak. Area luas yang dipecah ke beberapa lembar dengan key plan masih ditunda.
- Ekspor DXF/GeoJSON/KML, harga satuan, dan elevasi ditunda.
