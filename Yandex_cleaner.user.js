// ==UserScript==
// @name         Yandex Translate remove side content keep small spacer
// @namespace    https://nikmedoed.com
// @author       https://nikmedoed.com
// @version      1.2.1
// @description  Hide Yandex Translate side block content but keep small layout spacer
// @match        https://translate.yandex.ru/*
// @match        https://translate.yandex.com/*
// @run-at       document-start
// @icon64       https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/yandex-cleaner.png
// @icon         https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/yandex-cleaner.png
// @downloadURL  https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/yandex_cleaner.user.js
// @updateURL    https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/yandex_cleaner.user.js
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

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
