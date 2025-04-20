// ==UserScript==
// @name         Мультипоиск
// @namespace    http://tampermonkey.net/
// @author       http://t.me/nikmedoed
// @description  Гибкая панель для повторного поиска на других сайтах.
// @version      0.5.4
// @match        *://*/*
// @icon64       https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/multisearch.png
// @icon         https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/multisearch.png
// @downloadURL  https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/multisearch.user.js
// @updateURL    https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/multisearch.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(() => {
    'use strict';

    /* ---------- 1. ДЕФОЛТНЫЕ САЙТЫ ---------- */
    const DEFAULT_SITES = [
        { name:'Google',     url:'https://www.google.com/search?q=',                hosts:['google.com'],               searchPath:'^/search$',           queryParam:'q',            searchInput:'',            icon:'google.com' },
        { name:'Яндекс',     url:'https://yandex.ru/search/?text=',                 hosts:['yandex.ru'],                searchPath:'^/search',            queryParam:'text',         searchInput:'',            icon:'yandex.ru' },
        { name:'YouTube',    url:'https://www.youtube.com/results?search_query=',   hosts:['youtube.com'],              searchPath:'^/results$',          queryParam:'search_query',searchInput:'',            icon:'youtube.com' },
        { name:'Ozon',       url:'https://www.ozon.ru/search/?text=',               hosts:['ozon.ru','ozon.com'],       searchPath:'^/search',            queryParam:'text',         searchInput:'',            icon:'ozon.ru' },
        { name:'WB',         url:'https://www.wildberries.ru/catalog/0/search.aspx?search=', hosts:['wildberries.ru'], searchPath:'search\\.aspx$',    queryParam:'search',      searchInput:'#searchInput',icon:'wildberries.ru' },
        { name:'AliExpress', url:'https://www.aliexpress.com/wholesale?SearchText=', hosts:['aliexpress.com','aliexpress.ru'], searchPath:'/(wholesale|popular)/',queryParam:'SearchText', searchInput:'#SearchText',icon:'aliexpress.com' },
        { name:'Кинориум',   url:'https://ru.kinorium.com/search/?q=',              hosts:['kinorium.com'],             searchPath:'^/search',            queryParam:'q',            searchInput:'',            icon:'kinorium.com' },
    ];

    /* ---------- 2. ЗАГРУЗКА / СБРОС ---------- */
    function loadSites() {
        const raw = GM_getValue('sites');
        if (!raw) {
            GM_setValue('sites', JSON.stringify(DEFAULT_SITES));
            return DEFAULT_SITES.slice();
        }
        try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) return arr;
        } catch {}
        GM_setValue('sites', JSON.stringify(DEFAULT_SITES));
        return DEFAULT_SITES.slice();
    }
    let SITES = loadSites();

    /* ---------- 3. НАСТРОЙКИ ---------- */
    function openSettings() {
        if (document.getElementById('msSettingsOverlay')) return;

        /* CSS только для окна настроек */
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

        /* --- overlay --- */
        const ov = document.createElement('div');
        ov.id = 'msSettingsOverlay';
        Object.assign(ov.style, {
            position:'fixed', top:0, left:0, right:0, bottom:0,
            background:'rgba(0,0,0,0.5)', zIndex:2147483646,
            display:'flex', alignItems:'center', justifyContent:'center'
        });

        /* --- container --- */
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
        function addRow(data = {}) {
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
      }

        /* заполнить существующие */
        SITES.forEach(s => addRow(s));
        addRow(); // пустая строка

        box.querySelector('#msAddRow').onclick = () => addRow();
        box.querySelector('#msCancel').onclick = () => ov.remove();

        box.querySelector('#msResetDefaults').onclick = () => {
            if (confirm('Сбросить все настройки к исходным?')) {
                GM_setValue('sites', JSON.stringify(DEFAULT_SITES));
                SITES = DEFAULT_SITES.slice();
                alert('Сброшено. Перезагрузите страницу.');
                ov.remove();
            }
        };

        box.querySelector('#msSave').onclick = () => {
            const newArr = [];
            let bad = false;
            tbody.querySelectorAll('tr').forEach(tr => {
                const name  = tr.querySelector('.c_name').value.trim();
                const url   = tr.querySelector('.c_url').value.trim();
                const hosts = tr.querySelector('.c_hosts').value.trim();
                const path  = tr.querySelector('.c_path').value.trim();
                if (!name && !url && !hosts && !path) return; // пустая строка
                if (!name || !url || !hosts || !path) { bad = true; return; }
                newArr.push({
                    name,
                    url,
                    hosts: hosts.split(',').map(h => h.trim()).filter(Boolean),
                    searchPath: path,
                    queryParam: tr.querySelector('.c_qp').value.trim() || null,
                    searchInput: tr.querySelector('.c_si').value.trim() || null,
                    icon: tr.querySelector('.c_icon').value.trim()
                });
            });
            if (bad) return alert('Заполните все поля с «*» или удалите пустые строки.');
            GM_setValue('sites', JSON.stringify(newArr, null, 2));
            SITES = newArr;
            alert('Сохранено! Перезагрузите страницу, чтобы применить изменения.');
            ov.remove();
        };
    }

    GM_registerMenuCommand('⚙ Настройки Мультипоиска', openSettings);

    /* ---------- 4. ПАНЕЛЬ ---------- */
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
}
.multiSearchBtn:hover::after { opacity:1 }
`;
    const ICON_SRC = d => `https://www.google.com/s2/favicons?sz=32&domain=${d}`;

    function injectStyles(css) {
        const st = document.createElement('style');
        st.textContent = css;
        document.head.appendChild(st);
    }

    function guessParamFromUrl(u) {
        try {
            const q = (new URL(u)).search;           // "?q="
            if (q && q.includes('=')) return q.slice(1).split('&').pop().split('=')[0];
        } catch {}
        // fallback: последний «?» → до «=»
        const p = u.split('?').pop();
        if (p.includes('=')) return p.split('&').pop().split('=')[0];
        return '';
    }

    function getCurrentSite() {
        return SITES.find(s => s.hosts.some(h => location.hostname.endsWith(h)));
    }
    function isSearchContext(s) {
        if (s.searchInput && document.querySelector(s.searchInput)) return true;
        if (s.searchPath && new RegExp(s.searchPath).test(location.pathname)) return true;
        return false;
    }
    function extractQuery(s) {
        if (s.searchInput) {
            const el = document.querySelector(s.searchInput);
            if (el && el.value.trim()) return el.value.trim();
        }
        const qp = s.queryParam || guessParamFromUrl(s.url);
        if (qp) {
            const v = new URLSearchParams(location.search).get(qp);
            if (v) return v.trim();
        }
        return '';
    }
    function makeBtn(s, q) {
        const btn = document.createElement('div');
        btn.className = 'multiSearchBtn';
        btn.setAttribute('data-tip', s.name);
        const img = document.createElement('img');
        img.src = ICON_SRC(s.icon); img.alt = s.name;
        img.onerror = () => btn.textContent = s.name[0];
        btn.appendChild(img);
        btn.onclick = () => window.open(q ? s.url + encodeURIComponent(q) : s.url, '_blank', 'noopener');
        return btn;
    }
    function buildPanel(cur) {
        const q = extractQuery(cur);
        const p = document.createElement('div');
        p.id = 'multiSearchPanel';
        SITES.filter(s => s !== cur).forEach(s => p.appendChild(makeBtn(s, q)));
        document.body.appendChild(p);
    }

    window.addEventListener('load', () => {
        const cur = getCurrentSite();
        if (!cur || !isSearchContext(cur)) return;
        injectStyles(PANEL_CSS);
        buildPanel(cur);
    });
})();
