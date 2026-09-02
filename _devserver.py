"""Static dev server with HTTP Range support.

Python's stock http.server does not implement Range requests, which means a
browser cannot seek a <video> served by it -- video.seekable stays empty and
every currentTime write is silently ignored. Scroll-scrubbing the desk clip
needs seeking, so this adds minimal Range handling.

Production hosting (Vercel etc.) supports ranges already; this is dev-only.
"""

import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5500


class RangeHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        range_header = self.headers.get("Range")
        if not range_header:
            return super().send_head()

        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return super().send_head()

        match = re.match(r"bytes=(\d*)-(\d*)", range_header.strip())
        if not match:
            return super().send_head()

        size = os.path.getsize(path)
        start_s, end_s = match.group(1), match.group(2)

        if start_s:
            start = int(start_s)
            end = int(end_s) if end_s else size - 1
        else:
            # suffix form: bytes=-N  => final N bytes
            if not end_s:
                return super().send_head()
            start = max(0, size - int(end_s))
            end = size - 1

        if start >= size:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None

        end = min(end, size - 1)
        length = end - start + 1

        f = open(path, "rb")
        f.seek(start)

        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(length))
        self.end_headers()

        return _Limited(f, length)


class _Limited:
    """File wrapper that yields at most `remaining` bytes to copyfile()."""

    def __init__(self, fileobj, remaining):
        self.f = fileobj
        self.remaining = remaining

    def read(self, amt=-1):
        if self.remaining <= 0:
            return b""
        if amt is None or amt < 0 or amt > self.remaining:
            amt = self.remaining
        data = self.f.read(amt)
        self.remaining -= len(data)
        return data

    def close(self):
        self.f.close()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    ThreadingHTTPServer(("127.0.0.1", PORT), RangeHandler).serve_forever()
