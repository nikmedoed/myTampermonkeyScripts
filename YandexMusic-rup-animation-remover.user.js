// ==UserScript==
// @name         Yandex music rup animation remover
// @namespace    https://github.com/nikmedoed/
// @version      0.3
// @description  Removes useless spinning animation
// @author       nikmedoed
// @match        https://music.yandex.ru/home
// @icon64       https://i.imgur.com/xw1SYxr.png
// @icon         https://i.imgur.com/xw1SYxr.png
// @grant        none
// @downloadURL  https://gist.githubusercontent.com/nikmedoed/bfa6f70a9aca34367dde47f71dda0baa/raw/user.js
// @updateURL    https://gist.githubusercontent.com/nikmedoed/bfa6f70a9aca34367dde47f71dda0baa/raw/meta.js
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