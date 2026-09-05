/* ==========================================================================
   BarTest — shared form controls

   Two native controls look wrong in a dark trading interface and behave
   differently in every browser: the number spinner and the colour well.
   This replaces both, everywhere, without touching the markup that uses
   them — the original <input> stays in the DOM and keeps its id, its value
   and its listeners, so nothing that reads or writes it has to change.

     •  input[type=number]  gets our own stepper: two chevrons drawn in the
        house palette, hold to repeat, Shift for ten at a time.

     •  input[type=color]   gets a swatch that opens a palette of ten colours
        people actually use, followed by the last three custom colours they
        picked. A fourth custom pushes the oldest one out.

   New inputs appear all the time here — settings dialogs are rebuilt on
   every change, the legend repaints on every tick — so a MutationObserver
   upgrades whatever arrives, batched to one animation frame.
   ========================================================================== */
window.BTUI = (function () {
'use strict';

/* Ten colours that read clearly on a dark chart and that a trader already
   has a name for. Anything else they mix themselves is remembered after
   these, three deep. */
const PRESETS = ['#ffffff', '#f7a600', '#20b26c', '#ef454a', '#5aa9f0',
                 '#c58af0', '#00c2c2', '#ff9f43', '#ff7ac6', '#8c9099'];
const RECENT_KEY = 'bt.ui.colours';
const RECENT_MAX = 3;

/* Inputs that already carry their own trailing control — the order ticket's
   unit selector, its Last button — are left alone: they never showed a
   native spinner, so there is nothing there to put right. */
const NO_STEP = '.rp-inp, [data-nostep]';

const isHex = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const norm  = c => isHex(c) ? c.toLowerCase() : null;

let recent = [];
try {
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    if (Array.isArray(saved)) recent = saved.map(norm).filter(Boolean).slice(0, RECENT_MAX);
} catch (e) { recent = []; }

function remember(c) {
    c = norm(c);
    if (!c || PRESETS.indexOf(c) >= 0) return;      // already on the shelf
    const at = recent.indexOf(c);
    if (at >= 0) recent.splice(at, 1);
    recent.unshift(c);
    while (recent.length > RECENT_MAX) recent.pop();   // the oldest is replaced
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch (e) {}
}

function swatches() { return PRESETS.concat(recent); }

function fire(el) {
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}

// ================================================================= steppers

/* step="any" is honest about a price field but useless to a stepper, so the
   size of the nudge follows the size of the number: whole dollars on 79,800,
   thousandths on a 0.618 Fibonacci ratio. */
function stepOf(input) {
    const raw = input.getAttribute('step');
    if (raw && raw !== 'any') return Math.abs(parseFloat(raw)) || 1;
    const v = Math.abs(parseFloat(input.value) || 0);
    return v >= 100 ? 1 : v >= 10 ? 0.1 : v >= 1 ? 0.01 : 0.001;
}

function nudge(input, dir, big) {
    if (input.disabled || input.readOnly) return;
    const st  = stepOf(input) * (big ? 10 : 1);
    const min = input.hasAttribute('min') ? parseFloat(input.min) : -Infinity;
    const max = input.hasAttribute('max') ? parseFloat(input.max) :  Infinity;
    let v = parseFloat(input.value);
    if (!isFinite(v)) v = isFinite(min) ? min : 0;
    else v += st * dir;
    v = Math.min(max, Math.max(min, v));
    // 0.1 + 0.2 must not arrive as 0.30000000000000004 in a price box.
    const dp = (String(st).split('.')[1] || '').length;
    input.value = dp ? v.toFixed(dp) : String(v);
    fire(input);
}

function stepper(input) {
    if (input.closest(NO_STEP)) { input.dataset.btui = 'skip'; return; }
    input.dataset.btui = 'num';

    const wrap = document.createElement('span');
    wrap.className = 'bt-num';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const btns = document.createElement('span');
    btns.className = 'bt-num-btns';
    btns.innerHTML =
        '<button type="button" class="bt-num-up" tabindex="-1" aria-label="Increase">' +
          '<svg viewBox="0 0 10 6"><path d="M1 5l4-4 4 4" fill="none" stroke="currentColor" ' +
          'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '<button type="button" class="bt-num-dn" tabindex="-1" aria-label="Decrease">' +
          '<svg viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" ' +
          'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
    wrap.appendChild(btns);

    /* Press and hold to run. The first repeat waits, so a single click is
       still a single step. */
    let timer = null, tick = null;
    const stop = () => { clearTimeout(timer); clearInterval(tick); timer = tick = null; };
    btns.querySelectorAll('button').forEach(b => {
        const dir = b.classList.contains('bt-num-up') ? 1 : -1;
        b.addEventListener('mousedown', e => {
            // The chart hit-tests mousedown in the capture phase; without this
            // the press would also reach it and tear the dialog down.
            e.preventDefault(); e.stopPropagation();
            nudge(input, dir, e.shiftKey);
            timer = setTimeout(() => { tick = setInterval(() => nudge(input, dir, e.shiftKey), 55); }, 380);
        });
        b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
    });
    window.addEventListener('mouseup', stop);
    window.addEventListener('blur', stop);
}

// ============================================================ colour picker

let popEl = null, popFor = null;

function closePalette() {
    if (!popEl) return;
    popEl.remove(); popEl = null; popFor = null;
    document.removeEventListener('mousedown', outside, true);
    window.removeEventListener('resize', closePalette);
    window.removeEventListener('scroll', closePalette, true);
}
function outside(e) {
    if (popEl && !popEl.contains(e.target) && e.target !== popFor) closePalette();
}

function openPalette(input, anchor) {
    if (popFor === anchor) { closePalette(); return; }
    closePalette();
    const current = norm(input.value);

    popEl = document.createElement('div');
    popEl.className = 'bt-pop';
    const cell = c =>
        '<button type="button" class="bt-chip' + (c === current ? ' on' : '') +
        '" data-c="' + c + '" style="background:' + c + '" title="' + c + '"></button>';
    popEl.innerHTML =
        '<div class="bt-pop-h">Colours</div>' +
        '<div class="bt-pop-grid">' + PRESETS.map(cell).join('') + '</div>' +
        (recent.length
            ? '<div class="bt-pop-h">Yours</div><div class="bt-pop-grid">' +
              recent.map(cell).join('') + '</div>'
            : '') +
        '<div class="bt-pop-foot">' +
          '<label class="bt-pop-custom">' +
            '<span class="bt-chip bt-chip-any" style="background:' + (current || '#ffffff') + '"></span>' +
            '<span>Custom…</span>' +
            '<input type="color" data-btui="skip" value="' + (current || '#ffffff') + '">' +
          '</label>' +
          '<input type="text" class="bt-pop-hex" data-btui="skip" spellcheck="false" ' +
            'maxlength="7" value="' + (current || '') + '" placeholder="#000000">' +
        '</div>';
    document.body.appendChild(popEl);
    popFor = anchor;

    const r = anchor.getBoundingClientRect();
    const w = popEl.offsetWidth, h = popEl.offsetHeight;
    popEl.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left - 6)) + 'px';
    popEl.style.top  = (r.bottom + 6 + h > window.innerHeight ? Math.max(8, r.top - h - 6)
                                                             : r.bottom + 6) + 'px';

    const apply = (c, keep) => {
        c = norm(c); if (!c) return;
        input.value = c;
        anchor.style.background = c;
        fire(input);
        if (!keep) closePalette();
    };
    popEl.querySelectorAll('[data-c]').forEach(b =>
        b.addEventListener('click', e => { e.stopPropagation(); apply(b.dataset.c); }));

    const custom = popEl.querySelector('.bt-pop-custom input');
    custom.addEventListener('input', () => {
        popEl.querySelector('.bt-chip-any').style.background = custom.value;
        apply(custom.value, true);
    });
    // Only bank it once they are finished dragging round the wheel, or every
    // shade they passed through would eat a slot.
    custom.addEventListener('change', () => { remember(custom.value); apply(custom.value); });

    const hex = popEl.querySelector('.bt-pop-hex');
    hex.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        let v = hex.value.trim();
        if (v && v[0] !== '#') v = '#' + v;
        if (v.length === 4) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
        if (!isHex(v)) { hex.classList.add('bad'); return; }
        remember(v); apply(v);
    });
    hex.addEventListener('input', () => hex.classList.remove('bad'));

    setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
    window.addEventListener('resize', closePalette);
    window.addEventListener('scroll', closePalette, true);
}

function colour(input) {
    input.dataset.btui = 'col';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bt-swatch';
    btn.style.background = norm(input.value) || '#ffffff';
    btn.setAttribute('aria-label', 'Colour');
    input.parentNode.insertBefore(btn, input.nextSibling);
    input.classList.add('bt-color-src');

    btn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
    btn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        openPalette(input, btn);
    });
    // Anything that sets the value in code — a preset, a loaded layout — must
    // still show through on the swatch.
    input.addEventListener('input',  () => { btn.style.background = norm(input.value) || '#fff'; });
    input.addEventListener('change', () => { btn.style.background = norm(input.value) || '#fff'; });
}

// ================================================================== upgrade

function upgrade(root) {
    if (!root || root.nodeType !== 1) return;
    const scan = (sel, fn) => {
        if (root.matches && root.matches(sel)) fn(root);
        root.querySelectorAll(sel).forEach(fn);
    };
    scan('input[type="number"]:not([data-btui])', stepper);
    scan('input[type="color"]:not([data-btui])', colour);
}

let queued = null;
function observe() {
    upgrade(document.body);
    new MutationObserver(muts => {
        if (queued) return;
        const roots = [];
        muts.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) roots.push(n); }));
        if (!roots.length) return;
        queued = requestAnimationFrame(() => { queued = null; roots.forEach(upgrade); });
    }).observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', observe);
else observe();

// =================================================================== avatar

/* Every account gets a picture from the moment it exists, without anyone
   uploading anything: the colours are derived from the user's own id, so the
   same person is always the same avatar on every device, and two different
   people are almost never the same one. Drawn as an inline SVG — no request,
   no storage bucket, nothing to go missing.

   Uploaded photos can come later and slot into the same place; this is the
   default that means nobody ever sees an empty grey circle. */
const AV_COLOURS = [
    ['#f7a600', '#ff7a18'], ['#20b26c', '#0e8f7f'], ['#5aa9f0', '#3d6ef0'],
    ['#c58af0', '#8b5cf0'], ['#00c2c2', '#0891b2'], ['#ff7ac6', '#e0468f'],
    ['#ff9f43', '#f2622e'], ['#8c9099', '#5b6472']
];

function hashOf(str) {
    let h = 0;
    for (let i = 0; i < String(str).length; i++)
        h = (h * 31 + String(str).charCodeAt(i)) | 0;
    return Math.abs(h);
}

function initialsOf(name, email) {
    const src = String(name || '').trim() || String(email || '').split('@')[0] || '?';
    const words = src.replace(/[._-]+/g, ' ').split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return src.slice(0, 2).toUpperCase();
}

/* Returns SVG markup, ready to drop into innerHTML. `seed` should be the
   stable user id so the avatar never changes when someone edits their name. */
function avatar(seed, name, email, size) {
    const px = size || 34;
    const pair = AV_COLOURS[hashOf(seed || email || 'x') % AV_COLOURS.length];
    const id = 'av' + hashOf(String(seed) + px);
    const txt = initialsOf(name, email);
    return '<svg class="bt-avatar" width="' + px + '" height="' + px + '" viewBox="0 0 40 40" ' +
        'role="img" aria-label="' + txt + '">' +
        '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="' + pair[0] + '"/>' +
          '<stop offset="1" stop-color="' + pair[1] + '"/></linearGradient></defs>' +
        '<circle cx="20" cy="20" r="19" fill="url(#' + id + ')"/>' +
        '<circle cx="20" cy="20" r="19" fill="none" stroke="rgba(255,255,255,.28)"/>' +
        '<text x="20" y="20" text-anchor="middle" dominant-baseline="central" ' +
          'font-family="Inter, system-ui, sans-serif" font-size="15.5" font-weight="700" ' +
          'fill="#fff" fill-opacity=".95" letter-spacing=".4">' + txt + '</text>' +
    '</svg>';
}

return {
    avatar: avatar,
    initials: initialsOf,
    presets: () => PRESETS.slice(),
    recent:  () => recent.slice(),
    swatches: swatches,
    remember: remember,
    upgrade: upgrade,
    closePalette: closePalette
};

})();
