// ==UserScript==
// @name         Kinopoisk Info Downloader
// @namespace    http://tampermonkey.net/
// @version      0.1
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

    // Функция для создания и скачивания файла
    function download(filename, text) {
        var element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
        element.setAttribute('download', filename + '.txt');
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }

    function getInfo() {
        var title= '', year = '', url = window.location.href;
        if (url.includes('kinopoisk.ru')) {
            var titleWithYearSpan = document.querySelector('div > h1[itemprop="name"] > span');
            var fullText = titleWithYearSpan ? titleWithYearSpan.innerText : '';

            var yearSpan = document.querySelector('h1[itemprop="name"] > span:nth-of-type(2)');
            if (yearSpan) {
                var yearText = yearSpan.textContent.match(/\d{4}/);
                if (yearText && yearText.length > 0) {
                    year = yearText[0];
                }
                title = titleWithYearSpan.innerText;
            } else {
                var match = fullText.match(/\((\d{4})\)/);
                if (match) {
                    year = match[1];
                    title = fullText.replace(/\(\d{4}\)/, '').trim();
                } else {
                    title = fullText;
                }
            }
        }
        else if (url.includes('ru.kinorium.com')) {
            title = document.querySelector('.film-page__title-text').innerText;
            let yearMatch = document.querySelector('.film-page__date a').innerText.match(/\d{4}/);
            if (yearMatch) {
                year = yearMatch[0];
            }
        }

        return { title, year, url };
    }


    function action(){
        var info = getInfo();
        download(info.title, `${info.title}\n${info.year}\n${info.url}`);
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

    // Добавляем кнопку при загрузке страницы
    window.addEventListener('load', function() {
        if (window.location.href.includes('kinopoisk.ru')) {
            addButton('div > h1[itemprop="name"]');
        } else if (window.location.href.includes('ru.kinorium.com')) {
            addButton('.film-page__title-elements-wrap');
        }
    });


    GM_registerMenuCommand('Скачать информацию', action);
})();
