// ==UserScript==
// @name         Мультипоиск
// @namespace    https://nikmedoed.github.io
// @author       http://t.me/nikmedoed
// @description  Гибкая панель для повторного поиска на других сайтах.
// @version      0.6.2
// @match        *://*/*
// @sandbox      DOM
// @run-at       document-idle
// @icon64       https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/multisearch.png
// @icon         https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/multisearch.png
// @downloadURL  https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/multisearch.user.js
// @updateURL    https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/multisearch.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(async () => {
    'use strict';

    const STORAGE_KEY = 'sites';
    const LOCAL_PREFIX = '__multisearch_';
    const stringifySites = (sites) => JSON.stringify(sites, null, 2);

    function normalizeSite(site) {
        if (!site || typeof site !== 'object') {
            return {
                name: '',
                url: '',
                hosts: [],
                searchPath: '',
                queryParam: null,
                searchInput: '',
                icon: ''
            };
        }
        const hosts = Array.isArray(site.hosts)
            ? site.hosts.map((h) => (typeof h === 'string' ? h.trim() : '')).filter(Boolean)
            : [];
        let icon = typeof site.icon === 'string' ? site.icon.trim() : '';
        if (!icon && hosts.length) icon = hosts[0];
        let queryParam = site.queryParam;
        if (typeof queryParam === 'string') {
            queryParam = queryParam.trim();
            if (!queryParam) queryParam = null;
        } else if (queryParam == null) {
            queryParam = null;
        } else {
            queryParam = String(queryParam).trim() || null;
        }
        const searchInput = typeof site.searchInput === 'string' ? site.searchInput.trim() : '';
        return {
            name: typeof site.name === 'string' ? site.name.trim() : '',
            url: typeof site.url === 'string' ? site.url.trim() : '',
            hosts,
            searchPath: typeof site.searchPath === 'string' ? site.searchPath : '',
            queryParam,
            searchInput,
            icon
        };
    }

    function normalizeSites(list) {
        return Array.isArray(list) ? list.map(normalizeSite).filter((s) => s.name && s.url && s.hosts.length && s.searchPath) : [];
    }

    function cloneSites(list) {
        return Array.isArray(list)
            ? list.map((site) => ({
                ...site,
                hosts: site.hosts.slice()
            }))
            : [];
    }

    const DEFAULT_SITES = normalizeSites([
        { name:'Google',     url:'https://www.google.com/search?q=',                hosts:['google.com'],               searchPath:'^/search$',           queryParam:'q',            searchInput:'',            icon:'google.com' },
        { name:'Яндекс',     url:'https://yandex.ru/search/?text=',                 hosts:['yandex.ru'],                searchPath:'^/search',            queryParam:'text',         searchInput:'',            icon:'yandex.ru' },
        { name:'YouTube',    url:'https://www.youtube.com/results?search_query=',   hosts:['youtube.com'],              searchPath:'^/results$',          queryParam:'search_query', searchInput:'',            icon:'youtube.com' },
        { name:'Ozon',       url:'https://www.ozon.ru/search/?text=',               hosts:['ozon.ru','ozon.com'],       searchPath:'^/search',            queryParam:'text',         searchInput:'',            icon:'ozon.ru' },
        { name:'WB',         url:'https://www.wildberries.ru/catalog/0/search.aspx?search=', hosts:['wildberries.ru'], searchPath:'search\\.aspx$',    queryParam:'search',      searchInput:'#searchInput',icon:'wildberries.ru' },
        { name:'AliExpress', url:'https://www.aliexpress.ru/wholesale?SearchText=', hosts:['aliexpress.com','aliexpress.ru'], searchPath:'/(wholesale|popular)/',queryParam:'SearchText', searchInput:'#SearchText',icon:'aliexpress.com' },
        { name:'Кинориум',   url:'https://ru.kinorium.com/search/?q=',              hosts:['kinorium.com'],             searchPath:'^/search',            queryParam:'q',            searchInput:'',            icon:'kinorium.com' },
    ]);

    let SITES = cloneSites(DEFAULT_SITES);

    const lastQueries = new Map();
    const badPatterns = new Set();

    function siteKey(site) {
        if (site && Array.isArray(site.hosts) && site.hosts.length) {
            return site.hosts.join(',');
        }
        if (site && site.url) return site.url;
        return site && site.name ? site.name : 'default';
    }

    function rememberQuery(site, value) {
        if (!site) return;
        const trimmed = typeof value === 'string' ? value.trim() : '';
        if (!trimmed) return;
        lastQueries.set(siteKey(site), trimmed);
    }

    function recallQuery(site) {
        return lastQueries.get(siteKey(site)) || '';
    }

    const observedInputs = new WeakSet();

    function bindInputWatcher(site, el) {
        if (!el || observedInputs.has(el)) return;
        const handler = () => rememberQuery(site, el.value);
        el.addEventListener('input', handler, { passive: true });
        el.addEventListener('change', handler, { passive: true });
        observedInputs.add(el);
        setTimeout(handler, 0);
    }

    let hrefPollTimer = null;
    let lastHref = location.href;
    let pendingInitTimer = null;
    let historyHookWarned = false;

    function triggerInit(delay = 60) {
        if (pendingInitTimer) {
            clearTimeout(pendingInitTimer);
        }
        pendingInitTimer = setTimeout(() => {
            pendingInitTimer = null;
            init();
        }, delay);
    }

    function checkHrefChange() {
        if (location.href !== lastHref) {
            lastHref = location.href;
            triggerInit();
        }
    }

    function matchesSearchPath(site) {
        if (!site || !site.searchPath) return false;
        try {
            return new RegExp(site.searchPath).test(location.pathname);
        } catch (err) {
            if (!badPatterns.has(site.searchPath)) {
                badPatterns.add(site.searchPath);
                console.warn('MultiSearch: неверный searchPath', site.searchPath, err);
            }
            return false;
        }
    }

    const gm = (() => {
        const get = async (key, fallback = null) => {
            if (typeof GM_getValue === 'function') {
                try {
                    return await GM_getValue(key, fallback);
                } catch (err) {
                    console.warn('MultiSearch: GM_getValue failed', err);
                }
            }
            if (typeof GM !== 'undefined' && typeof GM.getValue === 'function') {
                try {
                    return await GM.getValue(key, fallback);
                } catch (err) {
                    console.warn('MultiSearch: GM.getValue failed', err);
                }
            }
            try {
                const raw = localStorage.getItem(LOCAL_PREFIX + key);
                return raw === null ? fallback : raw;
            } catch (err) {
                console.warn('MultiSearch: localStorage get failed', err);
            }
            return fallback;
        };

        const set = async (key, value) => {
            if (typeof GM_setValue === 'function') {
                try {
                    await GM_setValue(key, value);
                    return;
                } catch (err) {
                    console.warn('MultiSearch: GM_setValue failed', err);
                }
            }
            if (typeof GM !== 'undefined' && typeof GM.setValue === 'function') {
                try {
                    await GM.setValue(key, value);
                    return;
                } catch (err) {
                    console.warn('MultiSearch: GM.setValue failed', err);
                }
            }
            try {
                localStorage.setItem(LOCAL_PREFIX + key, value);
            } catch (err) {
                console.warn('MultiSearch: localStorage set failed', err);
            }
        };

        const registerMenu = (label, handler) => {
            if (typeof GM_registerMenuCommand === 'function') {
                try {
                    GM_registerMenuCommand(label, handler);
                    return true;
                } catch (err) {
                    console.warn('MultiSearch: GM_registerMenuCommand failed', err);
                }
            }
            if (typeof GM !== 'undefined' && typeof GM.registerMenuCommand === 'function') {
                try {
                    GM.registerMenuCommand(label, handler);
                    return true;
                } catch (err) {
                    console.warn('MultiSearch: GM.registerMenuCommand failed', err);
                }
            }
            return false;
        };

        return { get, set, registerMenu };
    })();

    async function loadSites() {
        const raw = await gm.get(STORAGE_KEY, null);
        if (!raw) {
            const defaults = cloneSites(DEFAULT_SITES);
            await gm.set(STORAGE_KEY, stringifySites(defaults));
            return defaults;
        }
        let parsed = raw;
        if (typeof raw === 'string') {
            try {
                parsed = JSON.parse(raw);
            } catch (err) {
                console.warn('MultiSearch: cannot parse stored sites, reset to defaults', err);
                const defaults = cloneSites(DEFAULT_SITES);
                await gm.set(STORAGE_KEY, stringifySites(defaults));
                return defaults;
            }
        }
        const normalized = normalizeSites(parsed);
        if (!normalized.length) {
            const defaults = cloneSites(DEFAULT_SITES);
            await gm.set(STORAGE_KEY, stringifySites(defaults));
            return defaults;
        }
        await gm.set(STORAGE_KEY, stringifySites(normalized));
        return normalized;
    }

    async function saveSites(list) {
        await gm.set(STORAGE_KEY, stringifySites(list));
    }

    function openSettings() {
        if (document.getElementById('msSettingsOverlay')) return;

        const SETTINGS_CSS = `
#msSettingsOverlay *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#000}
#msSettingsOverlay h2{margin-top:0}
#msSettingsTable{width:100%;border-collapse:collapse}
#msSettingsTable th,#msSettingsTable td{border:1px solid #ccc;padding:6px}
#msSettingsTable thead{background:#f0f0f0;position:sticky;top:0}
#msSettingsTable input{width:100%;min-width:150px;padding:4px;background:#fff;color:#000}
#msSettingsTable td:nth-child(2) input,
#msSettingsTable td:nth-child(3) input{min-width:260px}
#msSettingsOverlay button{background:#e6e6e6;border:1px solid #bbb;border-radius:4px;padding:4px 10px;cursor:pointer}
#msSettingsOverlay button:hover{background:#dcdcdc}
        `;
        if (!document.getElementById('msSettingsCSS')) {
            const st = document.createElement('style');
            st.id = 'msSettingsCSS';
            st.textContent = SETTINGS_CSS;
            document.head.appendChild(st);
        }

        const ov = document.createElement('div');
        ov.id = 'msSettingsOverlay';
        Object.assign(ov.style, {
            position:'fixed', top:0, left:0, right:0, bottom:0,
            background:'rgba(0,0,0,0.5)', zIndex:2147483646,
            display:'flex', alignItems:'center', justifyContent:'center'
        });

        const box = document.createElement('div');
        Object.assign(box.style, {
            background:'#fff', padding:'20px', borderRadius:'8px',
            width:'95%', maxWidth:'90%', maxHeight:'90%', overflow:'auto',
            boxShadow:'0 2px 10px rgba(0,0,0,0.3)'
        });
        box.innerHTML = `
      <h2>Настройки «Мультипоиска»</h2>
      <table id="msSettingsTable">
        <thead>
          <tr>
            <th title="Название кнопки">Name*</th>
            <th title="Адрес поиска до запроса, например https://site.com/search?q=">URL*</th>
            <th title="Домены, где кнопки активны, через запятую">Hosts*</th>
            <th title="RegExp пути страницы поиска">SearchPath*</th>
            <th title="GET‑параметр с запросом (необязательно)">QueryParam</th>
            <th title="CSS‑селектор поля ввода (если нет QueryParam)">SearchInput</th>
            <th title="Домен или URL favicon">Icon</th>
            <th>–</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>

      <div style="text-align:right;margin:10px 0">
        <button id="msResetDefaults">Сбросить</button>
        <button id="msAddRow" style="margin-left:8px">Добавить строку</button>
        <button id="msCancel" style="margin-left:8px">Отмена</button>
        <button id="msSave" style="margin-left:8px">Сохранить</button>
      </div>

      <ul style="font-size:0.85em;color:#555;margin:0;padding-left:18px">
        <li><b>Name</b> — подпись кнопки.</li>
        <li><b>URL</b> — адрес поиска до запроса (<i>https://site.com/search?q=</i>). Поищите что-нибудь на сайте и определите неизменную часть в поле адреса.</li>
        <li><b>Hosts</b> — домены сервиса (<i>site.com,*.site.ru</i>), на которых будет отображаться меню переключения.</li>
        <li><b>SearchPath</b> — RegExp (регулярное выражение) пути страницы поиска (без «/») для корректного извлечения запроса.</li>
        <li><b>QueryParam</b> — необязателен; если пусто, берётся из <b>URL</b> автоматически, но могут быть ошибки.</li>
        <li><b>SearchInput</b> — CSS‑селектор поля, где набирается текст (если QueryParam нет).</li>
        <li><b>Icon</b> — домен или URL favicon (оставьте домен, если не уверены). Иконка получается через запрос к google.</li>
      </ul>
    `;
        ov.appendChild(box);
        document.body.appendChild(ov);

        const tbody = box.querySelector('tbody');
        const addRow = (data = {}) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
        <td><input type="text" class="c_name"  value="${data.name||''}"></td>
        <td><input type="text" class="c_url"   value="${data.url||''}"  style="min-width:260px"></td>
        <td><input type="text" class="c_hosts" value="${(data.hosts||[]).join(',')}" style="min-width:260px"></td>
        <td><input type="text" class="c_path"  value="${data.searchPath||''}"></td>
        <td><input type="text" class="c_qp"    value="${data.queryParam||''}"></td>
        <td><input type="text" class="c_si"    value="${data.searchInput||''}"></td>
        <td><input type="text" class="c_icon"  value="${data.icon||''}"></td>
        <td><button class="c_delete">✕</button></td>
      `;
            tr.querySelector('.c_delete').onclick = () => tr.remove();
            tbody.appendChild(tr);
        };

        SITES.forEach((s) => addRow(s));
        addRow();

        box.querySelector('#msAddRow').onclick = () => addRow();
        box.querySelector('#msCancel').onclick = () => ov.remove();

        box.querySelector('#msResetDefaults').onclick = async () => {
            if (confirm('Сбросить все настройки к исходным?')) {
                const defaults = cloneSites(DEFAULT_SITES);
                await saveSites(defaults);
                SITES = defaults;
                alert('Сброшено. Перезагрузите страницу.');
                ov.remove();
            }
        };

        box.querySelector('#msSave').onclick = async () => {
            const newArr = [];
            let bad = false;
            tbody.querySelectorAll('tr').forEach((tr) => {
                const name  = tr.querySelector('.c_name').value.trim();
                const url   = tr.querySelector('.c_url').value.trim();
                const hosts = tr.querySelector('.c_hosts').value.trim();
                const path  = tr.querySelector('.c_path').value.trim();
                if (!name && !url && !hosts && !path) return;
                if (!name || !url || !hosts || !path) { bad = true; return; }
                newArr.push({
                    name,
                    url,
                    hosts: hosts.split(',').map((h) => h.trim()).filter(Boolean),
                    searchPath: path,
                    queryParam: tr.querySelector('.c_qp').value.trim() || null,
                    searchInput: tr.querySelector('.c_si').value.trim() || '',
                    icon: tr.querySelector('.c_icon').value.trim()
                });
            });
            if (bad) return alert('Заполните все поля с «*» или удалите пустые строки.');
            const prepared = normalizeSites(newArr);
            if (!prepared.length) return alert('Нет валидных записей для сохранения.');
            await saveSites(prepared);
            SITES = cloneSites(prepared);
            alert('Сохранено! Перезагрузите страницу, чтобы применить изменения.');
            ov.remove();
        };
    }

    if (!gm.registerMenu('⚙ Настройки Мультипоиска', openSettings)) {
        window.multiSearchOpenSettings = openSettings;
    } else {
        window.multiSearchOpenSettings = openSettings;
    }

    const PANEL_CSS = `
#multiSearchPanel {
  position: fixed; top:50%; left:0;
  transform: translateY(-50%);
  background: rgba(255,255,255,.35);
  backdrop-filter: blur(4px);
  border-top-right-radius:10px;
  border-bottom-right-radius:10px;
  padding:4px; z-index:2147483647;
  display:flex; flex-direction:column; gap:6px;
}
.multiSearchBtn {
  width:32px; height:32px;
  background:rgba(255,255,255,.6);
  border:1px solid rgba(0,0,0,.1);
  border-radius:6px; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  position:relative; transition:.2s background;
  color:#111; font-size:16px;
}
.multiSearchBtn:hover { background:rgba(255,255,255,.95) }
.multiSearchBtn img { width:18px; height:18px; }
.multiSearchBtn[data-tip]::after {
  content: attr(data-tip);
  position:absolute; left:40px;
  background:#333; color:#fff;
  font-size:12px; padding:2px 6px;
  border-radius:4px; opacity:0; transition:.2s;
  white-space:nowrap;
  pointer-events:none;
}
.multiSearchBtn:hover::after { opacity:1 }
`;

    const ICON_SRC = (d) => `https://www.google.com/s2/favicons?sz=32&domain=${d}`;

    function injectStyles(css) {
        if (document.getElementById('multiSearchPanelCSS')) return;
        const st = document.createElement('style');
        st.id = 'multiSearchPanelCSS';
        st.textContent = css;
        document.head.appendChild(st);
    }

    function guessParamFromUrl(u) {
        try {
            const q = (new URL(u)).search;
            if (q && q.includes('=')) return q.slice(1).split('&').pop().split('=')[0];
        } catch {}
        const p = u.split('?').pop();
        if (p.includes('=')) return p.split('&').pop().split('=')[0];
        return '';
    }

    function getCurrentSite() {
        return SITES.find((s) => s.hosts.some((h) => {
            if (h.startsWith('*.')) return location.hostname.endsWith(h.slice(1));
            return location.hostname === h || location.hostname.endsWith(`.${h}`);
        }));
    }

    function getQueryParamKey(site) {
        if (typeof site.queryParam === 'string' && site.queryParam.trim()) {
            return site.queryParam.trim();
        }
        return guessParamFromUrl(site.url);
    }

    function getQueryFromLocation(site) {
        const key = getQueryParamKey(site);
        if (!key) return '';
        const value = new URLSearchParams(location.search).get(key);
        return value ? value.trim() : '';
    }

    function extractQuery(site) {
        if (site.searchInput) {
            const el = document.querySelector(site.searchInput);
            bindInputWatcher(site, el);
            if (el && typeof el.value === 'string') {
                const value = el.value.trim();
                if (value) {
                    rememberQuery(site, value);
                    return value;
                }
            }
        }
        const fromLocation = getQueryFromLocation(site);
        if (fromLocation) {
            rememberQuery(site, fromLocation);
            return fromLocation;
        }
        return recallQuery(site);
    }

    function isSearchContext(site) {
        if (site.searchInput) {
            const el = document.querySelector(site.searchInput);
            bindInputWatcher(site, el);
            if (el && typeof el.value === 'string') {
                const value = el.value.trim();
                if (value) {
                    rememberQuery(site, value);
                    return true;
                }
            }
        }
        const fromLocation = getQueryFromLocation(site);
        if (fromLocation) {
            rememberQuery(site, fromLocation);
            return true;
        }
        if (matchesSearchPath(site)) {
            return true;
        }
        return false;
    }

    function makeBtn(site, query) {
        const btn = document.createElement('div');
        btn.className = 'multiSearchBtn';
        btn.setAttribute('data-tip', site.name);
        const img = document.createElement('img');
        img.src = ICON_SRC(site.icon || site.hosts[0] || '');
        img.alt = site.name;
        img.onerror = () => {
            img.remove();
            btn.textContent = site.name.slice(0, 2).toUpperCase();
        };
        btn.appendChild(img);
        btn.onclick = () => {
            const target = query ? site.url + encodeURIComponent(query) : site.url;
            window.open(target, '_blank', 'noopener');
        };
        return btn;
    }

    function makeSettingsBtn() {
        const btn = document.createElement('div');
        btn.className = 'multiSearchBtn';
        btn.setAttribute('data-tip', 'Настройки');
        btn.title = 'Настройки мультипоиска';
        const span = document.createElement('span');
        span.textContent = '⚙';
        span.style.fontSize = '18px';
        btn.appendChild(span);
        btn.onclick = () => openSettings();
        return btn;
    }

    function removePanel() {
        const existing = document.getElementById('multiSearchPanel');
        if (existing) existing.remove();
    }

    function buildPanel(current) {
        removePanel();
        const q = extractQuery(current);
        const panel = document.createElement('div');
        panel.id = 'multiSearchPanel';
        SITES.filter((s) => s !== current).forEach((site) => panel.appendChild(makeBtn(site, q)));
        panel.appendChild(makeSettingsBtn());
        document.body.appendChild(panel);
    }

    function init() {
        const current = getCurrentSite();
        if (!current || !isSearchContext(current)) {
            removePanel();
            return;
        }
        injectStyles(PANEL_CSS);
        buildPanel(current);
    }

    function onReady(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn, { once: true });
        } else {
            fn();
        }
    }

    let historyHooked = false;
    function ensureHistoryHooks() {
        if (historyHooked) return;
        historyHooked = true;
        lastHref = location.href;
        ['pushState', 'replaceState'].forEach((method) => {
            const original = history[method];
            if (typeof original !== 'function') return;
            try {
                history[method] = function (...args) {
                    const result = original.apply(this, args);
                    checkHrefChange();
                    return result;
                };
            } catch (err) {
                if (!historyHookWarned) {
                    historyHookWarned = true;
                    console.warn('MultiSearch: history hook blocked', err);
                }
            }
        });
        try { window.addEventListener('popstate', checkHrefChange); } catch (err) {
            if (!historyHookWarned) {
                historyHookWarned = true;
                console.warn('MultiSearch: popstate hook blocked', err);
            }
        }
        try { window.addEventListener('hashchange', checkHrefChange); } catch (err) {
            if (!historyHookWarned) {
                historyHookWarned = true;
                console.warn('MultiSearch: hashchange hook blocked', err);
            }
        }
        if (!hrefPollTimer) {
            hrefPollTimer = setInterval(checkHrefChange, 500);
        }
    }

    async function bootstrap() {
        try {
            SITES = await loadSites();
        } catch (err) {
            console.error('MultiSearch: fallback to defaults from load error', err);
            SITES = cloneSites(DEFAULT_SITES);
        }
        onReady(() => {
            ensureHistoryHooks();
            init();
        });
    }

    bootstrap();
})();






