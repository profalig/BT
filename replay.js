/* ==========================================================================
   BarTest — Replay Terminal

   TWO MODES, which is the thing that matters about the design.

   BROWSE — the default. The full chart, loaded up to the present and
   pannable back through history as far as the exchange has it. This is just
   a chart; nothing is hidden. Older bars stream in as you pan left, and the
   ticker strip runs live off the exchange websocket.

   REPLAY — you pick a point and cut the chart there. Everything after that
   instant is withheld and revealed one bar at a time as you step or play.
   History before the cut stays on screen, so you are reading the same
   context you would have had at the time.

   Three decisions make the numbers trustworthy:

   1. NO LOOKAHEAD. In replay the series is only ever fed bars at or before
      the cursor; future bars sit in a buffer the render path cannot reach,
      so you cannot peek by dragging. The live 24h ticker is switched off
      the moment a replay starts, for the same reason.

   2. FILLS RUN ON 1-MINUTE BARS, never the displayed candle. A candle cannot
      say whether its high or its low came first, and that ambiguity decides
      whether a trade won or lost — a stop and a target inside one 4h candle
      is otherwise a coin flip. Stepping the fill engine through the
      underlying 1m bars removes nearly all of it. Where a single 1m bar
      still touches both, the STOP is taken first: pessimistic, so results
      are never flattered.

   3. FEES ARE CHARGED. A strategy that only works before costs is not a
      strategy, so both sides of every trade pay the configured bps.
   ========================================================================== */
(function () {
'use strict';

const BINANCE = 'https://api.binance.com/api/v3';
const MIN_MS  = 60000;
const TF_LABEL = { 1: '1m', 5: '5m', 15: '15m', 60: '1h', 240: '4h', 1440: '1d' };

const MARKETS = {
    crypto: {
        label: 'Crypto',
        earliest: '2017-08-17',
        symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
                  'ADAUSDT', 'DOGEUSDT', 'LINKUSDT', 'AVAXUSDT', 'LTCUSDT'],
        // Binance serves klines with CORS enabled, 1000 per call, so crypto
        // needs no hosting of our own at all.
        async klines(symbol, interval, opts) {
            const q = new URLSearchParams({ symbol, interval, limit: String(opts.limit || 1000) });
            if (opts.startTime) q.set('startTime', String(opts.startTime));
            if (opts.endTime)   q.set('endTime',   String(opts.endTime));
            const res = await fetch(`${BINANCE}/klines?${q}`);
            if (!res.ok) throw new Error(`Binance ${res.status}`);
            return (await res.json()).map(k => ({
                t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5]
            }));
        },
        async ticker(symbol) {
            const res = await fetch(`${BINANCE}/ticker/24hr?symbol=${symbol}`);
            if (!res.ok) throw new Error(`Binance ${res.status}`);
            return await res.json();
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
    // One snapshot per revealed candle so stepping back is exact — it must
    // rewind the account too, not just the chart, or the log would show
    // trades that have not happened yet.
    marks: [],
    ws: null,
    tick: null,          // live 24h ticker payload

    startBalance: 10000,
    balance: 10000,
    feeBps: 5,
    lev: 10,
    marginMode: 'cross',
    position: null,
    orders: [],
    trades: [],
    tradeSeq: 0,
    orderSeq: 0,
    peakEquity: 10000,
    maxDD: 0,
    maxDDAbs: 0
};

// ----------------------------------------------------------------- helpers

const $ = id => document.getElementById(id);
const fmt = (n, d = 2) =>
    (n === null || n === undefined || !isFinite(n)) ? '—'
    : n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const money  = n => (n < 0 ? '-' : '') + '$' + fmt(Math.abs(n));
const signed = n => (n > 0 ? '+' : n < 0 ? '-' : '') + '$' + fmt(Math.abs(n));
const iso    = ms => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
const dayKey = ms => new Date(ms).toISOString().slice(0, 10);

// Price precision follows the instrument, not a fixed 2 — SOL and DOGE are
// unreadable at two decimals.
function pdp() {
    if (theme.precision !== 'auto') return +theme.precision;
    const p = currentPrice() || (S.hist.length ? S.hist[S.hist.length - 1].close : 100);
    return p < 1 ? 6 : p < 20 ? 4 : 2;
}
const px = n => fmt(n, pdp());
function compact(n) {
    if (!isFinite(n)) return '—';
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return fmt(n, 2);
}
const baseAsset = () => S.symbol.replace(/USDT$|BUSD$|USD$/, '');

/* A browser confirm() drops a Chrome-styled box with the hostname on it in
   the middle of a dark terminal. Same job, our own furniture. */
let askResolve = null;
function ask(title, text, okLabel) {
    return new Promise(resolve => {
        askResolve = resolve;
        $('rp-ask-title').textContent = title;
        $('rp-ask-text').textContent = text;
        $('rp-ask-yes').textContent = okLabel || 'Continue';
        $('rp-ask').hidden = false;
        setTimeout(() => $('rp-ask-yes').focus(), 30);
    });
}
function answer(v) {
    $('rp-ask').hidden = true;
    const r = askResolve; askResolve = null;
    if (r) r(v);
}
window.BTConfirm = ask;

function status(msg, kind) {
    const box = $('rp-status');
    box.hidden = false;
    box.classList.toggle('error', kind === 'error');
    $('rp-status-text').textContent = msg;
}
const hideStatus = () => { $('rp-status').hidden = true; };

// ------------------------------------------------------------------- chart

let chart, series, lines = [], orderLines = [];
let lastPainted = [];

function seriesOptions() {
    return {
        upColor: theme.hollow ? theme.bg : theme.up,
        downColor: theme.down,
        borderVisible: theme.borders,
        borderUpColor: theme.up,
        borderDownColor: theme.down,
        wickVisible: theme.wicks,
        wickUpColor: theme.up,
        wickDownColor: theme.down
    };
}

function makeSeries() {
    if (theme.type === 'line')
        return chart.addLineSeries({ color: theme.up, lineWidth: 2 });
    if (theme.type === 'area')
        return chart.addAreaSeries({ lineColor: theme.up, topColor: theme.up + '55', bottomColor: theme.up + '05' });
    if (theme.type === 'bar')
        return chart.addBarSeries({ upColor: theme.up, downColor: theme.down });
    return chart.addCandlestickSeries(seriesOptions());
}

function buildChart() {
    const el = $('rp-chart');
    el.innerHTML = '';
    chart = LightweightCharts.createChart(el, {
        layout: { background: { color: theme.bg }, textColor: theme.text,
                  fontFamily: 'IBM Plex Sans, system-ui, sans-serif', fontSize: 12 },
        grid: { vertLines: { color: theme.gridColor }, horzLines: { color: theme.gridColor } },
        rightPriceScale: { borderColor: 'rgba(255,255,255,0.09)' },
        timeScale: { borderColor: 'rgba(255,255,255,0.09)', timeVisible: true, secondsVisible: false },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        localization: { priceFormatter: p => fmt(p, pdp()) }
    });
    series = makeSeries();

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

    // Clicking a candle only chooses a cut point while the Replay panel is
    // actually open. Before, every click dropped a "replay start" marker
    // whether or not anyone was setting up a replay, which was noise.
    chart.subscribeClick(param => {
        if (S.mode !== 'browse' || !param.time) return;
        if ($('rp-cutbar').hidden) return;
        setCutPoint(param.time * 1000);
    });

    chart.subscribeCrosshairMove(param => {
        if (!param || !param.time) { renderOHLC(null); return; }
        const bar = lastPainted.find(b => b.time === param.time);
        renderOHLC(bar || null);
    });
}

function rebuildSeries() {
    try { chart.removeSeries(series); } catch (e) {}
    series = makeSeries();
    if (window.BTTools) BTTools.attach(chart, series, $('rp-chart-wrap'), { onChange: saveDrawings });
    paint();
    drawPositionLines();
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

    const shaped = (theme.type === 'line' || theme.type === 'area')
        ? data.map(b => ({ time: b.time, value: b.close }))
        : data;
    try { series.setData(shaped); }
    catch (e) { console.error('[replay] setData rejected', e, data.slice(0, 3), data.slice(-3)); }

    lastPainted = data;
    if (window.BTTools) BTTools.setBars(data);
    refreshIndicators(data);
    renderOHLC(data[data.length - 1] || null);
}

const toBar = k => ({ time: k.t / 1000, open: k.o, high: k.h, low: k.l, close: k.c, volume: k.v });

// -------------------------------------------------------------- browse mode

async function loadChart() {
    const src = MARKETS[S.market];
    S.symbol = $('rp-symbol').value;
    S.tfMin  = +$('rp-tf').value;

    S.hist = []; S.oldestMs = null; S.noMoreHistory = false;
    exitReplayState();
    syncTicker();

    status('Loading ' + S.symbol + ' ' + TF_LABEL[S.tfMin] + '…');
    try {
        const ks = await src.klines(S.symbol, TF_LABEL[S.tfMin], { limit: 1000 });
        if (!ks.length) { status('No data returned for that symbol.', 'error'); return; }
        S.hist = ks.map(toBar);
        S.oldestMs = ks[0].t;
        paint();
        chart.timeScale().fitContent();
        hideStatus();
        updateModeUI();
        renderAll();          // the ticket can only be priced once bars exist
        openStream();
        loadTicker();
        restoreLayout();
        restoreJournal();
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
        // Belt and braces: only accept bars that really are older than what we
        // hold, and in replay never anything at or past the cut.
        const limit = S.mode === 'replay' && S.cursorMs ? Math.min(S.oldestMs, S.cursorMs) : S.oldestMs;
        const older = ks.filter(k => k.t < limit);
        if (!older.length) { S.noMoreHistory = true; return; }
        S.hist = older.map(toBar).concat(S.hist);
        S.oldestMs = older[0].t;
        paint();
    } catch (e) { /* leave the chart as-is; panning simply stops extending */ }
    finally { S.loadingOlder = false; }
}

// ------------------------------------------------------- live price stream

/* Browse should be a LIVE chart, not a snapshot that goes stale until you
   reload. Binance publishes both a kline stream and a 24h ticker stream per
   symbol; the combined endpoint gives us the forming candle and the header
   statistics off one socket. */
function closeStream() {
    if (S.ws) { try { S.ws.onclose = null; S.ws.close(); } catch (e) {} S.ws = null; }
    $('rp-live').hidden = true;
}

function openStream() {
    closeStream();
    if (S.mode !== 'browse') return;
    const sym = S.symbol.toLowerCase();
    const streams = sym + '@kline_' + TF_LABEL[S.tfMin] + '/' + sym + '@ticker';
    let ws;
    try { ws = new WebSocket('wss://stream.binance.com:9443/stream?streams=' + streams); }
    catch (e) { return; }
    S.ws = ws;

    ws.onopen = () => { $('rp-live').hidden = false; };
    ws.onmessage = ev => {
        if (S.mode !== 'browse') return;
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        const d = msg && msg.data;
        if (!d) return;

        if (d.e === '24hrTicker') {
            S.tick = {
                last: +d.c, change: +d.p, changePct: +d.P,
                high: +d.h, low: +d.l, vol: +d.v, quoteVol: +d.q
            };
            renderTicker();
            return;
        }
        const k = d.k;
        if (!k) return;
        const bar = { time: k.t / 1000, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v };
        const last = S.hist[S.hist.length - 1];
        if (last && last.time === bar.time) S.hist[S.hist.length - 1] = bar;
        else if (!last || bar.time > last.time) S.hist.push(bar);
        else return;
        // update() rather than setData(): repainting the whole series on every
        // tick would fight the user's pan and zoom.
        try {
            series.update((theme.type === 'line' || theme.type === 'area')
                ? { time: bar.time, value: bar.close } : bar);
        } catch (e) { paint(); }
        lastPainted[lastPainted.length - 1] = bar;
        $('rp-livePrice').textContent = px(bar.close);
        // Stops, targets and resting orders have to be checked on the live
        // feed too. One tick is one traded price, so the bar handed to the
        // fill engine is that price and nothing else — no invented range.
        if (S.position || S.orders.length) {
            applyFills({ o: bar.close, h: bar.close, l: bar.close, c: bar.close });
        }
        updateEquity();
    };
    ws.onclose = () => { $('rp-live').hidden = true; S.ws = null; };
    ws.onerror  = () => { $('rp-live').hidden = true; };
}

async function loadTicker() {
    if (S.mode !== 'browse') return;
    try {
        const t = await MARKETS[S.market].ticker(S.symbol);
        S.tick = {
            last: +t.lastPrice, change: +t.priceChange, changePct: +t.priceChangePercent,
            high: +t.highPrice, low: +t.lowPrice, vol: +t.volume, quoteVol: +t.quoteVolume
        };
        renderTicker();
    } catch (e) { /* the header simply stays on dashes */ }
}

// --------------------------------------------------------------- cut point

function setCutPoint(ms) {
    S.cutCandidate = ms;
    $('rp-cut-label').textContent = iso(ms);
    $('rp-start-replay').disabled = false;
}

// -------------------------------------------------------------- replay mode

function exitReplayState() {
    S.mode = 'browse';
    S.cursorMs = null; S.bars1m = []; S.fillIdx = 0;
    S.working = null; S.revealed = []; S.exhausted = false;
    S.marks = [];
    S.playing = false;
    clearPositionLines();
    updateModeUI();
}

function hasWorkToLose() { return !!S.position || S.trades.length > 0 || S.orders.length > 0; }

let startingReplay = false;
async function startReplay() {
    const ms = S.cutCandidate;
    if (!ms || startingReplay) return;
    if (hasWorkToLose() && !await ask('Start a new replay?',
        'This clears the open position, working orders and trade log.', 'Start replay')) return;
    startingReplay = true;
    try {

    // Context before the cut stays on screen. What is already loaded is the
    // browse window, which sits at the PRESENT — so cutting at an older date
    // filters it to nothing and leaves an empty chart. Fetch the bars that
    // actually precede the cut instead, and only fall back to filtering when
    // the cut lands inside the window we happen to hold.
    closeStream();      // replay is historical; a live tick would corrupt it
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
    // The paging marker MUST follow the context swap. Left pointing at the
    // browse window it describes a completely different era, and the first
    // pan-left then fetches bars from that era and pastes them onto the
    // chart — which is exactly how a Feb 2022 replay ended up with 2026
    // prices sitting beside it.
    S.oldestMs = S.hist.length ? S.hist[0].time * 1000 : null;
    S.noMoreHistory = false;
    S.cursorMs = ms;
    S.mode = 'replay';
    S.bars1m = []; S.fillIdx = 0; S.working = null; S.revealed = [];
    S.marks = [];
    S.exhausted = false; S.playing = false;
    resetAccount(false);

    renderAll();
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
    syncTicker();
    updateTicket();
    } finally { startingReplay = false; }
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
        S.working = { time: bucket / 1000, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v };
        return true;
    }
    S.working.high  = Math.max(S.working.high, b.h);
    S.working.low   = Math.min(S.working.low,  b.l);
    S.working.close = b.c;
    S.working.volume = (S.working.volume || 0) + (b.v || 0);
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
    S.marks.push({
        fillIdx: S.fillIdx,
        revealedLen: S.revealed.length,
        working: S.working ? Object.assign({}, S.working) : null,
        balance: S.balance,
        tradesLen: S.trades.length,
        position: S.position ? Object.assign({}, S.position) : null,
        orders: S.orders.map(o => Object.assign({}, o)),
        peakEquity: S.peakEquity,
        maxDD: S.maxDD, maxDDAbs: S.maxDDAbs
    });
    if (S.marks.length > 5000) S.marks.shift();

    let closed = false;
    while (S.fillIdx < S.bars1m.length && !closed) {
        const b = S.bars1m[S.fillIdx++];
        const startedNew = foldBar(b);
        applyFills(b);
        if (startedNew && S.revealed.length) closed = true;
    }
    paint();
    updateEquity();
    syncTicker();
}

function stepBack() {
    if (S.mode !== 'replay') return;
    const m = S.marks.pop();
    if (!m) return;
    S.playing = false; syncTransport();
    S.fillIdx = m.fillIdx;
    S.revealed.length = m.revealedLen;
    S.working = m.working;
    S.balance = m.balance;
    S.trades.length = m.tradesLen;      // un-happen anything after this bar
    S.position = m.position;
    S.orders = m.orders.map(o => Object.assign({}, o));
    S.peakEquity = m.peakEquity;
    S.maxDD = m.maxDD; S.maxDDAbs = m.maxDDAbs;
    drawPositionLines();
    paint();
    updateEquity();
    renderAll();
    syncTicker();
}

let loopTimer = null;
function runLoop() {
    clearTimeout(loopTimer);
    if (!S.playing) return;
    loopTimer = setTimeout(async () => { await stepBar(); runLoop(); },
                           Math.max(30, 1000 / S.speed));
}

// ------------------------------------------------------------- indicators

/* Indicators are recomputed from whatever the chart is currently showing, so
   in replay they see exactly the bars revealed so far and never the future.
   That is why they are driven from paint() rather than kept in their own
   cache: a cached indicator would leak lookahead the moment you stepped
   backward, which is precisely the thing this tool exists to prevent. */

const IND = {
    sma: { label: 'SMA', pane: 'price', params: { period: 20 }, src: true,
           calc: (b, p) => movingAvg(srcOf(b, p.source), p.period) },
    ema: { label: 'EMA', pane: 'price', params: { period: 21 }, src: true,
           calc: (b, p) => expAvg(srcOf(b, p.source), p.period) },
    vwma: { label: 'VWMA', pane: 'price', params: { period: 20 },
            calc: (b, p) => {
                const out = new Array(b.length).fill(null);
                for (let i = p.period - 1; i < b.length; i++) {
                    let pv = 0, v = 0;
                    for (let j = i - p.period + 1; j <= i; j++) {
                        const vol = b[j].volume || 1;
                        pv += b[j].close * vol; v += vol;
                    }
                    out[i] = v ? pv / v : null;
                }
                return out;
            } },
    bb: {
        label: 'Bollinger', pane: 'price', params: { period: 20, mult: 2 }, multi: 3,
        outputs: ['Basis', 'Upper', 'Lower'], src: true,
        calc: (b, p) => {
            const c = srcOf(b, p.source), ma = movingAvg(c, p.period);
            const up = [], lo = [];
            for (let i = 0; i < c.length; i++) {
                if (ma[i] === null) { up.push(null); lo.push(null); continue; }
                let sum = 0;
                for (let j = i - p.period + 1; j <= i; j++) sum += Math.pow(c[j] - ma[i], 2);
                const sd = Math.sqrt(sum / p.period);
                up.push(ma[i] + p.mult * sd);
                lo.push(ma[i] - p.mult * sd);
            }
            return [ma, up, lo];
        }
    },
    rsi: {
        label: 'RSI', pane: 'lower', params: { period: 14 }, src: true,
        calc: (b, p) => {
            const c = srcOf(b, p.source), out = new Array(c.length).fill(null);
            let g = 0, l = 0;
            for (let i = 1; i < c.length; i++) {
                const d = c[i] - c[i - 1];
                const up = d > 0 ? d : 0, dn = d < 0 ? -d : 0;
                if (i <= p.period) {
                    g += up; l += dn;
                    if (i === p.period) {
                        g /= p.period; l /= p.period;
                        out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
                    }
                } else {
                    g = (g * (p.period - 1) + up) / p.period;
                    l = (l * (p.period - 1) + dn) / p.period;
                    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
                }
            }
            return out;
        }
    },
    macd: {
        label: 'MACD', pane: 'lower', params: { period: 12, slow: 26, signal: 9 }, multi: 2,
        outputs: ['MACD', 'Signal'], src: true,
        calc: (b, p) => {
            const c = srcOf(b, p.source);
            const f = expAvg(c, p.period), s = expAvg(c, p.slow);
            const line = c.map((_, i) => (f[i] === null || s[i] === null) ? null : f[i] - s[i]);
            const clean = line.map(v => v === null ? 0 : v);
            const sig = expAvg(clean, p.signal).map((v, i) => line[i] === null ? null : v);
            return [line, sig];
        }
    },
    atr: {
        label: 'ATR', pane: 'lower', params: { period: 14 },
        calc: (b, p) => {
            const tr = b.map((x, i) => i === 0 ? x.high - x.low : Math.max(
                x.high - x.low,
                Math.abs(x.high - b[i - 1].close),
                Math.abs(x.low - b[i - 1].close)));
            return expAvg(tr, p.period);
        }
    },
    stoch: {
        label: 'Stochastic', pane: 'lower', params: { period: 14, signal: 3 }, multi: 2,
        outputs: ['%K', '%D'],
        calc: (b, p) => {
            const k = new Array(b.length).fill(null);
            for (let i = p.period - 1; i < b.length; i++) {
                let hi = -Infinity, lo = Infinity;
                for (let j = i - p.period + 1; j <= i; j++) {
                    hi = Math.max(hi, b[j].high); lo = Math.min(lo, b[j].low);
                }
                k[i] = hi === lo ? 50 : (b[i].close - lo) / (hi - lo) * 100;
            }
            const d = movingAvg(k.map(v => v === null ? 0 : v), p.signal)
                        .map((v, i) => k[i] === null ? null : v);
            return [k, d];
        }
    },
    vwap: {
        label: 'VWAP (session)', pane: 'price', params: {},
        calc: b => {
            const out = []; let pv = 0, vv = 0, day = null;
            for (const x of b) {
                const d = dayKey(x.time * 1000);
                if (d !== day) { day = d; pv = 0; vv = 0; }
                const v = x.volume || 1;
                pv += (x.high + x.low + x.close) / 3 * v; vv += v;
                out.push(vv ? pv / vv : null);
            }
            return out;
        }
    }
};

/* Which price an indicator is measured on. TradingView calls this the
   source, and it is the input traders change most after the period. */
const SOURCES = ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'];
function srcOf(bars, name) {
    switch (name) {
        case 'open':  return bars.map(b => b.open);
        case 'high':  return bars.map(b => b.high);
        case 'low':   return bars.map(b => b.low);
        case 'hl2':   return bars.map(b => (b.high + b.low) / 2);
        case 'hlc3':  return bars.map(b => (b.high + b.low + b.close) / 3);
        case 'ohlc4': return bars.map(b => (b.open + b.high + b.low + b.close) / 4);
        default:      return bars.map(b => b.close);
    }
}

function movingAvg(v, n) {
    const out = new Array(v.length).fill(null);
    let sum = 0;
    for (let i = 0; i < v.length; i++) {
        sum += v[i];
        if (i >= n) sum -= v[i - n];
        if (i >= n - 1) out[i] = sum / n;
    }
    return out;
}
function expAvg(v, n) {
    const out = new Array(v.length).fill(null), k = 2 / (n + 1);
    let prev = null;
    for (let i = 0; i < v.length; i++) {
        prev = prev === null ? v[i] : v[i] * k + prev * (1 - k);
        if (i >= n - 1) out[i] = prev;
    }
    return out;
}

let legendCollapsed = false;
const IND_COLORS = ['#f7a600', '#5aa9f0', '#c58af0', '#20b26c', '#ef454a', '#00c2c2'];
let indSeq = 0;
const activeInd = [];

const DASH = { solid: 0, dotted: 1, dashed: 2 };

function lineOpts(st) {
    return {
        color: st.color, lineWidth: +st.width || 2,
        lineStyle: DASH[st.dash] || 0,
        visible: st.visible !== false,
        priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: false
    };
}

function makeLine(pane, st) {
    const opts = lineOpts(st);
    if (pane === 'lower') {
        opts.priceScaleId = 'ind-lower';
        const ls = chart.addLineSeries(opts);
        chart.priceScale('ind-lower').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
        return ls;
    }
    return chart.addLineSeries(opts);
}

// Secondary plots of the same indicator are dimmed shades of its main colour,
// so a Bollinger band still reads as one object.
function shade(hex, i) {
    if (!i) return hex;
    const h = hex.replace('#', '');
    const v = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const mix = c => Math.round(c + (150 - c) * 0.35);
    return '#' + [(v >> 16) & 255, (v >> 8) & 255, v & 255]
        .map(c => mix(c).toString(16).padStart(2, '0')).join('');
}

function addIndicator(type, params, code, styles) {
    const def = IND[type];
    const count = (def && def.multi) || 1;
    const item = {
        id: ++indSeq, type: type,
        params: Object.assign({ source: 'close' }, def ? def.params : {}, params || {}),
        code: code || null, lines: [], styles: [], error: null, hidden: false
    };
    const col = item.params.color || IND_COLORS[indSeq % IND_COLORS.length];
    item.params.color = col;
    for (let i = 0; i < count; i++) {
        const st = Object.assign(
            { color: shade(col, i), width: i === 0 ? 2 : 1, dash: 'solid', visible: true },
            (styles && styles[i]) || {});
        item.styles.push(st);
        item.lines.push(makeLine(def ? def.pane : 'price', st));
    }
    activeInd.push(item);
    renderIndicatorList();
    saveIndicators();
    refreshIndicators(lastPainted);
    return item;
}

function applyLineStyle(item, i) {
    try { item.lines[i].applyOptions(lineOpts(item.styles[i])); } catch (e) {}
}

function removeIndicator(id) {
    const i = activeInd.findIndex(a => a.id === id);
    if (i < 0) return;
    activeInd[i].lines.forEach(l => { try { chart.removeSeries(l); } catch (e) {} });
    activeInd.splice(i, 1);
    renderIndicatorList();
    renderLegend();
    saveIndicators();
}

function refreshIndicators(data) {
    if (!data || !data.length) {
        activeInd.forEach(a => a.lines.forEach(l => l.setData([])));
        return;
    }
    for (const a of activeInd) {
        if (a.hidden) { a.lines.forEach(l => { try { l.setData([]); } catch (e) {} }); continue; }
        let res;
        try {
            if (a.type === 'custom') {
                // Runs only in this browser, on code the user wrote themselves.
                const fn = new Function('bars', a.code);
                res = fn(data.map(b => ({
                    time: b.time, open: b.open, high: b.high, low: b.low,
                    close: b.close, volume: b.volume
                })));
                if (!Array.isArray(res)) throw new Error('must return an array');
            } else {
                res = IND[a.type].calc(data, a.params);
            }
        } catch (e) {
            a.error = e.message;
            a.lines.forEach(l => l.setData([]));
            renderIndicatorList();
            continue;
        }
        a.error = null;
        const sets = Array.isArray(res[0]) ? res : [res];
        a.lines.forEach((line, li) => {
            const vals = sets[li] || [];
            line.setData(data
                .map((b, i) => ({ time: b.time, value: vals[i] }))
                .filter(x => x.value !== null && x.value !== undefined && isFinite(x.value)));
        });
        const primary = sets[0] || [];
        a.lastValue = null;
        for (let i = primary.length - 1; i >= 0; i--) {
            if (primary[i] !== null && primary[i] !== undefined && isFinite(primary[i])) {
                a.lastValue = primary[i]; break;
            }
        }
    }
    renderLegend();
}

// ------------------------------------------------- on-chart legend (TV-like)

function renderOHLC(bar) {
    const box = $('rp-ohlc');
    if (!box) return;
    if (!bar) { box.innerHTML = ''; return; }
    const up = bar.close >= bar.open;
    const d = bar.close - bar.open;
    const pct = bar.open ? d / bar.open * 100 : 0;
    const c = up ? 'val-pos' : 'val-neg';
    box.innerHTML =
        '<span class="sym">' + S.symbol + '</span>' +
        '<span class="tf">' + (TF_LABEL[S.tfMin] || '') + '</span>' +
        '<span class="tf">Binance</span>' +
        '<i>O</i><span class="' + c + '">' + px(bar.open) + '</span>' +
        '<i>H</i><span class="' + c + '">' + px(bar.high) + '</span>' +
        '<i>L</i><span class="' + c + '">' + px(bar.low) + '</span>' +
        '<i>C</i><span class="' + c + '">' + px(bar.close) + '</span>' +
        '<span class="' + c + '">' + (d >= 0 ? '+' : '') + px(d) +
        ' (' + (d >= 0 ? '+' : '') + pct.toFixed(2) + '%)</span>';
}

/* Click the eye to hide a line, the gear for its settings, and double-click
   the row for the same — the gestures the platform traders already use. */
function renderLegend() {
    const box = $('rp-legend');
    const toggle = $('rp-leg-toggle');
    if (!box) return;
    toggle.hidden = !activeInd.length;
    $('rp-leg-n').textContent = activeInd.length;
    $('rp-leg-word').textContent = activeInd.length === 1 ? 'indicator' : 'indicators';
    if (!activeInd.length) { box.innerHTML = ''; return; }
    if (legendCollapsed) { box.innerHTML = ''; return; }

    box.innerHTML = activeInd.map(a => {
        const col = (a.styles[0] && a.styles[0].color) || a.params.color;
        const label = a.type === 'custom' ? 'Custom script'
            : IND[a.type].label + (a.params.period ? ' ' + a.params.period : '');
        const last = a.lastValue;
        const val = (last === null || last === undefined || !isFinite(last))
            ? '' : '<b>' + fmt(last, pdp()) + '</b>';
        // The controls are always in the row, never revealed on hover: a row
        // that changes width when the pointer crosses it shoves everything
        // beside it out of the way.
        return '<div class="rp-leg-row' + (a.hidden ? ' off' : '') + '" data-leg="' + a.id +
                 '" title="Double-click for settings">' +
                 '<span class="rp-leg-dot" style="background:' + col + '"></span>' +
                 '<span class="rp-leg-name">' + label + '</span>' + val +
                 (a.error ? '<span class="rp-leg-err" title="' +
                    a.error.replace(/"/g, '&quot;') + '">!</span>' : '') +
                 '<span class="rp-leg-btns">' +
                   '<button data-eye="' + a.id + '" title="Show / hide">' +
                     '<i class="fa-solid fa-eye' + (a.hidden ? '-slash' : '') + '"></i></button>' +
                   '<button data-gear2="' + a.id + '" title="Settings">' +
                     '<i class="fa-solid fa-gear"></i></button>' +
                   '<button data-kill="' + a.id + '" title="Remove">' +
                     '<i class="fa-solid fa-xmark"></i></button>' +
                 '</span>' +
               '</div>';
    }).join('');
    box.querySelectorAll('.rp-leg-row').forEach(row =>
        row.addEventListener('dblclick', e => {
            e.stopPropagation();
            openIndSettings(+row.dataset.leg);
        }));
    box.querySelectorAll('[data-eye]').forEach(b =>
        b.addEventListener('click', e => {
            e.stopPropagation();
            const a = activeInd.find(x => x.id === +b.dataset.eye);
            if (a) { a.hidden = !a.hidden; refreshIndicators(lastPainted); saveIndicators(); }
        }));
    box.querySelectorAll('[data-gear2]').forEach(b =>
        b.addEventListener('click', e => { e.stopPropagation(); openIndSettings(+b.dataset.gear2); }));
    box.querySelectorAll('[data-kill]').forEach(b =>
        b.addEventListener('click', e => {
            e.stopPropagation();
            removeIndicator(+b.dataset.kill); updateIndCount();
        }));
}

/* Double-clicking an indicator — on the chart legend or in the list — opens
   its own dialog, Inputs and Style on separate tabs, the way every platform
   trader already expects. Every plot gets its own colour, width, style and
   visibility, because a Bollinger basis and its bands are not one line. */
let icfgId = null, icfgTab = 'inputs';

function openIndSettings(id) {
    const a = activeInd.find(x => x.id === id);
    if (!a) return;
    icfgId = id; icfgTab = 'inputs';
    $('rp-icfg').hidden = false;
    document.querySelectorAll('#rp-icfg-tabs button').forEach(b =>
        b.classList.toggle('active', b.dataset.itab === 'inputs'));
    renderIndCfg();
}
function closeIndCfg() { $('rp-icfg').hidden = true; icfgId = null; }

function indName(a) {
    return a.type === 'custom' ? 'Custom script'
        : IND[a.type].label + (a.params.period ? ' ' + a.params.period : '');
}

function renderIndCfg() {
    const a = activeInd.find(x => x.id === icfgId);
    if (!a) { closeIndCfg(); return; }
    const def = IND[a.type];
    $('rp-icfg-title').textContent = indName(a);
    const box = $('rp-icfg-body');
    const row = (lab, html) => '<div class="rp-set-row wide"><label>' + lab + '</label>' + html + '</div>';

    if (icfgTab === 'inputs') {
        let h = '';
        if (a.type === 'custom') {
            h += '<p class="rp-hint">Your own script. Edit the code and it recomputes on the ' +
                 'bars currently revealed.</p>' +
                 '<textarea id="rp-icfg-code" rows="10" spellcheck="false">' +
                 String(a.code || '').replace(/</g, '&lt;') + '</textarea>';
        } else {
            const num = (k, lab, min, max, step) => row(lab,
                '<input type="number" min="' + min + '" max="' + max + '" step="' + (step || 1) +
                '" data-p="' + k + '" value="' + (a.params[k]) + '">');
            if (def.params.period !== undefined) h += num('period', 'Length', 1, 500);
            if (def.params.slow !== undefined)   h += num('slow', 'Slow length', 2, 500);
            if (def.params.signal !== undefined) h += num('signal', 'Signal smoothing', 1, 100);
            if (def.params.mult !== undefined)   h += num('mult', 'Std dev multiplier', 0.1, 10, 0.1);
            if (def.src) {
                h += row('Source', '<select data-p="source">' + SOURCES.map(o =>
                    '<option value="' + o + '"' + (a.params.source === o ? ' selected' : '') +
                    '>' + o + '</option>').join('') + '</select>');
            }
            if (!h) h = '<p class="rp-hint">This indicator has no inputs to configure.</p>';
        }
        box.innerHTML = h;
        box.querySelectorAll('[data-p]').forEach(inp =>
            inp.addEventListener('input', () => {
                const v = inp.type === 'number' ? +inp.value : inp.value;
                a.params[inp.dataset.p] = v;
                $('rp-icfg-title').textContent = indName(a);
                refreshIndicators(lastPainted); saveIndicators(); renderIndicatorList();
            }));
        const code = document.getElementById('rp-icfg-code');
        if (code) code.addEventListener('input', () => {
            a.code = code.value;
            refreshIndicators(lastPainted); saveIndicators();
        });
        return;
    }

    // ---- style tab
    const names = (def && def.outputs) || ['Plot'];
    box.innerHTML = a.styles.map((st, i) =>
        '<div class="rp-plot-row" data-line="' + i + '">' +
          '<label class="chk"><input type="checkbox" data-k="visible"' +
            (st.visible !== false ? ' checked' : '') + '></label>' +
          '<span class="rp-plot-name">' + (names[i] || ('Plot ' + (i + 1))) + '</span>' +
          '<input type="color" data-k="color" value="' + st.color + '">' +
          '<select data-k="width">' + [1, 2, 3, 4].map(w =>
            '<option value="' + w + '"' + (+st.width === w ? ' selected' : '') + '>' + w + 'px</option>').join('') +
          '</select>' +
          '<select data-k="dash">' + ['solid', 'dashed', 'dotted'].map(d =>
            '<option value="' + d + '"' + (st.dash === d ? ' selected' : '') + '>' +
            d[0].toUpperCase() + d.slice(1) + '</option>').join('') +
          '</select>' +
        '</div>').join('') +
        '<div class="rp-set-row" style="margin-top:14px">' +
          '<label class="chk"><input type="checkbox" id="rp-icfg-hide"' +
          (a.hidden ? ' checked' : '') + '> Hide this indicator entirely</label></div>';

    box.querySelectorAll('.rp-plot-row [data-k]').forEach(inp =>
        inp.addEventListener('input', () => {
            const i = +inp.closest('.rp-plot-row').dataset.line;
            const k = inp.dataset.k;
            a.styles[i][k] = inp.type === 'checkbox' ? inp.checked
                           : (k === 'width' ? +inp.value : inp.value);
            applyLineStyle(a, i);
            saveIndicators(); renderLegend(); renderIndicatorList();
        }));
    const hide = document.getElementById('rp-icfg-hide');
    if (hide) hide.addEventListener('change', () => {
        a.hidden = hide.checked;
        refreshIndicators(lastPainted); saveIndicators();
    });
}

function renderIndicatorList() {
    const box = $('rp-ind-list');
    if (!box) return;
    if (!activeInd.length) { box.innerHTML = '<div class="rp-empty">None active.</div>'; return; }
    box.innerHTML = activeInd.map(a => {
        const label = a.type === 'custom'
            ? 'Custom' : IND[a.type].label + (a.params.period ? ' ' + a.params.period : '');
        const err = a.error
            ? '<span class="rp-ind-err" title="' + a.error.replace(/"/g, '&quot;') + '">error</span>' : '';
        const col = (a.styles[0] && a.styles[0].color) || a.params.color;
        return '<div class="rp-ind-wrap">' +
               '<div class="rp-ind-item">' +
               '<span class="rp-ind-dot" style="background:' + col + '"></span>' +
               '<span class="rp-ind-name">' + label + '</span>' + err +
               '<button class="rp-ind-gear" data-gear="' + a.id + '" title="Settings">' +
                 '<i class="fa-solid fa-gear"></i></button>' +
               '<button class="rp-ind-x" data-ind="' + a.id + '" title="Remove">&times;</button>' +
               '</div>' + indicatorSettingsHTML(a) + '</div>';
    }).join('');
    box.querySelectorAll('.rp-ind-x').forEach(b =>
        b.addEventListener('click', () => { removeIndicator(+b.dataset.ind); updateIndCount(); }));
    box.querySelectorAll('.rp-ind-gear').forEach(b =>
        b.addEventListener('click', () => {
            const cfg = box.querySelector('.rp-ind-cfg[data-cfg="' + b.dataset.gear + '"]');
            if (cfg) cfg.classList.toggle('open');
        }));
    box.querySelectorAll('.rp-ind-cfg input').forEach(inp =>
        inp.addEventListener('input', () => {
            const id = +inp.closest('.rp-ind-cfg').dataset.cfg;
            applyIndicatorParam(id, inp.dataset.k, inp.value);
        }));
}

function indicatorSettingsHTML(a) {
    const def = IND[a.type];
    const rows = [];
    if (a.type !== 'custom' && def && def.params.period !== undefined) {
        rows.push('<label>Period<input type="number" min="1" max="400" value="' +
                  (a.params.period || 20) + '" data-k="period"></label>');
    }
    if (a.type === 'bb') {
        rows.push('<label>Mult<input type="number" min="0.5" max="5" step="0.1" value="' +
                  (a.params.mult || 2) + '" data-k="mult"></label>');
    }
    if (a.type === 'macd') {
        rows.push('<label>Slow<input type="number" min="2" max="200" value="' +
                  (a.params.slow || 26) + '" data-k="slow"></label>');
        rows.push('<label>Signal<input type="number" min="1" max="100" value="' +
                  (a.params.signal || 9) + '" data-k="signal"></label>');
    }
    if (a.type === 'stoch') {
        rows.push('<label>Signal<input type="number" min="1" max="50" value="' +
                  (a.params.signal || 3) + '" data-k="signal"></label>');
    }
    rows.push('<label>Colour<input type="color" value="' +
              (a.params.color || IND_COLORS[a.id % IND_COLORS.length]) + '" data-k="color"></label>');
    return '<div class="rp-ind-cfg" data-cfg="' + a.id + '">' + rows.join('') + '</div>';
}

function applyIndicatorParam(id, key, value) {
    const a = activeInd.find(x => x.id === id);
    if (!a) return;
    a.params[key] = key === 'color' ? value : (+value || a.params[key]);
    if (key === 'color') {
        a.lines.forEach((l, i) => l.applyOptions({ color: value, lineWidth: i === 0 ? 2 : 1 }));
    }
    refreshIndicators(lastPainted);
    saveIndicators();
    renderIndicatorList();
}

// ============================================================ order engine

function currentPrice() {
    if (S.mode === 'replay') return S.working ? S.working.close : null;
    return S.hist.length ? S.hist[S.hist.length - 1].close : null;
}

// Which bar a fill belongs to, in whichever mode we are in. Trading is not
// replay-only: the live chart is a perfectly good place to take a trade, it
// simply cannot be stepped backwards afterwards.
function nowBarTime() {
    if (S.mode === 'replay') return S.working ? S.working.time : null;
    return S.hist.length ? S.hist[S.hist.length - 1].time : null;
}

let otype = 'market';
let sizeMode = 'risk';
let slMode = 'price';

const feeOn = notional => notional * (S.feeBps / 10000);

// Entry price the ticket is currently working with.
function ticketPrice() {
    if (otype === 'market') return currentPrice();
    const v = parseFloat($('rp-price').value);
    return isFinite(v) && v > 0 ? v : currentPrice();
}

// Stop and target come in as either a price or a distance in points.
function ticketLevels(side, entry) {
    const rawStop = parseFloat($('rp-stop').value);
    const rawTgt  = parseFloat($('rp-target').value);
    let sl = null, tp = null;
    if (isFinite(rawStop) && rawStop > 0) {
        sl = slMode === 'price' ? rawStop
           : (side === 'long' ? entry - rawStop : entry + rawStop);
    }
    if (isFinite(rawTgt) && rawTgt > 0) {
        tp = slMode === 'price' ? rawTgt
           : (side === 'long' ? entry + rawTgt : entry - rawTgt);
    }
    return { sl, tp };
}

function maxQty(entry) {
    if (!entry) return 0;
    return (S.balance * S.lev) / entry;
}

// Quantity for the ticket, from whichever sizing mode is showing.
function ticketQty(side, entry) {
    if (sizeMode === 'qty') {
        const q = parseFloat($('rp-qty').value);
        if (!isFinite(q) || q <= 0) return 0;
        // Typed in USDT, the figure is notional, not coins.
        return $('rp-qty-unit').value === 'quote' ? q / entry : q;
    }
    const lv = ticketLevels(side || 'long', entry);
    const riskPct = Math.max(0.01, parseFloat($('rp-risk').value) || 1);
    const budget = S.balance * (riskPct / 100);
    if (lv.sl !== null) {
        const dist = Math.abs(entry - lv.sl);
        if (dist > 0) return Math.min(budget / dist, maxQty(entry));
    }
    // No stop yet: fall back to the slider's share of the maximum position.
    const pct = +$('rp-pct').value || 0;
    return maxQty(entry) * (pct / 100);
}

function updateTicket() {
    const entry = ticketPrice();
    const side = 'long';
    if (entry === null) { blankReadout(); return; }
    const qty = ticketQty(side, entry);
    const lv  = ticketLevels(side, entry);
    const notional = qty * entry;
    const margin = notional / S.lev;
    const risk = lv.sl !== null ? Math.abs(entry - lv.sl) * qty + feeOn(notional) * 2 : null;
    const reward = lv.tp !== null ? Math.abs(lv.tp - entry) * qty - feeOn(notional) * 2 : null;
    const liq = liqPrice(side, entry);

    $('rp-rd-value').textContent = notional ? money(notional) : '—';
    $('rp-rd-cost').textContent  = notional ? money(margin) : '—';
    const rd = $('rp-rd-risk');
    rd.textContent = risk === null ? '—' : money(risk) +
        '  (' + fmt(risk / S.balance * 100, 2) + '%)';
    rd.className = risk === null ? '' : 'val-neg';
    $('rp-rd-rr').textContent = (reward === null || risk === null || !risk)
        ? '—' : money(reward) + '   ' + fmt(reward / risk, 2) + 'R';
    $('rp-rd-liq').textContent = liq === null ? '—' : px(liq);

    const unitSel = $('rp-qty-unit');
    unitSel.options[0].textContent = baseAsset();
    if (sizeMode === 'risk' && qty) {
        $('rp-qty').value = unitSel.value === 'quote'
            ? (qty * entry).toFixed(2) : qty.toFixed(6);
    }
    const mq = maxQty(entry);
    if (mq && sizeMode === 'qty') $('rp-pct').value = Math.min(100, Math.round(qty / mq * 100));

    $('rp-buy-sub').textContent  = otype === 'market' ? 'market' : px(entry);
    $('rp-sell-sub').textContent = otype === 'market' ? 'market' : px(entry);

    $('rp-sizing').textContent = qty
        ? 'Size ' + fmt(qty, 6) + ' ' + baseAsset() + ' at ' + S.lev + 'x — ' +
          money(margin) + ' margin' + (S.mode === 'replay' ? '.' : ', trading live.')
        : 'Set a stop, a quantity or drag the size slider.';
    syncOrderButtons();
}

function blankReadout() {
    ['rp-rd-value', 'rp-rd-cost', 'rp-rd-risk', 'rp-rd-rr', 'rp-rd-liq']
        .forEach(id => { $(id).textContent = '—'; $(id).className = ''; });
}

/* An estimate, deliberately labelled as one: it is the price at which the
   isolated margin for this position would be gone, ignoring the maintenance
   margin tier an exchange would apply. */
function liqPrice(side, entry) {
    if (!entry || !S.lev || S.lev <= 1) return null;
    return side === 'long' ? entry * (1 - 1 / S.lev) : entry * (1 + 1 / S.lev);
}

function placeOrder(side) {
    const entry = ticketPrice();
    if (entry === null) return;
    const qty = ticketQty(side, entry);
    if (!qty) { status('Set a stop, a quantity or drag the size slider.', 'error'); return; }
    const lv = ticketLevels(side, entry);
    hideStatus();

    if (otype === 'market') { openPosition(side, currentPrice(), qty, lv.sl, lv.tp); return; }

    const mark = currentPrice();
    S.orders.push({
        id: ++S.orderSeq, type: otype, side, price: entry, qty,
        sl: lv.sl, tp: lv.tp,
        below: entry < mark,          // which way price must travel to fill
        placedAt: nowBarTime()
    });
    drawPositionLines();
    renderOrders(); renderAll();
}

function openPosition(side, price, qty, sl, tp) {
    if (S.position) { status('Close the open position first.', 'error'); return; }
    if (price === null) return;
    const notional = qty * price;
    const fee = feeOn(notional);
    S.balance -= fee;
    S.position = {
        side, qty, entry: price, sl: sl ?? null, tp: tp ?? null,
        lev: S.lev, margin: notional / S.lev,
        liq: liqPrice(side, price),
        riskAmt: sl ? Math.abs(price - sl) * qty : 0,
        feePaid: fee,
        openedAt: nowBarTime()
    };
    drawPositionLines();
    renderAll();
}

function closePosition(price, reason) {
    const p = S.position;
    if (!p) return;
    const gross = (p.side === 'long' ? price - p.entry : p.entry - price) * p.qty;
    const fee = feeOn(p.qty * price);
    S.balance += gross - fee;
    // The entry fee was taken out of the balance when the position opened, so
    // the TRADE's P&L has to carry it too — otherwise the sum of the trade log
    // does not reconcile with the account, and the exported equity curve ends
    // somewhere the balance never was.
    const pnl = gross - fee - p.feePaid;
    S.trades.push({
        id: ++S.tradeSeq,
        side: p.side, qty: p.qty, entry: p.entry, exit: price,
        pnl, fees: p.feePaid + fee,
        r: p.riskAmt ? pnl / p.riskAmt : 0, reason,
        openedAt: p.openedAt, closedAt: nowBarTime(),
        note: '', tags: []
    });
    S.position = null;
    clearPositionLines();
    renderAll();
}

/* Working orders are checked before the open position: an entry that fills
   inside the same minute a stop would hit must exist first, or the trade
   would silently vanish. Within a single minute the stop is always taken
   ahead of the target — pessimistic, so results are never flattered. */
function applyFills(b) {
    for (let i = S.orders.length - 1; i >= 0; i--) {
        const o = S.orders[i];
        if (S.position) continue;
        const hit = o.below ? b.l <= o.price : b.h >= o.price;
        if (!hit) continue;
        S.orders.splice(i, 1);
        openPosition(o.side, o.price, o.qty, o.sl, o.tp);
    }
    const p = S.position;
    if (!p) return;
    if (p.side === 'long') {
        if (p.liq !== null && b.l <= p.liq) return closePosition(p.liq, 'liquidation');
        if (p.sl !== null && b.l <= p.sl) return closePosition(p.sl, 'stop');
        if (p.tp !== null && b.h >= p.tp) return closePosition(p.tp, 'target');
    } else {
        if (p.liq !== null && b.h >= p.liq) return closePosition(p.liq, 'liquidation');
        if (p.sl !== null && b.h >= p.sl) return closePosition(p.sl, 'stop');
        if (p.tp !== null && b.l <= p.tp) return closePosition(p.tp, 'target');
    }
}

function openPL() {
    const p = S.position, price = currentPrice();
    if (!p || price === null) return 0;
    return (p.side === 'long' ? price - p.entry : p.entry - price) * p.qty;
}

function resetAccount(full) {
    S.balance = S.startBalance;
    S.position = null; S.orders = []; S.trades = [];
    S.peakEquity = S.startBalance; S.maxDD = 0; S.maxDDAbs = 0;
    clearPositionLines();
    if (full) { renderAll(); updateEquity(); }
}

/* The position drawing tool speaks to the ticket two ways. fromDrawing loads
   the levels into the panel so you can adjust them; submit sends the drawn
   setup as a real order. A setup drawn away from the current price rests as a
   working order at ITS OWN entry and fills when price gets there — it is not
   silently snapped onto the last candle, which would be a different trade
   from the one you drew. */
window.BTOrder = {
    submit(d) {
        const mark = currentPrice();
        if (mark === null) { status('No price on the chart yet.', 'error'); return; }
        if (S.position) { status('Close the open position first.', 'error'); return; }
        const risk = Math.abs(d.entry - d.stop);
        if (!risk) { status('Give the position a stop before trading it.', 'error'); return; }

        let qty;
        if (sizeMode === 'qty') {
            qty = parseFloat($('rp-qty').value);
        } else {
            const riskPct = Math.max(0.01, parseFloat($('rp-risk').value) || 1);
            qty = (S.balance * (riskPct / 100)) / risk;
        }
        qty = Math.min(qty || 0, maxQty(d.entry));
        if (!qty) { status('Sizing came out at zero — check the risk or quantity.', 'error'); return; }

        // Within half a basis point of the mark there is nothing to wait for.
        if (Math.abs(d.entry - mark) / mark < 0.00005) {
            openPosition(d.side, mark, qty, d.stop, d.target);
            status('Filled ' + d.side + ' ' + fmt(qty, 6) + ' ' + baseAsset() + ' at market.');
        } else {
            const below = d.entry < mark;
            S.orders.push({
                id: ++S.orderSeq,
                type: (d.side === 'long') === below ? 'limit' : 'stop',
                side: d.side, price: d.entry, qty, sl: d.stop, tp: d.target,
                below: below, placedAt: nowBarTime()
            });
            drawPositionLines(); renderAll();
            status('Working ' + d.side + ' order at ' + px(d.entry) +
                   ' — it fills when price trades there.');
        }
        setTimeout(hideStatus, 3200);
        showTab(S.position ? 'pos' : 'ord');
    },

    fromDrawing(d) {
        slMode = 'price';
        segSet('rp-slmode', 'sl', 'price');
        $('rp-stop').value = d.stop.toFixed(pdp());
        if (d.target !== null && d.target !== undefined) $('rp-target').value = d.target.toFixed(pdp());
        if (S.mode === 'replay' && Math.abs(d.entry - (currentPrice() || d.entry)) > 1e-9) {
            otype = 'limit';
            segSet('rp-otype', 'otype', 'limit');
            $('rp-price-row').hidden = false;
            $('rp-price').value = d.entry.toFixed(pdp());
        }
        updateTicket();
    }
};

// ================================================================== render

function renderAll() {
    renderPositions(); renderOrders(); renderHistory();
    renderMetrics(); renderCurve(); renderCalendar(); renderJournalList();
    updateTicket(); updateTabCounts();
}

function drawPositionLines() {
    clearPositionLines();
    const add = (price, color, style, title) => {
        try {
            lines.push(series.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, title }));
        } catch (e) {}
    };
    const p = S.position;
    if (p) {
        add(p.entry, '#f7a600', LightweightCharts.LineStyle.Solid, 'entry');
        if (p.sl !== null) add(p.sl, '#ef454a', LightweightCharts.LineStyle.Dashed, 'stop');
        if (p.tp !== null) add(p.tp, '#20b26c', LightweightCharts.LineStyle.Dashed, 'target');
        if (p.liq !== null) add(p.liq, '#8c9099', LightweightCharts.LineStyle.Dotted, 'liq.');
    }
    S.orders.forEach(o =>
        add(o.price, '#5aa9f0', LightweightCharts.LineStyle.Dotted,
            o.type + ' ' + (o.side === 'long' ? 'buy' : 'sell')));
}
function clearPositionLines() {
    lines.forEach(l => { try { series.removePriceLine(l); } catch (e) {} });
    lines = [];
}

let inEquity = false;
function updateEquity() {
    if (inEquity) return;
    inEquity = true;
    try { equityPass(); } finally { inEquity = false; }
}
function equityPass() {
    const op = openPL(), eq = S.balance + op;
    $('rp-balance').textContent = money(S.balance);
    $('rp-equity').textContent  = money(eq);
    const el = $('rp-openpl');
    el.textContent = S.position ? signed(op) : '—';
    el.className   = S.position ? (op >= 0 ? 'val-pos' : 'val-neg') : '';
    S.peakEquity = Math.max(S.peakEquity, eq);
    if (S.peakEquity > 0) {
        S.maxDD = Math.max(S.maxDD, (S.peakEquity - eq) / S.peakEquity * 100);
        S.maxDDAbs = Math.max(S.maxDDAbs, S.peakEquity - eq);
    }
    if (S.position) renderPositions();
    updateTicket();
}

function renderTicker() {
    const t = S.tick;
    const el = $('rp-tk-price');
    if (S.mode === 'replay') {
        const b = S.working;
        $('rp-tk-pair').textContent = S.symbol;
        el.textContent = b ? px(b.close) : '—';
        el.className = b ? (b.close >= b.open ? 'val-pos' : 'val-neg') : '';
        const d = b ? b.close - b.open : 0;
        $('rp-tk-chg').textContent = b
            ? (d >= 0 ? '+' : '') + px(d) + '  (' + (b.open ? (d / b.open * 100).toFixed(2) : '0.00') + '%)'
            : '—';
        $('rp-tk-chg').className = 'rp-tk-chg ' + (d >= 0 ? 'val-pos' : 'val-neg');
        $('rp-tk-chgabs').textContent = 'replay';
        $('rp-tk-high').textContent = b ? px(b.high) : '—';
        $('rp-tk-low').textContent  = b ? px(b.low) : '—';
        $('rp-tk-vol').textContent  = b && b.volume ? compact(b.volume) : '—';
        $('rp-tk-turn').textContent = '—';
        $('rp-tk-clock').textContent = b ? iso(b.time * 1000) : '—';
        return;
    }
    $('rp-tk-pair').textContent = S.symbol;
    if (!t) return;
    el.textContent = px(t.last);
    el.className = t.changePct >= 0 ? 'val-pos' : 'val-neg';
    $('rp-tk-chg').textContent = (t.changePct >= 0 ? '+' : '') + fmt(t.changePct, 2) + '%';
    $('rp-tk-chg').className = 'rp-tk-chg ' + (t.changePct >= 0 ? 'val-pos' : 'val-neg');
    $('rp-tk-chgabs').textContent = (t.change >= 0 ? '+' : '') + px(t.change);
    $('rp-tk-chgabs').className = t.change >= 0 ? 'val-pos' : 'val-neg';
    $('rp-tk-high').textContent = px(t.high);
    $('rp-tk-low').textContent  = px(t.low);
    $('rp-tk-vol').textContent  = compact(t.vol) + ' ' + baseAsset();
    $('rp-tk-turn').textContent = compact(t.quoteVol) + ' USDT';
}

function syncTicker() {
    const replay = S.mode === 'replay';
    $('rp-tk-clockcell').hidden = !replay;
    $('rp-tk-venue').textContent = replay ? 'Replay · historical' : 'Binance · Spot';
    renderTicker();
    if (replay) $('rp-clock').textContent = S.working ? iso(S.working.time * 1000) : '—';
}

function renderPositions() {
    const body = $('rp-pos-body'), p = S.position;
    if (!p) {
        body.innerHTML = '<tr><td colspan="11" class="rp-empty">Flat — no open position.</td></tr>';
        return;
    }
    const mark = currentPrice();
    const op = openPL();
    const roi = p.margin ? op / p.margin * 100 : 0;
    body.innerHTML =
        '<tr>' +
          '<td class="sym">' + S.symbol + '</td>' +
          '<td><span class="rp-tag ' + p.side + '">' + p.side.toUpperCase() + ' ' + p.lev + 'x</span></td>' +
          '<td class="num">' + fmt(p.qty, 6) + '</td>' +
          '<td class="num">' + px(p.entry) + '</td>' +
          '<td class="num">' + (mark === null ? '—' : px(mark)) + '</td>' +
          '<td class="num">' + (p.liq === null ? '—' : px(p.liq)) + '</td>' +
          '<td class="num">' + (p.sl === null ? '—' : px(p.sl)) + '</td>' +
          '<td class="num">' + (p.tp === null ? '—' : px(p.tp)) + '</td>' +
          '<td class="num ' + (op >= 0 ? 'val-pos' : 'val-neg') + '">' + signed(op) + '</td>' +
          '<td class="num ' + (roi >= 0 ? 'val-pos' : 'val-neg') + '">' +
            (roi >= 0 ? '+' : '') + fmt(roi, 2) + '%</td>' +
          '<td><button class="rp-x" id="rp-close-row">Close</button></td>' +
        '</tr>';
    const btn = $('rp-close-row');
    if (btn) btn.addEventListener('click', () => {
        const pr = currentPrice();
        if (S.position && pr !== null) closePosition(pr, 'manual');
    });
}

function renderOrders() {
    const body = $('rp-ord-body');
    if (!S.orders.length) {
        body.innerHTML = '<tr><td colspan="8" class="rp-empty">No working orders.</td></tr>';
        return;
    }
    body.innerHTML = S.orders.map(o =>
        '<tr>' +
          '<td class="sym">' + o.type + '</td>' +
          '<td><span class="rp-tag ' + o.side + '">' + o.side.toUpperCase() + '</span></td>' +
          '<td class="num">' + px(o.price) + '</td>' +
          '<td class="num">' + fmt(o.qty, 6) + '</td>' +
          '<td class="num">' + (o.sl === null ? '—' : px(o.sl)) + '</td>' +
          '<td class="num">' + (o.tp === null ? '—' : px(o.tp)) + '</td>' +
          '<td>' + (o.placedAt ? iso(o.placedAt * 1000) : '—') + '</td>' +
          '<td><button class="rp-x" data-cancel="' + o.id + '">Cancel</button></td>' +
        '</tr>').join('');
    body.querySelectorAll('[data-cancel]').forEach(b =>
        b.addEventListener('click', () => {
            S.orders = S.orders.filter(o => o.id !== +b.dataset.cancel);
            drawPositionLines(); renderOrders(); updateTabCounts();
        }));
}

function renderHistory() {
    const body = $('rp-hist-body');
    if (!S.trades.length) {
        body.innerHTML = '<tr><td colspan="11" class="rp-empty">No trades yet.</td></tr>';
        return;
    }
    body.innerHTML = S.trades.map((t, i) =>
        '<tr>' +
          '<td>' + (i + 1) + '</td>' +
          '<td>' + (t.openedAt ? iso(t.openedAt * 1000) : '—') + '</td>' +
          '<td>' + (t.closedAt ? iso(t.closedAt * 1000) : '—') + '</td>' +
          '<td><span class="rp-tag ' + t.side + '">' + t.side.toUpperCase() + '</span></td>' +
          '<td class="num">' + fmt(t.qty, 6) + '</td>' +
          '<td class="num">' + px(t.entry) + '</td>' +
          '<td class="num">' + px(t.exit) + '</td>' +
          '<td>' + t.reason + '</td>' +
          '<td class="num ' + (t.r >= 0 ? 'val-pos' : 'val-neg') + '">' +
            (t.r >= 0 ? '+' : '') + fmt(t.r, 2) + 'R</td>' +
          '<td class="num ' + (t.pnl >= 0 ? 'val-pos' : 'val-neg') + '">' + signed(t.pnl) + '</td>' +
          '<td>' + (t.note ? t.note.slice(0, 28).replace(/</g, '&lt;') : '') + '</td>' +
        '</tr>').reverse().join('');
}

function stats() {
    const t = S.trades;
    const wins = t.filter(x => x.pnl > 0), losses = t.filter(x => x.pnl < 0);
    const gross = wins.reduce((a, x) => a + x.pnl, 0);
    const loss  = Math.abs(losses.reduce((a, x) => a + x.pnl, 0));
    const net   = t.reduce((a, x) => a + x.pnl, 0);
    const fees  = t.reduce((a, x) => a + (x.fees || 0), 0);
    let bestStreak = 0, worstStreak = 0, cw = 0, cl = 0;
    for (const x of t) {
        if (x.pnl > 0) { cw++; cl = 0; } else if (x.pnl < 0) { cl++; cw = 0; }
        bestStreak = Math.max(bestStreak, cw);
        worstStreak = Math.max(worstStreak, cl);
    }
    const holds = t.filter(x => x.openedAt && x.closedAt).map(x => x.closedAt - x.openedAt);
    return {
        n: t.length,
        winRate: t.length ? wins.length / t.length * 100 : 0,
        net, gross, loss, fees,
        pf: loss ? gross / loss : (gross ? Infinity : 0),
        avgWin: wins.length ? gross / wins.length : 0,
        avgLoss: losses.length ? loss / losses.length : 0,
        // With no winners there is no best trade — reporting the least-bad
        // loss as the "best" made a losing session read as if it had one.
        bestWin: wins.length ? Math.max.apply(null, wins.map(x => x.pnl)) : 0,
        worstLoss: losses.length ? Math.min.apply(null, losses.map(x => x.pnl)) : 0,
        wins: wins.length, losses: losses.length,
        avgR: t.length ? t.reduce((a, x) => a + x.r, 0) / t.length : 0,
        expectancy: t.length ? net / t.length : 0,
        bestStreak, worstStreak,
        avgHold: holds.length ? holds.reduce((a, b) => a + b, 0) / holds.length : 0
    };
}

function renderMetrics() {
    const s = stats();
    const cell = (label, value, cls) =>
        '<div><span>' + label + '</span><b class="' + (cls || '') + '">' + value + '</b></div>';
    const h = m => {
        if (!m) return '—';
        const d = Math.floor(m / 86400), hh = Math.floor(m % 86400 / 3600), mm = Math.floor(m % 3600 / 60);
        return (d ? d + 'd ' : '') + (hh ? hh + 'h ' : '') + (d ? '' : mm + 'm');
    };
    $('rp-metrics').innerHTML =
        cell('Trades', s.n) +
        cell('Win rate', s.n ? fmt(s.winRate, 1) + '%' : '—', s.winRate >= 50 ? 'val-pos' : '') +
        cell('Net P&amp;L', s.n ? signed(s.net) : '—', s.net >= 0 ? 'val-pos' : 'val-neg') +
        cell('Return', s.n ? (s.net >= 0 ? '+' : '') + fmt(s.net / S.startBalance * 100, 2) + '%' : '—',
             s.net >= 0 ? 'val-pos' : 'val-neg') +
        cell('Profit factor', s.n ? (s.pf === Infinity ? '∞' : fmt(s.pf, 2)) : '—') +
        cell('Expectancy', s.n ? signed(s.expectancy) : '—', s.expectancy >= 0 ? 'val-pos' : 'val-neg') +
        cell('Avg R', s.n ? (s.avgR >= 0 ? '+' : '') + fmt(s.avgR, 2) + 'R' : '—',
             s.avgR >= 0 ? 'val-pos' : 'val-neg') +
        cell('Max drawdown', s.n ? fmt(S.maxDD, 1) + '%' : '—', 'val-neg') +
        cell('Max DD ($)', s.n ? money(S.maxDDAbs) : '—', 'val-neg') +
        cell('Gross profit', s.n ? money(s.gross) : '—', 'val-pos') +
        cell('Gross loss', s.n ? money(s.loss) : '—', 'val-neg') +
        cell('Avg win', s.n ? money(s.avgWin) : '—', 'val-pos') +
        cell('Avg loss', s.n ? money(s.avgLoss) : '—', 'val-neg') +
        cell('Best trade', s.n ? signed(s.bestWin) : '—', 'val-pos') +
        cell('Worst trade', s.n ? signed(s.worstLoss) : '—', 'val-neg') +
        cell('Win streak', s.n ? s.bestStreak : '—') +
        cell('Loss streak', s.n ? s.worstStreak : '—') +
        cell('Avg hold', s.n ? h(s.avgHold) : '—') +
        cell('Fees paid', s.n ? money(s.fees) : '—') +
        cell('Balance', money(S.balance));
}

function renderCurve() {
    const cvs = $('rp-equity-curve');
    if (!cvs) return;
    const r = cvs.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = window.devicePixelRatio || 1;
    cvs.width = Math.round(r.width * dpr);
    cvs.height = Math.round(r.height * dpr);
    const g = cvs.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, r.width, r.height);

    const pts = [S.startBalance];
    let run = S.startBalance;
    for (const t of S.trades) { run += t.pnl; pts.push(run); }
    if (pts.length < 2) {
        g.fillStyle = '#61686f';
        g.font = '12px "IBM Plex Sans", sans-serif';
        g.fillText('Take a trade to draw the curve.', 12, r.height / 2);
        return;
    }
    const lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts);
    const pad = 10, span = (hi - lo) || 1;
    const X = i => pad + i / (pts.length - 1) * (r.width - pad * 2);
    const Y = v => r.height - pad - (v - lo) / span * (r.height - pad * 2);
    const up = pts[pts.length - 1] >= S.startBalance;

    // baseline at the starting balance — the only line that matters
    g.strokeStyle = 'rgba(255,255,255,.12)';
    g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(pad, Y(S.startBalance)); g.lineTo(r.width - pad, Y(S.startBalance)); g.stroke();
    g.setLineDash([]);

    g.beginPath();
    pts.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)));
    g.lineTo(X(pts.length - 1), r.height - pad);
    g.lineTo(X(0), r.height - pad);
    g.closePath();
    g.fillStyle = up ? 'rgba(32,178,108,.16)' : 'rgba(239,69,74,.16)';
    g.fill();

    g.beginPath();
    pts.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)));
    g.strokeStyle = up ? '#20b26c' : '#ef454a';
    g.lineWidth = 1.8;
    g.stroke();
}

// -------------------------------------------------------------- calendar

let calMonth = null;    // Date pinned to the first of the shown month
let calPinned = false;  // true once the trader has paged it themselves

function tradesByDay() {
    const map = {};
    for (const t of S.trades) {
        if (!t.closedAt) continue;
        const k = dayKey(t.closedAt * 1000);
        if (!map[k]) map[k] = { pnl: 0, n: 0, wins: 0 };
        map[k].pnl += t.pnl; map[k].n++;
        if (t.pnl > 0) map[k].wins++;
    }
    return map;
}

function renderCalendar() {
    const box = $('rp-cal');
    if (!box) return;
    const map = tradesByDay();
    // Until the trader pages it themselves, the calendar follows the work:
    // the month of the most recent trade, or of the replay cursor. Anchoring
    // once on load left a 2024 replay showing an empty 2026 grid.
    if (!calPinned || !calMonth) {
        const days = Object.keys(map).sort();
        const anchor = days.length ? new Date(days[days.length - 1] + 'T00:00:00Z')
                                   : new Date(S.working ? S.working.time * 1000 : Date.now());
        calMonth = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
    }
    const y = calMonth.getUTCFullYear(), m = calMonth.getUTCMonth();
    $('rp-cal-title').textContent =
        calMonth.toLocaleString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

    const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    let html = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        .map(d => '<div class="rp-cal-dow">' + d + '</div>').join('');
    for (let i = 0; i < first; i++) html += '<div class="rp-cal-day blank"></div>';

    let monthPnl = 0, monthN = 0;
    for (let d = 1; d <= days; d++) {
        const k = new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
        const e = map[k];
        if (e) { monthPnl += e.pnl; monthN += e.n; }
        const cls = !e ? '' : (e.pnl >= 0 ? ' win' : ' loss');
        html += '<div class="rp-cal-day' + cls + '">' +
                  '<em>' + d + '</em>' +
                  (e ? '<b class="' + (e.pnl >= 0 ? 'val-pos' : 'val-neg') + '">' + signed(e.pnl) + '</b>' +
                       '<small>' + e.n + ' trade' + (e.n > 1 ? 's' : '') + ' · ' +
                       Math.round(e.wins / e.n * 100) + '% W</small>' : '') +
                '</div>';
    }
    box.innerHTML = html;
    $('rp-cal-sum').innerHTML = monthN
        ? monthN + ' trades · <span class="' + (monthPnl >= 0 ? 'val-pos' : 'val-neg') + '">' +
          signed(monthPnl) + '</span>'
        : 'No trades this month';
}

// --------------------------------------------------------------- journal

const TAGS = ['A+ setup', 'Followed plan', 'Broke rules', 'Early entry', 'Late entry',
              'Moved stop', 'Revenge trade', 'Good exit', 'Cut too soon', 'News'];
let jrSelected = null;

function renderJournalList() {
    const box = $('rp-jr-trades');
    if (!box) return;
    if (!S.trades.length) {
        box.innerHTML = '<div class="rp-empty">Trades appear here as you take them — click one to annotate it.</div>';
        return;
    }
    box.innerHTML = S.trades.slice().reverse().map(t =>
        '<div class="rp-jr-row' + (jrSelected === t.id ? ' on' : '') + '" data-tr="' + t.id + '">' +
          '<span class="rp-tag ' + t.side + '">' + (t.side === 'long' ? 'L' : 'S') + '</span>' +
          '<span class="' + (t.pnl >= 0 ? 'val-pos' : 'val-neg') + '">' + signed(t.pnl) + '</span>' +
          '<span class="grow">' + (t.note ? t.note.slice(0, 40).replace(/</g, '&lt;')
              : (t.closedAt ? iso(t.closedAt * 1000) : '')) + '</span>' +
        '</div>').join('');
    box.querySelectorAll('[data-tr]').forEach(row =>
        row.addEventListener('click', () => selectJournal(+row.dataset.tr)));
}

function renderTagBar() {
    const box = $('rp-jr-tags');
    const t = jrSelected ? S.trades.find(x => x.id === jrSelected) : null;
    box.innerHTML = TAGS.map(tag =>
        '<button data-tag="' + tag + '"' +
        (t && t.tags && t.tags.indexOf(tag) >= 0 ? ' class="on"' : '') + '>' + tag + '</button>').join('');
    box.querySelectorAll('[data-tag]').forEach(b =>
        b.addEventListener('click', () => {
            if (!jrSelected) return;
            const tr = S.trades.find(x => x.id === jrSelected);
            if (!tr) return;
            tr.tags = tr.tags || [];
            const i = tr.tags.indexOf(b.dataset.tag);
            if (i >= 0) tr.tags.splice(i, 1); else tr.tags.push(b.dataset.tag);
            b.classList.toggle('on');
            saveJournal();
        }));
}

function selectJournal(id) {
    jrSelected = id;
    const t = S.trades.find(x => x.id === id);
    $('rp-jr-text').value = t ? (t.note || '') : '';
    $('rp-jr-text').placeholder = t
        ? 'Notes on trade #' + id + ' — what was the setup, what did you see, what would you change?'
        : 'Session notes…';
    renderJournalList(); renderTagBar();
}

function saveJournal() {
    try {
        localStorage.setItem('bt.replay.journal.' + S.symbol, JSON.stringify({
            session: jrSelected ? undefined : $('rp-jr-text').value,
            notes: S.trades.map(t => ({ id: t.id, note: t.note, tags: t.tags }))
        }));
    } catch (e) {}
    const flag = $('rp-jr-saved');
    flag.textContent = 'saved';
    clearTimeout(saveJournal._t);
    saveJournal._t = setTimeout(() => { flag.textContent = ''; }, 1400);
}
function restoreJournal() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem('bt.replay.journal.' + S.symbol) || 'null'); } catch (e) {}
    if (d && d.session && !jrSelected) $('rp-jr-text').value = d.session;
    renderTagBar();
}

function showTab(name) {
    const tab = document.querySelector('.rp-tab[data-tab="' + name + '"]');
    if (tab) tab.click();
}

function updateTabCounts() {
    const set = (id, n) => { const b = $(id); b.textContent = n; b.hidden = !n; };
    set('tabn-pos', S.position ? 1 : 0);
    set('tabn-ord', S.orders.length);
    set('tabn-hist', S.trades.length);
}

function syncOrderButtons() {
    const live = currentPrice() !== null;
    $('rp-buy').disabled   = !live || !!S.position;
    $('rp-sell').disabled  = !live || !!S.position;
    $('rp-close').disabled = !S.position;
}
function syncTransport() {
    $('rp-playpause').innerHTML = S.playing
        ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
}

// The overlay bar is only a bar when it has something in it; left always-on
// it showed as a small black tab floating over the candles.
function syncHud() {
    const cut  = !$('rp-cutbar').hidden;
    const exit = !$('rp-exit-replay').hidden;
    $('rp-hud').hidden = !(cut || exit);
}

function updateModeUI() {
    const replay = S.mode === 'replay';
    document.body.classList.toggle('is-replay', replay);
    $('rp-transport').hidden = !replay;
    if (replay) $('rp-cutbar').hidden = true;   // opened from the Replay button
    $('rp-replay-open').classList.toggle('on', replay);
    $('rp-exit-replay').hidden = !replay;
    $('rp-mode').textContent = replay ? 'REPLAY' : 'BROWSE';
    $('rp-mode').className = 'rp-mode ' + (replay ? 'on' : '');
    syncHud();
    syncOrderButtons(); syncTransport();
    if (!replay) $('rp-clock').textContent = '—';
}

// -------------------------------------------------- indicator picker modal

// Searchable, because a list you have to scan is a list you stop using.
const CATALOG = [
    { type: 'sma',  name: 'Simple Moving Average', short: 'SMA',
      desc: 'Mean close over N bars.', tags: 'sma moving average trend mean' },
    { type: 'ema',  name: 'Exponential Moving Average', short: 'EMA',
      desc: 'Weights recent bars more heavily.', tags: 'ema exponential moving average trend' },
    { type: 'vwma', name: 'Volume Weighted MA', short: 'VWMA',
      desc: 'Moving average weighted by traded volume.', tags: 'vwma volume weighted moving average' },
    { type: 'vwap', name: 'VWAP (session)', short: 'VWAP',
      desc: 'Volume-weighted average price, reset each UTC day.',
      tags: 'vwap volume weighted average price session anchor' },
    { type: 'bb',   name: 'Bollinger Bands', short: 'BB',
      desc: 'Moving average with standard-deviation envelopes.',
      tags: 'bollinger bands volatility deviation envelope' },
    { type: 'rsi',  name: 'Relative Strength Index', short: 'RSI',
      desc: 'Momentum oscillator, 0 to 100. Own pane.',
      tags: 'rsi relative strength momentum oscillator overbought oversold' },
    { type: 'macd', name: 'MACD', short: 'MACD',
      desc: 'Fast/slow EMA spread with a signal line. Own pane.',
      tags: 'macd convergence divergence momentum signal' },
    { type: 'stoch', name: 'Stochastic', short: 'STOCH',
      desc: 'Close within the N-bar range, 0 to 100. Own pane.',
      tags: 'stochastic oscillator k d overbought oversold' },
    { type: 'atr',  name: 'Average True Range', short: 'ATR',
      desc: 'Volatility in price terms. Useful for stop sizing. Own pane.',
      tags: 'atr average true range volatility stop' }
];

const TEMPLATES = {
    sma: `// Simple moving average
const period = 50;
const out = [];
let sum = 0;
for (let i = 0; i < bars.length; i++) {
  sum += bars[i].close;
  if (i >= period) sum -= bars[i - period].close;
  out.push(i >= period - 1 ? sum / period : null);
}
return out;`,
    cross: `// Fast/slow MA cross: 1 long, -1 short, 0 flat.
// Return a signal series and read it straight off the chart.
const fast = 10, slow = 30;
const ma = (n, i) => {
  if (i < n - 1) return null;
  let s = 0; for (let k = i - n + 1; k <= i; k++) s += bars[k].close;
  return s / n;
};
const out = [];
for (let i = 0; i < bars.length; i++) {
  const f = ma(fast, i), s = ma(slow, i);
  out.push(f === null || s === null ? null : (f > s ? 1 : f < s ? -1 : 0));
}
return out;`,
    range: `// Midpoint of the rolling N-bar high/low channel
const period = 20;
const out = [];
for (let i = 0; i < bars.length; i++) {
  if (i < period - 1) { out.push(null); continue; }
  let hi = -Infinity, lo = Infinity;
  for (let k = i - period + 1; k <= i; k++) {
    if (bars[k].high > hi) hi = bars[k].high;
    if (bars[k].low  < lo) lo = bars[k].low;
  }
  out.push((hi + lo) / 2);
}
return out;`,
    mom: `// Momentum: close relative to N bars ago, in percent
const period = 14;
const out = [];
for (let i = 0; i < bars.length; i++) {
  out.push(i < period ? null
    : (bars[i].close - bars[i - period].close) / bars[i - period].close * 100);
}
return out;`
};

function renderCatalog(filter) {
    const q = (filter || '').trim().toLowerCase();
    const hits = CATALOG.filter(c => !q ||
        (c.name + ' ' + c.short + ' ' + c.tags).toLowerCase().includes(q));
    const box = $('rp-ind-catalog');
    if (!hits.length) {
        box.innerHTML = '<div class="rp-empty">Nothing matches &ldquo;' +
            q.replace(/</g, '&lt;') + '&rdquo;.</div>';
        return;
    }
    box.innerHTML = hits.map(c =>
        '<button class="rp-cat-item" data-type="' + c.type + '">' +
          '<span class="rp-cat-short">' + c.short + '</span>' +
          '<span class="rp-cat-body">' +
            '<span class="rp-cat-name">' + c.name + '</span>' +
            '<span class="rp-cat-desc">' + c.desc + '</span>' +
          '</span>' +
          '<i class="fa-solid fa-plus"></i>' +
        '</button>').join('');
    box.querySelectorAll('.rp-cat-item').forEach(b =>
        b.addEventListener('click', () => { addIndicator(b.dataset.type, {}); updateIndCount(); }));
}

function updateIndCount() {
    const n = activeInd.length;
    const badge = $('rp-ind-count');
    badge.textContent = n;
    badge.hidden = n === 0;
    $('rp-active-count').textContent = n;
}

function openIndModal() {
    $('rp-modal').hidden = false;
    renderCatalog($('rp-ind-search').value);
    renderIndicatorList();
    updateIndCount();
    setTimeout(() => $('rp-ind-search').focus(), 30);
}
function closeIndModal() { $('rp-modal').hidden = true; }

// ================================================ export & saved sessions

/* The report dashboard already has a documented metrics contract (see the
   header of report.js). Exporting a replay session in exactly that shape
   means a session measured here drops straight into the same dashboard the
   Backtest Machine feeds — one format, two producers. */
function buildReport() {
    const st = stats();
    const done = S.trades.filter(t => t.closedAt);
    const byMonth = {};
    let run = S.startBalance, peak = S.startBalance;
    const equity = [], monthly = [], drawdown = [];

    for (const t of done) {
        const key = new Date(t.closedAt * 1000).toISOString().slice(0, 7);
        if (!byMonth[key]) byMonth[key] = { start: run, pnl: 0, dd: 0 };
        run += t.pnl;
        byMonth[key].pnl += t.pnl;
        peak = Math.max(peak, run);
        byMonth[key].dd = Math.min(byMonth[key].dd, (run - peak) / peak * 100);
    }
    Object.keys(byMonth).sort().forEach(k => {
        const m = byMonth[k];
        equity.push({ t: k, v: +(m.start + m.pnl).toFixed(2) });
        monthly.push({ t: k, v: +(m.start ? m.pnl / m.start * 100 : 0).toFixed(2) });
        drawdown.push({ t: k, v: +m.dd.toFixed(2) });
    });

    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const wd = {};
    done.forEach(t => {
        const d = DOW[new Date(t.closedAt * 1000).getUTCDay()];
        if (!wd[d]) wd[d] = { n: 0, w: 0 };
        wd[d].n++; if (t.pnl > 0) wd[d].w++;
    });
    const weekday = DOW.filter(d => wd[d])
        .map(d => ({ t: d, v: +(wd[d].w / wd[d].n * 100).toFixed(1) }));

    const counts = {};
    done.forEach(t => {
        const r = t.r;
        const k = r < -2 ? '<-2R' : r < -1.5 ? '-2R' : r < -0.5 ? '-1R'
                : r < 0.5 ? '0R' : r < 1.5 ? '+1R' : r < 2.5 ? '+2R' : '>+3R';
        counts[k] = (counts[k] || 0) + 1;
    });
    const buckets = ['<-2R', '-2R', '-1R', '0R', '+1R', '+2R', '>+3R'];

    const dates = done.map(t => t.closedAt * 1000);
    return {
        source: 'BarTest Replay', generatedAt: new Date().toISOString(),
        symbol: S.symbol, timeframe: TF_LABEL[S.tfMin], venue: 'Binance',
        currency: 'USD',
        startBalance: S.startBalance,
        endBalance: +S.balance.toFixed(2),
        netReturnPct: +((S.balance - S.startBalance) / S.startBalance * 100).toFixed(2),
        winRatePct: +st.winRate.toFixed(1),
        maxDrawdownPct: -+S.maxDD.toFixed(2),
        profitFactor: st.pf === Infinity ? null : +st.pf.toFixed(2),
        sharpe: sharpeOf(done),
        totalTrades: st.n,
        avgWin: +st.avgWin.toFixed(2),
        avgLoss: -+st.avgLoss.toFixed(2),
        longestLossStreak: st.worstStreak,
        feesPaid: +st.fees.toFixed(2),
        expectancy: +st.expectancy.toFixed(2),
        periodStart: dates.length ? new Date(Math.min.apply(null, dates)).toISOString().slice(0, 10) : null,
        periodEnd:   dates.length ? new Date(Math.max.apply(null, dates)).toISOString().slice(0, 10) : null,
        equity: equity, monthly: monthly, drawdown: drawdown, weekday: weekday,
        symbols: st.n ? [{ t: S.symbol, v: st.n }] : [],
        rBuckets: buckets.filter(b => counts[b]).map(b => ({ t: b, v: counts[b] })),
        trades: done.map(t => ({
            symbol: S.symbol,
            side: t.side === 'long' ? 'Long' : 'Short',
            entry: new Date(t.openedAt * 1000).toISOString().slice(0, 10),
            exit:  new Date(t.closedAt * 1000).toISOString().slice(0, 10),
            r: +t.r.toFixed(2), pnl: +t.pnl.toFixed(2)
        }))
    };
}

/* Trade-based Sharpe: the mean per-trade return over its standard deviation.
   Deliberately NOT scaled by the square root of the trade count — that turns
   a handful of trades into a huge number and reads as skill when it is only
   a small sample. Under five closed trades there is no sample at all, so the
   ratio is reported as absent rather than invented. */
function sharpeOf(trades) {
    if (trades.length < 5) return null;
    const r = trades.map(t => t.pnl / S.startBalance);
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    const sd = Math.sqrt(r.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (r.length - 1));
    return sd ? +(mean / sd).toFixed(2) : null;
}

function tradesCsv() {
    const head = ['#', 'symbol', 'timeframe', 'side', 'qty', 'entry', 'exit',
                  'opened_utc', 'closed_utc', 'exit_reason', 'r', 'pnl', 'fees', 'note', 'tags'];
    const esc = v => {
        const t = String(v === null || v === undefined ? '' : v);
        return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    const rows = S.trades.map((t, i) => [
        i + 1, S.symbol, TF_LABEL[S.tfMin], t.side, t.qty, t.entry, t.exit,
        t.openedAt ? iso(t.openedAt * 1000) : '', t.closedAt ? iso(t.closedAt * 1000) : '',
        t.reason, t.r.toFixed(3), t.pnl.toFixed(2), (t.fees || 0).toFixed(2),
        t.note || '', (t.tags || []).join('; ')
    ].map(esc).join(','));
    return head.join(',') + '\n' + rows.join('\n');
}

function download(name, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const stamp = () => S.symbol + '-' + TF_LABEL[S.tfMin] + '-' +
    new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '');

// ---- saved sessions ------------------------------------------------------
const SESS_KEY = 'bt.replay.sessions';
function listSessions() {
    try { return JSON.parse(localStorage.getItem(SESS_KEY) || '[]'); } catch (e) { return []; }
}
function saveSession() {
    const all = listSessions();
    all.unshift({
        id: Date.now(),
        label: S.symbol + ' ' + TF_LABEL[S.tfMin] + '  ' + S.trades.length + ' trades  ' +
               new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
        symbol: S.symbol, tfMin: S.tfMin, cursorMs: S.cursorMs, mode: S.mode,
        startBalance: S.startBalance, balance: S.balance,
        trades: S.trades, orders: S.orders, position: S.position,
        maxDD: S.maxDD, maxDDAbs: S.maxDDAbs, peakEquity: S.peakEquity,
        drawings: window.BTTools ? BTTools.serialize() : [],
        indicators: activeInd.map(a => ({ type: a.type, params: a.params, code: a.code, styles: a.styles }))
    });
    try { localStorage.setItem(SESS_KEY, JSON.stringify(all.slice(0, 20))); }
    catch (e) { status('Could not save — browser storage is full or blocked.', 'error'); return; }
    status('Session saved.');
    setTimeout(hideStatus, 2600);
}

async function loadSession(id) {
    const sess = listSessions().find(x => x.id === id);
    if (!sess) return;
    if (hasWorkToLose() && !await ask('Load this session?',
        'The current position, orders and trade log are replaced.', 'Load session')) return;
    S.trades = sess.trades || [];
    S.orders = sess.orders || [];
    S.position = sess.position || null;
    S.startBalance = sess.startBalance; S.balance = sess.balance;
    S.maxDD = sess.maxDD || 0; S.maxDDAbs = sess.maxDDAbs || 0;
    S.peakEquity = sess.peakEquity || sess.startBalance;
    S.tradeSeq = S.trades.reduce((a, t) => Math.max(a, t.id || 0), 0);
    if (window.BTTools) BTTools.load(sess.drawings || []);
    while (activeInd.length) removeIndicator(activeInd[0].id);
    (sess.indicators || []).forEach(i => {
        try { addIndicator(i.type, i.params, i.code, i.styles); } catch (e) {}
    });
    updateIndCount();
    drawPositionLines(); renderAll(); updateEquity();
    status('Loaded session.');
    setTimeout(hideStatus, 2600);
}

function openExportMenu(anchor) {
    document.querySelectorAll('.rp-pop').forEach(n => n.remove());
    const sessions = listSessions();
    const pop = document.createElement('div');
    pop.className = 'rp-pop rp-export-pop';
    pop.innerHTML =
        '<div class="rp-menu">' +
          '<button data-x="report"><i class="fa-solid fa-chart-line"></i>' +
            '<span>Export report (JSON)</span></button>' +
          '<button data-x="csv"><i class="fa-solid fa-table"></i>' +
            '<span>Export trade log (CSV)</span></button>' +
          '<button data-x="save"><i class="fa-solid fa-floppy-disk"></i>' +
            '<span>Save session</span></button>' +
        '</div>' +
        (sessions.length
            ? '<h5>Saved sessions</h5><div class="rp-menu">' + sessions.map(x =>
                '<button data-load="' + x.id + '"><i class="fa-solid fa-clock-rotate-left"></i>' +
                '<span>' + x.label + '</span></button>').join('') + '</div>'
            : '');
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8,
                                          r.right - pop.offsetWidth)) + 'px';
    pop.style.top = Math.max(8, r.top - pop.offsetHeight - 6) + 'px';

    const close = () => { pop.remove(); document.removeEventListener('mousedown', out); };
    function out(e) { if (!pop.contains(e.target) && e.target !== anchor) close(); }
    setTimeout(() => document.addEventListener('mousedown', out), 0);

    pop.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => {
        const x = b.dataset.x;
        if (!S.trades.length && x !== 'save') {
            status('No trades to export yet.', 'error');
            setTimeout(hideStatus, 2600); close(); return;
        }
        if (x === 'report') download('bartest-report-' + stamp() + '.json',
            JSON.stringify(buildReport(), null, 2), 'application/json');
        if (x === 'csv') download('bartest-trades-' + stamp() + '.csv',
            tradesCsv(), 'text/csv;charset=utf-8');
        if (x === 'save') saveSession();
        close();
    }));
    pop.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', () => {
        loadSession(+b.dataset.load); close();
    }));
}

// ------------------------------------------------------------- persistence

/* Drawings and the indicator set are saved per symbol as you work and
   restored on load, so a layout survives a reload without anyone having to
   remember to save it. localStorage is per-browser and can be unavailable
   (private windows, blocked site data), so every access is guarded and the
   terminal simply works without persistence when it fails. */

const storeKey = kind => 'bt.replay.' + kind + '.' + S.symbol;

function saveDrawings(list) {
    try { localStorage.setItem(storeKey('draw'), JSON.stringify(list || [])); } catch (e) {}
}
function saveIndicators() {
    try {
        localStorage.setItem(storeKey('ind'), JSON.stringify(
            activeInd.map(a => ({ type: a.type, params: a.params, code: a.code, styles: a.styles }))));
    } catch (e) {}
}
function restoreLayout() {
    let draw = null, ind = null;
    try { draw = JSON.parse(localStorage.getItem(storeKey('draw')) || 'null'); } catch (e) {}
    try { ind  = JSON.parse(localStorage.getItem(storeKey('ind'))  || 'null'); } catch (e) {}

    if (window.BTTools) BTTools.load(draw || []);

    while (activeInd.length) removeIndicator(activeInd[0].id);
    if (Array.isArray(ind)) {
        for (const i of ind) { try { addIndicator(i.type, i.params, i.code); } catch (e) {} }
    }
    updateIndCount();
}

// ----------------------------------------------------- appearance settings

/* Chart appearance is a global preference, not a per-symbol one, so it is
   stored on its own key and applied on load before any data arrives. The
   shape mirrors what TradingView exposes: series type, candle colours,
   borders, wicks, hollow bodies, background, grid, crosshair and scale. */

const THEME_DEFAULT = {
    // Bumped whenever a default that people can already have overridden
    // changes. A saved theme from before the bump keeps every choice the
    // trader actually made and takes the new canvas colours once.
    v: 2,
    type: 'candle',
    up: '#20b26c', down: '#ef454a',
    borders: true, wicks: true, hollow: false,
    bg: '#2d292e', text: '#a9a3ad',
    gridV: true, gridH: true, gridColor: '#3a353c',
    crosshair: true, magnet: false, log: false,
    precision: 'auto', seconds: false, watermark: true,
    balance: 10000, fee: 5
};
let theme = Object.assign({}, THEME_DEFAULT);

function loadTheme() {
    try {
        const raw = localStorage.getItem('bt.replay.theme');
        if (raw) {
            const saved = JSON.parse(raw);
            theme = Object.assign({}, THEME_DEFAULT, saved);
            if (saved.v !== THEME_DEFAULT.v) {
                theme.bg = THEME_DEFAULT.bg;
                theme.text = THEME_DEFAULT.text;
                theme.gridColor = THEME_DEFAULT.gridColor;
                theme.v = THEME_DEFAULT.v;
                saveTheme();
            }
        }
    } catch (e) {}
    S.startBalance = theme.balance;
    S.balance = theme.balance;
    S.peakEquity = theme.balance;
    S.feeBps = theme.fee;
}
function saveTheme() {
    try { localStorage.setItem('bt.replay.theme', JSON.stringify(theme)); } catch (e) {}
}

function applyTheme() {
    if (!chart || !series) return;
    chart.applyOptions({
        layout: { background: { color: theme.bg }, textColor: theme.text },
        grid: {
            vertLines: { visible: theme.gridV, color: theme.gridColor },
            horzLines: { visible: theme.gridH, color: theme.gridColor }
        },
        crosshair: {
            mode: theme.magnet ? LightweightCharts.CrosshairMode.Magnet
                               : LightweightCharts.CrosshairMode.Normal,
            vertLine: { visible: theme.crosshair, labelVisible: theme.crosshair },
            horzLine: { visible: theme.crosshair, labelVisible: theme.crosshair }
        },
        timeScale: { secondsVisible: theme.seconds },
        watermark: theme.watermark
            ? { visible: true, text: 'BarTest', color: 'rgba(255,255,255,.03)', fontSize: 64 }
            : { visible: false }
    });
    try {
        chart.priceScale('right').applyOptions({
            mode: theme.log ? LightweightCharts.PriceScaleMode.Logarithmic
                            : LightweightCharts.PriceScaleMode.Normal
        });
    } catch (e) {}
    if (theme.type === 'candle') series.applyOptions(seriesOptions());
    else if (theme.type === 'bar') series.applyOptions({ upColor: theme.up, downColor: theme.down });
    else series.applyOptions({ color: theme.up, lineColor: theme.up });

    document.documentElement.style.setProperty('--pos', theme.up);
    document.documentElement.style.setProperty('--neg', theme.down);
}

function syncThemeInputs() {
    $('set-type').value = theme.type;
    $('set-up').value = theme.up;
    $('set-down').value = theme.down;
    $('set-borders').checked = theme.borders;
    $('set-wicks').checked = theme.wicks;
    $('set-hollow').checked = theme.hollow;
    $('set-bg').value = theme.bg;
    $('set-text').value = theme.text;
    $('set-gridv').checked = theme.gridV;
    $('set-gridh').checked = theme.gridH;
    $('set-gridc').value = theme.gridColor;
    $('set-cross').checked = theme.crosshair;
    $('set-magnet').checked = theme.magnet;
    $('set-log').checked = theme.log;
    $('set-prec').value = String(theme.precision);
    $('set-seconds').checked = theme.seconds;
    $('set-mark').checked = theme.watermark;
    $('set-balance').value = theme.balance;
    $('set-fee').value = theme.fee;
}

function bindThemeInputs() {
    const colours = { 'set-up': 'up', 'set-down': 'down', 'set-bg': 'bg',
                      'set-text': 'text', 'set-gridc': 'gridColor' };
    Object.keys(colours).forEach(id => $(id).addEventListener('input', e => {
        theme[colours[id]] = e.target.value; applyTheme(); saveTheme();
    }));
    const checks = { 'set-borders': 'borders', 'set-wicks': 'wicks', 'set-hollow': 'hollow',
                     'set-gridv': 'gridV', 'set-gridh': 'gridH', 'set-cross': 'crosshair',
                     'set-magnet': 'magnet', 'set-log': 'log', 'set-seconds': 'seconds',
                     'set-mark': 'watermark' };
    Object.keys(checks).forEach(id => $(id).addEventListener('change', e => {
        theme[checks[id]] = e.target.checked; applyTheme(); saveTheme();
    }));
    $('set-type').addEventListener('change', e => {
        theme.type = e.target.value; saveTheme(); rebuildSeries(); applyTheme();
    });
    $('set-prec').addEventListener('change', e => {
        theme.precision = e.target.value; saveTheme(); paint(); renderAll();
    });
    $('set-balance').addEventListener('change', e => {
        theme.balance = Math.max(100, +e.target.value || 10000);
        S.startBalance = theme.balance;
        saveTheme();
        if (!S.trades.length && !S.position) { resetAccount(true); updateEquity(); }
    });
    $('set-fee').addEventListener('change', e => {
        theme.fee = Math.max(0, +e.target.value || 0);
        S.feeBps = theme.fee; saveTheme(); updateTicket();
    });
    $('rp-set-reset').addEventListener('click', () => {
        theme = Object.assign({}, THEME_DEFAULT);
        syncThemeInputs(); saveTheme(); rebuildSeries(); applyTheme();
    });
}

// ----------------------------------------------------------------- wiring

// Segmented controls: one active button per group.
function segSet(groupId, attr, value) {
    const g = $(groupId);
    if (!g) return;
    g.querySelectorAll('button').forEach(b =>
        b.classList.toggle('active', b.dataset[attr] === value));
}
function segBind(groupId, attr, cb) {
    const g = $(groupId);
    if (!g) return;
    g.querySelectorAll('button').forEach(b =>
        b.addEventListener('click', () => {
            segSet(groupId, attr, b.dataset[attr]);
            cb(b.dataset[attr]);
        }));
}

// The transport sits over the chart, so wherever it defaults to it will be in
// someone's way. Let it be dragged, and remember where it was put.
function makeDraggable(el, key) {
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    function place(x, y) {
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.bottom = 'auto';
        el.style.transform = 'none';
    }
    try {
        const saved = JSON.parse(localStorage.getItem(key) || 'null');
        if (saved && isFinite(saved.x) && isFinite(saved.y)) place(saved.x, saved.y);
    } catch (e) {}

    el.addEventListener('mousedown', e => {
        // Buttons and sliders inside keep working; only the bar itself drags.
        if (e.target.closest('button, input, select, a')) return;
        const r = el.getBoundingClientRect();
        const host = el.offsetParent.getBoundingClientRect();
        ox = r.left - host.left; oy = r.top - host.top;
        sx = e.clientX; sy = e.clientY;
        dragging = true;
        el.classList.add('dragging');
        e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
        if (!dragging) return;
        const host = el.offsetParent.getBoundingClientRect();
        place(Math.max(0, Math.min(host.width  - el.offsetWidth,  ox + e.clientX - sx)),
              Math.max(0, Math.min(host.height - el.offsetHeight, oy + e.clientY - sy)));
    });
    window.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        el.classList.remove('dragging');
        try {
            localStorage.setItem(key, JSON.stringify({
                x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0
            }));
        } catch (e) {}
    });
}

function initDock() {
    document.querySelectorAll('.rp-tab').forEach(tab =>
        tab.addEventListener('click', () => {
            document.querySelectorAll('.rp-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.rp-pane').forEach(p =>
                p.classList.toggle('active', p.dataset.pane === tab.dataset.tab));
            if (tab.dataset.tab === 'perf') renderCurve();
            if (tab.dataset.tab === 'cal') renderCalendar();
        }));

    $('rp-dock-toggle').addEventListener('click', () => {
        document.body.classList.toggle('dock-collapsed');
        try {
            localStorage.setItem('bt.replay.dockCollapsed',
                document.body.classList.contains('dock-collapsed') ? '1' : '0');
        } catch (e) {}
        setTimeout(renderCurve, 60);
    });
    try {
        if (localStorage.getItem('bt.replay.dockCollapsed') === '1')
            document.body.classList.add('dock-collapsed');
        const h = +localStorage.getItem('bt.replay.dockH');
        if (h > 60) document.documentElement.style.setProperty('--dock-h', h + 'px');
    } catch (e) {}

    // drag the grip to resize the dock against the chart
    const grip = $('rp-dock-grip');
    let dragging = false;
    grip.addEventListener('mousedown', e => { dragging = true; e.preventDefault(); });
    window.addEventListener('mousemove', e => {
        if (!dragging) return;
        const bottom = $('rp-main').getBoundingClientRect().bottom;
        const h = Math.max(60, Math.min(window.innerHeight * 0.6, bottom - e.clientY));
        document.documentElement.style.setProperty('--dock-h', h + 'px');
    });
    window.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        const h = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-h'));
        try { localStorage.setItem('bt.replay.dockH', String(Math.round(h))); } catch (e) {}
        renderCurve();
    });
}

function initTicket() {
    segBind('rp-otype', 'otype', v => {
        otype = v;
        $('rp-price-row').hidden = v === 'market';
        if (v !== 'market' && !$('rp-price').value) {
            const p = currentPrice();
            if (p !== null) $('rp-price').value = p.toFixed(pdp());
        }
        updateTicket();
    });
    segBind('rp-sizemode', 'size', v => {
        sizeMode = v;
        $('rp-risk-row').hidden = v !== 'risk';
        $('rp-qty-row').hidden = false;
        $('rp-qty').readOnly = v === 'risk';
        updateTicket();
    });
    segBind('rp-slmode', 'sl', v => { slMode = v; updateTicket(); });

    $('rp-price-last').addEventListener('click', () => {
        const p = currentPrice();
        if (p !== null) { $('rp-price').value = p.toFixed(pdp()); updateTicket(); }
    });
    $('rp-lev').addEventListener('change', e => { S.lev = +e.target.value || 1; updateTicket(); });
    $('rp-margin').addEventListener('change', e => { S.marginMode = e.target.value; updateTicket(); });

    ['rp-risk', 'rp-stop', 'rp-target', 'rp-price', 'rp-qty']
        .forEach(id => $(id).addEventListener('input', updateTicket));

    $('rp-pct').addEventListener('input', () => {
        const entry = ticketPrice();
        if (entry === null) return;
        if (sizeMode === 'qty') {
            const q = maxQty(entry) * (+$('rp-pct').value / 100);
            $('rp-qty').value = $('rp-qty-unit').value === 'quote'
                ? (q * entry).toFixed(2) : q.toFixed(6);
        }
        updateTicket();
    });
    $('rp-qty-unit').addEventListener('change', updateTicket);

    $('rp-buy').addEventListener('click',  () => placeOrder('long'));
    $('rp-sell').addEventListener('click', () => placeOrder('short'));
    $('rp-close').addEventListener('click', () => {
        const p = currentPrice();
        if (S.position && p !== null) closePosition(p, 'manual');
    });
    $('rp-qty').readOnly = true;
}

function init() {
    if (typeof LightweightCharts === 'undefined') {
        status('Charting library failed to load. Check your connection and reload.', 'error');
        return;
    }
    loadTheme();
    buildChart();
    syncThemeInputs();
    bindThemeInputs();
    applyTheme();

    $('rp-symbol').innerHTML = MARKETS.crypto.symbols
        .map(s => `<option value="${s}">${s}</option>`).join('');

    const dateEl = $('rp-date');
    dateEl.min = MARKETS.crypto.earliest;
    dateEl.max = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    dateEl.value = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);

    $('rp-symbol').addEventListener('change', async () => {
        if (hasWorkToLose() && !await ask('Change symbol?',
            'The session — position, orders and trade log — is cleared.', 'Change symbol')) return;
        resetAccount(true);
        $('rp-tk-icon').textContent = $('rp-symbol').value.charAt(0);
        loadChart();
    });
    $('rp-tf').addEventListener('change', async () => {
        if (S.mode === 'replay' && !await ask('Change timeframe?',
            'This ends the current replay session.', 'Change timeframe')) {
            $('rp-tf').value = String(S.tfMin); return;
        }
        loadChart();
    });
    $('rp-reset-acct').addEventListener('click', async () => {
        if (hasWorkToLose() && !await ask('Reset the account?',
            'Balance returns to the starting figure and the trade log is emptied. ' +
            'Export it first if you want to keep it.', 'Reset account')) return;
        resetAccount(true); updateEquity();
    });

    $('rp-jump').addEventListener('click', () => {
        const v = $('rp-date').value;
        if (!v) return;
        setCutPoint(Date.parse(v + 'T00:00:00Z'));
    });
    $('rp-start-replay').addEventListener('click', startReplay);
    $('rp-exit-replay').addEventListener('click', async () => {
        if (hasWorkToLose() && !await ask('Leave replay?',
            'Your trade log is kept. The replay session closes and the chart returns to live.',
            'Back to live chart')) return;
        loadChart();
    });

    $('rp-playpause').addEventListener('click', () => {
        S.playing = !S.playing; syncTransport(); runLoop();
    });
    $('rp-step').addEventListener('click', () => { S.playing = false; syncTransport(); stepBar(); });
    $('rp-back').addEventListener('click', stepBack);
    $('rp-speed').addEventListener('input', e => {
        S.speed = +e.target.value;
        $('rp-speed-val').innerHTML = S.speed + '&times;';
        if (S.playing) runLoop();
    });

    $('rp-settings-open').addEventListener('click', () => { $('rp-set').hidden = false; });
    $('rp-set-close').addEventListener('click', () => { $('rp-set').hidden = true; });
    $('rp-set').addEventListener('click', e => { if (e.target.id === 'rp-set') $('rp-set').hidden = true; });
    $('rp-ask-yes').addEventListener('click', () => answer(true));
    $('rp-ask-no').addEventListener('click', () => answer(false));
    $('rp-ask').addEventListener('click', e => { if (e.target.id === 'rp-ask') answer(false); });

    // replay controls live behind their own button rather than sitting on the
    // chart permanently
    $('rp-replay-open').addEventListener('click', () => {
        if (S.mode === 'replay') { $('rp-exit-replay').click(); return; }
        const bar = $('rp-cutbar');
        bar.hidden = !bar.hidden;
        syncHud();
    });

    // Where the pointer is relative to the two axes. Both are drawn inside
    // the same container as the plot, so without asking the library how wide
    // and tall they are we cannot tell an axis gesture from a chart one.
    function overAxis(e) {
        const r = $('rp-chart-wrap').getBoundingClientRect();
        let pw = 0, th = 0;
        try { pw = chart.priceScale('right').width(); } catch (err) {}
        try { th = chart.timeScale().height(); } catch (err) {}
        return { price: e.clientX >= r.right - pw, time: e.clientY >= r.bottom - th };
    }

    // Double-clicking an axis is the library's own "reset the view" gesture,
    // so settings must stay out of the way there and only answer to a
    // double-click on the plot itself.
    $('rp-chart-wrap').addEventListener('dblclick', e => {
        if (e.target.closest('.rp-legend-wrap, .rp-transport, .rp-hud, .rp-cf, .rp-tb')) return;
        if (!$('rp-cutbar').hidden) return;      // mid replay set-up
        const where = overAxis(e);
        if (where.price || where.time) return;   // axis double-click: let it reset
        $('rp-set').hidden = false;
    });

    // Scrolling over the price axis should stretch and squash the chart
    // vertically, the way dragging that axis already does. The library zooms
    // the time axis on wheel but has no vertical equivalent, so this drives
    // the price scale's margins instead: smaller margins let the candles fill
    // more height (zoom in), larger ones compress them (zoom out).
    //
    // It MUST run in the capture phase. The chart's own wheel handler is on a
    // canvas inside this element, so in the bubble phase it had already
    // zoomed east-west by the time we could call stopPropagation.
    let priceMargins = { top: 0.1, bottom: 0.1 };
    $('rp-chart-wrap').addEventListener('wheel', e => {
        if (!overAxis(e).price) return;          // over the plot: leave it alone
        e.preventDefault();
        e.stopPropagation();
        const k = e.deltaY > 0 ? 1.12 : 1 / 1.12;
        priceMargins = {
            top:    Math.min(0.42, Math.max(0.005, priceMargins.top * k)),
            bottom: Math.min(0.42, Math.max(0.005, priceMargins.bottom * k))
        };
        try { chart.priceScale('right').applyOptions({ scaleMargins: priceMargins }); }
        catch (err) {}
    }, { passive: false, capture: true });

    makeDraggable($('rp-transport'), 'bt.replay.pos.transport');
    makeDraggable($('rp-hud'), 'bt.replay.pos.hud');

    // indicator settings dialog
    $('rp-icfg-close').addEventListener('click', closeIndCfg);
    $('rp-icfg-ok').addEventListener('click', closeIndCfg);
    $('rp-icfg').addEventListener('click', e => { if (e.target.id === 'rp-icfg') closeIndCfg(); });
    $('rp-icfg-del').addEventListener('click', () => {
        if (icfgId !== null) { removeIndicator(icfgId); updateIndCount(); }
        closeIndCfg();
    });
    document.querySelectorAll('#rp-icfg-tabs button').forEach(b =>
        b.addEventListener('click', () => {
            icfgTab = b.dataset.itab;
            document.querySelectorAll('#rp-icfg-tabs button').forEach(x =>
                x.classList.toggle('active', x === b));
            renderIndCfg();
        }));

    // the on-chart indicator list folds away
    $('rp-leg-toggle').addEventListener('click', () => {
        legendCollapsed = !legendCollapsed;
        $('rp-leg-toggle').classList.toggle('collapsed', legendCollapsed);
        try { localStorage.setItem('bt.replay.legendCollapsed', legendCollapsed ? '1' : '0'); } catch (e) {}
        renderLegend();
    });
    try {
        legendCollapsed = localStorage.getItem('bt.replay.legendCollapsed') === '1';
        $('rp-leg-toggle').classList.toggle('collapsed', legendCollapsed);
    } catch (e) {}

    // export / save
    $('rp-export').addEventListener('click', () => openExportMenu($('rp-export')));

    // indicator picker
    $('rp-ind-open').addEventListener('click', openIndModal);
    $('rp-modal-close').addEventListener('click', closeIndModal);
    $('rp-modal').addEventListener('click', e => {
        if (e.target.id === 'rp-modal') closeIndModal();   // backdrop
    });
    $('rp-ind-search').addEventListener('input', e => renderCatalog(e.target.value));
    $('rp-ind-template').addEventListener('change', e => {
        if (TEMPLATES[e.target.value]) $('rp-ind-code').value = TEMPLATES[e.target.value];
    });
    $('rp-ind-addcustom').addEventListener('click', () => {
        const code = $('rp-ind-code').value.trim();
        if (!code) return;
        addIndicator('custom', {}, code);
        updateIndCount();
    });
    $('rp-ind-code').value = TEMPLATES.sma;
    renderIndicatorList();
    updateIndCount();

    // drawing tools
    if (window.BTTools) {
        BTTools.attach(chart, series, $('rp-chart-wrap'), { onChange: saveDrawings });
        BTTools.setTool('cursor');
    }

    initDock();
    initTicket();

    // journal
    $('rp-jr-text').addEventListener('input', () => {
        if (jrSelected) {
            const t = S.trades.find(x => x.id === jrSelected);
            if (t) { t.note = $('rp-jr-text').value; renderJournalList(); renderHistory(); }
        }
        saveJournal();
    });
    $('rp-cal-prev').addEventListener('click', () => {
        if (!calMonth) return;
        calPinned = true;
        calMonth = new Date(Date.UTC(calMonth.getUTCFullYear(), calMonth.getUTCMonth() - 1, 1));
        renderCalendar();
    });
    $('rp-cal-next').addEventListener('click', () => {
        if (!calMonth) return;
        calPinned = true;
        calMonth = new Date(Date.UTC(calMonth.getUTCFullYear(), calMonth.getUTCMonth() + 1, 1));
        renderCalendar();
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !$('rp-ask').hidden)  { answer(false); return; }
        if (e.key === 'Escape' && !$('rp-icfg').hidden) { closeIndCfg(); return; }
        if (e.key === 'Escape' && !$('rp-modal').hidden) { closeIndModal(); return; }
        if (e.key === 'Escape' && !$('rp-set').hidden) { $('rp-set').hidden = true; return; }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z' ||
             e.key === 'y' || e.key === 'Y')) return;   // the tools own undo
        if (/input|select|textarea/i.test(e.target.tagName)) return;
        if (e.code === 'Space')      { e.preventDefault(); $('rp-playpause').click(); }
        if (e.code === 'ArrowRight') { e.preventDefault(); $('rp-step').click(); }
        if (e.code === 'ArrowLeft')  { e.preventDefault(); $('rp-back').click(); }
    });

    window.addEventListener('resize', () => { renderCurve(); });

    $('rp-tk-icon').textContent = S.symbol.charAt(0);
    updateEquity();
    updateModeUI();
    renderAll();
    loadChart();          // open on a real chart, not an empty panel
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
