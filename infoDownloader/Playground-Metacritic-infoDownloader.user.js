// ==UserScript==
// @name         Combined Download Button for Playground and Metacritic
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Add download buttons to game cards on both Playground.ru and Metacritic.com
// @author       nikmedoed
// @match        https://www.playground.ru/*
// @match        https://www.metacritic.com/*
// @match        https://rawg.io/*
// @match        https://www.rawg.io/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function playgroundLogic() {
        const cards = document.querySelectorAll('div.body > div.aside');

        cards.forEach(card => {
            const title = card.querySelector('div.title > a')?.innerText;
            const year = extractDate(card.querySelector('.date')?.textContent);
            addDownloadButton(card, title, year);
        });
        if (!(cards && cards.length)) {
            const gameCard = document.querySelector("div.gp-game-card-front > div.content")
            if (gameCard) {
                const gameTitleElement = gameCard.querySelector("div.gp-game-heading > h1");
                const title = gameTitleElement.childNodes[0].nodeValue.trim();
                const dateElements = gameCard.querySelectorAll("#releasesDates .release-item");
                let year;
                for (let element of dateElements) {
                    if (element.textContent.includes('PC')) {
                        year = extractDate(element.querySelector('.date')?.textContent);
                        if (year) break
                    }
                }
                const div = gameTitleElement.parentNode
                addDownloadButton(div, title, year);
                addYouTubeButton(div, title);
            }
        }
    }


    // =============================

    function processMetacritic() {
        // Обработка карточек игр
        const cards = document.querySelectorAll('div.c-finderProductCard');
        cards.forEach(card => {
            if (!card.querySelector('button')) {
                const title =
                    card.querySelector('div.c-finderProductCard_title')?.getAttribute('data-title')?.trim() ||
                    card.querySelector('div.c-finderProductCard_title > h3 > span:last-child')?.innerText?.trim() ||
                    card.querySelector('div.c-finderProductCard_title h3')?.innerText?.trim() ||
                    card.querySelector('a.c-finderProductCard_container')?.getAttribute('aria-label')?.trim();
                const year = extractDate(card.querySelector('div.c-finderProductCard_meta > span')?.innerText)
                addDownloadButton(card, title, year);
            }
        });

        // Обработка страницы отдельной игры
        const gamePage = document.querySelector('div.c-productHero_title');
        if (gamePage && !gamePage.querySelector('button')) {
            const titleElement = gamePage.querySelector('h1'); // Исправленный селектор
            const title = titleElement ? titleElement.innerText.trim() : 'Unknown Title';
            const year = extractDate(document.querySelector('div.g-text-xsmall > span.u-text-uppercase')?.innerText);
            addDownloadButton(gamePage, title, year);
            addYouTubeButton(gamePage, title);
        }
    }

    function metacriticLogic() {
        const observer = new MutationObserver(processMetacritic);
        const targetNode = document.querySelector('div.content') || document.body;
        observer.observe(targetNode, { childList: true, subtree: true });
        processMetacritic();
    }

    // =============================

    function processRawg() {
        const listCards = document.querySelectorAll('.game-card-medium');
        listCards.forEach(card => {
            const titleLink = card.querySelector('a.game-card-medium__info__name');
            if (!titleLink) return;

            const title =
                normalizeText(titleLink.childNodes[0]?.nodeValue) ||
                normalizeText(titleLink.textContent) ||
                'No Title';
            const infoBlock = card.querySelector('.game-card-medium__info');
            const titleBlock = titleLink.closest('.heading') || titleLink.parentElement;
            if (!infoBlock || !titleBlock) return;

            let controlsContainer = infoBlock.querySelector('[data-info-downloader-root="list"]');
            if (!controlsContainer) {
                controlsContainer = document.createElement('div');
                controlsContainer.className = 'info-downloader-actions';
                controlsContainer.dataset.infoDownloaderRoot = 'list';
                controlsContainer.style.display = 'flex';
                controlsContainer.style.gap = '10px';
                controlsContainer.style.marginTop = '8px';
                controlsContainer.style.marginBottom = '8px';
                controlsContainer.style.flexWrap = 'wrap';
                controlsContainer.addEventListener('click', e => e.stopPropagation());
                titleBlock.insertAdjacentElement('afterend', controlsContainer);
            }

            addDownloadButton(controlsContainer, title, 'Unknown', { rawg: true });
            addYouTubeButton(controlsContainer, title, { rawg: true });
        });

        const titleElement = document.querySelector('h1.game__title, h1[itemprop="name"]');
        if (!titleElement) return;

        const title = titleElement.innerText.trim();
        const dateText =
            document.querySelector('.game__meta [itemprop="datePublished"]')?.textContent ||
            document.querySelector('.game__head .game__meta-date')?.textContent;
        const year = extractDate(dateText);
        const titleContainer = titleElement.closest('.game__head') || titleElement.parentElement;
        if (!titleContainer) return;

        let controlsContainer = titleContainer.querySelector('[data-info-downloader-root="page"]');
        if (!controlsContainer) {
            controlsContainer = document.createElement('div');
            controlsContainer.className = 'info-downloader-actions';
            controlsContainer.dataset.infoDownloaderRoot = 'page';
            controlsContainer.style.display = 'flex';
            controlsContainer.style.gap = '10px';
            controlsContainer.style.marginTop = '10px';
            controlsContainer.style.marginBottom = '12px';
            controlsContainer.style.flexWrap = 'wrap';
            controlsContainer.addEventListener('click', e => e.stopPropagation());
            titleContainer.appendChild(controlsContainer);
        }

        addDownloadButton(controlsContainer, title, year, { rawg: true });
        addYouTubeButton(controlsContainer, title, { rawg: true });
    }

    function rawgLogic() {
        processRawg();
        setInterval(processRawg, 1200);
    }

    // =============================


    function extractDate(dateText) {
        const match = dateText ? dateText.match(/\d{4}/) : null;
        if (match) return match[0];
        return 'Unknown';
    }

    function addYouTubeButton(div, title, options = {}) {
        let youtubeButton;
        if (options.rawg) {
            youtubeButton = div.querySelector('button[data-info-downloader-role="youtube"]');
            if (!youtubeButton) {
                youtubeButton = document.createElement('button');
                youtubeButton.type = 'button';
                youtubeButton.dataset.infoDownloaderRole = 'youtube';
                youtubeButton.style.cssText = 'background:#ff0000;color:#fff;padding:6px 10px;border:0;border-radius:5px;cursor:pointer;font-size:13px;line-height:1.2;';
                div.appendChild(youtubeButton);
            }
            youtubeButton.textContent = 'Обзор на YouTube';
        } else {
            if (div.querySelector('.info-downloader-youtube-button')) return;
            youtubeButton = document.createElement('button');
            youtubeButton.textContent = 'Обзор на YouTube';
            youtubeButton.className = 'info-downloader-youtube-button';
            youtubeButton.style.backgroundColor = 'red';
            youtubeButton.style.color = 'white';
            youtubeButton.style.padding = '10px 15px';
            youtubeButton.style.border = 'none';
            youtubeButton.style.borderRadius = '5px';
            youtubeButton.style.cursor = 'pointer';
            youtubeButton.style.marginLeft = '10px';
            div.appendChild(youtubeButton);
        }

        youtubeButton.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(title + ' игра обзор')}`, '_blank');
        };
    }


    function addDownloadButton(div, title, year, options = {}) {
        let downloadButton;
        if (options.rawg) {
            downloadButton = div.querySelector('button[data-info-downloader-role="download"]');
            if (!downloadButton) {
                downloadButton = document.createElement('button');
                downloadButton.type = 'button';
                downloadButton.dataset.infoDownloaderRole = 'download';
                downloadButton.style.cssText = 'background:#f0f0f0;color:#111;padding:6px 10px;border:1px solid #999;border-radius:5px;cursor:pointer;font-size:13px;line-height:1.2;';
                div.appendChild(downloadButton);
            }
        } else {
            if (div.querySelector('.info-downloader-download-button')) return;
            downloadButton = document.createElement('button');
            downloadButton.className = 'info-downloader-download-button';
            div.appendChild(downloadButton);
        }

        downloadButton.textContent = `Скачать (${title || 'No Title'})`;
        downloadButton.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            const lines = [title || 'No Title', year || 'Unknown', 'Win'];
            lines.push('Игра');
            download(buildFilename(title), lines.join('\n'));
        };
    }

    function buildFilename(title) {
        const safeTitle = (title || 'game').replace(/[\\/:*?"<>|]+/g, ' ').trim();
        return `Игра ${safeTitle}.txt`;
    }

    function normalizeText(text) {
        return text ? text.replace(/\s+/g, ' ').trim() : '';
    }

    function download(filename, text) {
        var element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
        element.setAttribute('download', filename);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }

    function init() {
        if (window.location.host === 'www.playground.ru') {
            playgroundLogic();
        } else if (window.location.host === 'www.metacritic.com') {
            metacriticLogic();
        } else if (window.location.host === 'rawg.io' || window.location.host === 'www.rawg.io') {
            rawgLogic();
        }
    }

    window.addEventListener('load', init);
})();
