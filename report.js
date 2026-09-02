// ==========================================
// BACKTEST REPORT DASHBOARD
//
// Renders a submission's metrics as an in-page dashboard. Charts are inline
// SVG built here — no chart library — so they stay razor sharp at any zoom
// and add no dependency weight.
//
// DATA CONTRACT: the dashboard reads a structured `metrics` object off the
// submission row. It deliberately does NOT parse the PDF. A PDF is a
// presentation format, and pulling numbers back out of one is brittle: text
// runs split mid-number, table cells arrive out of document order, and any
// restyle of the template silently breaks the parser. The worker that
// renders the PDF already holds these numbers — it should write them to a
// `metrics` JSONB column at the same time. The PDF stays a download artifact.
//
// Expected shape (every field optional; missing ones are omitted):
// {
//   currency:'USD', startBalance:10000, endBalance:14830,
//   netReturnPct:48.3, winRatePct:61.4, maxDrawdownPct:-12.7,
//   profitFactor:2.14, sharpe:1.62, totalTrades:248,
//   avgWin:412.5, avgLoss:-196.3, longestLossStreak:6,
//   periodStart:'2023-01-01', periodEnd:'2026-06-30',
//   equity:  [{t:'2023-01', v:10000}, ...],
//   monthly: [{t:'2023-01', v:2.4}, ...],    // percent
//   weekday: [{t:'Mon', v:58.2}, ...],       // win-rate percent
//   symbols: [{t:'EURUSD', v:96}, ...],      // trade count
//   rBuckets:[{t:'-2R', v:12}, ...],         // trade count
//   trades:  [{symbol, side, entry, exit, r, pnl}, ...]
// }
// ==========================================

const RPT = {
    fmtPct(v, d = 1) {
        if (v === null || v === undefined || isNaN(v)) return '—';
        return (v > 0 ? '+' : '') + Number(v).toFixed(d) + '%';
    },
    fmtMoney(v, cur) {
        if (v === null || v === undefined || isNaN(v)) return '—';
        const sign = v < 0 ? '-' : '';
        const n = Math.abs(Number(v));
        const s = n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
        return sign + ((cur || 'USD') === 'USD' ? '$' : '') + s;
    },
    fmtNum(v, d = 2) {
        if (v === null || v === undefined || isNaN(v)) return '—';
        return Number(v).toFixed(d);
    },
    esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }
};

function rptTip(host) {
    let tip = host.querySelector('.rpt-tip');
    if (!tip) {
        tip = document.createElement('div');
        tip.className = 'rpt-tip';
        host.appendChild(tip);
    }
    return {
        show(x, y, html) {
            tip.innerHTML = html;
            tip.style.left = x + 'px';
            tip.style.top = y + 'px';
            tip.classList.add('show');
        },
        hide() { tip.classList.remove('show'); }
    };
}

// --- Line/area: one series, so the title names it and no legend is needed.
function rptArea(host, data, opts) {
    if (!host) return;
    const o = Object.assign({ height: 190, fill: 'var(--seq-1)', below: false }, opts || {});
    host.innerHTML = '';
    if (!data || !data.length) { host.innerHTML = '<p class="rpt-empty">No data</p>'; return; }

    const W = 1000, H = o.height, P = { t: 10, r: 10, b: 22, l: 52 };
    const vals = data.map(d => d.v);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (o.below) max = 0;
    if (min === max) max = min + 1;
    const pad = (max - min) * 0.08;
    min -= pad; max += pad;

    const x = i => P.l + (i / Math.max(1, data.length - 1)) * (W - P.l - P.r);
    const y = v => P.t + (1 - (v - min) / (max - min)) * (H - P.t - P.b);

    let line = '';
    data.forEach((d, i) => { line += (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(d.v).toFixed(1) + ' '; });
    const baseY = o.below ? y(0) : (H - P.b);
    const area = line + 'L' + x(data.length - 1).toFixed(1) + ',' + baseY.toFixed(1) +
                 ' L' + x(0).toFixed(1) + ',' + baseY.toFixed(1) + ' Z';

    let grid = '';
    for (let i = 0; i <= 4; i++) {
        const v = min + (i / 4) * (max - min), gy = y(v).toFixed(1);
        grid += '<line class="grid-line" x1="' + P.l + '" y1="' + gy + '" x2="' + (W - P.r) + '" y2="' + gy + '"/>';
        grid += '<text class="axis-text" x="' + (P.l - 8) + '" y="' + gy + '" text-anchor="end" dominant-baseline="middle">' +
                (o.fmtY ? o.fmtY(v) : Math.round(v)) + '</text>';
    }
    let xlab = '';
    const step = Math.max(1, Math.ceil(data.length / 7));
    data.forEach((d, i) => {
        if (i % step === 0 || i === data.length - 1) {
            xlab += '<text class="axis-text" x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + RPT.esc(d.t) + '</text>';
        }
    });

    const gid = 'g' + Math.random().toString(36).slice(2, 8);
    host.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img">' +
        '<defs><linearGradient id="' + gid + '" x1="0" y1="' + (o.below ? 1 : 0) + '" x2="0" y2="' + (o.below ? 0 : 1) + '">' +
          '<stop offset="0%" stop-color="' + o.fill + '" stop-opacity="0.34"/>' +
          '<stop offset="100%" stop-color="' + o.fill + '" stop-opacity="0.02"/>' +
        '</linearGradient></defs>' +
        grid + xlab +
        '<path d="' + area + '" fill="url(#' + gid + ')"/>' +
        '<path d="' + line + '" fill="none" stroke="' + o.fill + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<line class="rpt-cross" x1="0" y1="' + P.t + '" x2="0" y2="' + (H - P.b) + '" stroke="rgba(210,213,219,0.45)" stroke-width="1" opacity="0"/>' +
        '<circle class="rpt-dot" r="4" fill="' + o.fill + '" stroke="var(--surface-1)" stroke-width="2" opacity="0"/>' +
        '<rect x="' + P.l + '" y="0" width="' + (W - P.l - P.r) + '" height="' + H + '" fill="transparent" class="rpt-hit"/>' +
      '</svg>';

    const svg = host.querySelector('svg');
    const cross = svg.querySelector('.rpt-cross');
    const dot = svg.querySelector('.rpt-dot');
    const tip = rptTip(host);

    svg.querySelector('.rpt-hit').addEventListener('mousemove', ev => {
        const r = svg.getBoundingClientRect();
        const px = (ev.clientX - r.left) / r.width * W;
        let i = Math.round((px - P.l) / (W - P.l - P.r) * (data.length - 1));
        i = Math.max(0, Math.min(data.length - 1, i));
        const d = data[i];
        cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('opacity', '1');
        dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(d.v)); dot.setAttribute('opacity', '1');
        tip.show(x(i) / W * r.width, y(d.v) / H * r.height,
            '<span class="tip-k">' + RPT.esc(d.t) + '</span> &nbsp; ' + (o.fmtTip ? o.fmtTip(d.v) : d.v));
    });
    svg.querySelector('.rpt-hit').addEventListener('mouseleave', () => {
        cross.setAttribute('opacity', '0'); dot.setAttribute('opacity', '0'); tip.hide();
    });
}

// --- Diverging bars: polarity is the job, so two poles + zero baseline.
function rptDiverging(host, data) {
    if (!host) return;
    host.innerHTML = '';
    if (!data || !data.length) { host.innerHTML = '<p class="rpt-empty">No data</p>'; return; }

    const W = 1000, H = 190, P = { t: 10, r: 10, b: 22, l: 52 };
    const vals = data.map(d => d.v);
    const mag = Math.max(Math.abs(Math.min(...vals)), Math.abs(Math.max(...vals))) || 1;
    const min = -mag * 1.15, max = mag * 1.15;
    const y = v => P.t + (1 - (v - min) / (max - min)) * (H - P.t - P.b);
    const bw = (W - P.l - P.r) / data.length;
    const inner = Math.max(2, bw - 3);   // 2px surface gap between adjacent bars
    const zeroY = y(0);

    let grid = '';
    [max, max / 2, 0, min / 2, min].forEach(v => {
        const gy = y(v).toFixed(1);
        grid += '<line class="' + (Math.abs(v) < 0.001 ? 'zero-line' : 'grid-line') + '" x1="' + P.l + '" y1="' + gy + '" x2="' + (W - P.r) + '" y2="' + gy + '"/>';
        grid += '<text class="axis-text" x="' + (P.l - 8) + '" y="' + gy + '" text-anchor="end" dominant-baseline="middle">' + v.toFixed(0) + '%</text>';
    });

    let bars = '', xlab = '';
    const step = Math.max(1, Math.ceil(data.length / 8));
    data.forEach((d, i) => {
        const bx = P.l + i * bw + (bw - inner) / 2;
        const top = d.v >= 0 ? y(d.v) : zeroY;
        const h = Math.max(1.5, Math.abs(y(d.v) - zeroY));
        const col = d.v >= 0 ? 'var(--pos)' : 'var(--neg)';
        const r = Math.min(4, inner / 2);   // 4px rounded data-end, square to baseline
        const path = d.v >= 0
            ? 'M' + bx + ',' + (top + h) + ' L' + bx + ',' + (top + r) + ' Q' + bx + ',' + top + ' ' + (bx + r) + ',' + top +
              ' L' + (bx + inner - r) + ',' + top + ' Q' + (bx + inner) + ',' + top + ' ' + (bx + inner) + ',' + (top + r) +
              ' L' + (bx + inner) + ',' + (top + h) + ' Z'
            : 'M' + bx + ',' + top + ' L' + bx + ',' + (top + h - r) + ' Q' + bx + ',' + (top + h) + ' ' + (bx + r) + ',' + (top + h) +
              ' L' + (bx + inner - r) + ',' + (top + h) + ' Q' + (bx + inner) + ',' + (top + h) + ' ' + (bx + inner) + ',' + (top + h - r) +
              ' L' + (bx + inner) + ',' + top + ' Z';
        bars += '<path class="mark" data-i="' + i + '" fill="' + col + '" d="' + path + '"/>';
        if (i % step === 0 || i === data.length - 1) {
            xlab += '<text class="axis-text" x="' + (bx + inner / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + RPT.esc(d.t) + '</text>';
        }
    });

    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img">' + grid + xlab + bars + '</svg>' +
        '<div class="rpt-legend">' +
          '<span><i style="background:var(--pos)"></i>Profitable month</span>' +
          '<span><i style="background:var(--neg)"></i>Losing month</span>' +
        '</div>';

    const svg = host.querySelector('svg');
    const tip = rptTip(host);
    svg.querySelectorAll('.mark').forEach(el => {
        el.addEventListener('mouseenter', () => {
            const d = data[+el.dataset.i];
            const r = svg.getBoundingClientRect(), bb = el.getBBox();
            tip.show((bb.x + bb.width / 2) / W * r.width, bb.y / H * r.height,
                '<span class="tip-k">' + RPT.esc(d.t) + '</span> &nbsp; ' + RPT.fmtPct(d.v));
        });
        el.addEventListener('mouseleave', () => tip.hide());
    });
}

// --- Magnitude bars: sequential, one hue; length carries the value.
function rptBars(host, data, opts) {
    if (!host) return;
    const o = Object.assign({ height: 175, unit: '', fill: 'var(--seq-1)', fmtTip: v => v }, opts || {});
    host.innerHTML = '';
    if (!data || !data.length) { host.innerHTML = '<p class="rpt-empty">No data</p>'; return; }

    const W = 640, H = o.height, P = { t: 10, r: 8, b: 24, l: 42 };
    const max = Math.max(...data.map(d => d.v), 0) * 1.12 || 1;
    const y = v => P.t + (1 - v / max) * (H - P.t - P.b);
    const bw = (W - P.l - P.r) / data.length;
    const inner = Math.max(3, bw - 8);

    let grid = '';
    for (let i = 0; i <= 3; i++) {
        const v = (i / 3) * max, gy = y(v).toFixed(1);
        grid += '<line class="grid-line" x1="' + P.l + '" y1="' + gy + '" x2="' + (W - P.r) + '" y2="' + gy + '"/>';
        grid += '<text class="axis-text" x="' + (P.l - 7) + '" y="' + gy + '" text-anchor="end" dominant-baseline="middle">' + Math.round(v) + o.unit + '</text>';
    }

    let bars = '', xlab = '';
    data.forEach((d, i) => {
        const bx = P.l + i * bw + (bw - inner) / 2;
        const top = y(d.v), h = Math.max(1.5, (H - P.b) - top), r = Math.min(4, inner / 2);
        bars += '<path class="mark" data-i="' + i + '" fill="' + o.fill + '" d="' +
            'M' + bx + ',' + (top + h) + ' L' + bx + ',' + (top + r) + ' Q' + bx + ',' + top + ' ' + (bx + r) + ',' + top +
            ' L' + (bx + inner - r) + ',' + top + ' Q' + (bx + inner) + ',' + top + ' ' + (bx + inner) + ',' + (top + r) +
            ' L' + (bx + inner) + ',' + (top + h) + ' Z"/>';
        xlab += '<text class="axis-text" x="' + (bx + inner / 2).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle">' + RPT.esc(d.t) + '</text>';
    });

    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img">' + grid + xlab + bars + '</svg>';
    const svg = host.querySelector('svg');
    const tip = rptTip(host);
    svg.querySelectorAll('.mark').forEach(el => {
        el.addEventListener('mouseenter', () => {
            const d = data[+el.dataset.i];
            const r = svg.getBoundingClientRect(), bb = el.getBBox();
            tip.show((bb.x + bb.width / 2) / W * r.width, bb.y / H * r.height,
                '<span class="tip-k">' + RPT.esc(d.t) + '</span> &nbsp; ' + o.fmtTip(d.v));
        });
        el.addEventListener('mouseleave', () => tip.hide());
    });
}

// --- Horizontal bars: category names are long, so lay them out sideways.
function rptHBars(host, data, unit) {
    if (!host) return;
    host.innerHTML = '';
    if (!data || !data.length) { host.innerHTML = '<p class="rpt-empty">No data</p>'; return; }
    const sorted = [...data].sort((a, b) => b.v - a.v);
    const max = Math.max(...sorted.map(d => d.v)) || 1;
    host.innerHTML = '<div class="hbar-wrap">' + sorted.map(d =>
        '<div class="hbar-row">' +
          '<span class="hbar-label">' + RPT.esc(d.t) + '</span>' +
          '<span class="hbar-track"><span class="hbar-fill" style="width:' + (d.v / max * 100).toFixed(1) + '%"></span></span>' +
          '<span class="hbar-val">' + d.v + (unit || '') + '</span>' +
        '</div>').join('') + '</div>';
}

// --- Sample metrics, used only when a submission has none attached yet, so
//     the dashboard can be seen and judged before the worker writes data.
function rptSampleMetrics() {
    const months = [];
    const equity = [];
    const monthly = [];
    let bal = 10000;
    const start = new Date(2023, 0, 1);
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 42; i++) {
        const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
        const label = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
        const pct = (rnd() - 0.34) * 9.5;
        bal = bal * (1 + pct / 100);
        months.push(label);
        monthly.push({ t: label, v: +pct.toFixed(2) });
        equity.push({ t: label, v: Math.round(bal) });
    }
    let peak = -Infinity;
    const dd = equity.map(p => {
        peak = Math.max(peak, p.v);
        return { t: p.t, v: +(((p.v - peak) / peak) * 100).toFixed(2) };
    });
    const syms = ['EURUSD', 'GBPUSD', 'XAUUSD', 'USDJPY', 'BTCUSD', 'AUDUSD'];
    const trades = [];
    for (let i = 0; i < 40; i++) {
        const win = rnd() > 0.39;
        const r = win ? +(0.6 + rnd() * 2.6).toFixed(2) : -+(0.4 + rnd() * 0.8).toFixed(2);
        trades.push({
            symbol: syms[Math.floor(rnd() * syms.length)],
            side: rnd() > 0.5 ? 'Long' : 'Short',
            entry: new Date(2024, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27)).toISOString().slice(0, 10),
            exit: new Date(2024, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27)).toISOString().slice(0, 10),
            r, pnl: +(r * 200).toFixed(2)
        });
    }
    return {
        __sample: true,
        currency: 'USD', startBalance: 10000, endBalance: Math.round(bal),
        netReturnPct: +(((bal - 10000) / 10000) * 100).toFixed(1),
        winRatePct: 61.4, maxDrawdownPct: Math.min(...dd.map(d => d.v)),
        profitFactor: 2.14, sharpe: 1.62, totalTrades: 248,
        avgWin: 412.5, avgLoss: -196.3, longestLossStreak: 6,
        periodStart: '2023-01-01', periodEnd: '2026-06-30',
        equity, monthly, drawdown: dd,
        weekday: [
            { t: 'Mon', v: 58.2 }, { t: 'Tue', v: 64.1 }, { t: 'Wed', v: 71.3 },
            { t: 'Thu', v: 55.7 }, { t: 'Fri', v: 49.8 }
        ],
        symbols: [
            { t: 'EURUSD', v: 96 }, { t: 'GBPUSD', v: 61 }, { t: 'XAUUSD', v: 44 },
            { t: 'USDJPY', v: 27 }, { t: 'BTCUSD', v: 13 }, { t: 'AUDUSD', v: 7 }
        ],
        rBuckets: [
            { t: '<-2R', v: 9 }, { t: '-2R', v: 21 }, { t: '-1R', v: 66 },
            { t: '0R', v: 12 }, { t: '+1R', v: 74 }, { t: '+2R', v: 45 }, { t: '>+3R', v: 21 }
        ],
        trades
    };
}

// --- Open / close ---------------------------------------------------------
function openReportDashboard(submission) {
    const el = document.getElementById('report-dashboard');
    if (!el) return;

    let m = submission && submission.metrics;
    if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { m = null; } }
    const isSample = !m || !Object.keys(m).length;
    if (isSample) m = rptSampleMetrics();

    const cur = m.currency || 'USD';
    const name = (submission && submission.system_name) || 'Untitled System';
    const url = submission ? (submission.report_url || submission.pdf_url || submission.report_link ||
                              submission.file_url || submission.url || '') : '';

    document.getElementById('rpt-title').textContent = name;
    document.getElementById('rpt-date').textContent = submission && submission.created_at
        ? 'Submitted ' + new Date(submission.created_at).toLocaleDateString() : 'Submitted —';
    document.getElementById('rpt-range').textContent =
        (m.periodStart && m.periodEnd) ? m.periodStart + ' → ' + m.periodEnd : 'Period —';
    document.getElementById('rpt-symbols').textContent =
        (m.symbols && m.symbols.length) ? m.symbols.length + ' instruments' : '—';

    const dl = document.getElementById('rpt-download');
    if (url) { dl.href = url; dl.removeAttribute('aria-disabled'); }
    else { dl.href = '#'; dl.setAttribute('aria-disabled', 'true'); }

    const note = document.getElementById('rpt-demo-note');
    if (note) note.hidden = !isSample;

    // Hero figure
    const heroEl = document.getElementById('kpi-net');
    heroEl.textContent = RPT.fmtPct(m.netReturnPct);
    heroEl.className = 'rpt-hero-value ' + (m.netReturnPct >= 0 ? 'pos' : 'neg');
    document.getElementById('kpi-net-meta').textContent =
        RPT.fmtMoney(m.startBalance, cur) + ' → ' + RPT.fmtMoney(m.endBalance, cur);

    // KPI row — headline numbers as stat tiles, not a bar chart
    const kpis = [
        { label: 'Win rate', value: RPT.fmtNum(m.winRatePct, 1) + '%', sub: m.totalTrades ? m.totalTrades + ' trades' : '' },
        { label: 'Max drawdown', value: RPT.fmtNum(m.maxDrawdownPct, 1) + '%', sub: 'peak to trough', tone: 'neg' },
        { label: 'Profit factor', value: RPT.fmtNum(m.profitFactor), sub: 'gross win / gross loss' },
        { label: 'Sharpe', value: RPT.fmtNum(m.sharpe), sub: 'risk-adjusted' },
        { label: 'Avg win', value: RPT.fmtMoney(m.avgWin, cur), sub: 'per winning trade', tone: 'pos' },
        { label: 'Avg loss', value: RPT.fmtMoney(m.avgLoss, cur), sub: 'per losing trade', tone: 'neg' },
        { label: 'Worst streak', value: (m.longestLossStreak != null ? m.longestLossStreak : '—'), sub: 'consecutive losses' }
    ];
    document.getElementById('rpt-kpis').innerHTML = kpis.map(k =>
        '<div class="rpt-kpi">' +
          '<span class="rpt-kpi-label">' + RPT.esc(k.label) + '</span>' +
          '<span class="rpt-kpi-value' + (k.tone ? ' val-' + k.tone : '') + '">' + RPT.esc(k.value) + '</span>' +
          (k.sub ? '<span class="rpt-kpi-sub">' + RPT.esc(k.sub) + '</span>' : '') +
        '</div>').join('');

    el.classList.add('active');
    el.setAttribute('aria-hidden', 'false');
    rptLockPage();

    // The overlay used to become visible in the same frame that built six
    // charts and up to 200 trade rows, so on a phone it appeared only after
    // all of that finished — which is what made the report feel slow to open.
    // The panel is painted first, then the work is spread one job per frame.
    const jobs = [
        () => rptArea(document.getElementById('chart-equity'), m.equity, {
            fill: 'var(--seq-1)',
            fmtY: v => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v)),
            fmtTip: v => RPT.fmtMoney(v, cur)
        }),
        () => rptArea(document.getElementById('chart-drawdown'), m.drawdown, {
            fill: 'var(--neg)', below: true, height: 160,
            fmtY: v => v.toFixed(0) + '%',
            fmtTip: v => RPT.fmtNum(v, 2) + '%'
        }),
        () => rptDiverging(document.getElementById('chart-monthly'), m.monthly),
        () => rptBars(document.getElementById('chart-weekday'), m.weekday, {
            unit: '%', fmtTip: v => RPT.fmtNum(v, 1) + '% win rate'
        }),
        () => rptHBars(document.getElementById('chart-symbols'), m.symbols, ' trades'),
        () => rptBars(document.getElementById('chart-rmultiple'), m.rBuckets, {
            fmtTip: v => v + ' trades'
        }),
        () => {
            const tb = document.querySelector('#rpt-log tbody');
            const rows = (m.trades || []).slice(0, 200);
            tb.innerHTML = rows.length ? rows.map((t, i) =>
                '<tr>' +
                  '<td>' + (i + 1) + '</td>' +
                  '<td>' + RPT.esc(t.symbol) + '</td>' +
                  '<td>' + RPT.esc(t.side) + '</td>' +
                  '<td>' + RPT.esc(t.entry) + '</td>' +
                  '<td>' + RPT.esc(t.exit) + '</td>' +
                  '<td class="num ' + (t.r >= 0 ? 'val-pos' : 'val-neg') + '">' + RPT.fmtNum(t.r) + 'R</td>' +
                  '<td class="num ' + (t.pnl >= 0 ? 'val-pos' : 'val-neg') + '">' + RPT.fmtMoney(t.pnl, cur) + '</td>' +
                  '<td><span class="rpt-tag ' + (t.pnl >= 0 ? 'win' : 'loss') + '">' + (t.pnl >= 0 ? 'WIN' : 'LOSS') + '</span></td>' +
                '</tr>').join('')
                : '<tr><td colspan="8" style="text-align:center;padding:22px;color:var(--text-muted)">No trade log attached — see the PDF for the full record.</td></tr>';
        }
    ];
    let ji = 0;
    function pump() {
        if (ji >= jobs.length) return;
        jobs[ji++]();
        requestAnimationFrame(pump);
    }
    // Two frames before the first job: one for the browser to lay the panel
    // out, one for it to actually paint it. Only then start drawing.
    requestAnimationFrame(() => requestAnimationFrame(pump));
}

function closeReportDashboard() {
    const el = document.getElementById('report-dashboard');
    if (!el) return;
    el.classList.remove('active');
    el.setAttribute('aria-hidden', 'true');
    rptUnlockPage();
}

// `body { overflow: hidden }` does not lock the page on iOS Safari, where the
// scrolling element is the documentElement — which is why the page behind the
// report kept moving under a reader's thumb. Pinning the body with
// position:fixed at the current offset is the lock that actually holds; the
// offset is restored on close so they land back where they were. The body
// class also parks the hero scrub loop, which would otherwise chase the
// scroll position to 0 while it is pinned.
let rptSavedScroll = 0;
function rptLockPage() {
    rptSavedScroll = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.classList.add('modal-locked');
    const b = document.body.style;
    b.position = 'fixed';
    b.top   = (-rptSavedScroll) + 'px';
    b.left  = '0';
    b.right = '0';
    b.width = '100%';
}
function rptUnlockPage() {
    document.body.classList.remove('modal-locked');
    const b = document.body.style;
    b.position = ''; b.top = ''; b.left = ''; b.right = ''; b.width = ''; b.overflow = '';
    window.scrollTo(0, rptSavedScroll);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('rpt-close')?.addEventListener('click', closeReportDashboard);
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && document.getElementById('report-dashboard')?.classList.contains('active')) {
            closeReportDashboard();
        }
    });
    window.addEventListener('resize', () => {
        const el = document.getElementById('report-dashboard');
        if (el && el.classList.contains('active') && window.__rptLast) openReportDashboard(window.__rptLast);
    });
});
