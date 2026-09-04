/* ==========================================================================
   BarTest — drawing tools

   Pick a tool, drag to draw (one click for the single-point tools), click to
   select, drag to move, drag a handle to reshape, double-click for full
   settings, Delete to remove. Everything saves per symbol automatically.

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
let seq = 0;
let onChange = null;

const ACCENT = '#f0b25a';
const SEL    = '#5aa9f0';
const POS    = '#12a184';
const NEG    = '#e2564e';
const HIT    = 8;
const FIB    = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

// Tools that need only one point — a single click places them.
const ONE_CLICK = { hline: true, vline: true };

const DEFAULT_STYLE = { color: ACCENT, width: 1.4, dash: 'solid' };

// ---------------------------------------------------------------- lifecycle

function attach(_chart, _series, _host, opts) {
    chart = _chart; series = _series; host = _host;
    onChange = (opts && opts.onChange) || null;
    cvs = document.getElementById('rp-draw');
    ctx = cvs.getContext('2d');

    new ResizeObserver(resize).observe(host);
    resize();
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => { render(); placeCfg(); });

    host.addEventListener('mousedown', onDown, true);
    host.addEventListener('dblclick', onDblClick, true);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.addEventListener('keydown', onKey);
    buildCfgPanel();
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
    render(); placeCfg();
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
const styleOf = s => Object.assign({}, DEFAULT_STYLE, s.style || {});

// ------------------------------------------------------------- hit testing

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
        const pts = s.pts.map(pxOf);
        if (pts.some(p => p === null)) continue;

        for (let h = 0; h < pts.length; h++) {
            if (Math.hypot(x - pts[h].x, y - pts[h].y) <= HIT + 2) return { id: s.id, handle: h };
        }
        if (s.type === 'hline') {
            if (Math.abs(y - pts[0].y) <= HIT) return { id: s.id, handle: -1 };
        } else if (s.type === 'trend') {
            if (distToSegment(x, y, pts[0].x, pts[0].y, pts[1].x, pts[1].y) <= HIT)
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

// ------------------------------------------------------------------ events

function onDown(e) {
    if (e.button !== 0) return;
    const p = toChart(e);
    if (!p) return;

    if (tool !== 'cursor') {
        e.preventDefault(); e.stopPropagation();
        const s = { id: ++seq, type: tool, pts: [p], style: Object.assign({}, DEFAULT_STYLE) };

        if (ONE_CLICK[tool]) { shapes.push(s); selected = s.id; commit(); setTool('cursor'); return; }

        if (tool === 'position') {
            // entry, stop, and a target that starts at 2R but is free to be
            // dragged anywhere afterwards.
            s.pts = [p, p, { time: p.time, price: p.price }];
        } else {
            s.pts = [p, p];
        }
        shapes.push(s);
        selected = s.id;
        drag = { mode: 'create', id: s.id, handle: 1 };
        render();
        return;
    }

    const hit = hitTest(p.x, p.y);
    if (!hit) { if (selected !== null) { selected = null; closeCfg(); render(); } return; }

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

    if (drag.mode === 'create') {
        s.pts[1] = { time: p.time, price: p.price };
        if (s.type === 'position') {
            const risk = s.pts[0].price - s.pts[1].price;
            // 2R is only the starting target; it is freely draggable after.
            s.pts[2] = { time: p.time, price: s.pts[0].price + risk * 2 };
        }
    } else if (drag.mode === 'handle') {
        // A position's three levels are horizontal: their time only sets how
        // wide the box is, so dragging one must change PRICE ALONE. Writing
        // the cursor's time as well made the whole box slide sideways while
        // you were only trying to move a level up or down.
        s.pts[drag.handle] = (s.type === 'position')
            ? { time: s.pts[drag.handle].time, price: p.price }
            : { time: p.time, price: p.price };
    } else {
        const dt = p.time - drag.from.time, dp = p.price - drag.from.price;
        s.pts = drag.orig.map(q => ({ time: q.time + dt, price: q.price + dp }));
    }
    render(); placeCfg();
}

function onUp() {
    if (!drag) return;
    const s = shapes.find(x => x.id === drag.id);
    const wasCreate = drag.mode === 'create';
    drag = null;

    if (s && s.pts.length > 1 && wasCreate) {
        const a = pxOf(s.pts[0]), b = pxOf(s.pts[1]);
        if (a && b && Math.hypot(b.x - a.x, b.y - a.y) < 4) {
            shapes = shapes.filter(x => x.id !== s.id);
            selected = null;
        }
    }
    if (wasCreate) setTool('cursor');
    if (s && s.type === 'position') sendToOrderPanel(s);
    commit();
}

function onDblClick(e) {
    const p = toChart(e);
    if (!p) return;
    const hit = hitTest(p.x, p.y);
    if (!hit) return;                 // let the chart-settings handler have it
    e.preventDefault(); e.stopPropagation();
    selected = hit.id;
    render();
    openCfg(hit.id);
}

function onKey(e) {
    if (/input|select|textarea/i.test(e.target.tagName)) return;
    if (e.key === 'Escape') { setTool('cursor'); selected = null; closeCfg(); render(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected !== null) {
        e.preventDefault();
        shapes = shapes.filter(s => s.id !== selected);
        selected = null; closeCfg(); commit();
    }
}

function commit() { render(); placeCfg(); if (onChange) onChange(serialize()); }

// The position tool doubles as the order ticket.
function sendToOrderPanel(s) {
    const entry = s.pts[0].price, stop = s.pts[1].price;
    const target = s.pts[2] ? s.pts[2].price : null;
    const risk = Math.abs(entry - stop);
    if (!risk) return;
    const dp = risk < 5 ? 4 : 2;
    const stopEl = document.getElementById('rp-stop');
    const tgtEl = document.getElementById('rp-target');
    if (stopEl) { stopEl.value = risk.toFixed(dp); stopEl.dispatchEvent(new Event('input')); }
    if (tgtEl && target !== null) tgtEl.value = Math.abs(target - entry).toFixed(dp);
}

// -------------------------------------------------------------------- paint

function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cvs.clientWidth, cvs.clientHeight);
    for (const s of shapes) drawShape(s, cvs.clientWidth);
}

function dashOf(name) {
    return name === 'dashed' ? [7, 5] : name === 'dotted' ? [2, 4] : [];
}

function drawShape(s, w) {
    const pts = s.pts.map(pxOf);
    if (pts.some(p => p === null)) return;
    const st = styleOf(s);
    const on = s.id === selected;
    ctx.save();
    ctx.lineWidth = on ? st.width + 0.8 : st.width;
    ctx.strokeStyle = on ? SEL : st.color;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.setLineDash(dashOf(st.dash));
    ctx.font = '10px "Share Tech Mono", monospace';

    if (s.type === 'hline') {
        ctx.beginPath(); ctx.moveTo(0, pts[0].y); ctx.lineTo(w, pts[0].y); ctx.stroke();
        tag(s.pts[0].price.toFixed(2), 6, pts[0].y - 5, ctx.strokeStyle);
        if (on) handle(Math.max(20, pts[0].x || w / 2), pts[0].y);
    }
    else if (s.type === 'trend') {
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke();
        const d = s.pts[1].price - s.pts[0].price;
        tag((d >= 0 ? '+' : '') + d.toFixed(2) + ' pts',
            (pts[0].x + pts[1].x) / 2 + 6, (pts[0].y + pts[1].y) / 2 - 5, ctx.strokeStyle);
        if (on) { handle(pts[0].x, pts[0].y); handle(pts[1].x, pts[1].y); }
    }
    else if (s.type === 'rect') {
        const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y);
        const ww = Math.abs(pts[1].x - pts[0].x), hh = Math.abs(pts[1].y - pts[0].y);
        ctx.globalAlpha = 0.12; ctx.setLineDash([]); ctx.fillRect(x, y, ww, hh);
        ctx.globalAlpha = 1; ctx.setLineDash(dashOf(st.dash));
        ctx.strokeRect(x, y, ww, hh);
        const d = Math.abs(s.pts[1].price - s.pts[0].price);
        tag(d.toFixed(2) + ' pts', x + 5, y - 4, ctx.strokeStyle);
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
        const entry = s.pts[0].price, stop = s.pts[1].price;
        const target = s.pts[2] ? s.pts[2].price : entry;
        const yE = Y(entry), yS = Y(stop), yT = Y(target);
        if (yE === null || yS === null || yT === null) { ctx.restore(); return; }
        const l = Math.min(pts[0].x, pts[1].x);
        const r = Math.max(pts[0].x, pts[1].x) + 96;

        ctx.setLineDash([]);
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = NEG; ctx.fillRect(l, Math.min(yE, yS), r - l, Math.abs(yS - yE));
        ctx.fillStyle = POS; ctx.fillRect(l, Math.min(yE, yT), r - l, Math.abs(yT - yE));
        ctx.globalAlpha = 1;

        ctx.strokeStyle = on ? SEL : ACCENT;
        ctx.beginPath(); ctx.moveTo(l, yE); ctx.lineTo(r, yE); ctx.stroke();

        const risk = Math.abs(entry - stop), reward = Math.abs(target - entry);
        const rr = risk ? reward / risk : 0;
        tag('entry ' + entry.toFixed(2), l + 4, yE - 5, ACCENT);
        tag('stop ' + stop.toFixed(2) + '   ' + risk.toFixed(2) + ' pts',
            l + 4, yS + (yS > yE ? 13 : -5), NEG);
        tag('target ' + target.toFixed(2) + '   ' + reward.toFixed(2) + ' pts   ' +
            rr.toFixed(2) + 'R', l + 4, yT + (yT > yE ? 13 : -5), POS);

        // All three levels are grabbable, always — the reward side is not
        // locked to any ratio.
        handle(pts[0].x, yE); handle(pts[1].x, yS); handle(pts[2] ? pts[2].x : pts[1].x, yT);
    }
    ctx.restore();
}

function handle(x, y) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = '#08080a'; ctx.strokeStyle = SEL; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y, 3.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
}

function tag(text, x, y, color) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.font = '10px "Share Tech Mono", monospace';
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = 'rgba(8,8,10,0.86)';
    ctx.fillRect(x, y - 10, w, 13);
    ctx.fillStyle = color;
    ctx.fillText(text, x + 4, y);
    ctx.restore();
}

// ------------------------------------------------------- settings panel

let cfgEl = null, cfgId = null;

function buildCfgPanel() {
    cfgEl = document.createElement('div');
    cfgEl.id = 'rp-draw-cfg';
    cfgEl.className = 'rp-draw-cfg';
    cfgEl.hidden = true;
    host.appendChild(cfgEl);
}

const NAMES = { hline: 'Horizontal line', trend: 'Trend line', rect: 'Rectangle',
                fib: 'Fibonacci', position: 'Position' };

function openCfg(id) {
    const s = shapes.find(x => x.id === id);
    if (!s) return;
    cfgId = id;
    const st = styleOf(s);
    let body = '';

    if (s.type === 'position') {
        const entry = s.pts[0].price, stop = s.pts[1].price;
        const target = s.pts[2] ? s.pts[2].price : entry;
        const risk = Math.abs(entry - stop), reward = Math.abs(target - entry);
        body =
          '<label>Entry<input type="number" step="any" data-p="0" value="' + entry.toFixed(2) + '"></label>' +
          '<label>Stop<input type="number" step="any" data-p="1" value="' + stop.toFixed(2) + '"></label>' +
          '<label>Target<input type="number" step="any" data-p="2" value="' + target.toFixed(2) + '"></label>' +
          '<div class="rp-cfg-read">' +
            '<span>Risk <b>' + risk.toFixed(2) + '</b> pts</span>' +
            '<span>Reward <b>' + reward.toFixed(2) + '</b> pts</span>' +
            '<span>R:R <b>' + (risk ? (reward / risk).toFixed(2) : '—') + '</b></span>' +
          '</div>' +
          '<button class="rp-btn" data-act="send" style="width:100%;justify-content:center">Send to order panel</button>';
    } else {
        body =
          '<label>Colour<input type="color" data-s="color" value="' + st.color + '"></label>' +
          '<label>Width<input type="number" min="1" max="6" step="0.5" data-s="width" value="' + st.width + '"></label>' +
          '<label>Style<select data-s="dash">' +
            ['solid', 'dashed', 'dotted'].map(o =>
              '<option value="' + o + '"' + (st.dash === o ? ' selected' : '') + '>' +
              o[0].toUpperCase() + o.slice(1) + '</option>').join('') +
          '</select></label>';
    }

    cfgEl.innerHTML =
        '<header><span>' + (NAMES[s.type] || s.type) + '</span>' +
        '<button data-act="close" aria-label="Close">&times;</button></header>' +
        '<div class="rp-cfg-body">' + body +
        '<button class="rp-btn danger" data-act="del" style="width:100%;justify-content:center">Delete</button>' +
        '</div>';
    cfgEl.hidden = false;
    placeCfg();

    cfgEl.querySelectorAll('[data-s]').forEach(inp =>
        inp.addEventListener('input', () => {
            const sh = shapes.find(x => x.id === cfgId);
            if (!sh) return;
            sh.style = Object.assign(styleOf(sh), {
                [inp.dataset.s]: inp.type === 'number' ? +inp.value : inp.value
            });
            commit();
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
            render();
            openCfgReadout(sh);
        }));
    cfgEl.querySelector('[data-act="close"]').addEventListener('click', closeCfg);
    const del = cfgEl.querySelector('[data-act="del"]');
    if (del) del.addEventListener('click', () => {
        shapes = shapes.filter(x => x.id !== cfgId);
        selected = null; closeCfg(); commit();
    });
    const send = cfgEl.querySelector('[data-act="send"]');
    if (send) send.addEventListener('click', () => {
        const sh = shapes.find(x => x.id === cfgId);
        if (sh) sendToOrderPanel(sh);
    });
}

// Refresh only the numeric readout while typing, so focus is not stolen.
function openCfgReadout(s) {
    const box = cfgEl.querySelector('.rp-cfg-read');
    if (!box || s.type !== 'position') return;
    const entry = s.pts[0].price, stop = s.pts[1].price;
    const target = s.pts[2] ? s.pts[2].price : entry;
    const risk = Math.abs(entry - stop), reward = Math.abs(target - entry);
    box.innerHTML =
        '<span>Risk <b>' + risk.toFixed(2) + '</b> pts</span>' +
        '<span>Reward <b>' + reward.toFixed(2) + '</b> pts</span>' +
        '<span>R:R <b>' + (risk ? (reward / risk).toFixed(2) : '—') + '</b></span>';
}

function placeCfg() {
    if (!cfgEl || cfgEl.hidden || cfgId === null) return;
    const s = shapes.find(x => x.id === cfgId);
    if (!s) { closeCfg(); return; }
    const p = pxOf(s.pts[0]);
    if (!p) return;
    const w = cfgEl.offsetWidth || 190, h = cfgEl.offsetHeight || 150;
    const x = Math.max(6, Math.min(cvs.clientWidth - w - 6, p.x + 14));
    const y = Math.max(6, Math.min(cvs.clientHeight - h - 6, p.y + 14));
    cfgEl.style.left = x + 'px';
    cfgEl.style.top = y + 'px';
}
function closeCfg() { if (cfgEl) { cfgEl.hidden = true; cfgId = null; } }

// ------------------------------------------------------------- persistence

function serialize() {
    return shapes.map(s => ({ type: s.type, pts: s.pts, style: s.style }));
}
function load(list) {
    shapes = (list || []).map(s => ({
        id: ++seq, type: s.type, pts: s.pts,
        style: Object.assign({}, DEFAULT_STYLE, s.style || {})
    }));
    selected = null; closeCfg(); render();
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
    attach: attach, setTool: setTool,
    clear: function () { shapes = []; selected = null; closeCfg(); commit(); },
    count: function () { return shapes.length; },
    serialize: serialize, load: load, render: render
};
return api;

})();
