// ==UserScript==
// @name         Yandex ad cleaner
// @namespace    https://nikmedoed.com
// @author       https://nikmedoed.com
// @version      1.3.1
// @description  Hide ads in Yandex Maps and keep a small side spacer in Yandex Translate
// @match        https://translate.yandex.ru/*
// @match        https://translate.yandex.com/*
// @match        https://yandex.ru/maps/*
// @match        https://yandex.com/maps/*
// @match        https://maps.yandex.ru/*
// @match        https://maps.yandex.com/*
// @run-at       document-start
// @icon64       https://github.com/nikmedoed/myTampermonkeyScripts/raw/refs/heads/main/icons/yandex-cleaner.png
// @icon         https://github.com/nikmedoed/myTampermonkeyScripts/raw/refs/heads/main/icons/yandex-cleaner.png
// @downloadURL  https://github.com/nikmedoed/myTampermonkeyScripts/raw/refs/heads/main/Yandex_cleaner.user.js
// @updateURL    https://github.com/nikmedoed/myTampermonkeyScripts/raw/refs/heads/main/Yandex_cleaner.user.js
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const isMaps = location.hostname.startsWith('maps.') || location.pathname.startsWith('/maps/');

    if (isMaps) {
        // The ad's outer slot remains accessible even when its nested shadow root is closed.
        // Match the slot format rather than the rotating class names or a particular ad ID.
        const sectionSelector = '.sidebar-container .toponym-card-view__section';
        const slotSelector = '[id*="R-I-" i]';
        const homeSlotSelector = `.home-panel-content-view__body ${slotSelector}`;
        const slotIdPattern = /R-I-\d+-\d+(?:$|[-_])/i;
        const hiddenAttribute = 'data-yandex-cleaner-ad';

        GM_addStyle(`
            ${sectionSelector}[${hiddenAttribute}],
            ${homeSlotSelector}[${hiddenAttribute}] {
                display: none !important;
            }
        `);

        function cleanupMapAds() {
            document.querySelectorAll(homeSlotSelector).forEach((slot) => {
                slot.toggleAttribute(hiddenAttribute, slotIdPattern.test(slot.id));
            });

            document.querySelectorAll(sectionSelector).forEach((section) => {
                const hasAdSlot = Array.from(section.querySelectorAll(slotSelector))
                    .some((slot) => slotIdPattern.test(slot.id));

                // Restore sections if Maps reuses their DOM for ordinary card content.
                if (hasAdSlot !== section.hasAttribute(hiddenAttribute)) {
                    section.toggleAttribute(hiddenAttribute, hasAdSlot);
                }
            });
        }

        const mapObserver = new MutationObserver(cleanupMapAds);
        // Observe the document itself: it also works before documentElement exists.
        mapObserver.observe(document, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['id', 'class'],
        });
        cleanupMapAds();
        return;
    }

    const SIDE_BLOCK_WIDTH = '40px';

    GM_addStyle(`
        .side-block {
            display: block !important;
            flex: 0 0 ${SIDE_BLOCK_WIDTH} !important;
            width: ${SIDE_BLOCK_WIDTH} !important;
            min-width: ${SIDE_BLOCK_WIDTH} !important;
            max-width: ${SIDE_BLOCK_WIDTH} !important;
            height: auto !important;
            min-height: 1px !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            visibility: visible !important;
            pointer-events: none !important;
            background: transparent !important;
        }

        .side-block > * {
            display: none !important;
            visibility: hidden !important;
        }

        .verticalMenu {
            flex: initial !important;
        }
    `);

    function applySpacer(sideBlock) {
        sideBlock.style.setProperty('display', 'block', 'important');
        sideBlock.style.setProperty('flex', `0 0 ${SIDE_BLOCK_WIDTH}`, 'important');
        sideBlock.style.setProperty('width', SIDE_BLOCK_WIDTH, 'important');
        sideBlock.style.setProperty('min-width', SIDE_BLOCK_WIDTH, 'important');
        sideBlock.style.setProperty('max-width', SIDE_BLOCK_WIDTH, 'important');
        sideBlock.style.setProperty('height', 'auto', 'important');
        sideBlock.style.setProperty('min-height', '1px', 'important');
        sideBlock.style.setProperty('margin', '0', 'important');
        sideBlock.style.setProperty('padding', '0', 'important');
        sideBlock.style.setProperty('overflow', 'hidden', 'important');
        sideBlock.style.setProperty('visibility', 'visible', 'important');
        sideBlock.style.setProperty('pointer-events', 'none', 'important');
        sideBlock.style.setProperty('background', 'transparent', 'important');

        if (sideBlock.childElementCount > 0) {
            sideBlock.replaceChildren();
        }
    }

    function cleanup() {
        document.querySelectorAll('.side-block').forEach(applySpacer);
        document.querySelectorAll('.verticalMenu').forEach((verticalMenu) => {
            verticalMenu.style.setProperty('flex', 'initial', 'important');
        });
    }

    cleanup();

    const observer = new MutationObserver(() => {
        cleanup();
    });

    function startObserver() {
        const root = document.documentElement || document.body;

        if (!root) {
            return;
        }

        observer.observe(root, {
            childList: true,
            subtree: true,
        });

        cleanup();
    }

    if (document.documentElement) {
        startObserver();
    } else {
        document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    }

    window.addEventListener('load', cleanup);
})();
