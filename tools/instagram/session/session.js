const BACK_BUTTON =
    document.getElementById("backButton");

const STATUS =
    document.getElementById("status");

const STATUS_DOT =
    document.getElementById("statusDot");

const USER_ID =
    document.getElementById("userId");

const CSRF_TOKEN =
    document.getElementById("csrfToken");

const SESSION_ID =
    document.getElementById("sessionId");

const COOKIE =
    document.getElementById("cookie");

const COPY_COOKIE =
    document.getElementById("copyCookie");

const COPY_AUTH_JSON =
    document.getElementById(
        "copyAuthJson"
    );


BACK_BUTTON.addEventListener(
    "click",
    () => {

        window.location.href =
            "../../popup/popup.html";
    }
);


async function getInstagramCookies() {

    /*
     * Descobre a aba atualmente ativa.
     */
    const tabs =
        await chrome.tabs.query({
            active: true,
            currentWindow: true
        });


    const activeTab =
        tabs[0];


    if (!activeTab) {

        throw new Error(
            "Não foi possível identificar a aba ativa."
        );
    }


    /*
     * Descobre todos os cookie stores disponíveis.
     *
     * Isso é importante no Vivaldi porque não podemos
     * simplesmente assumir que a sessão do Instagram
     * está no store padrão.
     */
    const stores =
        await chrome.cookies.getAllCookieStores();


    console.log(
        "[Dark Developer Toolbox] Cookie stores:",
        stores
    );


    /*
     * Procura o cookie store associado à aba ativa.
     */
    const activeStore =
        stores.find(
            store =>
                store.tabIds.includes(
                    activeTab.id
                )
        );


    console.log(
        "[Dark Developer Toolbox] Store ativo:",
        activeStore
    );


    /*
     * Primeiro tentamos especificamente o store
     * associado à aba atual.
     */
    if (activeStore) {

        const cookies =
            await chrome.cookies.getAll({

                url:
                    "https://www.instagram.com/",

                storeId:
                    activeStore.id
            });


        if (
            cookies &&
            cookies.length > 0
        ) {

            console.log(
                "[Dark Developer Toolbox] Cookies encontrados no store ativo:",
                cookies.map(
                    cookie =>
                        cookie.name
                )
            );


            return cookies;
        }
    }


    /*
     * Fallback:
     * testa todos os stores conhecidos.
     */
    for (
        const store of stores
    ) {

        const cookies =
            await chrome.cookies.getAll({

                url:
                    "https://www.instagram.com/",

                storeId:
                    store.id
            });


        console.log(
            `[Dark Developer Toolbox] Store ${store.id}:`,
            cookies.map(
                cookie =>
                    cookie.name
            )
        );


        if (
            cookies &&
            cookies.length > 0
        ) {

            return cookies;
        }
    }


    /*
     * Último fallback sem storeId.
     */
    const cookies =
        await chrome.cookies.getAll({

            domain:
                "instagram.com"
        });


    if (
        cookies &&
        cookies.length > 0
    ) {

        return cookies;
    }


    throw new Error(
        "Nenhum cookie do Instagram encontrado."
    );
}


function findCookie(
    cookies,
    name
) {

    return cookies.find(
        cookie =>
            cookie.name === name
    );
}


function buildCookieHeader(
    cookies
) {

    return cookies
        .map(
            cookie =>
                `${cookie.name}=${cookie.value}`
        )
        .join("; ");
}


async function loadInstagramSession() {

    STATUS.textContent =
        "Lendo sessão do Instagram...";


    STATUS_DOT.classList.remove(
        "success",
        "error"
    );


    try {

        const cookies =
            await getInstagramCookies();
            console.log(
            "[Douglas DevTools] Cookies encontrados:",
            cookies.map(cookie => cookie.name)
            );


        const dsUserId =
            findCookie(
                cookies,
                "ds_user_id"
            );


        const csrfToken =
            findCookie(
                cookies,
                "csrftoken"
            );


        const sessionId =
            findCookie(
                cookies,
                "sessionid"
            );


        USER_ID.value =
            dsUserId?.value ?? "";


        CSRF_TOKEN.value =
            csrfToken?.value ?? "";


        SESSION_ID.value =
            sessionId?.value ?? "";


        COOKIE.value =
            buildCookieHeader(
                cookies
            );


        if (!sessionId) {

            STATUS.textContent =
                "Cookies encontrados, mas sessionid não foi localizado.";


            STATUS_DOT.classList.add(
                "error"
            );


            return;
        }


        STATUS_DOT.classList.add(
            "success"
        );


        STATUS.textContent =
            `Sessão encontrada • ${cookies.length} cookies`;

    }
    catch (error) {

        STATUS_DOT.classList.add(
            "error"
        );


        STATUS.textContent =
            error.message;


        console.error(
            "[Douglas DevTools]",
            error
        );
    }
}


async function copyToClipboard(
    value,
    description
) {

    if (!value) {

        STATUS.textContent =
            "Nenhum valor disponível para copiar.";

        return;
    }


    try {

        await navigator.clipboard.writeText(
            value
        );


        STATUS.textContent =
            `${description} copiado.`;

    }
    catch (error) {

        STATUS.textContent =
            "Não foi possível copiar o valor.";


        console.error(
            "[Douglas DevTools]",
            error
        );
    }
}


document
    .querySelectorAll(
        "[data-copy]"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            async () => {

                const elementId =
                    button.dataset.copy;


                const element =
                    document.getElementById(
                        elementId
                    );


                await copyToClipboard(
                    element.value,
                    elementId
                );
            }
        );
    });


COPY_COOKIE.addEventListener(
    "click",
    async () => {

        await copyToClipboard(
            COOKIE.value,
            "Cookie completo"
        );
    }
);

COPY_AUTH_JSON.addEventListener(
    "click",
    async () => {

        const authentication = {

            ds_user_id:
                USER_ID.value,

            csrftoken:
                CSRF_TOKEN.value,

            sessionid:
                SESSION_ID.value,

            cookie:
                COOKIE.value
        };


        const json =
            JSON.stringify(
                authentication,
                null,
                2
            );


        await copyToClipboard(
            json,
            "Autenticação JSON"
        );
    }
);

BACK_BUTTON.addEventListener(
    "click",
    () => {

        window.location.href =
            "../instagram.html";
    }
);


loadInstagramSession();