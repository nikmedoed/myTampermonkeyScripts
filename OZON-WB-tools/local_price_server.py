"""
Lightweight local price history API server.
- Stores price snapshots in SQLite (price_history table).
- Dedup rule matches userscript: if two last records for pidKey have the same price+currency,
  bump the newest record timestamp instead of adding a new row.

Endpoints:
GET  /ping                         -> {status: "ok"}
GET  /api/history?pidKey=...      -> {status: "ok", pidKey, history:[{key,pidKey,pid,ts,price,currency}]}
POST /api/price                   -> JSON {pidKey, pid, price, currency, ts?}

Run: python local_price_server.py  (defaults to http://127.0.0.1:8765)
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from time import time
from typing import Any, Dict, List
from urllib.parse import parse_qs, urlparse

DB_PATH = Path(os.environ.get("PRICE_SERVER_DB", str(Path(__file__).with_name("price_history.sqlite"))))
HOST = os.environ.get("PRICE_SERVER_HOST", "127.0.0.1")
PORT = int(os.environ.get("PRICE_SERVER_PORT", "8765"))

DB_LOCK = threading.Lock()
DB_CONN = sqlite3.connect(DB_PATH, check_same_thread=False)
DB_CONN.row_factory = sqlite3.Row


def init_db() -> None:
    with DB_LOCK:
        cur = DB_CONN.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS price_history (
                key TEXT PRIMARY KEY,
                pidKey TEXT NOT NULL,
                pid TEXT,
                ts INTEGER NOT NULL,
                price REAL NOT NULL,
                currency TEXT
            );
            """
        )
        cur.execute("CREATE INDEX IF NOT EXISTS idx_price_pidKey ON price_history(pidKey);")
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_price_pidKey_ts ON price_history(pidKey, ts);"
        )
        DB_CONN.commit()


def with_cors(handler: BaseHTTPRequestHandler, status: int = 200) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()


def read_json(handler: BaseHTTPRequestHandler) -> Dict[str, Any]:
    length = int(handler.headers.get("Content-Length", "0"))
    data = handler.rfile.read(length) if length else b"{}"
    if not data:
        return {}
    try:
        return json.loads(data.decode("utf-8"))
    except json.JSONDecodeError:
        return {}


@dataclass
class PriceRecord:
    pidKey: str
    pid: str
    ts: int
    price: float
    currency: str

    @property
    def key(self) -> str:
        return f"{self.pidKey}:{self.ts}"


class PriceStore:
    def __init__(self, conn: sqlite3.Connection, lock: threading.Lock):
        self.conn = conn
        self.lock = lock

    def _last_two(self, pid_key: str) -> List[sqlite3.Row]:
        cur = self.conn.cursor()
        cur.execute(
            "SELECT key, pidKey, pid, ts, price, currency FROM price_history WHERE pidKey=? ORDER BY ts DESC LIMIT 2",
            (pid_key,),
        )
        return cur.fetchall()

    def add_record(self, rec: PriceRecord) -> Dict[str, Any]:
        with self.lock:
            cur = self.conn.cursor()
            last_two = self._last_two(rec.pidKey)
            status = "inserted"
            if (
                    len(last_two) >= 2
                    and float(last_two[0]["price"]) == rec.price
                    and float(last_two[1]["price"]) == rec.price
                    and (last_two[0]["currency"] or "") == (rec.currency or "")
                    and (last_two[1]["currency"] or "") == (rec.currency or "")
            ):
                # Bump timestamp on the last record instead of adding a duplicate
                cur.execute("DELETE FROM price_history WHERE key=?", (last_two[0]["key"],))
                status = "bumped"
            cur.execute(
                "INSERT OR REPLACE INTO price_history (key, pidKey, pid, ts, price, currency) VALUES (?, ?, ?, ?, ?, ?)",
                (rec.key, rec.pidKey, rec.pid, rec.ts, rec.price, rec.currency),
            )
            self.conn.commit()
            return {"status": status, "ts": rec.ts}

    def history(self, pid_key: str) -> List[Dict[str, Any]]:
        with self.lock:
            cur = self.conn.cursor()
            cur.execute(
                "SELECT key, pidKey, pid, ts, price, currency FROM price_history WHERE pidKey=? ORDER BY ts ASC",
                (pid_key,),
            )
            rows = cur.fetchall()
            return [dict(row) for row in rows]


STORE = PriceStore(DB_CONN, DB_LOCK)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:  # quieter console
        return

    def do_OPTIONS(self) -> None:
        with_cors(self)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/ping":
            with_cors(self)
            self.wfile.write(json.dumps({"status": "ok"}).encode("utf-8"))
            return

        if parsed.path == "/api/history":
            pid_key = parse_qs(parsed.query).get("pidKey", [""])[0]
            if not pid_key:
                with_cors(self, 400)
                self.wfile.write(json.dumps({"error": "pidKey is required"}).encode("utf-8"))
                return
            history = STORE.history(pid_key)
            with_cors(self)
            self.wfile.write(
                json.dumps({"status": "ok", "pidKey": pid_key, "history": history}).encode("utf-8")
            )
            return

        with_cors(self, 404)
        self.wfile.write(json.dumps({"error": "not found"}).encode("utf-8"))

    def do_POST(self) -> None:
        if self.path != "/api/price":
            with_cors(self, 404)
            self.wfile.write(json.dumps({"error": "not found"}).encode("utf-8"))
            return

        payload = read_json(self)
        pid_key = str(payload.get("pidKey") or "").strip()
        pid = str(payload.get("pid") or "").strip()
        price = payload.get("price")
        currency = str(payload.get("currency") or "")
        ts = int(payload.get("ts") or int(time() * 1000))

        if not pid_key or price is None:
            with_cors(self, 400)
            self.wfile.write(json.dumps({"error": "pidKey and price are required"}).encode("utf-8"))
            return

        try:
            rec = PriceRecord(pidKey=pid_key, pid=pid, ts=ts, price=float(price), currency=currency)
            result = STORE.add_record(rec)
            with_cors(self)
            self.wfile.write(json.dumps({"status": "ok", **result}).encode("utf-8"))
        except Exception as exc:  # safeguard for unexpected data
            with_cors(self, 500)
            self.wfile.write(json.dumps({"error": str(exc)}).encode("utf-8"))


def main() -> None:
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Local price server listening on http://{HOST}:{PORT} (DB: {DB_PATH})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Shutting down...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
