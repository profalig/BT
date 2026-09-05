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
    },
    /* Our own 1-minute history, built by tools/btdata.py and served as static
       files from this same origin.

       This exists because no free feed will talk to a browser. Dukascopy —
       the accurate one, actual bank ticks — sends no CORS headers at all.
       The ones that do let a page in need an API key, which in a web page is
       public, and rate-limit per key, so every visitor would share one small
       allowance. Fetching it once and hosting it removes all three problems
       and is faster besides: these are static files on a CDN.

       Real open/high/low/close, so unlike the ECB daily feed this draws
       candles and offers every timeframe. */
    hosted: {
        label: 'Forex & more',
        earliest: '2003-05-05',        // the oldest the builder can reach
        venue: 'Dukascopy',
        async klines(symbol, interval, opts) {
            return hostedKlines(symbol, interval, opts || {});
        }
    },
    fx: {
        label: 'Forex',
        earliest: '1999-01-04',
        // The honest shape of this feed, declared so the rest of the app can
        // behave correctly rather than pretend: one price per business day,
        // and that price is a CLOSE. There is no open, high or low, so this
        // draws as a line and never as a candle, and the fill engine cannot
        // step minutes inside a day.
        daily: true,
        closeOnly: true,
        note: 'ECB daily reference rate — one close per business day, no intraday.',
        symbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCHF', 'USDCAD',
                  'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'EURCHF', 'AUDJPY',
                  'USDSEK', 'USDNOK', 'USDPLN', 'USDCZK', 'USDHUF', 'USDTRY',
                  'USDZAR', 'USDMXN', 'USDBRL', 'USDCNY', 'USDINR', 'USDKRW'],
        async klines(symbol, interval, opts) {
            const base = symbol.slice(0, 3), quote = symbol.slice(3, 6);
            const all = await fxSeries(base, quote);
            let rows = all;
            if (opts.startTime) rows = rows.filter(k => k.t >= opts.startTime);
            if (opts.endTime)   rows = rows.filter(k => k.t <= opts.endTime);
            const lim = opts.limit || 1000;
            // With no range at all the caller wants the PRESENT, the way the
            // exchange endpoint behaves — returning the oldest thousand days
            // opened every forex chart in 1999.
            return opts.startTime ? rows.slice(0, lim) : rows.slice(-lim);
        }
    }
};

/* Frankfurter republishes the European Central Bank's daily reference rates,
   with CORS and no key, back to 1999. It is the only free forex history that
   a browser can actually reach — every other candidate (Yahoo, Stooq, the
   ECB's own XML) refuses cross-origin requests outright.

   One fetch covers the whole history of a pair, so it is cached for the
   session; a 27-year series is a few hundred kilobytes. */
const FX_CACHE = {};
const FX_BASE = 'https://api.frankfurter.dev/v1';

async function fxSeries(base, quote) {
    const key = base + quote;
    if (FX_CACHE[key]) return FX_CACHE[key];
    const start = MARKETS.fx.earliest;
    const end = new Date().toISOString().slice(0, 10);
    const res = await fetch(FX_BASE + '/' + start + '..' + end +
                            '?base=' + base + '&symbols=' + quote);
    if (!res.ok) throw new Error('Forex feed ' + res.status);
    const j = await res.json();
    const days = Object.keys(j.rates || {}).sort();
    let prev = null;
    const out = [];
    for (const d of days) {
        const v = j.rates[d][quote];
        if (!isFinite(v)) continue;
        const t = Date.parse(d + 'T00:00:00Z');
        // A close-to-close bar. The open is yesterday's close and the range is
        // the move between them — everything shown is a real observation, and
        // nothing inside the day is invented.
        const o = prev === null ? v : prev;
        out.push({ t: t, o: o, h: Math.max(o, v), l: Math.min(o, v), c: v, v: 0 });
        prev = v;
    }
    FX_CACHE[key] = out;
    return out;
}

/* ------------------------------------------------ hosted history files ----

   One file per symbol per month, written by tools/btdata.py. Every number in
   them is a difference from the one before it, which is what keeps a month of
   1-minute bars down to about 145KB — small enough that loading a couple of
   months to draw a chart costs less than a photograph. */

const HOSTED_BASE = 'data';
let hostedManifest = null, hostedManifestErr = null;
const HOSTED_MONTHS = {};        // "EURUSD/2024-01" -> [bars] | null

async function hostedIndex() {
    if (hostedManifest) return hostedManifest;
    if (hostedManifestErr) throw hostedManifestErr;
    try {
        const r = await fetch(HOSTED_BASE + '/manifest.json');
        if (!r.ok) throw new Error('manifest ' + r.status);
        hostedManifest = await r.json();
        return hostedManifest;
    } catch (e) {
        hostedManifestErr = e;
        throw e;
    }
}

async function hostedMonth(symbol, ym) {
    const key = symbol + '/' + ym;
    if (key in HOSTED_MONTHS) return HOSTED_MONTHS[key];
    let bars = null;
    try {
        const r = await fetch(HOSTED_BASE + '/' + symbol + '/' + ym + '.json.gz');
        // A 404 means that month was never built. Not an error worth throwing:
        // history simply starts where it starts.
        if (r.ok) {
            const d = await readGzJson(r);
            if (d && d.enc === 'd1') bars = decodeHosted(d);
        }
    } catch (e) { bars = null; }
    HOSTED_MONTHS[key] = bars;
    return bars;
}

/* Whether a .json.gz arrives compressed depends entirely on the host. A server
   that labels it `Content-Encoding: gzip` has the browser unwrap it before we
   see it; one that labels it `Content-Type: application/gzip` — which is what
   a plain static server does, and what the dev server here does — hands over
   the raw bytes and JSON.parse chokes on them.

   Rather than depend on how somebody's CDN is configured, look at the first
   two bytes. 1f 8b is gzip, and nothing else can be: valid JSON starts with a
   brace. So the same files work on the dev server, on Vercel, and on any
   bucket, with nothing to configure and nothing to get wrong. */
async function readGzJson(res) {
    const buf = await res.arrayBuffer();
    const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
    if (head.length < 2 || head[0] !== 0x1f || head[1] !== 0x8b) {
        return JSON.parse(new TextDecoder().decode(buf));   // already unwrapped
    }
    if (typeof DecompressionStream !== 'function') {
        throw new Error('This browser cannot unpack the history files.');
    }
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
}

/* Undo the delta encoding. Prices come back as numbers at the file's own
   precision, never re-rounded, so what is drawn is exactly what was measured. */
function decodeHosted(d) {
    const n = d.n || d.t.length, sc = d.scale, t0 = d.t0;
    const out = new Array(n);
    let m = 0, c = 0;
    for (let i = 0; i < n; i++) {
        m += d.t[i];
        c += d.c[i];
        out[i] = {
            t: (t0 + m * 60) * 1000,
            o: (c + d.o[i]) / sc,
            h: (c + d.h[i]) / sc,
            l: (c + d.l[i]) / sc,
            c: c / sc,
            v: d.v ? d.v[i] : 0
        };
    }
    return out;
}

const TF_MIN_OF = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440 };

function ymOf(ms) {
    const d = new Date(ms);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

async function hostedKlines(symbol, interval, opts) {
    const man = await hostedIndex();
    const info = man.symbols && man.symbols[symbol];
    if (!info) throw new Error(symbol + ' has not been built yet');

    const months = info.months || [];
    const limit = opts.limit || 1000;
    const tf = TF_MIN_OF[interval] || 1;

    /* How many month files this request needs. Forex trades about 21,600
       minutes a week-month, so that many bars divided by the timeframe is
       what one file yields. Capped, because a daily request would otherwise
       ask for six years of files in one go; panning fetches the rest as it
       is needed, and each file is only ever read once. */
    const need = Math.min(30, Math.max(1, Math.ceil(limit * tf / 21600)));

    /* Three different questions get asked here, and only two were answered.
       Panning left calls this with endTime ALONE — "give me what came before
       this" — and that fell through to the branch that returns the most
       recent months, which then filtered down to nothing. That is why the
       chart stopped dead a few months back however far you dragged it. */
    let wanted;
    if (opts.startTime) {
        const from = ymOf(opts.startTime);
        let i = months.findIndex(m => m >= from);
        if (i < 0) i = Math.max(0, months.length - need);
        wanted = months.slice(i, i + need);
        if (opts.endTime) {
            const to = ymOf(opts.endTime);
            wanted = wanted.filter(m => m <= to);
        }
    } else if (opts.endTime) {
        const to = ymOf(opts.endTime);
        let end = months.findIndex(m => m > to);
        if (end < 0) end = months.length;
        wanted = months.slice(Math.max(0, end - need), end);
    } else {
        wanted = months.slice(-need);
    }
    if (!wanted.length) return [];

    let mins = [];
    for (const ym of wanted) {
        const got = await hostedMonth(symbol, ym);
        if (got) mins = mins.concat(got);
    }
    if (!mins.length) return [];

    const bars = tf === 1 ? mins : aggregateBars(mins, tf);
    let rows = bars;
    if (opts.startTime) rows = rows.filter(b => b.t >= opts.startTime);
    if (opts.endTime)   rows = rows.filter(b => b.t <= opts.endTime);
    return opts.startTime ? rows.slice(0, limit) : rows.slice(-limit);
}

/* Minutes into any larger timeframe. Buckets are aligned to the epoch so the
   same candle is produced no matter which slice of history it was built from —
   a bar that shifts when you scroll is worse than no bar. */
function aggregateBars(mins, tfMin) {
    const step = tfMin * MIN_MS;
    const out = [];
    let cur = null, bucket = -1;
    for (const b of mins) {
        const k = Math.floor(b.t / step) * step;
        if (k !== bucket) {
            if (cur) out.push(cur);
            bucket = k;
            cur = { t: k, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v };
        } else {
            if (b.h > cur.h) cur.h = b.h;
            if (b.l < cur.l) cur.l = b.l;
            cur.c = b.c;
            cur.v += b.v;
        }
    }
    if (cur) out.push(cur);
    return out;
}

const srcOfMarket = () => MARKETS[S.market] || MARKETS.crypto;
const venueName = () => S.market === 'fx' ? 'ECB'
                      : S.market === 'hosted' ? 'Dukascopy' : 'Binance';
const isCloseOnly = () => !!srcOfMarket().closeOnly;

/* ------------------------------------------------------- instruments ----

   The catalogue is built from the exchange's own instrument list rather than
   hard-coded, so it is never out of date. Categories are honest about what
   the venue actually carries:

     crypto  487 USDT pairs, BTC back to Aug 2017
     fx      EUR/USD, plus genuine USD crosses against EM currencies
     metal   gold, via the two fully-backed tokens (1 token = 1 troy ounce)
     other   stocks, indices and energy — NOT on this venue at any price, so
             the tab says so instead of pretending

   Anything we cannot actually price is not listed as though it were there.  */

/* Curated, not exhaustive. The exchange lists 487 dollar pairs and hundreds
   more against yen, lira and real; a picker that shows all of them is a
   worse picker. These are the books a trader would actually chart, and the
   fiat-quoted duplicates of the same coin (LTCJPY, LTCTRY, LTCBRL, LTCEUR
   for the one LTCUSDT everybody uses) are left out entirely. */
/* Checked against Binance's live symbol list. Five names that used to be here
   no longer trade against USDT there — MKR and FTM were renamed (SKY and S),
   EOS became A, and TON and XMR were delisted — so they were silently dropped
   at load and simply never appeared. Their successors are in, along with the
   large names that had been missed. */
const CRYPTO_MAJORS = [
    'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'DOT',
    'TRX', 'LTC', 'BCH', 'ATOM', 'UNI', 'NEAR', 'APT', 'ARB', 'OP', 'FIL',
    'ETC', 'ICP', 'INJ', 'SUI', 'SEI', 'TIA', 'IMX', 'AAVE', 'GRT', 'TAO',
    'ALGO', 'VET', 'HBAR', 'STX', 'SAND', 'MANA', 'AXS', 'XLM', 'ENA', 'ONDO',
    'RUNE', 'CRV', 'LDO', 'SNX', 'COMP', 'ENS', 'DYDX', 'GMX', 'PEPE', 'SHIB',
    'WIF', 'BONK', 'FLOKI', 'JUP', 'PYTH', 'POL', 'RENDER', 'ZEC', 'WLD', 'FET',
    'S', 'SKY', 'CAKE', 'TRUMP'
];
const METALS = { PAXG: 'Gold — PAX Gold (1 token = 1 fine troy ounce)',
                 XAUT: 'Gold — Tether Gold (1 token = 1 fine troy ounce)' };

const ASSET_NAMES = {
    BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', BNB: 'BNB', XRP: 'XRP',
    ADA: 'Cardano', DOGE: 'Dogecoin', LINK: 'Chainlink', AVAX: 'Avalanche',
    LTC: 'Litecoin', DOT: 'Polkadot', POL: 'Polygon', TRX: 'TRON',
    ATOM: 'Cosmos', UNI: 'Uniswap', NEAR: 'NEAR Protocol', ARB: 'Arbitrum',
    OP: 'Optimism', APT: 'Aptos', FIL: 'Filecoin', ETC: 'Ethereum Classic',
    BCH: 'Bitcoin Cash', SHIB: 'Shiba Inu', PEPE: 'Pepe', SUI: 'Sui',
    INJ: 'Injective', TIA: 'Celestia', SEI: 'Sei', RENDER: 'Render',
    ICP: 'Internet Computer', IMX: 'Immutable', AAVE: 'Aave', MKR: 'Maker',
    TAO: 'Bittensor', ENA: 'Ethena', ONDO: 'Ondo', WLD: 'Worldcoin',
    FET: 'Artificial Superintelligence', S: 'Sonic', SKY: 'Sky (was Maker)',
    CAKE: 'PancakeSwap', TRUMP: 'Official Trump',
    GRT: 'The Graph', ALGO: 'Algorand', VET: 'VeChain', HBAR: 'Hedera',
    STX: 'Stacks', SAND: 'The Sandbox', MANA: 'Decentraland', AXS: 'Axie Infinity',
    EOS: 'EOS', XLM: 'Stellar', FTM: 'Fantom', RUNE: 'THORChain', CRV: 'Curve',
    LDO: 'Lido', SNX: 'Synthetix', COMP: 'Compound', ENS: 'Ethereum Name Service',
    DYDX: 'dYdX', GMX: 'GMX', WIF: 'dogwifhat', BONK: 'Bonk', FLOKI: 'Floki',
    JUP: 'Jupiter', PYTH: 'Pyth Network', TON: 'Toncoin', ZEC: 'Zcash', XMR: 'Monero',
    USD: 'US dollar', EUR: 'Euro', GBP: 'Pound sterling', JPY: 'Japanese yen',
    AUD: 'Australian dollar', CHF: 'Swiss franc', CAD: 'Canadian dollar',
    NZD: 'New Zealand dollar', SEK: 'Swedish krona', NOK: 'Norwegian krone',
    PLN: 'Polish zloty', CZK: 'Czech koruna', HUF: 'Hungarian forint',
    TRY: 'Turkish lira', ZAR: 'South African rand', MXN: 'Mexican peso',
    BRL: 'Brazilian real', CNY: 'Chinese yuan', INR: 'Indian rupee',
    KRW: 'South Korean won'
};

let CATALOGUE = null;          // [{symbol, base, quote, cat, name, px, chg}]
let favourites = [];
const DEFAULT_FAVS = ['BTCUSDT', 'ETHUSDT', 'PAXGUSDT', 'EURUSD', 'GBPUSD'];
try { favourites = JSON.parse(localStorage.getItem('bt.replay.favs') || 'null') || DEFAULT_FAVS.slice(); }
catch (e) { favourites = DEFAULT_FAVS.slice(); }
// EURUSDT was the stand-in before there was a real forex feed; anyone who
// still has it starred gets the genuine pair instead.
if (favourites.indexOf('EURUSDT') >= 0) {
    favourites = favourites.filter(x => x !== 'EURUSDT');
    if (favourites.indexOf('EURUSD') < 0) favourites.push('EURUSD');
}
const saveFavs = () => {
    try { localStorage.setItem('bt.replay.favs', JSON.stringify(favourites)); } catch (e) {}
};

/* Categories are deliberately strict about what belongs in a tab, and
   everything else stays reachable through search rather than padding the
   lists. Ranking by raw quote volume put BTCJPY and MARSCOINTRY above
   BTCUSDT, because a volume denominated in yen or lira is a bigger NUMBER
   without being a bigger market — so the quote currency is ranked first and
   volume only breaks ties within it. */
const QUOTE_RANK = { USDT: 0, USDC: 1, FDUSD: 2, TUSD: 3 };
const STABLE_ONLY = ['USDT', 'USDC', 'FDUSD', 'TUSD', 'DAI', 'USD', 'USD1', 'BUSD'];

function categorise(base, quote) {
    const bMetal = !!METALS[base];
    const bStable = STABLE_ONLY.includes(base);
    const qStable = STABLE_ONLY.includes(quote);
    const bFiat = FIATS.includes(base);
    const qFiat = FIATS.includes(quote);

    // Gold, quoted in dollars. TRY- and BTC-quoted gold is real but nobody
    // charts it, so it stays searchable instead of filling the tab.
    if (bMetal) return (quote === 'USDT' || quote === 'USDC') ? 'metal' : 'alt';

    // Currencies: a fiat against the dollar, in either direction. Two
    // stablecoins against each other is not a currency pair in any useful
    // sense, so USDC/USDT and friends are excluded.
    if (bFiat && qStable) return 'fx';
    if (bStable && qFiat) return 'fx';
    if (bStable && qStable) return 'alt';

    // Crypto proper: priced in dollars. The yen- and lira-quoted books are
    // thin and duplicate the USDT ones.
    if (quote === 'USDT') return 'crypto';
    return 'alt';
}

function instrumentName(base, quote, cat) {
    if (METALS[base]) return METALS[base] + (quote === 'USDC' ? ' / USDC' : '');
    const nm = a => ASSET_NAMES[a] || a;
    if (cat === 'fx' || cat === 'alt') {
        const b = STABLE_ONLY.includes(base) ? 'US dollar' : nm(base);
        const q = STABLE_ONLY.includes(quote) ? 'US dollar' : nm(quote);
        if (FIATS.includes(base) || FIATS.includes(quote)) return b + ' / ' + q;
    }
    return nm(base);
}

async function loadCatalogue() {
    if (CATALOGUE) return CATALOGUE;

    // Forex needs no lookup — the pairs are fixed and the feed has them all.
    const fx = MARKETS.fx.symbols.map(sym => ({
        symbol: sym, src: 'fx', cat: 'fx',
        base: sym.slice(0, 3), quote: sym.slice(3, 6),
        name: (ASSET_NAMES[sym.slice(0, 3)] || sym.slice(0, 3)) + ' / ' +
              (ASSET_NAMES[sym.slice(3, 6)] || sym.slice(3, 6)),
        res: '1D',
        vol: MARKETS.fx.symbols.length - MARKETS.fx.symbols.indexOf(sym)
    }));

    let crypto = [], metal = [];
    try {
        const [info, tick] = await Promise.all([
            fetch(BINANCE + '/exchangeInfo').then(r => r.json()),
            fetch(BINANCE + '/ticker/24hr').then(r => r.json()).catch(() => [])
        ]);
        const px = {};
        (tick || []).forEach(t => {
            px[t.symbol] = { last: +t.lastPrice, chg: +t.priceChangePercent, vol: +t.quoteVolume };
        });
        const live = new Set(info.symbols.filter(x => x.status === 'TRADING').map(x => x.symbol));

        crypto = CRYPTO_MAJORS
            .map(b => b + 'USDT')
            .filter(sym => live.has(sym))
            .map(sym => {
                const b = sym.replace(/USDT$/, ''), t = px[sym] || {};
                return { symbol: sym, src: 'crypto', cat: 'crypto', base: b, quote: 'USDT',
                         name: ASSET_NAMES[b] || b, px: t.last, chg: t.chg, vol: t.vol || 0 };
            })
            .sort((a, b) => b.vol - a.vol);

        metal = Object.keys(METALS)
            .map(b => b + 'USDT')
            .filter(sym => live.has(sym))
            .map(sym => {
                const b = sym.replace(/USDT$/, ''), t = px[sym] || {};
                return { symbol: sym, src: 'crypto', cat: 'commodity', base: b, quote: 'USDT',
                         name: METALS[b], px: t.last, chg: t.chg, vol: t.vol || 0 };
            })
            .sort((a, b) => b.vol - a.vol);
    } catch (e) { /* forex still lists even if the exchange is unreachable */ }

    /* Anything we host ourselves goes in ahead of the daily forex feed. Where
       both carry a pair, the hosted one wins: real candles at every timeframe
       beat one close a day, and having the same symbol behave differently
       depending on which list it was picked from would be indefensible. */
    let hosted = [];
    try {
        const man = await hostedIndex();
        const KIND_CAT = { fx: 'fx', metal: 'commodity', energy: 'commodity',
                           index: 'other', stock: 'other' };
        hosted = Object.keys(man.symbols || {}).map(sym => {
            const it = man.symbols[sym];
            const l = it.last || {};
            return {
                symbol: sym, src: 'hosted', cat: KIND_CAT[it.kind] || 'other',
                kind: it.kind,
                base: sym.slice(0, 3), quote: sym.slice(3, 6),
                name: it.name, from: it.from, to: it.to,
                // Carried in the manifest so a list of two dozen rows costs
                // one request rather than two dozen.
                px: l.c, chg: l.chgPct,
                res: '1m',
                digits: Math.round(Math.log10(it.scale || 100000)),
                vol: it.kind === 'fx' ? 1e6 : 1e5      // list currencies first
            };
        });
    } catch (e) { /* nothing built yet — the rest of the app is unaffected */ }

    /* Only instruments we actually hold minute history for are listed. The
       ECB daily series is still wired up and still loads — a saved layout
       pointing at one keeps working — but a pair offering a single price a
       day should not sit in the same list as one offering candles, looking
       identical until you pick it. Downloading a pair is what puts it here.

       `fx` is deliberately unused: MARKETS.fx remains for those saved
       layouts, and the moment tools/btdata.py builds a pair it appears
       through `hosted` instead. */
    CATALOGUE = crypto.concat(metal, hosted);
    return CATALOGUE;
}

// ------------------------------------------------------------------- state// ------------------------------------------------------------------- state

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
    /* Where we host the history we know exactly how the feed quotes it — the
       scale is the tick size — so there is nothing to infer. EURUSD is five
       decimals at 1.16 and USDJPY is three at 156, which no rule based on the
       size of the number can tell apart. */
    const row = CATALOGUE && CATALOGUE.find(x => x.symbol === S.symbol);
    if (row && row.digits) return row.digits;
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

/* How many decimals this instrument is quoted in. The tick size the axis uses
   comes from here, so getting it wrong does not merely round the numbers — it
   decides where gridlines can be drawn at all. Left at the default of 0.01,
   a forex chart spanning sixty pips had room for one label. */
function priceFormat() {
    const d = pdp();
    return { type: 'price', precision: d, minMove: Math.pow(10, -d) };
}

function seriesOptions() {
    return {
        priceFormat: priceFormat(),
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

function effectiveType() {
    // Drawing a candle from a single daily close would mean inventing an
    // open, a high and a low. The feed gets the chart type its data can
    // actually support.
    return isCloseOnly() ? 'line' : theme.type;
}

let seriesType = null;

function makeSeries() {
    seriesType = effectiveType();
    if (effectiveType() === 'line')
        return chart.addLineSeries({ color: theme.up, lineWidth: 2 });
    if (effectiveType() === 'area')
        return chart.addAreaSeries({ lineColor: theme.up, topColor: theme.up + '55', bottomColor: theme.up + '05' });
    if (effectiveType() === 'bar')
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
        // Falling back to the last bar rather than clearing: an empty block
        // has no height, so every indicator row below it jumped up the moment
        // the pointer left a candle and dropped back when it returned.
        const last = lastPainted[lastPainted.length - 1] || null;
        if (!param || !param.time) { renderOHLC(last); return; }
        renderOHLC(lastPainted.find(b => b.time === param.time) || last);
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

    const t = effectiveType();
    const shaped = (t === 'line' || t === 'area')
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
    S.tfMin  = +$('rp-tf').value;

    S.hist = []; S.oldestMs = null; S.noMoreHistory = false;
    exitReplayState();
    syncTicker();

    // A candlestick series cannot be fed {time,value}, and a line series
    // cannot be fed OHLC — switching between a candle feed and a close-only
    // one has to swap the series, not just the data.
    if (seriesType !== effectiveType()) { rebuildSeries(); applyTheme(); }
    chart.applyOptions({ timeScale: { timeVisible: !srcOfMarket().daily } });

    status('Loading ' + S.symbol + ' ' + TF_LABEL[S.tfMin] + '…');
    try {
        const ks = await src.klines(S.symbol, TF_LABEL[S.tfMin], { limit: 1000 });
        if (!ks.length) { status('No data returned for that symbol.', 'error'); return; }
        S.hist = ks.map(toBar);
        S.oldestMs = ks[0].t;
        /* Before the first paint, not after: the axis decides where it can put
           gridlines from the tick size, and a chart drawn at the wrong one
           then corrected visibly jumps. */
        try { series.applyOptions({ priceFormat: priceFormat() }); } catch (e) {}
        paint();
        chart.timeScale().fitContent();
        hideStatus();
        updateModeUI();
        syncTicker();        // a non-streaming feed has no tick to refresh it
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
        /* Our own files are local and cached after the first read, so there
           is no reason to creep backwards a thousand bars at a time and make
           somebody drag the chart over and over to get through a year. */
        const page = S.market === 'crypto' ? 1000 : 4000;
        const ks = await MARKETS[S.market].klines(S.symbol, TF_LABEL[S.tfMin],
                        { endTime: S.oldestMs - 1, limit: page });
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
    if (S.market !== 'crypto') return;   // the daily forex feed has no stream
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
            const et = effectiveType();
            series.update((et === 'line' || et === 'area')
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
    if (S.mode !== 'browse' || S.market !== 'crypto') return;
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

/* The fill engine steps the finest bar the feed publishes. On crypto that is
   one minute, which is what makes a stop-and-target inside one candle
   decidable. The daily forex feed has nothing finer than a day, so there
   fills are resolved on the day's own close-to-close range — the best the
   data supports, and the reason that feed is labelled as it is. */
function fineInterval() { return srcOfMarket().daily ? '1d' : '1m'; }
function fineStepMs()   { return srcOfMarket().daily ? 86400000 : MIN_MS; }

async function ensure1m() {
    if (S.fetching1m || S.exhausted) return;
    if (S.bars1m.length - S.fillIdx > 1440) return;
    S.fetching1m = true;
    try {
        const from = S.bars1m.length ? S.bars1m[S.bars1m.length - 1].t + fineStepMs() : S.cursorMs;
        const page = await MARKETS[S.market].klines(S.symbol, fineInterval(), { startTime: from, limit: 1000 });
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
        label: 'Bollinger', pane: 'price', params: { period: 20, mult: 2, maType: 'SMA' }, multi: 3,
        outputs: ['Basis', 'Upper', 'Lower'], src: true,
        calc: (b, p) => {
            const c = srcOf(b, p.source), ma = smooth(c, p.period, p.maType);
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
        label: 'RSI', pane: 'lower', multi: 3,
        outputs: ['RSI', 'Overbought', 'Oversold'],
        params: { period: 14, upper: 70, lower: 30 }, src: true,
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
            // Constant bands, so the thresholds move with the setting instead
            // of living in someone's head.
            const band = v => out.map(x => x === null ? null : v);
            return [out, band(+p.upper), band(+p.lower)];
        }
    },
    macd: {
        label: 'MACD', pane: 'lower', params: { period: 12, slow: 26, signal: 9 }, multi: 3,
        outputs: ['MACD', 'Signal', 'Histogram'], kinds: ['line', 'line', 'histogram'],
        src: true,
        calc: (b, p) => {
            const c = srcOf(b, p.source);
            const f = expAvg(c, p.period), s = expAvg(c, p.slow);
            const line = c.map((_, i) => (f[i] === null || s[i] === null) ? null : f[i] - s[i]);
            const clean = line.map(v => v === null ? 0 : v);
            const sig = expAvg(clean, p.signal).map((v, i) => line[i] === null ? null : v);
            // The histogram is the whole point of the study — the spread
            // between the line and its signal, which is what crosses zero.
            const hist = line.map((v, i) => (v === null || sig[i] === null) ? null : v - sig[i]);
            return [line, sig, hist];
        }
    },
    atr: {
        label: 'ATR', pane: 'lower', params: { period: 14, maType: 'RMA' },
        calc: (b, p) => {
            const tr = b.map((x, i) => i === 0 ? x.high - x.low : Math.max(
                x.high - x.low,
                Math.abs(x.high - b[i - 1].close),
                Math.abs(x.low - b[i - 1].close)));
            return smooth(tr, p.period, p.maType);
        }
    },
    stoch: {
        label: 'Stochastic', pane: 'lower', multi: 4,
        outputs: ['%K', '%D', 'Overbought', 'Oversold'],
        params: { period: 14, smoothK: 1, signal: 3, upper: 80, lower: 20 },
        calc: (b, p) => {
            const raw = new Array(b.length).fill(null);
            for (let i = p.period - 1; i < b.length; i++) {
                let hi = -Infinity, lo = Infinity;
                for (let j = i - p.period + 1; j <= i; j++) {
                    hi = Math.max(hi, b[j].high); lo = Math.min(lo, b[j].low);
                }
                raw[i] = hi === lo ? 50 : (b[i].close - lo) / (hi - lo) * 100;
            }
            // Smoothing %K is what separates the fast stochastic from the slow.
            const kS = +p.smoothK > 1
                ? movingAvg(raw.map(v => v === null ? 0 : v), +p.smoothK)
                    .map((v, i) => raw[i] === null ? null : v)
                : raw;
            const d = movingAvg(kS.map(v => v === null ? 0 : v), p.signal)
                        .map((v, i) => kS[i] === null ? null : v);
            const band = v => kS.map(x => x === null ? null : v);
            return [kS, d, band(+p.upper), band(+p.lower)];
        }
    },
    vwap: {
        label: 'VWAP', pane: 'price', multi: 7, src: true,
        outputs: ['VWAP', 'Upper band 1', 'Lower band 1', 'Upper band 2',
                  'Lower band 2', 'Upper band 3', 'Lower band 3'],
        params: { anchor: 'session', source: 'hlc3',
                  b1: true,  b1m: 1,
                  b2: false, b2m: 2,
                  b3: false, b3m: 3 },
        /* Anchored VWAP with standard-deviation bands, the way TradingView
           exposes it: the average resets on the anchor period, and each band
           is a multiple of the volume-weighted deviation from it. Variance is
           accumulated as E[x²]−E[x]² so the whole thing stays one pass. */
        calc: (b, p) => {
            const vw = [], out = [[], [], [], [], [], []];
            let pv = 0, vv = 0, sq = 0, key = null;
            for (const x of b) {
                const k = anchorKey(x.time, p.anchor);
                if (k !== key) { key = k; pv = 0; vv = 0; sq = 0; }
                const v = x.volume || 1;
                const tp = srcValue(x, p.source);
                pv += tp * v; vv += v; sq += tp * tp * v;
                const mean = vv ? pv / vv : null;
                vw.push(mean);
                if (mean === null) { out.forEach(a => a.push(null)); continue; }
                const sd = Math.sqrt(Math.max(0, sq / vv - mean * mean));
                const band = (on, mult) => on ? mean + sd * mult : null;
                out[0].push(band(p.b1, +p.b1m));
                out[1].push(band(p.b1, -p.b1m));
                out[2].push(band(p.b2, +p.b2m));
                out[3].push(band(p.b2, -p.b2m));
                out[4].push(band(p.b3, +p.b3m));
                out[5].push(band(p.b3, -p.b3m));
            }
            return [vw].concat(out);
        }
    }
};

/* Which price an indicator is measured on. TradingView calls this the
   source, and it is the input traders change most after the period. */
const SOURCES = ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'];
const ANCHORS = ['session', 'week', 'month', 'quarter', 'year'];

function srcValue(b, name) {
    switch (name) {
        case 'open':  return b.open;
        case 'high':  return b.high;
        case 'low':   return b.low;
        case 'hl2':   return (b.high + b.low) / 2;
        case 'hlc3':  return (b.high + b.low + b.close) / 3;
        case 'ohlc4': return (b.open + b.high + b.low + b.close) / 4;
        default:      return b.close;
    }
}

// Which bucket a bar belongs to, for anchored studies.
function anchorKey(timeSec, anchor) {
    const d = new Date(timeSec * 1000);
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    if (anchor === 'year')    return y;
    if (anchor === 'quarter') return y + '-' + Math.floor(m / 3);
    if (anchor === 'month')   return y + '-' + m;
    if (anchor === 'week') {
        const t = Date.UTC(y, m, d.getUTCDate()) - (d.getUTCDay() * 86400000);
        return t;
    }
    return y + '-' + m + '-' + d.getUTCDate();
}
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

/* The smoothing family is an input in every serious platform: an RMA-based
   RSI and an SMA-based one disagree, and a trader needs to say which they
   mean rather than inherit ours. */
const MA_TYPES = ['SMA', 'EMA', 'WMA', 'RMA'];
function smooth(v, n, type) {
    if (type === 'EMA') return expAvg(v, n);
    if (type === 'RMA') return rmaAvg(v, n);
    if (type === 'WMA') return wmaAvg(v, n);
    return movingAvg(v, n);
}
function rmaAvg(v, n) {
    const out = new Array(v.length).fill(null);
    let prev = null;
    for (let i = 0; i < v.length; i++) {
        prev = prev === null ? v[i] : (prev * (n - 1) + v[i]) / n;
        if (i >= n - 1) out[i] = prev;
    }
    return out;
}
function wmaAvg(v, n) {
    const out = new Array(v.length).fill(null);
    const denom = n * (n + 1) / 2;
    for (let i = n - 1; i < v.length; i++) {
        let acc = 0;
        for (let k = 0; k < n; k++) acc += v[i - k] * (n - k);
        out[i] = acc / denom;
    }
    return out;
}

// Shift a plot forward or back in time, the way TradingView's Offset does.
function shift(arr, by) {
    if (!by) return arr;
    const out = new Array(arr.length).fill(null);
    for (let i = 0; i < arr.length; i++) {
        const j = i - by;
        if (j >= 0 && j < arr.length) out[i] = arr[j];
    }
    return out;
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

function makeLine(pane, st, kind) {
    const opts = lineOpts(st);
    const lower = pane === 'lower';
    if (lower) opts.priceScaleId = 'ind-lower';
    let sref;
    if (kind === 'histogram') {
        // A histogram takes a colour, not a line width, and each bar is
        // coloured by its own sign at paint time.
        sref = chart.addHistogramSeries({
            color: st.color, priceScaleId: opts.priceScaleId,
            priceLineVisible: false, lastValueVisible: false,
            visible: st.visible !== false
        });
    } else {
        sref = chart.addLineSeries(opts);
    }
    if (lower) chart.priceScale('ind-lower').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    return sref;
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
        item.kinds = (def && def.kinds) || [];
        item.lines.push(makeLine(def ? def.pane : 'price', st, item.kinds[i]));
    }
    activeInd.push(item);
    renderIndicatorList();
    saveIndicators();
    refreshIndicators(lastPainted);
    return item;
}

/* Clicking a study has to LOOK like it did something, or people click again
   and again wondering whether they missed. The selected study's plots thicken
   and its row in the top-left list is marked; everything else is untouched. */
let selInd = null;

function applyLineStyle(item, i) {
    const st = item.styles[i];
    const on = item.id === selInd;
    try {
        item.lines[i].applyOptions((item.kinds || [])[i] === 'histogram'
            ? { color: st.color, visible: st.visible !== false }
            : Object.assign(lineOpts(st), on
                ? { lineWidth: Math.min(4, (+st.width || 2) + 1), crosshairMarkerVisible: true }
                : {}));
    } catch (e) {}
}

function selectIndicator(id) {
    if (selInd === id) return;
    const was = selInd;
    selInd = id;
    activeInd.forEach(a => {
        if (a.id === was || a.id === id) a.lines.forEach((_, i) => applyLineStyle(a, i));
    });
    renderLegend();
}

function removeIndicator(id) {
    const i = activeInd.findIndex(a => a.id === id);
    if (i < 0) return;
    activeInd[i].lines.forEach(l => { try { chart.removeSeries(l); } catch (e) {} });
    if (selInd === id) selInd = null;
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
            let vals = sets[li] || [];
            const off = +a.params.offset || 0;
            if (off) vals = shift(vals, off);
            const hist = (a.kinds || [])[li] === 'histogram';
            const up = a.styles[li].color;
            const dn = a.styles[li].colorDown || '#ef454a';
            line.setData(data
                .map((b, i) => {
                    const v = vals[i];
                    if (v === null || v === undefined || !isFinite(v)) return null;
                    return hist ? { time: b.time, value: v, color: v >= 0 ? up : dn }
                                : { time: b.time, value: v };
                })
                .filter(Boolean));
        });
        // Keep the computed values so a double-click on the LINE can find
        // which indicator it landed on, not only a click on the legend.
        a.plot = sets.map(vals => data.map((b, i) => ({ t: b.time, v: vals[i] })));
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
        '<span class="tf">' + venueName() + '</span>' +
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
    // Fold with a class, never by emptying: removing the rows collapsed the
    // block and shifted everything around it.
    box.classList.toggle('folded', legendCollapsed);

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
        return '<div class="rp-leg-row' + (a.hidden ? ' off' : '') +
                 (a.id === selInd ? ' sel' : '') + '" data-leg="' + a.id + '">' +
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
    box.querySelectorAll('.rp-leg-row').forEach(row => {
        row.addEventListener('click', e => {
            if (e.target.closest('button')) return;
            /* Stop here. Selecting re-renders the legend, which detaches this
               node — and a detached target makes the chart's own click guard
               (`closest('.rp-legend-wrap')`) miss, so the click read as a
               click on empty chart and cleared the selection again. */
            e.stopPropagation();
            selectIndicator(+row.dataset.leg);
        });
        row.addEventListener('dblclick', e => {
            e.stopPropagation();
            openIndSettings(+row.dataset.leg);
        });
    });
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
            if (def.params.smoothK !== undefined) h += num('smoothK', '%K smoothing', 1, 50);
            if (def.params.upper !== undefined)  h += num('upper', 'Upper band', 1, 100);
            if (def.params.lower !== undefined)  h += num('lower', 'Lower band', 0, 99);
            if (def.params.maType !== undefined) {
                h += row('Smoothing', '<select data-p="maType">' + MA_TYPES.map(o =>
                    '<option value="' + o + '"' + (a.params.maType === o ? ' selected' : '') +
                    '>' + o + '</option>').join('') + '</select>');
            }
            if (def.params.anchor !== undefined) {
                h += row('Anchor period', '<select data-p="anchor">' + ANCHORS.map(o =>
                    '<option value="' + o + '"' + (a.params.anchor === o ? ' selected' : '') +
                    '>' + o[0].toUpperCase() + o.slice(1) + '</option>').join('') + '</select>');
            }
            if (def.src) {
                h += row('Source', '<select data-p="source">' + SOURCES.map(o =>
                    '<option value="' + o + '"' + (a.params.source === o ? ' selected' : '') +
                    '>' + o + '</option>').join('') + '</select>');
            }
            [1, 2, 3].forEach(n => {
                if (def.params['b' + n] === undefined) return;
                h += '<div class="rp-set-row wide"><label class="chk">' +
                     '<input type="checkbox" data-p="b' + n + '"' +
                     (a.params['b' + n] ? ' checked' : '') + '> Band ' + n + '</label>' +
                     '<input type="number" min="0.1" max="10" step="0.1" data-p="b' + n + 'm" value="' +
                     a.params['b' + n + 'm'] + '"></div>';
            });
            // Offset applies to every study, so it is added once at the end
            // rather than declared on each of them.
            h += row('Offset (bars)', '<input type="number" min="-500" max="500" data-p="offset" value="' +
                     (a.params.offset || 0) + '">');
            if (!h) h = '<p class="rp-hint">This indicator has no inputs to configure.</p>';
        }
        box.innerHTML = h;
        box.querySelectorAll('[data-p]').forEach(inp =>
            inp.addEventListener('input', () => {
                const v = inp.type === 'checkbox' ? inp.checked
                        : inp.type === 'number' ? +inp.value : inp.value;
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
        // A drawn position is a second route to a trade, so it meets the same
        // gate as the ticket's Buy and Sell buttons. Guarding the entry point
        // rather than the buttons covers every path into it.
        if (locked) { upsell(); return; }
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

    fromDrawing(d, announce) {
        slMode = 'price';
        segSet('rp-slmode', 'sl', 'price');
        $('rp-stop').value = d.stop.toFixed(pdp());
        if (d.target !== null && d.target !== undefined) $('rp-target').value = d.target.toFixed(pdp());
        const mark = currentPrice();
        // An entry away from the market is a resting order in either mode —
        // this used to be gated on replay, so on the live chart the drawn
        // entry was quietly ignored and the ticket stayed at market.
        if (mark !== null && Math.abs(d.entry - mark) / mark > 0.00005) {
            otype = 'limit';
            segSet('rp-otype', 'otype', 'limit');
            $('rp-price-row').hidden = false;
            $('rp-price').value = d.entry.toFixed(pdp());
        }
        updateTicket();
        if (announce) {
            const panel = $('rp-trade');
            panel.classList.remove('flash');
            void panel.offsetWidth;              // restart the animation
            panel.classList.add('flash');
            status('Entry, stop and target copied to the order panel.');
            setTimeout(hideStatus, 2400);
        }
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

/* The last 24 hours of whatever is loaded: close, change against the bar a day
   earlier, the range, and the tick volume across it. Returns null rather than
   guessing when there is not enough history to span a day. */
function window24(hist) {
    if (!hist || !hist.length) return null;
    const last = hist[hist.length - 1];
    const cutoff = last.time - 86400;              // seconds, as the chart uses
    let i = hist.length - 1;
    while (i > 0 && hist[i - 1].time >= cutoff) i--;
    const from = hist[i];
    let high = -Infinity, low = Infinity, vol = 0;
    for (let k = i; k < hist.length; k++) {
        if (hist[k].high > high) high = hist[k].high;
        if (hist[k].low < low) low = hist[k].low;
        vol += hist[k].volume || 0;
    }
    const base = from.open || from.close;
    const chg = last.close - base;
    return { close: last.close, chg: chg,
             chgPct: base ? chg / base * 100 : 0,
             high: high, low: low, vol: vol };
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
    if (S.market !== 'crypto') {
        /* Binance hands over a ready-made 24-hour summary; our own files do
           not, so it is measured here from the bars already loaded. It used to
           compare the last two BARS, which on a 5-minute chart put a
           five-minute move under a heading that said 24H CHANGE, and printed
           the literal word "daily" where the absolute change belongs. */
        const w = window24(S.hist);
        el.textContent = w ? px(w.close) : '—';
        el.className = w && w.chg >= 0 ? 'val-pos' : 'val-neg';
        $('rp-tk-chg').textContent = w
            ? (w.chg >= 0 ? '+' : '') + fmt(w.chgPct, 2) + '%' : '—';
        $('rp-tk-chg').className = 'rp-tk-chg ' + (w && w.chg >= 0 ? 'val-pos' : 'val-neg');
        $('rp-tk-chgabs').textContent = w ? (w.chg >= 0 ? '+' : '') + px(w.chg) : '—';
        $('rp-tk-chgabs').className = w && w.chg >= 0 ? 'val-pos' : 'val-neg';
        $('rp-tk-high').textContent = w ? px(w.high) : '—';
        $('rp-tk-low').textContent = w ? px(w.low) : '—';
        // Forex has no central exchange and therefore no true traded volume.
        // What the feed carries is TICK volume — how many times the price was
        // quoted — which is what every platform shows here and what the
        // volume-weighted studies use. Turnover genuinely does not exist.
        $('rp-tk-vol').textContent = w && w.vol ? compact(w.vol) + ' ticks' : '—';
        return;
    }
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
    const venue = S.market === 'fx' ? 'ECB daily reference'
                : S.market === 'hosted' ? 'Dukascopy · 1-minute'
                : 'Binance · Spot';
    $('rp-tk-venue').textContent = replay ? 'Replay · historical' : venue;
    /* Turnover is a number an exchange can produce because every trade goes
       through it. Forex has no central exchange, so there is no turnover to
       report — an empty field forever is worse than no field. */
    const turnCell = $('rp-tk-turn') && $('rp-tk-turn').parentElement;
    if (turnCell) turnCell.hidden = S.market !== 'crypto';
    const volCell = $('rp-tk-vol') && $('rp-tk-vol').parentElement;
    if (volCell) volCell.querySelector('span').textContent =
        S.market === 'crypto' ? '24H Volume' : '24H Ticks';
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
    const has = s.n > 0;
    const ret = (S.balance - S.startBalance) / S.startBalance * 100;

    // ---- one headline figure
    $('rp-hero').innerHTML =
        '<div class="rp-hero-main">' +
          '<span class="rp-hero-label">Net profit and loss</span>' +
          '<span class="rp-hero-value ' + (s.net >= 0 ? 'val-pos' : 'val-neg') + '">' +
            (has ? signed(s.net) : '—') + '</span>' +
          '<span class="rp-hero-sub">' + money(S.startBalance) + ' &rarr; ' +
            money(S.balance) + '  (' + (ret >= 0 ? '+' : '') + fmt(ret, 2) + '%)</span>' +
        '</div>' +
        '<div class="rp-hero-right">' +
          '<span>' + s.n + (s.n === 1 ? ' trade' : ' trades') + ' &middot; ' +
            S.symbol + ' ' + TF_LABEL[S.tfMin] + '</span>' +
          '<b class="' + (s.winRate >= 50 ? 'val-pos' : '') + '">' +
            (has ? fmt(s.winRate, 1) + '% win rate' : '—') + '</b>' +
        '</div>';

    // ---- the seven that decide whether a system is worth trading
    const sharpe = sharpeOf(S.trades.filter(t => t.closedAt));
    const kpi = (label, value, sub, tone) =>
        '<div class="rp-kpi">' +
          '<span class="rp-kpi-label">' + label + '</span>' +
          '<span class="rp-kpi-value ' + (tone || '') + '">' + value + '</span>' +
          '<span class="rp-kpi-sub">' + sub + '</span>' +
        '</div>';
    $('rp-kpis').innerHTML =
        kpi('Profit factor', has ? (s.pf === Infinity ? '∞' : fmt(s.pf, 2)) : '—',
            'gross win / gross loss', has && s.pf >= 1 ? 'val-pos' : has ? 'val-neg' : '') +
        kpi('Max drawdown', has ? fmt(S.maxDD, 1) + '%' : '—', 'peak to trough', 'val-neg') +
        kpi('Expectancy', has ? signed(s.expectancy) : '—', 'per trade',
            s.expectancy >= 0 ? 'val-pos' : 'val-neg') +
        kpi('Average R', has ? (s.avgR >= 0 ? '+' : '') + fmt(s.avgR, 2) + 'R' : '—',
            'risk multiples', s.avgR >= 0 ? 'val-pos' : 'val-neg') +
        kpi('Sharpe', sharpe === null ? '—' : fmt(sharpe, 2),
            sharpe === null ? 'needs 5+ trades' : 'risk-adjusted') +
        kpi('Avg win', has ? money(s.avgWin) : '—', 'per winning trade', 'val-pos') +
        kpi('Avg loss', has ? money(s.avgLoss) : '—', 'per losing trade', 'val-neg');

    // ---- supporting detail
    const h = m => {
        if (!m) return '—';
        const d = Math.floor(m / 86400), hh = Math.floor(m % 86400 / 3600), mm = Math.floor(m % 3600 / 60);
        return (d ? d + 'd ' : '') + (hh ? hh + 'h ' : '') + (d ? '' : mm + 'm');
    };
    const cell = (label, value, cls) =>
        '<div><span>' + label + '</span><b class="' + (cls || '') + '">' + value + '</b></div>';
    $('rp-metrics').innerHTML =
        cell('Wins', has ? s.wins : '—', 'val-pos') +
        cell('Losses', has ? s.losses : '—', 'val-neg') +
        cell('Gross profit', has ? money(s.gross) : '—', 'val-pos') +
        cell('Gross loss', has ? money(s.loss) : '—', 'val-neg') +
        cell('Best trade', has ? signed(s.bestWin) : '—', 'val-pos') +
        cell('Worst trade', has ? signed(s.worstLoss) : '—', 'val-neg') +
        cell('Win streak', has ? s.bestStreak : '—') +
        cell('Loss streak', has ? s.worstStreak : '—') +
        cell('Max DD ($)', has ? money(S.maxDDAbs) : '—', 'val-neg') +
        cell('Avg hold', has ? h(s.avgHold) : '—') +
        cell('Fees paid', has ? money(s.fees) : '—') +
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
    { type: 'vwap', name: 'VWAP with bands', short: 'VWAP',
      desc: 'Anchored volume-weighted average with three deviation band pairs.',
      tags: 'vwap volume weighted average price session anchor bands deviation' },
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


/* ------------------------------------------------------------ PDF report

   Built as a print document rather than through a PDF library: the browser's
   own "Save as PDF" already produces a proper, selectable, vector PDF, and
   this way the report is laid out in the same CSS as everything else instead
   of being re-implemented in drawing primitives. It follows the Backtest
   Machine report exactly — one hero figure, the KPI row, equity and drawdown,
   monthly bars, R distribution, then the trade log — so a replay session and
   a submitted system read as the same document. */

function svgArea(data, opts) {
    opts = opts || {};
    const W = 720, H = opts.height || 170, pad = 26;
    if (!data || data.length < 2) return '<p class="pr-empty">Not enough data.</p>';
    const vals = data.map(d => d.v);
    let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (opts.below) hi = Math.max(hi, 0);
    if (lo === hi) { lo -= 1; hi += 1; }
    const X = i => pad + i / (data.length - 1) * (W - pad * 2);
    const Y = v => H - pad - (v - lo) / (hi - lo) * (H - pad * 2);
    const line = data.map((d, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(d.v).toFixed(1)).join(' ');
    const base = opts.below ? Y(0) : H - pad;
    const col = opts.colour || '#20b26c';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="pr-chart">' +
        '<path d="' + line + ' L' + X(data.length - 1).toFixed(1) + ' ' + base.toFixed(1) +
          ' L' + X(0).toFixed(1) + ' ' + base.toFixed(1) + ' Z" fill="' + col + '" opacity=".16"/>' +
        '<path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="2"/>' +
        '<text x="' + pad + '" y="14" class="pr-ax">' + (opts.fmt ? opts.fmt(hi) : hi.toFixed(0)) + '</text>' +
        '<text x="' + pad + '" y="' + (H - 6) + '" class="pr-ax">' +
          (opts.fmt ? opts.fmt(lo) : lo.toFixed(0)) + '</text>' +
        '</svg>';
}

function svgBars(data, opts) {
    opts = opts || {};
    const W = 720, H = 150, pad = 26;
    if (!data || !data.length) return '<p class="pr-empty">Not enough data.</p>';
    const vals = data.map(d => d.v);
    const hi = Math.max.apply(null, vals.concat([0]));
    const lo = Math.min.apply(null, vals.concat([0]));
    const span = (hi - lo) || 1;
    const zero = H - pad - (0 - lo) / span * (H - pad * 2);
    const bw = (W - pad * 2) / data.length * 0.62;
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="pr-chart">' +
        '<line x1="' + pad + '" y1="' + zero.toFixed(1) + '" x2="' + (W - pad) +
          '" y2="' + zero.toFixed(1) + '" stroke="rgba(255,255,255,.16)" stroke-width="1"/>' +
        data.map((d, i) => {
            const cx = pad + (i + 0.5) / data.length * (W - pad * 2);
            const y = H - pad - (d.v - lo) / span * (H - pad * 2);
            const top = Math.min(y, zero), h = Math.abs(y - zero) || 1;
            const col = opts.single || (d.v >= 0 ? '#20b26c' : '#ef454a');
            return '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + top.toFixed(1) +
                   '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) +
                   '" fill="' + col + '" rx="2"/>' +
                   '<text x="' + cx.toFixed(1) + '" y="' + (H - 8) +
                   '" class="pr-ax mid">' + d.t + '</text>';
        }).join('') + '</svg>';
}

function buildPrintReport() {
    const m = buildReport();
    const st = stats();
    const esc = t => String(t == null ? '' : t).replace(/[&<>]/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const mny = v => (v < 0 ? '-$' : '$') +
        Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const kpi = (l, v, sub, tone) =>
        '<div class="pr-kpi"><span class="pr-kl">' + l + '</span>' +
        '<span class="pr-kv ' + (tone || '') + '">' + v + '</span>' +
        '<span class="pr-ks">' + sub + '</span></div>';

    const rows = (m.trades || []).slice(0, 300).map((t, i) =>
        '<tr><td>' + (i + 1) + '</td><td>' + esc(t.symbol) + '</td><td>' + esc(t.side) +
        '</td><td class="n">' + t.entry + '</td><td class="n">' + t.exit +
        '</td><td class="n ' + (t.r >= 0 ? 'pos' : 'neg') + '">' + (t.r >= 0 ? '+' : '') + t.r.toFixed(2) +
        'R</td><td class="n ' + (t.pnl >= 0 ? 'pos' : 'neg') + '">' + mny(t.pnl) + '</td></tr>').join('');

    return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<title>BarTest Replay — ' + esc(m.symbol) + ' ' + esc(m.timeframe) + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">' +
    '<style>' +
    '@page{size:A4;margin:12mm}' +
    // Print the terminal's own palette rather than a white document — and
    // force the backgrounds through, which browsers strip from printouts by
    // default.
    '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    'body{font-family:"IBM Plex Sans",system-ui,sans-serif;color:#eaecef;margin:0;font-size:11px;' +
      'background:#0b0e11}' +
    '.pr-head{display:flex;align-items:flex-start;gap:16px;padding-bottom:12px;' +
      'border-bottom:2px solid #f7a600}' +
    '.pr-mark{width:34px;height:34px;border-radius:9px;background:#f7a600;display:grid;place-items:center;' +
      'color:#1a1200;font-weight:700;font-size:15px;flex:0 0 auto}' +
    '.pr-head h1{margin:0;font-size:19px;letter-spacing:-.3px;color:#fff}' +
    '.pr-head p{margin:3px 0 0;color:#929aa5;font-size:11px}' +
    '.pr-head .right{margin-left:auto;text-align:right;color:#929aa5;font-size:10px;line-height:1.6}' +
    '.pr-head .right b{color:#f7a600}' +
    '.pr-hero{display:flex;align-items:baseline;gap:20px;margin:16px 0 14px;padding:15px 17px;' +
      'background:#16181e;border:1px solid rgba(255,255,255,.08);border-radius:8px}' +
    '.pr-hero .v{font-size:34px;font-weight:700;line-height:1}' +
    '.pr-hero .s{color:#929aa5;font-size:12px}' +
    '.pr-hero .r{margin-left:auto;text-align:right}' +
    '.pr-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}' +
    '.pr-kpi{background:#16181e;border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:9px 11px}' +
    '.pr-kl{display:block;font-size:9px;letter-spacing:.9px;text-transform:uppercase;color:#61686f;font-weight:600}' +
    '.pr-kv{display:block;font-size:17px;font-weight:700;margin:3px 0 1px;color:#eaecef}' +
    '.pr-ks{display:block;font-size:9px;color:#61686f}' +
    'h2{font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#61686f;' +
      'margin:18px 0 7px;border-bottom:1px solid rgba(255,255,255,.09);padding-bottom:5px}' +
    '.pr-chart{width:100%;height:auto;display:block;background:#0e1116;border-radius:6px;' +
      'border:1px solid rgba(255,255,255,.07)}' +
    '.pr-ax{font-size:9px;fill:#61686f}.pr-ax.mid{text-anchor:middle}' +
    '.pr-empty{color:#61686f;font-size:11px;margin:6px 0}' +
    'table{width:100%;border-collapse:collapse;font-size:10px}' +
    'th{text-align:left;font-size:9px;letter-spacing:.8px;text-transform:uppercase;color:#61686f;' +
      'border-bottom:1px solid rgba(255,255,255,.14);padding:5px 6px}' +
    'td{padding:4px 6px;border-bottom:1px solid rgba(255,255,255,.05);color:#929aa5}' +
    'td.n{text-align:right;font-variant-numeric:tabular-nums}' +
    '.pos{color:#20b26c}.neg{color:#ef454a}' +
    '.pr-foot{margin-top:18px;padding-top:10px;border-top:1px solid rgba(255,255,255,.09);' +
      'color:#61686f;font-size:9px;line-height:1.6}' +
    '@media print{.pr-noprint{display:none}}' +
    '.pr-noprint{position:fixed;top:12px;right:12px;background:#f7a600;color:#14171c;border:none;' +
      'border-radius:6px;padding:9px 16px;font:inherit;font-weight:700;cursor:pointer;font-size:12px}' +
    '</style></head><body>' +

    '<button class="pr-noprint" onclick="window.print()">Save as PDF</button>' +

    '<div class="pr-head"><div class="pr-mark">B</div>' +
      '<div><h1>' + esc(m.symbol) + ' &middot; ' + esc(m.timeframe) + '</h1>' +
      '<p>Replay session &middot; ' + esc(m.venue) + ' &middot; ' +
        (m.periodStart ? esc(m.periodStart) + ' → ' + esc(m.periodEnd) : 'no closed trades') + '</p></div>' +
      '<div class="right"><b>BarTest Replay</b><br>Generated ' +
        new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) +
        '<br>Fees ' + S.feeBps + ' bps both sides</div></div>' +

    '<div class="pr-hero"><div><div class="v ' + (m.netReturnPct >= 0 ? 'pos' : 'neg') + '">' +
      (m.netReturnPct >= 0 ? '+' : '') + m.netReturnPct.toFixed(2) + '%</div>' +
      '<div class="s">' + mny(m.startBalance) + ' → ' + mny(m.endBalance) + '</div></div>' +
      '<div class="r"><div class="v">' + m.totalTrades + '</div>' +
      '<div class="s">' + (m.totalTrades === 1 ? 'trade' : 'trades') + ' &middot; ' +
        m.winRatePct.toFixed(1) + '% win rate</div></div></div>' +

    '<div class="pr-kpis">' +
      kpi('Profit factor', m.profitFactor === null ? '∞' : m.profitFactor.toFixed(2),
          'gross win / gross loss', m.profitFactor >= 1 ? 'pos' : 'neg') +
      kpi('Max drawdown', m.maxDrawdownPct.toFixed(2) + '%', 'peak to trough', 'neg') +
      kpi('Expectancy', mny(m.expectancy), 'per trade', m.expectancy >= 0 ? 'pos' : 'neg') +
      kpi('Sharpe', m.sharpe === null ? '—' : m.sharpe.toFixed(2),
          m.sharpe === null ? 'needs 5+ trades' : 'risk-adjusted') +
      kpi('Average win', mny(m.avgWin), 'per winning trade', 'pos') +
      kpi('Average loss', mny(m.avgLoss), 'per losing trade', 'neg') +
      kpi('Worst streak', m.longestLossStreak, 'consecutive losses') +
      kpi('Fees paid', mny(m.feesPaid), 'both sides') +
    '</div>' +

    '<h2>Equity</h2>' + svgArea(m.equity, { fmt: v => mny(v) }) +
    '<h2>Drawdown</h2>' + svgArea(m.drawdown, { colour: '#ef454a', below: true, height: 140,
        fmt: v => v.toFixed(1) + '%' }) +
    '<h2>Monthly return</h2>' + svgBars(m.monthly) +
    '<h2>R-multiple distribution</h2>' + svgBars(m.rBuckets, { single: '#5aa9f0' }) +
    '<h2>Trade log' + (m.trades.length > 300 ? ' (first 300 of ' + m.trades.length + ')' : '') + '</h2>' +
    (rows ? '<table><thead><tr><th>#</th><th>Symbol</th><th>Side</th><th class="n">Opened</th>' +
      '<th class="n">Closed</th><th class="n">R</th><th class="n">P&amp;L</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>'
          : '<p class="pr-empty">No closed trades.</p>') +

    '<div class="pr-foot">Simulated results from historical replay on ' + esc(m.venue) +
      ' data. Fills are stepped through 1-minute bars and, where a single minute ' +
      'touches both the stop and the target, the stop is taken first. Both sides of ' +
      'every trade are charged ' + S.feeBps + ' bps. Simulated performance does not ' +
      'establish that a system will behave the same way traded live.</div>' +

    '</body></html>';
}

/* The chart and the drawings live on separate canvases stacked on top of one
   another, so a snapshot has to composite them rather than grab either one. */
function saveChartImage() {
    try {
        const wrap = $('rp-chart-wrap');
        const src = wrap.querySelectorAll('canvas');
        const out = document.createElement('canvas');
        const r = wrap.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        out.width = Math.round(r.width * dpr);
        out.height = Math.round(r.height * dpr);
        const g = out.getContext('2d');
        g.fillStyle = theme.bg;
        g.fillRect(0, 0, out.width, out.height);
        src.forEach(c => {
            const cr = c.getBoundingClientRect();
            try {
                g.drawImage(c, Math.round((cr.left - r.left) * dpr), Math.round((cr.top - r.top) * dpr),
                            Math.round(cr.width * dpr), Math.round(cr.height * dpr));
            } catch (e) {}
        });
        out.toBlob(b => {
            if (!b) return;
            const url = URL.createObjectURL(b);
            const a = document.createElement('a');
            a.href = url; a.download = 'bartest-' + stamp() + '.png';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        });
    } catch (e) { status('Could not capture the chart.', 'error'); setTimeout(hideStatus, 2600); }
}

function exportPdf() {
    const w = window.open('', '_blank');
    if (!w) { status('Allow pop-ups to open the report.', 'error'); setTimeout(hideStatus, 3200); return; }
    w.document.write(buildPrintReport());
    w.document.close();
    // Let the webfont and the SVG land before the print dialog measures it.
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 700);
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
        label: S.symbol + ' ' + TF_LABEL[S.tfMin] + '  ' + S.trades.length +
               (S.trades.length === 1 ? ' trade  ' : ' trades  ') +
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

/* Saved sessions are the trader's own record — they must be removable one by
   one and in bulk, or the list becomes a drawer nobody can tidy. */
async function deleteSession(id) {
    const all = listSessions();
    const one = all.find(x => x.id === id);
    if (!one) return;
    if (!await ask('Delete this session?', one.label +
        '\n\nThis cannot be undone. Export it first if you want to keep the record.',
        'Delete')) return;
    try { localStorage.setItem(SESS_KEY, JSON.stringify(all.filter(x => x.id !== id))); }
    catch (e) {}
    status('Session deleted.'); setTimeout(hideStatus, 2200);
}

async function wipeSessions() {
    const n = listSessions().length;
    if (!n) return;
    if (!await ask('Delete all saved sessions?',
        'All ' + n + ' saved sessions are removed from this browser. ' +
        'This cannot be undone.', 'Delete all')) return;
    try { localStorage.removeItem(SESS_KEY); } catch (e) {}
    status('All saved sessions deleted.'); setTimeout(hideStatus, 2200);
}

/* Two verbs, two buttons. Saving a session and exporting its results are
   different intentions and were sharing one menu, so neither was obvious. */
function openSessionMenu(anchor) {
    const sessions = listSessions();
    popMenu(anchor,
        '<div class="rp-menu">' +
          '<button data-x="save"><i class="fa-solid fa-floppy-disk"></i>' +
            '<span>Save this session</span></button>' +
        '</div>' +
        (sessions.length
            ? '<h5>Saved sessions</h5><div class="rp-menu">' + sessions.map(x =>
                '<div class="rp-sess-row">' +
                  '<button data-load="' + x.id + '"><i class="fa-solid fa-clock-rotate-left"></i>' +
                  '<span>' + x.label + '</span></button>' +
                  '<button class="rp-sess-del" data-del="' + x.id + '" ' +
                    'title="Delete this session"><i class="fa-solid fa-trash-can"></i></button>' +
                '</div>').join('') + '</div>' +
              '<div class="rp-menu rp-pop-foot"><button data-x="wipe">' +
                '<i class="fa-solid fa-broom"></i><span>Delete all saved sessions</span>' +
              '</button></div>'
            : '<div class="rp-pop-note">Nothing saved yet. A session keeps your ' +
              'trades, orders and balance so you can pick the run back up later.</div>'));
}

function openExportMenu(anchor) {
    popMenu(anchor,
        '<div class="rp-menu">' +
          '<button data-x="pdf"><i class="fa-regular fa-file-pdf"></i>' +
            '<span>Performance report (PDF)</span></button>' +
          '<button data-x="csv"><i class="fa-solid fa-table"></i>' +
            '<span>Trade log (CSV)</span></button>' +
          '<button data-x="report"><i class="fa-solid fa-code"></i>' +
            '<span>Raw data (JSON)</span></button>' +
        '</div>');
}

function popMenu(anchor, html) {
    document.querySelectorAll('.rp-pop').forEach(n => n.remove());
    const pop = document.createElement('div');
    pop.className = 'rp-pop rp-export-pop';
    pop.innerHTML = html;
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
        if (x === 'pdf') exportPdf();
        if (x === 'report') download('bartest-report-' + stamp() + '.json',
            JSON.stringify(buildReport(), null, 2), 'application/json');
        if (x === 'csv') download('bartest-trades-' + stamp() + '.csv',
            tradesCsv(), 'text/csv;charset=utf-8');
        if (x === 'save') saveSession();
        if (x === 'wipe') { close(); wipeSessions(); return; }
        close();
    }));
    pop.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        close();
        deleteSession(+b.dataset.del);
    }));
    pop.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', () => {
        loadSession(+b.dataset.load); close();
    }));
}


/* ------------------------------------------------------- chart layouts ---

   A layout is how the chart LOOKS and what is on it — instrument, timeframe,
   theme, indicators and drawings. It is deliberately separate from a saved
   session, which is what you DID: the trades, orders and balance. People
   reuse a layout every day and archive a session once.

   Both live in this browser's storage. Carrying them between machines needs
   an account, which needs the sign-in the marketing site already has a
   backend for — that is a wiring job, not something to fake with a menu. */

const LAYOUT_KEY = 'bt.replay.layouts';
function listLayouts() {
    try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) || '[]'); } catch (e) { return []; }
}
function writeLayouts(all) {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(all.slice(0, 30))); return true; }
    catch (e) { status('Could not save — browser storage is full or blocked.', 'error'); return false; }
}

function saveLayout(name) {
    const all = listLayouts().filter(x => x.name !== name);
    all.unshift({
        id: Date.now(), name: name,
        symbol: S.symbol, tfMin: S.tfMin, market: S.market,
        theme: Object.assign({}, theme),
        drawings: window.BTTools ? BTTools.serialize() : [],
        indicators: activeInd.map(a => ({ type: a.type, params: a.params, code: a.code, styles: a.styles })),
        at: new Date().toISOString()
    });
    if (!writeLayouts(all)) return;
    status('Layout "' + name + '" saved.');
    setTimeout(hideStatus, 2400);
}

async function applyLayout(id) {
    const L = listLayouts().find(x => x.id === id);
    if (!L) return;
    theme = Object.assign({}, THEME_DEFAULT, L.theme || {});
    syncThemeInputs(); saveTheme();
    $('rp-tf').value = String(L.tfMin);
    S.market = L.market || 'crypto';
    S.symbol = L.symbol;
    syncTimeframes();
    syncInstButton();
    $('rp-tk-icon').textContent = L.symbol.charAt(0);

    pendingLayout = L;      // drawings and indicators land after the data does
    rebuildSeries(); applyTheme();
    await loadChart();
    status('Layout "' + L.name + '" loaded.');
    setTimeout(hideStatus, 2400);
}

let pendingLayout = null;

async function deleteLayout(id) {
    const all = listLayouts();
    const one = all.find(x => x.id === id);
    if (!one) return;
    if (!await ask('Delete this layout?', '"' + one.name + '" is removed from this browser. ' +
        'Your trades and saved sessions are untouched.', 'Delete')) return;
    writeLayouts(all.filter(x => x.id !== id));
    status('Layout deleted.'); setTimeout(hideStatus, 2200);
}

function openLayoutMenu(anchor) {
    document.querySelectorAll('.rp-pop').forEach(n => n.remove());
    const all = listLayouts();
    const pop = document.createElement('div');
    pop.className = 'rp-pop rp-export-pop';
    pop.innerHTML =
        '<h5>Save this chart</h5>' +
        '<input class="rp-layout-name" id="rp-layout-name" placeholder="Layout name" ' +
          'value="' + (S.symbol + ' ' + TF_LABEL[S.tfMin]) + '" autocomplete="off">' +
        '<div class="rp-menu"><button data-save><i class="fa-solid fa-floppy-disk"></i>' +
          '<span>Save layout</span></button></div>' +
        (all.length
            ? '<h5>Your layouts</h5><div class="rp-menu">' + all.map(x =>
                '<div class="rp-sess-row">' +
                  '<button data-load="' + x.id + '"><i class="fa-regular fa-image"></i><span>' +
                    x.name.replace(/</g, '&lt;') + '</span></button>' +
                  '<button class="rp-sess-del" data-del="' + x.id + '" title="Delete">' +
                    '<i class="fa-solid fa-trash-can"></i></button>' +
                '</div>').join('') + '</div>'
            : '') +
        '<div class="rp-pop-note"><b>Saved in this browser.</b> Layouts follow the ' +
        'device, not you — signing in to carry them between machines is not built yet.</div>';
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left)) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';

    const close = () => { pop.remove(); document.removeEventListener('mousedown', out); };
    function out(e) { if (!pop.contains(e.target) && e.target !== anchor) close(); }
    setTimeout(() => document.addEventListener('mousedown', out), 0);

    pop.querySelector('[data-save]').addEventListener('click', () => {
        const n = (pop.querySelector('#rp-layout-name').value || '').trim();
        if (!n) return;
        saveLayout(n); close();
    });
    pop.querySelectorAll('[data-load]').forEach(b =>
        b.addEventListener('click', () => { close(); applyLayout(+b.dataset.load); }));
    pop.querySelectorAll('[data-del]').forEach(b =>
        b.addEventListener('click', e => { e.stopPropagation(); close(); deleteLayout(+b.dataset.del); }));
}


/* ------------------------------------------------------------- the guide

   Written as steps rather than a feature list, because the questions people
   actually arrive with are "how do I replay this" and "how big should this
   trade be" — not "what does that icon do". Each topic ends with the thing
   that is easy to get wrong. */

const GUIDE_ICON = {
    replay: '<circle cx="12" cy="12" r="9" fill="none" stroke="#f7a600" stroke-width="1.8"/>' +
            '<path d="M10 8.5l5 3.5-5 3.5z" fill="#20b26c"/>',
    trade:  '<path d="M3 17l5-6 4 3 8-9" fill="none" stroke="#20b26c" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="11" r="2" fill="#f7a600"/>',
    size:   '<rect x="3" y="4" width="18" height="7" rx="1.5" fill="#20b26c" opacity=".35"/>' +
            '<rect x="3" y="13" width="18" height="7" rx="1.5" fill="#ef454a" opacity=".35"/>' +
            '<path d="M3 12h18" stroke="#f7a600" stroke-width="2"/>',
    tools:  '<path d="M4 20L20 4" stroke="#5aa9f0" stroke-width="2" stroke-linecap="round"/>' +
            '<path d="M12 3l1.6 3.4L17 8l-3.4 1.6L12 13l-1.6-3.4L7 8l3.4-1.6z" fill="#f7a600"/>',
    ind:    '<path d="M3 16l5-7 4 4 6-9" fill="none" stroke="#5aa9f0" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round"/><path d="M3 21h18" stroke="#c58af0" stroke-width="2"/>',
    save:   '<path d="M4 4h12l4 4v12H4z" fill="none" stroke="#5aa9f0" stroke-width="1.8" ' +
            'stroke-linejoin="round"/><rect x="8" y="4" width="7" height="5" fill="#f7a600"/>' +
            '<rect x="8" y="13" width="8" height="7" fill="#20b26c" opacity=".8"/>',
    report: '<path d="M5 3h9l5 5v13H5z" fill="none" stroke="#5aa9f0" stroke-width="1.8" ' +
            'stroke-linejoin="round"/><path d="M8 13h3v5H8zM13 10h3v8h-3z" fill="#20b26c"/>',
    market: '<circle cx="12" cy="12" r="9" fill="none" stroke="#5aa9f0" stroke-width="1.8"/>' +
            '<path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" fill="none" ' +
            'stroke="#f7a600" stroke-width="1.4"/>'
};

/* Each topic is a short, scannable card: a one-line lede, steps that lead with
   what you are doing rather than a paragraph to wade through, the keys that go
   with it, and one thing worth knowing that people get wrong. Anything longer
   than a line does not get read. */
const GUIDE = [
    {
        id: 'replay', icon: 'replay', group: 'Start here', title: 'Replay a market',
        lede: 'Hide everything after a date, then take it back one bar at a time.',
        steps: [
            ['Open it', 'Press <b>Replay</b> in the top bar.'],
            ['Choose the moment', 'Double-click any candle, or roll the date wheel and press <b>Use date</b>.'],
            ['Cut the chart', '<b>Start replay</b> withholds every bar after that point.'],
            ['Move through it', 'Step one bar at a time, or press play and set bars per second.'],
            ['Come back', '<b>Back to full chart</b> returns to live prices. Your trade log survives.']
        ],
        keys: [['&rarr;', 'Next bar'], ['&larr;', 'Back a bar'], ['Space', 'Play / pause']],
        note: 'Stepping back rewinds your account too — trades taken after that bar un-happen. ' +
              'Future bars are never in the chart at all, so they cannot be peeked at.'
    },
    {
        id: 'market', icon: 'market', group: 'Start here', title: 'Choosing an instrument',
        short: 'Instruments',
        lede: 'Crypto and gold are priced from Binance, currencies from the European Central Bank.',
        steps: [
            ['Open the picker', 'Click the instrument button in the top bar.'],
            ['Browse', 'Tabs for Favourites, Crypto, Forex and Commodities. Search stays inside the open tab.'],
            ['Keep what you use', 'Star anything to pin it to Favourites.'],
            ['Crypto', 'Minute data back to 2017 — every timeframe works and replay steps minute by minute.'],
            ['Forex', 'Daily closes back to 1999. One price a day, so it draws as a line and fills resolve on the day.']
        ],
        note: 'Shares, indices and oil are missing because neither feed carries them — ' +
              'not because they were forgotten.'
    },
    {
        id: 'trade', icon: 'trade', group: 'Trading', title: 'Place a trade',
        lede: 'The right-hand panel is a full order ticket. It works live and in replay.',
        steps: [
            ['Order type', 'Market, Limit or Stop. <b>Last</b> fills the price box with the current price.'],
            ['Protect it', 'Set a stop and a target — by price, or by distance in points.'],
            ['Read the ticket', 'Order value, margin, risk, reward, R:R and the estimated liquidation.'],
            ['Send it', '<b>Buy / Long</b> or <b>Sell / Short</b>.'],
            ['Follow it', 'Working orders wait in Open orders, fills show in Positions, ' +
                          'closed trades land in Trade history.']
        ],
        note: 'Fills step through 1-minute bars, and where one minute touches both your stop and ' +
              'your target the <b>stop</b> is taken. Both sides pay the fee, so nothing is flattered.'
    },
    {
        id: 'size', icon: 'size', group: 'Trading', title: 'Automatic position sizing',
        short: 'Position sizing',
        lede: 'Say what you are willing to lose and the size follows your stop.',
        steps: [
            ['Set the risk', 'Leave the ticket on <b>Risk %</b> and type the share of your balance. ' +
                             '1% is the usual start.'],
            ['Move your stop', 'Quantity is recalculated instantly — a wider stop buys a smaller position.'],
            ['Or size by hand', 'Switch to <b>Quantity</b> and type it, in the coin or in USDT.'],
            ['Or draw it', 'Drag a <b>Long</b> or <b>Short position</b> on the chart, then press ' +
                           '<b>Trade</b> on its toolbar.']
        ],
        note: 'Risk on stop includes both fees, which is why it reads a little above stop distance ' +
              '&times; quantity. A setup drawn away from price is sent as a resting order there, ' +
              'not snapped onto the last candle.'
    },
    {
        id: 'tools', icon: 'tools', group: 'Charting', title: 'Drawing tools',
        lede: 'Forty tools in seven groups on the left rail, saved per instrument as you draw.',
        steps: [
            ['Pick one', 'Click a rail icon to use the tool showing; its corner arrow — or a ' +
                         'right-click — opens the whole group.'],
            ['Pin your favourites', 'Star a tool in that menu and it appears at the top of the ' +
                                    'right-click menu, anywhere on the chart.'],
            ['Restyle it', 'Select a drawing and a toolbar floats above it. Drag the toolbar if ' +
                           'it sits where you need to look.'],
            ['Go deeper', 'Double-click for full settings. Fibonacci levels can be edited, added, ' +
                          'recoloured or switched off one by one.']
        ],
        keys: [['Ctrl+Z', 'Undo'], ['Ctrl+Shift+Z', 'Redo'], ['Del', 'Delete selected'], ['Esc', 'Cancel']],
        note: 'The magnet on the rail snaps new points to the nearest open, high, low or close. ' +
              'The cursor group above it swaps the crosshair for a dot, an arrow, or the eraser.'
    },
    {
        id: 'ind', icon: 'ind', group: 'Charting', title: 'Indicators and your own code',
        short: 'Indicators & code',
        lede: 'Nine studies with real inputs, plus a place for the system you measured in the ' +
              'Backtest Machine.',
        steps: [
            ['Add one', 'Press <b>Indicators</b>, search, click.'],
            ['Select it', 'Click its line on the chart — the line thickens and its row in the ' +
                          'top-left list lights up.'],
            ['Edit it', 'Double-click the line or the row. <b>Inputs</b> on one tab, per-plot ' +
                        '<b>Style</b> on the other.'],
            ['Manage the list', 'Eye hides, gear opens, cross removes, and the arrow folds the ' +
                                'whole list away.'],
            ['Run your own', '<b>Add your own system code</b> takes a function body over ' +
                             '<code>bars</code> that returns one value per bar.']
        ],
        note: 'In replay a study only ever sees the bars revealed so far — it is recomputed from ' +
              'what is on screen, so stepping back cannot leak the future into it.'
    },
    {
        id: 'report', icon: 'report', group: 'Results', title: 'Reading and exporting results',
        short: 'Results & export',
        lede: 'Measured the same way the Backtest Machine measures a submitted system, so the two compare.',
        steps: [
            ['Performance', 'Net P&amp;L first, then the seven figures that decide a system, then ' +
                            'the equity curve.'],
            ['Calendar', 'Profit and loss laid out day by day.'],
            ['Journal', 'A note and tags against every trade.'],
            ['Export', 'A <b>PDF</b> report in the Backtest Machine format, a <b>CSV</b> trade log, ' +
                       'or the raw <b>JSON</b> behind both.']
        ],
        note: 'Profit factor under 1 means the losses outweigh the wins. Sharpe is withheld below ' +
              'five trades, because three trades is not a sample.'
    },
    {
        id: 'save', icon: 'save', group: 'Results', title: 'Layouts and sessions',
        short: 'Layouts & sessions',
        lede: 'Two different things worth keeping: how the chart looks, and what you did on it.',
        steps: [
            ['Layouts', 'Instrument, timeframe, theme, indicators and drawings, saved under a name.'],
            ['Sessions', '<b>Save / load</b> at the bottom right keeps your trades, working orders ' +
                         'and balance.'],
            ['Clear up', 'Reload or delete either from its own menu — one at a time, or all at once.']
        ],
        note: 'Both live in this browser. Carrying them between machines needs an account, ' +
              'which is not built yet.'
    }
];

let guideAt = 'replay';

function renderGuide() {
    const nav = $('rp-help-nav');
    let last = null;
    nav.innerHTML = GUIDE.map(g => {
        const head = g.group !== last ? '<h6>' + g.group + '</h6>' : '';
        last = g.group;
        return head + '<button data-g="' + g.id + '"' + (g.id === guideAt ? ' class="active"' : '') + '>' +
          '<svg viewBox="0 0 24 24" width="18" height="18">' + GUIDE_ICON[g.icon] + '</svg>' +
          '<span>' + (g.short || g.title) + '</span></button>';
    }).join('');
    nav.querySelectorAll('[data-g]').forEach(b =>
        b.addEventListener('click', () => { guideAt = b.dataset.g; renderGuide(); }));

    const g = GUIDE.find(x => x.id === guideAt) || GUIDE[0];
    $('rp-help-doc').innerHTML =
        '<span class="rp-help-kicker">' + g.group + '</span>' +
        '<h3>' + g.title + '</h3><p class="lede">' + g.lede + '</p>' +
        '<ol class="rp-help-steps">' + g.steps.map((st, i) =>
            '<li class="rp-help-step"><span class="rp-help-num">' + (i + 1) + '</span>' +
            '<div><b>' + st[0] + '</b><p>' + st[1] + '</p></div></li>').join('') + '</ol>' +
        (g.keys ? '<div class="rp-help-keys">' + g.keys.map(k =>
            '<span><kbd>' + k[0] + '</kbd>' + k[1] + '</span>').join('') + '</div>' : '') +
        (g.note ? '<div class="rp-help-note">' + g.note + '</div>' : '');
    $('rp-help-doc').scrollTop = 0;
}

// ============================================== instrument picker UI

let instCat = 'fav';

function catLabel(c) {
    return c === 'commodity' ? 'GOLD' : c === 'fx' ? 'FOREX' : 'CRYPTO';
}

// A few pairs deserve their own display name in the header button.
const PAIR_NAMES = { PAXGUSDT: 'GOLD', XAUTUSDT: 'GOLD', EURUSDT: 'EUR/USD' };

function syncInstButton() {
    const row = CATALOGUE && CATALOGUE.find(x => x.symbol === S.symbol);
    $('rp-inst-name').textContent = S.symbol;
    $('rp-inst-cat').textContent = catLabel(row ? row.cat : 'crypto');
}

/* A daily-only feed has no 5-minute bar to offer, so the timeframes it cannot
   serve are disabled rather than left to fail on selection. */
function syncTimeframes() {
    const daily = !!srcOfMarket().daily;
    $('rp-tf').querySelectorAll('option').forEach(o => {
        o.disabled = daily && o.value !== '1440';
    });
    if (daily && S.tfMin !== 1440) { S.tfMin = 1440; $('rp-tf').value = '1440'; }
}

async function openInstPicker() {
    $('rp-inst').hidden = false;
    $('rp-inst-list').innerHTML = '<div class="rp-inst-note">Loading instruments…</div>';
    setTimeout(() => $('rp-inst-search').focus(), 40);
    try { await loadCatalogue(); } catch (e) {
        $('rp-inst-list').innerHTML =
            '<div class="rp-inst-note">Could not reach the exchange: ' + e.message + '</div>';
        return;
    }
    renderInstList();
}
function closeInstPicker() { $('rp-inst').hidden = true; }

function renderInstList() {
    const box = $('rp-inst-list');
    const q = $('rp-inst-search').value.trim().toLowerCase();
    if (!CATALOGUE) return;

    // Shares and indices appear here as they are built. Until at least one
    // exists, say why rather than show an empty list.
    if (instCat === 'other' && !CATALOGUE.some(x => x.cat === 'other')) {
        box.innerHTML =
            '<div class="rp-inst-note">' +
            '<b>Shares and indices are being built.</b><br>' +
            'They come from the same 1-minute history behind the forex pairs, ' +
            'and each one has to be downloaded and hosted before it can appear. ' +
            'Nothing is listed here that would fail to load.' +
            '<ul>' +
              '<li>The S&amp;P 500, Nasdaq 100, Dow, DAX, FTSE, CAC and Stoxx 50 ' +
                  'reach back to 2012&ndash;2013 at one-minute resolution.</li>' +
              '<li>Crude oil, natural gas and copper reach back to 2011.</li>' +
              '<li>Around 680 US shares reach back to 2017.</li>' +
            '</ul>' +
            'Currencies are under <b>Forex</b> and gold under <b>Commodities</b>.' +
            '</div>';
        return;
    }

    // Search filters WITHIN the selected tab. Letting it search everything
    // meant that once you had typed anything the tabs stopped responding —
    // which is why the crypto tab felt like a room with no door.
    let rows = instCat === 'fav'
        ? CATALOGUE.filter(x => favourites.includes(x.symbol))
        : CATALOGUE.filter(x => x.cat === instCat);
    if (q) {
        rows = rows.filter(x => x.symbol.toLowerCase().includes(q) ||
                                (x.name || '').toLowerCase().includes(q));
    }

    if (!rows.length) {
        box.innerHTML = '<div class="rp-inst-note">' +
            (instCat === 'fav' && !q
                ? 'No favourites yet — tap the star beside any instrument to keep it here.'
                : 'Nothing matches that search.') + '</div>';
        return;
    }

    box.innerHTML = rows.map(x => {
        const fav = favourites.includes(x.symbol);
        const chg = isFinite(x.chg) ? x.chg : null;
        return '<div class="rp-inst-row' + (x.symbol === S.symbol ? ' on' : '') +
                 '" data-sym="' + x.symbol + '">' +
                 '<button class="rp-inst-star' + (fav ? ' on' : '') + '" data-fav="' + x.symbol +
                   '" title="' + (fav ? 'Remove from favourites' : 'Add to favourites') + '">' +
                   '<i class="fa-' + (fav ? 'solid' : 'regular') + ' fa-star"></i></button>' +
                 '<span class="rp-inst-id"><b>' + x.symbol +
                   (x.res === '1m' ? '<i class="rp-inst-res fine">1m</i>' : '') +
                   '</b><span>' + x.name + '</span></span>' +
                 '<span class="rp-inst-px">' + (isFinite(x.px)
                     ? fmt(x.px, x.px < 1 ? 5 : x.px < 10 ? 5 : x.px < 1000 ? 3 : 2) : '—') + '</span>' +
                 '<span class="rp-inst-chg ' + (chg === null ? '' : chg >= 0 ? 'val-pos' : 'val-neg') + '">' +
                   (chg === null ? '—' : (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%') + '</span>' +
               '</div>';
    }).join('');

    box.querySelectorAll('[data-fav]').forEach(b =>
        b.addEventListener('click', e => {
            e.stopPropagation();
            const sym = b.dataset.fav;
            const i = favourites.indexOf(sym);
            if (i >= 0) favourites.splice(i, 1); else favourites.push(sym);
            saveFavs(); renderInstList();
        }));
    box.querySelectorAll('.rp-inst-row').forEach(row =>
        row.addEventListener('click', () => pickInstrument(row.dataset.sym)));
}

async function pickInstrument(sym) {
    if (sym === S.symbol) { closeInstPicker(); return; }
    if (hasWorkToLose() && !await ask('Change instrument?',
        'The session — position, orders and trade log — is cleared. ' +
        'Export or save it first if you want to keep it.', 'Change instrument')) return;
    closeInstPicker();
    const row = CATALOGUE.find(x => x.symbol === sym);
    S.market = (row && row.src) || 'crypto';
    S.symbol = sym;
    resetAccount(true);
    syncTimeframes();
    syncInstButton();
    $('rp-tk-icon').textContent = sym.charAt(0);
    loadChart();
}

// =================================================== date wheel picker

/* A rolling wheel rather than the browser's calendar grid: picking a month in
   2019 took four interactions there and takes one flick here. Built on CSS
   scroll snapping, so it inherits real momentum on both mouse and touch. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let wheelDate = { d: 1, m: 0, y: 2024 };

function daysIn(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }

function buildWheel() {
    /* The earliest date offered has to be the earliest date this INSTRUMENT
       has, not the earliest the source could theoretically reach. The picker
       was offering 2003 for EURUSD because gold goes back that far; choosing
       it produced an empty chart. Where we host the history the manifest says
       exactly which month each symbol starts at. */
    const row = CATALOGUE && CATALOGUE.find(x => x.symbol === S.symbol);
    const earliest = new Date(row && row.from ? row.from + '-01'
                                              : srcOfMarket().earliest);
    const maxY = new Date().getUTCFullYear();
    const years = [];
    for (let y = earliest.getUTCFullYear(); y <= maxY; y++) years.push(y);

    const col = w => $('rp-wheel').querySelector('[data-w="' + w + '"]');
    const fill = (el, items, sel) => {
        el.innerHTML = '<div class="pad"></div><div class="pad"></div>' +
            items.map(v => '<div data-v="' + v.value + '">' + v.label + '</div>').join('') +
            '<div class="pad"></div><div class="pad"></div>';
        el.querySelectorAll('[data-v]').forEach(d =>
            d.addEventListener('click', () => {
                d.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }));
        const target = el.querySelector('[data-v="' + sel + '"]');
        if (target) el.scrollTop = target.offsetTop - el.clientHeight / 2 + 20;
    };

    fill(col('day'), Array.from({ length: daysIn(wheelDate.y, wheelDate.m) },
        (_, i) => ({ value: i + 1, label: i + 1 })), wheelDate.d);
    fill(col('month'), MONTHS.map((m, i) => ({ value: i, label: m })), wheelDate.m);
    fill(col('year'), years.map(y => ({ value: y, label: y })), wheelDate.y);

    ['day', 'month', 'year'].forEach(w => {
        const el = col(w);
        let t = null;
        el.onscroll = () => {
            clearTimeout(t);
            t = setTimeout(() => readWheel(w), 90);
            markWheel(el);
        };
        markWheel(el);
    });
    noteWheel();
}

function markWheel(el) {
    const mid = el.scrollTop + el.clientHeight / 2;
    let best = null, bd = Infinity;
    el.querySelectorAll('[data-v]').forEach(d => {
        const c = d.offsetTop + d.offsetHeight / 2;
        const dist = Math.abs(c - mid);
        if (dist < bd) { bd = dist; best = d; }
        d.classList.remove('sel');
    });
    if (best) best.classList.add('sel');
    return best;
}

function readWheel(which) {
    const el = $('rp-wheel').querySelector('[data-w="' + which + '"]');
    const best = markWheel(el);
    if (!best) return;
    const v = +best.dataset.v;
    if (which === 'day') wheelDate.d = v;
    if (which === 'month') wheelDate.m = v;
    if (which === 'year') wheelDate.y = v;

    // A short month must not leave the day on the 31st.
    const max = daysIn(wheelDate.y, wheelDate.m);
    if (wheelDate.d > max) { wheelDate.d = max; buildWheel(); return; }
    if (which !== 'day') {
        const dayCol = $('rp-wheel').querySelector('[data-w="day"]');
        if (dayCol.querySelectorAll('[data-v]').length !== max) { buildWheel(); return; }
    }
    noteWheel();
}

function noteWheel() {
    const ms = Date.UTC(wheelDate.y, wheelDate.m, wheelDate.d);
    const earliest = Date.parse(srcOfMarket().earliest);
    const latest = Date.now() - 86400000;
    const note = $('rp-wheel-note');
    if (ms < earliest) note.textContent = 'Before this market existed';
    else if (ms > latest) note.textContent = 'Too recent to replay';
    else note.textContent = new Date(ms).toLocaleDateString(undefined,
        { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    $('rp-datew-ok').disabled = ms < earliest || ms > latest;
}

function wheelLabel() {
    return new Date(Date.UTC(wheelDate.y, wheelDate.m, wheelDate.d))
        .toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function openDateWheel() {
    $('rp-datew').hidden = false;
    buildWheel();
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
    if (pendingLayout) {
        const L = pendingLayout; pendingLayout = null;
        if (window.BTTools) BTTools.load(L.drawings || []);
        while (activeInd.length) removeIndicator(activeInd[0].id);
        (L.indicators || []).forEach(i => {
            try { addIndicator(i.type, i.params, i.code, i.styles); } catch (e) {}
        });
        updateIndCount();
        return;
    }
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
    // Every branch needs the tick size, so it goes on first and the branch
    // that follows only deals with colour.
    try { series.applyOptions({ priceFormat: priceFormat() }); } catch (e) {}
    if (effectiveType() === 'candle') series.applyOptions(seriesOptions());
    else if (effectiveType() === 'bar') series.applyOptions({ upColor: theme.up, downColor: theme.down });
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
        if (isCloseOnly() && theme.type !== 'line' && theme.type !== 'area') {
            status('This feed publishes one close per day, so it draws as a line.');
            setTimeout(hideStatus, 3200);
        }
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

    // instrument picker
    const start = new Date(Date.now() - 400 * 86400000);
    wheelDate = { d: start.getUTCDate(), m: start.getUTCMonth(), y: start.getUTCFullYear() };
    $('rp-date-label').textContent = wheelLabel();
    syncInstButton();
    syncTimeframes();
    loadCatalogue().then(syncInstButton).catch(() => {});

    $('rp-inst-open').addEventListener('click', openInstPicker);
    $('rp-inst-close').addEventListener('click', closeInstPicker);
    $('rp-inst').addEventListener('click', e => { if (e.target.id === 'rp-inst') closeInstPicker(); });
    $('rp-inst-search').addEventListener('input', renderInstList);
    document.querySelectorAll('#rp-inst-tabs button').forEach(b =>
        b.addEventListener('click', () => {
            instCat = b.dataset.cat;
            $('rp-inst-search').value = '';      // a stale search hides the new tab
            document.querySelectorAll('#rp-inst-tabs button').forEach(x =>
                x.classList.toggle('active', x === b));
            renderInstList();
        }));

    // date wheel
    $('rp-date-btn').addEventListener('click', openDateWheel);
    $('rp-datew-close').addEventListener('click', () => { $('rp-datew').hidden = true; });
    $('rp-datew-cancel').addEventListener('click', () => { $('rp-datew').hidden = true; });
    $('rp-datew').addEventListener('click', e => { if (e.target.id === 'rp-datew') $('rp-datew').hidden = true; });
    $('rp-datew-ok').addEventListener('click', () => {
        $('rp-datew').hidden = true;
        $('rp-date-label').textContent = wheelLabel();
        setCutPoint(Date.UTC(wheelDate.y, wheelDate.m, wheelDate.d));
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

    $('rp-jump').addEventListener('click', () =>
        setCutPoint(Date.UTC(wheelDate.y, wheelDate.m, wheelDate.d)));
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

    $('rp-help-open').addEventListener('click', () => { $('rp-help').hidden = false; renderGuide(); });
    $('rp-help-close').addEventListener('click', () => { $('rp-help').hidden = true; });
    $('rp-help').addEventListener('click', e => { if (e.target.id === 'rp-help') $('rp-help').hidden = true; });

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
    /* Which indicator, if any, is under the pointer. Compares in PIXELS so the
       tolerance is the same whether the pane is showing a price of 4 or
       80,000 — comparing in price terms made the RSI pane impossible to hit
       and the price pane hit everything. */
    function indicatorAt(e) {
        const r = $('rp-chart-wrap').getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        const t = chart.timeScale().coordinateToTime(x);
        if (t === null) return null;
        let best = null, bd = 9;
        for (const a of activeInd) {
            if (a.hidden || !a.plot) continue;
            a.plot.forEach((serie, li) => {
                if (a.styles[li] && a.styles[li].visible === false) return;
                let near = null, nd = Infinity;
                for (const pt of serie) {
                    const d = Math.abs(pt.t - t);
                    if (d < nd && pt.v !== null && pt.v !== undefined && isFinite(pt.v)) { nd = d; near = pt; }
                }
                if (!near) return;
                const yy = a.lines[li].priceToCoordinate
                    ? a.lines[li].priceToCoordinate(near.v) : null;
                if (yy === null) return;
                const dist = Math.abs(yy - y);
                if (dist < bd) { bd = dist; best = a; }
            });
        }
        return best;
    }

    /* A single click on a plot selects the study. Only while a cursor tool is
       in hand — during drawing the click belongs to the shape being made. */
    $('rp-chart-wrap').addEventListener('click', e => {
        if (e.target.closest('.rp-legend-wrap, .rp-transport, .rp-hud, .rp-cf, .rp-tb, .rp-ctx')) return;
        const t = window.BTTools && BTTools.getTool ? BTTools.getTool() : 'cursor';
        if (t !== 'cursor' && t !== 'dot' && t !== 'pointer') return;
        const hit = indicatorAt(e);
        selectIndicator(hit ? hit.id : null);
    });

    $('rp-chart-wrap').addEventListener('dblclick', e => {
        if (e.target.closest('.rp-legend-wrap, .rp-transport, .rp-hud, .rp-cf, .rp-tb')) return;
        if (!$('rp-cutbar').hidden) return;      // mid replay set-up
        const where = overAxis(e);
        if (where.price || where.time) return;   // axis double-click: let it reset
        const ind = indicatorAt(e);
        if (ind) { openIndSettings(ind.id); return; }
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
        const k = e.deltaY > 0 ? 1.18 : 1 / 1.18;
        priceMargins = {
            top:    Math.min(0.45, Math.max(0.002, priceMargins.top * k)),
            bottom: Math.min(0.45, Math.max(0.002, priceMargins.bottom * k))
        };
        /* autoScale MUST go back on. Dragging the price axis is how a trader
           stretches it by hand, and the library switches autoScale off when
           they do — after which scaleMargins does nothing at all, because
           margins are padding around an automatically fitted range and there
           is no longer a fitted range to pad. The wheel appeared to break
           permanently the first time anyone dragged the axis. */
        try {
            chart.priceScale('right').applyOptions({
                autoScale: true, scaleMargins: priceMargins
            });
        } catch (err) {}
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
    $('rp-sessions').addEventListener('click', () => openSessionMenu($('rp-sessions')));
    $('rp-layout-open').addEventListener('click', () => openLayoutMenu($('rp-layout-open')));

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
    $('rp-code-card').addEventListener('click', () => {
        const panel = $('rp-code-panel');
        panel.hidden = !panel.hidden;
        $('rp-code-card').classList.toggle('open', !panel.hidden);
        if (!panel.hidden) setTimeout(() => $('rp-ind-code').focus(), 40);
    });
    $('rp-ind-code').value = TEMPLATES.sma;
    renderIndicatorList();
    updateIndCount();

    // drawing tools
    if (window.BTTools) {
        BTTools.attach(chart, series, $('rp-chart-wrap'), {
            onChange: saveDrawings,
            menu: () => [
                { icon: 'reset', label: 'Reset chart view',
                  run: () => { try { chart.timeScale().fitContent(); } catch (e) {} } },
                { icon: 'chart', label: 'Chart settings…',
                  run: () => { $('rp-set').hidden = false; } },
                { icon: 'image', label: 'Save chart as image', run: saveChartImage }
            ]
        });
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
        if (e.key === 'Escape' && !$('rp-help').hidden) { $('rp-help').hidden = true; return; }
        if (e.key === 'Escape' && !$('rp-datew').hidden) { $('rp-datew').hidden = true; return; }
        if (e.key === 'Escape' && !$('rp-inst').hidden) { closeInstPicker(); return; }
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

    wireBackLink();
    lockGate();
    applyAccess();        // resolves later; the terminal is usable meanwhile
}


// ============================================================ access gate

/* Anyone can open this terminal and look at all of it: every tab, every
   dialog, a live chart. What a plan buys is the ability to DO something with
   it — replay a market, take a trade, keep a session, take the numbers away.
   Those controls are stopped in one place rather than in each handler, in the
   capture phase, so a control that is rebuilt later is still covered. */
const LOCKED_CTL = [
    '#rp-replay-open', '#rp-start-replay',            // replaying
    '#rp-buy', '#rp-sell', '#rp-close',               // trading
    '#rp-sessions', '#rp-export', '#rp-layout-open',  // keeping and taking away
    '#rp-code-card'                                   // your own system code
].join(',');

let locked = false;      // no plan, or not signed in at all
let lockWhy = '';

function lockGate() {
    document.addEventListener('click', e => {
        if (!locked) return;
        const hit = e.target.closest && e.target.closest(LOCKED_CTL);
        if (!hit) return;
        e.preventDefault();
        e.stopPropagation();
        upsell();
    }, true);

    const cta = $('rp-preview-cta');
    if (cta) cta.addEventListener('click', () => { location.href = backToSite(); });
}

function upsell() {
    const signedOut = lockWhy === 'signedout';
    ask(signedOut ? 'Sign in to use the terminal' : 'This needs the Replay plan',
        signedOut
            ? 'The chart is yours to look at either way. Replaying a market, taking a ' +
              'trade, keeping a session and exporting results need an account and the ' +
              'BarTest Replay plan.'
            : 'Replaying a market, taking a trade, keeping a session and exporting ' +
              'results are part of BarTest Replay & Chart. Full Access includes the ' +
              'Backtest Machine as well.',
        signedOut ? 'Sign in' : 'See the plans')
        .then(go => { if (go) location.href = backToSite(); });
}

/* Someone signed out needs the sign-in panel; someone signed in without the
   plan needs the price list. Sending both to the same place wastes a click. */
function backToSite() {
    return lockWhy === 'signedout' ? '/?signin=1' : '/?plans=1';
}

/* Access is re-read after anything that could have changed it, so the state
   has to be able to go back as well as forward. */
function unlockTerminal() {
    locked = false; lockWhy = '';
    document.body.classList.remove('rp-locked');
    const bar = $('rp-preview');
    if (bar) bar.hidden = true;
    document.querySelectorAll('.rp-locked-ctl').forEach(el => el.classList.remove('rp-locked-ctl'));
}

async function applyAccess() {
    if (!window.BTAccess) return;                 // offline or blocked: leave it open
    let a;
    try { a = await BTAccess.get(); } catch (e) { return; }
    // Paid for it — or we could not check, which must not lock anyone out.
    if (a.replay || (a.degraded && a.signedIn)) { unlockTerminal(); return; }

    locked = true;
    lockWhy = a.signedIn ? 'noplan' : 'signedout';
    document.body.classList.add('rp-locked');

    const bar = $('rp-preview');
    if (bar) {
        bar.hidden = false;
        const text = $('rp-preview-text');
        if (text) text.textContent = a.signedIn
            ? 'Look around freely — every tab and every panel is open. Replaying, ' +
              'trading, saving and exporting need the BarTest Replay plan.'
            : 'You are not signed in. Look around freely; replaying, trading, saving ' +
              'and exporting need an account and the BarTest Replay plan.';
        const cta = $('rp-preview-cta');
        if (cta) cta.textContent = a.signedIn ? 'See the plans' : 'Sign in';
    }
    document.querySelectorAll(LOCKED_CTL).forEach(el => el.classList.add('rp-locked-ctl'));
}

/* The back arrow should feel like a back arrow. Coming from the site, step
   back through history so the hero keeps its scroll position; arriving here
   directly, go to the site root instead of a dead end. */
function wireBackLink() {
    const link = document.querySelector('a.rp-back');
    if (!link) return;
    link.addEventListener('click', e => {
        const sameSite = document.referrer && document.referrer.indexOf(location.origin) === 0;
        if (sameSite && history.length > 1) { e.preventDefault(); history.back(); }
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
