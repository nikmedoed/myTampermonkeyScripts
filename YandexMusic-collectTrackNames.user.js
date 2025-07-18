// ==UserScript==
// @name         Названия треков в файл
// @namespace    https://nikmedoed.github.io
// @author       http://t.me/nikmedoed
// @version      0.3
// @description  Экспорт названий треков из плейлиста Яндекс.Музыки в текстовый файл
// @author       nikmedoed
// @match        https://music.yandex.ru/album/*
// @icon64       https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/tracksToTXT.png
// @icon         https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/tracksToTXT.png
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @downloadURL  https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/YandexMusic-collectTrackNames.user.js
// @updateURL    https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/YandexMusic-collectTrackNames.user.js
// ==/UserScript==


(function() {
    'use strict';

    function getTitle(){
        var selectors = [
            "div.page-album__title.typo-h1_small > span",
            "div.page-album__title.typo-h1_big > a",
            "div.page-album__title.typo-h1_big > span",
        ];

        var albumTitle = (new Date()).toISOString().slice(0,10);
        for (var i = 0; i < selectors.length; i++) {
            var element = document.querySelector(selectors[i]);
            if (element) {
                albumTitle = element.textContent.trim();
                break;
            }
        }
        return albumTitle
    }

    const TRACK_PATH = "div.page-album__tracks > div > div > div.d-track"

    function exportContent() {
        var collectedNames = [];
        let albumTitle = getTitle();

        function scrollAndCollect() {
            var newNames = [];
            var elements = document.querySelectorAll(TRACK_PATH);
            elements[elements.length - 1].scrollIntoView();

            elements.forEach(element => {
                newNames.push(element.querySelector('a').textContent.trim());
            });

            let lastCollectedName = collectedNames[ collectedNames.length - 1];
            let sliceIndex = newNames.indexOf(lastCollectedName);
            newNames = newNames.slice(sliceIndex + 1)

            if ( newNames.length == 0 ) {
                exportToFile(albumTitle, collectedNames.join('\n'));
            } else {
                collectedNames.push(...newNames);
                setTimeout(scrollAndCollect, 3000);
            }
        }

        scrollAndCollect();
    }

    function exportToFile(albumTitle, content){
        var fileName = `${albumTitle}.txt`;
        var blob = new Blob([content], { type: 'text/plain' });
        var url = URL.createObjectURL(blob);
        GM_download(url, fileName);
    }

    function addDownloadButton() {
        var checkExist = setInterval(function() {
            var section = document.querySelector("nav.page-album__tabs.deco-devider");
            if (section) {
                clearInterval(checkExist);
                var button = document.createElement('button');
                button.textContent = 'Скачать названия треков';
                button.style.padding = '6px';
                button.onclick = exportContent;
                section.appendChild(button);
            }
        }, 100);
    }

    // Register the export function to the Tampermonkey menu
    GM_registerMenuCommand('Export Track Names to File', exportContent);

    // Call the function to add the download button to the page
    addDownloadButton();


    function markTracksAsListened() {
        var lastName = ""

        function scrollAndCollect() {
            var elements = document.querySelectorAll(TRACK_PATH);

            let last = elements[ elements.length - 1].textContent
            if (last == lastName){
                return
            }
            lastName = last

            elements.forEach(element => {
                element.scrollIntoView();
                element.querySelector('span.d-button').click()
                document.querySelector("ul > li.d-context-menu__item.deco-popup-menu__item.d-context-menu__item_mark-finished")?.click()
            });

            setTimeout(scrollAndCollect, 3000);

        }
        scrollAndCollect()
    }

    GM_registerMenuCommand('Отметить все прослушанными', markTracksAsListened);

})();
