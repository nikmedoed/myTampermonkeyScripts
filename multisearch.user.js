// ==UserScript==
// @name         Мультипоиск
// @namespace    http://tampermonkey.net/
// @author       http://t.me/nikmedoed
// @version      0.4
// @description  Умная панель поиска с иконками сайтов, скрывает текущий движок, учитывает поддомены и добавляет Кинориум. Исправлена работа с Wildberries, AliExpress и обход CSP через мойфоллбек.
// @author       ChatGPT
// @match        *://*/*
// @grant        none
// @icon64       https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/multisearch.png
// @icon         https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/multisearch.png
// @downloadURL  https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/multisearch.user.js
// @updateURL    https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/multisearch.user.js
// ==/UserScript==

(function () {
    'use strict';

    const SITES = [
        {
            name: "Google",
            url: "https://www.google.com/search?q=",
            icon: "google.com",
            hostPatterns: ["google.com"]
        },
        {
            name: "Яндекс",
            url: "https://yandex.ru/search/?text=",
            icon: "yandex.ru",
            hostPatterns: ["yandex.ru"]
        },
        {
            name: "YouTube",
            url: "https://www.youtube.com/results?search_query=",
            icon: "youtube.com",
            hostPatterns: ["youtube.com"]
        },
        {
            name: "Ozon",
            url: "https://www.ozon.ru/search/?text=",
            icon: "ozon.ru",
            hostPatterns: ["ozon.ru", "ozon.com"]
        },
        {
            name: "WB",
            url: "https://www.wildberries.ru/catalog/0/search.aspx?search=",
            icon: "wildberries.ru",
            hostPatterns: ["wildberries.ru"]
        },
        {
            name: "AliExpress",
            url: "https://www.aliexpress.com/wholesale?SearchText=",
            icon: "aliexpress.com",
            hostPatterns: ["aliexpress.com", "aliexpress.ru"]
        },
        {
            name: "Кинориум",
            url: "https://ru.kinorium.com/search/?q=",
            icon: "ru.kinorium.com",
            hostPatterns: ["kinorium.com"]
        }
    ];

    // страницы поиска, в т.ч. Wildberries и AliExpress/popular
    const locationChecks = [
        () => location.hostname.includes("google.") && location.pathname === "/search",
        () => location.hostname.endsWith("yandex.ru") && location.pathname.startsWith("/search"),
        () => location.hostname.includes("youtube.com") && location.pathname === "/results",
        () => (location.hostname.endsWith("ozon.ru") || location.hostname.endsWith("ozon.com")) && location.pathname.startsWith("/search"),
        () => location.hostname.endsWith("wildberries.ru") && document.querySelector("#searchInput"),
        () => location.hostname.includes("aliexpress.") && (location.pathname.includes("/wholesale") || location.pathname.includes("/popular")),
        () => location.hostname.includes("kinorium.com") && location.pathname.startsWith("/search")
    ];
    if (!locationChecks.some(fn => fn())) return;

    const style = `
        #multiSearchPanel {
            position: fixed;
            top: 50%;
            left: 0;
            transform: translateY(-50%);
            background: rgba(255,255,255,0.2);
            backdrop-filter: blur(4px);
            border-top-right-radius: 10px;
            border-bottom-right-radius: 10px;
            padding: 4px 2px;
            z-index: 99999;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
        }
        .multiSearchBtn {
            width: 32px;
            height: 32px;
            background-color: rgba(255,255,255,0.3);
            border: 1px solid rgba(0,0,0,0.1);
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            justify-content: center;
            align-items: center;
            transition: background 0.2s ease;
            position: relative;
            font-size: 14px;
            color: #333;
        }
        .multiSearchBtn:hover {
            background-color: rgba(255,255,255,0.9);
        }
        .multiSearchBtn img {
            width: 18px;
            height: 18px;
        }
        .multiSearchBtn::after {
            content: attr(data-tooltip);
            position: absolute;
            left: 40px;
            background: #333;
            color: #fff;
            font-size: 12px;
            padding: 2px 6px;
            border-radius: 4px;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s;
            white-space: nowrap;
        }
        .multiSearchBtn:hover::after {
            opacity: 1;
        }
    `;
    function injectStyles(css) {
        const s = document.createElement('style');
        s.textContent = css;
        document.head.appendChild(s);
    }

    function getSearchQuery() {
        const host = location.hostname;
        if (host.endsWith("wildberries.ru")) {
            const el = document.querySelector("#searchInput");
            return el ? el.value.trim() : "";
        }
        if (host.includes("aliexpress.")) {
            const el = document.querySelector("#SearchText");
            return el ? el.value.trim() : "";
        }
        const params = new URLSearchParams(location.search);
        return (
            params.get("q") ||
            params.get("text") ||
            params.get("search_query") ||
            params.get("SearchText") ||
            ""
        );
    }

    function makeFallbackText(btn, site) {
        const span = document.createElement("span");
        span.textContent = site.name[0];
        btn.textContent = "";
        btn.appendChild(span);
    }

    function getFaviconUrl(domain) {
        return `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
    }

    function createPanel() {
        const panel = document.createElement("div");
        panel.id = "multiSearchPanel";
        const current = location.hostname;

        SITES.forEach(site => {
            if (site.hostPatterns.some(p => current.endsWith(p))) return;

            const btn = document.createElement("div");
            btn.className = "multiSearchBtn";
            btn.setAttribute("data-tooltip", site.name);

            const img = document.createElement("img");
            img.src = getFaviconUrl(site.icon);
            img.alt = site.name;
            img.onerror = () => makeFallbackText(btn, site);

            btn.appendChild(img);
            btn.onclick = () => {
                const q = getSearchQuery();
                const target = q ? site.url + encodeURIComponent(q) : site.url;
                window.open(target, "_blank");
            };
            panel.appendChild(btn);
        });
        document.body.appendChild(panel);
    }

    window.addEventListener("load", () => {
        injectStyles(style);
        createPanel();
    });
})();