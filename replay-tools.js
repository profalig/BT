/* ==========================================================================
   BarTest — drawing tools

   A TradingView-shaped drawing layer: grouped tool rail with fly-out menus,
   a floating style HUD on the selected shape (colour, fill, width, style,
   extends, text, lock, clone, delete, settings), a full settings dialog on
   double-click, magnet snapping, and per-tool style memory.

   Shapes are stored as timestamp + price, never pixels, which is what keeps
   them stuck to the same candles through pan, zoom, timeframe changes and
   replay stepping. Screen positions are derived at paint time.

   The canvas never takes the mouse. Hit-testing runs on the container in the
   capture phase and the event is only swallowed once a shape is grabbed, so
   the chart keeps its own pan and zoom everywhere else.
   ========================================================================== */
window.BTTools = (function () {
'use strict';

let chart, series, host, cvs, ctx;
let tool = 'cursor';
let shapes = [];
let selected = null;
let drag = null;
let pending = null;          // multi-click shape under construction
let seq = 0;
let onChange = null;
let onMenu = null;
let bars = [];               // last painted data — magnet + future extrapolation

let magnet = false;
let lockAll = false;
let hideAll = false;
let hoverId = null;          // shape under the pointer — drives label reveal
let history = [];            // undo stack of serialised snapshots
let histAt = -1;
let restoring = false;

const SEL  = '#5aa9f0';
const HIT  = 10;
/* Level sets are DATA on the shape, not constants in this file, so a trader
   can add the 1.13 they use, drop the 0.786 they never look at, and recolour
   the rest — the way every charting platform lets them. */
const LEVEL_COLOURS = ['#ef454a', '#ff9f43', '#f7a600', '#20b26c', '#00c2c2',
                       '#5aa9f0', '#c58af0', '#ff7ac6', '#8c9099'];
const lvl = ratios => ratios.map((r, i) =>
    ({ r: r, on: true, c: LEVEL_COLOURS[i % LEVEL_COLOURS.length] }));

const DEFAULT_LEVELS = {
    fib:     [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],
    fibext:  [0, 0.618, 1, 1.618, 2.618, 4.236],
    fibfan:  [0.236, 0.382, 0.5, 0.618, 0.786],
    fibtime: [0, 1, 2, 3, 5, 8, 13, 21],
    gann:    [1, 2, 3, 4, 8]
};

// ============================================================ tool catalogue

/* kind drives geometry, hit-testing and drawing. Everything else is style. */
const T = {
    cursor:      { name: 'Cross',                 kind: 'nav',  pts: 0 },
    dot:         { name: 'Dot',                   kind: 'nav',  pts: 0 },
    pointer:     { name: 'Arrow',                 kind: 'nav',  pts: 0 },
    eraser:      { name: 'Eraser',                kind: 'nav',  pts: 0 },

    trend:       { name: 'Trend line',            kind: 'line', pts: 2, cap: 'line' },
    ray:         { name: 'Ray',                   kind: 'line', pts: 2, cap: 'line',
                   preset: { extendRight: true } },
    extended:    { name: 'Extended line',         kind: 'line', pts: 2, cap: 'line',
                   preset: { extendRight: true, extendLeft: true } },
    arrow:       { name: 'Arrow',                 kind: 'line', pts: 2, cap: 'line',
                   preset: { arrowRight: true } },
    angle:       { name: 'Trend angle',           kind: 'line', pts: 2, cap: 'line',
                   preset: { showAngle: true } },
    hline:       { name: 'Horizontal line',       kind: 'hline', pts: 1, cap: 'line' },
    hray:        { name: 'Horizontal ray',        kind: 'hray',  pts: 1, cap: 'line' },
    vline:       { name: 'Vertical line',         kind: 'vline', pts: 1, cap: 'line' },
    crossline:   { name: 'Cross line',            kind: 'cross', pts: 1, cap: 'line' },
    channel:     { name: 'Parallel channel',      kind: 'channel', pts: 3, cap: 'area',
                   extend: true },
    pitchfork:   { name: 'Pitchfork',             kind: 'fork',    pts: 3, cap: 'area' },
    gann:        { name: 'Gann fan',              kind: 'gann',    pts: 2, cap: 'levels',
                   levels: 'gann' },

    fib:         { name: 'Fib retracement',       kind: 'fib',     pts: 2, cap: 'levels',
                   levels: 'fib', extend: true },
    fibext:      { name: 'Fib extension',         kind: 'fibext',  pts: 3, cap: 'levels',
                   levels: 'fibext', extend: true },
    fibfan:      { name: 'Fib fan',               kind: 'fibfan',  pts: 2, cap: 'levels',
                   levels: 'fibfan' },
    fibtime:     { name: 'Fib time zones',        kind: 'fibtime', pts: 2, cap: 'levels',
                   levels: 'fibtime' },

    rect:        { name: 'Rectangle',             kind: 'rect',    pts: 2, cap: 'area',
                   extend: true },
    orderblock:  { name: 'Order block',           kind: 'ob',      pts: 2, cap: 'area',
                   preset: { line: '#5aa9f0', fill: '#5aa9f0', fillOpacity: 0.18, text: 'OB' } },
    ellipse:     { name: 'Ellipse',               kind: 'ellipse', pts: 2, cap: 'area' },
    triangle:    { name: 'Triangle',              kind: 'poly',    pts: 3, cap: 'area',
                   preset: { closed: true } },
    path:        { name: 'Path',                  kind: 'poly',    pts: 0, cap: 'line' },

    text:        { name: 'Text',                  kind: 'text',    pts: 1, cap: 'text',
                   preset: { text: 'Text' } },
    callout:     { name: 'Callout',               kind: 'callout', pts: 2, cap: 'text',
                   preset: { text: 'Note', fill: '#f7a600', fillOpacity: 0.16 } },
    pricelabel:  { name: 'Price label',           kind: 'plabel',  pts: 1, cap: 'text' },
    markerUp:    { name: 'Arrow up',              kind: 'marker',  pts: 1, cap: 'mark',
                   preset: { line: '#20b26c', dir: 1 } },
    markerDown:  { name: 'Arrow down',            kind: 'marker',  pts: 1, cap: 'mark',
                   preset: { line: '#ef454a', dir: -1 } },
    flag:        { name: 'Flag mark',             kind: 'flag',    pts: 1, cap: 'mark' },

    // drag:true means "created by dragging, not click-by-click" even though
    // the finished shape carries three points — entry, stop and target.
    position:    { name: 'Long position',         kind: 'position', pts: 3, cap: 'trade',
                   drag: true, preset: { dir: 1 } },
    positionS:   { name: 'Short position',        kind: 'position', pts: 3, cap: 'trade',
                   drag: true, preset: { dir: -1 } },
    ruler:       { name: 'Measure',               kind: 'ruler',   pts: 2, cap: 'area' },
    pricerange:  { name: 'Price range',           kind: 'prange',  pts: 2, cap: 'area' },
    daterange:   { name: 'Date range',            kind: 'drange',  pts: 2, cap: 'area' },
    dprange:     { name: 'Date and price range',  kind: 'dprange', pts: 2, cap: 'area' },

    abcd:        { name: 'ABCD pattern',          kind: 'pattern', pts: 4, cap: 'line',
                   labels: ['A', 'B', 'C', 'D'] },
    xabcd:       { name: 'XABCD pattern',         kind: 'pattern', pts: 5, cap: 'line',
                   labels: ['X', 'A', 'B', 'C', 'D'] },
    hs:          { name: 'Head and shoulders',    kind: 'pattern', pts: 7, cap: 'line',
                   labels: ['', 'LS', '', 'H', '', 'RS', ''] },
    elliott:     { name: 'Elliott impulse',       kind: 'pattern', pts: 6, cap: 'line',
                   labels: ['0', '1', '2', '3', '4', '5'] }
};

/* Colourful, purpose-built icons — the rail should read at a glance. */
const ICO = {
cursor:'<path d="M12 2v20M2 12h20" stroke="#5aa9f0" stroke-width="1.6"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="#f7a600" stroke-width="1.8"/>',
pointer:'<path d="M5 2.5v19l4.6-4.6h6.5z" fill="#f7a600"/>',
dot:'<circle cx="12" cy="12" r="3.6" fill="#f7a600"/><circle cx="12" cy="12" r="8.5" fill="none" stroke="#5aa9f0" stroke-width="1.4" stroke-dasharray="2 3"/>',
eraser:'<path d="M4 17l7-7 6 6-4 4H6z" fill="#ef454a" opacity=".75"/><path d="M11 10l4-4 6 6-4 4z" fill="#5aa9f0"/>',
trend:'<path d="M3 20L21 5" stroke="#5aa9f0" stroke-width="2" stroke-linecap="round"/><circle cx="3" cy="20" r="2.4" fill="#f7a600"/><circle cx="21" cy="5" r="2.4" fill="#f7a600"/>',
ray:'<path d="M4 19L21 6" stroke="#5aa9f0" stroke-width="2" stroke-linecap="round"/><circle cx="4" cy="19" r="2.6" fill="#f7a600"/><path d="M16.6 5.2l4.6.6-.7 4.5" fill="none" stroke="#20b26c" stroke-width="1.7" stroke-linecap="round"/>',
extended:'<path d="M2 21L22 3" stroke="#5aa9f0" stroke-width="2" stroke-linecap="round"/><circle cx="8" cy="15" r="2.3" fill="#f7a600"/><circle cx="16" cy="8" r="2.3" fill="#f7a600"/>',
arrow:'<path d="M3 20L17.5 6.5" stroke="#5aa9f0" stroke-width="2" stroke-linecap="round"/><path d="M21 3.5l-1.4 6.4-5-1.4z" fill="#f7a600"/>',
angle:'<path d="M3 20h13" stroke="#61686f" stroke-width="1.6"/><path d="M3 20L20 6" stroke="#5aa9f0" stroke-width="2" stroke-linecap="round"/><path d="M10 20a8 8 0 00-1.9-5" fill="none" stroke="#f7a600" stroke-width="1.6"/>',
hline:'<path d="M2 12h20" stroke="#5aa9f0" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="2.6" fill="#f7a600"/>',
hray:'<path d="M6 12h16" stroke="#5aa9f0" stroke-width="2.2" stroke-linecap="round"/><circle cx="5" cy="12" r="2.8" fill="#f7a600"/>',
vline:'<path d="M12 2v20" stroke="#5aa9f0" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="2.6" fill="#f7a600"/>',
crossline:'<path d="M2 12h20M12 2v20" stroke="#5aa9f0" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="2.6" fill="#f7a600"/>',
channel:'<path d="M3 17L20 6l0 5L3 22z" fill="#5aa9f0" opacity=".18"/><path d="M3 17L20 6M3 22L20 11" stroke="#5aa9f0" stroke-width="1.9" stroke-linecap="round"/>',
pitchfork:'<path d="M3 12h18M6 4h16M6 20h16" stroke="#5aa9f0" stroke-width="1.7" stroke-linecap="round" fill="none"/><path d="M6 4v16" stroke="#f7a600" stroke-width="1.7" stroke-linecap="round"/><circle cx="3" cy="12" r="2.2" fill="#f7a600"/>',
gann:'<path d="M3 21L21 3M3 21h19M3 21L12 3M3 21l19 9M3 21L18 3" stroke="#20b26c" stroke-width="1.3" fill="none" opacity=".85"/><path d="M3 21L21 3" stroke="#f7a600" stroke-width="1.9"/>',
fib:'<path d="M2 5h20" stroke="#ef454a" stroke-width="1.8"/><path d="M2 10h20" stroke="#f7a600" stroke-width="1.8"/><path d="M2 14h20" stroke="#20b26c" stroke-width="1.8"/><path d="M2 19h20" stroke="#5aa9f0" stroke-width="1.8"/>',
fibext:'<path d="M3 20L9 8l5 7 7-11" fill="none" stroke="#5aa9f0" stroke-width="1.8" stroke-linejoin="round"/><path d="M2 6h20" stroke="#f7a600" stroke-width="1.3" opacity=".85"/><path d="M2 16h20" stroke="#20b26c" stroke-width="1.3" opacity=".85"/>',
fibfan:'<path d="M3 21L21 3M3 21h19M3 21L14 3M3 21l19 6" stroke="#5aa9f0" stroke-width="1.4" opacity=".85" fill="none"/><circle cx="3" cy="21" r="2.4" fill="#f7a600"/>',
fibtime:'<path d="M4 3v18M8 3v18M14 3v18M22 3v18" stroke="#5aa9f0" stroke-width="1.6" opacity=".85"/><circle cx="4" cy="12" r="2.2" fill="#f7a600"/>',
rect:'<rect x="3" y="6" width="18" height="12" rx="1.5" fill="#5aa9f0" opacity=".2"/><rect x="3" y="6" width="18" height="12" rx="1.5" fill="none" stroke="#5aa9f0" stroke-width="1.8"/>',
orderblock:'<rect x="3" y="5" width="18" height="6" rx="1" fill="#20b26c" opacity=".3"/><rect x="3" y="13" width="18" height="6" rx="1" fill="#ef454a" opacity=".3"/><rect x="3" y="5" width="18" height="6" rx="1" fill="none" stroke="#20b26c" stroke-width="1.4"/><rect x="3" y="13" width="18" height="6" rx="1" fill="none" stroke="#ef454a" stroke-width="1.4"/>',
ellipse:'<ellipse cx="12" cy="12" rx="9.5" ry="6.5" fill="#c58af0" opacity=".2"/><ellipse cx="12" cy="12" rx="9.5" ry="6.5" fill="none" stroke="#c58af0" stroke-width="1.8"/>',
triangle:'<path d="M12 4l9 16H3z" fill="#20b26c" opacity=".2"/><path d="M12 4l9 16H3z" fill="none" stroke="#20b26c" stroke-width="1.8" stroke-linejoin="round"/>',
path:'<path d="M3 19l4-8 5 5 4-9 5 6" fill="none" stroke="#5aa9f0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="3" cy="19" r="2" fill="#f7a600"/><circle cx="21" cy="13" r="2" fill="#f7a600"/>',
text:'<path d="M4 6h16M12 6v13" stroke="#f7a600" stroke-width="2.2" stroke-linecap="round"/>',
callout:'<path d="M3 5h18v11H10l-4 4v-4H3z" fill="#f7a600" opacity=".2"/><path d="M3 5h18v11H10l-4 4v-4H3z" fill="none" stroke="#f7a600" stroke-width="1.7" stroke-linejoin="round"/>',
pricelabel:'<path d="M3 8h13l5 4-5 4H3z" fill="#5aa9f0" opacity=".28"/><path d="M3 8h13l5 4-5 4H3z" fill="none" stroke="#5aa9f0" stroke-width="1.6" stroke-linejoin="round"/>',
markerUp:'<path d="M12 3l7 9h-4v9h-6v-9H5z" fill="#20b26c"/>',
markerDown:'<path d="M12 21l7-9h-4V3h-6v9H5z" fill="#ef454a"/>',
flag:'<path d="M6 3v18" stroke="#61686f" stroke-width="2" stroke-linecap="round"/><path d="M6 4h12l-3 4 3 4H6z" fill="#f7a600"/>',
position:'<rect x="3" y="4" width="18" height="7" fill="#20b26c" opacity=".32"/><rect x="3" y="13" width="18" height="6" fill="#ef454a" opacity=".32"/><path d="M3 11.9h18" stroke="#f7a600" stroke-width="1.8"/>',
positionS:'<rect x="3" y="4" width="18" height="6" fill="#ef454a" opacity=".32"/><rect x="3" y="12" width="18" height="7" fill="#20b26c" opacity=".32"/><path d="M3 11.1h18" stroke="#f7a600" stroke-width="1.8"/>',
ruler:'<path d="M3 15l12-12 6 6-12 12z" fill="#5aa9f0" opacity=".2"/><path d="M3 15l12-12 6 6-12 12z" fill="none" stroke="#5aa9f0" stroke-width="1.6"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2" stroke="#f7a600" stroke-width="1.5"/>',
pricerange:'<path d="M12 3v18" stroke="#5aa9f0" stroke-width="1.8"/><path d="M12 3l-4 4M12 3l4 4M12 21l-4-4M12 21l4-4" fill="none" stroke="#f7a600" stroke-width="1.8" stroke-linecap="round"/>',
daterange:'<path d="M3 12h18" stroke="#5aa9f0" stroke-width="1.8"/><path d="M3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4" fill="none" stroke="#f7a600" stroke-width="1.8" stroke-linecap="round"/>',
dprange:'<rect x="3" y="5" width="18" height="14" fill="#5aa9f0" opacity=".16"/><path d="M3 12h18M12 5v14" stroke="#5aa9f0" stroke-width="1.5"/><path d="M6.5 9L3.5 12l3 3M17.5 9l3 3-3 3" fill="none" stroke="#f7a600" stroke-width="1.5" stroke-linecap="round"/>',
abcd:'<path d="M3 20l5-11 5 8 4-9 4 6" fill="none" stroke="#c58af0" stroke-width="1.8" stroke-linejoin="round"/><circle cx="8" cy="9" r="2" fill="#f7a600"/><circle cx="17" cy="8" r="2" fill="#f7a600"/>',
xabcd:'<path d="M2 6l4 12 4-8 4 9 4-11 4 6" fill="none" stroke="#c58af0" stroke-width="1.7" stroke-linejoin="round"/>',
hs:'<path d="M2 19l4-6 3 4 3-11 3 11 3-4 4 6" fill="none" stroke="#5aa9f0" stroke-width="1.7" stroke-linejoin="round"/><path d="M2 17h20" stroke="#f7a600" stroke-width="1.3" stroke-dasharray="3 3"/>',
elliott:'<path d="M3 21l3-7 3 4 4-11 3 7 5-9" fill="none" stroke="#20b26c" stroke-width="1.8" stroke-linejoin="round"/>',
magnet:'<path d="M6 4h4v9a2 2 0 004 0V4h4v9a6 6 0 01-12 0z" fill="#f7a600"/><path d="M6 4h4v3H6zM14 4h4v3h-4z" fill="#ef454a"/>',
lock:'<rect x="5" y="10" width="14" height="10" rx="2" fill="#f7a600"/><path d="M8 10V7a4 4 0 018 0v3" fill="none" stroke="#5aa9f0" stroke-width="2"/>',
eye:'<path d="M12 5c6 0 10 7 10 7s-4 7-10 7S2 12 2 12 6 5 12 5z" fill="none" stroke="#5aa9f0" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="#f7a600"/>',
trash:'<path d="M4 7h16" stroke="#ef454a" stroke-width="2" stroke-linecap="round"/><path d="M6.5 7h11l-1 13h-9z" fill="#ef454a" opacity=".3"/><path d="M6.5 7h11l-1 13h-9z" fill="none" stroke="#ef454a" stroke-width="1.5"/><path d="M9.5 4h5v3h-5z" fill="#ef454a"/>'
};

const GROUPS = [
    { id: 'g-cursor', name: 'Cursors',                  tools: ['cursor', 'dot', 'pointer', 'eraser'] },
    { id: 'g-lines',  name: 'Lines',                    tools: ['trend', 'ray', 'extended', 'arrow', 'angle', 'hline', 'hray', 'vline', 'crossline', 'channel', 'pitchfork'] },
    { id: 'g-fib',    name: 'Fibonacci & Gann',         tools: ['fib', 'fibext', 'fibfan', 'fibtime', 'gann'] },
    { id: 'g-shapes', name: 'Shapes & zones',           tools: ['rect', 'orderblock', 'ellipse', 'triangle', 'path'] },
    { id: 'g-ann',    name: 'Annotation',               tools: ['text', 'callout', 'pricelabel', 'markerUp', 'markerDown', 'flag'] },
    { id: 'g-meas',   name: 'Prediction & measurement', tools: ['position', 'positionS', 'ruler', 'pricerange', 'daterange', 'dprange'] },
    { id: 'g-pat',    name: 'Patterns',                 tools: ['abcd', 'xabcd', 'hs', 'elliott'] }
];

const DEFAULT_STYLE = {
    line: '#f7a600', width: 1.5, dash: 'solid',
    fill: '#f7a600', fillOpacity: 0.14,
    extendLeft: false, extendRight: false,
    arrowLeft: false, arrowRight: false,
    text: '', fontSize: 12, bold: false, italic: false, textColor: '#eaecef',
    showLabels: true, showAngle: false, closed: false, dir: 1,
    // level tools
    levels: null, reverse: false, fillLevels: true,
    showPrices: true, showPercent: true,
    // parallel channel
    middle: false
};

const PALETTE = ['#f7a600', '#20b26c', '#ef454a', '#5aa9f0', '#c58af0', '#eaecef',
                 '#f0e14a', '#00c2c2', '#ff7ac6', '#8c9099', '#ff9f43', '#4a7cf0'];

// Per-tool style memory: your next rectangle looks like your last rectangle.
let lastStyle = {};
try { lastStyle = JSON.parse(localStorage.getItem('bt.replay.toolstyle') || '{}'); }
catch (e) { lastStyle = {}; }
function rememberStyle(s) {
    lastStyle[s.tool] = Object.assign({}, s.style);
    try { localStorage.setItem('bt.replay.toolstyle', JSON.stringify(lastStyle)); } catch (e) {}
}

// ---------------------------------------------------------------- lifecycle

function attach(_chart, _series, _host, opts) {
    chart = _chart; series = _series; host = _host;
    onChange = (opts && opts.onChange) || null;
    onMenu = (opts && opts.menu) || null;
    cvs = document.getElementById('rp-draw');
    ctx = cvs.getContext('2d');

    new ResizeObserver(resize).observe(host);
    resize();
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => { render(); place(); });

    host.addEventListener('mousedown', onDown, true);
    host.addEventListener('dblclick', onDblClick, true);
    host.addEventListener('contextmenu', onContext, true);
    host.addEventListener('mousemove', onHover);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onCfgMove);
    window.addEventListener('mouseup', onCfgUp);
    document.addEventListener('keydown', onKey);

    buildRail();
    buildHud();
    requestAnimationFrame(watchPriceScale);
    return api;
}

function resize() {
    const r = host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cvs.width = Math.round(r.width * dpr);
    cvs.height = Math.round(r.height * dpr);
    cvs.style.width = r.width + 'px';
    cvs.style.height = r.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(); place();
}

/* Lightweight Charts fires a subscription for the TIME scale but nothing for
   the PRICE scale, so a vertical drag or zoom moved the candles and left the
   drawings behind until an unrelated horizontal change forced a repaint.
   Two coordinate probes a frame is cheap and catches every change. */
let scaleSig = null;
function watchPriceScale() {
    requestAnimationFrame(watchPriceScale);
    if (!series || !shapes.length) return;
    const a = series.coordinateToPrice(0);
    const b = series.coordinateToPrice(120);
    if (a === null || b === null) return;
    const sig = a.toFixed(6) + '|' + b.toFixed(6);
    if (sig !== scaleSig) { scaleSig = sig; render(); place(); }
}

// -------------------------------------------------------------- coordinates

/* Screen mapping goes through the LOGICAL BAR INDEX, never through time
   directly. Lightweight Charts lays bars out evenly by index, so a pixel is a
   linear function of the index but NOT of the timestamp — mapping a stored
   time straight to a coordinate is only right at one zoom level and drifts at
   every other, which is what made drawings crawl across the candles as you
   zoomed. Index also carries on cleanly past the last bar, which is where
   rays, forecasts and position boxes live and where timeToCoordinate simply
   returns null. */
function barStep() {
    const n = bars.length;
    return n > 1 ? (bars[n - 1].time - bars[0].time) / (n - 1) : 60;
}
function timeToIndex(t) {
    const n = bars.length;
    if (!n) return null;
    const step = barStep() || 1;
    if (t <= bars[0].time)     return (t - bars[0].time) / step;
    if (t >= bars[n - 1].time) return (n - 1) + (t - bars[n - 1].time) / step;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (bars[m].time <= t) lo = m; else hi = m;
    }
    const span = bars[hi].time - bars[lo].time || 1;
    return lo + (t - bars[lo].time) / span;
}
function indexToTime(i) {
    const n = bars.length;
    if (!n) return null;
    const step = barStep() || 1;
    if (i <= 0)     return Math.round(bars[0].time + i * step);
    if (i >= n - 1) return Math.round(bars[n - 1].time + (i - (n - 1)) * step);
    const lo = Math.floor(i), hi = Math.min(n - 1, lo + 1);
    return Math.round(bars[lo].time + (i - lo) * (bars[hi].time - bars[lo].time));
}

function X(t) {
    const i = timeToIndex(t);
    if (i === null) return null;
    const x = chart.timeScale().logicalToCoordinate(i);
    return (x === null || !isFinite(x)) ? null : x;
}
function Y(p) { return series.priceToCoordinate(p); }

function xToTime(x) {
    if (!bars.length) return null;
    const i = chart.timeScale().coordinateToLogical(x);
    return (i === null || !isFinite(i)) ? null : indexToTime(i);
}

function toChart(e) {
    const r = cvs.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let price = series.coordinateToPrice(y);
    const time = xToTime(x);
    if (price === null || time === null) return null;
    if (magnet) price = snap(time, price);
    return { time: time, price: price, x: x, y: y };
}

// Magnet: pull to the nearest OHLC of the bar under the cursor.
function snap(time, price) {
    if (!bars.length) return price;
    let best = null, bd = Infinity;
    for (const b of bars) {
        const d = Math.abs(b.time - time);
        if (d < bd) { bd = d; best = b; }
    }
    if (!best) return price;
    let out = price, od = Infinity;
    for (const v of [best.open, best.high, best.low, best.close]) {
        const d = Math.abs(v - price);
        if (d < od) { od = d; out = v; }
    }
    return out;
}

function pxOf(pt) {
    const x = X(pt.time), y = Y(pt.price);
    return (x === null || y === null) ? null : { x: x, y: y };
}
const styleOf = s => Object.assign({}, DEFAULT_STYLE, s.style || {});
const spec = s => T[s.tool] || T.trend;

function rgba(hex, a) {
    const h = String(hex || '#000').replace('#', '');
    const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const v = parseInt(n, 16) || 0;
    return 'rgba(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + a + ')';
}
function dashOf(name) {
    return name === 'dashed' ? [7, 5] : name === 'dotted' ? [2, 4] : [];
}
const dp = () => {
    const p = bars.length ? bars[bars.length - 1].close : 100;
    return p < 1 ? 6 : p < 20 ? 4 : 2;
};
const money = v => Number(v).toFixed(dp());

// -------------------------------------------------------------- hit testing

function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function hitTest(x, y) {
    for (let i = shapes.length - 1; i >= 0; i--) {
        const s = shapes[i];
        if (s.hidden || hideAll) continue;
        const pts = s.pts.map(pxOf);
        if (pts.some(p => p === null)) continue;
        const k = spec(s).kind;
        const movable = !(s.locked || lockAll);

        if (movable) {
            for (let h = 0; h < pts.length; h++) {
                if (Math.hypot(x - pts[h].x, y - pts[h].y) <= HIT + 2) return { id: s.id, handle: h };
            }
        }
        if (k === 'hline' || k === 'hray') {
            if (Math.abs(y - pts[0].y) <= HIT && (k === 'hline' || x >= pts[0].x - HIT))
                return { id: s.id, handle: -1 };
        } else if (k === 'vline') {
            if (Math.abs(x - pts[0].x) <= HIT) return { id: s.id, handle: -1 };
        } else if (k === 'cross') {
            if (Math.abs(x - pts[0].x) <= HIT || Math.abs(y - pts[0].y) <= HIT)
                return { id: s.id, handle: -1 };
        } else if (k === 'line' || k === 'poly' || k === 'pattern' || k === 'channel' || k === 'fork') {
            for (let j = 0; j < pts.length - 1; j++) {
                if (distToSegment(x, y, pts[j].x, pts[j].y, pts[j + 1].x, pts[j + 1].y) <= HIT)
                    return { id: s.id, handle: -1 };
            }
        } else if (k === 'position') {
            // Must mirror drawPosition exactly. It clamps the box to a
            // minimum width so the shape stays visible when the chart is
            // zoomed out, and without the same clamp here the drawn box was
            // far wider than the part of it you could actually click.
            const l = pts[0].x;
            const rr = Math.max(pts[1].x, pts[2] ? pts[2].x : pts[1].x, l + 70) + 8;
            const ys = pts.map(q => q.y);
            const t = Math.min.apply(null, ys), b = Math.max.apply(null, ys);
            if (x >= l - HIT && x <= rr + HIT && y >= t - HIT && y <= b + HIT)
                return { id: s.id, handle: -1 };
        } else if (k === 'text' || k === 'plabel' || k === 'marker' || k === 'flag') {
            if (Math.abs(x - pts[0].x) <= 48 && Math.abs(y - pts[0].y) <= 18)
                return { id: s.id, handle: -1 };
        } else {
            const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
            const l = Math.min.apply(null, xs), r = Math.max.apply(null, xs);
            const t = Math.min.apply(null, ys), b = Math.max.apply(null, ys);
            if (x >= l - HIT && x <= r + HIT && y >= t - HIT && y <= b + HIT)
                return { id: s.id, handle: -1 };
        }
    }
    return null;
}

// ------------------------------------------------------------------- events

/* The toolbar, the settings dialog and the pop-overs are children of the same
   host we hit-test on, and we listen in the CAPTURE phase — so without this
   every mousedown on one of their buttons reached the chart first, missed
   every shape, deselected, and tore the panel down before the click could
   land. Nothing in the drawing UI is a chart gesture; skip all of it. */
const UI_SEL = '.rp-tb, .rp-cf, .rp-pop, .rp-flyout, .rp-legend-wrap, ' +
               '.rp-transport, .rp-hud, .rp-tool-chip';
function fromUI(e) {
    return !!(e.target && e.target.closest && e.target.closest(UI_SEL));
}

function newShape(t, p) {
    const sp = T[t];
    const st = Object.assign({}, DEFAULT_STYLE, lastStyle[t] || {}, sp.preset || {});
    if (sp.levels && !Array.isArray(st.levels)) st.levels = lvl(DEFAULT_LEVELS[sp.levels]);
    return { id: ++seq, tool: t, pts: [p], style: st, locked: false, hidden: false };
}

// Shapes drawn before levels were editable fall back to the tool's defaults
// rather than drawing nothing at all.
function levelsOf(sh) {
    const st = styleOf(sh);
    return Array.isArray(st.levels) && st.levels.length
        ? st.levels : lvl(DEFAULT_LEVELS[spec(sh).levels] || []);
}

function onDown(e) {
    if (e.button !== 0 || fromUI(e)) return;
    const p = toChart(e);
    if (!p) return;

    // A multi-click build in progress swallows clicks until it is complete.
    if (pending) {
        e.preventDefault(); e.stopPropagation();
        pending.pts[pending.pts.length - 1] = p;
        const want = spec(pending).pts;
        if (want && pending.pts.length >= want) { finishPending(); return; }
        pending.pts.push({ time: p.time, price: p.price });
        render();
        return;
    }

    if (tool === 'eraser') {
        const h = hitTest(p.x, p.y);
        if (h) { e.preventDefault(); e.stopPropagation(); remove(h.id); }
        return;
    }

    if (!NAV[tool]) {
        e.preventDefault(); e.stopPropagation();
        const sp = T[tool];
        const s = newShape(tool, p);

        if (sp.pts === 1) {
            shapes.push(s); selected = s.id; commit(); place();
            if (sp.cap === 'text') openSettings(s.id, true);
            setTool(navTool);
            return;
        }
        if (sp.pts === 2 || sp.drag) {
            s.pts = [p, { time: p.time, price: p.price }];
            if (sp.drag) s.pts.push({ time: p.time, price: p.price });
            shapes.push(s);
            selected = s.id;
            drag = { mode: 'create', id: s.id, handle: 1 };
            render();
            return;
        }
        // three or more points, or a free path: click by click.
        s.pts = [p, { time: p.time, price: p.price }];
        pending = s;
        shapes.push(s);
        selected = s.id;
        render();
        return;
    }

    const hit = hitTest(p.x, p.y);
    if (!hit) { if (selected !== null) { selected = null; closeHud(); closeSettings(); render(); } return; }

    e.preventDefault(); e.stopPropagation();
    selected = hit.id;
    const s = shapes.find(x => x.id === hit.id);
    if (!(s.locked || lockAll)) {
        drag = {
            mode: hit.handle >= 0 ? 'handle' : 'move',
            id: hit.id, handle: hit.handle,
            from: p, orig: s.pts.map(q => ({ time: q.time, price: q.price }))
        };
    }
    render(); place();
}

function onHover(e) {
    if (!drag && !pending && !fromUI(e)) {
        const p = toChart(e);
        const hit = p ? hitTest(p.x, p.y) : null;
        const id = hit ? hit.id : null;
        if (id !== hoverId) { hoverId = id; render(); }
    }
    if (!pending || drag || fromUI(e)) return;
    const p = toChart(e);
    if (!p) return;
    pending.pts[pending.pts.length - 1] = { time: p.time, price: p.price };
    render();
}

function onMove(e) {
    if (pending && !drag) { onHover(e); return; }
    if (!drag) return;
    const p = toChart(e);
    if (!p) return;
    const s = shapes.find(x => x.id === drag.id);
    if (!s) return;
    const kind = spec(s).kind;

    if (drag.mode === 'create') {
        if (kind === 'position') {
            const dir = s.style.dir || 1;
            // A drag straight sideways would otherwise put the stop on the
            // entry and leave the box with no risk side.
            const risk = Math.abs(s.pts[0].price - p.price)
                      || Math.abs(s.pts[0].price) * 0.005 || 1;
            // The entry is the box's left edge and it always opens forward.
            // Letting the drag pull the far edge behind the entry is what
            // made a position drawn at the live price stretch off to the
            // left of the chart.
            const t = Math.max(p.time, s.pts[0].time + (barStep() || 3600) * 3);
            s.pts[1] = { time: t, price: dir > 0 ? s.pts[0].price - risk : s.pts[0].price + risk };
            s.pts[2] = { time: t, price: dir > 0 ? s.pts[0].price + risk * 2 : s.pts[0].price - risk * 2 };
        } else {
            s.pts[1] = { time: p.time, price: p.price };
        }
    } else if (drag.mode === 'handle') {
        // A position's three levels are horizontal: their time only sets how
        // wide the box is, so dragging one must change PRICE ALONE. Writing
        // the cursor's time as well made the whole box slide sideways while
        // you were only trying to move a level up or down.
        s.pts[drag.handle] = (kind === 'position')
            ? { time: s.pts[drag.handle].time, price: p.price }
            : { time: p.time, price: p.price };
    } else {
        const dt = p.time - drag.from.time, dpr = p.price - drag.from.price;
        s.pts = drag.orig.map(q => ({ time: q.time + dt, price: q.price + dpr }));
    }
    render(); place();
}

function onUp() {
    if (!drag) return;
    const s = shapes.find(x => x.id === drag.id);
    const wasCreate = drag.mode === 'create';
    drag = null;

    if (s && wasCreate) {
        const a = pxOf(s.pts[0]), b = pxOf(s.pts[1]);
        if (a && b && Math.hypot(b.x - a.x, b.y - a.y) < 4) {
            // A position dropped with a single click gets a default box, the
            // way TradingView does it. Sending it down the click-by-click
            // path instead left the stop sitting exactly on the entry — a
            // box with a target and no stop side at all.
            if (spec(s).drag) seedDefault(s);
            else {
                // Every other tool: "place the first point, I will click
                // again for the second", as every charting platform behaves.
                pending = s;
                render();
                return;
            }
        }
        setTool(navTool);
        rememberStyle(s);
        if (spec(s).cap === 'text') openSettings(s.id, true);
    }
    if (s && spec(s).kind === 'position') sendToOrderPanel(s);
    commit(); place();
}

/* A position needs three usable levels the moment it exists: half a percent
   of risk, twice that in reward, twenty bars wide. Every level is draggable
   afterwards — nothing here is locked to a ratio. */
function seedDefault(s) {
    const dir = s.style.dir || 1;
    const entry = s.pts[0].price;
    const risk = Math.abs(entry) * 0.005 || 1;
    const t2 = s.pts[0].time + (barStep() || 3600) * 20;
    s.pts[1] = { time: t2, price: dir > 0 ? entry - risk : entry + risk };
    s.pts[2] = { time: t2, price: dir > 0 ? entry + risk * 2 : entry - risk * 2 };
}

function finishPending() {
    const s = pending;
    pending = null;
    if (!s) return;
    if (s.pts.length < 2) { shapes = shapes.filter(x => x.id !== s.id); selected = null; }
    else rememberStyle(s);
    setTool(navTool);
    commit(); place();
}

function onDblClick(e) {
    if (fromUI(e)) return;
    if (pending) {                     // a path ends on a double-click
        e.preventDefault(); e.stopPropagation();
        if (pending.pts.length > 2) pending.pts.pop();
        finishPending();
        return;
    }
    const p = toChart(e);
    if (!p) return;
    const hit = hitTest(p.x, p.y);
    if (!hit) return;                  // let the chart-settings handler have it
    e.preventDefault(); e.stopPropagation();
    selected = hit.id;
    render();
    openSettings(hit.id);
}

/* Right-click was doing nothing at all. On a chart it should answer the two
   questions you have when you point at a price: what is here, and what can I
   put here. A shape under the pointer adds its own verbs above those. */
let menuEl = null;
function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
}

function onContext(e) {
    if (fromUI(e)) return;
    const p = toChart(e);
    if (!p) return;
    e.preventDefault(); e.stopPropagation();

    const hit = hitTest(p.x, p.y);
    const items = [];

    if (hit) {
        const sh = shapes.find(x => x.id === hit.id);
        selected = hit.id; render(); place();
        items.push({ icon: 'gear', label: 'Settings…', run: () => openSettings(sh.id) });
        items.push({ icon: 'clone', label: 'Duplicate', run: () => {
            const step = bars.length > 1 ? (bars[1].time - bars[0].time) * 6 : 3600;
            shapes.push({ id: ++seq, tool: sh.tool,
                pts: sh.pts.map(q => ({ time: q.time + step, price: q.price })),
                style: Object.assign({}, sh.style), locked: false, hidden: false });
            selected = shapes[shapes.length - 1].id;
            commit();
        }});
        items.push({ icon: 'lock', label: sh.locked ? 'Unlock' : 'Lock',
                     run: () => { sh.locked = !sh.locked; commit(); } });
        items.push({ icon: 'eye', label: 'Hide', run: () => { sh.hidden = true; commit(); } });
        items.push({ icon: 'trash', label: 'Remove', danger: true, run: () => remove(sh.id) });
        items.push({ sep: true });
    }

    // Pinned tools first: reaching for your own four should not mean
    // travelling to the rail and opening a fly-out.
    const pinned = favTools.filter(t => T[t]);
    if (pinned.length) {
        pinned.forEach(t => items.push({
            svg: ICO[t], label: T[t].name,
            run: () => setTool(t)
        }));
        items.push({ sep: true });
    }

    items.push({ icon: 'hline', label: 'Horizontal line at ' + money(p.price), run: () => {
        const sh = newShape('hline', { time: p.time, price: p.price });
        shapes.push(sh); selected = sh.id; commit();
    }});
    items.push({ icon: 'vline', label: 'Vertical line here', run: () => {
        const sh = newShape('vline', { time: p.time, price: p.price });
        shapes.push(sh); selected = sh.id; commit();
    }});
    const dropPosition = tool => () => {
        const sh = newShape(tool, { time: p.time, price: p.price });
        seedDefault(sh); shapes.push(sh); selected = sh.id;
        sendToOrderPanel(sh); commit();
    };
    items.push({ icon: 'position',  label: 'Long position here',  run: dropPosition('position') });
    items.push({ icon: 'positionS', label: 'Short position here', run: dropPosition('positionS') });
    items.push({ sep: true });
    items.push({ icon: 'copy', label: 'Copy price  ' + money(p.price), run: () => {
        try { navigator.clipboard.writeText(money(p.price)); } catch (err) {}
    }});

    // Whatever the host page wants to add — reset view, settings, snapshot.
    const extra = (onMenu && onMenu(p)) || [];
    if (extra.length) items.push({ sep: true });
    extra.forEach(i => items.push(i));

    showMenu(e.clientX, e.clientY, items);
}

const MENU_ICON = {
    gear: '<i class="fa-solid fa-gear"></i>', clone: '<i class="fa-regular fa-clone"></i>',
    lock: '<i class="fa-solid fa-lock"></i>', eye: '<i class="fa-solid fa-eye-slash"></i>',
    trash: '<i class="fa-solid fa-trash-can"></i>',
    hline: '<i class="fa-solid fa-minus"></i>', vline: '<i class="fa-solid fa-grip-lines-vertical"></i>',
    position: '<i class="fa-solid fa-arrow-trend-up"></i>',
    positionS: '<i class="fa-solid fa-arrow-trend-down"></i>',
    copy: '<i class="fa-regular fa-copy"></i>',
    reset: '<i class="fa-solid fa-expand"></i>', image: '<i class="fa-regular fa-image"></i>',
    chart: '<i class="fa-solid fa-sliders"></i>'
};

function showMenu(cx, cy, items) {
    closeMenu();
    menuEl = document.createElement('div');
    menuEl.className = 'rp-pop rp-ctx';
    menuEl.innerHTML = '<div class="rp-menu">' + items.map((i, n) => {
        if (i.sep) return '<span class="rp-ctx-sep"></span>';
        const ic = i.svg
            ? '<svg viewBox="0 0 24 24" width="16" height="16">' + i.svg + '</svg>'
            : (MENU_ICON[i.icon] || '');
        return '<button data-i="' + n + '"' + (i.danger ? ' class="danger"' : '') + '>' +
               ic + '<span>' + i.label + '</span></button>';
    }).join('') + '</div>';
    document.body.appendChild(menuEl);
    const w = menuEl.offsetWidth, h = menuEl.offsetHeight;
    menuEl.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, cx)) + 'px';
    menuEl.style.top = Math.max(6, Math.min(window.innerHeight - h - 6, cy)) + 'px';
    menuEl.querySelectorAll('[data-i]').forEach(b =>
        b.addEventListener('click', () => {
            const it = items[+b.dataset.i];
            closeMenu();
            if (it && it.run) it.run();
        }));
    setTimeout(() => {
        document.addEventListener('mousedown', outside);
        document.addEventListener('contextmenu', outside);
    }, 0);
    function outside(ev) {
        if (menuEl && menuEl.contains(ev.target)) return;
        document.removeEventListener('mousedown', outside);
        document.removeEventListener('contextmenu', outside);
        closeMenu();
    }
}

function onKey(e) {
    if (/input|select|textarea/i.test(e.target.tagName) || e.target.isContentEditable) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
    }
    if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return; }
    if (e.key === 'Escape') {
        if (menuEl) { closeMenu(); return; }
        if (pending) { if (pending.pts.length > 2) pending.pts.pop(); finishPending(); return; }
        setTool(navTool); selected = null; closeHud(); closeSettings(); render(); return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected !== null) {
        e.preventDefault(); remove(selected);
    }
}

function remove(id) {
    const s = shapes.find(x => x.id === id);
    if (s && (s.locked || lockAll)) return;
    shapes = shapes.filter(x => x.id !== id);
    if (selected === id) selected = null;
    closeHud(); closeSettings(); commit();
}

function commit() {
    render(); place();
    pushHistory();
    if (onChange) onChange(serialize());
}

/* Undo covers every shape edit — create, move, reshape, restyle, lock,
   delete, clear. Snapshots are the whole drawing set, which is small enough
   that diffing would cost more than it saved. */
function pushHistory() {
    if (restoring) return;
    const snap = JSON.stringify(serialize());
    if (histAt >= 0 && history[histAt] === snap) return;
    history = history.slice(0, histAt + 1);
    history.push(snap);
    if (history.length > 80) { history.shift(); histAt--; }
    histAt = history.length - 1;
}
function applySnapshot(json) {
    restoring = true;
    try { load(JSON.parse(json)); } finally { restoring = false; }
    if (onChange) onChange(serialize());
}
function undo() { if (histAt > 0) { histAt--; applySnapshot(history[histAt]); } }
function redo() { if (histAt < history.length - 1) { histAt++; applySnapshot(history[histAt]); } }

/* The position tool doubles as an order ticket: drawing one loads the panel,
   and the toolbar's Trade button sends it. Two verbs, one shape. */
function drawnOrder(s) {
    if (!s.pts[1]) return null;
    const entry = s.pts[0].price, stop = s.pts[1].price;
    if (!Math.abs(entry - stop)) return null;
    return {
        side: (s.style.dir || 1) > 0 ? 'long' : 'short',
        entry: entry, stop: stop,
        target: s.pts[2] ? s.pts[2].price : null
    };
}
function sendToOrderPanel(s, announce) {
    const o = drawnOrder(s);
    if (o && window.BTOrder && window.BTOrder.fromDrawing) window.BTOrder.fromDrawing(o, announce);
}
function submitDrawing(s) {
    const o = drawnOrder(s);
    if (o && window.BTOrder && window.BTOrder.submit) window.BTOrder.submit(o);
}

// ==================================================================== paint

function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cvs.clientWidth, cvs.clientHeight);
    if (hideAll) return;
    for (const s of shapes) { if (!s.hidden) drawShape(s); }
}

function drawShape(s) {
    const pts = s.pts.map(pxOf);
    if (!pts.length || pts.some(p => p === null)) return;
    const st = styleOf(s);
    const on = s.id === selected;
    const w = cvs.clientWidth, h = cvs.clientHeight;
    const kind = spec(s).kind;

    ctx.save();
    ctx.lineWidth = on ? +st.width + 0.8 : +st.width;
    ctx.strokeStyle = on ? SEL : st.line;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.setLineDash(dashOf(st.dash));
    ctx.font = fontOf(st);
    const stroke = ctx.strokeStyle;

    if (kind === 'line')       drawLine(s, pts, st);
    else if (kind === 'hline') { seg(0, pts[0].y, w, pts[0].y); label(money(s.pts[0].price), 6, pts[0].y - 5, stroke); }
    else if (kind === 'hray')  { seg(pts[0].x, pts[0].y, w, pts[0].y); label(money(s.pts[0].price), pts[0].x + 8, pts[0].y - 5, stroke); }
    else if (kind === 'vline') { seg(pts[0].x, 0, pts[0].x, h); }
    else if (kind === 'cross') { seg(0, pts[0].y, w, pts[0].y); seg(pts[0].x, 0, pts[0].x, h); }
    else if (kind === 'channel') drawChannel(pts, st);
    else if (kind === 'fork') drawFork(pts, st);
    else if (kind === 'gann') drawGann(s, pts);
    else if (kind === 'rect' || kind === 'ob') drawRect(s, pts, st, kind);
    else if (kind === 'ellipse') drawEllipse(pts, st);
    else if (kind === 'poly' || kind === 'pattern') drawPoly(s, pts, st, kind);
    else if (kind === 'fib') drawFib(s, pts);
    else if (kind === 'fibext') drawFibExt(s, pts, st);
    else if (kind === 'fibfan') drawFibFan(s, pts);
    else if (kind === 'fibtime') drawFibTime(s, pts, h);
    else if (kind === 'text') text(st.text || 'Text', pts[0].x, pts[0].y, st);
    else if (kind === 'callout') drawCallout(pts, st);
    else if (kind === 'plabel') drawPriceLabel(s, pts, st);
    else if (kind === 'marker') drawMarker(pts, st);
    else if (kind === 'flag') drawFlag(pts, st);
    else if (kind === 'position') drawPosition(s, pts, st, on);
    else if (kind === 'ruler') drawRuler(s, pts);
    else if (kind === 'prange') drawPRange(s, pts, st);
    else if (kind === 'drange') drawDRange(s, pts, st);
    else if (kind === 'dprange') drawDPRange(s, pts, st);

    if (on && kind !== 'position') pts.forEach(p => handle(p.x, p.y));
    if (on && (s.locked || lockAll)) lockPip(pts[0]);
    ctx.restore();
}

function fontOf(st) {
    return (st.italic ? 'italic ' : '') + (st.bold ? '700 ' : '500 ') +
           (st.fontSize || 12) + 'px "IBM Plex Sans", system-ui, sans-serif';
}
function seg(x1, y1, x2, y2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function drawLine(s, pts, st) {
    let a = { x: pts[0].x, y: pts[0].y }, b = { x: pts[1].x, y: pts[1].y };
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len) {
        const far = 4000;
        if (st.extendRight) b = { x: b.x + dx / len * far, y: b.y + dy / len * far };
        if (st.extendLeft)  a = { x: a.x - dx / len * far, y: a.y - dy / len * far };
    }
    seg(a.x, a.y, b.x, b.y);
    if (st.arrowRight) arrowHead(pts[0], pts[1]);
    if (st.arrowLeft)  arrowHead(pts[1], pts[0]);

    if (st.showLabels) {
        const d = s.pts[1].price - s.pts[0].price;
        const pct = s.pts[0].price ? d / s.pts[0].price * 100 : 0;
        let txt = (d >= 0 ? '+' : '') + money(d) + '  (' + pct.toFixed(2) + '%)';
        if (st.showAngle) {
            const ang = Math.atan2(-(pts[1].y - pts[0].y), pts[1].x - pts[0].x) * 180 / Math.PI;
            txt = ang.toFixed(1) + '°   ' + txt;
        }
        label(txt, (pts[0].x + pts[1].x) / 2 + 6, (pts[0].y + pts[1].y) / 2 - 6, ctx.strokeStyle);
    }
}

function arrowHead(from, to) {
    const a = Math.atan2(to.y - from.y, to.x - from.x), L = 11;
    ctx.save(); ctx.setLineDash([]); ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - L * Math.cos(a - 0.42), to.y - L * Math.sin(a - 0.42));
    ctx.lineTo(to.x - L * Math.cos(a + 0.42), to.y - L * Math.sin(a + 0.42));
    ctx.closePath(); ctx.fill(); ctx.restore();
}

function drawChannel(pts, st) {
    if (pts.length < 3) { seg(pts[0].x, pts[0].y, pts[1].x, pts[1].y); return; }
    const span = (pts[1].x - pts[0].x) || 1;
    const onLine = pts[0].y + (pts[1].y - pts[0].y) * ((pts[2].x - pts[0].x) / span);
    const off = pts[2].y - onLine;

    // Extending runs both rails the same distance along the channel's own
    // slope, so they stay parallel however far they go.
    let a = { x: pts[0].x, y: pts[0].y }, b = { x: pts[1].x, y: pts[1].y };
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const far = 4000;
    if (st.extendRight) b = { x: b.x + dx / len * far, y: b.y + dy / len * far };
    if (st.extendLeft)  a = { x: a.x - dx / len * far, y: a.y - dy / len * far };

    ctx.save(); ctx.setLineDash([]);
    ctx.fillStyle = rgba(st.fill, st.fillOpacity);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x, b.y + off); ctx.lineTo(a.x, a.y + off);
    ctx.closePath(); ctx.fill(); ctx.restore();

    seg(a.x, a.y, b.x, b.y);
    seg(a.x, a.y + off, b.x, b.y + off);
    if (st.middle) {
        ctx.save(); ctx.setLineDash([5, 4]); ctx.globalAlpha = .75;
        seg(a.x, a.y + off / 2, b.x, b.y + off / 2);
        ctx.restore();
    }
}

/* Andrews pitchfork: a median line from the pivot through the midpoint of
   the other two, with tines parallel to it through each of them. */
function drawFork(pts, st) {
    if (pts.length < 3) { seg(pts[0].x, pts[0].y, pts[1].x, pts[1].y); return; }
    const mid = { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 };
    let dx = mid.x - pts[0].x, dy = mid.y - pts[0].y;
    const len = Math.hypot(dx, dy) || 1;
    dx = dx / len * 3000; dy = dy / len * 3000;

    ctx.save(); ctx.setLineDash([]);
    ctx.fillStyle = rgba(st.fill, st.fillOpacity);
    ctx.beginPath();
    ctx.moveTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[1].x + dx, pts[1].y + dy);
    ctx.lineTo(pts[2].x + dx, pts[2].y + dy);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    seg(pts[0].x, pts[0].y, pts[0].x + dx, pts[0].y + dy);   // median
    seg(pts[1].x, pts[1].y, pts[1].x + dx, pts[1].y + dy);   // tines
    seg(pts[2].x, pts[2].y, pts[2].x + dx, pts[2].y + dy);
    ctx.save(); ctx.setLineDash([3, 3]);
    seg(pts[1].x, pts[1].y, pts[2].x, pts[2].y);             // handle
    ctx.restore();
}

/* Gann fan: the second point sets the 1x1, every other ray is a whole-number
   multiple of that slope in time or in price. */
function drawGann(sh, pts) {
    const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
    ctx.save();
    // Each ratio draws both ways: n bars per unit of price, and the reverse.
    levelsOf(sh).filter(L => L.on).forEach(L => {
        const n = L.r || 1;
        ctx.strokeStyle = L.c;
        ctx.lineWidth = n === 1 ? 1.9 : 1.1;
        seg(pts[0].x, pts[0].y, pts[0].x + dx * n * 5, pts[0].y + dy * 5);
        if (n !== 1) seg(pts[0].x, pts[0].y, pts[0].x + dx * 5, pts[0].y + dy * n * 5);
    });
    ctx.restore();
}

function drawRect(s, pts, st, kind) {
    const x0 = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y);
    const x = st.extendLeft ? 0 : x0;
    const rightEdge = st.extendRight ? cvs.clientWidth : Math.max(pts[0].x, pts[1].x);
    const w = rightEdge - x, h = Math.abs(pts[1].y - pts[0].y);
    ctx.save(); ctx.setLineDash([]);
    ctx.fillStyle = rgba(st.fill, st.fillOpacity);
    ctx.fillRect(x, y, w, h); ctx.restore();
    ctx.strokeRect(x, y, w, h);
    const d = Math.abs(s.pts[1].price - s.pts[0].price);
    if (kind === 'ob') label((st.text || 'OB') + '  ' + money(d), x + 5, y - 5, ctx.strokeStyle);
    else if (st.showLabels) label(money(d) + ' pts', x + 5, y - 5, ctx.strokeStyle);
    if (st.text && kind !== 'ob') text(st.text, x + 6, y + (+st.fontSize || 12) + 5, st);
}

function drawEllipse(pts, st) {
    const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2;
    const rx = Math.abs(pts[1].x - pts[0].x) / 2, ry = Math.abs(pts[1].y - pts[0].y) / 2;
    ctx.save(); ctx.setLineDash([]); ctx.fillStyle = rgba(st.fill, st.fillOpacity);
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
}

function drawPoly(s, pts, st, kind) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (st.closed) {
        ctx.closePath();
        ctx.save(); ctx.setLineDash([]); ctx.fillStyle = rgba(st.fill, st.fillOpacity);
        ctx.fill(); ctx.restore();
    }
    ctx.stroke();
    if (kind === 'pattern') {
        const labels = spec(s).labels || [];
        pts.forEach((p, i) => { if (labels[i]) label(labels[i], p.x - 6, p.y - 8, ctx.strokeStyle); });
    }
}

function levelColour(i) {
    const cols = ['#ef454a', '#ff9f43', '#f7a600', '#20b26c', '#00c2c2', '#5aa9f0', '#c58af0'];
    return cols[i % cols.length];
}

/* One routine draws every horizontal level set. The levels themselves, their
   colours, whether each is shown, the fill between them and how far they run
   are all the shape's own settings now. */
function drawLevels(sh, l, r, priceAt) {
    const st = styleOf(sh);
    const levels = levelsOf(sh).filter(L => L.on);
    const right = st.extendRight ? cvs.clientWidth : r + 60;
    const left  = st.extendLeft ? 0 : l;
    ctx.save();
    ctx.setLineDash(dashOf(st.dash));
    ctx.lineWidth = +st.width;

    // Bands between neighbouring levels, lightest thing on the chart.
    if (st.fillLevels && levels.length > 1) {
        ctx.setLineDash([]);
        for (let i = 0; i < levels.length - 1; i++) {
            const y1 = Y(priceAt(levels[i].r)), y2 = Y(priceAt(levels[i + 1].r));
            if (y1 === null || y2 === null) continue;
            ctx.fillStyle = rgba(levels[i].c, 0.07);
            ctx.fillRect(left, Math.min(y1, y2), right - left, Math.abs(y2 - y1));
        }
        ctx.setLineDash(dashOf(st.dash));
    }

    ctx.font = '12px "IBM Plex Mono", monospace';
    levels.forEach(L => {
        const price = priceAt(L.r);
        const y = Y(price);
        if (y === null) return;
        ctx.strokeStyle = L.c;
        ctx.fillStyle = L.c;
        seg(left, y, right, y);
        let label = '';
        if (st.showPercent) label += (L.r * 100).toFixed(1) + '%';
        if (st.showPrices)  label += (label ? '  ' : '') + money(price);
        if (label) ctx.fillText(label, left + 5, y - 4);
    });
    ctx.restore();
}

function drawFib(s, pts) {
    const st = styleOf(s);
    // Reverse swaps which end of the leg counts as zero.
    const a = st.reverse ? s.pts[1].price : s.pts[0].price;
    const b = st.reverse ? s.pts[0].price : s.pts[1].price;
    const l = Math.min(pts[0].x, pts[1].x), r = Math.max(pts[0].x, pts[1].x);
    ctx.save(); ctx.setLineDash([3, 3]); ctx.globalAlpha = .5;
    ctx.strokeStyle = st.line;
    seg(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
    ctx.restore();
    drawLevels(s, l, r, f => b + (a - b) * f);
}

function drawFibExt(s, pts, st) {
    if (pts.length < 3) { drawPoly(s, pts, st, 'poly'); return; }
    ctx.save(); ctx.setLineDash([2, 3]); ctx.globalAlpha = .6;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y); ctx.lineTo(pts[2].x, pts[2].y); ctx.stroke();
    ctx.restore();
    const base = s.pts[2].price, span = s.pts[1].price - s.pts[0].price;
    const l = Math.min(pts[0].x, pts[1].x, pts[2].x), r = Math.max(pts[0].x, pts[1].x, pts[2].x);
    drawLevels(s, l, r, f => base + span * f);
}

function drawFibFan(sh, pts) {
    const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
    ctx.save();
    levelsOf(sh).filter(L => L.on).forEach(L => {
        ctx.strokeStyle = L.c;
        seg(pts[0].x, pts[0].y, pts[0].x + dx * 6, pts[0].y + dy * L.r * 6);
    });
    ctx.restore();
}

function drawFibTime(sh, pts, h) {
    const dx = pts[1].x - pts[0].x;
    ctx.save();
    ctx.font = '12px "IBM Plex Mono", monospace';
    levelsOf(sh).filter(L => L.on).forEach(L => {
        ctx.strokeStyle = L.c;
        ctx.fillStyle = L.c;
        const x = pts[0].x + dx * L.r;
        seg(x, 0, x, h);
        ctx.fillText(String(L.r), x + 3, 14);
    });
    ctx.restore();
}

function drawCallout(pts, st) {
    const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y);
    const w = Math.max(64, Math.abs(pts[1].x - pts[0].x));
    const h = Math.max(28, Math.abs(pts[1].y - pts[0].y));
    ctx.save(); ctx.setLineDash([]);
    ctx.fillStyle = rgba(st.fill, st.fillOpacity);
    rr(x, y, w, h, 5); ctx.fill();
    ctx.restore();
    rr(x, y, w, h, 5); ctx.stroke();
    seg(pts[0].x, pts[0].y, x + 12, y + h);
    text(st.text || 'Note', x + 8, y + (+st.fontSize || 12) + 6, st);
}
function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function drawPriceLabel(s, pts, st) {
    const t = (st.text ? st.text + '  ' : '') + money(s.pts[0].price);
    ctx.save();
    ctx.font = fontOf(st);
    const w = ctx.measureText(t).width + 16;
    ctx.setLineDash([]);
    ctx.fillStyle = st.line;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[0].x + 9, pts[0].y - 11);
    ctx.lineTo(pts[0].x + 9 + w, pts[0].y - 11);
    ctx.lineTo(pts[0].x + 9 + w, pts[0].y + 11);
    ctx.lineTo(pts[0].x + 9, pts[0].y + 11);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0b0e11';
    ctx.fillText(t, pts[0].x + 17, pts[0].y + 4);
    ctx.restore();
}

function drawMarker(pts, st) {
    // Canvas y grows downward, so the shaft has to be laid out against the
    // direction: dir 1 (up) puts the tip at the click point and the shaft
    // BELOW it. Without the flip, "Arrow up" drew an arrow pointing down.
    const d = -(st.dir || 1), x = pts[0].x, y = pts[0].y;
    ctx.save(); ctx.setLineDash([]); ctx.fillStyle = st.line;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 7, y - 12 * d);
    ctx.lineTo(x - 3, y - 12 * d);
    ctx.lineTo(x - 3, y - 24 * d);
    ctx.lineTo(x + 3, y - 24 * d);
    ctx.lineTo(x + 3, y - 12 * d);
    ctx.lineTo(x + 7, y - 12 * d);
    ctx.closePath(); ctx.fill();
    if (st.text) text(st.text, x + 10, y - 14 * d, st);
    ctx.restore();
}

function drawFlag(pts, st) {
    const x = pts[0].x, y = pts[0].y;
    ctx.save(); ctx.setLineDash([]);
    ctx.strokeStyle = st.line; ctx.lineWidth = 2;
    seg(x, y, x, y - 26);
    ctx.fillStyle = st.line;
    ctx.beginPath();
    ctx.moveTo(x, y - 26); ctx.lineTo(x + 20, y - 22); ctx.lineTo(x, y - 15);
    ctx.closePath(); ctx.fill();
    if (st.text) text(st.text, x + 24, y - 18, st);
    ctx.restore();
}

function drawPosition(s, pts, st, on) {
    const entry = s.pts[0].price, stop = s.pts[1].price;
    const target = s.pts[2] ? s.pts[2].price : entry;
    const yE = Y(entry), yS = Y(stop), yT = Y(target);
    if (yE === null || yS === null || yT === null) return;
    // The entry is the left edge; the box only ever opens forward in time.
    const l = pts[0].x;
    const r = Math.max(pts[1].x, pts[2] ? pts[2].x : pts[1].x, l + 70) + 8;

    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = rgba('#ef454a', 0.16);
    ctx.fillRect(l, Math.min(yE, yS), r - l, Math.abs(yS - yE));
    ctx.fillStyle = rgba('#20b26c', 0.16);
    ctx.fillRect(l, Math.min(yE, yT), r - l, Math.abs(yT - yE));
    ctx.strokeStyle = 'rgba(255,255,255,.14)';
    ctx.lineWidth = 1;
    ctx.strokeRect(l, Math.min(yE, yS), r - l, Math.abs(yS - yE));
    ctx.strokeRect(l, Math.min(yE, yT), r - l, Math.abs(yT - yE));

    ctx.strokeStyle = on ? SEL : (st.line || '#f7a600');
    ctx.lineWidth = 1.6;
    seg(l, yE, r, yE);

    // The numbers are noise until you are actually looking at this position,
    // so they only appear on hover or while it is selected.
    const show = on || hoverId === s.id;
    if (show) {
        const risk = Math.abs(entry - stop), reward = Math.abs(target - entry);
        const rr2 = risk ? reward / risk : 0;
        const side = (st.dir || 1) > 0 ? 'LONG' : 'SHORT';
        label(side + '  entry ' + money(entry), l + 4, yE - 6, st.line || '#f7a600');
        label('stop ' + money(stop) + '   -' + money(risk),
              l + 4, yS + (yS > yE ? 14 : -6), '#ef454a');
        label('target ' + money(target) + '   +' + money(reward) + '   ' + rr2.toFixed(2) + 'R',
              l + 4, yT + (yT > yE ? 14 : -6), '#20b26c');
        // All three levels are grabbable — the reward side is not locked to
        // any ratio.
        handle(pts[0].x, yE); handle(pts[1].x, yS); handle(pts[2] ? pts[2].x : pts[1].x, yT);
    }
    ctx.restore();
}

function barsBetween(t1, t2) {
    if (bars.length < 2) return 0;
    const step = bars[1].time - bars[0].time || 1;
    return Math.round(Math.abs(t2 - t1) / step);
}
function durationText(t1, t2) {
    const secs = Math.abs(t2 - t1);
    const d = Math.floor(secs / 86400), h = Math.floor(secs % 86400 / 3600), m = Math.floor(secs % 3600 / 60);
    return (d ? d + 'd ' : '') + (h ? h + 'h ' : '') + (d ? '' : m + 'm');
}

function statBox(x, y, linesArr, colour) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.font = '12px "IBM Plex Mono", monospace';
    let w = 0;
    linesArr.forEach(t => { w = Math.max(w, ctx.measureText(t).width); });
    w += 14;
    const h = linesArr.length * 15 + 8;
    ctx.fillStyle = 'rgba(11,14,17,.92)';
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    rr(x, y, w, h, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = colour;
    linesArr.forEach((t, i) => ctx.fillText(t, x + 7, y + 16 + i * 15));
    ctx.restore();
}

function drawRuler(s, pts) {
    const d = s.pts[1].price - s.pts[0].price;
    const pct = s.pts[0].price ? d / s.pts[0].price * 100 : 0;
    const col = d >= 0 ? '#20b26c' : '#ef454a';
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = rgba(col, 0.14);
    ctx.fillRect(Math.min(pts[0].x, pts[1].x), Math.min(pts[0].y, pts[1].y),
                 Math.abs(pts[1].x - pts[0].x), Math.abs(pts[1].y - pts[0].y));
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.4;
    seg(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
    arrowHead(pts[0], pts[1]);
    ctx.restore();
    statBox(pts[1].x + 8, pts[1].y - 26, [
        (d >= 0 ? '+' : '') + money(d) + '  (' + pct.toFixed(2) + '%)',
        barsBetween(s.pts[0].time, s.pts[1].time) + ' bars   ' + durationText(s.pts[0].time, s.pts[1].time)
    ], col);
}

function drawPRange(s, pts, st) {
    const d = s.pts[1].price - s.pts[0].price;
    const pct = s.pts[0].price ? d / s.pts[0].price * 100 : 0;
    const x = pts[0].x;
    ctx.save(); ctx.setLineDash([]);
    ctx.fillStyle = rgba(st.fill, st.fillOpacity);
    ctx.fillRect(x - 30, Math.min(pts[0].y, pts[1].y), 60, Math.abs(pts[1].y - pts[0].y));
    ctx.strokeStyle = st.line;
    seg(x, pts[0].y, x, pts[1].y);
    seg(x - 30, pts[0].y, x + 30, pts[0].y);
    seg(x - 30, pts[1].y, x + 30, pts[1].y);
    ctx.restore();
    statBox(x + 36, (pts[0].y + pts[1].y) / 2 - 14,
        [(d >= 0 ? '+' : '') + money(d), pct.toFixed(2) + '%'], st.line);
}

function drawDRange(s, pts, st) {
    const y = pts[0].y;
    ctx.save(); ctx.setLineDash([]);
    ctx.fillStyle = rgba(st.fill, st.fillOpacity);
    ctx.fillRect(Math.min(pts[0].x, pts[1].x), y - 22, Math.abs(pts[1].x - pts[0].x), 44);
    ctx.strokeStyle = st.line;
    seg(pts[0].x, y, pts[1].x, y);
    seg(pts[0].x, y - 22, pts[0].x, y + 22);
    seg(pts[1].x, y - 22, pts[1].x, y + 22);
    ctx.restore();
    statBox((pts[0].x + pts[1].x) / 2 - 40, y + 26,
        [barsBetween(s.pts[0].time, s.pts[1].time) + ' bars',
         durationText(s.pts[0].time, s.pts[1].time)], st.line);
}

function drawDPRange(s, pts, st) {
    const d = s.pts[1].price - s.pts[0].price;
    const pct = s.pts[0].price ? d / s.pts[0].price * 100 : 0;
    const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y);
    const w = Math.abs(pts[1].x - pts[0].x), h = Math.abs(pts[1].y - pts[0].y);
    ctx.save(); ctx.setLineDash([]);
    ctx.fillStyle = rgba(st.fill, st.fillOpacity);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = st.line; ctx.strokeRect(x, y, w, h);
    seg(x, pts[0].y, x + w, pts[0].y);
    ctx.restore();
    statBox(x + w + 8, y, [
        (d >= 0 ? '+' : '') + money(d) + '  (' + pct.toFixed(2) + '%)',
        barsBetween(s.pts[0].time, s.pts[1].time) + ' bars   ' + durationText(s.pts[0].time, s.pts[1].time)
    ], st.line);
}

function handle(x, y) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = '#0b0e11'; ctx.strokeStyle = SEL; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
}
function lockPip(p) {
    ctx.save(); ctx.setLineDash([]); ctx.fillStyle = '#f7a600';
    ctx.beginPath(); ctx.arc(p.x, p.y - 15, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function label(t, x, y, colour) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.font = '12px "IBM Plex Mono", monospace';
    const w = ctx.measureText(t).width + 9;
    ctx.fillStyle = 'rgba(11,14,17,.86)';
    ctx.fillRect(x, y - 11, w, 15);
    ctx.fillStyle = colour;
    ctx.fillText(t, x + 4, y);
    ctx.restore();
}
function text(t, x, y, st) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.font = fontOf(st);
    ctx.fillStyle = st.textColor || '#eaecef';
    String(t).split('\n').forEach((line, i) =>
        ctx.fillText(line, x, y + i * ((+st.fontSize || 12) + 4)));
    ctx.restore();
}

// ================================================================= tool rail

function icon(name) {
    return '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">' +
           (ICO[name] || '') + '</svg>';
}

/* Starred tools. Forty tools behind seven fly-outs is thorough but slow when
   you reach for the same four all day, so they can be pinned and are then one
   right-click away anywhere on the chart. */
let favTools = [];
try { favTools = JSON.parse(localStorage.getItem('bt.replay.favtools') || 'null') ||
                 ['trend', 'hline', 'fib', 'position']; }
catch (e) { favTools = ['trend', 'hline', 'fib', 'position']; }
function saveFavTools() {
    try { localStorage.setItem('bt.replay.favtools', JSON.stringify(favTools)); } catch (e) {}
}
function toggleFavTool(t) {
    const i = favTools.indexOf(t);
    if (i >= 0) favTools.splice(i, 1); else favTools.push(t);
    saveFavTools();
}

let railEl = null, openFly = null;
let groupPick = {};
try { groupPick = JSON.parse(localStorage.getItem('bt.replay.grouppick') || '{}'); }
catch (e) { groupPick = {}; }

function buildRail() {
    railEl = document.getElementById('rp-rail');
    if (!railEl) return;
    railEl.innerHTML = GROUPS.map(g => {
        const cur = T[groupPick[g.id]] ? groupPick[g.id] : g.tools[0];
        return '<div class="rp-tgroup" data-group="' + g.id + '">' +
                 '<button class="rp-rail-btn" data-pick="' + cur + '" title="' + T[cur].name +
                 '">' + icon(cur) + (g.tools.length > 1 ? '<i class="rp-caret"></i>' : '') +
                 '</button></div>';
    }).join('') +
    '<span class="rp-rail-sep"></span>' +
    '<button class="rp-rail-btn util" data-util="magnet" title="Magnet - snap to OHLC">' + icon('magnet') + '</button>' +
    '<button class="rp-rail-btn util" data-util="lock" title="Lock all drawings">' + icon('lock') + '</button>' +
    '<button class="rp-rail-btn util" data-util="hide" title="Hide all drawings">' + icon('eye') + '</button>' +
    '<button class="rp-rail-btn util danger" data-util="clear" title="Remove all drawings">' + icon('trash') + '</button>';

    railEl.querySelectorAll('.rp-tgroup').forEach(el => {
        const g = GROUPS.find(x => x.id === el.dataset.group);
        const btn = el.querySelector('button');
        btn.addEventListener('click', e => {
            // A click in the caret corner opens the menu; anywhere else picks
            // the tool that is already showing — the TradingView behaviour.
            const r = btn.getBoundingClientRect();
            if (g.tools.length > 1 && e.clientX > r.right - 12 && e.clientY > r.bottom - 12) {
                if (openFly === el) closeFly(); else flyout(g, el);
            } else {
                closeFly();
                setTool(btn.dataset.pick);
            }
        });
        btn.addEventListener('contextmenu', e => { e.preventDefault(); flyout(g, el); });
        let hoverT = null;
        btn.addEventListener('mouseenter', () => {
            if (g.tools.length < 2) return;
            hoverT = setTimeout(() => flyout(g, el), 500);
        });
        btn.addEventListener('mouseleave', () => clearTimeout(hoverT));
    });

    railEl.querySelectorAll('[data-util]').forEach(b =>
        b.addEventListener('click', () => {
            const u = b.dataset.util;
            if (u === 'magnet') { magnet = !magnet; b.classList.toggle('on', magnet); }
            if (u === 'lock')   { lockAll = !lockAll; b.classList.toggle('on', lockAll); closeHud(); render(); }
            if (u === 'hide')   { hideAll = !hideAll; b.classList.toggle('on', hideAll); closeHud(); render(); }
            if (u === 'clear' && shapes.length) {
                const n = shapes.length;
                const go = ok => { if (ok) api.clear(); };
                // The host page owns the styled dialog; fall back only if it
                // has not registered one.
                if (window.BTConfirm) {
                    window.BTConfirm('Remove all drawings?',
                        n === 1 ? 'This deletes the one drawing on this chart. '
                                + 'It can be undone with Ctrl+Z.'
                                : 'This deletes all ' + n + ' drawings on this chart. '
                                + 'It can be undone with Ctrl+Z.',
                        'Remove all').then(go);
                } else go(confirm('Remove all ' + n + ' drawings?'));
            }
        }));

    document.addEventListener('mousedown', e => {
        // Not every mousedown targets an element — a document- or text-node
        // target has no closest() and threw straight through this handler.
        if (!openFly) return;
        const t = e.target;
        if (!t || typeof t.closest !== 'function' || !t.closest('.rp-flyout, .rp-tgroup')) closeFly();
    });
}

function flyout(g, el) {
    closeFly();
    const box = document.createElement('div');
    box.className = 'rp-flyout';
    box.innerHTML = '<h5>' + g.name + '</h5>' + g.tools.map(t =>
        '<div class="rp-fly-row">' +
          '<button data-tool="' + t + '"' + (tool === t ? ' class="on"' : '') + '>' +
            icon(t) + '<span>' + T[t].name + '</span></button>' +
          '<button class="rp-fly-star' + (favTools.indexOf(t) >= 0 ? ' on' : '') +
            '" data-fav="' + t + '" title="Pin to the right-click menu">&#9733;</button>' +
        '</div>').join('');
    document.body.appendChild(box);
    const r = el.getBoundingClientRect();
    box.style.left = (r.right + 6) + 'px';
    box.style.top = Math.max(8, Math.min(window.innerHeight - box.offsetHeight - 8, r.top - 4)) + 'px';
    box.querySelectorAll('[data-fav]').forEach(b =>
        b.addEventListener('click', e => {
            e.stopPropagation();
            toggleFavTool(b.dataset.fav);
            b.classList.toggle('on');
        }));
    box.querySelectorAll('[data-tool]').forEach(b =>
        b.addEventListener('click', () => {
            const t = b.dataset.tool;
            groupPick[g.id] = t;
            try { localStorage.setItem('bt.replay.grouppick', JSON.stringify(groupPick)); } catch (e) {}
            const head = el.querySelector('button');
            head.dataset.pick = t;
            head.innerHTML = icon(t) + '<i class="rp-caret"></i>';
            head.title = T[t].name;
            setTool(t);
            closeFly();
        }));
    openFly = el;
}
function closeFly() {
    document.querySelectorAll('.rp-flyout').forEach(n => n.remove());
    openFly = null;
}

// ============================================== floating style HUD (TV-like)

let hudEl = null, hudId = null;

let hudOffset = { dx: 0, dy: 0 };   // where the trader dragged it to

function buildHud() {
    hudEl = document.createElement('div');
    hudEl.id = 'rp-tb';
    hudEl.className = 'rp-tb';
    hudEl.hidden = true;
    host.appendChild(hudEl);

    /* The toolbar sits over the shape it belongs to, which is exactly where
       you often need to see. Dragging stores an OFFSET rather than a fixed
       point, so it still follows the next shape you select — just from
       wherever you like it. */
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    hudEl.addEventListener('mousedown', e => {
        if (e.target.closest('button')) return;
        dragging = true;
        sx = e.clientX; sy = e.clientY;
        ox = hudOffset.dx; oy = hudOffset.dy;
        hudEl.classList.add('dragging');
        e.preventDefault(); e.stopPropagation();
    });
    window.addEventListener('mousemove', e => {
        if (!dragging) return;
        hudOffset = { dx: ox + e.clientX - sx, dy: oy + e.clientY - sy };
        const sh = shapes.find(x => x.id === selected);
        if (sh) placeHud(sh);
    });
    window.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        hudEl.classList.remove('dragging');
        try { localStorage.setItem('bt.replay.tbOffset', JSON.stringify(hudOffset)); } catch (e) {}
    });
    try {
        const o = JSON.parse(localStorage.getItem('bt.replay.tbOffset') || 'null');
        if (o && isFinite(o.dx) && isFinite(o.dy)) hudOffset = o;
    } catch (e) {}
}

function dashIcon(d) {
    const p = d === 'dashed' ? '4 3' : d === 'dotted' ? '1.5 3' : '0';
    return '<svg width="20" height="8" viewBox="0 0 20 8"><path d="M1 4h18" stroke="currentColor" ' +
           'stroke-width="2" stroke-dasharray="' + p + '" stroke-linecap="round"/></svg>';
}

function hudFor(s) {
    const st = styleOf(s);
    const cap = spec(s).cap;
    const kind = spec(s).kind;
    let h = '';
    const sw = (key, val, title) =>
        '<button class="rp-tb-sw" data-sw="' + key + '" title="' + title + '">' +
        '<i style="background:' + val + '"></i></button>';

    if (cap !== 'trade') h += sw('line', st.line, 'Line colour');
    if (cap === 'area' || cap === 'text' || st.closed) h += sw('fill', rgba(st.fill, Math.max(st.fillOpacity, .4)), 'Fill');
    if (cap === 'text') h += sw('textColor', st.textColor, 'Text colour');

    if (cap !== 'trade' && cap !== 'mark') {
        h += '<button class="rp-tb-b" data-menu="width" title="Line width"><b>' + st.width + '</b></button>';
        h += '<button class="rp-tb-b" data-menu="dash" title="Line style">' + dashIcon(st.dash) + '</button>';
    }
    if (kind === 'line') {
        h += '<button class="rp-tb-b' + (st.extendLeft ? ' on' : '') + '" data-t="extendLeft" title="Extend left">&#8676;</button>';
        h += '<button class="rp-tb-b' + (st.extendRight ? ' on' : '') + '" data-t="extendRight" title="Extend right">&#8677;</button>';
        h += '<button class="rp-tb-b' + (st.arrowRight ? ' on' : '') + '" data-t="arrowRight" title="Arrow head">&#8594;</button>';
    }
    if (cap === 'text') {
        h += '<button class="rp-tb-b" data-menu="font" title="Font size"><b>' + st.fontSize + '</b></button>';
        h += '<button class="rp-tb-b' + (st.bold ? ' on' : '') + '" data-t="bold" title="Bold"><b>B</b></button>';
        h += '<button class="rp-tb-b' + (st.italic ? ' on' : '') + '" data-t="italic" title="Italic"><i>I</i></button>';
    }
    if (cap === 'trade') {
        h += '<button class="rp-tb-b" data-act="flip" title="Flip long / short">&#8645;</button>';
        h += '<button class="rp-tb-b accent" data-act="ticket" title="Send to order ticket">Trade</button>';
    }
    h += '<span class="rp-tb-sep"></span>';
    h += '<button class="rp-tb-b' + (s.locked ? ' on' : '') + '" data-act="lock" title="Lock">' +
         '<svg width="13" height="13" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor"/>' +
         '<path d="M8 10V7a4 4 0 018 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>';
    h += '<button class="rp-tb-b" data-act="clone" title="Clone">&#10697;</button>';
    h += '<button class="rp-tb-b" data-act="cfg" title="Settings">&#9881;</button>';
    h += '<button class="rp-tb-b danger" data-act="del" title="Delete">&times;</button>';
    return h;
}

function openHud(id) {
    const s = shapes.find(x => x.id === id);
    if (!s || !hudEl) return;
    hudId = id;
    hudEl.innerHTML = hudFor(s);
    hudEl.hidden = false;
    placeHud(s);

    hudEl.querySelectorAll('[data-sw]').forEach(b =>
        b.addEventListener('click', () => {
            const key = b.dataset.sw;
            palette(b, styleOf(s)[key], v => {
                setStyle(s, key, v);
                b.querySelector('i').style.background = key === 'fill' ? rgba(v, .5) : v;
            }, key === 'fill' ? s : null);
        }));

    hudEl.querySelectorAll('[data-t]').forEach(b =>
        b.addEventListener('click', () => {
            setStyle(s, b.dataset.t, !styleOf(s)[b.dataset.t]);
            b.classList.toggle('on');
        }));

    hudEl.querySelectorAll('[data-menu]').forEach(b =>
        b.addEventListener('click', () => {
            const m = b.dataset.menu;
            if (m === 'width') menu(b, [1, 1.5, 2, 3, 4].map(v => ({ label: v + ' px', value: v })),
                v => { setStyle(s, 'width', v); b.innerHTML = '<b>' + v + '</b>'; });
            if (m === 'dash') menu(b, ['solid', 'dashed', 'dotted'].map(v => ({ label: v, value: v, html: dashIcon(v) })),
                v => { setStyle(s, 'dash', v); b.innerHTML = dashIcon(v); });
            if (m === 'font') menu(b, [10, 12, 14, 18, 24, 32].map(v => ({ label: v + ' px', value: v })),
                v => { setStyle(s, 'fontSize', v); b.innerHTML = '<b>' + v + '</b>'; });
        }));

    hudEl.querySelectorAll('[data-act]').forEach(b =>
        b.addEventListener('click', () => {
            const a = b.dataset.act;
            if (a === 'lock')  { s.locked = !s.locked; commit(); openHud(s.id); }
            if (a === 'clone') {
                const step = bars.length > 1 ? (bars[1].time - bars[0].time) * 6 : 3600;
                shapes.push({
                    id: ++seq, tool: s.tool,
                    pts: s.pts.map(p => ({ time: p.time + step, price: p.price })),
                    style: Object.assign({}, s.style), locked: false, hidden: false
                });
                selected = shapes[shapes.length - 1].id;
                commit(); openHud(selected);
            }
            if (a === 'cfg')    openSettings(s.id);
            if (a === 'del')    remove(s.id);
            if (a === 'flip')   { flipPosition(s); commit(); }
            if (a === 'ticket') submitDrawing(s);
        }));
}

function flipPosition(s) {
    const dir = (s.style.dir || 1) > 0 ? -1 : 1;
    s.style.dir = dir;
    const entry = s.pts[0].price;
    const risk = Math.abs(entry - s.pts[1].price);
    const rew  = Math.abs((s.pts[2] ? s.pts[2].price : entry) - entry);
    s.pts[1].price = dir > 0 ? entry - risk : entry + risk;
    if (s.pts[2]) s.pts[2].price = dir > 0 ? entry + rew : entry - rew;
}

function setStyle(s, key, value) {
    s.style = Object.assign(styleOf(s), { [key]: value });
    rememberStyle(s);
    commit();
}

function placeHud(s) {
    if (!hudEl || hudEl.hidden) return;
    const pts = s.pts.map(pxOf);
    if (pts.some(p => p === null)) { hudEl.hidden = true; return; }
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const cx = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2;
    const top = Math.min.apply(null, ys);
    const w = hudEl.offsetWidth || 320, h = hudEl.offsetHeight || 32;
    hudEl.style.left = Math.max(6, Math.min(cvs.clientWidth - w - 6, cx - w / 2 + hudOffset.dx)) + 'px';
    hudEl.style.top  = Math.max(6, Math.min(cvs.clientHeight - h - 6, top - h - 12 + hudOffset.dy)) + 'px';
}
function closeHud() { if (hudEl) hudEl.hidden = true; hudId = null; closePop(); }

function place() {
    placeSettings();
    if (selected === null) { closeHud(); return; }
    const s = shapes.find(x => x.id === selected);
    if (!s) { closeHud(); return; }
    // Rebuild when the selection moved to a different shape — a rectangle's
    // toolbar is not a trend line's, and only repositioning it leaves the
    // wrong buttons under the cursor.
    if (hudEl.hidden || hudId !== s.id) openHud(s.id); else placeHud(s);
}

// ----------------------------------------------------------- small popovers

let popEl = null;
function closePop() { if (popEl) { popEl.remove(); popEl = null; } }

function popAt(anchor, html) {
    closePop();
    popEl = document.createElement('div');
    popEl.className = 'rp-pop';
    popEl.innerHTML = html;
    document.body.appendChild(popEl);
    const r = anchor.getBoundingClientRect();
    popEl.style.left = Math.max(8, Math.min(window.innerWidth - popEl.offsetWidth - 8, r.left - 10)) + 'px';
    popEl.style.top  = (r.bottom + 6) + 'px';
    const el = popEl;
    setTimeout(() => document.addEventListener('mousedown', outside), 0);
    function outside(e) {
        if (el && !el.contains(e.target)) {
            document.removeEventListener('mousedown', outside);
            if (popEl === el) closePop();
        }
    }
    return popEl;
}

/* One shelf of colours across the whole product: the ten everyone uses,
   then the last three the trader mixed themselves. BTUI owns both lists so
   the toolbar here and the swatches in every dialog stay in step. */
function paletteColours() {
    return window.BTUI ? window.BTUI.swatches() : PALETTE;
}

function palette(anchor, current, cb, fillShape) {
    const p = popAt(anchor,
        '<div class="rp-pal">' + paletteColours().map(c =>
            '<button data-c="' + c + '" style="background:' + c + '"' +
            (c === current ? ' class="on"' : '') + '></button>').join('') + '</div>' +
        (fillShape ? '<label class="rp-pop-row">Opacity<input type="range" min="0" max="100" value="' +
            Math.round((styleOf(fillShape).fillOpacity || 0) * 100) + '" data-op></label>' : '') +
        '<label class="rp-pop-row">Custom<input type="color" data-btui="skip" value="' +
            (current || '#ffffff') + '" data-custom></label>');
    p.querySelectorAll('[data-c]').forEach(b =>
        b.addEventListener('click', () => { cb(b.dataset.c); closePop(); }));
    const cu = p.querySelector('[data-custom]');
    if (cu) {
        cu.addEventListener('input', () => cb(cu.value));
        // Banked on change, not on input: every shade dragged through the
        // wheel would otherwise burn one of the three slots.
        cu.addEventListener('change', () => {
            if (window.BTUI) window.BTUI.remember(cu.value);
        });
    }
    const op = p.querySelector('[data-op]');
    if (op) op.addEventListener('input', () => setStyle(fillShape, 'fillOpacity', +op.value / 100));
}

function menu(anchor, items, cb) {
    const p = popAt(anchor, '<div class="rp-menu">' + items.map(i =>
        '<button data-v="' + i.value + '">' + (i.html || '') +
        '<span>' + i.label + '</span></button>').join('') + '</div>');
    p.querySelectorAll('[data-v]').forEach(b =>
        b.addEventListener('click', () => {
            const raw = b.dataset.v;
            cb(isNaN(+raw) ? raw : +raw);
            closePop();
        }));
}

// ========================================================== settings dialog

let cfgEl = null, cfgId = null;

function row(lab, html) {
    return '<label class="rp-cf-row"><span>' + lab + '</span>' + html + '</label>';
}

function openSettings(id, focusText) {
    const s = shapes.find(x => x.id === id);
    if (!s) return;
    closeSettings();
    cfgId = id;
    const st = styleOf(s);
    const cap = spec(s).cap;
    const kind = spec(s).kind;
    let body = '';

    if (cap === 'text' || cap === 'mark' || kind === 'ob') {
        body += row('Text', '<textarea data-s="text" rows="2">' +
            String(st.text || '').replace(/</g, '&lt;') + '</textarea>');
        body += row('Font size', '<input type="number" min="8" max="60" data-s="fontSize" value="' + st.fontSize + '">');
        body += row('Text colour', '<input type="color" data-s="textColor" value="' + st.textColor + '">');
        body += row('Bold', '<input type="checkbox" data-s="bold"' + (st.bold ? ' checked' : '') + '>');
    }
    if (cap !== 'trade') {
        body += row('Line colour', '<input type="color" data-s="line" value="' + st.line + '">');
        body += row('Line width', '<input type="number" min="1" max="8" step="0.5" data-s="width" value="' + st.width + '">');
        body += row('Line style', '<select data-s="dash">' + ['solid', 'dashed', 'dotted'].map(o =>
            '<option value="' + o + '"' + (st.dash === o ? ' selected' : '') + '>' +
            o[0].toUpperCase() + o.slice(1) + '</option>').join('') + '</select>');
    }
    if (cap === 'area' || cap === 'text' || st.closed) {
        body += row('Fill', '<input type="color" data-s="fill" value="' + st.fill + '">');
        body += row('Fill opacity', '<input type="range" min="0" max="100" data-s="fillOpacity" data-pct value="' +
            Math.round(st.fillOpacity * 100) + '">');
    }
    if (kind === 'line' || spec(s).extend) {
        body += row('Extend left', '<input type="checkbox" data-s="extendLeft"' + (st.extendLeft ? ' checked' : '') + '>');
        body += row('Extend right', '<input type="checkbox" data-s="extendRight"' + (st.extendRight ? ' checked' : '') + '>');
    }
    if (kind === 'line') {
        body += row('Arrow head', '<input type="checkbox" data-s="arrowRight"' + (st.arrowRight ? ' checked' : '') + '>');
        body += row('Show angle', '<input type="checkbox" data-s="showAngle"' + (st.showAngle ? ' checked' : '') + '>');
    }
    if (kind === 'channel') {
        body += row('Centre line', '<input type="checkbox" data-s="middle"' + (st.middle ? ' checked' : '') + '>');
    }
    if (cap === 'line' || cap === 'area') {
        body += row('Show stats', '<input type="checkbox" data-s="showLabels"' + (st.showLabels ? ' checked' : '') + '>');
    }
    if (spec(s).levels) {
        body += row('Reverse', '<input type="checkbox" data-s="reverse"' + (st.reverse ? ' checked' : '') + '>');
        body += row('Show ratios', '<input type="checkbox" data-s="showPercent"' + (st.showPercent ? ' checked' : '') + '>');
        body += row('Show prices', '<input type="checkbox" data-s="showPrices"' + (st.showPrices ? ' checked' : '') + '>');
        body += row('Shade between', '<input type="checkbox" data-s="fillLevels"' + (st.fillLevels ? ' checked' : '') + '>');
        body += '<div class="rp-lv-head"><span>Levels <i>' + levelsOf(s).length + '</i></span>' +
                '<button data-act="lvreset" title="Back to the defaults">Reset</button></div>' +
                '<div class="rp-lv-list">' + levelsOf(s).map((L, i) =>
                  '<div class="rp-lv-row" data-lv="' + i + '">' +
                    '<input type="checkbox" data-lk="on"' + (L.on ? ' checked' : '') + '>' +
                    '<input type="number" step="any" data-lk="r" value="' + L.r + '">' +
                    '<input type="color" data-lk="c" value="' + L.c + '">' +
                    '<button data-lvdel="' + i + '" title="Remove">&times;</button>' +
                  '</div>').join('') + '</div>' +
                '<button class="rp-btn full" data-act="lvadd">+ Add level</button>';
    }
    if (kind === 'position') {
        const entry = s.pts[0].price, stop = s.pts[1].price;
        const target = s.pts[2] ? s.pts[2].price : entry;
        body +=
          row('Direction', '<select data-dir><option value="1"' + ((st.dir || 1) > 0 ? ' selected' : '') +
            '>Long</option><option value="-1"' + ((st.dir || 1) < 0 ? ' selected' : '') + '>Short</option></select>') +
          row('Entry',  '<input type="number" step="any" data-p="0" value="' + money(entry) + '">') +
          row('Stop',   '<input type="number" step="any" data-p="1" value="' + money(stop) + '">') +
          row('Target', '<input type="number" step="any" data-p="2" value="' + money(target) + '">') +
          '<div class="rp-cf-read"></div>' +
          '<button class="rp-btn accent full" data-act="trade">Trade this setup</button>' +
          '<button class="rp-btn full" data-act="send">Copy levels to the order panel</button>';
    }
    body += row('Locked', '<input type="checkbox" data-lock' + (s.locked ? ' checked' : '') + '>');

    cfgEl = document.createElement('div');
    cfgEl.className = 'rp-cf';
    cfgEl.innerHTML =
        '<header><span>' + spec(s).name + '</span>' +
        '<button data-act="close" aria-label="Close">&times;</button></header>' +
        '<div class="rp-cf-body">' + body +
        '<div class="rp-cf-foot">' +
          '<button class="rp-btn danger" data-act="del">Delete</button>' +
          '<button class="rp-btn" data-act="done">Done</button>' +
        '</div></div>';
    host.appendChild(cfgEl);
    cfgEl.querySelector('header').addEventListener('mousedown', onCfgDown);
    placeSettings();
    readout(s);

    cfgEl.querySelectorAll('[data-s]').forEach(inp =>
        inp.addEventListener('input', () => {
            const sh = shapes.find(x => x.id === cfgId);
            if (!sh) return;
            let v;
            if (inp.type === 'checkbox') v = inp.checked;
            else if (inp.hasAttribute('data-pct')) v = +inp.value / 100;
            else if (inp.type === 'number') v = +inp.value;
            else v = inp.value;
            sh.style = Object.assign(styleOf(sh), { [inp.dataset.s]: v });
            rememberStyle(sh);
            render();
            if (onChange) onChange(serialize());
        }));

    cfgEl.querySelectorAll('[data-p]').forEach(inp =>
        inp.addEventListener('input', () => {
            const sh = shapes.find(x => x.id === cfgId);
            if (!sh) return;
            const v = parseFloat(inp.value);
            if (!isFinite(v)) return;
            const i = +inp.dataset.p;
            if (!sh.pts[i]) sh.pts[i] = { time: sh.pts[0].time, price: v };
            else sh.pts[i] = { time: sh.pts[i].time, price: v };
            render(); readout(sh);
            if (onChange) onChange(serialize());
        }));

    // Levels are edited in place; the shape keeps its own copy so two fibs on
    // one chart can carry different sets.
    function writeLevels(next) {
        const sh = shapes.find(x => x.id === cfgId);
        if (!sh) return;
        sh.style = Object.assign(styleOf(sh), { levels: next });
        rememberStyle(sh);
        commit();
        openSettings(cfgId);
    }
    cfgEl.querySelectorAll('.rp-lv-row [data-lk]').forEach(inp =>
        inp.addEventListener('input', () => {
            const sh = shapes.find(x => x.id === cfgId);
            if (!sh) return;
            const i = +inp.closest('.rp-lv-row').dataset.lv;
            const next = levelsOf(sh).map(L => ({ r: L.r, on: L.on, c: L.c }));
            const k = inp.dataset.lk;
            next[i][k] = k === 'on' ? inp.checked : k === 'r' ? parseFloat(inp.value) : inp.value;
            sh.style = Object.assign(styleOf(sh), { levels: next });
            rememberStyle(sh);
            render();
            if (onChange) onChange(serialize());
        }));
    cfgEl.querySelectorAll('[data-lvdel]').forEach(b =>
        b.addEventListener('click', () => {
            const sh = shapes.find(x => x.id === cfgId);
            if (!sh) return;
            const next = levelsOf(sh).filter((_, i) => i !== +b.dataset.lvdel);
            writeLevels(next);
        }));
    const lvAdd = cfgEl.querySelector('[data-act="lvadd"]');
    if (lvAdd) lvAdd.addEventListener('click', () => {
        const sh = shapes.find(x => x.id === cfgId);
        if (!sh) return;
        const cur = levelsOf(sh).map(L => ({ r: L.r, on: L.on, c: L.c }));
        cur.push({ r: 1.618, on: true, c: LEVEL_COLOURS[cur.length % LEVEL_COLOURS.length] });
        writeLevels(cur);
    });
    const lvReset = cfgEl.querySelector('[data-act="lvreset"]');
    if (lvReset) lvReset.addEventListener('click', () => {
        const sh = shapes.find(x => x.id === cfgId);
        if (sh) writeLevels(lvl(DEFAULT_LEVELS[spec(sh).levels] || []));
    });

    const dirSel = cfgEl.querySelector('[data-dir]');
    if (dirSel) dirSel.addEventListener('change', () => {
        const sh = shapes.find(x => x.id === cfgId);
        if (sh && (sh.style.dir || 1) !== +dirSel.value) { flipPosition(sh); commit(); openSettings(cfgId); }
    });
    const lk = cfgEl.querySelector('[data-lock]');
    if (lk) lk.addEventListener('change', () => {
        const sh = shapes.find(x => x.id === cfgId);
        if (sh) { sh.locked = lk.checked; commit(); openHud(sh.id); }
    });
    cfgEl.querySelector('[data-act="close"]').addEventListener('click', closeSettings);
    cfgEl.querySelector('[data-act="done"]').addEventListener('click', closeSettings);
    cfgEl.querySelector('[data-act="del"]').addEventListener('click', () => remove(cfgId));
    const send = cfgEl.querySelector('[data-act="send"]');
    if (send) send.addEventListener('click', () => {
        const sh = shapes.find(x => x.id === cfgId);
        if (sh) sendToOrderPanel(sh, true);
    });
    const trade = cfgEl.querySelector('[data-act="trade"]');
    if (trade) trade.addEventListener('click', () => {
        const sh = shapes.find(x => x.id === cfgId);
        if (sh) submitDrawing(sh);
    });
    if (focusText) {
        const ta = cfgEl.querySelector('[data-s="text"]');
        if (ta) { ta.focus(); ta.select(); }
    }
}

// Refresh only the numeric readout while typing, so focus is not stolen.
function readout(s) {
    if (!cfgEl) return;
    const box = cfgEl.querySelector('.rp-cf-read');
    if (!box || spec(s).kind !== 'position') return;
    const entry = s.pts[0].price, stop = s.pts[1].price;
    const target = s.pts[2] ? s.pts[2].price : entry;
    const risk = Math.abs(entry - stop), reward = Math.abs(target - entry);
    const pct = entry ? risk / entry * 100 : 0;
    box.innerHTML =
        '<span>Risk <b>' + money(risk) + '</b> (' + pct.toFixed(2) + '%)</span>' +
        '<span>Reward <b>' + money(reward) + '</b></span>' +
        '<span>R:R <b>' + (risk ? (reward / risk).toFixed(2) : '-') + '</b></span>' +
        '<span>Bars <b>' + barsBetween(s.pts[0].time, (s.pts[2] || s.pts[1]).time) + '</b></span>';
}

/* Like the floating toolbar, the dialog opens beside its drawing and is
   dragged by its header. What is stored is an OFFSET, not a fixed point, so it
   still follows the next drawing you open — just from where you put it. */
let cfgOffset = { dx: 0, dy: 0 };
let cfgDrag = null;

function placeSettings() {
    if (!cfgEl || cfgId === null) return;
    const s = shapes.find(x => x.id === cfgId);
    if (!s) { closeSettings(); return; }
    const p = pxOf(s.pts[0]);
    if (!p) return;
    const w = cfgEl.offsetWidth || 236, h = cfgEl.offsetHeight || 280;
    const x = p.x + 18 + cfgOffset.dx, y = p.y + 8 + cfgOffset.dy;
    const cx = Math.max(6, Math.min(Math.max(6, cvs.clientWidth  - w - 6), x));
    const cy = Math.max(6, Math.min(Math.max(6, cvs.clientHeight - h - 6), y));
    /* Store the clamp back into the offset while dragging. Without this the
       offset keeps growing past the edge and the panel refuses to come back
       until you have dragged all the invisible distance out again. */
    if (cfgDrag) { cfgOffset.dx += cx - x; cfgOffset.dy += cy - y; }
    cfgEl.style.left = cx + 'px';
    cfgEl.style.top  = cy + 'px';
}
function onCfgDown(e) {
    if (!cfgEl || e.target.closest('button')) return;
    cfgDrag = { sx: e.clientX, sy: e.clientY, dx: cfgOffset.dx, dy: cfgOffset.dy };
    cfgEl.classList.add('dragging');
    e.preventDefault(); e.stopPropagation();
}
function onCfgMove(e) {
    if (!cfgDrag) return;
    cfgOffset = { dx: cfgDrag.dx + e.clientX - cfgDrag.sx,
                  dy: cfgDrag.dy + e.clientY - cfgDrag.sy };
    placeSettings();
}
function onCfgUp() {
    if (!cfgDrag) return;
    cfgDrag = null;
    if (cfgEl) cfgEl.classList.remove('dragging');
}
function closeSettings() { if (cfgEl) { cfgEl.remove(); cfgEl = null; cfgId = null; } }

// -------------------------------------------------------------- persistence

function serialize() {
    return shapes.map(s => ({
        tool: s.tool, pts: s.pts, style: s.style,
        locked: !!s.locked, hidden: !!s.hidden
    }));
}
function load(list) {
    shapes = (list || []).map(s => ({
        id: ++seq,
        // v1 saved `type`; the tool ids are a superset, so old layouts open.
        tool: T[s.tool] ? s.tool : (T[s.type] ? s.type : 'trend'),
        pts: s.pts || [],
        style: Object.assign({}, DEFAULT_STYLE, migrate(s.style)),
        locked: !!s.locked, hidden: !!s.hidden
    })).filter(s => s.pts.length);
    selected = null; closeHud(); closeSettings(); render();
}
function migrate(st) {
    if (!st) return {};
    const out = Object.assign({}, st);
    if (out.color && !out.line) out.line = out.color;      // v1 key name
    return out;
}

// --------------------------------------------------------------------- api

/* The cursor group is not decoration. Cross keeps the chart's crosshair, Dot
   swaps it for a ring that follows the pointer, Arrow takes both away, and the
   eraser carries its own pointer — each one has to change the CHART as well as
   the CSS cursor, or picking Dot appeared to do nothing at all. */
function svgCursor(inner, hot) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22">' + inner + '</svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '") ' + hot + ', crosshair';
}
const CURSORS = {
    cursor:  'crosshair',
    pointer: 'default',
    dot:     svgCursor('<circle cx="11" cy="11" r="5" fill="none" stroke="#f7a600" stroke-width="2"/>' +
                       '<circle cx="11" cy="11" r="1.4" fill="#f7a600"/>', '11 11'),
    eraser:  svgCursor('<path d="M3 15l7-7 7 7-4 4H7z" fill="#ef454a" opacity=".85" ' +
                       'stroke="#ffffff" stroke-width="1.2" stroke-linejoin="round"/>', '4 18')
};
const NAV = { cursor: 1, dot: 1, pointer: 1 };
let navTool = 'cursor';        // the cursor to fall back to when a shape is done

function applyCursorMode(t) {
    const css = CURSORS[t] || 'crosshair';
    if (cvs)  cvs.style.cursor = css;
    if (host) host.style.cursor = css;
    if (!chart) return;
    const lines = t !== 'dot' && t !== 'pointer';
    try {
        chart.applyOptions({ crosshair: {
            vertLine: { visible: lines, labelVisible: t !== 'pointer' },
            horzLine: { visible: lines, labelVisible: t !== 'pointer' }
        } });
    } catch (e) {}
}

function setTool(t) {
    if (pending) { shapes = shapes.filter(x => x.id !== pending.id); pending = null; }
    tool = t;
    const nav = !!NAV[t];
    if (nav) navTool = t;
    applyCursorMode(t);
    if (railEl) railEl.querySelectorAll('.rp-rail-btn[data-pick]').forEach(b =>
        b.classList.toggle('active', b.dataset.pick === t));
    const nameEl = document.getElementById('rp-tool-name');
    if (nameEl) {
        const sp = T[t];
        const clicks = sp && sp.pts > 2 && !sp.drag
            ? '  —  click ' + sp.pts + ' points, Esc to cancel' : '';
        nameEl.textContent = (nav || !sp) ? '' : sp.name + clicks;
    }
    render();
}

const api = {
    attach: attach,
    setTool: setTool,
    getTool: function () { return tool; },
    tools: T,
    clear: function () { shapes = []; selected = null; closeHud(); closeSettings(); commit(); },
    count: function () { return shapes.length; },
    setBars: function (d) { bars = d || []; },
    undo: undo, redo: redo,
    serialize: serialize,
    load: load,
    render: render
};
return api;

})();
