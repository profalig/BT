#!/usr/bin/env python3
"""
BarTest — historical market data builder.

Downloads real 1-minute history from Dukascopy's public data feed and writes it
as small files the replay terminal reads directly. Run it once per symbol; the
files are then static and cost nothing to serve.

WHY THIS EXISTS
---------------
The browser cannot fetch this feed: datafeed.dukascopy.com sends no CORS
headers, so every request from a page is blocked before it starts. The
alternatives — Twelve Data, Alpha Vantage, Polygon — do allow the browser in,
but every one of them needs an API key that would sit in public JavaScript for
anyone to take, and every one rate-limits per key, which means the whole site
shares one small allowance. Neither is a foundation.

So the data is fetched ONCE, here, and hosted as our own files. No key to
leak, no per-user limit, no third party who can change their terms on a
Tuesday and take the charts down.

ACCURACY
--------
Dukascopy publishes the actual tick stream from its own bank, and separately
publishes minute candles built from it. Those two were cross-checked before
this was written: aggregating 5,626 raw EURUSD ticks from 2024-01-02 10:00
gives O 1.10149 H 1.10170 L 1.10144 C 1.10166, and the published minute candle
for that minute is the same to the last digit. --verify runs that check again
for any symbol and day you like.

USAGE
-----
    python tools/btdata.py --list
    python tools/btdata.py --verify EURUSD 2024-01-02
    python tools/btdata.py EURUSD --from 2024-01 --to 2024-03
    python tools/btdata.py --group majors --from 2020-01
    python tools/btdata.py --group majors --from 2020-01 --out ../bt-data

OUTPUT
------
    <out>/manifest.json               what exists, and over what range
    <out>/<SYMBOL>/<YYYY-MM>.json.gz  one month of 1-minute bars

A month of EURUSD is around 90KB compressed. Weekends and holidays are simply
absent — the market was shut, and inventing bars for a closed market is the
one thing a replay tool must never do.
"""

import argparse
import concurrent.futures as cf
import datetime as dt
import gzip
import json
import lzma
import os
import ssl
import struct
import sys
import time
import urllib.error
import urllib.request

FEED = "datafeed.dukascopy.com/datafeed"
REC = 24                       # >5If : time, open, close, low, high, volume
_SCHEME = "https"              # whichever answered last; see fetch()
UA = {"User-Agent": "Mozilla/5.0 (BarTest data builder)"}

try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:                                   # certifi is optional
    SSL_CTX = ssl.create_default_context()


# --------------------------------------------------------------- catalogue

# scale is 10**digits: the feed stores prices as integers at this precision.
# Ranges are the feed's own "1-minute history starts here" dates, so asking
# for anything earlier simply returns nothing rather than silently wrong data.
SYMBOLS = {
    # --- forex majors -------------------------------------------------
    "EURUSD": ("Euro / US Dollar",            100000, "2007-01-01", "fx"),
    "GBPUSD": ("Pound / US Dollar",           100000, "2012-01-11", "fx"),
    "USDJPY": ("US Dollar / Japanese Yen",      1000, "2007-03-27", "fx"),
    "USDCHF": ("US Dollar / Swiss Franc",     100000, "2007-01-01", "fx"),
    "AUDUSD": ("Australian / US Dollar",      100000, "2007-01-01", "fx"),
    "USDCAD": ("US Dollar / Canadian Dollar", 100000, "2007-01-01", "fx"),
    "NZDUSD": ("New Zealand / US Dollar",     100000, "2007-01-01", "fx"),
    # --- forex crosses ------------------------------------------------
    "EURGBP": ("Euro / Pound",                100000, "2007-01-01", "fx"),
    "EURJPY": ("Euro / Japanese Yen",           1000, "2007-01-01", "fx"),
    "GBPJPY": ("Pound / Japanese Yen",          1000, "2007-01-01", "fx"),
    "EURCHF": ("Euro / Swiss Franc",          100000, "2007-01-01", "fx"),
    "AUDJPY": ("Australian Dollar / Yen",       1000, "2007-01-01", "fx"),
    "EURAUD": ("Euro / Australian Dollar",    100000, "2007-01-01", "fx"),
    "GBPAUD": ("Pound / Australian Dollar",   100000, "2007-01-01", "fx"),
    "EURCAD": ("Euro / Canadian Dollar",      100000, "2007-01-01", "fx"),
    "CADJPY": ("Canadian Dollar / Yen",         1000, "2007-01-01", "fx"),
    "CHFJPY": ("Swiss Franc / Yen",             1000, "2007-01-01", "fx"),
    "NZDJPY": ("New Zealand Dollar / Yen",      1000, "2007-01-01", "fx"),
    # --- metals -------------------------------------------------------
    "XAUUSD": ("Gold / US Dollar",              1000, "2003-05-05", "metal"),
    "XAGUSD": ("Silver / US Dollar",            1000, "2014-07-25", "metal"),
    # --- energy -------------------------------------------------------
    "LIGHTCMDUSD": ("US Light Crude Oil",       1000, "2011-12-20", "energy"),
    "BRENTCMDUSD": ("Brent Crude Oil",          1000, "2013-10-12", "energy"),
    "GASCMDUSD":   ("Natural Gas",              1000, "2015-01-02", "energy"),
    "COPPERCMDUSD": ("High Grade Copper",       1000, "2015-01-02", "energy"),
    # --- indices ------------------------------------------------------
    "USA500IDXUSD":  ("S&P 500",                1000, "2012-01-16", "index"),
    "USATECHIDXUSD": ("Nasdaq 100",             1000, "2013-10-14", "index"),
    "USA30IDXUSD":   ("Dow Jones 30",           1000, "2013-10-14", "index"),
    "DEUIDXEUR":     ("Germany 40 (DAX)",       1000, "2013-10-14", "index"),
    "GBRIDXGBP":     ("UK 100 (FTSE)",          1000, "2013-10-14", "index"),
    "FRAIDXEUR":     ("France 40 (CAC)",        1000, "2012-06-14", "index"),
    "EUSIDXEUR":     ("Europe 50 (Stoxx)",      1000, "2012-08-27", "index"),
    "JPNIDXJPY":     ("Japan 225",              1000, "2013-01-02", "index"),
    "AUSIDXAUD":     ("Australia 200",          1000, "2013-01-02", "index"),
    "CHEIDXCHF":     ("Switzerland 20",         1000, "2012-06-14", "index"),
    "ESPIDXEUR":     ("Spain 35",               1000, "2012-01-02", "index"),
    "HKGIDXHKD":     ("Hong Kong 40",           1000, "2013-06-03", "index"),
    "VOLIDXUSD":     ("Volatility Index (VIX)", 1000, "2022-10-05", "index"),
    "DOLLARIDXUSD":  ("US Dollar Index",        1000, "2017-12-01", "index"),
    # --- US shares ----------------------------------------------------
    "AAPLUSUSD": ("Apple",     1000, "2017-02-28", "stock"),
    "MSFTUSUSD": ("Microsoft", 1000, "2017-03-01", "stock"),
    "NVDAUSUSD": ("NVIDIA",    1000, "2017-03-01", "stock"),
    "TSLAUSUSD": ("Tesla",     1000, "2017-03-01", "stock"),
    "AMZNUSUSD": ("Amazon",    1000, "2017-03-01", "stock"),
    "GOOGUSUSD": ("Alphabet",  1000, "2017-03-01", "stock"),
    "METAUSUSD": ("Meta",      1000, "2017-03-01", "stock"),
    "NFLXUSUSD": ("Netflix",   1000, "2017-03-01", "stock"),
    "JPMUSUSD":  ("JPMorgan",  1000, "2017-03-01", "stock"),
    "KOUSUSD":   ("Coca-Cola", 1000, "2017-03-01", "stock"),
}

GROUPS = {
    "majors":  ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD"],
    "crosses": ["EURGBP", "EURJPY", "GBPJPY", "EURCHF", "AUDJPY", "EURAUD",
                "GBPAUD", "EURCAD", "CADJPY", "CHFJPY", "NZDJPY"],
    "fx":      [s for s, v in SYMBOLS.items() if v[3] == "fx"],
    "metals":  [s for s, v in SYMBOLS.items() if v[3] == "metal"],
    "energy":  [s for s, v in SYMBOLS.items() if v[3] == "energy"],
    "indices": [s for s, v in SYMBOLS.items() if v[3] == "index"],
    "stocks":  [s for s, v in SYMBOLS.items() if v[3] == "stock"],
    "all":     list(SYMBOLS),
}


# ------------------------------------------------------------------ fetch

def fetch(path, tries=4):
    """One file from the feed.

    Returns None for 404, which is the normal answer for a weekend, a holiday,
    or a day before the instrument existed — not an error worth stopping for.

    Falls back from https to http between attempts. Some networks (this one
    included) cannot complete the TLS handshake to that host while plain HTTP
    goes straight through, and the payload is public, signed by nothing, and
    validated by its own structure on the way in.
    """
    global _SCHEME
    last = None
    for attempt in range(tries):
        # Whichever scheme answered last time is tried first. Without this,
        # a network that cannot reach the host over TLS burns the full timeout
        # on every single file before falling back — thirty seconds a day of
        # history, which turns a month into a quarter of an hour of waiting.
        order = (_SCHEME, "http" if _SCHEME == "https" else "https")
        for scheme in order:
            try:
                req = urllib.request.Request(f"{scheme}://{FEED}/{path}", headers=UA)
                with urllib.request.urlopen(req, timeout=20, context=SSL_CTX) as r:
                    body = r.read()
                _SCHEME = scheme
                return body
            except urllib.error.HTTPError as e:
                _SCHEME = scheme          # it answered; it just had nothing
                if e.code == 404:
                    return None
                last = f"HTTP {e.code}"
                # 503 and 429 mean "not now", not "never". The server is being
                # asked for too much at once, and hammering it harder is the
                # one response guaranteed not to work — so back off properly
                # rather than burning the retries in four seconds.
                if e.code in (429, 503, 502, 504):
                    time.sleep(min(30, 4 * (attempt + 1) ** 2))
            except Exception as e:
                last = type(e).__name__
        time.sleep(1.2 * (attempt + 1))
    raise RuntimeError(f"{path}: {last}")


def day_bars(symbol, day, scale):
    """One day of 1-minute bars as [epoch_seconds, o, h, l, c, volume].

    Dukascopy's month is ZERO-BASED in the path, which is the single most
    common way to pull the wrong month without noticing.
    """
    path = (f"{symbol}/{day.year}/{day.month - 1:02d}/{day.day:02d}"
            f"/BID_candles_min_1.bi5")
    raw = fetch(path)
    if not raw:
        return []
    try:
        data = lzma.decompress(raw, format=lzma.FORMAT_AUTO)
    except lzma.LZMAError:
        return []
    midnight = int(dt.datetime(day.year, day.month, day.day,
                               tzinfo=dt.timezone.utc).timestamp())
    out = []
    for i in range(len(data) // REC):
        sec, o, c, l, h, v = struct.unpack(">5If", data[i * REC:(i + 1) * REC])

        # A minute with no price at all: would draw a candle at zero and
        # destroy every chart it touched.
        if not o or not h or not l or not c:
            continue

        # A minute the market was SHUT. The feed does not leave those out —
        # it pads them with the last traded price repeated, at zero volume.
        # January 2024 for EURUSD is 44,640 rows, which is every minute of the
        # month including both days of every weekend: 12,966 of them invented.
        # On a chart that is a flat line across every weekend; in a replay it
        # is two thousand minutes of nothing to step through, against which
        # stops and limits would still be tested.
        #
        # The test has to be BOTH conditions. Zero volume alone drops one real
        # bar in that month (it moved, but rounded to no volume); flatness
        # alone drops 379 genuinely quiet minutes that really did trade.
        if v == 0 and o == h == l == c:
            continue

        out.append([midnight + sec, o / scale, h / scale, l / scale, c / scale,
                    round(v, 2)])
    return out


def day_ticks(symbol, day, hour, scale):
    """One hour of raw ticks, used only by --verify."""
    path = f"{symbol}/{day.year}/{day.month - 1:02d}/{day.day:02d}/{hour:02d}h_ticks.bi5"
    raw = fetch(path)
    if not raw:
        return []
    data = lzma.decompress(raw, format=lzma.FORMAT_AUTO)
    base = dt.datetime(day.year, day.month, day.day, hour, tzinfo=dt.timezone.utc)
    out = []
    for i in range(len(data) // 20):
        ms, ask, bid, av, bv = struct.unpack(">IIIff", data[i * 20:(i + 1) * 20])
        out.append((base + dt.timedelta(milliseconds=ms), bid / scale, ask / scale))
    return out


# ------------------------------------------------------------------ write

def month_days(year, month):
    d = dt.date(year, month, 1)
    while d.month == month:
        yield d
        d += dt.timedelta(days=1)


def month_is_complete(path):
    """Whether a month already on disk was built without losing a day.

    A day can fail — the feed answers 503 when it is being asked for too much
    at once. The first version wrote the month anyway and then skipped it on
    every later run because the file existed, so the hole became permanent and
    silent. Now the gap is recorded inside the file and the month is rebuilt
    next time, which makes re-running the command the repair procedure.
    """
    try:
        with gzip.open(path, "rb") as f:
            doc = json.loads(f.read().decode("utf-8"))
    except Exception:
        return False        # unreadable is not complete

    # The key must be PRESENT and empty. A file written before gaps were
    # recorded cannot say whether it lost a day, and some of them did — so
    # "no answer" has to mean "rebuild it", not "it's fine". Absence of
    # evidence is the one thing that must never read as evidence of absence
    # in data somebody is going to trade against.
    return "gaps" in doc and not doc["gaps"]


def write_month(out_dir, symbol, year, month, bars, gaps=()):
    """One month, as parallel integer arrays.

    Columns rather than rows, and every price as an integer at the feed's own
    precision: both compress far better than the obvious shape, and neither
    can pick up a floating-point rounding error on the way through JSON.
    """
    if not bars:
        return None
    scale = SYMBOLS[symbol][1]
    t0 = bars[0][0]

    # Every number is a difference from the one before it, or from the close of
    # its own bar. A minute of EURUSD moves a handful of points, so what gets
    # written is mostly single digits, and single digits compress. Measured on
    # January 2024: 290KB as absolute integers, 145KB like this. Volume is kept
    # because VWAP and the volume-weighted averages are useless without it.
    tt, oo, hh, ll, cc, vv = [], [], [], [], [], []
    prev_t = prev_c = None
    for b in bars:
        m = (b[0] - t0) // 60
        o, h, l, c = (round(x * scale) for x in (b[1], b[2], b[3], b[4]))
        tt.append(m - prev_t if prev_t is not None else m)
        cc.append(c - prev_c if prev_c is not None else c)
        oo.append(o - c)
        hh.append(h - c)
        ll.append(l - c)
        vv.append(round(b[5]))
        prev_t, prev_c = m, c

    doc = {
        "symbol": symbol,
        "interval": 60,
        "scale": scale,
        "t0": t0,
        "enc": "d1",              # the reader refuses anything it cannot decode
        "n": len(bars),
        # Days the feed would not give up. Their presence makes this month
        # incomplete, and the next run rebuilds it instead of skipping it.
        "gaps": [str(d) for d in gaps],
        "t": tt, "o": oo, "h": hh, "l": ll, "c": cc, "v": vv,
    }
    folder = os.path.join(out_dir, symbol)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f"{year:04d}-{month:02d}.json.gz")
    blob = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    with gzip.open(path, "wb", compresslevel=9) as f:
        f.write(blob)
    return path, len(blob), os.path.getsize(path)


def update_manifest(out_dir):
    """What exists on disk, so the terminal never asks for a month we lack."""
    man = {"built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "interval": 60, "source": "Dukascopy", "symbols": {}}
    for symbol in sorted(os.listdir(out_dir)):
        folder = os.path.join(out_dir, symbol)
        if not os.path.isdir(folder) or symbol not in SYMBOLS:
            continue
        months = sorted(f[:-8] for f in os.listdir(folder) if f.endswith(".json.gz"))
        if not months:
            continue
        name, scale, _start, kind = SYMBOLS[symbol]
        holed = [ym for ym in months
                 if not month_is_complete(os.path.join(folder, ym + ".json.gz"))]
        man["symbols"][symbol] = {
            "name": name, "kind": kind, "scale": scale,
            "from": months[0], "to": months[-1], "months": months,
        }
        if holed:
            man["symbols"][symbol]["incomplete"] = holed
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(man, f, indent=1)
    return man


# ------------------------------------------------------------------- verify

def verify(symbol, date_str, hour=10):
    """Prove the published minute candles match the raw tick stream.

    This is the check that makes the rest of the file trustworthy: if these two
    ever disagree, the candles are not what they claim to be.
    """
    if symbol not in SYMBOLS:
        sys.exit(f"unknown symbol {symbol}")
    scale = SYMBOLS[symbol][1]
    day = dt.date.fromisoformat(date_str)
    print(f"{symbol}  {day}  {hour:02d}:00 UTC\n")

    ticks = day_ticks(symbol, day, hour, scale)
    if not ticks:
        sys.exit("no ticks for that hour (market shut, or before the history starts)")
    print(f"  {len(ticks)} ticks downloaded")

    # Both sides keyed on the same thing: epoch seconds at the minute. The
    # first cut of this compared timezone-aware datetimes against naive ones,
    # which never match — so it compared nothing and reported success.
    built = {}
    for t, bid, ask in ticks:
        k = int(t.replace(second=0, microsecond=0).timestamp())
        if k not in built:
            built[k] = [bid, bid, bid, bid]
        b = built[k]
        b[1] = max(b[1], bid); b[2] = min(b[2], bid); b[3] = bid

    published = {b[0]: b[1:5] for b in day_bars(symbol, day, scale)}

    checked = same = 0
    worst = 0.0
    for k in sorted(built):
        p = published.get(k)
        if not p:
            continue
        o, h, l, c = built[k]
        checked += 1
        diff = max(abs(o - p[0]), abs(h - p[1]), abs(l - p[2]), abs(c - p[3]))
        worst = max(worst, diff)
        if diff == 0:
            same += 1

    print(f"  {len(published)} published candles that day")
    print(f"  {checked} minutes compared")
    print(f"  identical to the last digit: {same}/{checked}")
    print(f"  largest disagreement: {worst:.8f}")

    # Zero comparisons is a FAILURE, not a pass. A check that cannot fail is
    # not a check, and this one silently could not.
    ok = checked > 0 and same == checked
    print("\n  VERDICT:", "the candles ARE the ticks." if ok else
          ("NOTHING COMPARED — the check did not run." if checked == 0
           else "MISMATCH — do not trust these candles."))
    return ok


# --------------------------------------------------------------------- cli

def main():
    ap = argparse.ArgumentParser(description="Build BarTest market history files.")
    ap.add_argument("symbols", nargs="*", help="symbols, e.g. EURUSD XAUUSD")
    ap.add_argument("--group", help="a named group: " + ", ".join(GROUPS))
    ap.add_argument("--from", dest="frm", help="first month, YYYY-MM")
    ap.add_argument("--to", dest="to", help="last month, YYYY-MM (default: this month)")
    ap.add_argument("--out", default="data", help="output folder (default: data)")
    ap.add_argument("--list", action="store_true", help="show what can be built")
    ap.add_argument("--reindex", action="store_true",
                    help="rewrite manifest.json from the files on disk")
    ap.add_argument("--verify", nargs="+", metavar=("SYMBOL", "DATE"),
                    help="cross-check candles against ticks, e.g. --verify EURUSD 2024-01-02")
    ap.add_argument("--force", action="store_true", help="rebuild months already on disk")
    ap.add_argument("--jobs", type=int, default=4,
                    help="days to download at once (default 4). The feed answers "
                         "503 when pushed: 16 at once produced a wall of them, and "
                         "two builders running together produced far more.")
    a = ap.parse_args()

    if a.list:
        kinds = {}
        for s, (name, _sc, start, kind) in SYMBOLS.items():
            kinds.setdefault(kind, []).append((s, name, start))
        for kind in ("fx", "metal", "energy", "index", "stock"):
            rows = kinds.get(kind, [])
            print(f"\n{kind.upper()}  ({len(rows)})")
            for s, name, start in sorted(rows):
                print(f"  {s:16} {name:28} 1-minute history from {start}")
        print("\ngroups:", ", ".join(GROUPS))
        return

    if a.reindex:
        # The manifest is written when a run finishes, so a run that was
        # interrupted leaves files on disk that nothing knows about.
        man = update_manifest(a.out)
        for sym, v in man["symbols"].items():
            holed = v.get("incomplete", [])
            print(f"  {sym:16} {v['from']} .. {v['to']}  {len(v['months'])} months"
                  + (f"   INCOMPLETE: {len(holed)}" if holed else ""))
        print(f"\n{len(man['symbols'])} symbols indexed in {a.out}/manifest.json")
        return

    if a.verify:
        sym = a.verify[0]
        date = a.verify[1] if len(a.verify) > 1 else "2024-01-02"
        hour = int(a.verify[2]) if len(a.verify) > 2 else 10
        sys.exit(0 if verify(sym, date, hour) else 1)

    picked = list(a.symbols)
    if a.group:
        picked += GROUPS.get(a.group, [])
    if not picked:
        ap.error("give some symbols, or --group, or --list")
    unknown = [s for s in picked if s not in SYMBOLS]
    if unknown:
        ap.error("unknown symbol(s): " + ", ".join(unknown))

    today = dt.date.today()
    to_y, to_m = (int(x) for x in (a.to or f"{today.year}-{today.month:02d}").split("-"))

    os.makedirs(a.out, exist_ok=True)
    grand_files = grand_bytes = 0

    for symbol in picked:
        name, scale, earliest, _kind = SYMBOLS[symbol]
        start = a.frm or earliest[:7]
        y, m = (int(x) for x in start.split("-"))
        e_y, e_m = (int(x) for x in earliest[:7].split("-"))
        if (y, m) < (e_y, e_m):
            print(f"{symbol}: history starts {earliest}, beginning there instead")
            y, m = e_y, e_m

        print(f"\n=== {symbol} — {name} ===")
        while (y, m) <= (to_y, to_m):
            path = os.path.join(a.out, symbol, f"{y:04d}-{m:02d}.json.gz")
            if os.path.exists(path) and not a.force and month_is_complete(path):
                print(f"  {y}-{m:02d}  already built")
            else:
                # Days are fetched in parallel. Each one is a small file and
                # nearly all of the time goes on round trips, so serial
                # downloading spends a month of history waiting rather than
                # working — the difference between about thirty hours for ten
                # years and about four.
                days = [d for d in month_days(y, m) if d <= today]
                results, failed = {}, []
                with cf.ThreadPoolExecutor(max_workers=a.jobs) as pool:
                    futures = {pool.submit(day_bars, symbol, d, scale): d for d in days}
                    for fut in cf.as_completed(futures):
                        d = futures[fut]
                        try:
                            results[d] = fut.result()
                        except RuntimeError as e:
                            failed.append(d)
                            print(f"    ! {d}: {e}")
                missing = len(failed)
                # Back into order: as_completed hands them back in whatever
                # sequence they finished, and a chart of shuffled days is not
                # a chart.
                bars = []
                for d in days:
                    bars.extend(results.get(d, []))
                res = write_month(a.out, symbol, y, m, bars, sorted(failed))
                if res:
                    _p, raw_n, gz_n = res
                    grand_files += 1
                    grand_bytes += gz_n
                    print(f"  {y}-{m:02d}  {len(bars):>6} bars  "
                          f"{raw_n // 1024:>4}KB -> {gz_n // 1024:>3}KB gzipped"
                          + (f"  ({missing} day(s) missing — run again to repair)"
                             if missing else ""))
                else:
                    print(f"  {y}-{m:02d}  nothing (market shut all month, or no history)")
            m += 1
            if m == 13:
                y, m = y + 1, 1

    man = update_manifest(a.out)
    print(f"\nwrote {grand_files} files, {grand_bytes / 1048576:.1f}MB total")
    print(f"manifest: {len(man['symbols'])} symbols in {a.out}/manifest.json")


if __name__ == "__main__":
    main()
