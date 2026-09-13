const INSTAGRAM_BASE_URL = "https://www.instagram.com";
const INSTAGRAM_APP_ID = "936619743392459";

const RELATIONSHIP_PAGE_SIZE = 25;

const COLLECTION_CONFIG = {
    pageDelay: 3000,
    imageConcurrency: 3
};

const BACK_BUTTON = document.getElementById("backButton");
const PROFILE_URL = document.getElementById("profileUrl");
const DISCOVER_BUTTON = document.getElementById("discoverButton");
const COLLECT_BUTTON = document.getElementById("collectButton");
const STOP_BUTTON = document.getElementById("stopButton");
const EXPORT_BUTTON = document.getElementById("exportButton");
const EXPORT_SECTION = document.getElementById("exportSection");

const USERNAME = document.getElementById("username");
const USER_ID = document.getElementById("userId");

const FOLLOWERS_COUNT = document.getElementById("followersCount");
const FOLLOWING_COUNT = document.getElementById("followingCount");
const PAGES_COUNT = document.getElementById("pagesCount");
const IMAGES_COUNT = document.getElementById("imagesCount");
const IMAGES_FAILED_COUNT = document.getElementById("imagesFailedCount");
const NEXT_CURSOR = document.getElementById("nextCursor");
const STATUS = document.getElementById("status");

const PROFILE_CACHE = new Map();
const DOWNLOADED_IMAGES = new Map();

let currentCollection = null;
let stopRequested = false;


BACK_BUTTON.addEventListener("click", () => {
    window.location.href = "../instagram.html";
});

DISCOVER_BUTTON.addEventListener("click", discoverProfile);
COLLECT_BUTTON.addEventListener("click", collectInstagramData);
STOP_BUTTON.addEventListener("click", stopCollection);
EXPORT_BUTTON.addEventListener("click", exportCollection);


function createRelationshipCollection(type) {
    return {
        type,
        users: [],
        userIds: new Set(),
        pages: 0,
        nextMaxId: null,
        startedAt: null,
        finishedAt: null,
        completed: false
    };
}


function createCollection(profile) {
    return {
        profile,
        followers: createRelationshipCollection("followers"),
        following: createRelationshipCollection("following"),
        imagesDownloaded: 0,
        imagesFailed: 0,
        startedAt: getCollectedAt(),
        finishedAt: null,
        completed: false
    };
}


async function discoverProfile() {
    try {
        resetInterface();

        const profileUrl = normalizeProfileUrl(PROFILE_URL.value);
        const username = extractUsername(profileUrl);

        setStatus("Localizando perfil...");

        DISCOVER_BUTTON.disabled = true;

        const profile = await getProfileIdFromSource(profileUrl, username);

        USERNAME.value = profile.username;
        USER_ID.value = profile.userId;

        COLLECT_BUTTON.disabled = false;

        setStatus("Perfil identificado. Pronto para iniciar a coleta.");
    } catch (error) {
        console.error(error);

        setStatus(
            error.message || "Não foi possível identificar o perfil."
        );
    } finally {
        DISCOVER_BUTTON.disabled = false;
    }
}


function normalizeProfileUrl(value) {
    const url = String(value || "").trim();

    if (!url) {
        throw new Error("Informe a URL do perfil.");
    }

    let normalizedUrl = url;

    if (!normalizedUrl.startsWith("http://") &&
        !normalizedUrl.startsWith("https://")) {

        normalizedUrl = `https://${normalizedUrl}`;
    }

    const parsedUrl = new URL(normalizedUrl);

    if (!parsedUrl.hostname.endsWith("instagram.com")) {
        throw new Error("Informe uma URL válida do Instagram.");
    }

    const username = extractUsername(parsedUrl.toString());

    return `${INSTAGRAM_BASE_URL}/${username}/`;
}


function extractUsername(profileUrl) {
    const url = new URL(profileUrl);

    const parts = url.pathname
        .split("/")
        .filter(Boolean);

    if (parts.length === 0) {
        throw new Error("Não foi possível identificar o username.");
    }

    return parts[0];
}


function extractProfileIdFromSource(source) {
    const patterns = [
        /"profile_id":"(\d+)"/,
        /"page_id":"profilePage_(\d+)"/,
        /"id":"(\d+)","show_suggested_profiles"/
    ];

    for (const pattern of patterns) {
        const match = source.match(pattern);

        if (match) {
            return match[1];
        }
    }

    throw new Error(
        "Não foi possível localizar o profile_id no source do perfil."
    );
}


async function getProfileIdFromSource(profileUrl, username) {
    if (PROFILE_CACHE.has(username)) {
        return PROFILE_CACHE.get(username);
    }

    const response = await fetch(profileUrl, {
        method: "GET",
        credentials: "include"
    });

    const source = await response.text();

    if (!response.ok) {
        throw new Error(
            `Não foi possível carregar o perfil. HTTP ${response.status}.`
        );
    }

    if (!source) {
        throw new Error(
            "O Instagram retornou o source do perfil vazio."
        );
    }

    const userId = extractProfileIdFromSource(source);

    const profile = {
        username,
        userId
    };

    PROFILE_CACHE.set(username, profile);

    return profile;
}


async function getInstagramCookies() {
    const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    const activeTab = tabs[0];

    if (!activeTab) {
        throw new Error("Não foi possível identificar a aba ativa.");
    }

    const stores = await chrome.cookies.getAllCookieStores();

    const activeStore = stores.find(store =>
        store.tabIds.includes(activeTab.id)
    );

    if (activeStore) {
        const cookies = await chrome.cookies.getAll({
            url: "https://www.instagram.com/",
            storeId: activeStore.id
        });

        if (cookies && cookies.length > 0) {
            return cookies;
        }
    }

    for (const store of stores) {
        const cookies = await chrome.cookies.getAll({
            url: "https://www.instagram.com/",
            storeId: store.id
        });

        if (cookies && cookies.length > 0) {
            return cookies;
        }
    }

    const cookies = await chrome.cookies.getAll({
        domain: "instagram.com"
    });

    if (cookies && cookies.length > 0) {
        return cookies;
    }

    throw new Error("Nenhum cookie do Instagram encontrado.");
}


function getCookieValue(cookies, name) {
    const cookie = cookies.find(item => item.name === name);

    return cookie ? cookie.value : null;
}


function buildRelationshipUrl(userId, type, maxId = null) {
    const params = new URLSearchParams();

    params.set("count", RELATIONSHIP_PAGE_SIZE);
    params.set("search_surface", "follow_list_page");

    if (maxId) {
        params.set("max_id", maxId);
    }

    return `${INSTAGRAM_BASE_URL}/api/v1/friendships/${userId}/${type}/?${params.toString()}`;
}


function buildHeaders(csrfToken) {
    return {
        "accept": "*/*",
        "x-ig-app-id": INSTAGRAM_APP_ID,
        "x-csrftoken": csrfToken,
        "x-requested-with": "XMLHttpRequest"
    };
}


async function requestRelationshipPage(userId, type, csrfToken, maxId = null) {
    const url = buildRelationshipUrl(
        userId,
        type,
        maxId
    );

    const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: buildHeaders(csrfToken)
    });

    if (response.status === 429) {
        throw new Error(
            "O Instagram respondeu HTTP 429. A coleta foi interrompida por limite de requisições."
        );
    }

    if (response.status === 403) {
        throw new Error(
            "O Instagram respondeu HTTP 403. A coleta foi interrompida."
        );
    }

    if (!response.ok) {
        throw new Error(
            `Erro ao consultar ${type}. HTTP ${response.status}.`
        );
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.users)) {
        throw new Error(
            `Resposta inválida recebida ao consultar ${type}.`
        );
    }

    return data;
}


async function collectInstagramData() {
    try {
        const username = USERNAME.value.trim();
        const userId = USER_ID.value.trim();

        if (!username || !userId) {
            throw new Error(
                "Identifique o perfil antes de iniciar a coleta."
            );
        }

        resetCollectionStats();

        stopRequested = false;

        const profile = {
            username,
            userId
        };

        currentCollection = createCollection(profile);

        COLLECT_BUTTON.disabled = true;
        DISCOVER_BUTTON.disabled = true;
        STOP_BUTTON.disabled = false;
        EXPORT_SECTION.classList.add("hidden");

        const cookies = await getInstagramCookies();
        const csrfToken = getCookieValue(cookies, "csrftoken");

        if (!csrfToken) {
            throw new Error(
                "Cookie csrftoken não encontrado."
            );
        }

        setStatus("Coletando Followers...");

        await collectRelationship(
            "followers",
            csrfToken
        );

        if (stopRequested) {
            finishStoppedCollection();
            return;
        }

        setStatus("Followers concluídos. Iniciando Following...");

        await wait(COLLECTION_CONFIG.pageDelay);

        if (stopRequested) {
            finishStoppedCollection();
            return;
        }

        await collectRelationship(
            "following",
            csrfToken
        );

        if (stopRequested) {
            finishStoppedCollection();
            return;
        }

        currentCollection.finishedAt = getCollectedAt();
        currentCollection.completed = true;

        setStatus(
            "Coleta concluída. O pacote ZIP já pode ser gerado."
        );

        EXPORT_SECTION.classList.remove("hidden");
    } catch (error) {
        console.error(error);

        setStatus(
            error.message || "Erro durante a coleta."
        );

        if (currentCollection) {
            currentCollection.finishedAt = getCollectedAt();
        }

        if (hasCollectedData()) {
            EXPORT_SECTION.classList.remove("hidden");
        }
    } finally {
        COLLECT_BUTTON.disabled = false;
        DISCOVER_BUTTON.disabled = false;
        STOP_BUTTON.disabled = true;
    }
}


async function collectRelationship(type, csrfToken) {
    const relationship = currentCollection[type];

    relationship.startedAt = getCollectedAt();

    let maxId = null;

    while (!stopRequested) {
        setStatus(
            `Coletando ${getRelationshipLabel(type)} - página ${relationship.pages + 1}...`
        );

        const response = await requestRelationshipPage(
            currentCollection.profile.userId,
            type,
            csrfToken,
            maxId
        );

        relationship.pages++;

        const newUsers = [];

        for (const user of response.users || []) {
            const userId = getUserId(user);

            if (!userId) {
                continue;
            }

            if (relationship.userIds.has(userId)) {
                continue;
            }

            relationship.userIds.add(userId);

            const normalizedUser = normalizeUser(user);

            relationship.users.push(normalizedUser);
            newUsers.push(normalizedUser);
        }

        await downloadUserImages(newUsers);

        maxId = response.next_max_id || null;
        relationship.nextMaxId = maxId;

        updateStats(type);

        if (!maxId) {
            relationship.completed = true;
            relationship.finishedAt = getCollectedAt();
            relationship.nextMaxId = null;

            updateStats(type);

            break;
        }

        setStatus(
            `${getRelationshipLabel(type)}: ${relationship.users.length} usuários únicos coletados. Aguardando próxima página...`
        );

        await wait(COLLECTION_CONFIG.pageDelay);
    }

    if (!relationship.finishedAt) {
        relationship.finishedAt = getCollectedAt();
    }
}


function getUserId(user) {
    const value =
        user.pk ||
        user.id ||
        user.pk_id ||
        null;

    return value ? String(value) : null;
}


function normalizeUser(user) {
    const id = getUserId(user);

    return {
        id,
        username: user.username || "",
        fullName: user.full_name || "",
        isPrivate: Boolean(user.is_private),
        isVerified: Boolean(user.is_verified),
        profilePictureUrl:
            user.profile_pic_url_hd ||
            user.profile_pic_url ||
            "",
        profilePictureFile: null,
        profilePictureDownloaded: false,
        collectedAt: getCollectedAt()
    };
}


async function downloadUserImages(users) {
    for (
        let index = 0;
        index < users.length;
        index += COLLECTION_CONFIG.imageConcurrency
    ) {
        if (stopRequested) {
            return;
        }

        const batch = users.slice(
            index,
            index + COLLECTION_CONFIG.imageConcurrency
        );

        await Promise.all(
            batch.map(downloadProfileImage)
        );

        updateStats();
    }
}


async function downloadProfileImage(user) {
    if (!user.profilePictureUrl || !user.id) {
        return;
    }

    if (DOWNLOADED_IMAGES.has(user.id)) {
        const existingImage = DOWNLOADED_IMAGES.get(user.id);

        if (existingImage && existingImage.fileName) {
            user.profilePictureFile = `images/${existingImage.fileName}`;
            user.profilePictureDownloaded = true;
        }

        return;
    }

    try {
        const response = await fetch(
            user.profilePictureUrl
        );

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const blob = await response.blob();
        const fileName = buildImageFileName(user, blob);

        DOWNLOADED_IMAGES.set(user.id, {
            fileName,
            blob
        });

        user.profilePictureFile = `images/${fileName}`;
        user.profilePictureDownloaded = true;

        currentCollection.imagesDownloaded++;
    } catch (error) {
        console.warn(
            `Não foi possível baixar a imagem de @${user.username}:`,
            error
        );

        user.profilePictureFile = null;
        user.profilePictureDownloaded = false;

        currentCollection.imagesFailed++;
    }
}


function sanitizeFileName(value) {
    return String(value || "")
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/_+/g, "_");
}


function buildImageFileName(user, blob) {
    const username = sanitizeFileName(
        user.username || "unknown"
    );

    const extension = getImageExtension(blob);

    return `${user.id}__${username}.${extension}`;
}


function getImageExtension(blob) {
    const type = String(blob.type || "").toLowerCase();

    if (type.includes("png")) {
        return "png";
    }

    if (type.includes("webp")) {
        return "webp";
    }

    if (type.includes("gif")) {
        return "gif";
    }

    return "jpg";
}


function removeDuplicateUsers(users) {
    const usersById = new Map();

    for (const user of users || []) {
        if (!user || !user.id) {
            continue;
        }

        const id = String(user.id);

        if (!usersById.has(id)) {
            usersById.set(id, user);
        }
    }

    return Array.from(
        usersById.values()
    );
}


function getRelationshipLabel(type) {
    return type === "followers"
        ? "Followers"
        : "Following";
}


function getTotalPages() {
    if (!currentCollection) {
        return 0;
    }

    return (
        currentCollection.followers.pages +
        currentCollection.following.pages
    );
}


function updateStats(activeType = null) {
    if (!currentCollection) {
        return;
    }

    FOLLOWERS_COUNT.textContent =
        currentCollection.followers.users.length;

    FOLLOWING_COUNT.textContent =
        currentCollection.following.users.length;

    PAGES_COUNT.textContent =
        getTotalPages();

    IMAGES_COUNT.textContent =
        currentCollection.imagesDownloaded;

    IMAGES_FAILED_COUNT.textContent =
        currentCollection.imagesFailed;

    if (activeType) {
        NEXT_CURSOR.textContent =
            currentCollection[activeType].nextMaxId || "-";
    }
}


function stopCollection() {
    stopRequested = true;

    STOP_BUTTON.disabled = true;

    setStatus(
        "Parada solicitada. Finalizando a etapa atual..."
    );
}


function finishStoppedCollection() {
    if (!currentCollection) {
        return;
    }

    currentCollection.finishedAt = getCollectedAt();
    currentCollection.completed = false;

    setStatus(
        "Coleta interrompida. Os dados já coletados podem ser exportados."
    );

    if (hasCollectedData()) {
        EXPORT_SECTION.classList.remove("hidden");
    }
}


function hasCollectedData() {
    if (!currentCollection) {
        return false;
    }

    return (
        currentCollection.followers.users.length > 0 ||
        currentCollection.following.users.length > 0
    );
}


function resetInterface() {
    USERNAME.value = "";
    USER_ID.value = "";

    COLLECT_BUTTON.disabled = true;

    resetCollectionStats();

    EXPORT_SECTION.classList.add("hidden");
}


function resetCollectionStats() {
    FOLLOWERS_COUNT.textContent = "0";
    FOLLOWING_COUNT.textContent = "0";
    PAGES_COUNT.textContent = "0";
    IMAGES_COUNT.textContent = "0";
    IMAGES_FAILED_COUNT.textContent = "0";
    NEXT_CURSOR.textContent = "-";

    DOWNLOADED_IMAGES.clear();

    currentCollection = null;
    stopRequested = false;
}


function setStatus(message) {
    STATUS.textContent = message;
}


function wait(milliseconds) {
    return new Promise(resolve =>
        setTimeout(resolve, milliseconds)
    );
}


function getCollectedAt() {
    const now = new Date();

    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    }).formatToParts(now);

    const values = {};

    for (const part of parts) {
        if (part.type !== "literal") {
            values[part.type] = part.value;
        }
    }

    return (
        `${values.year}-${values.month}-${values.day}` +
        `T${values.hour}:${values.minute}:${values.second}-03:00`
    );
}


function buildRelationshipExport(type) {
    const relationship = currentCollection[type];
    const users = removeDuplicateUsers(
        relationship.users
    );

    return {
        profile: {
            username: currentCollection.profile.username,
            userId: currentCollection.profile.userId
        },
        collection: {
            type,
            startedAt: relationship.startedAt,
            finishedAt: relationship.finishedAt,
            pages: relationship.pages,
            total: users.length,
            completed: relationship.completed
        },
        users
    };
}


function buildManifest(followersExport, followingExport) {
    return {
        format: "instagram-labs-export",
        version: "1.0",
        createdAt: getCollectedAt(),

        profile: {
            username: currentCollection.profile.username,
            userId: currentCollection.profile.userId
        },

        followers: {
            total: followersExport.users.length,
            pages: currentCollection.followers.pages,
            completed: currentCollection.followers.completed
        },

        following: {
            total: followingExport.users.length,
            pages: currentCollection.following.pages,
            completed: currentCollection.following.completed
        },

        images: {
            downloaded: currentCollection.imagesDownloaded,
            failed: currentCollection.imagesFailed
        },

        startedAt: currentCollection.startedAt,
        finishedAt: currentCollection.finishedAt,
        completed: currentCollection.completed
    };
}


async function exportCollection() {
    try {
        if (!currentCollection || !hasCollectedData()) {
            throw new Error(
                "Não existem dados coletados para exportar."
            );
        }

        if (typeof JSZip === "undefined") {
            throw new Error(
                "JSZip não foi carregado. Verifique shared/jszip.min.js."
            );
        }

        EXPORT_BUTTON.disabled = true;

        setStatus(
            "Gerando pacote ZIP..."
        );

        const followersExport =
            buildRelationshipExport("followers");

        const followingExport =
            buildRelationshipExport("following");

        const manifest = buildManifest(
            followersExport,
            followingExport
        );

        const zip = new JSZip();

        zip.file(
            "manifest.json",
            JSON.stringify(manifest, null, 4)
        );

        zip.file(
            "followers.json",
            JSON.stringify(followersExport, null, 4)
        );

        zip.file(
            "following.json",
            JSON.stringify(followingExport, null, 4)
        );

        zip.file(
            "followers.html",
            buildViewerHtml(
                "Followers",
                "followers-data.js"
            )
        );

        zip.file(
            "following.html",
            buildViewerHtml(
                "Following",
                "following-data.js"
            )
        );

        const assets = zip.folder("assets");

        assets.file(
            "followers-data.js",
            buildViewerData(
                "followers",
                followersExport
            )
        );

        assets.file(
            "following-data.js",
            buildViewerData(
                "following",
                followingExport
            )
        );

        assets.file(
            "viewer.css",
            buildViewerCss()
        );

        assets.file(
            "viewer.js",
            buildViewerJs()
        );

        const images = zip.folder("images");

        for (const image of DOWNLOADED_IMAGES.values()) {
            images.file(
                image.fileName,
                image.blob
            );
        }

        const blob = await zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: {
                level: 6
            }
        });

        downloadBlob(
            blob,
            buildExportFileName()
        );

        setStatus(
            "Pacote ZIP gerado com sucesso."
        );
    } catch (error) {
        console.error(error);

        setStatus(
            error.message || "Erro ao gerar o pacote ZIP."
        );
    } finally {
        EXPORT_BUTTON.disabled = false;
    }
}


function buildExportFileName() {
    const username = sanitizeFileName(
        currentCollection.profile.username
    );

    const date = new Date()
        .toISOString()
        .slice(0, 10);

    return `instagram_${username}_${date}.zip`;
}


function buildViewerData(type, data) {
    return (
        `window.INSTAGRAM_EXPORT_TYPE = ${JSON.stringify(type)};\n` +
        `window.INSTAGRAM_EXPORT = ${JSON.stringify(data, null, 4)};\n`
    );
}


function buildViewerHtml(title, dataFile) {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Instagram Export</title>
    <link rel="stylesheet" href="assets/viewer.css">
</head>
<body>
    <main class="container">
        <header>
            <h1>${title}</h1>
            <p id="profileInfo"></p>
        </header>

        <section class="toolbar">
            <input id="searchInput" type="text" placeholder="Buscar por nome ou username">

            <select id="filterSelect">
                <option value="all">Todos</option>
                <option value="public">Públicos</option>
                <option value="private">Privados</option>
                <option value="verified">Verificados</option>
            </select>
        </section>

        <div id="resultCount" class="result-count"></div>

        <section id="usersList" class="users-list"></section>
    </main>

    <script src="assets/${dataFile}"></script>
    <script src="assets/viewer.js"></script>
</body>
</html>`;
}


function buildViewerCss() {
    return `
* {
    box-sizing: border-box;
}

body {
    margin: 0;
    font-family: Arial, sans-serif;
    background: #111;
    color: #eee;
}

.container {
    width: min(1100px, calc(100% - 32px));
    margin: 32px auto;
}

header {
    margin-bottom: 24px;
}

header h1 {
    margin-bottom: 8px;
}

header p {
    margin: 0;
    color: #aaa;
}

.toolbar {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
}

.toolbar input,
.toolbar select {
    padding: 12px;
    border: 1px solid #333;
    border-radius: 8px;
    background: #1b1b1b;
    color: #eee;
}

.toolbar input {
    flex: 1;
}

.result-count {
    margin-bottom: 16px;
    color: #aaa;
}

.users-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
}

.user-card {
    display: flex;
    gap: 12px;
    padding: 14px;
    border: 1px solid #2b2b2b;
    border-radius: 10px;
    background: #181818;
}

.user-card img {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    object-fit: cover;
    background: #252525;
}

.user-content {
    min-width: 0;
}

.user-content strong,
.user-content span,
.user-content small {
    display: block;
}

.user-content strong {
    margin-bottom: 4px;
}

.user-content span {
    color: #bbb;
    margin-bottom: 5px;
}

.user-content small {
    color: #777;
    word-break: break-all;
}

.badges {
    display: flex;
    gap: 5px;
    margin-top: 7px;
}

.badge {
    font-size: 11px;
    padding: 3px 6px;
    border-radius: 5px;
    background: #292929;
}
`;
}


function buildViewerJs() {
    return `
const SEARCH_INPUT = document.getElementById("searchInput");
const FILTER_SELECT = document.getElementById("filterSelect");
const USERS_LIST = document.getElementById("usersList");
const RESULT_COUNT = document.getElementById("resultCount");
const PROFILE_INFO = document.getElementById("profileInfo");

const DATA = window.INSTAGRAM_EXPORT || {};
const USERS = Array.isArray(DATA.users) ? DATA.users : [];

PROFILE_INFO.textContent =
    DATA.profile
        ? "@" + DATA.profile.username + " · " + USERS.length + " usuários"
        : USERS.length + " usuários";

SEARCH_INPUT.addEventListener("input", renderUsers);
FILTER_SELECT.addEventListener("change", renderUsers);

function renderUsers() {
    const search = SEARCH_INPUT.value.trim().toLowerCase();
    const filter = FILTER_SELECT.value;

    const users = USERS.filter(user => {
        const matchesSearch =
            !search ||
            String(user.username || "").toLowerCase().includes(search) ||
            String(user.fullName || "").toLowerCase().includes(search);

        if (!matchesSearch) {
            return false;
        }

        if (filter === "public" && user.isPrivate) {
            return false;
        }

        if (filter === "private" && !user.isPrivate) {
            return false;
        }

        if (filter === "verified" && !user.isVerified) {
            return false;
        }

        return true;
    });

    RESULT_COUNT.textContent =
        users.length + " resultado(s)";

    USERS_LIST.innerHTML = "";

    for (const user of users) {
        USERS_LIST.appendChild(
            createUserCard(user)
        );
    }
}

function createUserCard(user) {
    const card = document.createElement("article");
    card.className = "user-card";

    const image = document.createElement("img");

    if (user.profilePictureFile) {
        image.src = user.profilePictureFile;
    }

    image.alt = user.username || "Perfil";

    const content = document.createElement("div");
    content.className = "user-content";

    const name = document.createElement("strong");
    name.textContent = user.fullName || user.username || "-";

    const username = document.createElement("span");
    username.textContent = "@" + (user.username || "-");

    const id = document.createElement("small");
    id.textContent = "ID: " + user.id;

    const collectedAt = document.createElement("small");
    collectedAt.textContent =
        "Coletado em: " + formatDate(user.collectedAt);

    const badges = document.createElement("div");
    badges.className = "badges";

    const privacyBadge = document.createElement("span");
    privacyBadge.className = "badge";
    privacyBadge.textContent =
        user.isPrivate ? "Privado" : "Público";

    badges.appendChild(privacyBadge);

    if (user.isVerified) {
        const verifiedBadge = document.createElement("span");
        verifiedBadge.className = "badge";
        verifiedBadge.textContent = "Verificado";

        badges.appendChild(verifiedBadge);
    }

    content.appendChild(name);
    content.appendChild(username);
    content.appendChild(id);
    content.appendChild(collectedAt);
    content.appendChild(badges);

    card.appendChild(image);
    card.appendChild(content);

    return card;
}

function formatDate(value) {
    if (!value) {
        return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "medium"
    }).format(date);
}

renderUsers();
`;
}


function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = fileName;

    document.body.appendChild(anchor);

    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
}