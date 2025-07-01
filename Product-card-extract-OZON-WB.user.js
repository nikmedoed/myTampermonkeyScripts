// ==UserScript==
// @name         Marketplace Instant Exporter with Reviews
// @namespace    https://nikmedoed.github.io
// @author       http://t.me/nikmedoed
// @version      1.0.1
// @description  Export product data + up to 100 reviews as TXT from **Ozon** & **Wildberries** (единый WB‑style формат)
// @match        https://*.ozon.ru/*
// @match        https://*.ozon.com/*
// @match        https://www.wildberries.ru/*
// @grant        GM_download
// @sandbox      DOM
// @run-at       document-idle
// @icon64       https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/ozon-wb-download.png
// @icon         https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/ozon-wb-download.png
// @downloadURL  https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/Product-card-extract-OZON-WB.user.js
// @updateURL    https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/Product-card-extract-OZON-WB.user.js
// ==/UserScript==

(function () {
    'use strict';
    /* =========================================================
        SHARED HELPERS
  ========================================================= */
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const slug = (s) =>
    (s || 'export')
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04ff]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);

    /* =========================================================
        OZON SECTION
  ========================================================= */
    function initOzon() {
        /* ---------- inner helpers ---------- */
        async function wait(sel, timeout = 8e3) {
            const t0 = Date.now();
            while (Date.now() - t0 < timeout) {
                const el = document.querySelector(sel);
                if (el) return el;
                await sleep(120);
            }
            return null;
        }
        async function smooth(el) {
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await sleep(400);
            }
        }

        function clickVariantWhenReady(timeout = 5000) {
            const findBtn = () =>
                Array.from(document.querySelectorAll('button,[role="button"]'))
                    .find((el) => /этот вариант товара/i.test(el.textContent?.trim()));

            const btn = findBtn();
            if (btn) { btn.click(); return Promise.resolve(true); }

            return new Promise((resolve) => {
                const obs = new MutationObserver(() => {
                    const b = findBtn();
                    if (b) {
                        b.click();
                        obs.disconnect();
                        resolve(true);
                    }
                });
                obs.observe(document.body, { childList: true, subtree: true });
                setTimeout(() => { obs.disconnect(); resolve(false); }, timeout);
            });
        }

        /* ------- collect product info ------- */
        async function collectInfo() {
            const url = location.href;
            const title = (await wait('[data-widget="webProductHeading"] h1'))?.innerText.trim() || '—';

            // brand from breadcrumbs → последний li span
            let brand = '—';
            const bc = document.querySelector('[data-widget="breadCrumbs"] ol');
            if (bc) {
                const spans = bc.querySelectorAll('li span');
                if (spans.length) brand = spans[spans.length - 1].innerText.trim();
            }
            if (brand === '—') {
                const bwrap = document.querySelector('[data-widget="webBrand"]');
                const bnode = bwrap?.querySelector('a, span, div');
                if (bnode) brand = bnode.innerText.trim();
            }

            const origMark = document.querySelector('[data-widget="webBrand"] svg path[fill]') ? 'Да' : '—';

            const pWrap = await wait('[data-widget="webPrice"]');
            const price = pWrap?.querySelector('span')?.innerText.replace(/\s+/g, ' ').trim() || '—';
            const unit = [...pWrap?.querySelectorAll('div') || []]
            .map((d) => d.innerText.trim())
            .find((t) => /за.*шт/i.test(t)) || '';

            // description
            let desc = '—';
            const dSec = await wait('#section-description', 1e4);
            if (dSec) {
                await smooth(dSec);
                dSec.querySelector('button')?.click();
                await sleep(300);
                desc = dSec.innerText.replace(/^[Оо] (товаре|продукте):?/i, '').replace(/\n{2,}/g, '\n').trim() || '—';
            }

            // characteristics
            let chars = '—';
            const cSec = await wait('#section-characteristics', 1e4);
            if (cSec) {
                await smooth(cSec);
                const rows = [];
                cSec.querySelectorAll('dl').forEach((dl) => {
                    const k = dl.querySelector('dt')?.innerText.replace(/[:\s]+$/, '').trim();
                    const v = dl.querySelector('dd')?.innerText.trim();
                    if (k && v) rows.push(`${k}: ${v}`);
                });
                if (rows.length) chars = rows.join('\n');
            }

            return { url, title, brand, origMark, price, unit, desc, chars };
        }

        /* --------- reviews ---------- */
        async function loadReviews(max = 100) {
            const hSpan = [...document.querySelectorAll('span')].find((s) => /Отзывы о товаре/i.test(s.textContent));
            if (!hSpan) return { header: 'Отзывы: нет отзывов.', items: [] };

            await smooth(hSpan);

            await clickVariantWhenReady();
            await sleep(600);

            const declared = parseInt(hSpan.parentElement.querySelector('span:not(:first-child)')?.innerText.replace(/\s+/g, '') || '0', 10) || 0;
            const avg = [...document.querySelectorAll('span')].find((s) => /\d+[.,]\d+\s*\/\s*5/.test(s.textContent.trim()))?.innerText.trim() || '—';

            /* dynamic load */
            const moreBtn = () => [...document.querySelectorAll('button')].find((b) => /ещё/i.test(b.innerText));
            const DELAY = 600, MAX_IDLE = 6;
            let idle = 0;
            while (document.querySelectorAll('[data-review-uuid]').length < Math.min(max, declared || max) && idle < MAX_IDLE) {
                const before = document.querySelectorAll('[data-review-uuid]').length;
                moreBtn()?.click() || window.scrollBy(0, window.innerHeight * 0.8);
                await sleep(DELAY);
                const after = document.querySelectorAll('[data-review-uuid]').length;
                idle = after === before ? idle + 1 : 0;
            }

            const nodes = [...document.querySelectorAll('[data-review-uuid]')].slice(0, max);
            const orange = 'rgb(255, 165, 0)';
            const starsCnt = (n) => [...n.querySelectorAll('svg')].filter((s) => s.style.color === orange).length || '—';
            const getDate = (n) => n.querySelector('div.or4_30, div[class*="or4_"]')?.innerText.trim() || '—';
            const getText = (n) => {
                const span = n.querySelector('span.ro5_30, span[class*="ro5_"]');
                if (span) return span.innerText.trim();
                const BAD = /Вам помог|Размер|Цвет|коммент|вопрос|ответ/i;
                const leaves = [...n.querySelectorAll('span, div, p')].filter((el) => !el.children.length && !BAD.test(el.innerText));
                const texts = leaves.map((el) => el.innerText.trim()).filter((t) => t.length >= 10);
                texts.sort((a, b) => b.length - a.length);
                return texts[0] || '—';
            };

            const items = nodes.map((n, i) => `Отзыв ${i + 1} (${getDate(n)}): ${starsCnt(n)}★; ${getText(n).replace(/\s+/g, ' ')}`);
            const header = `Отзывы (выгружено ${items.length}${declared ? ` из ${declared}` : ''}, средняя оценка: ${avg})`;
            return { header, items };
        }

        async function exportOzon() {
            try {
                const info = await collectInfo();
                const rev = await loadReviews(100);

                const out = [
                    `URL: ${info.url}`,
                    `Производитель: ${info.brand}`,
                    `Заголовок: ${info.title}`,
                    `Оригинал: ${info.origMark}`,
                    `Цена: ${info.price}`,
                ];
                if (info.unit) out.push(`Цена за единицу: ${info.unit}`);
                out.push('', 'Описание товара:', info.desc, '', 'Характеристики:', info.chars, '', rev.header, ...rev.items);

                const txt = out.join('\n');
                const name = slug(info.brand + ' ' + info.title) + '.txt';
                GM_download({ url: 'data:text/plain;charset=utf-8,\uFEFF' + encodeURIComponent(txt), name, saveAs: false });
                try { await navigator.clipboard.writeText(txt); } catch (_) {}
            } catch (err) {
                console.error('Ozon exporter:', err);
            }
        }

        /* ------ button ------ */
        function addBtn() {
            const wrap = document.querySelector('[data-widget="webProductHeading"]');
            if (!wrap || wrap.querySelector('.mp-export-btn')) return;
            const h1 = wrap.querySelector('h1');
            if (!h1) return;
            const btn = document.createElement('button');
            btn.textContent = 'Скачать';
            btn.className = 'mp-export-btn';
            btn.style.cssText = 'margin-left:8px;padding:4px 8px;font-size:14px;background:#4caf50;color:#fff;border:none;border-radius:4px;cursor:pointer;';
            btn.addEventListener('click', exportOzon);
            h1.insertAdjacentElement('afterend', btn);
        }
        setInterval(addBtn, 1000);
    }

    /* =========================================================
        WILDBERRIES SECTION
  ========================================================= */
    function initWB() {
        async function waitSel(sel, t = 8e3) {
            const t0 = Date.now();
            while (Date.now() - t0 < t) {
                const el = document.querySelector(sel);
                if (el) return el;
                await sleep(200);
            }
            return null;
        }

        async function loadWBReviews(max = 100) {
            const DELAY = 600, MAX_IDLE = 6;
            let idle = 0, prev = 0;
            while (true) {
                const items = document.querySelectorAll('li.comments__item');
                if (items.length >= max) break;
                if (items.length) items[items.length - 1].scrollIntoView({ block: 'end', behavior: 'smooth' });
                else window.scrollBy(0, 300);
                await sleep(DELAY);
                const now = document.querySelectorAll('li.comments__item').length;
                if (now === prev) { if (++idle >= MAX_IDLE) break; } else { prev = now; idle = 0; }
            }
            return [...document.querySelectorAll('li.comments__item')].slice(0, max);
        }

        async function exportWB() {
            const url = location.href;
            const header = document.querySelector('.product-page__header-wrap');
            if (!header) return;

            const brand = header.querySelector('.product-page__header-brand')?.innerText.trim() || '—';
            const title = header.querySelector('.product-page__title')?.innerText.trim() || '—';
            const original = header.querySelector('.product-page__original-mark') ? 'Да' : '—';
            const rating = header.querySelector('.product-review__rating')?.innerText.trim() || '—';
            const reviewsTotal = header.querySelector('.product-review__count-review')?.innerText.replace(/\D+/g, '') || '0';
            const priceEl = document.querySelector('.product-page__price-block--aside .price-block__wallet-price') || document.querySelector('.product-page__price-block--aside .price-block__price');
            const price = priceEl?.innerText.replace(/\s+/g, ' ').trim() || '—';

            // characteristics & description
            const showBtn = [...document.querySelectorAll('button, a')].find((el) => /характеристик|описани/i.test(el.innerText));
            if (showBtn) { showBtn.click(); await sleep(400); }
            const popup = document.querySelector('.popup-product-details.shown');
            let chars = '—', descr = '—';
            if (popup) {
                const rows = [...popup.querySelectorAll('.product-params__row')]
                .map((r) => {
                    const k = r.querySelector('th')?.innerText.trim().replace(/[:\s]+$/, '');
                    const v = r.querySelector('td')?.innerText.trim();
                    return k && v ? `${k}: ${v}` : null;
                })
                .filter(Boolean);
                if (rows.length) chars = rows.join('\n');
                const dEl = popup.querySelector('.product-details__description .option__text');
                if (dEl) descr = dEl.innerText.trim();
                popup.querySelector('.popup__close')?.click();
            }

            const lines = [
                `URL: ${url}`,
                `Производитель: ${brand}`,
                `Заголовок: ${title}`,
                `Оригинал: ${original}`,
                `Цена: ${price}`,
                `Рейтинг: ${rating} (${reviewsTotal} оценок)`,
                '',
                'Описание товара:',
                descr,
                '',
                'Характеристики:',
                chars,
            ];

            // reviews
            const btn = header.querySelector('a.product-review');
            if (btn) {
                btn.click();
                await waitSel('.product-feedbacks__main', 10000);
                await sleep(300);
                const variant = [...document.querySelectorAll('.product-feedbacks__tabs .product-feedbacks__title')].find((el) => /этот вариант товара/i.test(el.innerText));
                if (variant) { variant.click(); await sleep(300); }
                const revs = await loadWBReviews(100);
                lines.push('', `Отзывы (выгружено ${revs.length}):`);
                if (revs.length) {
                    revs.forEach((el, idx) => {
                        const date = el.querySelector('.feedback__date')?.innerText.trim() || '—';
                        const star = el.querySelector('.feedback__rating');
                        const cls = star && [...star.classList].find((c) => /^star\d+$/.test(c));
                        const rate = cls ? cls.replace('star', '') + '★' : '—';
                        const purchased = el.querySelector('.feedback__state--text')?.innerText.trim() || '—';
                        const parts = [`${rate}, ${purchased}`];
                        const pros = el.querySelector('.feedback__text--item-pro')?.innerText.replace(/^Достоинства:/, '').trim();
                        if (pros) parts.push(`Достоинства: ${pros}`);
                        const cons = el.querySelector('.feedback__text--item-con')?.innerText.replace(/^Недостатки:/, '').trim();
                        if (cons) parts.push(`Недостатки: ${cons}`);
                        const free = [...el.querySelectorAll('.feedback__text--item')]
                        .find((n) => !n.classList.contains('feedback__text--item-pro') && !n.classList.contains('feedback__text--item-con'))
                        ?.innerText.replace(/^Комментарий:/, '').trim();
                        if (free) parts.push(`Комментарий: ${free}`);
                        lines.push(`Отзыв ${idx + 1} (${date}): ${parts.join('; ')}`);
                    });
                } else lines.push('Нет отзывов');
            }

            const txt = lines.join('\n');
            const fname = slug(brand + ' ' + title) + '.txt';
            GM_download({ url: 'data:text/plain;charset=utf-8,\uFEFF' + encodeURIComponent(txt), name: fname, saveAs: false });
        }

        function addBtn() {
            const header = document.querySelector('.product-page__header-wrap');
            if (!header || header.querySelector('.mp-export-btn')) return;
            const titleEl = header.querySelector('.product-page__title');
            if (!titleEl) return;
            const btn = document.createElement('button');
            btn.textContent = 'Скачать';
            btn.className = 'mp-export-btn';
            btn.style.cssText = 'margin-left:8px;padding:4px 8px;font-size:14px;background:#4caf50;color:#fff;border:none;border-radius:4px;cursor:pointer;';
            btn.addEventListener('click', exportWB);
            titleEl.insertAdjacentElement('afterend', btn);
        }
        setInterval(addBtn, 1000);
    }

    /* =========================================================
        ENTRY POINT
  ========================================================= */
    const host = location.hostname;
    if (/ozon\.(ru|com)$/.test(host)) {
        initOzon();
    } else if (host.includes('wildberries')) {
        initWB();
    }
})();
