/* ==========================================================================
   BarTest — Replay Terminal

   TWO MODES, which is the thing that matters about the design.

   BROWSE — the default. The full chart, loaded up to the present and
   pannable back through history as far as the exchange has it. This is just
   a chart; nothing is hidden. Older bars stream in as you pan left.

   REPLAY — you pick a point and cut the chart there. Everything after that
   instant is withheld and revealed one bar at a time as you step or play.
   History before the cut stays on screen, so you are reading the same
   context you would have had at the time.

   Two decisions make the numbers trustworthy:

   1. NO LOOKAHEAD. In replay the series is only ever fed bars at or before
      the cursor; future bars sit in a buffer the render path cannot reach,
      so you cannot peek by dragging.

   2. FILLS RUN ON 1-MINUTE BARS, never the displayed candle. A candle cannot
      say whether its high or its low came first, and that ambiguity decides
      whether a trade won or lost — a stop and a target inside one 4h candle
      is otherwise a coin flip. Stepping the fill engine through the
      underlying 1m bars removes nearly all of it. Where a single 1m bar
      still touches both, the STOP is taken first: pessimistic, so results
      are never flattered.
   ========================================================================== */
(function () {
'use strict';

const BINANCE = 'https://api.binance.com/api/v3/klines';
const MIN_MS  = 60000;
const TF_LABEL = { 1: '1m', 5: '5m', 15: '15m', 60: '1h', 240: '4h' };

const MARKETS = {
    crypto: {
        label: 'Crypto',
        earliest: '2017-08-17',
        symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'],
        // Binance serves klines with CORS enabled, 1000 per call, so crypto
        // needs no hosting of our own at all.
        async klines(symbol, interval, opts) {
            const q = new URLSearchParams({ symbol, interval, limit: String(opts.limit || 1000) });
            if (opts.startTime) q.set('startTime', String(opts.startTime));
            if (opts.endTime)   q.set('endTime',   String(opts.endTime));
            const res = await fetch(`${BINANCE}?${q}`);
            if (!res.ok) throw new Error(`Binance ${res.status}`);
            return (await res.json()).map(k => ({
                t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4]
            }));
        }
    }
    // fx: needs 1m history we host ourselves — there is no free CORS-enabled
    // forex feed, so this cannot follow the same shape.
};

// ------------------------------------------------------------------- state

const S = {
    mode: 'browse',
    market: 'crypto',
    symbol: 'BTCUSDT',
    tfMin: 15,
    hist: [],            // display-TF bars, ascending (context + browse chart)
    oldestMs: null,      // oldest bar we hold, for paging further back
    loadingOlder: false,
    noMoreHistory: false,

    cursorMs: null,      // replay cut point
    bars1m: [],          // 1m bars from the cut onward
    fillIdx: 0,
    working: null,       // display candle currently forming
    revealed: [],        // completed display candles since the cut
    fetching1m: false,
    exhausted: false,

    playing: false,
    speed: 6,

    startBalance: 10000,
    balance: 10000,
    position: null,
    trades: [],
    peakEquity: 10000,
    maxDD: 0
};

// ----------------------------------------------------------------- helpers

const $ = id => document.getElementById(id);
const fmt = (n, d = 2) =>
    (n === null || n === undefined || !isFinite(n)) ? '—'
    : n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const money  = n => (n < 0 ? '-' : '') + '$' + fmt(Math.abs(n));
const signed = n => (n > 0 ? '+' : n < 0 ? '-' : '') + '$' + fmt(Math.abs(n));
const iso    = ms => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

function status(msg, kind) {
    const box = $('rp-status');
    box.hidden = false;
    box.classList.toggle('error', kind === 'error');
    $('rp-status-text').textContent = msg;
}
const hideStatus = () => { $('rp-status').hidden = true; };

// ------------------------------------------------------------------- chart

let chart, series, lines = [];

function buildChart() {
    const el = $('rp-chart');
    el.innerHTML = '';
    chart = LightweightCharts.createChart(el, {
        layout: { background: { color: '#08080a' }, textColor: '#a8abb3',
                  fontFamily: 'Share Tech Mono, monospace' },
        grid: { vertLines: { color: 'rgba(210,213,219,0.05)' },
                horzLines: { color: 'rgba(210,213,219,0.05)' } },
        rightPriceScale: { borderColor: 'rgba(210,213,219,0.13)' },
        timeScale: { borderColor: 'rgba(210,213,219,0.13)', timeVisible: true, secondsVisible: false },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        localization: { priceFormatter: p => p.toFixed(2) }
    });
    series = chart.addCandlestickSeries({
        upColor: '#12a184', downColor: '#e2564e',
        borderUpColor: '#12a184', borderDownColor: '#e2564e',
        wickUpColor: '#12a184', wickDownColor: '#e2564e'
    });
    // ResizeObserver fires once immediately on observe, which can happen
    // before layout has given the element a size. Passing 0x0 to applyOptions
    // puts the library into a state where it throws "Value is null" from
    // inside its bundle on every subsequent frame — an opaque error with no
    // stack, since the CDN script is cross-origin.
    new ResizeObserver(() => {
        const w = el.clientWidth, h = el.clientHeight;
        if (w > 0 && h > 0) chart.applyOptions({ width: w, height: h });
    }).observe(el);

    // Stream older history in as the user pans left, so the chart behaves
    // like a real one rather than ending at an arbitrary wall.
    chart.timeScale().subscribeVisibleLogicalRangeChange(r => {
        if (r && r.from < 12) loadOlder();
    });

    // Click a bar to choose the replay cut point.
    chart.subscribeClick(param => {
        if (S.mode !== 'browse' || !param.time) return;
        setCutPoint(param.time * 1000);
    });
}

function paint() {
    const raw = S.mode === 'browse'
        ? S.hist
        : S.hist.concat(S.revealed, S.working ? [S.working] : []);

    // Lightweight Charts requires strictly ascending, unique timestamps and
    // throws an opaque "Value is null" from inside its bundle when given
    // anything else — no indication of which bar is at fault. Three sources
    // can violate it here: the context fetch overlapping the cut, a paged 1m
    // request repeating its boundary bar, and the forming candle sharing a
    // timestamp with the last revealed one. Normalise rather than trust.
    const seen = new Set();
    const data = [];
    for (const b of raw) {
        if (!b || !isFinite(b.time) || !isFinite(b.open) || !isFinite(b.high)
            || !isFinite(b.low) || !isFinite(b.close)) continue;
        if (seen.has(b.time)) { data[data.length - 1] = b; continue; }  // later wins
        seen.add(b.time);
        data.push(b);
    }
    data.sort((a, b) => a.time - b.time);
    if (data.length !== raw.length) {
        console.warn(`[replay] normalised ${raw.length - data.length} bad/duplicate bars`);
    }
    try { series.setData(data); }
    catch (e) { console.error('[replay] setData rejected', e, data.slice(0, 3), data.slice(-3)); }
}

const toBar = k => ({ time: k.t / 1000, open: k.o, high: k.h, low: k.l, close: k.c });

// -------------------------------------------------------------- browse mode

async function loadChart(preserveView) {
    const src = MARKETS[S.market];
    S.symbol = $('rp-symbol').value;
    S.tfMin  = +$('rp-tf').value;

    S.hist = []; S.oldestMs = null; S.noMoreHistory = false;
    exitReplayState();

    status('Loading ' + S.symbol + ' ' + TF_LABEL[S.tfMin] + '…');
    try {
        const ks = await src.klines(S.symbol, TF_LABEL[S.tfMin], { limit: 1000 });
        if (!ks.length) { status('No data returned for that symbol.', 'error'); return; }
        S.hist = ks.map(toBar);
        S.oldestMs = ks[0].t;
        paint();
        chart.timeScale().fitContent();
        hideStatus();
        $('rp-hud').hidden = false;
        updateModeUI();
    } catch (e) {
        status('Could not load market data: ' + e.message +
               '. Binance may be unreachable from your network.', 'error');
    }
}

async function loadOlder() {
    if (S.loadingOlder || S.noMoreHistory || !S.oldestMs) return;
    S.loadingOlder = true;
    try {
        const ks = await MARKETS[S.market].klines(S.symbol, TF_LABEL[S.tfMin],
                        { endTime: S.oldestMs - 1, limit: 1000 });
        if (!ks.length) { S.noMoreHistory = true; return; }
        S.hist = ks.map(toBar).concat(S.hist);
        S.oldestMs = ks[0].t;
        paint();
    } catch (e) { /* leave the chart as-is; panning simply stops extending */ }
    finally { S.loadingOlder = false; }
}

// --------------------------------------------------------------- cut point

function setCutPoint(ms) {
    S.cutCandidate = ms;
    $('rp-cut-label').textContent = iso(ms);
    $('rp-start-replay').disabled = false;
    updateCutLine();
}

let cutLine = null;
function updateCutLine() {
    if (cutLine) { series.removePriceLine(cutLine); cutLine = null; }
    // A vertical marker is not available on the free library, so mark the cut
    // with the bar's own close instead — enough to see where you chose.
    const bar = S.hist.find(b => b.time * 1000 >= (S.cutCandidate || 0));
    if (!bar) return;
    cutLine = series.createPriceLine({
        price: bar.close, color: '#f0b25a', lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dotted, title: 'replay start'
    });
}

// -------------------------------------------------------------- replay mode

function exitReplayState() {
    S.mode = 'browse';
    S.cursorMs = null; S.bars1m = []; S.fillIdx = 0;
    S.working = null; S.revealed = []; S.exhausted = false;
    S.playing = false;
    clearPositionLines();
    updateModeUI();
}

function hasWorkToLose() { return !!S.position || S.trades.length > 0; }

async function startReplay() {
    const ms = S.cutCandidate;
    if (!ms) return;
    if (hasWorkToLose() &&
        !confirm('Starting a new replay clears the open position and trade log. Continue?')) return;

    // Context before the cut stays on screen. What is already loaded is the
    // browse window, which sits at the PRESENT — so cutting at an older date
    // filters it to nothing and leaves an empty chart. Fetch the bars that
    // actually precede the cut instead, and only fall back to filtering when
    // the cut lands inside the window we happen to hold.
    status('Loading context before the cut…');
    const preloaded = S.hist.filter(b => b.time * 1000 < ms);
    if (preloaded.length >= 200) {
        S.hist = preloaded;
    } else {
        try {
            const ctx = await MARKETS[S.market].klines(
                S.symbol, TF_LABEL[S.tfMin], { endTime: ms - 1, limit: 400 });
            S.hist = ctx.map(toBar);
        } catch (e) {
            status('Could not load chart context: ' + e.message, 'error');
            return;
        }
    }
    S.cursorMs = ms;
    S.mode = 'replay';
    S.bars1m = []; S.fillIdx = 0; S.working = null; S.revealed = [];
    S.exhausted = false; S.playing = false;
    S.balance = S.startBalance; S.position = null; S.trades = [];
    S.peakEquity = S.startBalance; S.maxDD = 0;
    if (cutLine) { series.removePriceLine(cutLine); cutLine = null; }

    renderPosition(); renderStats(); renderLog();
    status('Loading replay data…');
    await ensure1m();
    if (!S.bars1m.length) { exitReplayState(); return; }
    // Reveal the first candle so there is a live price to trade against the
    // moment replay starts. Without this the cut leaves you looking at
    // history with the Buy/Sell buttons dead and no obvious reason why.
    await stepBar();

    hideStatus();
    paint();
    chart.timeScale().scrollToRealTime();
    updateModeUI();
    updateEquity();
    updateSizingHint();
}

async function ensure1m() {
    if (S.fetching1m || S.exhausted) return;
    if (S.bars1m.length - S.fillIdx > 1440) return;
    S.fetching1m = true;
    try {
        const from = S.bars1m.length ? S.bars1m[S.bars1m.length - 1].t + MIN_MS : S.cursorMs;
        const page = await MARKETS[S.market].klines(S.symbol, '1m', { startTime: from, limit: 1000 });
        if (!page.length) S.exhausted = true;
        else {
            const last = S.bars1m.length ? S.bars1m[S.bars1m.length - 1].t : -1;
            for (const b of page) if (b.t > last) S.bars1m.push(b);
        }
    } catch (e) {
        status('Could not load replay data: ' + e.message, 'error');
        S.playing = false; syncTransport();
    } finally { S.fetching1m = false; }
}

// Fold a 1m bar into the forming display candle. True when a new one started.
function foldBar(b) {
    const size = S.tfMin * MIN_MS;
    const bucket = Math.floor(b.t / size) * size;
    if (!S.working || S.working.time !== bucket / 1000) {
        if (S.working) S.revealed.push(S.working);
        S.working = { time: bucket / 1000, open: b.o, high: b.h, low: b.l, close: b.c };
        return true;
    }
    S.working.high  = Math.max(S.working.high, b.h);
    S.working.low   = Math.min(S.working.low,  b.l);
    S.working.close = b.c;
    return false;
}

async function stepBar() {
    if (S.mode !== 'replay') return;
    await ensure1m();
    if (S.fillIdx >= S.bars1m.length) {
        if (S.exhausted) {
            S.playing = false; syncTransport();
            status('Reached the present — no further data.');
        }
        return;
    }
    let closed = false;
    while (S.fillIdx < S.bars1m.length && !closed) {
        const b = S.bars1m[S.fillIdx++];
        const startedNew = foldBar(b);
        applyFills(b);
        if (startedNew && S.revealed.length) closed = true;
    }
    paint();
    updateEquity();
    $('rp-clock').textContent = S.working ? iso(S.working.time * 1000) : '—';
}

let loopTimer = null;
function runLoop() {
    clearTimeout(loopTimer);
    if (!S.playing) return;
    loopTimer = setTimeout(async () => { await stepBar(); runLoop(); },
                           Math.max(30, 1000 / S.speed));
}

// ------------------------------------------------------------ order engine

function currentPrice() {
    if (S.mode === 'replay') return S.working ? S.working.close : null;
    return S.hist.length ? S.hist[S.hist.length - 1].close : null;
}

function sizeFor(stopPts) {
    if (!stopPts || stopPts <= 0) return 0;
    const riskPct = Math.max(0.1, +$('rp-risk').value || 1);
    return (S.balance * (riskPct / 100)) / stopPts;
}

function openPosition(side) {
    if (S.mode !== 'replay') { status('Start a replay before trading.', 'error'); return; }
    if (S.position) return;
    const price = currentPrice();
    if (price === null) return;
    const stopPts = +$('rp-stop').value || 0;
    const tgtPts  = +$('rp-target').value || 0;
    const qty = sizeFor(stopPts);
    if (!qty) { status('Set a stop distance so the position can be sized.', 'error'); return; }
    hideStatus();

    S.position = {
        side, qty, entry: price,
        sl: stopPts ? (side === 'long' ? price - stopPts : price + stopPts) : null,
        tp: tgtPts  ? (side === 'long' ? price + tgtPts  : price - tgtPts)  : null,
        riskAmt: stopPts * qty,
        openedAt: S.working ? S.working.time : null
    };
    drawPositionLines();
    renderPosition();
    syncOrderButtons();
}

function closePosition(price, reason) {
    const p = S.position;
    if (!p) return;
    const pnl = (p.side === 'long' ? price - p.entry : p.entry - price) * p.qty;
    S.balance += pnl;
    S.trades.push({
        side: p.side, entry: p.entry, exit: price, pnl,
        r: p.riskAmt ? pnl / p.riskAmt : 0, reason,
        openedAt: p.openedAt, closedAt: S.working ? S.working.time : null
    });
    S.position = null;
    clearPositionLines();
    renderPosition(); renderStats(); renderLog(); syncOrderButtons();
}

// Stop is checked before target: inside one minute we cannot know which came
// first, so take the pessimistic reading rather than flatter the result.
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
    const p = S.position, price = currentPrice();
    if (!p || price === null) return 0;
    return (p.side === 'long' ? price - p.entry : p.entry - price) * p.qty;
}

// ------------------------------------------------------------------ render

function drawPositionLines() {
    clearPositionLines();
    const p = S.position;
    if (!p) return;
    const add = (price, color, style, title) =>
        lines.push(series.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, title }));
    add(p.entry, '#f0b25a', LightweightCharts.LineStyle.Solid, 'entry');
    if (p.sl !== null) add(p.sl, '#e2564e', LightweightCharts.LineStyle.Dashed, 'stop');
    if (p.tp !== null) add(p.tp, '#12a184', LightweightCharts.LineStyle.Dashed, 'target');
}
function clearPositionLines() {
    lines.forEach(l => { try { series.removePriceLine(l); } catch (e) {} });
    lines = [];
}

function updateEquity() {
    const op = openPL(), eq = S.balance + op;
    $('rp-balance').textContent = money(S.balance);
    $('rp-equity').textContent  = money(eq);
    const el = $('rp-openpl');
    el.textContent = S.position ? signed(op) : '—';
    el.className   = S.position ? (op >= 0 ? 'val-pos' : 'val-neg') : '';
    S.peakEquity = Math.max(S.peakEquity, eq);
    if (S.peakEquity > 0) S.maxDD = Math.max(S.maxDD, (S.peakEquity - eq) / S.peakEquity * 100);
    if (S.position) renderPosition();
}

function renderPosition() {
    const box = $('rp-position'), p = S.position;
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
        ['st-win', 'st-net', 'st-pf', 'st-dd', 'st-r'].forEach(id => {
            $(id).textContent = '—'; $(id).className = '';
        });
        return;
    }
    const wins  = t.filter(x => x.pnl > 0).length;
    const gross = t.reduce((a, x) => a + (x.pnl > 0 ? x.pnl : 0), 0);
    const loss  = Math.abs(t.reduce((a, x) => a + (x.pnl < 0 ? x.pnl : 0), 0));
    const net   = t.reduce((a, x) => a + x.pnl, 0);
    const avgR  = t.reduce((a, x) => a + x.r, 0) / t.length;

    $('st-win').textContent = fmt(wins / t.length * 100, 1) + '%';
    const n = $('st-net'); n.textContent = signed(net); n.className = net >= 0 ? 'val-pos' : 'val-neg';
    $('st-pf').textContent = loss ? fmt(gross / loss) : (gross ? '∞' : '—');
    $('st-dd').textContent = fmt(S.maxDD, 1) + '%';
    const r = $('st-r');
    r.textContent = (avgR >= 0 ? '+' : '') + fmt(avgR, 2) + 'R';
    r.className = avgR >= 0 ? 'val-pos' : 'val-neg';
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
    const live = S.mode === 'replay' && !!S.working;
    $('rp-buy').disabled   = !live || !!S.position;
    $('rp-sell').disabled  = !live || !!S.position;
    $('rp-close').disabled = !S.position;
}
function syncTransport() {
    $('rp-playpause').innerHTML = S.playing
        ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
}

function updateModeUI() {
    const replay = S.mode === 'replay';
    document.body.classList.toggle('is-replay', replay);
    $('rp-transport').hidden = !replay;
    $('rp-cutbar').hidden = replay;
    $('rp-exit-replay').hidden = !replay;
    $('rp-mode').textContent = replay ? 'REPLAY' : 'BROWSE';
    $('rp-mode').className = 'rp-mode ' + (replay ? 'on' : '');
    syncOrderButtons(); syncTransport();
    if (!replay) $('rp-clock').textContent = '—';
}

function updateSizingHint() {
    const qty = sizeFor(+$('rp-stop').value || 0);
    $('rp-sizing').textContent = qty
        ? `Size ${fmt(qty, 4)} units — risking ${money(S.balance * ((+$('rp-risk').value || 1) / 100))} at this stop.`
        : 'Set a stop to size the position.';
}

// ----------------------------------------------------------------- wiring

function init() {
    if (typeof LightweightCharts === 'undefined') {
        status('Charting library failed to load. Check your connection and reload.', 'error');
        return;
    }
    buildChart();

    $('rp-symbol').innerHTML = MARKETS.crypto.symbols
        .map(s => `<option value="${s}">${s}</option>`).join('');

    const dateEl = $('rp-date');
    dateEl.min = MARKETS.crypto.earliest;
    dateEl.max = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    dateEl.value = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);

    $('rp-symbol').addEventListener('change', () => {
        if (hasWorkToLose() && !confirm('Changing symbol clears the session. Continue?')) return;
        S.balance = S.startBalance; S.position = null; S.trades = [];
        S.peakEquity = S.startBalance; S.maxDD = 0;
        renderPosition(); renderStats(); renderLog(); updateEquity();
        loadChart();
    });
    $('rp-tf').addEventListener('change', () => {
        if (S.mode === 'replay' &&
            !confirm('Changing timeframe ends the current replay. Continue?')) {
            $('rp-tf').value = String(S.tfMin); return;
        }
        loadChart();
    });

    $('rp-jump').addEventListener('click', () => {
        const v = $('rp-date').value;
        if (!v) return;
        setCutPoint(Date.parse(v + 'T00:00:00Z'));
    });
    $('rp-start-replay').addEventListener('click', startReplay);
    $('rp-exit-replay').addEventListener('click', () => {
        if (hasWorkToLose() && !confirm('Leaving replay keeps your trade log but closes the session. Continue?')) return;
        loadChart();
    });

    $('rp-playpause').addEventListener('click', () => {
        S.playing = !S.playing; syncTransport(); runLoop();
    });
    $('rp-step').addEventListener('click', () => {
        S.playing = false; syncTransport(); stepBar();
    });
    $('rp-speed').addEventListener('input', e => {
        S.speed = +e.target.value;
        $('rp-speed-val').innerHTML = S.speed + '&times;';
        if (S.playing) runLoop();
    });

    $('rp-buy').addEventListener('click',  () => openPosition('long'));
    $('rp-sell').addEventListener('click', () => openPosition('short'));
    $('rp-close').addEventListener('click', () => {
        const p = currentPrice();
        if (S.position && p !== null) closePosition(p, 'manual');
    });
    ['rp-risk', 'rp-stop'].forEach(id => $(id).addEventListener('input', updateSizingHint));

    document.addEventListener('keydown', e => {
        if (/input|select|textarea/i.test(e.target.tagName)) return;
        if (e.code === 'Space')      { e.preventDefault(); $('rp-playpause').click(); }
        if (e.code === 'ArrowRight') { e.preventDefault(); $('rp-step').click(); }
    });

    updateEquity();
    updateModeUI();
    loadChart();          // open on a real chart, not an empty panel
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
