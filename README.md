# SECURETIX — Supply Chain Tiket Konser NFT (Anti-Scalping)

**SECURETIX** adalah aplikasi terdesentralisasi (DApp) untuk manajemen, distribusi, dan verifikasi tiket konser berbasis Smart Contract Ethereum (**ERC-721**). Sistem ini dirancang untuk mencegah praktik calo (*scalping*) dan pemalsuan tiket dengan mengunci batas harga jual kembali (*resale cap*), menerapkan royalti promotor otomatis sebesar 10%, serta mencatat seluruh riwayat perpindahan kepemilikan (*provenance*) secara transparan di atas blockchain.

## Fitur Utama

* **Minting Tiket NFT (Promotor):** Penerbitan tiket konser baru secara satuan maupun *batch* dengan pengemasan metadata on-chain (kategori, tanggal, jam, lokasi venue, serta plafon harga resale maksimum).
* **Pasar Utama (Primary Market):** Pembelian tiket resmi langsung dari Promotor (`Account 1`) menggunakan ETH.
* **Pasar Sekunder Terkontrol (Anti-Scalping):**
  * Penonton wajib mendaftar sebagai penjual resmi (`daftarSebagaiPenjual`) sebelum menjual kembali tiketnya.
  * Smart Contract menolak transaksi jika harga resale melebihi batas maksimum yang ditetapkan Promotor (`MelebihiBatasResale`).
  * Pembagian dana otomatis dengan pemotongan royalti 10% untuk Promotor pada setiap transaksi resale.
* **Verifikasi & Check-In Venue (Gate):** Validasi keaslian tiket di pintu masuk oleh Promotor atau Vendor Gate resmi (`Account 2`), yang mengunci status tiket menjadi `USED` agar tidak dapat dipakai ganda.
* **Audit Trail & Provenance:** Pelacakan riwayat lengkap setiap tiket mulai dari `TICKET_MINTED`, `PRIMARY_PURCHASED`, `TICKET_LISTED_FOR_RESALE`, `RESALE_PURCHASED`, hingga `TICKET_CHECKIN`.
* **Dual Wallet Mode:** Mendukung perpindahan instan antar akun pengujian Hardhat di sidebar maupun koneksi langsung melalui ekstensi **MetaMask** browser.

## Struktur Proyek

```text
tiket-blockchain-lab/
├── contracts/          # Kode sumber Smart Contract Solidity (SupplyChainTiket.sol)
├── scripts/            # Skrip deployment kontrak ke jaringan Hardhat
├── test/               # Pengujian unit Smart Contract
├── frontend/           # Antarmuka Web3 (HTML, CSS, Vanilla JS + Ethers.js v6)
│   ├── index.html      # Halaman utama aplikasi
│   ├── style.css       # Tema Darkroom Amber & komponen kartu tiket
│   ├── app.js          # Logika interaksi Web3, state, & render 7 halaman
│   └── ABI.js          # Konfigurasi RPC, alamat kontrak default, & ABI
├── deployment.json     # Alamat kontrak hasil deploy & alamat vendor resmi
└── hardhat.config.js   # Konfigurasi compiler Solidity 0.8.28 & jaringan localhost
```

## Prasyarat Sistem

Pastikan perangkat Anda sudah terpasang:

1. **Node.js** (versi 18 atau lebih baru) & **npm**
2. **Browser Modern** (Chrome/Edge/Brave) dengan ekstensi **MetaMask** (opsional)

## Cara Instalasi & Menjalankan Aplikasi

Ikuti langkah-langkah berikut secara berurutan di terminal:

### 1. Instalasi Dependensi

Masuk ke direktori utama proyek dan install paket yang dibutuhkan:

```bash
cd tiket-blockchain-lab
npm install
```

### 2. Jalankan Node Blockchain Lokal (Terminal 1)

Nyalakan jaringan Ethereum lokal menggunakan Hardhat pada `http://127.0.0.1:8545` (Chain ID `31337`):

```bash
npx hardhat node
```

> **Catatan:** Biarkan terminal ini tetap berjalan selama Anda menggunakan aplikasi.

### 3. Compile & Deploy Smart Contract (Terminal 2)

Buka terminal baru, lalu kompilasi dan deploy kontrak `SupplyChainTiket` ke jaringan `localhost`:

```bash
npx hardhat compile
npx hardhat run scripts/deploy.js --network localhost
```

*(Sesuaikan nama file di folder `scripts/` jika berbeda, misalnya `deploy.js` atau `deployTiket.js`). Pastikan alamat kontrak yang muncul cocok dengan `deployment.json` dan `frontend/ABI.js` (`0x5FbDB2315678afecb367f032d93F642f64180aa3`).*

### 4. Jalankan Antarmuka Web (Frontend)
Buka terminal baru, masuk ke direktori `frontend`, lalu jalankan server lokal menggunakan `npx serve`:
```bash
cd frontend
npx serve .

## Panduan Penggunaan & Simulasi Peran

Gunakan menu pemilih akun (**Web3 Wallet**) di sidebar sebelah kiri untuk mensimulasikan berbagai aktor dalam ekosistem tiket:

| Akun Hardhat | Peran di Sistem | Aksi yang Dapat Dilakukan |
| :--- | :--- | :--- |
| **Account 1** (`0xf39F...2266`) | **Promotor Utama (Owner)** | Menerbitkan tiket baru (`Mint Tiket`), menerima royalti resale, melakukan `Check-In` di gate. |
| **Account 2** (`0x7099...79C8`) | **Vendor Gate Resmi** | Melakukan validasi & `Check-In` tiket pengunjung di pintu masuk venue. |
| **Account 3, 4, dst.** | **Penonton / Pembeli** | Membeli tiket pasar utama, mendaftar sebagai penjual sekunder, menjual/membeli tiket resale. |

### Alur Pengujian Lengkap (End-to-End):

1. **Terbitkan Tiket:** Pilih **Account 1 \[Promotor\]**, buka menu **Mint Tiket**, isi detail konser, harga utama, dan batas maksimal resale, lalu klik **Mint & Terbitkan Tiket**.
2. **Beli Tiket Utama:** Ganti akun ke **Account 3**, buka menu **Ticket Purchase**, pilih konser yang tersedia, dan klik **Beli Tiket Utama**.
3. **Jual di Pasar Sekunder:** Masih sebagai **Account 3**, buka menu **Sekunder Tiket** $\rightarrow$ klik **Daftar Menjadi Penjual** $\rightarrow$ pilih tiket milik Anda, tentukan harga jual (tidak melebihi batas maksimal), lalu klik **Daftarkan Tiket**.
4. **Beli Tiket Sekunder:** Ganti akun ke **Account 4**, buka menu **Sekunder Tiket** $\rightarrow$ tab **Pembelian Tiket Sekunder**, lalu beli tiket yang ditawarkan.
5. **Check-In di Venue:** Ganti akun ke **Account 1 \[Promotor\]** atau **Account 2 \[Vendor Gate\]**, buka menu **Verification**, pilih ID tiket pengunjung, dan klik **Proses Check-In Gate**. Status tiket akan berubah menjadi `USED` dan jejak riwayatnya dapat diaudit di tab **Audit & Keaslian Tiket**.