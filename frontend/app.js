// ==============================================================================
// 1. STATE GLOBAL & KONSTANTA
// ==============================================================================
const STATUS_LABELS = {
    0: "MINTED",
    1: "ISSUED",
    2: "RESOLD",
    3: "USED"
};

const STATUS_DESC = {
    0: "MINTED (Pasar Utama)",
    1: "ISSUED (Milik Pembeli Utama)",
    2: "RESOLD (Hasil Pasar Sekunder)",
    3: "USED (Sudah Check-In)"
};

const state = {
    activePage: "Dashboard",
    sekunderMode: "jual",
    verifMode: "checkin",
    preselectEvent: null,
    preselectResaleTicket: null,

    // Blockchain & Wallet
    contractAddress: DEFAULT_CONTRACT_ADDRESS,
    readProvider: null,
    readContract: null,
    hardhatAccounts: [],
    activeWallet: "",
    useMetaMask: false,
    metaMaskSigner: null,
    contractOwner: "",
    vendorResmi: "",
    blockNumber: 0,
    chainId: 31337,

    // Data On-Chain
    allTickets: [],
    allHistory: [],

    // Filter state
    eventSearch: "",
    eventCat: "Kategori (Semua)",
    eventDate: "Tanggal (Semua)",
    eventSort: "Urutkan: Terbaru",
    myTiketFilter: "Semua Tiket",
    auditTicketId: 1,
    checkinSelectedId: null,
    tpSelectedKey: null,
    secSellSelectedId: null,
    secBuySelectedId: null,
};

// ==============================================================================
// 2. HELPER UTILITIES
// ==============================================================================
function shortAddr(addr) {
    if (!addr || addr.length < 12) return addr || "-";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function parseMetadataURI(rawUri) {
    const def = {
        kategori: "Concert",
        tanggal: "Jadwal Terkonfirmasi",
        jam: "19:00 WIB",
        lokasi: "Venue Resmi Konser",
        base_uri: rawUri || "ipfs://QmTikeKonser2026"
    };
    if (!rawUri) return def;
    try {
        let cleaned = rawUri.trim();
        if (cleaned.startsWith("data:application/json;utf8,")) {
            cleaned = cleaned.slice("data:application/json;utf8,".length);
        } else if (cleaned.startsWith("data:application/json,")) {
            cleaned = decodeURIComponent(cleaned.slice("data:application/json,".length));
        }
        if (cleaned.startsWith("{")) {
            const p = JSON.parse(cleaned);
            return {
                kategori: p.kategori || def.kategori,
                tanggal: p.tanggal || def.tanggal,
                jam: p.jam || def.jam,
                lokasi: p.lokasi || def.lokasi,
                base_uri: p.base_uri || def.base_uri,
            };
        }
    } catch (_) { }
    return def;
}

function buildMetadataURI(kategori, tanggalStr, jamStr, lokasi, baseUri) {
    return "data:application/json;utf8," + JSON.stringify({
        kategori,
        tanggal: tanggalStr,
        jam: jamStr,
        lokasi,
        base_uri: baseUri
    });
}

function formatDateID(isoDateStr) {
    if (!isoDateStr) return "12 Dec 2026";
    const d = new Date(isoDateStr + "T00:00:00");
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatRelativeTime(ts) {
    if (!ts) return "-";
    const diff = Math.floor(Date.now() / 1000) - Number(ts);
    if (diff < 60) return "baru saja";
    if (diff < 3600) return `${Math.floor(diff / 60)}m lalu`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}j lalu`;
    return `${Math.floor(diff / 86400)}h lalu`;
}

function formatTimestampFull(ts) {
    const d = new Date(Number(ts) * 1000);
    return d.toLocaleString("id-ID", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
}

function showToast(message, type = "info") {
    const box = document.getElementById("toast-container");
    const el = document.createElement("div");
    el.className = `toast-item ${type}`;
    el.innerHTML = message;
    box.appendChild(el);
    setTimeout(() => {
        el.style.opacity = "0";
        el.style.transition = "opacity 0.25s ease";
        setTimeout(() => el.remove(), 260);
    }, 4200);
}

const CUSTOM_ERROR_MAP = {
    HanyaOwner: "Akses ditolak: Hanya Promotor (Owner kontrak) yang berhak menjalankan aksi ini.",
    BukanValidatorResmi: "Akses ditolak: Hanya Promotor atau Vendor Gate resmi yang berwenang melakukan Check-In.",
    TiketTidakAda: "Tiket dengan ID tersebut tidak ditemukan di blockchain.",
    DataTidakValid: "Data tidak valid: Harga utama harus > 0 dan batas maksimum resale >= harga utama.",
    TiketSudahTerjual: "Tiket ini sudah terjual di pasar utama.",
    TiketBelumDibeliUtama: "Tiket belum dibeli di pasar utama (masih MINTED), tidak dapat Check-In.",
    TiketSudahTerpakai: "Tiket ini sudah digunakan untuk Check-In (status USED).",
    NominalTidakSesuai: "Nominal ETH yang dikirim tidak sesuai dengan harga tiket.",
    BukanPemilikPromotor: "Tiket ini sudah bukan milik Promotor.",
    BukanPemilikTiket: "Wallet aktif bukan pemilik sah dari tiket ini.",
    SudahTerdaftarPenjual: "Alamat wallet ini sudah terdaftar sebagai penjual resmi.",
    BelumTerdaftarPenjual: "Wallet belum terdaftar sebagai penjual resmi. Silakan daftar terlebih dahulu.",
    TiketTidakDijual: "Tiket ini sedang tidak dijual di pasar sekunder.",
    BeliKeDiriSendiri: "Anda tidak dapat membeli tiket yang sedang Anda jual sendiri.",
    MelebihiBatasResale: "Harga resale melebihi batas maksimum yang ditetapkan Promotor (Anti-Scalping)."
};

function formatContractError(err) {
    try {
        const data = err?.data || err?.info?.error?.data || err?.error?.data;
        if (data && state.readContract) {
            const decoded = state.readContract.interface.parseError(data);
            if (decoded && CUSTOM_ERROR_MAP[decoded.name]) {
                return CUSTOM_ERROR_MAP[decoded.name];
            }
        }
    } catch (_) { }

    const rawMsg = err?.reason || err?.shortMessage || err?.message || String(err);
    for (const [errName, friendly] of Object.entries(CUSTOM_ERROR_MAP)) {
        if (rawMsg.includes(errName)) return friendly;
    }
    return rawMsg;
}

// ==============================================================================
// 3. BLOCKCHAIN CONNECTION & SYNC
// ==============================================================================
async function resolveContractAddress() {
    try {
        const res = await fetch("./deployment.json", { cache: "no-store" });
        if (res.ok) {
            const data = await res.json();
            if (data.address) {
                state.contractAddress = ethers.getAddress(data.address);
            }
        }
    } catch (_) {
        state.contractAddress = ethers.getAddress(DEFAULT_CONTRACT_ADDRESS);
    }
}

async function initBlockchain() {
    await resolveContractAddress();
    document.getElementById("sb-contract-addr").textContent = shortAddr(state.contractAddress);

    try {
        state.readProvider = new ethers.JsonRpcProvider(RPC_URL);
        const net = await state.readProvider.getNetwork();
        state.chainId = Number(net.chainId);
        state.blockNumber = await state.readProvider.getBlockNumber();

        const rawAccounts = await state.readProvider.send("eth_accounts", []);
        state.hardhatAccounts = rawAccounts.map((a) => ethers.getAddress(a));

        state.readContract = new ethers.Contract(state.contractAddress, CONTRACT_ABI, state.readProvider);

        try {
            state.contractOwner = ethers.getAddress(await state.readContract.owner());
        } catch (_) { }
        try {
            state.vendorResmi = ethers.getAddress(await state.readContract.vendorResmi());
        } catch (_) { }

        if (!state.activeWallet && state.hardhatAccounts.length > 0) {
            state.activeWallet = state.hardhatAccounts[0];
        }

        document.getElementById("global-alert-box").classList.add("hidden");
        await refreshAllData();
    } catch (err) {
        const alertBox = document.getElementById("global-alert-box");
        alertBox.className = "alert-box alert-danger";
        alertBox.innerHTML = `
            <strong>❌ Tidak dapat terhubung ke Hardhat Network (${RPC_URL})</strong><br/>
            Pastikan terminal <code>npx hardhat node</code> dan deploy kontrak sudah dijalankan, lalu refresh halaman ini.
        `;
        document.getElementById("sb-conn-status").className = "sb-conn-err";
        document.getElementById("sb-conn-status").textContent = "● Terputus";
        document.getElementById("sb-rpc-label").textContent = "⚡ Node RPC: Offline";
        document.getElementById("sb-rpc-dot").classList.add("offline");
    }
}

async function refreshAllData() {
    if (!state.readContract) return;

    state.blockNumber = await state.readProvider.getBlockNumber();
    const tickets = [];
    const history = [];

    let tokenId = 1;
    while (true) {
        try {
            const data = await state.readContract.getTiket(tokenId);
            let rawUri = "";
            try {
                rawUri = await state.readContract.tokenURI(tokenId);
            } catch (_) { }
            const meta = parseMetadataURI(rawUri);

            let hist = [];
            try {
                hist = await state.readContract.getHistory(tokenId);
            } catch (_) { }

            for (const h of hist) {
                history.push({
                    token_id: tokenId,
                    nama_konser: data[0],
                    aksi: h[0],
                    aktor: ethers.getAddress(h[1]),
                    harga_eth: Number(ethers.formatEther(h[2])),
                    timestamp: Number(h[3]),
                });
            }

            tickets.push({
                id: tokenId,
                nama_konser: data[0],
                harga_utama_wei: data[1],
                harga_utama: Number(ethers.formatEther(data[1])),
                batas_resale_wei: data[2],
                batas_resale: Number(ethers.formatEther(data[2])),
                harga_resale_wei: data[3],
                harga_resale: Number(ethers.formatEther(data[3])),
                is_for_sale: Boolean(data[4]),
                current_owner: ethers.getAddress(data[5]),
                status: Number(data[6]),
                kategori: meta.kategori,
                tanggal: meta.tanggal,
                jam: meta.jam,
                lokasi: meta.lokasi,
                base_uri: meta.base_uri,
                raw_uri: rawUri,
                history: hist,
            });
            tokenId++;
        } catch (_) {
            break;
        }
    }

    history.sort((a, b) => b.timestamp - a.timestamp);
    state.allTickets = tickets;
    state.allHistory = history;

    await renderSidebar();
    await renderActivePage();
}

async function getActiveSigner() {
    if (state.useMetaMask && state.metaMaskSigner) {
        return state.metaMaskSigner;
    }
    return await state.readProvider.getSigner(state.activeWallet);
}

async function executeContractTx(methodName, args = [], valueWei = 0n) {
    const signer = await getActiveSigner();
    const writeContract = new ethers.Contract(state.contractAddress, CONTRACT_ABI, signer);
    const overrides = valueWei > 0n ? { value: valueWei } : {};
    const tx = await writeContract[methodName](...args, overrides);
    const receipt = await tx.wait();
    if (receipt.status !== 1) {
        throw new Error("Transaksi gagal dieksekusi di EVM (status 0).");
    }
    return tx.hash;
}

// ==============================================================================
// 4. SIDEBAR & PILL NAVBAR LOGIC
// ==============================================================================
async function renderSidebar() {
    const selectEl = document.getElementById("sidebar-account-select");
    if (state.useMetaMask && state.activeWallet) {
        selectEl.innerHTML = `<option value="${state.activeWallet}">MetaMask (${shortAddr(state.activeWallet)})</option>`;
        document.getElementById("wallet-mode-pill").textContent = "MetaMask";
    } else {
        selectEl.innerHTML = state.hardhatAccounts.map((addr, idx) => {
            let roleTag = "";
            if (addr === state.contractOwner) roleTag = " [Promotor]";
            else if (addr === state.vendorResmi) roleTag = " [Vendor Gate]";
            const selected = addr === state.activeWallet ? "selected" : "";
            return `<option value="${addr}" ${selected}>Account ${idx + 1} (${shortAddr(addr)})${roleTag}</option>`;
        }).join("");
        document.getElementById("wallet-mode-pill").textContent = "Hardhat";
    }

    let balEth = 0;
    try {
        if (state.activeWallet) {
            const balWei = await state.readProvider.getBalance(state.activeWallet);
            balEth = Number(ethers.formatEther(balWei));
        }
    } catch (_) { }

    const ownedCount = state.allTickets.filter((t) => t.current_owner === state.activeWallet).length;
    const ownedBadge = document.getElementById("sb-owned-badge");
    if (ownedCount > 0) {
        ownedBadge.className = "sb-owned-badge has";
        ownedBadge.textContent = `Memiliki Tiket: Ya (${ownedCount} Tiket)`;
    } else {
        ownedBadge.className = "sb-owned-badge none";
        ownedBadge.textContent = "Memiliki Tiket: Tidak (0 Tiket)";
    }

    document.getElementById("sb-conn-status").className = "sb-conn-ok";
    document.getElementById("sb-conn-status").textContent = "● Terhubung";
    document.getElementById("sb-balance-eth").textContent = `${balEth.toFixed(2)} ETH`;
    document.getElementById("sb-short-addr").textContent = shortAddr(state.activeWallet);
    document.getElementById("sb-rpc-label").textContent = "⚡ Node RPC: Terhubung";
    document.getElementById("sb-rpc-dot").classList.remove("offline");
    document.getElementById("sb-block-num").textContent = state.blockNumber;
    document.getElementById("sb-chain-id").textContent = state.chainId;

    const actContainer = document.getElementById("sb-recent-activity");
    const actionLabelMap = {
        TICKET_MINTED: "Mint Tiket",
        PRIMARY_PURCHASED: "Beli Tiket",
        TICKET_LISTED_FOR_RESALE: "Listing Resale",
        RESALE_PURCHASED: "Beli Resale",
        TICKET_CHECKIN: "Check-In"
    };

    if (state.allHistory.length === 0) {
        actContainer.innerHTML = `<div class="sb-empty-text">Belum ada aktivitas transaksi.</div>`;
    } else {
        actContainer.innerHTML = state.allHistory.slice(0, 4).map((item) => {
            const lbl = actionLabelMap[item.aksi] || item.aksi;
            const rel = formatRelativeTime(item.timestamp);
            return `
                <div class="sb-activity-row">
                    <span class="sb-activity-act">${escapeHtml(lbl)} #${item.token_id}</span>
                    <span class="sb-activity-time">• ${rel}</span>
                </div>
            `;
        }).join("");
    }
}

function navigateTo(pageName) {
    state.activePage = pageName;
    document.querySelectorAll(".stx-nav-item").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.page === pageName);
    });
    renderActivePage();
}

function setupNavbarAndSidebarEvents() {
    const navEl = document.getElementById("securetix-pill-nav");
    const logoBtn = document.getElementById("stx-logo-toggle");
    const sidebar = document.getElementById("app-sidebar");
    const mainEl = document.getElementById("app-main");
    const reopenBtn = document.getElementById("sidebar-reopen-btn");
    const collapseBtn = document.getElementById("sidebar-collapse-btn");

    // Toggle Pill Navbar
    logoBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        navEl.classList.toggle("collapsed");
    });

    navEl.addEventListener("click", (e) => {
        if (navEl.classList.contains("collapsed")) {
            e.stopPropagation();
            navEl.classList.remove("collapsed");
        }
    });

    // Auto-collapse pill navbar saat klik luar atau scroll
    document.addEventListener("pointerdown", (e) => {
        if (!navEl.classList.contains("collapsed") && !navEl.contains(e.target)) {
            navEl.classList.add("collapsed");
        }
    });

    window.addEventListener("scroll", () => {
        if (!navEl.classList.contains("collapsed")) {
            navEl.classList.add("collapsed");
        }
    }, { passive: true });

    // Navigasi menu
    document.querySelectorAll(".stx-nav-item").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            navigateTo(btn.dataset.page);
        });
    });

    // Sidebar collapse / reopen
    collapseBtn.addEventListener("click", () => {
        sidebar.classList.add("collapsed");
        mainEl.classList.add("sidebar-closed");
        document.body.classList.add("sidebar-collapsed");
        reopenBtn.classList.remove("hidden");
    });

    reopenBtn.addEventListener("click", () => {
        sidebar.classList.remove("collapsed");
        mainEl.classList.remove("sidebar-closed");
        document.body.classList.remove("sidebar-collapsed");
        reopenBtn.classList.add("hidden");
    });

    // Ganti akun di sidebar
    document.getElementById("sidebar-account-select").addEventListener("change", async (e) => {
        state.useMetaMask = false;
        state.metaMaskSigner = null;
        state.activeWallet = ethers.getAddress(e.target.value);
        await renderSidebar();
        await renderActivePage();
    });

    // Connect MetaMask
    document.getElementById("btn-connect-metamask").addEventListener("click", async () => {
        const statEl = document.getElementById("mm-status-text");
        if (!window.ethereum) {
            statEl.textContent = "Ekstensi MetaMask tidak ditemukan.";
            return;
        }
        try {
            const browserProvider = new ethers.BrowserProvider(window.ethereum);
            const accounts = await browserProvider.send("eth_requestAccounts", []);
            state.metaMaskSigner = await browserProvider.getSigner();
            state.activeWallet = ethers.getAddress(accounts[0]);
            state.useMetaMask = true;
            statEl.textContent = `✅ Terhubung: ${shortAddr(state.activeWallet)}`;
            await renderSidebar();
            await renderActivePage();
            showToast(`Terhubung ke MetaMask (${shortAddr(state.activeWallet)})`, "success");
        } catch (err) {
            statEl.textContent = `Gagal: ${err.message}`;
        }
    });

    // Modal close events
    document.getElementById("modal-close-btn").addEventListener("click", closeDetailModal);
    document.getElementById("detail-modal-backdrop").addEventListener("click", (e) => {
        if (e.target.id === "detail-modal-backdrop") closeDetailModal();
    });
}

// ==============================================================================
// 5. KOMPONEN KARTU TIKET (TICKET STUB) & MODAL DETAIL
// ==============================================================================
function buildTicketStubHTML({
    serialText,
    kategori,
    namaKonser,
    tanggal,
    jam,
    lokasi,
    hargaUtama,
    batasResale,
    footerInfoHtml,
    topRightBadgeHtml = '<span class="ticket-verified" title="Terverifikasi Smart Contract">✓</span>',
    detailBtnAttr = ""
}) {
    const detailButtonHtml = detailBtnAttr
        ? `<button type="button" class="btn-ticket-detail" ${detailBtnAttr}>Lihat Detail</button>`
        : "";

    return `
    <div class="ticket-stub">
        <div class="ticket-left">
            <div>
                <div class="ticket-top-row">
                    <span class="ticket-category">${escapeHtml(kategori)}</span>
                    ${topRightBadgeHtml}
                </div>
                <div class="ticket-title">${escapeHtml(namaKonser)}</div>
                <div class="ticket-meta">📅 ${escapeHtml(tanggal)} &bull; ${escapeHtml(jam)}</div>
                <div class="ticket-meta">📍 ${escapeHtml(lokasi)}</div>
            </div>
            <div>
                <div class="ticket-price-row">
                    <span class="ticket-price">${Number(hargaUtama).toFixed(2)} ETH</span>
                    <span class="ticket-resale-pill">Maks Resale: ${Number(batasResale).toFixed(2)} ETH</span>
                </div>
                <div class="ticket-bottom-row">
                    <div class="ticket-stock">${footerInfoHtml}</div>
                    ${detailButtonHtml}
                </div>
            </div>
        </div>
        <div class="ticket-perf-col">
            <div class="barcode-bars"></div>
            <div class="barcode-serial">${escapeHtml(serialText)}</div>
        </div>
    </div>
    `;
}

function openDetailModal(payload) {
    const backdrop = document.getElementById("detail-modal-backdrop");
    const body = document.getElementById("modal-body");

    if (payload.mode === "event") {
        const ev = payload.event;
        const stubHtml = buildTicketStubHTML({
            serialText: `EVT-${String(ev.sample_id).padStart(3, "0")}`,
            kategori: ev.kategori,
            namaKonser: ev.nama_konser,
            tanggal: ev.tanggal,
            jam: ev.jam,
            lokasi: ev.lokasi,
            hargaUtama: ev.harga_utama,
            batasResale: ev.batas_resale,
            footerInfoHtml: `${ev.available_primary}/${ev.total_minted} Tersedia (Pasar Utama) &bull; ${ev.available_resale} di Pasar Sekunder`
        });

        body.innerHTML = `
            ${stubHtml}
            <div class="grid-2" style="margin-top:1rem;">
                <div class="stx-card" style="margin-bottom:0;">
                    <div class="stx-card-title">Informasi Acara & Venue</div>
                    <p style="font-size:0.86rem; color:#CBD5E1; margin-bottom:6px;"><strong>Nama Konser:</strong> ${escapeHtml(ev.nama_konser)}</p>
                    <p style="font-size:0.86rem; color:#CBD5E1; margin-bottom:6px;"><strong>Kategori:</strong> ${escapeHtml(ev.kategori)}</p>
                    <p style="font-size:0.86rem; color:#CBD5E1; margin-bottom:6px;"><strong>Tanggal & Jam:</strong> ${escapeHtml(ev.tanggal)} &bull; ${escapeHtml(ev.jam)}</p>
                    <p style="font-size:0.86rem; color:#CBD5E1; margin-bottom:0;"><strong>Lokasi Lengkap:</strong> ${escapeHtml(ev.lokasi)}</p>
                </div>
                <div class="stx-card" style="margin-bottom:0;">
                    <div class="stx-card-title">Ketentuan Harga & Pemilik Awal</div>
                    <p style="font-size:0.86rem; color:#CBD5E1; margin-bottom:6px;"><strong>Harga Utama:</strong> <span style="color:#38BDF8; font-weight:700;">${ev.harga_utama.toFixed(4)} ETH</span></p>
                    <p style="font-size:0.86rem; color:#CBD5E1; margin-bottom:6px;"><strong>Batas Maksimal Resale:</strong> ${ev.batas_resale.toFixed(4)} ETH</p>
                    <p style="font-size:0.86rem; color:#CBD5E1; margin-bottom:6px;"><strong>Kuota Tersedia:</strong> ${ev.available_primary} dari ${ev.total_minted} Tiket</p>
                    <p style="font-size:0.82rem; color:#94A3B8; margin-bottom:0; word-break:break-all;"><strong>Promotor Penerbit:</strong> <code>${state.contractOwner}</code></p>
                </div>
            </div>
            <div class="grid-2" style="margin-top:1rem;">
                ${ev.available_primary > 0 ? `<button type="button" id="modal-go-primary" class="btn-primary btn-full">🎟️ Beli Tiket Utama Sekarang</button>` : `<div></div>`}
                ${ev.available_resale > 0 ? `<button type="button" id="modal-go-secondary" class="btn-secondary btn-full">🔄 Lihat Penawaran Pasar Sekunder</button>` : `<div></div>`}
            </div>
        `;

        const btnPri = document.getElementById("modal-go-primary");
        if (btnPri) {
            btnPri.addEventListener("click", () => {
                state.preselectEvent = ev.nama_konser;
                closeDetailModal();
                navigateTo("Ticket Purchase");
            });
        }
        const btnSec = document.getElementById("modal-go-secondary");
        if (btnSec) {
            btnSec.addEventListener("click", () => {
                state.sekunderMode = "beli";
                closeDetailModal();
                navigateTo("Sekunder Tiket");
            });
        }
    } else {
        const t = payload.ticket;
        const statusTxt = STATUS_DESC[t.status] || "Unknown";
        const ownerTag = t.current_owner === state.activeWallet
            ? "Anda (Wallet Aktif)"
            : (t.current_owner === state.contractOwner ? "Promotor Utama" : "Pemegang Sah");
        const resaleTxt = t.is_for_sale ? `${t.harga_resale.toFixed(4)} ETH (Sedang Dijual)` : "Tidak Sedang Dijual";

        const stubHtml = buildTicketStubHTML({
            serialText: `ID #${String(t.id).padStart(3, "0")}`,
            kategori: t.kategori,
            namaKonser: t.nama_konser,
            tanggal: t.tanggal,
            jam: t.jam,
            lokasi: t.lokasi,
            hargaUtama: t.harga_utama,
            batasResale: t.batas_resale,
            footerInfoHtml: `Status: ${statusTxt}`
        });

        const histRows = t.history && t.history.length
            ? t.history.map((h) => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-bottom:1px solid #1E293B; font-size:0.82rem;">
                    <div>
                        <span class="badge-cyan">${escapeHtml(h[0])}</span>
                        <span style="color:#CBD5E1; margin-left:8px; font-family:'JetBrains Mono',monospace;">${shortAddr(h[1])}</span>
                    </div>
                    <div style="color:#94A3B8;">
                        <strong style="color:#F8FAFC;">${Number(ethers.formatEther(h[2])).toFixed(4)} ETH</strong> &bull; ${formatTimestampFull(h[3])}
                    </div>
                </div>
            `).join("")
            : `<div class="sb-empty-text">Belum ada catatan riwayat.</div>`;

        const canSell = t.current_owner === state.activeWallet && (t.status === 1 || t.status === 2) && !t.is_for_sale;

        body.innerHTML = `
            ${stubHtml}
            <div class="grid-2" style="margin-top:1rem;">
                <div class="stx-card">
                    <div class="stx-card-title">Profil & Jadwal Tiket #${String(t.id).padStart(3, "0")}</div>
                    <p style="font-size:0.86rem; color:#CBD5E1; margin-bottom:6px;"><strong>Token ID NFT:</strong> #${t.id}</p>
                    <p style="font-size:0.86rem; color:#CBD5E1; margin-bottom:6px;"><strong>Nama Konser:</strong> ${escapeHtml(t.nama_konser)}</p>
                    <p style="font-size:0.86rem; color:#CBD5E1; margin-bottom:6px;"><strong>Tanggal & Jam:</strong> ${escapeHtml(t.tanggal)} &bull; ${escapeHtml(t.jam)}</p>
                    <p style="font-size:0.86rem; color:#CBD5E1; margin-bottom:6px;"><strong>Lokasi Lengkap:</strong> ${escapeHtml(t.lokasi)}</p>
                    <p style="font-size:0.8rem; color:#94A3B8; margin-bottom:0; word-break:break-all;"><strong>Referensi URI:</strong> <code>${escapeHtml(t.base_uri)}</code></p>
                </div>
                <div class="stx-card">
                    <div class="stx-card-title">Harga & Kepemilikan On-Chain</div>
                    <p style="font-size:0.86rem; color:#CBD5E1; margin-bottom:6px;"><strong>Harga Utama:</strong> ${t.harga_utama.toFixed(4)} ETH</p>
                    <p style="font-size:0.86rem; color:#CBD5E1; margin-bottom:6px;"><strong>Batas Maksimal Resale:</strong> ${t.batas_resale.toFixed(4)} ETH</p>
                    <p style="font-size:0.86rem; color:#CBD5E1; margin-bottom:6px;"><strong>Status Pasar Sekunder:</strong> <span style="color:#38BDF8;">${resaleTxt}</span></p>
                    <p style="font-size:0.86rem; color:#CBD5E1; margin-bottom:4px;"><strong>Status Pemilik:</strong> <span class="badge-cyan">${ownerTag}</span></p>
                    <p style="font-size:0.78rem; color:#94A3B8; margin-bottom:0; word-break:break-all;"><strong>Alamat Pemilik:</strong> <code>${t.current_owner}</code></p>
                </div>
            </div>
            <div class="stx-card">
                <div class="stx-card-title">📜 Riwayat Provenance & Audit Blockchain</div>
                ${histRows}
            </div>
            ${canSell ? `<button type="button" id="modal-sell-ticket" class="btn-primary btn-full">📤 Jual Tiket Ini di Pasar Sekunder</button>` : ""}
        `;

        const btnSell = document.getElementById("modal-sell-ticket");
        if (btnSell) {
            btnSell.addEventListener("click", () => {
                state.sekunderMode = "jual";
                state.preselectResaleTicket = t.id;
                closeDetailModal();
                navigateTo("Sekunder Tiket");
            });
        }
    }

    backdrop.classList.remove("hidden");
}

function closeDetailModal() {
    document.getElementById("detail-modal-backdrop").classList.add("hidden");
}

// ==============================================================================
// 6. RENDER HALAMAN (7 HALAMAN LENGKAP)
// ==============================================================================
async function renderActivePage() {
    const container = document.getElementById("page-content");
    switch (state.activePage) {
        case "Dashboard":
            await renderDashboard(container);
            break;
        case "Event List":
            renderEventList(container);
            break;
        case "Mint Tiket":
            renderMintTiket(container);
            break;
        case "Ticket Purchase":
            renderTicketPurchase(container);
            break;
        case "Sekunder Tiket":
            await renderSekunderTiket(container);
            break;
        case "My Tiket":
            renderMyTiket(container);
            break;
        case "Verification":
            renderVerification(container);
            break;
    }
}

// ------------------------------------------------------------------------------
// HALAMAN 1: DASHBOARD
// ------------------------------------------------------------------------------
async function renderDashboard(container) {
    const totalMinted = state.allTickets.length;
    const primaryAvail = state.allTickets.filter((t) => t.status === 0).length;
    const secondaryAvail = state.allTickets.filter((t) => t.is_for_sale && t.status !== 3).length;
    const checkedInTotal = state.allTickets.filter((t) => t.status === 3).length;

    const denom = Math.max(totalMinted, 1);
    const statusList = [
        ["MINTED (Pasar Utama)", state.allTickets.filter((t) => t.status === 0).length],
        ["ISSUED (Pembeli Utama)", state.allTickets.filter((t) => t.status === 1).length],
        ["RESOLD (Pasar Sekunder)", state.allTickets.filter((t) => t.status === 2).length],
        ["USED (Sudah Check-In)", checkedInTotal],
    ];

    const barsHtml = statusList.map(([label, cnt]) => {
        const pct = Math.round((cnt / denom) * 100);
        return `
            <div class="progress-row">
                <div class="progress-head">
                    <span style="color:#CBD5E1; font-weight:500;">${label}</span>
                    <span style="color:#38BDF8; font-weight:700;">${cnt} tiket (${pct}%)</span>
                </div>
                <div class="progress-track">
                    <div class="progress-fill" style="width:${pct}%;"></div>
                </div>
            </div>
        `;
    }).join("");

    const historyHtml = state.allHistory.length
        ? state.allHistory.slice(0, 6).map((item) => {
            const d = new Date(item.timestamp * 1000).toLocaleTimeString("id-ID");
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #1E293B; font-size:0.82rem;">
                    <div>
                        <span class="badge-cyan">${escapeHtml(item.aksi)}</span>
                        <strong style="color:#F8FAFC; margin-left:8px;">#${String(item.token_id).padStart(3, "0")}</strong>
                        <span style="color:#94A3B8; margin-left:6px;">${escapeHtml(item.nama_konser)}</span>
                    </div>
                    <div style="text-align:right;">
                        <span style="color:#38BDF8; font-weight:600;">${item.harga_eth.toFixed(3)} ETH</span>
                        <span style="color:#64748B; font-size:0.74rem; margin-left:6px;">${d}</span>
                    </div>
                </div>
            `;
        }).join("")
        : `<div class="alert-box alert-info">Belum ada transaksi di blockchain. Silakan terbitkan tiket pertama melalui halaman <strong>Mint Tiket</strong>.</div>`;

    let isSeller = false;
    try {
        if (state.readContract && state.activeWallet) {
            isSeller = await state.readContract.isRegisteredSeller(state.activeWallet);
        }
    } catch (_) { }

    const roles = [];
    if (state.activeWallet === state.contractOwner) roles.push("Promotor Utama (Owner)");
    if (state.activeWallet === state.vendorResmi) roles.push("Vendor Venue (Petugas Check-In Gate)");
    if (isSeller) roles.push("Penjual Sekunder Terdaftar");
    if (roles.length === 0) roles.push("Penonton / Pembeli Umum");

    container.innerHTML = `
        <div class="page-title">Dashboard</div>
        <div class="page-subtitle">Ringkasan ekosistem Supply Chain Tiket Konser NFT pada jaringan Blockchain Lokal</div>

        <div class="grid-4" style="margin-bottom:1rem;">
            <div class="kpi-card">
                <div class="kpi-label">Total Tiket Di-Mint</div>
                <div class="kpi-value">${totalMinted}</div>
                <div class="kpi-sub">Total aset ERC-721 aktif</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Tersedia Pasar Utama</div>
                <div class="kpi-value">${primaryAvail}</div>
                <div class="kpi-sub">Siap dibeli dari Promotor</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Aktif Pasar Sekunder</div>
                <div class="kpi-value">${secondaryAvail}</div>
                <div class="kpi-sub">Terdaftar resale anti-scalping</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Sudah Check-In Venue</div>
                <div class="kpi-value">${checkedInTotal}</div>
                <div class="kpi-sub">Status terkunci (USED)</div>
            </div>
        </div>

        <div class="grid-dash">
            <div class="stx-card">
                <div class="stx-card-title">Distribusi Status Tiket On-Chain</div>
                ${barsHtml}
            </div>
            <div class="stx-card">
                <div class="stx-card-title">Aktivitas Smart Contract Terbaru</div>
                ${historyHtml}
            </div>
        </div>

        <div class="stx-banner">
            <div class="stx-banner-title">🛡️ STATUS PERAN WALLET AKTIF</div>
            <p class="stx-banner-text">
                Alamat aktif <code>${state.activeWallet}</code> terdeteksi memiliki peran: <strong>${roles.join(" &bull; ")}</strong>.
                Gunakan pemilih akun di sidebar kiri untuk berpindah peran saat melakukan simulasi transaksi lokal.
            </p>
        </div>
    `;
}

// ------------------------------------------------------------------------------
// HALAMAN 2: EVENT LIST
// ------------------------------------------------------------------------------
function renderEventList(container) {
    const eventsMap = new Map();
    for (const t of state.allTickets) {
        const key = `${t.nama_konser}|${t.harga_utama_wei}|${t.batas_resale_wei}|${t.tanggal}|${t.lokasi}`;
        if (!eventsMap.has(key)) {
            eventsMap.set(key, {
                sample_id: t.id,
                nama_konser: t.nama_konser,
                kategori: t.kategori,
                tanggal: t.tanggal,
                jam: t.jam,
                lokasi: t.lokasi,
                harga_utama: t.harga_utama,
                batas_resale: t.batas_resale,
                total_minted: 0,
                available_primary: 0,
                available_resale: 0,
            });
        }
        const ev = eventsMap.get(key);
        ev.total_minted += 1;
        if (t.status === 0 && t.current_owner === state.contractOwner) ev.available_primary += 1;
        if (t.is_for_sale && t.status !== 3) ev.available_resale += 1;
    }

    let eventList = Array.from(eventsMap.values());
    const uniqueDates = ["Tanggal (Semua)", ...Array.from(new Set(state.allTickets.map((t) => t.tanggal))).sort()];

    if (state.eventSearch) {
        const q = state.eventSearch.toLowerCase();
        eventList = eventList.filter((e) => e.nama_konser.toLowerCase().includes(q) || e.lokasi.toLowerCase().includes(q));
    }
    if (state.eventCat !== "Kategori (Semua)") {
        eventList = eventList.filter((e) => e.kategori === state.eventCat);
    }
    if (state.eventDate !== "Tanggal (Semua)") {
        eventList = eventList.filter((e) => e.tanggal === state.eventDate);
    }

    if (state.eventSort === "Harga Terendah") eventList.sort((a, b) => a.harga_utama - b.harga_utama);
    else if (state.eventSort === "Harga Tertinggi") eventList.sort((a, b) => b.harga_utama - a.harga_utama);
    else if (state.eventSort === "Kuota Terbanyak") eventList.sort((a, b) => b.available_primary - a.available_primary);
    else eventList.sort((a, b) => b.sample_id - a.sample_id);

    const cardsHtml = eventList.length === 0
        ? `
            <div class="stx-card" style="text-align:center; padding:2.2rem;">
                <div style="font-size:1.1rem; font-weight:700; color:#F8FAFC; margin-bottom:0.4rem;">Belum Ada Event Konser yang Sesuai</div>
                <div style="font-size:0.88rem; color:#94A3B8;">Promotor dapat menerbitkan tiket konser baru melalui menu <strong>Mint Tiket</strong>.</div>
            </div>
        `
        : `<div class="grid-2">${eventList.map((ev, idx) => {
            const secBadge = ev.available_resale > 0
                ? ` &bull; <span style="color:#FBBF24;">${ev.available_resale} di Pasar Sekunder</span>`
                : "";
            return buildTicketStubHTML({
                serialText: `ID ${String(ev.sample_id).padStart(3, "0")}S${ev.total_minted}`,
                kategori: ev.kategori,
                namaKonser: ev.nama_konser,
                tanggal: ev.tanggal,
                jam: ev.jam,
                lokasi: ev.lokasi,
                hargaUtama: ev.harga_utama,
                batasResale: ev.batas_resale,
                footerInfoHtml: `${ev.available_primary}/${ev.total_minted} Tersedia${secBadge}`,
                detailBtnAttr: `data-ev-idx="${idx}"`
            });
        }).join("")}</div>`;

    container.innerHTML = `
        <div class="page-title">Event List</div>
        <div class="page-subtitle">Jelajahi dan Dapatkan Tiket Resmi Terenkripsi Blockchain</div>

        <div class="filter-bar">
            <input type="text" id="ev-search-input" class="stx-input" placeholder="🔍 Cari konser atau lokasi..." value="${escapeHtml(state.eventSearch)}" />
            <select id="ev-cat-select" class="stx-select">
                ${["Kategori (Semua)", "Concert", "Festival"].map((c) => `<option value="${c}" ${state.eventCat === c ? "selected" : ""}>${c}</option>`).join("")}
            </select>
            <select id="ev-date-select" class="stx-select">
                ${uniqueDates.map((d) => `<option value="${escapeHtml(d)}" ${state.eventDate === d ? "selected" : ""}>${escapeHtml(d)}</option>`).join("")}
            </select>
            <select id="ev-sort-select" class="stx-select">
                ${["Urutkan: Terbaru", "Harga Terendah", "Harga Tertinggi", "Kuota Terbanyak"].map((s) => `<option value="${s}" ${state.eventSort === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
        </div>

        ${cardsHtml}
    `;

    document.getElementById("ev-search-input").addEventListener("input", (e) => {
        state.eventSearch = e.target.value;
        renderEventList(container);
        const inp = document.getElementById("ev-search-input");
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
    });
    document.getElementById("ev-cat-select").addEventListener("change", (e) => {
        state.eventCat = e.target.value;
        renderEventList(container);
    });
    document.getElementById("ev-date-select").addEventListener("change", (e) => {
        state.eventDate = e.target.value;
        renderEventList(container);
    });
    document.getElementById("ev-sort-select").addEventListener("change", (e) => {
        state.eventSort = e.target.value;
        renderEventList(container);
    });

    container.querySelectorAll("[data-ev-idx]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const ev = eventList[Number(btn.dataset.evIdx)];
            openDetailModal({ mode: "event", event: ev });
        });
    });
}

// ------------------------------------------------------------------------------
// HALAMAN 3: MINT TIKET (PROMOTOR)
// ------------------------------------------------------------------------------
function renderMintTiket(container) {
    const isOwner = state.activeWallet === state.contractOwner;

    container.innerHTML = `
        <div class="page-title">Mint Tiket</div>
        <div class="page-subtitle">Terbitkan tiket konser resmi baru sebagai aset NFT ke jaringan Blockchain</div>

        <div class="grid-mint">
            <div class="stx-card">
                <div class="stx-card-title">PENERBITAN TIKET KONSER BARU (SMART CONTRACT)</div>
                ${!isOwner ? `<div class="alert-box alert-warning">⚠️ Wallet aktif saat ini bukan Owner kontrak. Pilih <strong>Account 1 [Promotor]</strong> di Sidebar untuk melakukan Mint.</div>` : ""}

                <div class="form-group">
                    <label class="form-label">Nama Konser / Event</label>
                    <input type="text" id="mint-nama" class="stx-input" value="Coldplay World Tour Cirebon" />
                </div>

                <div class="grid-2">
                    <div class="form-group">
                        <label class="form-label">Kategori Acara</label>
                        <select id="mint-kat" class="stx-select">
                            <option value="Concert">Concert</option>
                            <option value="Festival">Festival</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Jam Mulai Acara</label>
                        <div class="input-icon-wrap">
                            <input type="time" id="mint-jam" class="stx-input" value="19:00" />
                            <button type="button" id="btn-pick-jam" class="input-picker-btn" title="Pilih Jam Mulai">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" stroke-linejoin="miter">
                                    <circle cx="12" cy="12" r="9"></circle>
                                    <polyline points="12 7 12 12 15 15"></polyline>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="grid-2">
                    <div class="form-group">
                        <label class="form-label">Tanggal Acara</label>
                        <div class="input-icon-wrap">
                            <input type="date" id="mint-tgl" class="stx-input" value="2026-12-12" />
                            <button type="button" id="btn-pick-tgl" class="input-picker-btn" title="Buka Kalender">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" stroke-linejoin="miter">
                                    <rect x="3" y="4" width="18" height="18"></rect>
                                    <line x1="16" y1="2" x2="16" y2="6"></line>
                                    <line x1="8" y1="2" x2="8" y2="6"></line>
                                    <line x1="3" y1="10" x2="21" y2="10"></line>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Jumlah Kuota Tiket (Mint Batch)</label>
                        <input type="number" id="mint-qty" class="stx-input" min="1" max="25" value="3" />
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Lokasi Lengkap Venue</label>
                    <input type="text" id="mint-lok" class="stx-input" value="Stadion Bima, Jl. Brigjen Dharsono, Cirebon" />
                </div>

                <div class="grid-2">
                    <div class="form-group">
                        <label class="form-label">Harga Utama (ETH)</label>
                        <input type="number" id="mint-harga" class="stx-input" min="0.001" step="0.01" value="0.05" />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Batas Maksimum Resale (ETH)</label>
                        <input type="number" id="mint-batas" class="stx-input" min="0.001" step="0.01" value="0.07" />
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Referensi Base URI / IPFS (Opsional)</label>
                    <input type="text" id="mint-uri" class="stx-input" value="ipfs://QmTikeKonser2026" />
                </div>

                <button type="button" id="btn-exec-mint" class="btn-primary">Mint & Terbitkan Tiket</button>
            </div>

            <div class="stx-card">
                <div class="stx-card-title">PRATINJAU KARTU TIKET (LIVE PREVIEW)</div>
                <div id="mint-live-preview"></div>
                <div class="form-hint" style="margin-top:0.65rem;">
                    Detail kategori, tanggal, jam, dan lokasi otomatis dikemas ke dalam <code>metadataURI</code> NFT on-chain.
                </div>
            </div>
        </div>

        <div class="stx-banner">
            <div class="stx-banner-title">ℹ️ KETENTUAN PENERBITAN TIKET (ANTI-SCALPING)</div>
            <p class="stx-banner-text">
                Hanya alamat wallet Promotor (Owner kontrak) yang dapat mencetak tiket baru. Nilai <strong>Batas Maksimum Resale</strong>
                akan terkunci permanen di dalam Smart Contract sehingga tiket tidak dapat dijual kembali melebihi plafon harga resmi.
            </p>
        </div>
    `;

    const updateMintPreview = () => {
        const nama = document.getElementById("mint-nama").value || "Nama Konser";
        const kat = document.getElementById("mint-kat").value;
        const tgl = formatDateID(document.getElementById("mint-tgl").value);
        const jam = (document.getElementById("mint-jam").value || "19:00") + " WIB";
        const qty = Math.max(1, Number(document.getElementById("mint-qty").value) || 1);
        const lok = document.getElementById("mint-lok").value || "Lokasi Venue";
        const harga = Number(document.getElementById("mint-harga").value) || 0;
        const batas = Number(document.getElementById("mint-batas").value) || 0;

        document.getElementById("mint-live-preview").innerHTML = buildTicketStubHTML({
            serialText: `NEW #${String(state.allTickets.length + 1).padStart(3, "0")}`,
            kategori: kat,
            namaKonser: nama,
            tanggal: tgl,
            jam,
            lokasi: lok,
            hargaUtama: harga,
            batasResale: batas,
            footerInfoHtml: `${qty}/${qty} Kuota Baru Akan Di-Mint`
        });
    };

    ["mint-nama", "mint-kat", "mint-tgl", "mint-jam", "mint-qty", "mint-lok", "mint-harga", "mint-batas"].forEach((id) => {
        document.getElementById(id).addEventListener("input", updateMintPreview);
        document.getElementById(id).addEventListener("change", updateMintPreview);
    });
    updateMintPreview();

    const bindPickerTrigger = (btnId, inputId) => {
        const btn = document.getElementById(btnId);
        const inp = document.getElementById(inputId);
        if (!btn || !inp) return;
        btn.addEventListener("click", () => {
            if (typeof inp.showPicker === "function") {
                inp.showPicker();
            } else {
                inp.focus();
                inp.click();
            }
        });
    };
    bindPickerTrigger("btn-pick-tgl", "mint-tgl");
    bindPickerTrigger("btn-pick-jam", "mint-jam");

    document.getElementById("btn-exec-mint").addEventListener("click", async () => {
        const nama = document.getElementById("mint-nama").value.trim();
        const kat = document.getElementById("mint-kat").value;
        const tgl = formatDateID(document.getElementById("mint-tgl").value);
        const jam = (document.getElementById("mint-jam").value || "19:00") + " WIB";
        const qty = Math.max(1, Number(document.getElementById("mint-qty").value) || 1);
        const lok = document.getElementById("mint-lok").value.trim();
        const harga = Number(document.getElementById("mint-harga").value);
        const batas = Number(document.getElementById("mint-batas").value);
        const baseUri = document.getElementById("mint-uri").value.trim();

        if (!nama) return showToast("Nama konser tidak boleh kosong.", "error");
        if (batas < harga) return showToast("Batas maksimum resale tidak boleh lebih kecil dari harga utama.", "error");

        const btn = document.getElementById("btn-exec-mint");
        btn.disabled = true;
        btn.textContent = "Memproses Minting...";

        try {
            const packedUri = buildMetadataURI(kat, tgl, jam, lok, baseUri);
            let lastHash = "";
            for (let i = 0; i < qty; i++) {
                lastHash = await executeContractTx("buatTiket", [
                    nama,
                    ethers.parseEther(String(harga)),
                    ethers.parseEther(String(batas)),
                    packedUri
                ]);
            }
            showToast(`✅ Berhasil menerbitkan ${qty} tiket NFT! Tx: <code>${lastHash.slice(0, 16)}...</code>`, "success");
            await refreshAllData();
        } catch (err) {
            showToast(`Gagal Mint Tiket: ${formatContractError(err)}`, "error");
        } finally {
            btn.disabled = false;
            btn.textContent = "Mint & Terbitkan Tiket";
        }
    });
}

// ------------------------------------------------------------------------------
// HALAMAN 4: TICKET PURCHASE
// ------------------------------------------------------------------------------
function renderTicketPurchase(container) {
    const primaryEvents = new Map();
    for (const t of state.allTickets) {
        const key = `${t.nama_konser}|${t.harga_utama_wei}|${t.tanggal}|${t.lokasi}`;
        if (!primaryEvents.has(key)) {
            primaryEvents.set(key, {
                key,
                nama_konser: t.nama_konser,
                harga_utama: t.harga_utama,
                harga_utama_wei: t.harga_utama_wei,
                tanggal: t.tanggal,
                lokasi: t.lokasi,
                available_ids: [],
                resale_count: 0,
            });
        }
        const ev = primaryEvents.get(key);
        if (t.status === 0 && t.current_owner === state.contractOwner) ev.available_ids.push(t.id);
        if (t.is_for_sale && t.status !== 3) ev.resale_count += 1;
    }

    const evList = Array.from(primaryEvents.values());
    if (evList.length === 0) {
        container.innerHTML = `
            <div class="page-title">Pembelian Tiket Utama</div>
            <div class="page-subtitle">Beli tiket konser resmi langsung dari promotor melalui Smart Contract</div>
            <div class="stx-card">
                <div class="stx-card-title">PEMBELIAN TIKET UTAMA</div>
                <div class="alert-box alert-warning">Belum ada event konser yang diterbitkan di jaringan blockchain.</div>
            </div>
        `;
        return;
    }

    if (state.preselectEvent) {
        const found = evList.find((e) => e.nama_konser === state.preselectEvent);
        if (found) state.tpSelectedKey = found.key;
        state.preselectEvent = null;
    }
    if (!state.tpSelectedKey || !primaryEvents.has(state.tpSelectedKey)) {
        state.tpSelectedKey = evList[0].key;
    }

    const chosenEv = primaryEvents.get(state.tpSelectedKey);
    const availCount = chosenEv.available_ids.length;

    let actionAreaHtml = "";
    if (availCount === 0) {
        actionAreaHtml = `
            <div class="alert-box alert-warning">
                Stok tiket utama untuk <strong>${escapeHtml(chosenEv.nama_konser)}</strong> telah habis terjual (0 Tersedia).
            </div>
            ${chosenEv.resale_count > 0 ? `
                <div class="alert-box alert-info">
                    💡 Tersedia <strong>${chosenEv.resale_count} tiket</strong> untuk acara ini di <strong>Pasar Sekunder</strong>.
                </div>
                <button type="button" id="tp-goto-sec" class="btn-primary">Buka Halaman Sekunder Tiket</button>
            ` : ""}
        `;
    } else {
        actionAreaHtml = `
            <div class="form-group">
                <label class="form-label">Jumlah Tiket yang Ingin Dibeli (Maks: ${availCount})</label>
                <input type="number" id="tp-qty" class="stx-input" min="1" max="${availCount}" value="1" />
            </div>
            <hr class="divider" />
            <div class="checkout-row">
                <div style="font-size:0.9rem; color:#CBD5E1;">Estimasi Harga (ETH)</div>
                <div id="tp-est-total" style="font-size:1.15rem; font-weight:800; color:#F8FAFC;">${chosenEv.harga_utama.toFixed(2)} ETH</div>
                <button type="button" id="btn-tp-buy" class="btn-primary">Beli Tiket Utama</button>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="page-title">Pembelian Tiket Utama</div>
        <div class="page-subtitle">Beli tiket konser resmi langsung dari promotor melalui Smart Contract</div>

        <div class="stx-card">
            <div class="stx-card-title">PEMBELIAN TIKET UTAMA</div>
            <div class="form-group">
                <label class="form-label">Pilih Event / Konser yang Akan Dibeli</label>
                <select id="tp-event-select" class="stx-select">
                    ${evList.map((e) => `
                        <option value="${escapeHtml(e.key)}" ${e.key === state.tpSelectedKey ? "selected" : ""}>
                            ${escapeHtml(e.nama_konser)} (${e.harga_utama.toFixed(2)} ETH) — ${e.available_ids.length} Tersedia
                        </option>
                    `).join("")}
                </select>
            </div>
            ${actionAreaHtml}
        </div>

        <div class="stx-banner">
            <div class="stx-banner-title">ℹ️ PERINGATAN TRANSAKSI</div>
            <p class="stx-banner-text">
                Transaksi otomatis ditandatangani menggunakan akun wallet yang sedang dipilih pada Sidebar Kiri.
                Pastikan saldo ETH mencukupi sebelum menekan tombol pembelian.
            </p>
        </div>
    `;

    document.getElementById("tp-event-select").addEventListener("change", (e) => {
        state.tpSelectedKey = e.target.value;
        renderTicketPurchase(container);
    });

    const gotoSec = document.getElementById("tp-goto-sec");
    if (gotoSec) {
        gotoSec.addEventListener("click", () => {
            state.sekunderMode = "beli";
            navigateTo("Sekunder Tiket");
        });
    }

    const qtyInp = document.getElementById("tp-qty");
    const buyBtn = document.getElementById("btn-tp-buy");
    if (qtyInp && buyBtn) {
        qtyInp.addEventListener("input", () => {
            const q = Math.min(availCount, Math.max(1, Number(qtyInp.value) || 1));
            document.getElementById("tp-est-total").textContent = `${(chosenEv.harga_utama * q).toFixed(2)} ETH`;
        });

        buyBtn.addEventListener("click", async () => {
            const q = Math.min(availCount, Math.max(1, Number(qtyInp.value) || 1));
            const targetIds = chosenEv.available_ids.slice(0, q);
            buyBtn.disabled = true;
            buyBtn.textContent = "Memproses Pembelian...";

            try {
                const bought = [];
                for (const tid of targetIds) {
                    await executeContractTx("beliTiketUtama", [tid], chosenEv.harga_utama_wei);
                    bought.push(`#${String(tid).padStart(3, "0")}`);
                }
                showToast(`🎉 Pembelian utama berhasil untuk Tiket ${bought.join(", ")}!`, "success");
                await refreshAllData();
            } catch (err) {
                showToast(`Gagal Beli Tiket Utama: ${formatContractError(err)}`, "error");
            } finally {
                buyBtn.disabled = false;
                buyBtn.textContent = "Beli Tiket Utama";
            }
        });
    }
}

// ------------------------------------------------------------------------------
// HALAMAN 5: SEKUNDER TIKET
// ------------------------------------------------------------------------------
async function renderSekunderTiket(container) {
    const isJual = state.sekunderMode === "jual";

    let bodyHtml = "";
    if (isJual) {
        let alreadyRegistered = false;
        try {
            if (state.readContract && state.activeWallet) {
                alreadyRegistered = await state.readContract.isRegisteredSeller(state.activeWallet);
            }
        } catch (_) { }

        const sellableTickets = state.allTickets.filter(
            (t) => t.current_owner === state.activeWallet && (t.status === 1 || t.status === 2) && !t.is_for_sale
        );

        if (state.preselectResaleTicket) {
            state.secSellSelectedId = state.preselectResaleTicket;
            state.preselectResaleTicket = null;
        }
        if (sellableTickets.length > 0 && !sellableTickets.some((t) => t.id === state.secSellSelectedId)) {
            state.secSellSelectedId = sellableTickets[0].id;
        }

        const chosenSell = sellableTickets.find((t) => t.id === state.secSellSelectedId);
        const defaultResalePrice = chosenSell
            ? Math.min(chosenSell.batas_resale, Number((chosenSell.harga_utama * 1.1).toFixed(3)))
            : 0.05;

        const sellFormHtml = sellableTickets.length === 0
            ? `<div class="alert-box alert-info">Wallet aktif belum memiliki tiket berstatus ISSUED/RESOLD yang siap di-listing.</div>`
            : `
                <div class="form-group">
                    <label class="form-label">Pilih Tiket yang Akan Dijual (Milik Wallet Anda)</label>
                    <select id="sec-sell-select" class="stx-select">
                        ${sellableTickets.map((t) => `
                            <option value="${t.id}" ${t.id === chosenSell.id ? "selected" : ""}>
                                ${escapeHtml(t.nama_konser)} (ID Tiket: #${String(t.id).padStart(3, "0")})
                            </option>
                        `).join("")}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Harga Jual Resale (ETH)</label>
                    <input type="number" id="sec-sell-price" class="stx-input" min="0.001" step="0.01" value="${defaultResalePrice.toFixed(2)}" />
                    <div class="form-hint">*Maksimal batas harga: ${chosenSell.batas_resale.toFixed(2)} ETH</div>
                </div>
                <div style="text-align:right;">
                    <button type="button" id="btn-sec-list" class="btn-primary">Daftarkan Tiket</button>
                </div>
            `;

        bodyHtml = `
            <div class="grid-2">
                <div class="stx-card">
                    <div class="stx-card-title">PENDAFTARAN PENJUAL SEKUNDER</div>
                    <p style="font-size:0.84rem; color:#CBD5E1; line-height:1.5; margin-bottom:0.85rem;">
                        Memverifikasi penonton menjadi penjual resmi terlebih dahulu agar pembeli biasa tidak langsung menjualnya secara bebas.
                    </p>
                    ${alreadyRegistered ? `
                        <div class="alert-box alert-success">
                            ✅ Wallet aktif <code>${shortAddr(state.activeWallet)}</code> sudah terdaftar sebagai penjual resmi.
                        </div>
                    ` : ""}
                    <div style="text-align:right;">
                        <button type="button" id="btn-sec-register" class="btn-primary" ${alreadyRegistered ? "disabled" : ""}>
                            Daftar Menjadi Penjual
                        </button>
                    </div>
                </div>

                <div class="stx-card">
                    <div class="stx-card-title">DAFTARKAN TIKET RESALE / JUAL KEMBALI</div>
                    ${sellFormHtml}
                </div>
            </div>
        `;
    } else {
        const resaleListings = state.allTickets.filter((t) => t.is_for_sale && t.status !== 3);
        if (resaleListings.length > 0 && !resaleListings.some((t) => t.id === state.secBuySelectedId)) {
            state.secBuySelectedId = resaleListings[0].id;
        }
        const chosenResale = resaleListings.find((t) => t.id === state.secBuySelectedId);

        bodyHtml = `
            <div class="stx-card">
                <div class="stx-card-title">PEMBELIAN TIKET SEKUNDER</div>
                ${resaleListings.length === 0
                ? `<div class="alert-box alert-info">Saat ini belum ada tiket yang ditawarkan di pasar sekunder.</div>`
                : `
                        <div class="form-group">
                            <label class="form-label">Pilih Tiket yang Tersedia di Pasar Sekunder (Resale)</label>
                            <select id="sec-buy-select" class="stx-select">
                                ${resaleListings.map((t) => `
                                    <option value="${t.id}" ${t.id === chosenResale.id ? "selected" : ""}>
                                        ID #${String(t.id).padStart(3, "0")}: ${escapeHtml(t.nama_konser)} (${t.harga_resale.toFixed(2)} ETH) - Penjual: ${shortAddr(t.current_owner)}
                                    </option>
                                `).join("")}
                            </select>
                        </div>
                        <hr class="divider" />
                        <div class="checkout-row">
                            <div>
                                <div style="font-size:0.9rem; color:#CBD5E1;">Estimasi Harga (ETH)</div>
                                <div style="font-size:0.75rem; color:#94A3B8; margin-top:2px;">*Sudah termasuk royalti 10% untuk promotor</div>
                            </div>
                            <div style="font-size:1.15rem; font-weight:800; color:#F8FAFC;">${chosenResale.harga_resale.toFixed(2)} ETH</div>
                            <button type="button" id="btn-sec-buy" class="btn-primary">🛍️ Beli Tiket Sekunder</button>
                        </div>
                    `
            }
            </div>
        `;
    }

    container.innerHTML = `
        <div class="page-title">Tiket Sekunder</div>
        <div class="page-subtitle">Penerbitan kembali, pendaftaran, dan transaksi pasar sekunder melalui Smart Contract</div>

        <div class="mode-switch-row">
            <button type="button" id="sw-sec-jual" class="${isJual ? "btn-tab-selected" : "btn-secondary"}">📤 PENJUALAN TIKET SEKUNDER</button>
            <button type="button" id="sw-sec-beli" class="${!isJual ? "btn-tab-selected" : "btn-secondary"}">📥 PEMBELIAN TIKET SEKUNDER</button>
        </div>

        ${bodyHtml}

        <div class="stx-banner">
            <div class="stx-banner-title">ℹ️ KETENTUAN PASAR SEKUNDER</div>
            <p class="stx-banner-text">
                Sistem blockchain secara otomatis membatasi harga resale agar tidak melebihi batas yang ditentukan promotor
                dan memotong royalti 10% untuk promotor pada setiap transaksi di pasar sekunder. Transaksi bersifat instan
                dan langsung mentransfer kepemilikan tiket secara on-chain.
            </p>
        </div>
    `;

    document.getElementById("sw-sec-jual").addEventListener("click", () => {
        state.sekunderMode = "jual";
        renderSekunderTiket(container);
    });
    document.getElementById("sw-sec-beli").addEventListener("click", () => {
        state.sekunderMode = "beli";
        renderSekunderTiket(container);
    });

    if (isJual) {
        const regBtn = document.getElementById("btn-sec-register");
        if (regBtn && !regBtn.disabled) {
            regBtn.addEventListener("click", async () => {
                regBtn.disabled = true;
                try {
                    const txh = await executeContractTx("daftarSebagaiPenjual");
                    showToast(`✅ Wallet resmi terdaftar sebagai penjual! Tx: <code>${txh.slice(0, 16)}...</code>`, "success");
                    await refreshAllData();
                } catch (err) {
                    showToast(`Gagal Daftar Penjual: ${formatContractError(err)}`, "error");
                    regBtn.disabled = false;
                }
            });
        }

        const sellSel = document.getElementById("sec-sell-select");
        if (sellSel) {
            sellSel.addEventListener("change", (e) => {
                state.secSellSelectedId = Number(e.target.value);
                renderSekunderTiket(container);
            });
        }

        const listBtn = document.getElementById("btn-sec-list");
        if (listBtn) {
            listBtn.addEventListener("click", async () => {
                const tid = Number(document.getElementById("sec-sell-select").value);
                const priceEth = Number(document.getElementById("sec-sell-price").value);
                const tk = state.allTickets.find((t) => t.id === tid);

                if (tk && priceEth > tk.batas_resale) {
                    return showToast(`Harga resale (${priceEth.toFixed(2)} ETH) melebihi batas maksimal (${tk.batas_resale.toFixed(2)} ETH).`, "error");
                }
                listBtn.disabled = true;
                try {
                    const txh = await executeContractTx("daftarkanResale", [tid, ethers.parseEther(String(priceEth))]);
                    showToast(`✅ Tiket #${String(tid).padStart(3, "0")} berhasil di-listing! Tx: <code>${txh.slice(0, 16)}...</code>`, "success");
                    await refreshAllData();
                } catch (err) {
                    showToast(`Gagal Listing Resale: ${formatContractError(err)}`, "error");
                    listBtn.disabled = false;
                }
            });
        }
    } else {
        const buySel = document.getElementById("sec-buy-select");
        if (buySel) {
            buySel.addEventListener("change", (e) => {
                state.secBuySelectedId = Number(e.target.value);
                renderSekunderTiket(container);
            });
        }

        const buySecBtn = document.getElementById("btn-sec-buy");
        if (buySecBtn) {
            buySecBtn.addEventListener("click", async () => {
                const tid = Number(document.getElementById("sec-buy-select").value);
                const tk = state.allTickets.find((t) => t.id === tid);
                if (!tk) return;

                buySecBtn.disabled = true;
                try {
                    const txh = await executeContractTx("beliResale", [tid], tk.harga_resale_wei);
                    showToast(`🎉 Pembelian tiket sekunder #${String(tid).padStart(3, "0")} berhasil! Tx: <code>${txh.slice(0, 16)}...</code>`, "success");
                    await refreshAllData();
                } catch (err) {
                    showToast(`Gagal Beli Tiket Sekunder: ${formatContractError(err)}`, "error");
                    buySecBtn.disabled = false;
                }
            });
        }
    }
}

// ------------------------------------------------------------------------------
// HALAMAN 6: MY TIKET
// ------------------------------------------------------------------------------
function renderMyTiket(container) {
    const owned = state.allTickets.filter((t) => t.current_owner === state.activeWallet);
    const mTotal = owned.length;
    const mReady = owned.filter((t) => (t.status === 1 || t.status === 2) && !t.is_for_sale).length;
    const mListed = owned.filter((t) => t.is_for_sale && t.status !== 3).length;
    const mUsed = owned.filter((t) => t.status === 3).length;

    let filtered = owned;
    if (state.myTiketFilter === "Siap Digunakan (Aktif)") {
        filtered = owned.filter((t) => (t.status === 1 || t.status === 2) && !t.is_for_sale);
    } else if (state.myTiketFilter === "Sedang Dijual di Pasar Sekunder") {
        filtered = owned.filter((t) => t.is_for_sale && t.status !== 3);
    } else if (state.myTiketFilter === "Sudah Digunakan (Check-In)") {
        filtered = owned.filter((t) => t.status === 3);
    }

    const filterOpts = [
        "Semua Tiket",
        "Siap Digunakan (Aktif)",
        "Sedang Dijual di Pasar Sekunder",
        "Sudah Digunakan (Check-In)"
    ];

    const gridHtml = filtered.length === 0
        ? `
            <div class="stx-card" style="text-align:center; padding:2.2rem;">
                <div style="font-size:1.05rem; font-weight:700; color:#F8FAFC; margin-bottom:0.35rem;">Tidak Ada Tiket pada Kategori Ini</div>
                <div style="font-size:0.86rem; color:#94A3B8;">Dapatkan tiket resmi melalui halaman <strong>Event List</strong>, <strong>Ticket Purchase</strong>, atau <strong>Sekunder Tiket</strong>.</div>
            </div>
        `
        : `<div class="grid-2">${filtered.map((tk) => {
            let badge = "";
            let foot = "";
            if (tk.status === 3) {
                badge = `<span class="badge-slate">USED &bull; CHECK-IN</span>`;
                foot = "Tiket telah digunakan di pintu masuk venue";
            } else if (tk.is_for_sale) {
                badge = `<span class="badge-amber">DIJUAL: ${tk.harga_resale.toFixed(2)} ETH</span>`;
                foot = "Aktif terdaftar di Pasar Sekunder";
            } else if (tk.status === 0) {
                badge = `<span class="badge-cyan">MINTED &bull; PROMOTOR</span>`;
                foot = "Belum terjual di Pasar Utama";
            } else {
                badge = `<span class="badge-cyan">AKTIF &bull; SIAP MASUK</span>`;
                foot = `Token ID #${String(tk.id).padStart(3, "0")} &bull; Terverifikasi`;
            }

            return buildTicketStubHTML({
                serialText: `ID #${String(tk.id).padStart(3, "0")}`,
                kategori: tk.kategori,
                namaKonser: tk.nama_konser,
                tanggal: tk.tanggal,
                jam: tk.jam,
                lokasi: tk.lokasi,
                hargaUtama: tk.harga_utama,
                batasResale: tk.batas_resale,
                footerInfoHtml: foot,
                topRightBadgeHtml: badge,
                detailBtnAttr: `data-my-tid="${tk.id}"`
            });
        }).join("")}</div>`;

    container.innerHTML = `
        <div class="page-title">My Tiket</div>
        <div class="page-subtitle">Koleksi Tiket Konser NFT Resmi milik wallet <code>${shortAddr(state.activeWallet)}</code></div>

        <div class="grid-4" style="margin-bottom:1rem;">
            <div class="kpi-card"><div class="kpi-label">Total Dimiliki</div><div class="kpi-value">${mTotal}</div></div>
            <div class="kpi-card"><div class="kpi-label">Siap Digunakan</div><div class="kpi-value" style="color:#38BDF8;">${mReady}</div></div>
            <div class="kpi-card"><div class="kpi-label">Sedang Dijual Resale</div><div class="kpi-value" style="color:#FBBF24;">${mListed}</div></div>
            <div class="kpi-card"><div class="kpi-label">Sudah Check-In</div><div class="kpi-value" style="color:#94A3B8;">${mUsed}</div></div>
        </div>

        <div class="form-group">
            <select id="my-tiket-filter" class="stx-select">
                ${filterOpts.map((o) => `<option value="${o}" ${state.myTiketFilter === o ? "selected" : ""}>${o}</option>`).join("")}
            </select>
        </div>

        ${gridHtml}
    `;

    document.getElementById("my-tiket-filter").addEventListener("change", (e) => {
        state.myTiketFilter = e.target.value;
        renderMyTiket(container);
    });

    container.querySelectorAll("[data-my-tid]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const tk = state.allTickets.find((t) => t.id === Number(btn.dataset.myTid));
            if (tk) openDetailModal({ mode: "ticket", ticket: tk });
        });
    });
}

// ------------------------------------------------------------------------------
// HALAMAN 7: VERIFICATION & CHECK-IN
// ------------------------------------------------------------------------------
function renderVerification(container) {
    const isCheckIn = state.verifMode === "checkin";
    let bodyHtml = "";

    if (isCheckIn) {
        const isAuthGate = state.activeWallet === state.contractOwner || state.activeWallet === state.vendorResmi;
        const sortedTickets = [...state.allTickets].sort((a, b) => {
            const pa = (a.status === 1 || a.status === 2) ? 0 : 1;
            const pb = (b.status === 1 || b.status === 2) ? 0 : 1;
            return pa - pb || a.id - b.id;
        });

        if (sortedTickets.length > 0 && !sortedTickets.some((t) => t.id === state.checkinSelectedId)) {
            state.checkinSelectedId = sortedTickets[0].id;
        }
        const matched = sortedTickets.find((t) => t.id === state.checkinSelectedId);
        const canCheckIn = isAuthGate && matched && (matched.status === 1 || matched.status === 2);

        let liveStatusHtml = `<div class="alert-box alert-warning">Belum ada tiket yang dipilih.</div>`;
        if (matched) {
            let bannerStatus = "";
            if (matched.status === 1 || matched.status === 2) {
                bannerStatus = `
                    <div class="alert-box alert-success">
                        <strong>✅ TIKET SAH & SIAP CHECK-IN</strong><br/>
                        Status: <strong>${STATUS_DESC[matched.status]}</strong>
                    </div>
                `;
            } else if (matched.status === 3) {
                bannerStatus = `
                    <div class="alert-box alert-danger">
                        <strong>⛔ DITOLAK: TIKET SUDAH DIPAKAI</strong><br/>
                        Tiket ini sudah pernah melakukan Check-In sebelumnya.
                    </div>
                `;
            } else {
                bannerStatus = `
                    <div class="alert-box alert-warning">
                        <strong>⚠️ BELUM TERJUAL (MINTED)</strong><br/>
                        Tiket masih berada di tangan promotor dan belum dibeli.
                    </div>
                `;
            }

            liveStatusHtml = `
                ${bannerStatus}
                <p style="font-size:0.84rem; color:#CBD5E1; margin-bottom:4px;"><strong>Konser:</strong> ${escapeHtml(matched.nama_konser)}</p>
                <p style="font-size:0.84rem; color:#CBD5E1; margin-bottom:4px;"><strong>Jadwal:</strong> ${escapeHtml(matched.tanggal)} &bull; ${escapeHtml(matched.jam)}</p>
                <p style="font-size:0.8rem; color:#94A3B8; margin-bottom:0; word-break:break-all;"><strong>Pemilik Sah:</strong> <code>${matched.current_owner}</code></p>
            `;
        }

        bodyHtml = `
            <div class="grid-mint">
                <div class="stx-card">
                    <div class="stx-card-title">VALIDASI MASUK GERBANG ACARA (checkInTiket)</div>
                    ${!isAuthGate ? `<div class="alert-box alert-warning">⚠️ Pilih akun <strong>Promotor</strong> atau <strong>Vendor Gate</strong> di Sidebar kiri untuk menjalankan Check-In.</div>` : ""}
                    ${sortedTickets.length === 0
                ? `<div class="alert-box alert-info">Belum ada tiket yang dicetak di blockchain.</div>`
                : `
                            <div class="form-group">
                                <label class="form-label">Pilih Tiket Pengunjung yang Akan Diverifikasi</label>
                                <select id="ci-ticket-select" class="stx-select">
                                    ${sortedTickets.map((t) => `
                                        <option value="${t.id}" ${t.id === matched.id ? "selected" : ""}>
                                            ID #${String(t.id).padStart(3, "0")} — ${escapeHtml(t.nama_konser)} [${STATUS_LABELS[t.status] || "UNKNOWN"}]
                                        </option>
                                    `).join("")}
                                </select>
                            </div>
                            <button type="button" id="btn-ci-exec" class="btn-primary" ${!canCheckIn ? "disabled" : ""}>
                                🎟️ Proses Check-In Gate
                            </button>
                        `
            }
                </div>

                <div class="stx-card">
                    <div class="stx-card-title">STATUS TIKET SAAT INI (LIVE CHECK)</div>
                    ${liveStatusHtml}
                </div>
            </div>
        `;
    } else {
        const maxTid = Math.max(state.allTickets.length, 1);
        const targetT = state.allTickets.find((t) => t.id === Number(state.auditTicketId));

        let auditResultHtml = `<div class="alert-box alert-warning">Tiket #${String(state.auditTicketId).padStart(3, "0")} belum tersedia di blockchain.</div>`;
        if (targetT) {
            const stubHtml = buildTicketStubHTML({
                serialText: `ID #${String(targetT.id).padStart(3, "0")}`,
                kategori: targetT.kategori,
                namaKonser: targetT.nama_konser,
                tanggal: targetT.tanggal,
                jam: targetT.jam,
                lokasi: targetT.lokasi,
                hargaUtama: targetT.harga_utama,
                batasResale: targetT.batas_resale,
                footerInfoHtml: `Status: ${STATUS_DESC[targetT.status] || "Unknown"} &bull; Pemilik: ${shortAddr(targetT.current_owner)}`,
                detailBtnAttr: `id="btn-audit-detail"`
            });

            const trailHtml = targetT.history.map((h) => `
                <div style="padding:6px 0; border-bottom:1px solid #263550; font-size:0.8rem;">
                    <div style="display:flex; justify-content:space-between;">
                        <span class="badge-cyan">${escapeHtml(h[0])}</span>
                        <span style="color:#F8FAFC; font-weight:600;">${Number(ethers.formatEther(h[2])).toFixed(3)} ETH</span>
                    </div>
                    <div style="color:#94A3B8; margin-top:3px; font-size:0.75rem;">
                        Aktor: <code>${shortAddr(h[1])}</code> &bull; ${formatTimestampFull(h[3])}
                    </div>
                </div>
            `).join("");

            auditResultHtml = `
                ${stubHtml}
                <div class="grid-mint" style="margin-top:1rem;">
                    <div style="background:#192338; border:1px solid #263550; border-radius:10px; padding:1rem;">
                        <div style="font-size:0.8rem; font-weight:700; color:#38BDF8; margin-bottom:0.5rem;">DATA ON-CHAIN TERVERIFIKASI</div>
                        <p style="font-size:0.83rem; color:#CBD5E1; margin-bottom:5px; word-break:break-all;"><strong>Pemilik Sah:</strong><br/><code>${targetT.current_owner}</code></p>
                        <p style="font-size:0.83rem; color:#CBD5E1; margin-bottom:5px;"><strong>Status Tiket:</strong> ${STATUS_DESC[targetT.status]}</p>
                        <p style="font-size:0.83rem; color:#CBD5E1; margin-bottom:5px;"><strong>Sedang Dijual Resale:</strong> ${targetT.is_for_sale ? `Ya (${targetT.harga_resale.toFixed(2)} ETH)` : "Tidak"}</p>
                        <p style="font-size:0.83rem; color:#CBD5E1; margin-bottom:0;"><strong>Lokasi Lengkap:</strong> ${escapeHtml(targetT.lokasi)}</p>
                    </div>
                    <div style="background:#192338; border:1px solid #263550; border-radius:10px; padding:1rem;">
                        <div style="font-size:0.8rem; font-weight:700; color:#38BDF8; margin-bottom:0.5rem;">📜 AUDIT TRAIL (PROVENANCE)</div>
                        ${trailHtml}
                    </div>
                </div>
            `;
        }

        bodyHtml = `
            <div class="stx-card">
                <div class="stx-card-title">PEMERIKSAAN KEASLIAN & JEJAK PROVENANCE TIKET</div>
                <div class="form-group">
                    <label class="form-label">Masukkan ID Tiket untuk Diaudit</label>
                    <input type="number" id="audit-id-input" class="stx-input" min="1" max="${maxTid}" value="${state.auditTicketId}" />
                </div>
                ${auditResultHtml}
            </div>
        `;
    }

    container.innerHTML = `
        <div class="page-title">Verification & Check-In</div>
        <div class="page-subtitle">Validasi gerbang masuk venue dan audit keaslian riwayat tiket di Blockchain</div>

        <div class="mode-switch-row">
            <button type="button" id="sw-verif-ci" class="${isCheckIn ? "btn-tab-selected" : "btn-secondary"}">🛂 CHECK-IN VENUE (GATE)</button>
            <button type="button" id="sw-verif-au" class="${!isCheckIn ? "btn-tab-selected" : "btn-secondary"}">🔍 AUDIT & KEASLIAN TIKET</button>
        </div>

        ${bodyHtml}
    `;

    document.getElementById("sw-verif-ci").addEventListener("click", () => {
        state.verifMode = "checkin";
        renderVerification(container);
    });
    document.getElementById("sw-verif-au").addEventListener("click", () => {
        state.verifMode = "audit";
        renderVerification(container);
    });

    if (isCheckIn) {
        const ciSel = document.getElementById("ci-ticket-select");
        if (ciSel) {
            ciSel.addEventListener("change", (e) => {
                state.checkinSelectedId = Number(e.target.value);
                renderVerification(container);
            });
        }
        const ciBtn = document.getElementById("btn-ci-exec");
        if (ciBtn && !ciBtn.disabled) {
            ciBtn.addEventListener("click", async () => {
                const tid = Number(document.getElementById("ci-ticket-select").value);
                ciBtn.disabled = true;
                try {
                    const txh = await executeContractTx("checkInTiket", [tid]);
                    showToast(`✅ Tiket #${String(tid).padStart(3, "0")} berhasil di-Check-In! Status menjadi USED. Tx: <code>${txh.slice(0, 16)}...</code>`, "success");
                    await refreshAllData();
                } catch (err) {
                    showToast(`Gagal Check-In: ${formatContractError(err)}`, "error");
                    ciBtn.disabled = false;
                }
            });
        }
    } else {
        const auditInp = document.getElementById("audit-id-input");
        if (auditInp) {
            auditInp.addEventListener("change", (e) => {
                state.auditTicketId = Math.max(1, Number(e.target.value) || 1);
                renderVerification(container);
            });
        }
        const detailBtn = document.getElementById("btn-audit-detail");
        if (detailBtn) {
            detailBtn.addEventListener("click", () => {
                const targetT = state.allTickets.find((t) => t.id === Number(state.auditTicketId));
                if (targetT) openDetailModal({ mode: "ticket", ticket: targetT });
            });
        }
    }
}

// ==============================================================================
// 7. BOOTSTRAP APLIKASI
// ==============================================================================
document.addEventListener("DOMContentLoaded", async () => {
    setupNavbarAndSidebarEvents();
    await initBlockchain();
});