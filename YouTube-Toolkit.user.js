// ==UserScript==
// @name         YouTube Toolkit
// @namespace    https://nikmedoed.github.io
// @author       http://t.me/nikmedoed
// @version      0.1
// @description  Набор инструментов для YouTube
// @author       nikmedoed
// @match        https://www.youtube.com/*
// @icon64       https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/youtubeToolkit.png
// @icon         https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/youtubeToolkit.png
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    function processVideoList(elements, index, isReverse) {
        if ((isReverse && index >= 0) || (!isReverse && index < elements.length)) {
            let target = elements[index];
            if (target) {
                target.scrollIntoView();
                target.click();
                setTimeout(() => {
                    let addToQueue = document.querySelector("ytd-menu-service-item-renderer");
                    if (addToQueue) {
                        addToQueue.click();
                        setTimeout(() => {
                            processVideoList(elements, isReverse ? index - 1 : index + 1, isReverse);
                        }, 200);
                    }
                }, 100);
            }
        } else {
            alert('Все видео добавлены в очередь' + (isReverse ? ' в обратном порядке' : ''));
        }
    }

    // Функция 1: Добавление всех видео на странице в очередь
    function addToWatchNow() {
        var elements = document.querySelectorAll("div#details div#menu ytd-menu-renderer yt-icon-button.dropdown-trigger.style-scope.ytd-menu-renderer button");
        processVideoList(elements, 0, false);
    }

    // Функция 2: Добавление всех видео в обратном порядке
    function addToWatchReversePlaylist() {
        var elements = document.querySelectorAll("div#contents ytd-menu-renderer #button yt-icon");
        processVideoList(elements, elements.length - 1, true);
    }


    // Функция 3: Подсчет длительности плейлиста
    function calculatePlaylistDuration() {
        function getTotalMinutes(time) {
            const timeParts = time.split(":").map(Number).reverse();
            return timeParts[0] / 60 + timeParts[1] + (timeParts[2] || 0) * 60;
        }

        var playlistRenderer = document.querySelectorAll("ytd-playlist-panel-renderer");
        if (playlistRenderer.length > 1) {
            var list = playlistRenderer[1].querySelectorAll("#text.style-scope.ytd-thumbnail-overlay-time-status-renderer");
            var sum = 0;
            for (let i = 0; i < list.length; i++) {
                sum += getTotalMinutes(list[i].textContent.trim());
            }

            alert(`Общая длительность: ${(sum / 60).toFixed(2)} часов`);
        } else {
            alert('Плейлист не найден');
        }
    }

    // Функция 4: Удаление видео из плейлиста
    // Функция 4: Удаление видео из плейлиста
    function removeVideosFromPlaylist() {
        let numberOfVideosToRemove = prompt("Введите количество видео для удаления из плейлиста:", "100");
        numberOfVideosToRemove = parseInt(numberOfVideosToRemove, 10);

        if (!isNaN(numberOfVideosToRemove) && numberOfVideosToRemove > 0) {
            removeVideos(numberOfVideosToRemove);
        } else {
            alert("Неверный ввод. Пожалуйста, введите число.");
        }

        function removeVideos(n) {
            if (n > 0) {
                let deleteButton = document.querySelector("ytd-playlist-video-renderer div ytd-menu-renderer yt-icon-button button");
                if (deleteButton) {
                    deleteButton.click();
                    setTimeout(() => {
                        let deleteItem = document.querySelector("#items > ytd-menu-service-item-renderer:nth-child(4)");
                        if (deleteItem) {
                            deleteItem.click();
                            setTimeout(() => { removeVideos(n - 1); }, 100);
                        }
                    }, 100);
                }
            } else {
                alert('Видео удалены из плейлиста');
            }
        }
    }


    const commands = [
        { name: 'Добавить все видео', func: addToWatchNow },
        { name: 'Добавить все обратно', func: addToWatchReversePlaylist },
        { name: 'Подсчет длительности', func: calculatePlaylistDuration },
        { name: 'Удалить видео', func: removeVideosFromPlaylist }
    ];

    // Добавление кнопок или команд в интерфейс YouTube
    //     function addButtonsToYoutube() {
    //         const container = document.getElementById('masthead-container');
    //         if (!container) return;

    //         const addButton = (name, func) => {
    //             let btn = document.createElement('button');
    //             btn.innerText = name;
    //             btn.onclick = func;
    //             btn.style.marginRight = '10px';
    //             container.appendChild(btn);
    //         };
    //     commands.forEach(command => {
    //         addButton(command.name, ()=> command.func());
    //     })
    //     }
    //
    //     window.addEventListener('load', addButtonsToYoutube);

    // Цикл для регистрации команд
    commands.forEach(command => {
        GM_registerMenuCommand(command.name, command.func);
    })
})();