// ==UserScript==
// @name         Yandex music rup animation remover
// @namespace    https://github.com/nikmedoed/
// @version      0.3
// @description  Removes useless spinning animation
// @author       nikmedoed
// @match        https://music.yandex.ru/home
// @icon64       https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/Yandex%20music%20rup%20animation%20remover%20assets/Logo-sup-remover.png
// @icon         https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/Yandex%20music%20rup%20animation%20remover%20assets/Logo-sup-remover.png
// @grant        none
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