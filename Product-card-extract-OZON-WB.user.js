// ==UserScript==
// @name         Marketplace Instant Exporter with Reviews
// @namespace    https://nikmedoed.com
// @author       https://nikmedoed.com
// @version      1.2.0
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
    const ensureScrollTopButton = (() => {
        let btn = null;
        let scrollAttached = false;
        const position = { bottom: '24px', right: '24px' };
        const toCssUnit = (value) => typeof value === 'number' ? `${value}px` : value;
        const applyPosition = () => {
            if (!btn) return;
            btn.style.bottom = toCssUnit(position.bottom);
            btn.style.right = toCssUnit(position.right);
        };
        const toggle = () => {
            if (!btn) return;
            const shouldShow = window.scrollY > window.innerHeight * 0.5;
            btn.style.opacity = shouldShow ? '1' : '0';
            btn.style.pointerEvents = shouldShow ? 'auto' : 'none';
        };
        return (opts = {}) => {
            if (opts.bottom !== undefined) position.bottom = opts.bottom;
            if (opts.right !== undefined) position.right = opts.right;
            if (!btn) {
                btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'mp-scroll-top-btn';
                btn.innerHTML = '&#8593;';
                btn.style.cssText = 'position:fixed;width:46px;height:46px;border-radius:50%;border:none;background:#1a73e8;color:#fff;font-size:24px;line-height:1;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(0,0,0,0.2);cursor:pointer;opacity:0;pointer-events:none;transition:opacity 0.2s ease;z-index:2147483647;';
                btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
                document.body.appendChild(btn);
                applyPosition();
                requestAnimationFrame(toggle);
            } else {
                applyPosition();
            }
            if (!scrollAttached) {
                scrollAttached = true;
                window.addEventListener('scroll', toggle, { passive: true });
                window.addEventListener('resize', toggle);
            }
            toggle();
            return btn;
        };
    })();
    const createBtn = (node, fn) => {
        if (!node || node.parentElement.querySelector('.mp-export-btn')) return;
        const b = document.createElement('button');
        b.textContent = 'Скачать';
        b.className = 'mp-export-btn';
        b.style.cssText = 'margin-left:8px;padding:4px 8px;font-size:14px;background:#4caf50;color:#fff;border:none;border-radius:4px;cursor:pointer;';
        b.addEventListener('click', fn);
        node.insertAdjacentElement('afterend', b);
    };
    const addStyleOnce = (() => {
        const injected = new Set();
        return (css, key = css) => {
            if (injected.has(key)) return;
            injected.add(key);
            const s = document.createElement('style');
            s.textContent = css;
            document.head.appendChild(s);
        };
    })();
    const parsePriceValue = (text) => {
        if (!text) return null;
        const cleaned = text.replace(/\s+/g, '').replace(/[^\d.,]/g, '');
        if (!cleaned) return null;
        const normalized = cleaned.replace(/,/g, '.');
        const match = normalized.match(/\d+(?:\.\d+)?/);
        return match ? parseFloat(match[0]) : null;
    };
    const detectCurrency = (text) => {
        if (!text) return '';
        if (text.includes('₽')) return '₽';
        if (text.includes('€')) return '€';
        if (text.includes('$')) return '$';
        return '';
    };
    const formatPriceValue = (value, currency = '') => {
        if (!Number.isFinite(value)) return '—';
        const formatted = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
        return currency ? `${formatted} ${currency}` : formatted;
    };
    const extractDigits = (text) => {
        if (!text) return '';
        const match = text.match(/(\d{4,})/);
        return match ? match[1] : '';
    };
    const findArticleByLabel = (root, labelRe = /артикул|article|sku|код товара/i) => {
        if (!root) return '';
        const fromDl = [...root.querySelectorAll('dl')].find((dl) => labelRe.test(dl.querySelector('dt')?.textContent || ''));
        if (fromDl) {
            const val = extractDigits(fromDl.querySelector('dd')?.textContent || '');
            if (val) return val;
        }
        const fromTable = [...root.querySelectorAll('tr')].find((tr) => labelRe.test(tr.querySelector('th')?.textContent || ''));
        if (fromTable) {
            const val = extractDigits(fromTable.querySelector('td')?.textContent || '');
            if (val) return val;
        }
        const labeledNode = [...root.querySelectorAll('span, div, li, p')].find((n) => labelRe.test(n.textContent || ''));
        if (labeledNode) {
            const inline = extractDigits(labeledNode.textContent || '');
            if (inline) return inline;
            const next = extractDigits(labeledNode.nextElementSibling?.textContent || '');
            if (next) return next;
            const parentText = extractDigits(labeledNode.parentElement?.textContent || '');
            if (parentText) return parentText;
        }
        const qaNode = root.querySelector('[data-qaid*="article"], [data-qaid*="sku"], [data-qaid*="product-article"]');
        return extractDigits(qaNode?.textContent || '');
    };
    const findBlockAnchor = (node, classRe) => {
        let cur = node;
        while (cur && cur !== document.body) {
            if ((cur.tagName === 'DIV' || cur.tagName === 'SECTION' || cur.tagName === 'ARTICLE') && classRe.test(cur.className || '')) {
                return cur;
            }
            cur = cur.parentElement;
        }
        return node?.parentElement || node;
    };
    const findPriceInCard = (card, opts = {}) => {
        if (!card) return null;
        const nodes = [...card.querySelectorAll('ins, span, div, p, strong, b, del')];
        let best = null;
        for (const n of nodes) {
            if (n.closest('.mp-min-price-badge')) continue;
            const text = (n.textContent || '').trim();
            if (!text || !/[₽€$]/.test(text) || !/\d/.test(text)) continue;
            const price = parsePriceValue(text);
            if (!Number.isFinite(price)) continue;
            const isOld = n.tagName === 'DEL' || n.closest('del') || /line-through/i.test(n.style.textDecoration || '');
            const currency = detectCurrency(text) || opts.defaultCurrency || '₽';
            const cand = { price, currency, old: !!isOld };
            if (!best || (best.old && !cand.old) || (cand.old === best.old && cand.price < best.price)) {
                best = cand;
            }
        }
        return best;
    };

    const PRICE_DB = { name: 'mp-price-history', store: 'prices', version: 1 };
    let priceDbPromise = null;
    const openPriceDb = () => {
        if (priceDbPromise) return priceDbPromise;
        priceDbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(PRICE_DB.name, PRICE_DB.version);
            req.onupgradeneeded = () => {
                const db = req.result;
                const store = db.createObjectStore(PRICE_DB.store, { keyPath: 'key' });
                store.createIndex('byPidKey', 'pidKey', { unique: false });
                store.createIndex('byPidKeyTs', ['pidKey', 'ts'], { unique: false });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        return priceDbPromise;
    };
    const addPriceRecord = async (pidKey, pid, price, currency, ts = Date.now()) => {
        const db = await openPriceDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(PRICE_DB.store, 'readwrite');
            const store = tx.objectStore(PRICE_DB.store);
            store.put({ key: `${pidKey}:${ts}`, pidKey, pid, ts, price, currency });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    };
    const getLastPriceRecords = async (pidKey, limit = 2) => {
        const db = await openPriceDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(PRICE_DB.store, 'readonly');
            const store = tx.objectStore(PRICE_DB.store);
            const idx = store.index('byPidKeyTs');
            const range = IDBKeyRange.bound([pidKey, 0], [pidKey, Number.MAX_SAFE_INTEGER]);
            const out = [];
            const req = idx.openCursor(range, 'prev');
            req.onsuccess = () => {
                const cursor = req.result;
                if (!cursor || out.length >= limit) {
                    resolve(out);
                    return;
                }
                out.push(cursor.value);
                cursor.continue();
            };
            req.onerror = () => reject(req.error);
        });
    };
    const replacePriceRecordTime = async (record, newTs) => {
        if (!record || record.ts === newTs) return false;
        const db = await openPriceDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(PRICE_DB.store, 'readwrite');
            const store = tx.objectStore(PRICE_DB.store);
            store.delete(record.key);
            store.put({ ...record, key: `${record.pidKey}:${newTs}`, ts: newTs });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    };
    const getLastPriceRecord = async (pidKey) => {
        const db = await openPriceDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(PRICE_DB.store, 'readonly');
            const store = tx.objectStore(PRICE_DB.store);
            const idx = store.index('byPidKeyTs');
            const range = IDBKeyRange.bound([pidKey, 0], [pidKey, Number.MAX_SAFE_INTEGER]);
            const req = idx.openCursor(range, 'prev');
            req.onsuccess = () => resolve(req.result ? req.result.value : null);
            req.onerror = () => reject(req.error);
        });
    };
    const getPriceHistory = async (pidKey) => {
        const db = await openPriceDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(PRICE_DB.store, 'readonly');
            const store = tx.objectStore(PRICE_DB.store);
            const idx = store.index('byPidKey');
            const req = idx.getAll(IDBKeyRange.only(pidKey));
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    };
    const recordPriceSnapshot = async (pidKey, pid, price, currency) => {
        if (!Number.isFinite(price)) return false;
        const now = Date.now();
        const [last, prev] = await getLastPriceRecords(pidKey, 2).catch(() => []);
        if (
            last && prev &&
            last.price === price && prev.price === price &&
            (last.currency || '') === (currency || '') &&
            (prev.currency || '') === (currency || '')
        ) {
            return await replacePriceRecordTime(last, now);
        }
        await addPriceRecord(pidKey, pid, price, currency, now);
        return true;
    };
    const MIN_PRICE_CACHE_TTL = 60000;
    const minPriceCache = new Map();
    const getMinPriceRecord = async (pidKey) => {
        const history = await getPriceHistory(pidKey).catch(() => []);
        if (!history.length) return null;
        let minRec = history[0];
        for (const rec of history) {
            if (Number.isFinite(rec.price) && rec.price < minRec.price) minRec = rec;
        }
        return minRec;
    };
    const getMinPriceRecordCached = async (pidKey) => {
        const now = Date.now();
        const cached = minPriceCache.get(pidKey);
        if (cached && (now - cached.ts) < MIN_PRICE_CACHE_TTL) return cached.record;
        const record = await getMinPriceRecord(pidKey);
        minPriceCache.set(pidKey, { ts: now, record });
        return record;
    };
    const ensureMinPriceBadgeStyles = () => {
        addStyleOnce(`
            .mp-min-price-anchor{position:relative}
            .mp-min-price-badge{position:absolute;top:6px;left:6px;background:rgba(17,17,17,0.84);color:#fff;font-size:11px;line-height:1.2;padding:4px 6px;border-radius:6px;font-weight:600;letter-spacing:0.2px;box-shadow:0 6px 12px rgba(0,0,0,0.22);z-index:6;pointer-events:none}
            .mp-min-price-badge--empty{display:none}
        `, 'mp-min-price-badge');
    };
    const ensureMinPriceBadge = (card) => {
        if (!card) return null;
        ensureMinPriceBadgeStyles();
        card.classList.add('mp-min-price-anchor');
        let badge = card.querySelector('.mp-min-price-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'mp-min-price-badge mp-min-price-badge--empty';
            card.appendChild(badge);
        }
        return badge;
    };
    const renderMinPriceBadge = (card, record) => {
        const badge = ensureMinPriceBadge(card);
        if (!badge) return;
        if (!record || !Number.isFinite(record.price)) {
            badge.textContent = '';
            badge.classList.add('mp-min-price-badge--empty');
            return;
        }
        const currency = record.currency || '₽';
        const text = `Мин ${formatPriceValue(record.price, currency)}`;
        if (badge.textContent !== text) badge.textContent = text;
        badge.classList.remove('mp-min-price-badge--empty');
    };
    const startPreviewMinPriceBadges = (opts) => {
        const state = { running: false };
        const cardTtl = opts.cardTtl || 30000;
        const priceTtl = opts.priceTtl || 15000;
        const tick = async () => {
            if (state.running) return;
            state.running = true;
            try {
                const cards = [...document.querySelectorAll(opts.cardSelector)];
                for (const card of cards) {
                    const pid = opts.getPid(card);
                    if (!pid) continue;
                    const pidKey = `${opts.market}:${pid}`;
                    const now = Date.now();
                    let priceUpdated = false;
                    if (opts.getPrice) {
                        let priceInfo = opts.getPrice(card);
                        if (priceInfo instanceof Promise) priceInfo = await priceInfo;
                        if (priceInfo && Number.isFinite(priceInfo.price)) {
                            const lastPriceKey = card.__mpPricePidKey;
                            const lastPriceTs = card.__mpPriceTs || 0;
                            if (lastPriceKey !== pidKey || (now - lastPriceTs) > priceTtl) {
                                card.__mpPricePidKey = pidKey;
                                card.__mpPriceTs = now;
                                try {
                                    await recordPriceSnapshot(pidKey, pid, priceInfo.price, priceInfo.currency);
                                    minPriceCache.delete(pidKey);
                                    priceUpdated = true;
                                } catch (e) {
                                    console.warn('Card price record failed:', e);
                                }
                            }
                        }
                    }
                    const lastKey = card.__mpMinPricePidKey;
                    const lastTs = card.__mpMinPriceTs || 0;
                    if (!priceUpdated && lastKey === pidKey && (now - lastTs) < cardTtl) continue;
                    card.__mpMinPricePidKey = pidKey;
                    card.__mpMinPriceTs = now;
                    const record = await getMinPriceRecordCached(pidKey);
                    renderMinPriceBadge(card, record);
                }
            } catch (err) {
                console.warn('Preview min price:', err);
            } finally {
                state.running = false;
            }
        };
        tick();
        return setInterval(tick, opts.interval || 4000);
    };
    const ensurePriceChartStyles = () => {
        addStyleOnce(`
            .mp-price-chart{margin-top:8px;margin-bottom:8px;padding:8px 10px 10px;border-radius:10px;border:1px solid rgba(0,0,0,0.08);background:linear-gradient(135deg,#f7f7f7,#ffffff);box-shadow:0 6px 16px rgba(0,0,0,0.08);color:#222;max-width:420px;width:100%;box-sizing:border-box;min-width:0;font-size:12px;line-height:1.3}
            .mp-price-chart__row{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:4px}
            .mp-price-chart__title{font-weight:600;font-size:12px}
            .mp-price-chart__stats{font-size:11px;color:#555;text-align:right}
            .mp-price-chart__canvas-wrap{position:relative}
            .mp-price-chart canvas{width:100%;height:120px;display:block;max-width:100%}
            .mp-price-chart__dates{display:flex;justify-content:space-between;font-size:10px;color:#666;margin-top:4px}
            .mp-price-tooltip{position:absolute;pointer-events:none;background:rgba(17,17,17,0.92);color:#fff;padding:4px 6px;border-radius:4px;font-size:10px;transform:translate(-50%,-100%);white-space:nowrap;opacity:0;transition:opacity 0.1s ease}
            .mp-price-chart--floating{position:fixed;right:24px;bottom:90px;width:280px;z-index:2147483646}
        `);
    };
    const renderPriceChart = (container, history, opts = {}) => {
        if (!container) return;
        const canvas = container.querySelector('canvas');
        const stats = container.querySelector('.mp-price-chart__stats');
        const dates = container.querySelectorAll('.mp-price-chart__dates span');
        const tooltip = container.querySelector('.mp-price-tooltip');
        const currency = opts.currency || '₽';
        const data = [...history].sort((a, b) => a.ts - b.ts);
        if (!data.length) {
            stats.textContent = 'Нет данных';
            if (dates[0]) dates[0].textContent = '';
            if (dates[1]) dates[1].textContent = '';
            if (tooltip) tooltip.style.opacity = '0';
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        const styles = getComputedStyle(container);
        const padX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
        const innerWidth = (container.clientWidth || 0) - padX;
        const width = innerWidth > 0 ? Math.floor(innerWidth) : 280;
        const height = 120;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const prices = data.map((d) => d.price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const range = max - min;
        const pad = range === 0 ? Math.max(1, min * 0.05) : range * 0.1;
        const minVal = min - pad;
        const maxVal = max + pad;
        const minTs = data[0].ts;
        const maxTs = data[data.length - 1].ts;
        const tsRange = Math.max(1, maxTs - minTs);
        stats.textContent = `Мин ${formatPriceValue(min, currency)} · Макс ${formatPriceValue(max, currency)}`;
        if (dates[0]) dates[0].textContent = new Date(data[0].ts).toLocaleDateString('ru-RU');
        if (dates[1]) dates[1].textContent = new Date(data[data.length - 1].ts).toLocaleDateString('ru-RU');

        const left = 8;
        const right = 8;
        const top = 10;
        const bottom = 18;
        const plotW = width - left - right;
        const plotH = height - top - bottom;
        const points = data.map((d, i) => {
            const x = left + ((d.ts - minTs) / tsRange) * plotW;
            const t = (d.price - minVal) / (maxVal - minVal || 1);
            const y = top + (1 - t) * plotH;
            return { x, y, ts: d.ts, price: d.price };
        });

        const area = ctx.createLinearGradient(0, top, 0, height);
        area.addColorStop(0, 'rgba(26,115,232,0.22)');
        area.addColorStop(1, 'rgba(26,115,232,0.02)');

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, top + plotH);
        ctx.lineTo(points[0].x, top + plotH);
        ctx.closePath();
        ctx.fillStyle = area;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.strokeStyle = '#1a73e8';
        ctx.lineWidth = 2;
        ctx.stroke();

        const findLastIndexByPrice = (target) => {
            let idx = 0;
            for (let i = 0; i < prices.length; i++) {
                if (prices[i] === target) idx = i;
            }
            return idx;
        };
        const minIdx = findLastIndexByPrice(min);
        const maxIdx = findLastIndexByPrice(max);
        const highlight = (idx, color) => {
            const p = points[idx];
            if (!p) return;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3.6, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
        };
        highlight(minIdx, '#00a86b');
        highlight(maxIdx, '#d93025');
        highlight(points.length - 1, '#1a73e8');

        container.__mpChartPoints = points;
        container.__mpChartCurrency = currency;
        if (!container.__mpChartAttached) {
            container.__mpChartAttached = true;
            canvas.addEventListener('mousemove', (e) => {
                const pts = container.__mpChartPoints || [];
                if (!pts.length) return;
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                let best = pts[0];
                let dist = Math.abs(pts[0].x - x);
                for (let i = 1; i < pts.length; i++) {
                    const d = Math.abs(pts[i].x - x);
                    if (d < dist) { dist = d; best = pts[i]; }
                }
                const tsLabel = new Date(best.ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
                tooltip.textContent = `${tsLabel} · ${formatPriceValue(best.price, container.__mpChartCurrency || currency)}`;
                tooltip.style.left = `${best.x}px`;
                tooltip.style.top = `${best.y}px`;
                tooltip.style.opacity = '1';
            });
            canvas.addEventListener('mouseleave', () => {
                tooltip.style.opacity = '0';
            });
        }
    };
    const ensurePriceChartContainer = (container, anchor, floating) => {
        ensurePriceChartStyles();
        if (!container) {
            container = document.createElement('div');
            container.className = 'mp-price-chart';
            container.innerHTML = `
                <div class="mp-price-chart__row">
                    <div class="mp-price-chart__title">История цены</div>
                    <div class="mp-price-chart__stats"></div>
                </div>
                <div class="mp-price-chart__canvas-wrap">
                    <canvas></canvas>
                    <div class="mp-price-tooltip"></div>
                </div>
                <div class="mp-price-chart__dates"><span></span><span></span></div>
            `;
        }
        if (anchor && anchor.tagName === 'SPAN') {
            anchor = anchor.parentElement || anchor;
        }
        if (floating || !anchor) {
            container.classList.add('mp-price-chart--floating');
            if (!container.isConnected) document.body.appendChild(container);
        } else {
            container.classList.remove('mp-price-chart--floating');
            if (container.previousElementSibling !== anchor) {
                anchor.insertAdjacentElement('afterend', container);
            }
        }
        return container;
    };
    const startPriceHistory = (opts) => {
        const state = { running: false, pidKey: '', loaded: false, container: null };
        const tick = async () => {
            if (state.running) return;
            state.running = true;
            try {
                const pid = await opts.getPid();
                const priceInfo = opts.getPrice();
                if (!pid || !priceInfo || !Number.isFinite(priceInfo.price)) return;
                const pidKey = `${opts.market}:${pid}`;
                if (pidKey !== state.pidKey) {
                    state.pidKey = pidKey;
                    state.loaded = false;
                }
                const anchor = opts.getAnchor ? opts.getAnchor() : null;
                state.container = ensurePriceChartContainer(state.container, anchor, !anchor);
                const updated = await recordPriceSnapshot(pidKey, pid, priceInfo.price, priceInfo.currency);
                if (updated || !state.loaded) {
                    const history = await getPriceHistory(pidKey);
                    renderPriceChart(state.container, history, { currency: priceInfo.currency || '₽' });
                    state.loaded = true;
                }
            } catch (err) {
                console.warn('Price history:', err);
            } finally {
                state.running = false;
            }
        };
        tick();
        return setInterval(tick, opts.interval || 3000);
    };

    /* =========================================================
        OZON SECTION
  ========================================================= */
    function initOzon() {
        ensureScrollTopButton();

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
        const getOzonProductId = () => {
            const path = location.pathname;
            const fromUrl = path.match(/\/product\/[^/]*?(\d{5,})(?:\/|$)/) || path.match(/\/product\/(\d{5,})(?:\/|$)/);
            if (fromUrl) return fromUrl[1];
            const skuBtn = document.querySelector('[data-widget="webDetailSKU"]');
            const skuText = skuBtn?.textContent || '';
            const skuDigits = extractDigits(skuText);
            if (skuDigits) return skuDigits;
            const cSec = document.querySelector('#section-characteristics');
            const fromChars = findArticleByLabel(cSec);
            if (fromChars) return fromChars;
            return findArticleByLabel(document.body);
        };
        const getOzonPriceInfo = () => {
            const pWrap = document.querySelector('[data-widget="webPrice"]');
            if (!pWrap) return null;
            const text = pWrap.querySelector('span')?.textContent || pWrap.textContent || '';
            const price = parsePriceValue(text);
            if (!Number.isFinite(price)) return null;
            return { price, currency: detectCurrency(text) || '₽', text };
        };
        const getOzonPriceAnchor = () => document.querySelector('[data-widget="webPrice"]');
        startPriceHistory({
            market: 'ozon',
            getPid: getOzonProductId,
            getPrice: getOzonPriceInfo,
            getAnchor: getOzonPriceAnchor,
            interval: 2500,
        });
        const getOzonCardPid = (card) => {
            if (!card) return '';
            const favLink = card.querySelector('[favlistslink*="sku="]')?.getAttribute('favlistslink')
                || card.getAttribute('favlistslink');
            const favMatch = favLink?.match(/sku=(\d{6,})/);
            if (favMatch) return favMatch[1];
            const dataSku = card.querySelector('[data-sku]')?.getAttribute('data-sku') || card.getAttribute('data-sku');
            if (dataSku) return extractDigits(dataSku);
            const href = card.querySelector('a[href*="/product/"]')?.getAttribute('href') || '';
            const m = href.match(/\/product\/[^/]*?(\d{6,})(?:\/|\?|$)/) || href.match(/-(\d{6,})(?:\/|\?|$)/);
            return m ? m[1] : '';
        };
        startPreviewMinPriceBadges({
            market: 'ozon',
            cardSelector: 'div[class*="tile-root"]',
            getPid: getOzonCardPid,
            getPrice: (card) => findPriceInCard(card, { defaultCurrency: '₽' }),
            interval: 4000,
        });

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
            const hSpan = [...document.querySelectorAll('span, h2, h3')].find((s) => /Отзывы о товаре|Отзывы/i.test(s.textContent));
            if (!hSpan) return { header: 'Отзывы: нет отзывов.', items: [] };

            await smooth(hSpan);

            await clickVariantWhenReady();
            await sleep(600);

            const declared = parseInt(hSpan.parentElement.querySelector('span:not(:first-child)')?.innerText.replace(/\s+/g, '') || '0', 10) || 0;
            const avg = (() => {
                const scoreWrap = document.querySelector('[data-widget="webSingleProductScore"]');
                if (scoreWrap) {
                    const t = scoreWrap.textContent.trim();
                    const m = t.match(/([0-5](?:[.,]\d)?)/);
                    if (m) return m[1].replace(',', '.');
                }
                const short = [...document.querySelectorAll('span, div')].find((s) => {
                    const t = s.textContent.trim();
                    return t.length <= 30 && /\d+[.,]\d+\s*\/\s*5/.test(t);
                });
                return short?.textContent.trim() || '—';
            })();

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
            const starsCnt = (n) => {
                const aria = n.querySelector('[aria-label*="из 5" i]')?.getAttribute('aria-label');
                if (aria) {
                    const m = aria.match(/([0-5](?:[.,]\d)?)/);
                    if (m) return m[1].replace(',', '.');
                }
                const data = n.getAttribute('data-rate') || n.getAttribute('data-rating');
                if (data) return data;
                const colored = [...n.querySelectorAll('svg [fill], svg [color], svg')]
                    .map((el) => el.getAttribute('fill') || el.getAttribute('color') || '')
                    .filter((c) => /#|rgb/.test(c)).length;
                return colored || '—';
            };
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
        ensureScrollTopButton({ bottom: 120 });
        const getWBProductId = () => {
            const path = location.pathname;
            const fromUrl = path.match(/\/catalog\/(\d{4,})\/detail/i);
            if (fromUrl) return fromUrl[1];
            const nmId = document.querySelector('[data-nm-id]')?.getAttribute('data-nm-id');
            if (nmId) return nmId;
            const metaSku = document.querySelector('meta[itemprop="sku"], meta[name="item_id"]')?.getAttribute('content');
            if (metaSku) return extractDigits(metaSku);
            return findArticleByLabel(document.body);
        };
        const getWBPriceNode = () => document.querySelector('[class^="priceBlockWalletPrice"], [class*=" priceBlockWalletPrice"]')
            || document.querySelector('ins[class^="priceBlockFinalPrice"], ins[class*=" priceBlockFinalPrice"]')
            || document.querySelector('span[class^="priceBlockPrice"], span[class*=" priceBlockPrice"], [class*="priceBlock"] [class*="price"], [class*="orderBlock"] [class*="price"]');
        const getWBPriceInfo = () => {
            const priceNode = getWBPriceNode();
            if (!priceNode) return null;
            const text = priceNode.textContent || '';
            const price = parsePriceValue(text);
            if (!Number.isFinite(price)) return null;
            return { price, currency: detectCurrency(text) || '₽', text };
        };
        const getWBPriceAnchor = () => {
            const priceNode = getWBPriceNode();
            if (!priceNode) return null;
            let candidate = null;
            let cur = priceNode;
            while (cur && cur !== document.body) {
                if (cur.tagName === 'DIV' || cur.tagName === 'SECTION' || cur.tagName === 'ARTICLE') {
                    const cls = cur.className || '';
                    if (/priceBlock/i.test(cls)) {
                        if (!/priceBlockPrice/i.test(cls)) candidate = cur;
                        else if (!candidate) candidate = cur;
                    } else if (/productPrice/i.test(cls)) {
                        candidate = cur;
                    }
                }
                cur = cur.parentElement;
            }
            const block = candidate || findBlockAnchor(priceNode, /priceBlock|productPrice|productSummary|priceBlockContent/i);
            return block || priceNode.parentElement || null;
        };
        startPriceHistory({
            market: 'wb',
            getPid: getWBProductId,
            getPrice: getWBPriceInfo,
            getAnchor: getWBPriceAnchor,
            interval: 2500,
        });
        const getWBCardPid = (card) => {
            if (!card) return '';
            const direct = card.getAttribute('data-nm-id')
                || card.getAttribute('data-popup-nm-id')
                || card.dataset.nmId
                || card.dataset.popupNmId;
            if (direct) return direct;
            const href = card.querySelector('a[href*="/catalog/"]')?.getAttribute('href') || '';
            const m = href.match(/\/catalog\/(\d{4,})\/detail/i);
            return m ? m[1] : '';
        };
        startPreviewMinPriceBadges({
            market: 'wb',
            cardSelector: 'article.product-card, article[data-nm-id], article[data-popup-nm-id], div.product-card[data-nm-id], div.product-card[data-popup-nm-id]',
            getPid: getWBCardPid,
            getPrice: (card) => findPriceInCard(card, { defaultCurrency: '₽' }),
            interval: 4000,
        });
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
            const titleNode = document.querySelector('[class^="productTitle"], [class*=" productTitle"], .product-page__title');
            const title = (titleNode?.innerText || titleNode?.textContent || '—').trim();

            // Original mark
            const original = document.querySelector('[class^="productHeader"] [class*="original"]') ? 'Да' : '—';

            // Rating + total reviews (robust to hashed classes)
            const rating = (document.querySelector('[class*="ReviewRating"], [data-qaid="product-review-rating"], [itemprop="ratingValue"]')?.textContent || '—').trim();
            const reviewsTotal = (document.querySelector('[class*="ReviewCount"], [data-qaid="product-review-count"], [itemprop="reviewCount"]')?.textContent || '')
                .replace(/\D+/g, '') || '0';

            // Reviews entry link (new + old + updated layout)
            const reviewsLink = document.querySelector(
                'a[class^="productReview"], a.product-review, #product-feedbacks a.comments__btn-all, #product-feedbacks a.user-opinion__text, a[href*="/feedbacks"]'
            );

            // Price: prefer wallet price, fallback to final price, strip spaces inside digits
            const priceNode = getWBPriceNode();
            let price = '—';
            if (priceNode) {
                const raw = priceNode.textContent.replace(/\s+/g, '');
                price = raw.replace(/([₽€$])/, ' $1');
            }

            // characteristics & description
            const showBtn = [...document.querySelectorAll('button, a')]
                .find(el => /характеристик|описани/i.test(el.innerText));
            if (showBtn) { showBtn.click(); await sleep(400); }

            // Try to locate details container (dialog or legacy popup) without tying to hash classes
            const popup = [...document.querySelectorAll('[role="dialog"], .popup-product-details, [data-testid="product_additional_information"], section')]
                .find(n => /Характеристики|описание/i.test(n.innerText || ''));

            let chars = '—', descr = '—';
            if (popup) {
                // Characteristics: iterate tables with header+body pairs to avoid hash classes
                const rowTexts = [];
                popup.querySelectorAll('table').forEach((tbl) => {
                    tbl.querySelectorAll('tr').forEach((tr) => {
                        const k = (tr.querySelector('th, [class*="cellDecor"], [class*="cellWrapper"]')?.innerText || '').replace(/[:\s]+$/, '').trim();
                        const v = (tr.querySelector('td, [class*="cellValue"], [data-value]')?.innerText || '').trim();
                        if (k && v && k.toLowerCase() !== v.toLowerCase()) rowTexts.push(`${k}: ${v}`);
                    });
                });
                // fallback for definition-list rows
                popup.querySelectorAll('.product-params__row').forEach((r) => {
                    const k = (r.querySelector('th')?.innerText || '').replace(/[:\s]+$/, '').trim();
                    const v = (r.querySelector('td')?.innerText || '').trim();
                    if (k && v && k.toLowerCase() !== v.toLowerCase()) rowTexts.push(`${k}: ${v}`);
                });
                if (rowTexts.length) chars = rowTexts.join('\n');

                // Description: prefer explicit section-description, else heading "Описание"
                const descSection = popup.querySelector('#section-description, [id*="section-description"]');
                const descNode = descSection?.querySelector('p, div') || [...popup.querySelectorAll('h3, h2, h4')]
                    .find(h => /описани/i.test(h.textContent || ''))?.nextElementSibling;
                if (descNode) descr = descNode.innerText.trim();
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
                const pickBables = (node) => {
                    const res = [];
                    node.querySelectorAll('.feedbacks-bables').forEach((b) => {
                        const title = b.querySelector('.feedbacks-bables__title')?.innerText.trim();
                        const vals = [...b.querySelectorAll('.feedbacks-bables__item')]
                            .map((li) => li.innerText.trim())
                            .filter(Boolean);
                        if (title && vals.length) res.push(`${title}: ${vals.join(', ')}`);
                    });
                    return res;
                };

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

                        // new WB layout: bable badges for pros/cons
                        pickBables(el).forEach((t) => parts.push(t));
                        lines.push(`Отзыв ${idx + 1} (${date}): ${parts.join('; ')}`);
                    });
                } else lines.push('Нет отзывов');
            }

            const txt = lines.join('\n');
            const fname = slug(brand + ' ' + title) + '.txt';
            GM_download({ url: 'data:text/plain;charset=utf-8,\uFEFF' + encodeURIComponent(txt), name: fname, saveAs: false });
        }

        // Mount button near the title on WB (supports new hashed classes + old one)
        const wbTitleSelector = '[class^="productTitle"], [class*=" productTitle"], .product-page__title';
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
