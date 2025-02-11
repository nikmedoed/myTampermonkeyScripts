// ==UserScript==
// @name         Combined Download Button for Playground and Metacritic
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Add download buttons to game cards on both Playground.ru and Metacritic.com
// @author       nikmedoed
// @match        https://www.playground.ru/*
// @match        https://www.metacritic.com/*
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
                const title = card.querySelector('div.c-finderProductCard_title > h3 > span:nth-child(2)')?.innerText.trim();
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


    function extractDate(dateText) {
        const match = dateText ? dateText.match(/\d{4}/) : null;
        if (match) return match[0];
        return 'Unknown';
    }

    function addYouTubeButton(div, title) {
        const youtubeButton = document.createElement('button');
        youtubeButton.textContent = `Обзор на YouTube`;
        youtubeButton.style.backgroundColor = 'red';
        youtubeButton.style.color = 'white';
        youtubeButton.style.padding = '10px 15px';
        youtubeButton.style.border = 'none';
        youtubeButton.style.borderRadius = '5px';
        youtubeButton.style.cursor = 'pointer';
        youtubeButton.style.marginLeft = '10px';

        youtubeButton.addEventListener('click', () => {
            window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(title + ' игра обзор')}`, '_blank');
        });

        div.appendChild(youtubeButton);
    }


    function addDownloadButton(div, title, year) {
        const buttonText = `Скачать (${title || 'No Title'})`;
        const downloadButton = document.createElement('button');
        downloadButton.textContent = buttonText;
        downloadButton.addEventListener('click', () => {
            download(`${title || 'game'}.txt`, [title, year, 'Win'].join('\n'));
        });
        div.appendChild(downloadButton);
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
        }
    }

    window.addEventListener('load', init);
})();
