Несколько скриптов для регулярного решения специфичных задач.

Для работы нужно расширение [Tampermonkey®](https://www.tampermonkey.net/).

# Яндекс.Музыка

## [Удаление бесполезной анимации](https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/YandexMusic-rup-animation-remover.user.js)

Если вы тоже не понимаете зачем вам раздражающая анимация, которая обеспечивает стабильную загрузку до нескольких процентов ЦП, то вот решение.

Скрипт просто удалит это анимацию, когда вы зайдёте на страницу с ней.

## [Имена треков открытого плейлиста в файл](https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/YandexMusic-collectTrackNames.user.js)

Каюсь, я скачиваю подскасты и слушаю в своём плеере. Меня очень напрягает как яндекс управляет порядком проигрывания в подкастах, а также косячная сихнронизация между устройствами, которая приносит только негатив. В приложении слушаю музыку, а подкасты в своём плеере с ускорением 2.5-3х.

После загрузки возникает проблема, т.к. записи нужно выстроить в нужном порядке. Поэтому я сохраняю все имена треков в файл, а потом python скриптом собираю плейлист.

### Список имён в плейлист `.m3u`

Полученный файл со списком имён нужно поместить в одну директорию с файлами аудиозаписей. Запустить [python скрипт](https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/create_playlist.py), указав путь до этой директории. Скрипт сгенерирует в этой директории `.m3u` файл плейлиста с относительными путями.

# Яндекс.Карты

## [Список точек в KML](https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/Yandex.map-bookmarks-to-KML.user.js)

Для путешествий и приключений я привык собирать точки в Яндекс картах. Однако, не везде они способны построить маршрут, а перепад высот, как в Organic Maps, они вообще не учитывают. Но конечно, как и любой другой user-friendly сервис, Яндекс не стремится делиться с вами вашими данными. 

Этот скрипт сохранит все закладки из списка точек в KML файл, который понимают чуть ли не все открытые картографические сервисы. Во всяком случае, Organic Maps их легко считывает.
