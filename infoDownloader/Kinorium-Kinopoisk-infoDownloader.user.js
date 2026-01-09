// ==UserScript==
// @name         Kinopoisk Info Downloader
// @namespace    http://tampermonkey.net/
// @version      0.5
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

    function openRutracker(title, year) {
        const yearSuffix = year ? ` ${year}` : '';
        const normalizedTitle = `${title}${yearSuffix}`.replace(/\s+/g, ' ').trim();
        if (!normalizedTitle) {
            return;
        }

        const link = `https://rutracker.org/forum/tracker.php?nm=${encodeURIComponent(normalizedTitle)}`;
        window.open(link, '_blank');
    }

    function getInfo(options) {
        const settings = options || {};
        const touchStatus = Boolean(settings.touchStatus);
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
            const titleNode = document.querySelector('.film-page__title-text');
            title = titleNode ? titleNode.innerText.trim() : '';
            const yearNode = document.querySelector('.film-page__date a');
            const yearMatch = (yearNode?.innerText || '').match(/\d{4}/);
            if (yearMatch) {
                year = yearMatch[0];
            }

            const titleBlock = document.querySelector('.film-page__title-elements, .film-page__title');
            const serialLabel = titleBlock?.querySelector('.film-page__serial-label');
            const episodesLink = titleBlock?.querySelector('a[href*="/episodes/"]');
            const labelText = titleBlock?.querySelector('.film-page__title-label')?.textContent || '';
            if (serialLabel || episodesLink || /сериал/i.test(labelText)) {
                isSeries = true;
            }
            if (touchStatus) {
                let watchButton = document.querySelector("button.setStatus.future.statusWidget");
                if (watchButton) {
                    let isActive = watchButton.querySelector("div.active") !== null;
                    if (!isActive) {
                        watchButton.click();
                    }
                }
            }
        }

        return { title, year, url, isSeries };
    }

    function action() {
        var info = getInfo({ touchStatus: true });
        var type = info.isSeries ? 'Сериал' : 'Фильм';
        var filename = `${type}_${info.title}`;
        download(filename, `${info.title}\n${info.year}\n${info.url}\n${type}`);
    }

    function addButtons(selector) {
        var info = getInfo();
        var parentElement = document.querySelector(selector);
        if (!parentElement) {
            return;
        }

        var downloadButton = document.createElement('button');
        downloadButton.innerText = 'Скачать';
        downloadButton.style.marginLeft = '10px';
        downloadButton.onclick = action;

        var rutrackerButton = document.createElement('button');
        rutrackerButton.innerText = 'Rtrkr';
        rutrackerButton.style.marginLeft = '10px';
        rutrackerButton.onclick = function() {
            openRutracker(info.title, info.year);
        };

        parentElement.appendChild(downloadButton);
        parentElement.appendChild(rutrackerButton);
    }

    window.addEventListener('load', function() {
        if (window.location.href.includes('kinopoisk.ru')) {
            addButtons('div > h1[itemprop="name"]');
        } else if (window.location.href.includes('ru.kinorium.com')) {
            addButtons('.film-page__title-elements-wrap');
        }
    });

    GM_registerMenuCommand('Скачать информацию', action);
})();
