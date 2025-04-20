// ==UserScript==
// @name         Мультипоиск с Favicon и фильтром URL
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Умная панель поиска с иконками сайтов, работает только на нужных страницах поиска (Google, Яндекс, YouTube, Ozon, WB, AliExpress)
// @author       ChatGPT
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Список сайтов и параметров поиска
    const SITES = [
        { name: "Google",      url: "https://www.google.com/search?q=",      icon: "google.com" },
        { name: "Яндекс",      url: "https://yandex.ru/search/?text=",       icon: "yandex.ru" },
        { name: "YouTube",     url: "https://www.youtube.com/results?search_query=", icon: "youtube.com" },
        { name: "Ozon",        url: "https://www.ozon.ru/search/?text=",     icon: "ozon.ru" },
        { name: "WB",          url: "https://www.wildberries.ru/catalog/0/search.aspx?search=", icon: "wildberries.ru" },
        { name: "AliExpress",  url: "https://www.aliexpress.com/wholesale?SearchText=", icon: "aliexpress.com" }
    ];

    // Определяем, отображать ли панель на этой странице
    const locationChecks = [
        () => location.hostname.includes("google.") && location.pathname === "/search" && location.search.includes("q="),
        () => location.hostname === "yandex.ru" && location.pathname.startsWith("/search/"),
        () => location.hostname === "www.youtube.com" && location.pathname === "/results" && location.search.includes("search_query="),
        () => location.hostname === "www.ozon.ru" && location.pathname.startsWith("/search"),
        () => location.hostname === "www.wildberries.ru" && location.pathname.includes("/search.aspx"),
        () => location.hostname === "www.aliexpress.com" && location.pathname.includes("/wholesale") && location.search.includes("SearchText=")
    ];

    const shouldDisplay = locationChecks.some(fn => fn());
    if (!shouldDisplay) return;  // Не показываем панель

    const style = `
        #multiSearchPanel {
            position: fixed;
            top: 50%;
            left: 0;
            transform: translateY(-50%);
            background: rgba(255, 255, 255, 0.2);
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
        const params = new URLSearchParams(window.location.search);
        return (
            params.get("q") ||
            params.get("text") ||
            params.get("search_query") ||
            params.get("SearchText") ||
            ""
        );
    }

    function getFaviconUrl(domain) {
        return `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
    }

    function createPanel() {
        const panel = document.createElement("div");
        panel.id = "multiSearchPanel";

        SITES.forEach(site => {
            const btn = document.createElement("div");
            btn.className = "multiSearchBtn";
            btn.setAttribute("data-tooltip", site.name);

            const img = document.createElement("img");
            img.src = getFaviconUrl(site.icon);
            img.alt = site.name;

            btn.appendChild(img);

            btn.onclick = () => {
                const query = getSearchQuery();
                const fullUrl = query ? site.url + encodeURIComponent(query) : site.url;
                window.open(fullUrl, "_blank");
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