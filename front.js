/* ==========================================================================
   BarTest — the front of the site

   Two things live here and nothing else: the chart that IS the front door,
   and the page underneath the tree. Everything the site could already do —
   the room, the branches, the module panels, auth, checkout, reports — is
   untouched, and every control added here reaches those by clicking the
   control that already exists rather than by calling into app.js. That way
   the plan gate, the sign-in prompt and the Stripe wiring are all the ones
   that were already tested.
   ========================================================================== */

(function () {
    'use strict';

/* GBPUSD, 23-24 June 2016, two-minute candles built from the minute
   history in data/GBPUSD/2016-06.json.gz. Not illustrative: these are
   the measured prices, and the low is the low. */
const BREXIT_START = 1466715600;      // 21:00 UTC, 23 June 2016
const BREXIT_STEP  = 120;     // seconds per candle
const BREXIT = [[1.48773,1.48915,1.48647,1.48915],[1.48449,1.4915,1.48278,1.4915],[1.49143,1.49372,1.49045,1.49311],[1.4936,1.49853,1.49336,1.49843],[1.4985,1.4988,1.49681,1.49843],[1.49843,1.499,1.49707,1.499],[1.49882,1.49987,1.4981,1.49885],[1.4989,1.49972,1.49745,1.49836],[1.49864,1.49879,1.49698,1.49812],[1.49812,1.49845,1.49787,1.49822],[1.49817,1.49866,1.49751,1.49823],[1.49821,1.49854,1.49395,1.49493],[1.49494,1.49742,1.49467,1.49742],[1.49724,1.49796,1.49575,1.49616],[1.49616,1.49799,1.49616,1.49773],[1.49794,1.49794,1.497,1.4973],[1.4975,1.49757,1.49614,1.49615],[1.49615,1.49632,1.49524,1.49594],[1.49594,1.49631,1.49549,1.49598],[1.49596,1.4984,1.49592,1.49822],[1.49823,1.49857,1.49786,1.49798],[1.49798,1.49984,1.49768,1.4998],[1.4998,1.50003,1.49902,1.49968],[1.49968,1.5001,1.49959,1.49993],[1.49994,1.50084,1.49994,1.50075],[1.50073,1.50177,1.5004,1.50051],[1.50052,1.50094,1.49993,1.50012],[1.50012,1.50106,1.49995,1.50045],[1.50046,1.50093,1.50037,1.50058],[1.50054,1.50054,1.4976,1.49769],[1.49768,1.4978,1.49595,1.49648],[1.49648,1.49752,1.49642,1.49752],[1.49752,1.49767,1.49705,1.49749],[1.4975,1.49789,1.49651,1.49652],[1.49652,1.4974,1.49652,1.49697],[1.49701,1.49725,1.49646,1.49656],[1.49656,1.49694,1.49616,1.49672],[1.49671,1.49683,1.49599,1.49636],[1.49639,1.49639,1.49466,1.49519],[1.49519,1.49563,1.49483,1.4949],[1.49486,1.49557,1.49451,1.49532],[1.49532,1.49807,1.49524,1.49798],[1.49798,1.4985,1.49687,1.49717],[1.49717,1.49803,1.49703,1.49728],[1.49728,1.49778,1.49727,1.49763],[1.49763,1.4993,1.49741,1.49882],[1.49887,1.49893,1.49726,1.49742],[1.49742,1.49789,1.49728,1.49782],[1.49781,1.49834,1.49768,1.49802],[1.49801,1.49863,1.49637,1.49667],[1.49668,1.49691,1.49487,1.49502],[1.49503,1.49552,1.49304,1.49305],[1.4931,1.49324,1.49177,1.49217],[1.49216,1.49343,1.49161,1.49253],[1.49264,1.49335,1.49162,1.49183],[1.49182,1.4928,1.49105,1.49106],[1.49117,1.49121,1.48792,1.48997],[1.48997,1.49056,1.48993,1.48998],[1.48997,1.49001,1.48794,1.48796],[1.48796,1.48826,1.4801,1.48208],[1.48208,1.4839,1.48193,1.48244],[1.48244,1.48483,1.48243,1.48315],[1.4832,1.48383,1.48308,1.48313],[1.48313,1.48354,1.48239,1.48297],[1.48303,1.48387,1.48295,1.48343],[1.48341,1.48481,1.48326,1.48443],[1.48459,1.4853,1.48276,1.48356],[1.48355,1.48355,1.42848,1.43263],[1.43355,1.44775,1.42993,1.44221],[1.442,1.44873,1.44193,1.44744],[1.44744,1.45597,1.44744,1.45523],[1.45523,1.45688,1.45262,1.45611],[1.45611,1.45897,1.45447,1.45807],[1.45806,1.46192,1.45794,1.45864],[1.45858,1.45877,1.45234,1.45303],[1.45304,1.45481,1.45206,1.45401],[1.45403,1.46274,1.45403,1.46164],[1.46164,1.47354,1.46164,1.46604],[1.46604,1.46664,1.46416,1.46416],[1.46416,1.46416,1.44894,1.44983],[1.44985,1.4527,1.44478,1.44649],[1.44648,1.45789,1.4463,1.45166],[1.45155,1.45623,1.44945,1.45619],[1.45614,1.45994,1.45589,1.45799],[1.45852,1.45944,1.4567,1.4567],[1.45669,1.4573,1.45497,1.45645],[1.45647,1.46171,1.45166,1.45692],[1.45692,1.46018,1.45205,1.45437],[1.45473,1.45594,1.4542,1.45589],[1.45583,1.45639,1.45302,1.45623],[1.45623,1.45748,1.45542,1.4564],[1.45639,1.45687,1.45442,1.45476],[1.4548,1.45793,1.45443,1.45732],[1.45732,1.45972,1.45732,1.45971],[1.4597,1.45971,1.45556,1.45658],[1.45658,1.45681,1.45562,1.45623],[1.45629,1.459,1.45622,1.45798],[1.45798,1.46287,1.45795,1.46287],[1.46294,1.46504,1.45915,1.46076],[1.46087,1.46109,1.4581,1.45891],[1.45887,1.4594,1.45692,1.45735],[1.4573,1.4578,1.45643,1.45778],[1.45778,1.45778,1.45682,1.45712],[1.45712,1.45771,1.45643,1.45747],[1.45747,1.45747,1.45154,1.45365],[1.45359,1.45476,1.4533,1.45368],[1.45359,1.45469,1.45304,1.45453],[1.45449,1.45587,1.45439,1.45489],[1.45495,1.45525,1.45257,1.45295],[1.45293,1.45346,1.45082,1.45209],[1.45209,1.45362,1.45058,1.45329],[1.45313,1.46009,1.45205,1.45848],[1.45854,1.45947,1.4562,1.45675],[1.45675,1.45741,1.45611,1.45625],[1.45624,1.45741,1.45568,1.45621],[1.45621,1.46035,1.45605,1.45993],[1.45991,1.46013,1.45589,1.4573],[1.45723,1.45954,1.45333,1.45354],[1.45354,1.45354,1.44625,1.45255],[1.45175,1.45178,1.44565,1.45015],[1.45029,1.45131,1.44135,1.44172],[1.44143,1.44143,1.4311,1.43114],[1.43116,1.43137,1.41558,1.41604],[1.41612,1.4272,1.40025,1.42672],[1.42643,1.42643,1.41693,1.41902],[1.41902,1.42552,1.41814,1.42015],[1.41952,1.42036,1.41367,1.41974],[1.42015,1.42018,1.41396,1.41396],[1.41396,1.41756,1.40871,1.41756],[1.41797,1.43096,1.41787,1.43001],[1.42999,1.44249,1.42341,1.44188],[1.44191,1.44243,1.43101,1.4318],[1.43182,1.43885,1.43151,1.4362],[1.43618,1.44237,1.43493,1.44166],[1.44211,1.45142,1.44104,1.45086],[1.45115,1.45778,1.44651,1.44651],[1.44652,1.44993,1.44062,1.44993],[1.44989,1.45232,1.4451,1.44835],[1.44838,1.45154,1.44719,1.4514],[1.45141,1.45243,1.44858,1.45129],[1.45128,1.45303,1.44786,1.45072],[1.45072,1.45433,1.45072,1.45213],[1.45173,1.45195,1.44428,1.44574],[1.44583,1.4476,1.44519,1.44545],[1.44542,1.4479,1.44121,1.4415],[1.44179,1.44566,1.43793,1.44566],[1.44573,1.44599,1.44032,1.44164],[1.44164,1.44607,1.4411,1.4454],[1.44556,1.44556,1.43993,1.44039],[1.44035,1.44832,1.43993,1.44053],[1.44045,1.44286,1.4372,1.44099],[1.44099,1.44173,1.43822,1.4402],[1.4402,1.4402,1.43665,1.43748],[1.43764,1.43929,1.42708,1.42776],[1.42782,1.43217,1.42743,1.42981],[1.42996,1.43125,1.42746,1.42746],[1.4275,1.42785,1.41933,1.41979],[1.41975,1.42164,1.41667,1.41993],[1.41993,1.4245,1.41957,1.4245],[1.4245,1.4245,1.41421,1.41463],[1.4148,1.41517,1.41225,1.41253],[1.41258,1.41353,1.40001,1.40074],[1.40078,1.40465,1.40078,1.40091],[1.4009,1.40715,1.39676,1.40469],[1.40476,1.41311,1.40232,1.40432],[1.40441,1.40642,1.39854,1.40354],[1.40349,1.40604,1.40112,1.40469],[1.40466,1.40541,1.40028,1.40097],[1.40105,1.4013,1.39017,1.39057],[1.39083,1.39289,1.38195,1.38506],[1.38496,1.38552,1.36466,1.36492],[1.36502,1.38362,1.3638,1.3798],[1.37935,1.37935,1.36758,1.37721],[1.37719,1.38099,1.37022,1.37022],[1.3702,1.37944,1.36965,1.37767],[1.37774,1.37926,1.36751,1.36754],[1.36762,1.37,1.35548,1.3555],[1.3555,1.36781,1.35243,1.35992],[1.35992,1.36528,1.35454,1.35793],[1.35794,1.35794,1.34837,1.35113],[1.35098,1.35193,1.34615,1.34767],[1.34759,1.3602,1.34642,1.35945],[1.35927,1.35987,1.35356,1.3538],[1.35382,1.35925,1.35367,1.35641],[1.35641,1.36444,1.35635,1.36217],[1.36217,1.36862,1.36022,1.36647],[1.3666,1.36813,1.36303,1.36448],[1.36446,1.36448,1.35912,1.3603],[1.3603,1.36055,1.34613,1.34709],[1.34709,1.35419,1.34693,1.3536],[1.3536,1.35508,1.34835,1.35005],[1.35005,1.35968,1.34644,1.35541],[1.35387,1.35794,1.35331,1.35459],[1.35461,1.35558,1.34993,1.35034],[1.35006,1.35031,1.34865,1.34935],[1.34935,1.35464,1.34864,1.35087],[1.35073,1.35195,1.34857,1.35072],[1.35084,1.35173,1.34795,1.34923],[1.34923,1.35456,1.34923,1.35284],[1.35278,1.35291,1.34913,1.35046],[1.35047,1.35218,1.34778,1.34791],[1.34789,1.34789,1.34082,1.34093],[1.34089,1.34104,1.33154,1.33169],[1.33169,1.33298,1.33097,1.33126],[1.33143,1.33293,1.33013,1.33249],[1.33245,1.33857,1.33192,1.33568],[1.33568,1.34297,1.33509,1.3398],[1.3398,1.35479,1.33922,1.34969],[1.34957,1.34957,1.34412,1.34438],[1.34432,1.34712,1.3435,1.3466],[1.34654,1.35487,1.34654,1.35466],[1.35466,1.35488,1.35146,1.35278],[1.35278,1.35463,1.35166,1.35231],[1.35232,1.35235,1.34673,1.34843],[1.3484,1.35093,1.34436,1.3471],[1.34709,1.34732,1.3428,1.34463],[1.34463,1.34815,1.34373,1.34373],[1.34373,1.34676,1.34067,1.34186],[1.34188,1.34358,1.33893,1.33895],[1.33895,1.33917,1.33159,1.33238],[1.33243,1.3361,1.32983,1.33505],[1.33506,1.33645,1.32599,1.32599],[1.32616,1.32665,1.32289,1.32416],[1.32417,1.32424,1.32271,1.32409],[1.3241,1.33061,1.32365,1.3306],[1.33063,1.33212,1.3269,1.3269],[1.32689,1.33196,1.32646,1.33183],[1.33193,1.33324,1.3319,1.33245],[1.33225,1.33352,1.33221,1.33312],[1.33317,1.3432,1.33306,1.34277],[1.34361,1.34464,1.33792,1.34223],[1.34222,1.34282,1.33835,1.33919],[1.33924,1.33924,1.3358,1.33794],[1.33793,1.34148,1.33793,1.34144],[1.34144,1.34169,1.33596,1.33602],[1.33603,1.3367,1.33457,1.3367],[1.33691,1.34152,1.3365,1.3409],[1.34069,1.34193,1.34031,1.34143],[1.34138,1.34152,1.33651,1.33793],[1.33782,1.33953,1.33751,1.33921]];

    const $ = id => document.getElementById(id);
    const CALM = matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Clicking the site's own control rather than reimplementing what it
       does. A missing target is not worth throwing over — the page still
       reads, it just cannot open that panel. */
    function press(sel) {
        const el = document.querySelector(sel);
        if (el) el.click();
    }

    // ======================================================== the front door

    function hero() {
        const cvs = $('fd-tape');
        if (!cvs) return;
        const ctx   = cvs.getContext('2d');
        const box   = $('fd-hero');
        const scrub = $('fd-scrub');
        const noteE = $('fd-note'), noteT = $('fd-note-text');
        const clock = $('fd-clock'), clockD = $('fd-clock-day');
        const lastE = $('fd-last');
        const buyB  = $('fd-buy'),  sellB = $('fd-sell');
        const posW  = $('fd-pos'),  posS  = $('fd-pos-side');
        const posE  = $('fd-pos-entry'), posP = $('fd-pos-pl');

        const FLOOR = 40;
        let shown = CALM ? BREXIT.length : FLOOR;
        let position = null, started = CALM;

        /* Captions fire on what the price does, not on the clock. Triggering
           on the data is both more honest and more dramatic than a script:
           the note about the high appears when the high actually prints. */
        const marks = [
            { at: h => h >= 1.5000,
              text: 'A new high for the year. The market has decided it knows the answer.' },
            { at: (h, l, c) => c <= 1.4500,
              text: 'Sunderland. The first number that does not fit.' },
            { at: (h, l, c) => c <= 1.4000,
              text: 'Down four hundred pips. The desk is awake now.' },
            { at: (h, l, c) => c <= 1.3500,
              text: 'No bid. This is the part nobody had a plan for.' },
            { at: (h, l) => l <= 1.32300,
              text: '1.32271 — the low. Thirty-one years since sterling was here.' }
        ];
        const fired = marks.map(() => false);

        const PAD = { t: 18, r: 78, b: 22, l: 12 };

        function size() {
            const dpr = Math.min(devicePixelRatio || 1, 2);
            const w = cvs.clientWidth, h = cvs.clientHeight;
            if (!w || !h) return false;
            cvs.width = Math.round(w * dpr);
            cvs.height = Math.round(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            return true;
        }

        function draw() {
            if (!size()) return;
            const W = cvs.clientWidth, H = cvs.clientHeight;
            ctx.clearRect(0, 0, W, H);
            const rows = BREXIT.slice(0, shown);
            if (!rows.length) return;

            let hi = -Infinity, lo = Infinity;
            for (const r of rows) { if (r[1] > hi) hi = r[1]; if (r[2] < lo) lo = r[2]; }
            const pad = (hi - lo) * 0.10 || 0.001;
            hi += pad; lo -= pad;

            const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
            const y = p => PAD.t + (hi - p) / (hi - lo) * plotH;

            /* The window runs a little ahead of what has printed, so there is
               always empty chart to the right of the last candle. That gap is
               the whole idea of the product — it is where the next candle
               goes, and you cannot see it. */
            const slots = Math.min(BREXIT.length, Math.max(56, Math.round(shown * 1.28)));
            const slot = plotW / slots;
            const bw = Math.max(1.4, Math.min(6, slot * 0.66));

            ctx.font = '500 10px "IBM Plex Mono", monospace';
            ctx.textBaseline = 'middle';
            const step = 0.02;
            for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) {
                const yy = y(p);
                ctx.strokeStyle = 'rgba(236,231,221,.055)';
                ctx.beginPath(); ctx.moveTo(PAD.l, yy); ctx.lineTo(W - PAD.r, yy); ctx.stroke();
                ctx.fillStyle = '#635e78';
                ctx.textAlign = 'left';
                ctx.fillText(p.toFixed(4), W - PAD.r + 9, yy);
            }

            for (let i = 0; i < rows.length; i++) {
                const o = rows[i][0], h = rows[i][1], l = rows[i][2], c = rows[i][3];
                const x = PAD.l + i * slot + slot / 2;
                ctx.strokeStyle = ctx.fillStyle = c >= o ? '#20b26c' : '#ef454a';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(Math.round(x) + .5, y(h));
                ctx.lineTo(Math.round(x) + .5, y(l));
                ctx.stroke();
                const top = y(Math.max(o, c)), bot = y(Math.min(o, c));
                ctx.fillRect(x - bw / 2, top, bw, Math.max(1, bot - top));
            }

            const lastRow = rows[rows.length - 1];
            const c = lastRow[3], o = lastRow[0], yy = y(c);
            ctx.fillStyle = c >= o ? '#20b26c' : '#ef454a';
            ctx.fillRect(W - PAD.r + 4, yy - 9, PAD.r - 8, 18);
            ctx.fillStyle = '#070612';
            ctx.textAlign = 'center';
            ctx.font = '600 11px "IBM Plex Mono", monospace';
            ctx.fillText(c.toFixed(5), W - PAD.r + 4 + (PAD.r - 8) / 2, yy);

            ctx.strokeStyle = c >= o ? 'rgba(32,178,108,.34)' : 'rgba(239,69,74,.34)';
            ctx.setLineDash([3, 4]);
            ctx.beginPath(); ctx.moveTo(PAD.l, yy); ctx.lineTo(W - PAD.r, yy); ctx.stroke();
            ctx.setLineDash([]);
        }

        function stamp() {
            const secs = BREXIT_START + (shown - 1) * BREXIT_STEP + 3600;   // London is UTC+1
            const d = new Date(secs * 1000);
            clock.textContent = String(d.getUTCHours()).padStart(2, '0') + ':' +
                                String(d.getUTCMinutes()).padStart(2, '0');
            clockD.textContent = d.getUTCDate() + ' June 2016 · London';

            const rows = BREXIT.slice(0, shown);
            let hi = -Infinity, lo = Infinity;
            for (const r of rows) { if (r[1] > hi) hi = r[1]; if (r[2] < lo) lo = r[2]; }
            const c = rows[rows.length - 1][3];
            lastE.textContent = c.toFixed(5);
            lastE.className = 'fd-tnum ' + (c >= BREXIT[0][0] ? 'fd-up' : 'fd-down');

            marks.forEach((m, i) => {
                if (!started || fired[i] || !m.at(hi, lo, c)) return;
                fired[i] = true;
                noteT.textContent = m.text;
                noteE.classList.add('on');
            });

            if (position) {
                const pips = (c - position.at) * 10000 * (position.side === 'long' ? 1 : -1);
                posP.textContent = (pips >= 0 ? '+' : '') + pips.toFixed(0) + ' pips';
                posP.className = 'fd-tnum ' + (pips >= 0 ? 'fd-up' : 'fd-down');
            }
        }

        function take(side) {
            const c = BREXIT[shown - 1][3];
            position = { side: side, at: c };
            posW.hidden = false;
            posS.textContent = side === 'long' ? 'Long from' : 'Short from';
            posE.textContent = c.toFixed(5);
            buyB.disabled = sellB.disabled = true;
            stamp();
        }
        if (buyB)  buyB.addEventListener('click', () => take('long'));
        if (sellB) sellB.addEventListener('click', () => take('short'));

        /* The scroll position of the tall section behind the chart is the
           clock. Read on a frame rather than on every scroll event, because a
           phone fires those faster than it can draw. */
        let queued = false;
        function fromScroll() {
            queued = false;
            if (CALM) return;
            /* While a modal pins the body with position:fixed the page reports
               scroll 0, which would snap the night back to its first candle
               behind the overlay. The tree scrubber parks for the same reason. */
            if (document.body.classList.contains('modal-locked')) return;

            const r = scrub.getBoundingClientRect();
            const travel = scrub.offsetHeight - innerHeight;
            if (travel <= 0) return;
            const p = Math.min(1, Math.max(0, -r.top / travel));

            /* The ticket opens as soon as the market starts moving. Being able
               to go long at half past eleven and then keep scrolling into the
               crash is the whole product in one gesture. */
            if (p > 0.004) {
                started = true;
                box.classList.add('moving');
                if (!position && buyB) { buyB.disabled = false; sellB.disabled = false; }
            } else {
                box.classList.remove('moving');
            }
            box.classList.toggle('over', p > 0.985);

            const want = Math.max(FLOOR, Math.round(FLOOR + p * (BREXIT.length - FLOOR)));
            if (want === shown) return;
            shown = want;
            draw(); stamp();
        }
        function onScroll() {
            if (!queued) { queued = true; requestAnimationFrame(fromScroll); }
        }

        addEventListener('scroll', onScroll, { passive: true });
        addEventListener('resize', () => { draw(); onScroll(); }, { passive: true });
        draw(); stamp(); fromScroll();
    }

    // ================================================== the example report

    /* An equity curve worth looking at has a shape, not just a slope: a run
       up, a drawdown deep enough to be honest about, and a recovery. Built
       from a fixed seed so the page draws the same curve every time — an
       example that changed on reload would be a chart of nothing. */
    function equityPoints() {
        let seed = 20160624, v = 0;
        const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - .5;
        const pts = [];
        for (let i = 0; i <= 120; i++) {
            v += (i > 52 && i < 74 ? -0.62 : 0.34) + rnd() * 1.5;
            pts.push(v);
        }
        const lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts);
        return pts.map((p, i) => [i / 120 * 640, 150 - (p - lo) / (hi - lo) * 128]);
    }

    function paintReport() {
        const svg = $('fd-curve');
        if (!svg || svg.dataset.done) return;
        svg.dataset.done = '1';

        const d = equityPoints()
            .map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1))
            .join(' ');
        svg.innerHTML =
            '<defs><linearGradient id="fd-eg" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#f7a600" stop-opacity=".30"/>' +
            '<stop offset="100%" stop-color="#f7a600" stop-opacity="0"/></linearGradient></defs>' +
            '<path fill="url(#fd-eg)" stroke="none" d="' + d + ' L640 168 L0 168 Z"/>' +
            '<path class="line" d="' + d + '"/>';

        if (!CALM) {
            const line = svg.querySelector('.line');
            const len = line.getTotalLength();
            line.style.strokeDasharray = len;
            line.style.strokeDashoffset = len;
            line.getBoundingClientRect();
            line.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(.3,.9,.3,1)';
            line.style.strokeDashoffset = '0';
        }

        document.querySelectorAll('.fd-metrics [data-count]').forEach(el => {
            const to = parseFloat(el.dataset.count);
            const dp = el.dataset.dp !== undefined ? +el.dataset.dp : 1;
            const pre = el.dataset.prefix || '', suf = el.dataset.suffix || '';
            if (CALM) { el.textContent = pre + to.toFixed(dp) + suf; return; }
            const t0 = performance.now();
            (function tick(t) {
                const k = Math.min(1, (t - t0) / 1100);
                el.textContent = pre + (to * (1 - Math.pow(1 - k, 3))).toFixed(dp) + suf;
                if (k < 1) requestAnimationFrame(tick);
            })(t0);
        });
    }

    // ========================================================= the tiers

    /* Built from the subscription modal's own cards rather than written out
       again. The modal carries the Stripe price ids and the amounts, so it is
       the one place a price is stated — change it there and the front page
       follows. Two copies of a price is one copy too many. */
    function tiers() {
        const host = $('fd-tiers');
        if (!host) return;
        const cards = document.querySelectorAll('#subscription-modal-overlay .tier-card');
        if (!cards.length) { host.closest('.fd-block').hidden = true; return; }

        let html = '';
        cards.forEach((card, i) => {
            const name = card.querySelector('.tier-name');
            const desc = card.querySelector('.tier-desc');
            const m = +card.dataset.monthAmt || 0;
            const yr = +card.dataset.yearAmt || 0;
            const feats = Array.from(card.querySelectorAll('.tier-features li')).map(li => ({
                text: li.textContent.trim(),
                no: !!li.querySelector('.unavailable')
            }));
            html +=
                '<article class="fd-slab' + (i === cards.length - 1 ? ' lead' : '') + '">' +
                  '<span class="role">' + (name ? name.textContent.trim() : '') + '</span>' +
                  '<div class="fd-price"><b class="fd-tnum" data-m="' + m + '" data-y="' +
                     (yr / 12).toFixed(2) + '">' + m + '</b>' +
                     '<i>$ / month</i></div>' +
                  '<p class="fd-billed" data-m="Billed monthly" data-y="$' + yr +
                     ' billed once a year">Billed monthly</p>' +
                  '<p>' + (desc ? desc.textContent.trim() : '') + '</p>' +
                  '<ul>' + feats.map(f =>
                      '<li' + (f.no ? ' class="no"' : '') + '>' + f.text + '</li>').join('') + '</ul>' +
                  '<div class="foot"><button class="fd-btn' +
                     (i === cards.length - 1 ? ' brass' : '') +
                     '" data-tier="' + (card.dataset.tier || '') + '">Choose this</button></div>' +
                '</article>';
        });
        host.innerHTML = html;

        host.querySelectorAll('[data-tier]').forEach(b =>
            b.addEventListener('click', () => press('#nav-subscription-btn')));

        const mB = $('fd-cyc-m'), yB = $('fd-cyc-y');
        function cycle(yearly) {
            if (mB) mB.setAttribute('aria-pressed', String(!yearly));
            if (yB) yB.setAttribute('aria-pressed', String(yearly));
            host.querySelectorAll('.fd-price b').forEach(b => {
                b.textContent = yearly ? b.dataset.y : b.dataset.m;
            });
            host.querySelectorAll('.fd-billed').forEach(p => {
                p.textContent = yearly ? p.dataset.y : p.dataset.m;
            });
        }
        if (mB) mB.addEventListener('click', () => cycle(false));
        if (yB) yB.addEventListener('click', () => cycle(true));
    }

    // ============================================================= wiring

    function wire() {
        document.querySelectorAll('[data-goto]').forEach(b =>
            b.addEventListener('click', e => {
                e.preventDefault();
                press('.branch[data-id="' + b.dataset.goto + '"]');
            }));

        document.querySelectorAll('[data-plans]').forEach(b =>
            b.addEventListener('click', e => { e.preventDefault(); press('#nav-subscription-btn'); }));

        document.querySelectorAll('[data-jump]').forEach(a =>
            a.addEventListener('click', e => {
                e.preventDefault();
                const t = document.getElementById(a.dataset.jump);
                if (t) t.scrollIntoView({ behavior: CALM ? 'auto' : 'smooth', block: 'start' });
            }));

        // the bar earns a background once it is over content rather than sky
        const onScroll = () =>
            document.body.classList.toggle('fd-stuck', scrollY > innerHeight * 0.4);
        addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    function reveals() {
        if (CALM || !('IntersectionObserver' in window)) return;
        document.body.classList.add('fd-anim');
        const io = new IntersectionObserver(es => {
            es.forEach(e => {
                if (!e.isIntersecting) return;
                e.target.classList.add('fd-here');
                io.unobserve(e.target);
            });
        }, { rootMargin: '0px 0px -12% 0px' });
        document.querySelectorAll('.fd-block').forEach(b => io.observe(b));

        const rio = new IntersectionObserver(es => {
            es.forEach(e => { if (e.isIntersecting) { paintReport(); rio.disconnect(); } });
        }, { rootMargin: '0px 0px -20% 0px' });
        const rep = $('fd-report');
        if (rep) rio.observe(rep);
    }

    function start() {
        hero();
        tiers();
        wire();
        reveals();
        if (CALM || !('IntersectionObserver' in window)) paintReport();
    }

    if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start);
    else start();
})();
