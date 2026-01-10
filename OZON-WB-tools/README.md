# OZON/WB инструменты

В этой папке — userscript для выгрузки карточек товаров Ozon/Wildberries и небольшой сервер истории цен.

## Что умеет
- Экспорт карточки товара в TXT с отзывами.
- Локальная история цен в IndexedDB (браузерное хранилище).
- Опциональная синхронизация через сервер в локальной сети (SQLite) для общего доступа между устройствами.

## Требования
- Браузер с Tampermonkey.
- Python 3.8+ для сервера.
- Внешних Python‑зависимостей нет (только стандартная библиотека).

## Установка userscript
Откройте и установите:

https://github.com/nikmedoed/myTampermonkeyScripts/raw/main/OZON-WB-tools/Product-card-extract-OZON-WB.user.js

## Запуск сервера
Быстрый старт:

```bash
python local_price_server.py
```

По умолчанию:
- URL: http://127.0.0.1:8765
- База: `price_history.sqlite` (в этой же папке)

Эндпоинты:
- `GET /ping` -> `{ "status": "ok" }`
- `POST /api/price` -> JSON `{ pidKey, pid, price, currency, ts? }`
- `GET /api/history?pidKey=...` -> `{ status: "ok", pidKey, history: [...] }`

Правило дедупликации: если последние две записи для одного `pidKey` имеют одинаковые цену и валюту, то последняя запись обновляется по времени вместо добавления ещё одной.

## Настройка под локальную сеть (рекомендуется)
1. Запускайте сервер на машине в сети, которая всегда доступна.
2. Для доступа из локалки выставьте:
   - `PRICE_SERVER_HOST=0.0.0.0`
   - `PRICE_SERVER_PORT=8765` (или другой порт)
3. Откройте порт в фаерволе.

Пример запуска с переменными окружения:

```bash
PRICE_SERVER_HOST=0.0.0.0 PRICE_SERVER_PORT=8765 python local_price_server.py
```

Опционально: можно поставить за reverse‑proxy, если нужен TLS и стабильное имя.

## Настройка адреса сервера в userscript
Адрес хранится в `localStorage['mp-price-remote-url']`. По умолчанию: `http://127.0.0.1:8765`.

В Tampermonkey меню доступны команды:
- `OZON/WB: Set server URL`
- `OZON/WB: Show server URL`
- `OZON/WB: Reset server URL`

Пример из DevTools:

```js
localStorage.setItem('mp-price-remote-url', 'http://192.168.1.10:8765');
```

## Как работает синхронизация (кратко)
1. Каждый снэпшот цены пишется в IndexedDB.
2. Если сервер доступен, запись отправляется на `/api/price`.
3. При запросе истории скрипт объединяет локальные и серверные записи и догружает отсутствующие записи в IndexedDB.

## Примечания
- Аутентификации нет — используйте только в доверенной локальной сети.
- Формат `pidKey`: `{market}:{productId}` (например `ozon:123456`).
- Для сохранности истории делайте бэкап `price_history.sqlite`.

## Запуск как сервис (опционально)
Linux (systemd пример):

```ini
[Unit]
Description=OZON/WB price history server
After=network.target

[Service]
WorkingDirectory=/path/to/OZON-WB-tools
ExecStart=/usr/bin/python3 /path/to/OZON-WB-tools/local_price_server.py
Restart=always

[Install]
WantedBy=multi-user.target
```

Windows: создайте задачу в Task Scheduler, чтобы запускать `python local_price_server.py` при старте.
