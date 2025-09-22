// ==UserScript==
// @name         Marketplace Instant Exporter with Reviews
// @namespace    https://nikmedoed.com
// @author       https://nikmedoed.com
// @version      1.0.4
// @description  Export product data + up to 100 reviews as TXT from **Ozon** & **Wildberries** (единый WB‑style формат)
// @match        https://*.ozon.ru/*
// @match        https://*.ozon.com/*
// @match        https://*.wildberries.ru/*
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

    const wait = async (sel, t = 8000, step = 200) => {
        const start = Date.now();
        while (Date.now() - start < t) {
            const el = document.querySelector(sel);
            if (el) return el;
            await sleep(step);
        }
        return null;
    };
    const smooth = async el => {
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(400);
    };
    const createBtn = (node, fn) => {
        if (!node || node.parentElement.querySelector('.mp-export-btn')) return;
        const b = document.createElement('button');
        b.textContent = 'Скачать';
        b.className = 'mp-export-btn';
        b.style.cssText = 'margin-left:8px;padding:4px 8px;font-size:14px;background:#4caf50;color:#fff;border:none;border-radius:4px;cursor:pointer;';
        b.addEventListener('click', fn);
        node.insertAdjacentElement('afterend', b);
    };

    /* =========================================================
        OZON SECTION
  ========================================================= */
    function initOzon() {

        const clickVariantWhenReady = (timeout = 400) => {
            const find = () => [...document.querySelectorAll('button,[role="button"]')]
                .find(el => /этот вариант товара/i.test(el.textContent?.trim()));
            const btn = find();
            if (btn) { btn.click(); return Promise.resolve(true); }
            return new Promise(resolve => {
                const obs = new MutationObserver(() => {
                    const b = find();
                    if (b) { b.click(); obs.disconnect(); resolve(true); }
                });
                obs.observe(document.body, { childList: true, subtree: true });
                setTimeout(() => { obs.disconnect(); resolve(false); }, timeout);
            });
        };

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
            const getDate = (n) => {
                const attrNode =
                    n.getAttribute('publishedat') ||
                    n.getAttribute('publishedAt') ||
                    n.querySelector('[publishedat]')?.getAttribute('publishedat') ||
                    n.querySelector('[datetime]')?.getAttribute('datetime') ||
                    n.querySelector('time')?.getAttribute('datetime');

                if (attrNode) {
                    if (/^\d{10,13}$/.test(attrNode)) {
                        const ms = attrNode.length === 13 ? +attrNode : +attrNode * 1000;
                        return new Date(ms).toLocaleDateString('ru-RU');
                    }
                    const iso = attrNode.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
                    if (iso) {
                        const [y, m, d] = iso.split('-');
                        return `${d}.${m}.${y}`;
                    }
                }
                const maybe = [...n.querySelectorAll('div, span, time')]
                    .map((el) => el.textContent.trim().match(/\d{1,2}\s+\D+\s+\d{4}|\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}/)?.[0])
                    .find(Boolean);
                return maybe || '—';
            };
            const getText = (n) => {
                const findPart = (label) => {
                    const h = [...n.querySelectorAll('div, span')]
                        .find((el) => el.textContent.trim().toLowerCase() === label);
                    return h ? h.parentElement.querySelector('span')?.innerText.trim() : '';
                };
                const pros = findPart('достоинства');
                const cons = findPart('недостатки');
                const comment = findPart('комментарий');
                const parts = [];
                if (pros) parts.push(`Достоинства: ${pros}`);
                if (cons) parts.push(`Недостатки: ${cons}`);
                if (comment) parts.push(`Комментарий: ${comment}`);
                if (parts.length) return parts.join('; ');

                const looksLikeDate = (t) => /^(\d{1,2}[.\/\-]\d{1,2}([.\/\-]\d{2,4})?|\d{1,2}\s+[а-яё]+\s+\d{4})$/i.test(t);
                const span = n.querySelector('span.ro5_30, span[class*="ro5_"]');
                if (span) {
                    const t = span.innerText.trim();
                    if (t && !looksLikeDate(t)) return t;
                }
                const BAD = /Вам помог|Размер|Цвет|коммент|вопрос|ответ/i;
                const leaves = [...n.querySelectorAll('span, div, p')].filter((el) => !el.children.length && !BAD.test(el.innerText));
                const texts = leaves
                    .map((el) => el.innerText.trim())
                    .filter((t) => t.length >= 10 && !looksLikeDate(t));
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
        setInterval(() => createBtn(document.querySelector('[data-widget="webProductHeading"] h1'), exportOzon), 1000);

    }

    /* =========================================================
        WILDBERRIES SECTION
  ========================================================= */
    function initWB() {
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
            const header = document.querySelector('[class^="productHeaderWrap"], .product-page__header-wrap');
            if (!header) return;

            // Brand / Title
            const brand = (document.querySelector('[class^="productHeaderBrand"]')?.innerText || '—').trim();
            const title = (document.querySelector('h1[class^="productTitle"], h1[class*=" productTitle"], .product-page__title')?.innerText || '—').trim();

            // Original mark
            const original = document.querySelector('[class^="productHeader"] [class*="original"]') ? 'Да' : '—';

            // Rating + total reviews
            const rating = (document.querySelector('[class^="productReviewRating"]')?.innerText || '—').trim();
            const reviewsTotal = (document.querySelector('[class^="productReviewCount"]')?.innerText.replace(/\D+/g, '') || '0');

            // Reviews entry link (new + old)
            const reviewsLink = document.querySelector('a[class^="productReview"], a.product-review');

            // Price: prefer wallet price, fallback to final price, strip spaces inside digits
            const priceNode = document.querySelector('[class^="priceBlockWalletPrice"], [class*=" priceBlockWalletPrice"]')
                || document.querySelector('ins[class^="priceBlockFinalPrice"], ins[class*=" priceBlockFinalPrice"]')
                || document.querySelector('span[class^="priceBlockPrice"], span[class*=" priceBlockPrice"], [class*="priceBlock"] [class*="price"], [class*="orderBlock"] [class*="price"]');
            let price = '—';
            if (priceNode) {
                const raw = priceNode.textContent.replace(/\s+/g, '');
                price = raw.replace(/([₽€$])/, ' $1');
            }

            // characteristics & description
            const showBtn = [...document.querySelectorAll('button, a')]
                .find(el => /характеристик|описани/i.test(el.innerText));
            if (showBtn) { showBtn.click(); await sleep(400); }

            // Try to locate details container (new dialog or legacy popup)
            const popup = [...document.querySelectorAll('[role="dialog"], .popup-product-details, [class*="product-details"]')]
                .find(n => /Характеристики|Описание/i.test(n.innerText || ''));

            let chars = '—', descr = '—';
            if (popup) {
                // Characteristics: support both legacy table and new rows
                const rows = [...popup.querySelectorAll('.product-params__row, tr')]
                    .map(r => {
                        const k = (r.querySelector('th, [class*="param"] th, [class*="cell"] .cellDecor--UCLGS, [class*="cellWrapper"]')?.innerText || '')
                            .replace(/[:\s]+$/, '').trim();
                        const v = (r.querySelector('td, [class*="param"] td, [class*="cellCopy"], [class*="cell"] span')?.innerText || '')
                            .trim();
                        return k && v ? `${k}: ${v}` : null;
                    })
                    .filter(Boolean);
                if (rows.length) chars = rows.join('\n');

                // Description: try common containers
                const dEl = popup.querySelector('.product-details__description .option__text, [class*="description"] .option__text, [class*="description"]');
                if (dEl) descr = dEl.innerText.trim();
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
            if (reviewsLink) {
                reviewsLink.click();
                await wait('.product-feedbacks__main, [class*="product-feedbacks__main"]', 10000);
                await sleep(300);
                const variant = [...document.querySelectorAll('.product-feedbacks__tabs .product-feedbacks__title, [class*="product-feedbacks__title"]')]
                    .find(el => /этот вариант товара/i.test(el.innerText));
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
                            .find(n => !n.classList.contains('feedback__text--item-pro') && !n.classList.contains('feedback__text--item-con'))
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

        // Mount button near the title on WB (supports new hashed classes + old one)
        const wbTitleSelector = 'h1[class^="productTitle"], h1[class*=" productTitle"], .product-page__title';
        setInterval(() => createBtn(document.querySelector(wbTitleSelector), exportWB), 1000);

    }

    /* =========================================================
        ENTRY POINT
  ========================================================= */
    const host = location.hostname;
    if (host.endsWith('ozon.ru') || host.endsWith('ozon.com')) {
        initOzon();
    } else if (host.includes('wildberries')) {
        initWB();
    }
})();
