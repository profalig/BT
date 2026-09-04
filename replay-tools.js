/* ==========================================================================
   BarTest — drawing tools

   A transparent canvas over the chart. Drawings are stored in CHART space
   (timestamp + price), never in pixels, so they stay pinned to the candles
   through pan, zoom, timeframe changes and replay stepping. Pixels are only
   computed at paint time, from the library's own coordinate conversion.

   pointer-events are off unless a tool is armed, so the chart keeps its own
   pan/zoom behaviour and the cursor tool is genuinely inert.
   ========================================================================== */
window.BTTools = (function () {
'use strict';

let chart, series, host, cvs, ctx;
let tool = 'cursor';
let drawings = [];          // { type, pts: [{time, price}], color }
let pending = null;         // drawing in progress
let hover = null;           // live cursor position while placing
let onChange = null;

const COLOR = '#f0b25a';
const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

function attach(_chart, _series, _host, opts) {
    chart = _chart; series = _series; host = _host;
    onChange = (opts && opts.onChange) || null;
    cvs = document.getElementById('rp-draw');
    ctx = cvs.getContext('2d');

    new ResizeObserver(resize).observe(host);
    resize();

    // Redraw whenever the chart moves under us.
    chart.timeScale().subscribeVisibleLogicalRangeChange(render);
    chart.subscribeCrosshairMove(param => {
        if (tool === 'cursor' || !pending) return;
        const p = toChartSpace(param);
        if (p) { hover = p; render(); }
    });

    cvs.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') { pending = null; setTool('cursor'); render(); }
    });
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
    render();
}

// Convert a crosshair event, or a raw mouse event, into {time, price}.
function toChartSpace(param) {
    if (!param || !param.point) return null;
    const price = series.coordinateToPrice(param.point.y);
    const time = param.time !== undefined && param.time !== null
        ? param.time
        : chart.timeScale().coordinateToTime(param.point.x);
    if (price === null || time === null) return null;
    return { time: time, price: price };
}

function eventToChartSpace(e) {
    const r = cvs.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const price = series.coordinateToPrice(y);
    const time = chart.timeScale().coordinateToTime(x);
    if (price === null || time === null) return null;
    return { time: time, price: price };
}

function onDown(e) {
    if (tool === 'cursor') return;
    const p = eventToChartSpace(e);
    if (!p) return;
    e.preventDefault();
    e.stopPropagation();

    if (tool === 'hline') {                     // one click is the whole shape
        drawings.push({ type: 'hline', pts: [p], color: COLOR });
        finish();
        return;
    }
    if (!pending) {
        pending = { type: tool, pts: [p], color: COLOR };
        hover = p;
    } else {
        pending.pts.push(p);
        drawings.push(pending);
        pending = null;
        finish();
    }
    render();
}

function finish() {
    setTool('cursor');
    if (onChange) onChange(drawings.length);
    render();
}

// ------------------------------------------------------------------ paint

const X = t => chart.timeScale().timeToCoordinate(t);
const Y = p => series.priceToCoordinate(p);

function render() {
    if (!ctx) return;
    const w = cvs.clientWidth, h = cvs.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const all = pending ? drawings.concat([withHover(pending)]) : drawings;
    for (const d of all) draw(d, w, h);
}

function withHover(d) {
    if (d.pts.length >= 2 || !hover) return d;
    return { type: d.type, color: d.color, pts: [d.pts[0], hover], ghost: true };
}

function draw(d, w, h) {
    ctx.save();
    ctx.strokeStyle = d.color;
    ctx.fillStyle = d.color;
    ctx.lineWidth = 1.4;
    if (d.ghost) ctx.setLineDash([4, 4]);

    if (d.type === 'hline') {
        const y = Y(d.pts[0].price);
        if (y === null) { ctx.restore(); return; }
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        label(d.pts[0].price.toFixed(2), 6, y - 5);
        ctx.restore();
        return;
    }

    if (d.pts.length < 2) { ctx.restore(); return; }
    const x1 = X(d.pts[0].time), y1 = Y(d.pts[0].price);
    const x2 = X(d.pts[1].time), y2 = Y(d.pts[1].price);
    if ([x1, y1, x2, y2].some(v => v === null)) { ctx.restore(); return; }

    if (d.type === 'trend') {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        handle(x1, y1); handle(x2, y2);
    } else if (d.type === 'rect') {
        ctx.globalAlpha = 0.12;
        ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
        ctx.globalAlpha = 1;
        ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
        handle(x1, y1); handle(x2, y2);
    } else if (d.type === 'fib') {
        const hi = Math.max(d.pts[0].price, d.pts[1].price);
        const lo = Math.min(d.pts[0].price, d.pts[1].price);
        const left = Math.min(x1, x2), right = Math.max(x1, x2);
        ctx.font = '10px "Share Tech Mono", monospace';
        for (const f of FIB) {
            const price = hi - (hi - lo) * f;
            const y = Y(price);
            if (y === null) continue;
            ctx.globalAlpha = (f === 0 || f === 1) ? 0.9 : 0.55;
            ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right + 46, y); ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillText((f * 100).toFixed(1) + '%  ' + price.toFixed(2), right + 5, y - 3);
        }
        handle(x1, y1); handle(x2, y2);
    }
    ctx.restore();
}

function handle(x, y) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = '#08080a';
    ctx.strokeStyle = COLOR;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
}

function label(text, x, y) {
    ctx.save();
    ctx.font = '10px "Share Tech Mono", monospace';
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = 'rgba(8,8,10,0.85)';
    ctx.fillRect(x, y - 11, w, 14);
    ctx.fillStyle = COLOR;
    ctx.fillText(text, x + 4, y);
    ctx.restore();
}

// -------------------------------------------------------------------- api

function setTool(t) {
    tool = t;
    if (t === 'cursor') pending = null;
    // The canvas must be transparent to the mouse unless a tool is armed, or
    // it would swallow the chart's own pan and zoom.
    cvs.style.pointerEvents = t === 'cursor' ? 'none' : 'auto';
    cvs.style.cursor = t === 'cursor' ? 'default' : 'crosshair';
    document.querySelectorAll('.rp-rail-btn[data-tool]').forEach(b =>
        b.classList.toggle('active', b.dataset.tool === t));
    render();
}

const api = {
    attach: attach,
    setTool: setTool,
    clear: function () { drawings = []; pending = null; finish(); },
    count: function () { return drawings.length; },
    render: render
};
return api;

})();
