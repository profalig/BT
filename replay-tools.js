/* ==========================================================================
   BarTest — drawing tools

   Behaves the way a chart is expected to: pick a tool, DRAG to draw, click a
   shape to select it, drag it to move, drag a handle to reshape, Delete to
   remove. Everything is saved automatically per symbol and comes back on
   reload.

   Shapes are stored as timestamp + price, never pixels, which is what keeps
   them stuck to the same candles through pan, zoom, timeframe changes and
   replay stepping. Screen positions are derived at paint time.

   The canvas itself never takes the mouse. Hit-testing happens on the
   container in the capture phase, and the event is only swallowed when a
   shape is actually grabbed — so the chart keeps its own pan and zoom
   everywhere else.
   ========================================================================== */
window.BTTools = (function () {
'use strict';

let chart, series, host, cvs, ctx;
let tool = 'cursor';
let shapes = [];
let selected = null;
let drag = null;            // { mode, id, handle, from, orig }
let seq = 0;
let onChange = null;

const ACCENT = '#f0b25a';
const SEL    = '#5aa9f0';
const POS    = '#12a184';
const NEG    = '#e2564e';
const HIT    = 7;           // px tolerance
const FIB    = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

// ---------------------------------------------------------------- lifecycle

function attach(_chart, _series, _host, opts) {
    chart = _chart; series = _series; host = _host;
    onChange = (opts && opts.onChange) || null;
    cvs = document.getElementById('rp-draw');
    ctx = cvs.getContext('2d');

    new ResizeObserver(resize).observe(host);
    resize();
    chart.timeScale().subscribeVisibleLogicalRangeChange(render);

    // Capture phase on the container: we get first refusal on every press,
    // and only consume it when a tool is armed or a shape is grabbed.
    host.addEventListener('mousedown', onDown, true);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.addEventListener('keydown', onKey);
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

// ------------------------------------------------------------- coordinates

const X = t => chart.timeScale().timeToCoordinate(t);
const Y = p => series.priceToCoordinate(p);

function toChart(e) {
    const r = cvs.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const price = series.coordinateToPrice(y);
    const time = chart.timeScale().coordinateToTime(x);
    if (price === null || time === null) return null;
    return { time: time, price: price, x: x, y: y };
}

function pxOf(pt) {
    const x = X(pt.time), y = Y(pt.price);
    return (x === null || y === null) ? null : { x: x, y: y };
}

// ------------------------------------------------------------- hit testing

function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Returns { id, handle } — handle is the index of a grabbed anchor, or -1
// for the body of the shape.
function hitTest(x, y) {
    for (let i = shapes.length - 1; i >= 0; i--) {      // topmost first
        const s = shapes[i];
        const pts = s.pts.map(pxOf);
        if (pts.some(p => p === null)) continue;

        for (let h = 0; h < pts.length; h++) {
            if (Math.hypot(x - pts[h].x, y - pts[h].y) <= HIT + 2) {
                return { id: s.id, handle: h };
            }
        }
        if (s.type === 'hline') {
            if (Math.abs(y - pts[0].y) <= HIT) return { id: s.id, handle: -1 };
        } else if (s.type === 'trend') {
            if (distToSegment(x, y, pts[0].x, pts[0].y, pts[1].x, pts[1].y) <= HIT)
                return { id: s.id, handle: -1 };
        } else if (s.type === 'rect' || s.type === 'position' || s.type === 'fib') {
            const l = Math.min(pts[0].x, pts[1].x), r = Math.max(pts[0].x, pts[1].x);
            const t = Math.min(pts[0].y, pts[1].y), b = Math.max(pts[0].y, pts[1].y);
            if (x >= l - HIT && x <= r + HIT && y >= t - HIT && y <= b + HIT)
                return { id: s.id, handle: -1 };
        }
    }
    return null;
}

// ------------------------------------------------------------------ events

function onDown(e) {
    if (e.button !== 0) return;
    const p = toChart(e);
    if (!p) return;

    if (tool !== 'cursor') {
        e.preventDefault(); e.stopPropagation();
        const s = { id: ++seq, type: tool, pts: [p, p] };
        if (tool === 'hline') { s.pts = [p]; shapes.push(s); commit(); setTool('cursor'); return; }
        shapes.push(s);
        selected = s.id;
        drag = { mode: 'create', id: s.id, handle: 1 };
        render();
        return;
    }

    const hit = hitTest(p.x, p.y);
    if (!hit) { if (selected !== null) { selected = null; render(); } return; }

    // Only swallow the event once we know a shape was grabbed, so clicking
    // empty chart still pans.
    e.preventDefault(); e.stopPropagation();
    selected = hit.id;
    const s = shapes.find(x => x.id === hit.id);
    drag = {
        mode: hit.handle >= 0 ? 'handle' : 'move',
        id: hit.id, handle: hit.handle,
        from: p, orig: s.pts.map(q => ({ time: q.time, price: q.price }))
    };
    render();
}

function onMove(e) {
    if (!drag) return;
    const p = toChart(e);
    if (!p) return;
    const s = shapes.find(x => x.id === drag.id);
    if (!s) return;

    if (drag.mode === 'create' || drag.mode === 'handle') {
        s.pts[drag.handle] = { time: p.time, price: p.price };
    } else {
        const dt = p.time - drag.from.time;
        const dp = p.price - drag.from.price;
        s.pts = drag.orig.map(q => ({ time: q.time + dt, price: q.price + dp }));
    }
    render();
}

function onUp() {
    if (!drag) return;
    const s = shapes.find(x => x.id === drag.id);
    const wasCreate = drag.mode === 'create';
    drag = null;

    // A click without a drag leaves a zero-size shape; drop it rather than
    // leaving an invisible artefact on the chart.
    if (s && s.pts.length > 1) {
        const a = pxOf(s.pts[0]), b = pxOf(s.pts[1]);
        if (a && b && Math.hypot(b.x - a.x, b.y - a.y) < 4) {
            shapes = shapes.filter(x => x.id !== s.id);
            selected = null;
        }
    }
    if (wasCreate) setTool('cursor');
    if (s && s.type === 'position') applyPositionToOrderPanel(s);
    commit();
}

function onKey(e) {
    if (/input|select|textarea/i.test(e.target.tagName)) return;
    if (e.key === 'Escape') { setTool('cursor'); selected = null; render(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected !== null) {
        e.preventDefault();
        shapes = shapes.filter(s => s.id !== selected);
        selected = null;
        commit();
    }
}

function commit() { render(); if (onChange) onChange(serialize()); }

// The position tool doubles as the order ticket: drag from entry to stop and
// the panel is sized from it, which is faster and less error-prone than
// typing point distances.
function applyPositionToOrderPanel(s) {
    const entry = s.pts[0].price, stop = s.pts[1].price;
    const dist = Math.abs(entry - stop);
    if (!dist) return;
    const stopEl = document.getElementById('rp-stop');
    const tgtEl  = document.getElementById('rp-target');
    if (!stopEl) return;
    stopEl.value = dist.toFixed(dist < 5 ? 4 : 2);
    if (tgtEl && (!+tgtEl.value || s.autoTarget !== false)) {
        tgtEl.value = (dist * 2).toFixed(dist < 5 ? 4 : 2);   // 2R by default
    }
    stopEl.dispatchEvent(new Event('input'));
}

// -------------------------------------------------------------------- paint

function render() {
    if (!ctx) return;
    const w = cvs.clientWidth, h = cvs.clientHeight;
    ctx.clearRect(0, 0, w, h);
    for (const s of shapes) drawShape(s, w, h);
}

function drawShape(s, w) {
    const pts = s.pts.map(pxOf);
    if (pts.some(p => p === null)) return;
    const on = s.id === selected;
    ctx.save();
    ctx.lineWidth = on ? 2 : 1.4;
    ctx.strokeStyle = on ? SEL : ACCENT;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = '10px "Share Tech Mono", monospace';

    if (s.type === 'hline') {
        ctx.beginPath(); ctx.moveTo(0, pts[0].y); ctx.lineTo(w, pts[0].y); ctx.stroke();
        tag(s.pts[0].price.toFixed(2), 6, pts[0].y - 5, ctx.strokeStyle);
        if (on) handle(pts[0].x || w / 2, pts[0].y);
    }
    else if (s.type === 'trend') {
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke();
        if (on) { handle(pts[0].x, pts[0].y); handle(pts[1].x, pts[1].y); }
    }
    else if (s.type === 'rect') {
        const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y);
        const ww = Math.abs(pts[1].x - pts[0].x), hh = Math.abs(pts[1].y - pts[0].y);
        ctx.globalAlpha = 0.12; ctx.fillRect(x, y, ww, hh); ctx.globalAlpha = 1;
        ctx.strokeRect(x, y, ww, hh);
        if (on) { handle(pts[0].x, pts[0].y); handle(pts[1].x, pts[1].y); }
    }
    else if (s.type === 'fib') {
        const hi = Math.max(s.pts[0].price, s.pts[1].price);
        const lo = Math.min(s.pts[0].price, s.pts[1].price);
        const l = Math.min(pts[0].x, pts[1].x), r = Math.max(pts[0].x, pts[1].x);
        for (const f of FIB) {
            const price = hi - (hi - lo) * f, y = Y(price);
            if (y === null) continue;
            ctx.globalAlpha = (f === 0 || f === 1) ? 0.95 : 0.55;
            ctx.beginPath(); ctx.moveTo(l, y); ctx.lineTo(r, y); ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillText((f * 100).toFixed(1) + '%  ' + price.toFixed(2), r + 6, y - 3);
        }
        if (on) { handle(pts[0].x, pts[0].y); handle(pts[1].x, pts[1].y); }
    }
    else if (s.type === 'position') {
        // Entry -> stop is the risk leg; an equal-and-opposite 2R leg is drawn
        // above it so the reward side is visible while dragging.
        const entry = s.pts[0].price, stop = s.pts[1].price;
        const target = entry + (entry - stop) * 2;
        const yE = Y(entry), yS = Y(stop), yT = Y(target);
        const l = Math.min(pts[0].x, pts[1].x), r = Math.max(pts[0].x, pts[1].x) + 90;
        if (yE === null || yS === null || yT === null) { ctx.restore(); return; }
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = NEG; ctx.fillRect(l, Math.min(yE, yS), r - l, Math.abs(yS - yE));
        ctx.fillStyle = POS; ctx.fillRect(l, Math.min(yE, yT), r - l, Math.abs(yT - yE));
        ctx.globalAlpha = 1;
        ctx.strokeStyle = ACCENT;
        ctx.beginPath(); ctx.moveTo(l, yE); ctx.lineTo(r, yE); ctx.stroke();
        tag('entry ' + entry.toFixed(2), l + 4, yE - 4, ACCENT);
        tag('stop ' + stop.toFixed(2), l + 4, yS + (yS > yE ? 12 : -4), NEG);
        tag('2R ' + target.toFixed(2), l + 4, yT + (yT > yE ? 12 : -4), POS);
        if (on) { handle(pts[0].x, yE); handle(pts[1].x, yS); }
    }
    ctx.restore();
}

function handle(x, y) {
    ctx.save();
    ctx.fillStyle = '#08080a'; ctx.strokeStyle = SEL; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
}

function tag(text, x, y, color) {
    ctx.save();
    ctx.font = '10px "Share Tech Mono", monospace';
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = 'rgba(8,8,10,0.86)';
    ctx.fillRect(x, y - 10, w, 13);
    ctx.fillStyle = color;
    ctx.fillText(text, x + 4, y);
    ctx.restore();
}

// ------------------------------------------------------------- persistence

function serialize() {
    return shapes.map(s => ({ type: s.type, pts: s.pts }));
}
function load(list) {
    shapes = (list || []).map(s => ({ id: ++seq, type: s.type, pts: s.pts }));
    selected = null;
    render();
}

// --------------------------------------------------------------------- api

function setTool(t) {
    tool = t;
    cvs.style.cursor = t === 'cursor' ? 'default' : 'crosshair';
    host.style.cursor = t === 'cursor' ? '' : 'crosshair';
    document.querySelectorAll('.rp-rail-btn[data-tool]').forEach(b =>
        b.classList.toggle('active', b.dataset.tool === t));
    render();
}

const api = {
    attach: attach,
    setTool: setTool,
    clear: function () { shapes = []; selected = null; commit(); },
    count: function () { return shapes.length; },
    serialize: serialize,
    load: load,
    render: render
};
return api;

})();
