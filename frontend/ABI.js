const DEFAULT_CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const RPC_URL = "http://127.0.0.1:8545";

const CONTRACT_ABI = [
    // VIEW / READ FUNCTIONS
    {
        "inputs": [],
        "name": "owner",
        "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "vendorResmi",
        "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
        "name": "isRegisteredSeller",
        "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
        "name": "getTiket",
        "outputs": [
            { "internalType": "string", "name": "namaKonser", "type": "string" },
            { "internalType": "uint256", "name": "hargaUtama", "type": "uint256" },
            { "internalType": "uint256", "name": "batasResale", "type": "uint256" },
            { "internalType": "uint256", "name": "hargaResale", "type": "uint256" },
            { "internalType": "bool", "name": "isForSale", "type": "bool" },
            { "internalType": "address", "name": "currentOwner", "type": "address" },
            { "internalType": "uint8", "name": "status", "type": "uint8" }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
        "name": "tokenURI",
        "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
        "name": "getHistory",
        "outputs": [
            {
                "components": [
                    { "internalType": "string", "name": "aksi", "type": "string" },
                    { "internalType": "address", "name": "aktor", "type": "address" },
                    { "internalType": "uint256", "name": "harga", "type": "uint256" },
                    { "internalType": "uint256", "name": "timestamp", "type": "uint256" }
                ],
                "internalType": "struct SupplyChainTiket.Riwayat[]",
                "name": "",
                "type": "tuple[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },

    // WRITE / TRANSACTION FUNCTIONS
    {
        "inputs": [
            { "internalType": "string", "name": "_namaKonser", "type": "string" },
            { "internalType": "uint256", "name": "_hargaUtama", "type": "uint256" },
            { "internalType": "uint256", "name": "_batasResale", "type": "uint256" },
            { "internalType": "string", "name": "_tokenURI", "type": "string" }
        ],
        "name": "buatTiket",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "uint256", "name": "_tokenId", "type": "uint256" }],
        "name": "beliTiketUtama",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "daftarSebagaiPenjual",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "uint256", "name": "_tokenId", "type": "uint256" },
            { "internalType": "uint256", "name": "_hargaResale", "type": "uint256" }
        ],
        "name": "daftarkanResale",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "uint256", "name": "_tokenId", "type": "uint256" }],
        "name": "beliResale",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "uint256", "name": "_tokenId", "type": "uint256" }],
        "name": "checkInTiket",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },

    // CUSTOM ERRORS
    { "inputs": [], "name": "HanyaOwner", "type": "error" },
    { "inputs": [], "name": "BukanValidatorResmi", "type": "error" },
    { "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }], "name": "TiketTidakAda", "type": "error" },
    { "inputs": [], "name": "DataTidakValid", "type": "error" },
    { "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }], "name": "TiketSudahTerjual", "type": "error" },
    { "inputs": [], "name": "TiketBelumDibeliUtama", "type": "error" },
    { "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }], "name": "TiketSudahTerpakai", "type": "error" },
    {
        "inputs": [
            { "internalType": "uint256", "name": "dibayar", "type": "uint256" },
            { "internalType": "uint256", "name": "seharusnya", "type": "uint256" }
        ],
        "name": "NominalTidakSesuai",
        "type": "error"
    },
    { "inputs": [], "name": "BukanPemilikPromotor", "type": "error" },
    { "inputs": [], "name": "BukanPemilikTiket", "type": "error" },
    { "inputs": [], "name": "SudahTerdaftarPenjual", "type": "error" },
    { "inputs": [], "name": "BelumTerdaftarPenjual", "type": "error" },
    { "inputs": [], "name": "TiketTidakDijual", "type": "error" },
    { "inputs": [], "name": "BeliKeDiriSendiri", "type": "error" },
    {
        "inputs": [
            { "internalType": "uint256", "name": "hargaResale", "type": "uint256" },
            { "internalType": "uint256", "name": "batasMaks", "type": "uint256" }
        ],
        "name": "MelebihiBatasResale",
        "type": "error"
    }
];