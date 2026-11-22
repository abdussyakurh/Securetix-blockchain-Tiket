// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// 1. IMPORT LIBRARY ERC-721 
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

// 2. DEKLARASI CONTRACT MENGGUNAKAN ERC721URISTORAGE 
contract SupplyChainTiket is ERC721URIStorage {
    address public owner; // Promotor Utama
    address public vendorResmi; // Vendor Venue / Petugas Check-In Gate

    // 3. AUTO INCREMENT TOKEN ID
    uint256 private nextTokenId = 1;

    // 1. Struct & Enum Tipe Data Kustom
    enum Status {
        MINTED,
        ISSUED,
        RESOLD,
        USED
    }

    struct Tiket {
        uint256 id; // Terhubung dengan Token ID NFT 
        string namaKonser;
        uint256 hargaUtama;
        uint256 batasHargaResale;
        uint256 hargaResale;
        bool isForSale;
        address currentOwner;
        Status status;
    }

    struct Riwayat {
        string aksi;
        address aktor;
        uint256 harga;
        uint256 timestamp;
    }

    // Custom Error untuk efisiensi gas maksimal
    error HanyaOwner();
    error BukanValidatorResmi();
    error TiketSudahAda(uint256 id);
    error TiketTidakAda(uint256 id);
    error DataTidakValid();
    error TiketSudahTerjual(uint256 id);
    error TiketBelumDibeliUtama();
    error TiketSudahTerpakai(uint256 id);
    error NominalTidakSesuai(uint256 dikirim, uint256 dibutuhkan);
    error BukanPemilikPromotor();
    error BukanPemilikTiket();
    error SudahTerdaftarPenjual();
    error BelumTerdaftarPenjual();
    error TiketTidakDijual();
    error BeliKeDiriSendiri();
    error MelebihiBatasResale(uint256 hargaJual, uint256 batasMax);

    // 2. Mappings Storage
    mapping(address => bool) public isRegisteredSeller;
    mapping(uint256 => Tiket) public daftarTiket;
    mapping(uint256 => Riwayat[]) private riwayatTiket;

    // 3. Events
    event PenjualTerdaftar(address indexed penjual);
    event TiketDiBuat(uint256 indexed id, string namaKonser, uint256 hargaUtama);
    event TiketDibeli(uint256 indexed id, address indexed pembeli, uint256 harga);
    event TiketResaleDidaftarkan(uint256 indexed id, uint256 hargaResale);
    event TiketResaleDibeli(uint256 indexed id, address indexed penjual, address indexed pembeli, uint256 harga);
    event StatusUpdated(uint256 indexed id, Status status, address indexed actor);

    // CONSTRUCTOR ERC-721 
    constructor(address _vendorResmi) ERC721("Tiket Konser NFT", "TKT") {
        owner = msg.sender;
        vendorResmi = _vendorResmi;
    }

    // Modifiers
    modifier onlyOwner() {
        if (msg.sender != owner) revert HanyaOwner();
        _;
    }

    modifier onlyVendorOrOwner() {
        if (msg.sender != owner && msg.sender != vendorResmi) revert BukanValidatorResmi();
        _;
    }

    // 4. FUNGSI INTERNAL MINT NFT 
    function mint(address to, uint256 tokenId, string memory metadataURI) internal {
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, metadataURI);
    }

    // Helper Internal untuk Catat Riwayat Transaksi
    function _catatRiwayat(uint256 _id, string memory _aksi, address _aktor, uint256 _harga) internal {
        riwayatTiket[_id].push(Riwayat({
            aksi: _aksi,
            aktor: _aktor,
            harga: _harga,
            timestamp: block.timestamp
        }));
    }

    // ==================================================
    // 0. FITUR PENDAFTARAN PENJUAL MANDIRI
    // ==================================================
    function daftarSebagaiPenjual() external {
        if (isRegisteredSeller[msg.sender]) revert SudahTerdaftarPenjual();

        isRegisteredSeller[msg.sender] = true;

        emit PenjualTerdaftar(msg.sender);
    }

    // ==================================================
    // 1. MEMBUAT TIKET KONSER DAN MINT NFT 
    // ==================================================
    function buatTiket(
        string calldata _namaKonser,
        uint256 _hargaUtama,
        uint256 _batasHargaResale,
        string calldata _metadataURI
    ) external onlyOwner returns (uint256) {
        if (_hargaUtama == 0 || _batasHargaResale < _hargaUtama) revert DataTidakValid();

        // Generasi Token ID otomatis & Minting NFT
        uint256 tokenId = nextTokenId;
        mint(owner, tokenId, _metadataURI);
        nextTokenId++;

        daftarTiket[tokenId] = Tiket({
            id: tokenId,
            namaKonser: _namaKonser,
            hargaUtama: _hargaUtama,
            batasHargaResale: _batasHargaResale,
            hargaResale: 0,
            isForSale: false,
            currentOwner: owner,
            status: Status.MINTED
        });

        _catatRiwayat(tokenId, "TICKET_MINTED", msg.sender, _hargaUtama);
        emit TiketDiBuat(tokenId, _namaKonser, _hargaUtama);

        return tokenId;
    }

    // ==================================================
    // 2. MEMBELI TIKET UTAMA & TRANSFER NFT 
    // ==================================================
    function beliTiketUtama(uint256 _id) external payable {
        Tiket storage item = daftarTiket[_id];

        if (item.id == 0) revert TiketTidakAda(_id);
        if (item.currentOwner != owner) revert BukanPemilikPromotor();
        if (item.status != Status.MINTED) revert TiketSudahTerjual(_id);
        if (msg.value != item.hargaUtama) revert NominalTidakSesuai(msg.value, item.hargaUtama);

        // Transfer 100% dana ke Promotor
        (bool success, ) = payable(owner).call{value: msg.value}("");
        require(success, "Transfer dana gagal");

        // Transfer Kepemilikan NFT ERC-721 dari Promotor ke Pembeli Utama
        _transfer(owner, msg.sender, _id);

        item.currentOwner = msg.sender;
        item.status = Status.ISSUED;

        _catatRiwayat(_id, "PRIMARY_PURCHASED", msg.sender, msg.value);
        emit TiketDibeli(_id, msg.sender, msg.value);
        emit StatusUpdated(_id, Status.ISSUED, msg.sender);
    }

    // ==================================================
    // 3A. MENDAFTARKAN TIKET UNTUK RESALE (LISTING)
    // ==================================================
    function daftarkanResale(uint256 _id, uint256 _hargaResale) external {
        Tiket storage item = daftarTiket[_id];

        if (item.id == 0) revert TiketTidakAda(_id);
        if (item.currentOwner != msg.sender) revert BukanPemilikTiket();
        if (!isRegisteredSeller[msg.sender]) revert BelumTerdaftarPenjual();
        if (item.status == Status.USED) revert TiketSudahTerpakai(_id);
        if (_hargaResale == 0 || _hargaResale > item.batasHargaResale) {
            revert MelebihiBatasResale(_hargaResale, item.batasHargaResale);
        }

        item.hargaResale = _hargaResale;
        item.isForSale = true;

        _catatRiwayat(_id, "TICKET_LISTED_FOR_RESALE", msg.sender, _hargaResale);
        emit TiketResaleDidaftarkan(_id, _hargaResale);
    }

    // ==================================================
    // 3B. MEMBELI TIKET RESALE & TRANSFER NFT 
    // ==================================================
    function beliResale(uint256 _id) external payable {
        Tiket storage item = daftarTiket[_id];

        if (item.id == 0) revert TiketTidakAda(_id);
        if (!item.isForSale) revert TiketTidakDijual();
        if (item.currentOwner == msg.sender) revert BeliKeDiriSendiri();
        if (item.status == Status.USED) revert TiketSudahTerpakai(_id);
        if (msg.value != item.hargaResale) revert NominalTidakSesuai(msg.value, item.hargaResale);

        // Hitung Royalti Promotor (10%) dan Dana Penjual (90%)
        uint256 royalti = (msg.value * 10) / 100;
        uint256 danaPenjual = msg.value - royalti;

        address penjualLama = item.currentOwner;

        // Transfer Royalti ke Promotor
        (bool successPromotor, ) = payable(owner).call{value: royalti}("");
        require(successPromotor, "Transfer royalti gagal");

        // Transfer Sisa Dana ke Penjual
        (bool successPenjual, ) = payable(penjualLama).call{value: danaPenjual}("");
        require(successPenjual, "Transfer penjual gagal");

        // Transfer Kepemilikan NFT ERC-721 dari Penjual ke Pembeli Baru
        _transfer(penjualLama, msg.sender, _id);

        // Pembaruan State
        item.currentOwner = msg.sender;
        item.isForSale = false;
        item.hargaResale = 0;
        item.status = Status.RESOLD;

        _catatRiwayat(_id, "RESALE_PURCHASED", msg.sender, msg.value);
        emit TiketResaleDibeli(_id, penjualLama, msg.sender, msg.value);
        emit StatusUpdated(_id, Status.RESOLD, msg.sender);
    }

    // ==================================================
    // 4. VERIFIKASI MASUK VENUE (CHECK-IN AT GATE)
    // ==================================================
    function checkInTiket(uint256 _id) external onlyVendorOrOwner {
        Tiket storage item = daftarTiket[_id];

        if (item.id == 0) revert TiketTidakAda(_id);
        if (item.status == Status.MINTED) revert TiketBelumDibeliUtama();
        if (item.status == Status.USED) revert TiketSudahTerpakai(_id);

        item.isForSale = false;
        item.status = Status.USED;

        _catatRiwayat(_id, "TICKET_CHECKIN", msg.sender, 0);
        emit StatusUpdated(_id, Status.USED, msg.sender);
    }

    // ==================================================
    // 5. FUNGSI CEK PEMILIK NFT 
    // ==================================================
    function getOwner(uint256 tokenId) public view returns (address) {
        require(_ownerOf(tokenId) != address(0), "NFT tidak ditemukan");
        return ownerOf(tokenId);
    }

    // ==================================================
    // 6. MELIHAT DATA TIKET
    // ==================================================
    function getTiket(uint256 _id) external view returns (
        string memory namaKonser,
        uint256 hargaUtama,
        uint256 batasHargaResale,
        uint256 hargaResale,
        bool isForSale,
        address currentOwner,
        Status status
    ) {
        Tiket memory item = daftarTiket[_id];
        if (item.id == 0) revert TiketTidakAda(_id);

        return (
            item.namaKonser,
            item.hargaUtama,
            item.batasHargaResale,
            item.hargaResale,
            item.isForSale,
            item.currentOwner,
            item.status
        );
    }

    // ==================================================
    // 7. MELIHAT RIWAYAT TIKET
    // ==================================================
    function getHistory(uint256 _id) external view returns (Riwayat[] memory) {
        if (daftarTiket[_id].id == 0) revert TiketTidakAda(_id);
        return riwayatTiket[_id];
    }
}