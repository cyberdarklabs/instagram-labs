const INSTAGRAM_BASE_URL = "https://www.instagram.com";
const INSTAGRAM_APP_ID = "936619743392459";
const FOLLOWERS_PAGE_SIZE = 25;

const PROFILE_CACHE = new Map();

const BACK_BUTTON = document.getElementById("backButton");

const PROFILE_URL = document.getElementById("profileUrl");
const DISCOVER_BUTTON = document.getElementById("discoverButton");
const USERNAME = document.getElementById("username");
const USER_ID = document.getElementById("userId");

const REQUEST_STEP = document.getElementById("requestStep");
const API_URL = document.getElementById("apiUrl");
const HEADERS = document.getElementById("headers");
const EXECUTE_BUTTON = document.getElementById("executeButton");

const REQUEST_STATUS = document.getElementById("requestStatus");
const STATUS_DOT = document.getElementById("statusDot");
const STATUS_TITLE = document.getElementById("statusTitle");
const STATUS_MESSAGE = document.getElementById("statusMessage");

const SUMMARY = document.getElementById("summary");
const HTTP_STATUS = document.getElementById("httpStatus");
const USERS_COUNT = document.getElementById("usersCount");
const HAS_MORE = document.getElementById("hasMore");
const NEXT_MAX_ID = document.getElementById("nextMaxId");

const USERS_SECTION = document.getElementById("usersSection");
const USERS_LIST = document.getElementById("usersList");

const RAW_SECTION = document.getElementById("rawSection");
const RAW_RESPONSE = document.getElementById("rawResponse");
const TOGGLE_RAW_BUTTON = document.getElementById("toggleRawButton");

let preparedHeaders = null;

BACK_BUTTON.addEventListener("click", () => {
    window.location.href = "../instagram.html";
});

TOGGLE_RAW_BUTTON.addEventListener("click", () => {
    RAW_RESPONSE.classList.toggle("hidden");

    TOGGLE_RAW_BUTTON.textContent =
        RAW_RESPONSE.classList.contains("hidden")
            ? "Ver resposta JSON"
            : "Ocultar resposta JSON";
});

function extractUsername(profileUrl) {
    const value = profileUrl.trim();

    if (!value) {
        throw new Error("Informe a URL do perfil.");
    }

    let url;

    try {
        url = new URL(value);
    } catch {
        throw new Error("A URL do perfil é inválida.");
    }

    if (
        url.hostname !== "instagram.com" &&
        url.hostname !== "www.instagram.com"
    ) {
        throw new Error("Informe uma URL válida do Instagram.");
    }

    const parts = url.pathname
        .split("/")
        .filter(Boolean);

    if (parts.length === 0) {
        throw new Error("Não foi possível identificar o username.");
    }

    return parts[0];
}

async function getInstagramCookies() {
    const stores = await chrome.cookies.getAllCookieStores();

    for (const store of stores) {
        const cookies = await chrome.cookies.getAll({
            url: "https://www.instagram.com/",
            storeId: store.id
        });

        if (cookies && cookies.length > 0) {
            return cookies;
        }
    }

    throw new Error("Nenhum cookie do Instagram foi encontrado.");
}

function findCookie(cookies, name) {
    return cookies.find(cookie => cookie.name === name);
}

function buildHeaders(csrfToken) {
    return {
        "accept": "*/*",
        "x-ig-app-id": INSTAGRAM_APP_ID,
        "x-csrftoken": csrfToken,
        "x-requested-with": "XMLHttpRequest"
    };
}

function buildFollowersUrl(userId) {
    return (
        `${INSTAGRAM_BASE_URL}/api/v1/friendships/${userId}/followers/` +
        `?count=${FOLLOWERS_PAGE_SIZE}` +
        `&search_surface=follow_list_page`
    );
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

function resetProfile() {
    USERNAME.value = "";
    USER_ID.value = "";

    API_URL.value = "";
    HEADERS.value = "";

    preparedHeaders = null;

    EXECUTE_BUTTON.disabled = true;
    REQUEST_STEP.classList.add("disabled-step");
}

function resetResults() {
    SUMMARY.classList.add("hidden");
    USERS_SECTION.classList.add("hidden");
    RAW_SECTION.classList.add("hidden");

    USERS_LIST.innerHTML = "";
    RAW_RESPONSE.textContent = "";
}

function showError(message) {
    REQUEST_STATUS.classList.remove("hidden");

    STATUS_DOT.classList.remove("success");
    STATUS_DOT.classList.add("error");

    STATUS_TITLE.textContent = "Erro";
    STATUS_MESSAGE.textContent = message;
}

function showSuccess(title, message) {
    REQUEST_STATUS.classList.remove("hidden");

    STATUS_DOT.classList.remove("error");
    STATUS_DOT.classList.add("success");

    STATUS_TITLE.textContent = title;
    STATUS_MESSAGE.textContent = message;
}

function renderUsers(users) {
    USERS_LIST.innerHTML = "";

    users.forEach(user => {
        const card = document.createElement("div");
        card.className = "user-card";

        const image = document.createElement("img");
        image.className = "user-photo";
        image.alt = user.username || "Perfil";

        loadProfileImage(
            image,
            user.profile_pic_url
        );

        const info = document.createElement("div");
        info.className = "user-info";

        const name = document.createElement("strong");
        name.className = "user-name";
        name.textContent = user.full_name || "Sem nome";

        const username = document.createElement("span");
        username.className = "user-username";
        username.textContent = user.username
            ? `@${user.username}`
            : "@-";

        const id = document.createElement("span");
        id.className = "user-id";
        id.textContent = `ID: ${user.pk || user.pk_id || "-"}`;

        info.appendChild(name);
        info.appendChild(username);
        info.appendChild(id);

        card.appendChild(image);
        card.appendChild(info);

        USERS_LIST.appendChild(card);
    });
}

DISCOVER_BUTTON.addEventListener("click", async () => {
    resetProfile();
    resetResults();

    REQUEST_STATUS.classList.add("hidden");

    DISCOVER_BUTTON.disabled = true;
    DISCOVER_BUTTON.textContent = "Consultando...";

    try {
        const username = extractUsername(PROFILE_URL.value);

        const profileUrl =
            `${INSTAGRAM_BASE_URL}/${username}/`;

        const profile = await getProfileIdFromSource(
            profileUrl,
            username
        );

        const cookies = await getInstagramCookies();
        const csrfToken = findCookie(
            cookies,
            "csrftoken"
        );

        if (!csrfToken) {
            throw new Error(
                "O csrftoken não foi encontrado na sessão."
            );
        }

        const headers = buildHeaders(
            csrfToken.value
        );

        const followersUrl =
            buildFollowersUrl(
                profile.userId
            );

        USERNAME.value =
            profile.username;

        USER_ID.value =
            profile.userId;

        API_URL.value =
            followersUrl;

        HEADERS.value =
            JSON.stringify(
                headers,
                null,
                2
            );

        preparedHeaders =
            headers;

        REQUEST_STEP.classList.remove(
            "disabled-step"
        );

        EXECUTE_BUTTON.disabled =
            false;

        showSuccess(
            "Perfil identificado",
            `@${profile.username} localizado. User ID: ${profile.userId}.`
        );
    } catch (error) {
        showError(
            error.message
        );
    } finally {
        DISCOVER_BUTTON.disabled =
            false;

        DISCOVER_BUTTON.textContent =
            "Descobrir ID";
    }
});

EXECUTE_BUTTON.addEventListener("click", async () => {
    resetResults();

    REQUEST_STATUS.classList.add("hidden");

    if (
        !API_URL.value ||
        !preparedHeaders
    ) {
        showError(
            "Identifique o perfil antes de buscar os followers."
        );

        return;
    }

    EXECUTE_BUTTON.disabled = true;
    EXECUTE_BUTTON.textContent = "Consultando...";

    try {
        const response = await fetch(
            API_URL.value,
            {
                method: "GET",
                headers: preparedHeaders,
                credentials: "include"
            }
        );

        const text = await response.text();

        let data;

        try {
            data = JSON.parse(text);
        } catch {
            throw new Error(
                `O Instagram retornou uma resposta não JSON. HTTP ${response.status}.`
            );
        }

        RAW_RESPONSE.textContent =
            JSON.stringify(
                data,
                null,
                2
            );

        RAW_SECTION.classList.remove("hidden");

        if (response.status === 429) {
            throw new Error(
                "O Instagram retornou HTTP 429. Aguarde antes de tentar novamente."
            );
        }

        if (!response.ok) {
            throw new Error(
                data.message ||
                `A requisição retornou HTTP ${response.status}.`
            );
        }

        const users =
            Array.isArray(data.users)
                ? data.users
                : [];

        HTTP_STATUS.textContent =
            response.status;

        USERS_COUNT.textContent =
            users.length;

        HAS_MORE.textContent =
            String(data.has_more ?? "-");

        NEXT_MAX_ID.textContent =
            data.next_max_id ?? "-";

        SUMMARY.classList.remove("hidden");

        if (users.length > 0) {
            renderUsers(users);

            USERS_SECTION.classList.remove(
                "hidden"
            );
        }

        showSuccess(
            "Followers consultados",
            `${users.length} usuário(s) retornado(s) nesta página.`
        );
    } catch (error) {
        showError(error.message);
    } finally {
        EXECUTE_BUTTON.disabled = false;
        EXECUTE_BUTTON.textContent = "Buscar followers";
    }
});

async function loadProfileImage(image, imageUrl) {
    if (!imageUrl) {
        return;
    }

    try {
        const response = await fetch(imageUrl);

        if (!response.ok) {
            throw new Error(
                `Erro ao carregar imagem. HTTP ${response.status}.`
            );
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        image.src = objectUrl;

        image.addEventListener("load", () => {
            URL.revokeObjectURL(objectUrl);
        }, {
            once: true
        });
    } catch (error) {
        console.error(
            "Erro ao carregar foto do perfil:",
            error
        );
    }
}