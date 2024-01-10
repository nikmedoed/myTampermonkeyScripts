// ==UserScript==
// @name         Закладки Яндекс.Карт в KML
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Скачать закладки из списка для использования в картографических приложениях
// @author       http://t.me/nikmedoed
// @match        http*://yandex.ru/maps/*
// @grant        GM_registerMenuCommand
// @downloadURL  https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/Yandex.map-bookmarks-to-KML.user.js
// @updateURL    https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/Yandex.map-bookmarks-to-KML.user.js
// ==/UserScript==


( function() {
    'use strict';

    // Функция для выполнения действия при нажатии на кнопку в меню расширения
    async function executeAction() {
        function escapeXml(text) {
            return text.replace(/[&<>"']/g, function (match) {
                switch (match) {
                    case "&":
                        return "&amp;";
                    case "<":
                        return "&lt;";
                    case ">":
                        return "&gt;";
                    case "\"":
                        return "&quot;";
                    case "'":
                        return "&apos;";
                    default:
                        return match;
                }
            });
        }

        let setname = document.querySelector("div.bookmarks-folder-header-view__title").textContent;

        let elems = [];
        const currentDate = new Date().toISOString();
        const elements = document.querySelectorAll("div.bookmark-snippet-view");

        for (let i = 0; i < elements.length; i++) {
            const e = elements[i];
            e.scrollIntoView();
            await wait(200);
        }

        async function processElements() {
            for (let i = 0; i < elements.length; i++) {
                const e = elements[i];
                e.scrollIntoView();
                let coord = e.querySelector('.search-snippet-view__body').getAttribute('data-coordinates');
                let name = e.querySelector("div.search-business-snippet-view__title") || e.querySelector("div.search-snippet-view__title");
                name = name.textContent;
                // Escape special characters in the name
                name = escapeXml(name);
                elems.push(
                    `
<Placemark>
    <name>${name}</name>
    <TimeStamp><when>${currentDate}</when></TimeStamp>
    <Point><coordinates>${coord}</coordinates></Point>
</Placemark>
      `.trim()
                );
                console.log(coord, name);
                await wait(100);
            }

            let res = elems.join('\n');
            res = `
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://earth.google.com/kml/2.2">
    <Document>
        <name>${escapeXml(setname)}</name>
        ${res}
    </Document>
</kml>
  `.trim();

            // Создание и скачивание файла
            const filename = setname.split(".")[0] + ".kml";
            const blob = new Blob([res], { type: "text/xml" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        }

        function wait(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        processElements();

    }

    var button = document.createElement('button');
    button.innerText = 'Скачать метки в KML';
    button.onclick = executeAction;

    GM_registerMenuCommand('Скачать метки в KML', executeAction);

})();
