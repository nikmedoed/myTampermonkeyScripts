// ==UserScript==
// @name         Названия треков в файл
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Экспорт названий треков в текстовый файл
// @author       nikmedoed
// @match        https://music.yandex.ru/album/*
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @downloadURL  https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/YandexMusic-rup-animation-remover.user.js
// @updateURL    https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/YandexMusic-rup-animation-remover.user.js
// ==/UserScript==


(function() {
    'use strict';
    function removeRupAnimation() {
        console.log('sup removing start')
        var rupAnimation = document.querySelector(".rup__animation");
        if (rupAnimation) {
            rupAnimation.remove();
        }else{
            setTimeout(removeRupAnimation, 2000)
        }
    }
    window.addEventListener('load', removeRupAnimation)
})();