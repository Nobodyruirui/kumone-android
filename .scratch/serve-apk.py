#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""单文件、令牌化、自动过期的 APK 下载服务。

为什么不用 `python -m http.server`：
    那个默认绑定 0.0.0.0 并把**整个目录**列出来 —— 同一局域网里
    任何设备都能浏览目录、下载源码、连 .git 历史一起 clone 走。

这个版本：
    · 只绑定指定网卡 IP（不是 0.0.0.0）
    · 只回应一条带随机令牌的路径，其余一律 404，**不给目录列表**
    · 不打印访问日志（不留下谁下过包的痕迹）
    · 到点自动退出（默认 20 分钟）

用法: python serve-apk.py <token> <apk路径> <端口> <绑定IP> <分钟>
"""
import http.server
import os
import socket
import sys
import threading
import time

TOKEN = sys.argv[1]
APK = os.path.abspath(sys.argv[2])
PORT = int(sys.argv[3])
BIND = sys.argv[4]
MINUTES = float(sys.argv[5])

PATH = "/%s/kumone-debug.apk" % TOKEN


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "apk"
    sys_version = ""

    def _headers(self, code, length, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def do_HEAD(self):
        if self.path != PATH:
            self._headers(404, 0, "text/plain; charset=utf-8")
            return
        self._headers(200, os.path.getsize(APK), "application/vnd.android.package-archive")

    def do_GET(self):
        if self.path != PATH:
            body = b"not found"
            self._headers(404, len(body), "text/plain; charset=utf-8")
            self.wfile.write(body)
            return
        size = os.path.getsize(APK)
        self._headers(200, size, "application/vnd.android.package-archive")
        with open(APK, "rb") as f:
            while True:
                chunk = f.read(64 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def log_message(self, fmt, *args):
        pass  # 不记访问日志


def expire():
    time.sleep(MINUTES * 60)
    os._exit(0)


if __name__ == "__main__":
    if not os.path.isfile(APK):
        sys.stderr.write("APK 不存在: %s\n" % APK)
        sys.exit(1)
    threading.Thread(target=expire, daemon=True).start()
    httpd = http.server.ThreadingHTTPServer((BIND, PORT), Handler)
    sys.stderr.write("READY http://%s:%d%s  (%.0f 分钟后自动关闭)\n" % (BIND, PORT, PATH, MINUTES))
    sys.stderr.flush()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
