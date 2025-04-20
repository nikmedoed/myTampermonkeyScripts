// ==UserScript==
// @name         Мультипоиск (универсальная версия)
// @namespace    http://tampermonkey.net/
// @author       http://t.me/nikmedoed
// @version      0.5.3
// @description  Гибкая панель для повторного поиска на других сайтах.
// @match        *://*/*
// @grant        none
// @icon64       https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/multisearch.png
// @icon         https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/multisearch.png
// @downloadURL  https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/multisearch.user.js
// @updateURL    https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/multisearch.user.js
// ==/UserScript==

(() => {
    'use strict';

    // ---------- НАСТРОЙКИ: только SITES ----------
    const CONFIG = {
        SITES: [
            { name: 'Google',      url: 'https://www.google.com/search?q=',                 hosts: ['google.com'],        searchPath: /^\/search$/,           queryParam: 'q',           icon: 'google.com' },
            { name: 'Яндекс',      url: 'https://yandex.ru/search/?text=',                 hosts: ['yandex.ru'],        searchPath: /^\/search/,          queryParam: 'text',        icon: 'yandex.ru' },
            { name: 'YouTube',     url: 'https://www.youtube.com/results?search_query=',  hosts: ['youtube.com'],      searchPath: /^\/results$/,         queryParam: 'search_query', icon: 'youtube.com' },
            { name: 'Ozon',        url: 'https://www.ozon.ru/search/?text=',                hosts: ['ozon.ru','ozon.com'],searchPath: /^\/search/,          queryParam: 'text',        icon: 'ozon.ru' },
            { name: 'WB',          url: 'https://www.wildberries.ru/catalog/0/search.aspx?search=',hosts: ['wildberries.ru'],    searchInput: '#searchInput',         searchPath: /search\.aspx$/,      queryParam: 'search',      icon: 'wildberries.ru' },
            { name: 'AliExpress',  url: 'https://www.aliexpress.com/wholesale?SearchText=', hosts: ['aliexpress.com','aliexpress.ru'],searchInput: '#SearchText', searchPath: /\/wholesale|\/popular/,queryParam: 'SearchText',   icon: 'aliexpress.com' },
            { name: 'Кинориум',     url: 'https://ru.kinorium.com/search/?q=',                hosts: ['kinorium.com'],     searchPath: /^\/search/,          queryParam: 'q',           icon: 'kinorium.com' },
        ],
    };

    /* ========= ВНУТРЕННИЕ ФУНКЦИИ ========= */

    const PANEL_CSS = `
    #multiSearchPanel {
      position: fixed;
      top: 50%;
      left: 0;
      transform: translateY(-50%);
      background: rgba(255, 255, 255, .25);
      backdrop-filter: blur(4px);
      border-top-right-radius: 10px;
      border-bottom-right-radius: 10px;
      padding: 4px 3px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .multiSearchBtn {
      width: 32px; height: 32px;
      background: rgba(255, 255, 255, .3);
      border: 1px solid rgba(0, 0, 0, .1);
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: .2s background;
      position: relative;
      font-size: 14px;
      color: #333;
    }
    .multiSearchBtn:hover { background: rgba(255, 255, 255, .9); }
    .multiSearchBtn img { width: 18px; height: 18px; }
    .multiSearchBtn[data-tip]::after {
      content: attr(data-tip);
      position: absolute;
      left: 40px;
      background: #333;
      color: #fff;
      font-size: 12px;
      padding: 2px 6px;
      border-radius: 4px;
      opacity: 0;
      transition: .2s;
      white-space: nowrap;
      pointer-events: none;
    }
    .multiSearchBtn:hover::after { opacity: 1; }
  `;

    const ICON_SRC = domain => `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;

    const injectStyles = css => {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    };

    const getCurrentSite = () => CONFIG.SITES.find(s => s.hosts.some(h => location.hostname.endsWith(h)));

    const isSearchContext = site => {
        if (site.searchInput && document.querySelector(site.searchInput)) return true;
        if (site.searchPath && site.searchPath.test(location.pathname)) return true;
        return false;
    };

    const extractQuery = site => {
        if (site.searchInput) {
            const el = document.querySelector(site.searchInput);
            if (el && el.value.trim()) return el.value.trim();
        }
        if (site.queryParam) {
            const v = new URLSearchParams(location.search).get(site.queryParam);
            if (v) return v.trim();
        }
        return '';
    };

    const makeBtn = (site, query) => {
        const btn = document.createElement('div');
        btn.className = 'multiSearchBtn';
        btn.setAttribute('data-tip', site.name);

        const img = document.createElement('img');
        img.src = ICON_SRC(site.icon);
        img.alt = site.name;
        img.onerror = () => { btn.textContent = site.name[0]; };
        btn.appendChild(img);

        btn.onclick = () => {
            const target = query ? site.url + encodeURIComponent(query) : site.url;
            window.open(target, '_blank', 'noopener');
        };
        return btn;
    };

    const buildPanel = currentSite => {
        const query = extractQuery(currentSite);
        const panel = document.createElement('div');
        panel.id = 'multiSearchPanel';

        CONFIG.SITES.filter(s => s !== currentSite).forEach(s => panel.appendChild(makeBtn(s, query)));
        document.body.appendChild(panel);
    };
    /* ========= /ВНУТРЕННИЕ ФУНКЦИИ ========= */

    window.addEventListener('load', () => {
        const current = getCurrentSite();
        if (!current || !isSearchContext(current)) return;
        injectStyles(PANEL_CSS);
        buildPanel(current);
    });
})();
