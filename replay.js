/* ==========================================================================
   BarTest — Replay Terminal (phase 1)

   Bar-by-bar replay of historical price with order entry, so a trader can
   practise a system after the Backtest Machine has measured it.

   Two design decisions worth stating up front, because they are what make
   the numbers trustworthy:

   1. NO LOOKAHEAD. The chart is only ever fed bars at or before the cursor.
      Future bars are held in a buffer the rendering path cannot see, so it
      is not possible to peek by dragging the chart.

   2. FILLS ARE EVALUATED ON 1-MINUTE BARS, never on the displayed candle.
      Candle data cannot tell you whether the high or the low came first, so
      a stop and a target inside the same 4h candle are ambiguous — and that
      ambiguity decides whether a trade won or lost. Stepping the fill engine
      through the underlying 1m bars removes almost all of it. Where a single
      1m bar still touches both levels, the STOP is taken first: the
      pessimistic assumption, so results are never flattered.
   ========================================================================== */
(function () {
'use strict';

// ---------------------------------------------------------------- data feed

const BINANCE = 'https://api.binance.com/api/v3/klines';
const MIN_MS = 60000;

const MARKETS = {
    crypto: {
        label: 'Crypto',
        earliest: '2017-08-17',
        symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'],
        // Binance serves 1m klines with CORS enabled, 1000 bars per call, so
        // crypto needs no hosting of our own at all.
        async fetch1m(symbol, startMs, limit) {
            const url = `${BINANCE}?symbol=${symbol}&interval=1m` +
                        `&startTime=${startMs}&limit=${Math.min(limit, 1000)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Binance ${res.status}`);
            const raw = await res.json();
            return raw.map(k => ({
                t: k[0],
                o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5]
            }));
        }
    }
    // fx: added next — needs hosted 1m history (HistData / Dukascopy) since
    // there is no free CORS-enabled forex endpoint.
};

// ------------------------------------------------------------------- state

const S = {
    market: 'crypto',
    symbol: 'BTCUSDT',
    tfMin: 15,
    bars1m: [],        // every 1m bar loaded, ascending
    fillIdx: 0,        // index into bars1m the fill engine has consumed
    display: [],       // aggregated candles revealed so far
    working: null,     // candle currently forming
    playing: false,
    speed: 6,
    loading: false,
    exhausted: false,
    startBalance: 10000,
    balance: 10000,
    position: null,
    trades: [],
    peakEquity: 10000,
    maxDD: 0
};

// ------------------------------------------------------------------ helpers

const $ = id => document.getElementById(id);
const fmt = (n, d = 2) =>
    (n === null || n === undefined || !isFinite(n)) ? '—'
    : n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const money = n => (n < 0 ? '-' : '') + '$' + fmt(Math.abs(n));
const signed = n => (n > 0 ? '+' : n < 0 ? '-' : '') + '$' + fmt(Math.abs(n));

function status(msg, isError) {
    const box = $('rp-status');
    box.hidden = false;
    box.classList.toggle('error', !!isError);
    $('rp-status-text').textContent = msg;
}
function hideStatus() { $('rp-status').hidden = true; }

// --------------------------------------------------------------- the chart

let chart, candleSeries, entryLine = null, slLine = null, tpLine = null;

function buildChart() {
    const el = $('rp-chart');
    el.innerHTML = '';
    chart = LightweightCharts.createChart(el, {
        layout: { background: { color: '#08080a' }, textColor: '#a8abb3', fontFamily: 'Share Tech Mono, monospace' },
        grid: { vertLines: { color: 'rgba(210,213,219,0.05)' }, horzLines: { color: 'rgba(210,213,219,0.05)' } },
        rightPriceScale: { borderColor: 'rgba(210,213,219,0.13)' },
        timeScale: { borderColor: 'rgba(210,213,219,0.13)', timeVisible: true, secondsVisible: false },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        localization: { priceFormatter: p => p.toFixed(2) }
    });
    candleSeries = chart.addCandlestickSeries({
        upColor: '#12a184', downColor: '#e2564e',
        borderUpColor: '#12a184', borderDownColor: '#e2564e',
        wickUpColor: '#12a184', wickDownColor: '#e2564e'
    });
    new ResizeObserver(() => chart.applyOptions({
        width: el.clientWidth, height: el.clientHeight
    })).observe(el);
}

// --------------------------------------------------------- aggregation

// Fold a 1m bar into the candle currently forming. Returns true when that
// candle is complete, i.e. the next 1m bar belongs to a new one.
function foldBar(b) {
    const bucket = Math.floor(b.t / (S.tfMin * MIN_MS)) * (S.tfMin * MIN_MS);
    if (!S.working || S.working.time !== bucket / 1000) {
        if (S.working) S.display.push(S.working);
        S.working = { time: bucket / 1000, open: b.o, high: b.h, low: b.l, close: b.c };
        return true;
    }
    S.working.high  = Math.max(S.working.high, b.h);
    S.working.low   = Math.min(S.working.low,  b.l);
    S.working.close = b.c;
    return false;
}

function paint() {
    const data = S.working ? S.display.concat([S.working]) : S.display;
    candleSeries.setData(data);
}

// ------------------------------------------------------------ loading data

async function ensureBuffer() {
    // Keep roughly a day of 1m bars ahead of the fill cursor.
    if (S.loading || S.exhausted) return;
    if (S.bars1m.length - S.fillIdx > 1440) return;
    S.loading = true;
    try {
        const src = MARKETS[S.market];
        const from = S.bars1m.length
            ? S.bars1m[S.bars1m.length - 1].t + MIN_MS
            : S.startMs;
        const page = await src.fetch1m(S.symbol, from, 1000);
        if (!page.length) { S.exhausted = true; }
        else {
            // Binance can return an overlapping first bar; drop anything we hold.
            const last = S.bars1m.length ? S.bars1m[S.bars1m.length - 1].t : -1;
            for (const b of page) if (b.t > last) S.bars1m.push(b);
        }
    } catch (e) {
        status('Could not load market data: ' + e.message +
               '. Binance may be unreachable from your network.', true);
        S.playing = false;
        syncTransport();
    } finally {
        S.loading = false;
    }
}

// ------------------------------------------------------------ order engine

function pointValue() {
    // Crypto majors are quoted in quote currency per unit, so a "point" is
    // one unit of price and position size is in base units.
    return 1;
}

function sizeFor(stopPts) {
    if (!stopPts || stopPts <= 0) return 0;
    const riskPct = Math.max(0.1, +$('rp-risk').value || 1);
    const riskAmt = S.balance * (riskPct / 100);
    return riskAmt / (stopPts * pointValue());
}

function openPosition(side) {
    if (S.position || !S.working) return;
    const price = S.working.close;
    const stopPts = +$('rp-stop').value || 0;
    const tgtPts  = +$('rp-target').value || 0;
    const qty = sizeFor(stopPts);
    if (!qty) { status('Set a stop distance so the position can be sized.', true); return; }

    S.position = {
        side, qty, entry: price,
        sl: stopPts ? (side === 'long' ? price - stopPts : price + stopPts) : null,
        tp: tgtPts  ? (side === 'long' ? price + tgtPts  : price - tgtPts)  : null,
        riskAmt: stopPts * qty * pointValue(),
        openedAt: S.working.time
    };
    drawPositionLines();
    renderPosition();
    syncOrderButtons();
}

function closePosition(price, reason) {
    const p = S.position;
    if (!p) return;
    const diff = (p.side === 'long' ? price - p.entry : p.entry - price);
    const pnl = diff * p.qty * pointValue();
    S.balance += pnl;
    S.trades.push({
        side: p.side, entry: p.entry, exit: price, pnl,
        r: p.riskAmt ? pnl / p.riskAmt : 0,
        reason, openedAt: p.openedAt, closedAt: S.working ? S.working.time : null
    });
    S.position = null;
    clearPositionLines();
    renderPosition();
    renderStats();
    renderLog();
    syncOrderButtons();
}

// Walk one 1m bar through the open position. Stop is checked before target:
// within a single minute we cannot know which came first, so we take the
// pessimistic reading rather than flattering the result.
function applyFills(b) {
    const p = S.position;
    if (!p) return;
    if (p.side === 'long') {
        if (p.sl !== null && b.l <= p.sl) return closePosition(p.sl, 'stop');
        if (p.tp !== null && b.h >= p.tp) return closePosition(p.tp, 'target');
    } else {
        if (p.sl !== null && b.h >= p.sl) return closePosition(p.sl, 'stop');
        if (p.tp !== null && b.l <= p.tp) return closePosition(p.tp, 'target');
    }
}

function openPL() {
    const p = S.position;
    if (!p || !S.working) return 0;
    const diff = (p.side === 'long' ? S.working.close - p.entry : p.entry - S.working.close);
    return diff * p.qty * pointValue();
}

// ------------------------------------------------------------- replay step

async function stepBar() {
    await ensureBuffer();
    if (S.fillIdx >= S.bars1m.length) {
        if (S.exhausted) { S.playing = false; syncTransport(); status('Reached the end of available data.'); }
        return;
    }
    // Advance exactly one DISPLAY candle, feeding every underlying 1m bar
    // through the fill engine on the way.
    let closed = false;
    while (S.fillIdx < S.bars1m.length && !closed) {
        const b = S.bars1m[S.fillIdx++];
        const startedNew = foldBar(b);
        applyFills(b);
        if (startedNew && S.display.length) closed = true;
    }
    paint();
    updateEquity();
    $('rp-clock').textContent = S.working
        ? new Date(S.working.time * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
        : '—';
}

let loopTimer = null;
function runLoop() {
    clearTimeout(loopTimer);
    if (!S.playing) return;
    const delay = Math.max(30, 1000 / S.speed);
    loopTimer = setTimeout(async () => { await stepBar(); runLoop(); }, delay);
}

// ------------------------------------------------------------------ render

function drawPositionLines() {
    clearPositionLines();
    const p = S.position;
    if (!p) return;
    entryLine = candleSeries.createPriceLine({
        price: p.entry, color: '#f0b25a', lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Solid, title: 'entry'
    });
    if (p.sl !== null) slLine = candleSeries.createPriceLine({
        price: p.sl, color: '#e2564e', lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed, title: 'stop'
    });
    if (p.tp !== null) tpLine = candleSeries.createPriceLine({
        price: p.tp, color: '#12a184', lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed, title: 'target'
    });
}
function clearPositionLines() {
    [entryLine, slLine, tpLine].forEach(l => { if (l) candleSeries.removePriceLine(l); });
    entryLine = slLine = tpLine = null;
}

function updateEquity() {
    const op = openPL();
    const eq = S.balance + op;
    $('rp-balance').textContent = money(S.balance);
    $('rp-equity').textContent  = money(eq);
    const el = $('rp-openpl');
    el.textContent = S.position ? signed(op) : '—';
    el.className = S.position ? (op >= 0 ? 'val-pos' : 'val-neg') : '';

    S.peakEquity = Math.max(S.peakEquity, eq);
    const dd = S.peakEquity > 0 ? (S.peakEquity - eq) / S.peakEquity * 100 : 0;
    S.maxDD = Math.max(S.maxDD, dd);
    if (S.position) renderPosition();
}

function renderPosition() {
    const box = $('rp-position');
    const p = S.position;
    if (!p) { box.className = 'rp-empty'; box.textContent = 'Flat — no open position.'; return; }
    const op = openPL();
    box.className = 'rp-pos';
    box.innerHTML =
        `<div class="rp-pos-head">
           <span class="rp-tag ${p.side}">${p.side.toUpperCase()}</span>
           <span class="${op >= 0 ? 'val-pos' : 'val-neg'}">${signed(op)}</span>
         </div>
         <dl class="rp-pos-grid">
           <dt>Size</dt><dd>${fmt(p.qty, 4)}</dd>
           <dt>Entry</dt><dd>${fmt(p.entry)}</dd>
           <dt>Stop</dt><dd>${p.sl === null ? '—' : fmt(p.sl)}</dd>
           <dt>Target</dt><dd>${p.tp === null ? '—' : fmt(p.tp)}</dd>
           <dt>Risk</dt><dd>${money(p.riskAmt)}</dd>
         </dl>`;
}

function renderStats() {
    const t = S.trades;
    $('st-trades').textContent = t.length;
    if (!t.length) {
        ['st-win', 'st-net', 'st-pf', 'st-dd', 'st-r'].forEach(id => $(id).textContent = '—');
        return;
    }
    const wins = t.filter(x => x.pnl > 0);
    const gross = t.reduce((a, x) => a + (x.pnl > 0 ? x.pnl : 0), 0);
    const loss  = Math.abs(t.reduce((a, x) => a + (x.pnl < 0 ? x.pnl : 0), 0));
    const net   = t.reduce((a, x) => a + x.pnl, 0);
    const avgR  = t.reduce((a, x) => a + x.r, 0) / t.length;

    $('st-win').textContent = fmt(wins.length / t.length * 100, 1) + '%';
    const netEl = $('st-net');
    netEl.textContent = signed(net);
    netEl.className = net >= 0 ? 'val-pos' : 'val-neg';
    $('st-pf').textContent = loss ? fmt(gross / loss) : (gross ? '∞' : '—');
    $('st-dd').textContent = fmt(S.maxDD, 1) + '%';
    const rEl = $('st-r');
    rEl.textContent = (avgR >= 0 ? '+' : '') + fmt(avgR, 2) + 'R';
    rEl.className = avgR >= 0 ? 'val-pos' : 'val-neg';
}

function renderLog() {
    const body = $('rp-log');
    if (!S.trades.length) {
        body.innerHTML = '<tr><td colspan="6" class="rp-empty">No trades yet.</td></tr>';
        return;
    }
    body.innerHTML = S.trades.map((t, i) =>
        `<tr>
           <td>${i + 1}</td>
           <td class="${t.side === 'long' ? 'val-pos' : 'val-neg'}">${t.side === 'long' ? 'L' : 'S'}</td>
           <td class="num">${fmt(t.entry)}</td>
           <td class="num">${fmt(t.exit)}</td>
           <td class="num ${t.r >= 0 ? 'val-pos' : 'val-neg'}">${(t.r >= 0 ? '+' : '') + fmt(t.r, 2)}</td>
           <td class="num ${t.pnl >= 0 ? 'val-pos' : 'val-neg'}">${signed(t.pnl)}</td>
         </tr>`).reverse().join('');
}

function syncOrderButtons() {
    const live = !!S.working;
    $('rp-buy').disabled  = !live || !!S.position;
    $('rp-sell').disabled = !live || !!S.position;
    $('rp-close').disabled = !S.position;
}
function syncTransport() {
    $('rp-playpause').innerHTML = S.playing
        ? '<i class="fa-solid fa-pause"></i>'
        : '<i class="fa-solid fa-play"></i>';
}

function updateSizingHint() {
    const stopPts = +$('rp-stop').value || 0;
    const qty = sizeFor(stopPts);
    $('rp-sizing').textContent = qty
        ? `Size ${fmt(qty, 4)} units — risking ${money(S.balance * ((+$('rp-risk').value || 1) / 100))} at this stop.`
        : 'Set a stop to size the position.';
}

// -------------------------------------------------------------- session

async function loadSession() {
    const src = MARKETS[S.market];
    S.symbol = $('rp-symbol').value;
    S.tfMin  = +$('rp-tf').value;

    const chosen = $('rp-date').value;
    if (!chosen) { status('Pick a start date first.', true); return; }
    const startMs = Date.parse(chosen + 'T00:00:00Z');
    const earliest = Date.parse(src.earliest + 'T00:00:00Z');
    if (startMs < earliest) {
        status(`${src.label} history begins ${src.earliest}. Pick a later date.`, true);
        return;
    }
    if (startMs > Date.now() - 2 * 86400000) {
        status('Pick a start date at least two days in the past.', true);
        return;
    }

    Object.assign(S, {
        startMs, bars1m: [], fillIdx: 0, display: [], working: null,
        playing: false, exhausted: false,
        balance: S.startBalance, position: null, trades: [],
        peakEquity: S.startBalance, maxDD: 0
    });
    clearPositionLines();
    candleSeries.setData([]);
    renderPosition(); renderStats(); renderLog(); syncTransport();

    status('Loading market data…');
    await ensureBuffer();
    if (!S.bars1m.length) return;   // ensureBuffer surfaced the error already

    // Reveal an opening screen of context so there is something to read.
    const warmup = Math.max(60, Math.min(180, 1440 / S.tfMin));
    for (let i = 0; i < warmup; i++) await stepBar();

    hideStatus();
    $('rp-transport').hidden = false;
    syncOrderButtons();
    updateSizingHint();
    chart.timeScale().fitContent();
}

// ----------------------------------------------------------------- wiring

function init() {
    if (typeof LightweightCharts === 'undefined') {
        status('Charting library failed to load. Check your connection and reload.', true);
        return;
    }
    buildChart();

    const sel = $('rp-symbol');
    sel.innerHTML = MARKETS.crypto.symbols
        .map(s => `<option value="${s}">${s}</option>`).join('');

    // Default to a date with plenty of history on either side.
    const d = new Date(Date.now() - 400 * 86400000);
    $('rp-date').value = d.toISOString().slice(0, 10);
    $('rp-date').min = MARKETS.crypto.earliest;
    $('rp-date').max = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

    $('rp-load').addEventListener('click', loadSession);
    $('rp-playpause').addEventListener('click', () => {
        S.playing = !S.playing; syncTransport(); runLoop();
    });
    $('rp-step').addEventListener('click', () => { S.playing = false; syncTransport(); stepBar(); });
    $('rp-speed').addEventListener('input', e => {
        S.speed = +e.target.value;
        $('rp-speed-val').innerHTML = S.speed + '&times;';
        if (S.playing) runLoop();
    });
    $('rp-buy').addEventListener('click',  () => openPosition('long'));
    $('rp-sell').addEventListener('click', () => openPosition('short'));
    $('rp-close').addEventListener('click', () => {
        if (S.position && S.working) closePosition(S.working.close, 'manual');
    });
    ['rp-risk', 'rp-stop'].forEach(id => $(id).addEventListener('input', updateSizingHint));

    document.addEventListener('keydown', e => {
        if (/input|select|textarea/i.test(e.target.tagName)) return;
        if (e.code === 'Space')      { e.preventDefault(); $('rp-playpause').click(); }
        if (e.code === 'ArrowRight') { e.preventDefault(); $('rp-step').click(); }
    });

    updateEquity();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
