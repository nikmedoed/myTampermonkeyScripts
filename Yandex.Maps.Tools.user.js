// ==UserScript==
// @name         Yandex Maps Tools
// @namespace    https://nikmedoed.com
// @author       https://nikmedoed.com
// @version      0.4
// @description  Экспорт закладок в KML и обмен треками линейки в GPX
// @match        http*://yandex.ru/maps/*
// @match        https://yandex.com/maps/*
// @grant        GM_registerMenuCommand
// @icon64       https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/bookmarks-KML.png
// @icon         https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/icons/bookmarks-KML.png
// @downloadURL  https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/Yandex.Maps.Tools.user.js
// @updateURL    https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/Yandex.Maps.Tools.user.js
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

    GM_registerMenuCommand('Скачать метки в KML', executeAction);

    const scale = 1e6;
    const ruler = () => new URL(location.href).searchParams.get('rl');
    const button = (label, iconPath, action) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'button _view_air _size_medium';
      element.title = label;
      element.setAttribute('aria-label', label);
      element.innerHTML = `<span class="button__icon" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="${iconPath}"/>
        </svg>
      </span>`;
      element.onclick = action;
      return element;
    };

    const download = button('Скачать GPX', 'M12 4v11m-4-4 4 4 4-4M5 16v4h14v-4', () => {
      const encoded = ruler();
      if (!encoded) return;

      let lon = 0;
      let lat = 0;
      const points = encoded.split('~').map(pair => {
        const coordinates = pair.split(',');
        const [x, y] = coordinates.map(Number);
        if (coordinates.length !== 2 || coordinates.some(value => !value.trim())
            || !Number.isFinite(x) || !Number.isFinite(y)) return '';
        lon += Math.round(x * scale);
        lat += Math.round(y * scale);
        return `<trkpt lat="${lat / scale}" lon="${lon / scale}"/>`;
      });
      if (points.length < 2 || points.includes('')) {
        alert('Для выгрузки GPX нужна линейка с двумя или более корректными точками.');
        return;
      }

      const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<gpx version="1.1" creator="Yandex Maps Ruler GPX" xmlns="http://www.topografix.com/GPX/1/1">'
        + '<trk><name>Yandex Maps Ruler</name><trkseg>\n'
        + points.join('\n') + '\n</trkseg></trk></gpx>';
      const href = URL.createObjectURL(new Blob([xml], { type: 'application/gpx+xml' }));
      const link = document.createElement('a');
      link.href = href;
      link.download = 'yandex-ruler.gpx';
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    });

    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.gpx,application/gpx+xml';
    file.hidden = true;
    file.onchange = async () => {
      const selected = file.files[0];
      file.value = '';
      if (!selected) return;
      try {
        const xml = new DOMParser().parseFromString(await selected.text(), 'application/xml');
        if (xml.documentElement.localName !== 'gpx') throw new Error('Файл не является GPX.');

        const lines = [...xml.getElementsByTagNameNS('*', 'trkseg')]
          .map(segment => [...segment.getElementsByTagNameNS('*', 'trkpt')])
          .concat([...xml.getElementsByTagNameNS('*', 'rte')]
            .map(route => [...route.getElementsByTagNameNS('*', 'rtept')]))
          .filter(line => line.length);
        if (lines.length !== 1 || lines[0].length < 2) {
          throw new Error('Нужен один сегмент трека или один маршрут с двумя или более точками.');
        }

        const points = lines[0].map(point => ['lon', 'lat'].map((key, index) => {
          const raw = point.getAttribute(key);
          const value = Number(raw);
          if (!raw?.trim() || !Number.isFinite(value) || Math.abs(value) > [180, 90][index]) {
            throw new Error('В GPX есть некорректные координаты.');
          }
          return Math.round(value * scale);
        }));

        const url = new URL(location.pathname, location.origin);
        url.searchParams.set('ll', points[0].map(value => value / scale).join(','));
        url.searchParams.set('z', '15');
        url.searchParams.set('rl', points.map((point, index) => {
          const previous = points[index - 1] ?? [0, 0];
          return point.map((value, axis) => (value - previous[axis]) / scale).join(',');
        }).join('~'));
        location.assign(url);
      } catch (error) {
        alert(error.message);
      }
    };

    const group = document.createElement('div');
    group.className = 'map-controls__group';
    const controls = document.createElement('div');
    controls.className = 'rounded-controls';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'GPX для линейки Яндекс.Карт');

    const open = button('Открыть GPX', 'M12 15V4m-4 4 4-4 4 4M5 16v4h14v-4', () => file.click());
    open.classList.add('_pin-right');
    download.classList.add('_pin-left');
    for (const control of [open, download]) {
      const child = document.createElement('div');
      child.className = 'rounded-controls__child';
      child.append(control);
      controls.append(child);
    }
    group.append(controls, file);

    const refresh = () => {
      download.disabled = !ruler()?.includes('~');
      if (!group.isConnected) {
        const nativeControls = document.querySelector('.map-controls__group > .rounded-controls');
        nativeControls?.parentElement.before(group);
      }
    };
    refresh();
    setInterval(refresh, 300);
})();