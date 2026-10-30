# TikTok Live ATM Interactive

ATM virtual untuk siaran TikTok LIVE: penonton masuk → 1 lembar uang virtual keluar; gift kecil → beberapa lembar; gift besar → 1 bundel 10 lembar. Semua uang adalah **mata uang virtual untuk hiburan** (berlabel "UANG HIBURAN VIRTUAL — BUKAN ALAT PEMBAYARAN YANG SAH"), bukan uang resmi.

**Status: siap diuji di LIVE, belum "100% selesai".** Yang terbukti lewat tes otomatis dan yang MASIH menunggu validasi perangkat/akun nyata dipisahkan jelas di [`docs/BUILD_VERIFICATION.md`](docs/BUILD_VERIFICATION.md) dan [`docs/MANUAL_TESTS.md`](docs/MANUAL_TESTS.md).

## Halaman

| Alamat | Fungsi |
|---|---|
| `/control` | Dasbor kontrol (Safari iPad): audio, mode antrean, simulator event, status koneksi, diagnostik |
| `/overlay` | ATM transparan 9:16 untuk **PRISM Web widget**. Parameter: `?room=KODE` (tautan lintas perangkat), `&clean=1` (sembunyikan tombol suara), `&debug=1` (HUD diagnostik), `&bg=dark|checker` (latar uji) |

## Cara kerja singkat

1. Buka `/control` → salin **Overlay URL** (berisi kode room rahasia).
2. Tempel URL itu ke PRISM sebagai sumber **Web**. Overlay muncul "connected" di `/control`.
3. Event datang dari **simulator** (tombol di `/control`) atau dari **listener TikTok** (opsional, tidak resmi, jalan di komputer/server sendiri).
4. Event diproses **satu per satu**: proses → uang keluar → "silakan ambil uang" → standby. Tidak pernah ada animasi bertabrakan, event ganda diblokir, antrean selamat dari reload.

Mode antrean: **Community** (urut kedatangan), **Gift Priority** (gift dulu), **Hybrid** (gift dulu, tetapi viewer join dijamin giliran setelah N gift berturut-turut atau T detik; N dan T bisa diatur). Detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Instalasi lokal

```bash
npm install
npm run dev            # http://localhost:3000/control
npm run verify         # typecheck + lint + test + build
npm run e2e            # tes browser (butuh `npm run build` dulu dan Playwright terpasang)
```

Tanpa konfigurasi apa pun, aplikasi jalan dengan tautan **satu browser** (dua tab Safari). Untuk PRISM (konteks berbeda dari Safari) wajib tautan lintas perangkat → isi dua variabel lingkungan di bawah.

## Environment variables

| Variabel | Dimana | Rahasia? | Fungsi |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel/lokal (build) | publik | URL proyek Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel/lokal (build) | publik (anon/publishable) | Kunci anon. **Kunci `service_role`/`sb_secret_` ditolak aplikasi.** |
| `TIKTOK_USERNAME`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ATM_ROOM` | listener | **jaga privat** | Konfigurasi listener TikTok |
| `EULER_API_KEY`, `ATM_LARGE_GIFT_DIAMONDS`, `ATM_MAX_JOINS_PER_MIN` | listener (opsional) | kunci = rahasia | lihat `.env.example` |

Kode **room** (dibuat otomatis di `/control`) adalah "kata sandi" antara control, overlay, dan listener. Jangan tampilkan di layar siaran.

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | arsitektur, jaminan pengiriman, kebijakan antrean, model keamanan |
| [DEPLOYMENT_VERCEL](docs/DEPLOYMENT_VERCEL.md) | deploy, env, Supabase, branch produksi |
| [PRISM](docs/PRISM.md) | menghubungkan PRISM, masalah audio untuk penonton |
| [TIKTOK_LIVE](docs/TIKTOK_LIVE.md) | listener TikTok: risiko, lisensi, cara jalan |
| [AUDIO_ASSETS](docs/AUDIO_ASSETS.md) | daftar suara, cara mengganti, pengujian audio |
| [OPERATIONS](docs/OPERATIONS.md) | **checklist sebelum/sesudah LIVE**, prosedur pemulihan, diagnostik |
| [TROUBLESHOOTING](docs/TROUBLESHOOTING.md) | masalah umum |
| [KNOWN_LIMITATIONS](docs/KNOWN_LIMITATIONS.md) | keterbatasan |
| [MANUAL_TESTS](docs/MANUAL_TESTS.md) | tes yang harus Anda lakukan (PENDING EXTERNAL VALIDATION) |
| [AUDIT](docs/AUDIT.md) | temuan audit + perbaikan |
| [BUILD_VERIFICATION](docs/BUILD_VERIFICATION.md) | hasil tes aktual |

## Struktur

```
src/lib/          logika (queue, controller, audio, transport, protocol, outbox, …)
src/components/atm/  komponen visual ATM
src/app/          /control  /overlay
listener/         listener TikTok (opsional, Node ≥ 22, bukan untuk Vercel)
public/audio/     5 file WAV (placeholder sintetis, bukan rekaman ATM asli)
tests/  e2e/      tes unit/integrasi dan tes browser
```
