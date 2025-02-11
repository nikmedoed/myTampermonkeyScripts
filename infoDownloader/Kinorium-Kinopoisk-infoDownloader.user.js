// ==UserScript==
// @name         Kinopoisk Info Downloader
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Download movie or series info
// @author       nikmedoed
// @match        https://www.kinopoisk.ru/film/*
// @match        https://www.kinopoisk.ru/series/*
// @match        https://ru.kinorium.com/*
// @grant        GM_download
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    function download(filename, text) {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const element = document.createElement('a');
        element.href = URL.createObjectURL(blob);
        element.download = filename + '.txt';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }

    function getInfo() {
        var title = '', year = '', url = window.location.href, isSeries = false;

        if (url.includes('kinopoisk.ru')) {
            const h1 = document.querySelector('h1[itemprop="name"]');
            if (h1) {
                const spans = h1.querySelectorAll('span[data-tid]');

                if (spans.length > 1) {
                    isSeries = true;
                    title = spans[0].textContent.trim();
                    const bracketsSpan = h1.querySelector('span.styles_brackets__zRUuj, span[class*="brackets"]');
                    if (bracketsSpan) {
                        const yearText = bracketsSpan.textContent;
                        const yearMatch = yearText.match(/(\d{4})\s*–\s*(\d{4}|\?)/);
                        if (yearMatch) {
                            year = yearMatch[1];
                        }
                    }
                } else if (spans.length === 1) {
                    const fullText = spans[0].textContent.trim();
                    const match = fullText.match(/(.+?)\s*\((\d{4})\)/);
                    if (match) {
                        title = match[1].trim();
                        year = match[2];
                    } else {
                        title = fullText;
                        const yearMatch = fullText.match(/\d{4}/);
                        if (yearMatch) {
                            year = yearMatch[0];
                        }
                    }
                }
            }
        }
        else if (url.includes('ru.kinorium.com')) {
            title = document.querySelector('.film-page__title-text').innerText;
            let yearMatch = document.querySelector('.film-page__date a').innerText.match(/\d{4}/);
            if (yearMatch) {
                year = yearMatch[0];
            }

            if (document.querySelector("div > span > span > span.film-page__serial-label")) {
                isSeries = true;
            }
            let watchButton = document.querySelector("button.setStatus.future.statusWidget");
            if (watchButton) {
                let isActive = watchButton.querySelector("div.active") !== null;
                if (!isActive) {
                    watchButton.click();
                }
            }
        }

        return { title, year, url, isSeries };
    }

    function action() {
        var info = getInfo();
        var type = info.isSeries ? 'Сериал' : 'Фильм';
        var filename = `${type}_${info.title}`;
        download(filename, `${info.title}\n${info.year}\n${info.url}\n${type}`);
    }

    function addButton(selector) {
        var button = document.createElement('button');
        button.innerText = 'Скачать';
        button.style.marginLeft = '10px';
        button.onclick = action;

        var parentElement = document.querySelector(selector);
        if (parentElement) {
            parentElement.appendChild(button);
        }
    }

    window.addEventListener('load', function() {
        if (window.location.href.includes('kinopoisk.ru')) {
            addButton('div > h1[itemprop="name"]');
        } else if (window.location.href.includes('ru.kinorium.com')) {
            addButton('.film-page__title-elements-wrap');
        }
    });

    GM_registerMenuCommand('Скачать информацию', action);
})();
