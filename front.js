/* ==========================================================================
   BarTest — THE TAPE

   Six stations laid out in a world two screens wide and three deep, and a
   camera that walks between them as you scroll: right, down, left, down,
   right. The route is drawn into the world as a line, because the line is a
   price and the price is what BarTest sells.

   Two mechanics share the scroll and never fight, because they are
   sequenced. The first stretch holds the camera still at station zero while
   the night of the 2016 referendum prints candle by candle — scroll is time.
   After that the night is done and scroll is distance — the camera travels.

   The panels ride in one transformed layer and the chart is painted on a
   viewport-sized canvas in camera space, so a move is one transform and one
   cheap redraw rather than a relayout.

   Nothing here reimplements the site. Every action calls openService(), the
   shared entry point the branches used, so the plan gate, the sign-in prompt
   and the Stripe wiring are the ones that were already tested.
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
    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    const lerp = (a, b, t) => a + (b - a) * t;
    // Ease every leg, so the camera arrives and departs rather than jerking.
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    /* --------------------------------------------------------------- route

       Cell coordinates in screens. Right, down, left, down, right — the shape
       a reader's eye already makes, turned into a floor plan. `hold` is how
       much of the scroll is spent standing still at that station relative to
       a leg of travel. Station zero used to hold for three and a half screens
       because a whole night ran there. The opening reads on a clock of its
       own now, so the hold only has to be long enough for the tape behind it
       to finish printing. */
    const ROUTE = [
        { id: 'tape',    cx: 0, cy: 0, hold: 2.0, label: 'The tape' },
        { id: 'machine', cx: 1, cy: 0, hold: 1.7, label: 'The machine' },
        { id: 'replay',  cx: 1, cy: 1, hold: 1.5, label: 'BarTest Replay' },
        { id: 'loop',    cx: 0, cy: 1, hold: 1.3, label: 'The loop' },
        { id: 'plans',   cx: 0, cy: 2, hold: 1.5, label: 'Plans' },
        { id: 'rest',    cx: 1, cy: 2, hold: 1.4, label: 'Everything else' }
    ];
    const LEG = 1.15;                 // scroll spent travelling between two stations

    /* Where in the scroll each station begins and ends. Built once so the
       camera, the compass and the night all read the same clock. */
    const marks = (() => {
        const out = []; let t = 0;
        ROUTE.forEach((s, i) => {
            if (i) t += LEG;
            out.push({ from: t, to: t + s.hold });
            t += s.hold;
        });
        return { spans: out, total: t };
    })();

    let VW = innerWidth, VH = innerHeight;
    const cam = { x: 0, y: 0, z: 1 };
    let at = 0;                       // nearest station
    let openP = 0;                    // 0..1 through station zero's hold
    let legK = 0;                     // 0 parked at a station, 1 mid-journey

    // ===================================================== the world canvas

    const sky = $('fd-sky');
    const sctx = sky ? sky.getContext('2d') : null;

    function fitCanvas() {
        if (!sky) return;
        const dpr = Math.min(devicePixelRatio || 1, 2);
        sky.width = Math.round(VW * dpr);
        sky.height = Math.round(VH * dpr);
        sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* The chart lives across the top row of the world, two screens wide. It
       is the same 240 candles the night is made of, so travelling right is
       literally travelling along the tape you have just watched print. */
    function chartBox() {
        return { x: VW * 0.06, y: VH * 0.16, w: VW * 1.88, h: VH * 0.62 };
    }

    function paintSky() {
        if (!sctx) return;
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        const dpr = Math.min(devicePixelRatio || 1, 2);
        sctx.scale(dpr, dpr);
        sctx.clearRect(0, 0, VW, VH);

        sctx.save();
        sctx.translate(VW / 2 - cam.x * cam.z, VH / 2 - cam.y * cam.z);
        sctx.scale(cam.z, cam.z);

        const worldW = 2 * VW, worldH = 3 * VH;

        // a grid, so movement has something to be measured against
        const step = VW / 14;
        sctx.strokeStyle = 'rgba(236,231,221,.045)';
        sctx.lineWidth = 1 / cam.z;
        sctx.beginPath();
        for (let x = 0; x <= worldW; x += step) { sctx.moveTo(x, 0); sctx.lineTo(x, worldH); }
        for (let y = 0; y <= worldH; y += step) { sctx.moveTo(0, y); sctx.lineTo(worldW, y); }
        sctx.stroke();

        // the route, drawn as the thing it is: a line through a market
        const pts = ROUTE.map(s => [s.cx * VW + VW / 2, s.cy * VH + VH / 2]);
        sctx.strokeStyle = 'rgba(247,166,0,.22)';
        sctx.lineWidth = 2 / cam.z;
        sctx.beginPath();
        pts.forEach((p, i) => i ? sctx.lineTo(p[0], p[1]) : sctx.moveTo(p[0], p[1]));
        sctx.stroke();

        // travelled so far, brighter — you can see where you have been
        const doneTo = at + (marks.spans[at] ? 0 : 0);
        sctx.strokeStyle = 'rgba(247,166,0,.75)';
        sctx.lineWidth = 2.5 / cam.z;
        sctx.beginPath();
        for (let i = 0; i <= doneTo && i < pts.length; i++) {
            i ? sctx.lineTo(pts[i][0], pts[i][1]) : sctx.moveTo(pts[i][0], pts[i][1]);
        }
        sctx.stroke();

        pts.forEach((p, i) => {
            const live = i === at;
            sctx.fillStyle = i <= at ? '#f7a600' : 'rgba(99,94,120,.9)';
            sctx.beginPath();
            sctx.arc(p[0], p[1], (live ? 7 : 4) / cam.z, 0, 6.284);
            sctx.fill();
            if (live) {
                sctx.strokeStyle = 'rgba(247,166,0,.28)';
                sctx.lineWidth = 10 / cam.z;
                sctx.beginPath(); sctx.arc(p[0], p[1], 12 / cam.z, 0, 6.284); sctx.stroke();
            }
        });

        paintTape(sctx);

        /* A ground for the words. Parked at a station the cell you are
           standing in is dimmed from the left, so the panel is legible and
           the market still shows through behind it; the moment the camera
           moves the dimming lifts and you see the whole place you are
           travelling across. Drawn last, so it covers the route as well —
           a glowing line through a paragraph is worse than no line. */
        const cell = ROUTE[at];
        if (legK < 0.98) {
            const g = sctx.createLinearGradient(cell.cx * VW, 0, cell.cx * VW + VW, 0);
            const k = 1 - legK;
            g.addColorStop(0,   'rgba(6,5,14,' + (0.95 * k).toFixed(3) + ')');
            g.addColorStop(0.62,'rgba(6,5,14,' + (0.86 * k).toFixed(3) + ')');
            g.addColorStop(1,   'rgba(6,5,14,' + (0.42 * k).toFixed(3) + ')');
            sctx.fillStyle = g;
            sctx.fillRect(cell.cx * VW, cell.cy * VH, VW, VH);
        }

        sctx.restore();
    }

    /* ------------------------------------------------------------ the tape */

    const FLOOR = 40;                       // candles showing before anyone moves
    let shownBars = FLOOR;

    function paintTape(c) {
        const box = chartBox();
        const rows = BREXIT.slice(0, shownBars);
        if (!rows.length) return;

        let hi = -Infinity, lo = Infinity;
        for (const r of rows) { if (r[1] > hi) hi = r[1]; if (r[2] < lo) lo = r[2]; }
        const pad = (hi - lo) * 0.10 || 0.001;
        hi += pad; lo -= pad;
        const y = p => box.y + (hi - p) / (hi - lo) * box.h;

        /* The window runs ahead of what has printed, so there is always empty
           chart to the right of the last candle. That gap is the product:
           it is where the next candle goes, and you cannot see it. */
        const slots = Math.min(BREXIT.length, Math.max(56, Math.round(shownBars * 1.28)));
        const slot = box.w / slots;
        const bw = Math.max(1.2, Math.min(9, slot * 0.66));

        c.font = (11 / cam.z).toFixed(1) + 'px "IBM Plex Mono", monospace';
        c.textBaseline = 'middle';
        const gstep = 0.02;
        for (let p = Math.ceil(lo / gstep) * gstep; p <= hi; p += gstep) {
            const yy = y(p);
            c.strokeStyle = 'rgba(236,231,221,.06)';
            c.lineWidth = 1 / cam.z;
            c.beginPath(); c.moveTo(box.x, yy); c.lineTo(box.x + box.w, yy); c.stroke();
            c.fillStyle = '#635e78';
            c.textAlign = 'left';
            c.fillText(p.toFixed(4), box.x + box.w + 10, yy);
        }

        for (let i = 0; i < rows.length; i++) {
            const o = rows[i][0], h = rows[i][1], l = rows[i][2], cl = rows[i][3];
            const x = box.x + i * slot + slot / 2;
            c.strokeStyle = c.fillStyle = cl >= o ? '#20b26c' : '#ef454a';
            c.lineWidth = Math.max(1 / cam.z, bw * 0.16);
            c.beginPath(); c.moveTo(x, y(h)); c.lineTo(x, y(l)); c.stroke();
            const top = y(Math.max(o, cl)), bot = y(Math.min(o, cl));
            c.fillRect(x - bw / 2, top, bw, Math.max(1 / cam.z, bot - top));
        }

        const last = rows[rows.length - 1];
        const yy = y(last[3]);
        c.strokeStyle = last[3] >= last[0] ? 'rgba(32,178,108,.4)' : 'rgba(239,69,74,.4)';
        c.lineWidth = 1 / cam.z;
        c.setLineDash([4 / cam.z, 5 / cam.z]);
        c.beginPath(); c.moveTo(box.x, yy); c.lineTo(box.x + box.w, yy); c.stroke();
        c.setLineDash([]);
    }

    // ================================================ station zero, reading

    /* The opening has one job: a stranger has to know what is sold here
       before they scroll. Two attempts failed at it. A headline about a
       candle over a chart read as atmosphere. A sentence churning character
       by character into code was alive, but it showed a machine typing, and
       nobody buys the typing.

       What is unusual on this desk is the reading. So the screen reads. A
       rule written the way a trader would say it out loud is taken phrase by
       phrase, and each phrase lands in the slot of the specification it
       fills. Six labelled gaps become a spec while you watch.

       Every system here is written in full and marked up by hand rather than
       matched with a pattern. The submission page has the regexes, where they
       are reading something a person actually typed; a demonstration that
       parses its own fixture would be theatre pretending to be a parser. */

    const SYSTEMS = [
        ['Buy when the ',
         ['21 EMA crosses above the 55 EMA', 'Entry', 'EMA 21 \u2191 55'],
         '. Stop ',
         ['below the last swing low', 'Stop', 'Last swing low'],
         ', and take ',
         ['twice that as the target', 'Target', '2 \u00d7 risk'],
         '. Run it on ',
         ['EURUSD', 'Market', 'EURUSD'],
         ', ',
         ['one hour', 'Timeframe', '1 hour'],
         ', ',
         ['as far back as the data goes', 'History', '2016 \u2192 today'],
         '.'],

        ['Short when ',
         ['RSI comes back under 70 from above', 'Entry', 'RSI 14 \u2193 70'],
         '. Cover at ',
         ['the 20 EMA', 'Exit', 'EMA 20'],
         ', or at ',
         ['three times the risk', 'Target', '3 \u00d7 risk'],
         '. Risk ',
         ['one per cent of the account on each trade', 'Size', '1% of equity'],
         '. ',
         ['GBPUSD', 'Market', 'GBPUSD'],
         ', ',
         ['fifteen minutes', 'Timeframe', '15 minutes'],
         '.'],

        ['Trade only ',
         ['the London open', 'Session', 'London open'],
         ', and only ',
         ['the first pullback', 'Entry', 'First pullback'],
         '. Be ',
         ['flat by the New York close', 'Exit', 'NY close'],
         ' \u2014 ',
         ['nothing held overnight', 'Rule', 'No overnight'],
         '. ',
         ['Any major pair', 'Market', '7 majors'],
         ', and ',
         ['show me every trade it took', 'Output', 'Full trade log'],
         '.']
    ];

    const IN_MS = 480, STEP_MS = 660, LIGHT_MS = 210, DWELL_MS = 2500, OUT_MS = 400;

    let sysI = 0, cue = [], cueI = 0, cueT0 = 0, readOn = false;

    const esc = t => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const picks = sys => sys.filter(p => Array.isArray(p));

    function setLive(t) { const e = $('fd-live-text'); if (e) e.textContent = t; }

    function drawSystem() {
        const line = $('fd-sentence'), slots = $('fd-slots');
        if (!line || !slots) return;
        const sys = SYSTEMS[sysI];
        let html = '', n = 0;
        sys.forEach(p => {
            html += Array.isArray(p)
                ? '<mark data-i="' + (n++) + '">' + esc(p[0]) + '</mark>'
                : esc(p);
        });
        line.innerHTML = html;
        slots.innerHTML = picks(sys).map((p, i) =>
            '<div class="fd-slot" data-i="' + i + '">' +
                '<span class="k">' + esc(p[1]) + '</span>' +
                '<span class="v">' + esc(p[2]) + '</span>' +
            '</div>').join('');
        setLive('Backtest Machine \u00b7 reading');
        const open = $('fd-open');
        if (open) open.classList.remove('out');
    }

    function light(i) {
        const m = document.querySelector('#fd-sentence mark[data-i="' + i + '"]');
        if (m) m.classList.add('on');
    }
    function fill(i) {
        const el = document.querySelector('#fd-slots .fd-slot[data-i="' + i + '"]');
        if (el) el.classList.add('on');
    }

    /* One pass over one system, as a list of things to do and when. Built
       fresh each time round so a system with a different number of phrases
       simply takes a different length of time. */
    function schedule() {
        const n = picks(SYSTEMS[sysI]).length;
        const out = [{ t: 0, go: drawSystem }];
        for (let i = 0; i < n; i++) {
            out.push({ t: IN_MS + i * STEP_MS,             go: () => light(i) });
            out.push({ t: IN_MS + i * STEP_MS + LIGHT_MS,  go: () => fill(i) });
        }
        const done = IN_MS + (n - 1) * STEP_MS + LIGHT_MS + 320;
        out.push({ t: done, go: () => setLive('Backtest Machine \u00b7 ' + n + ' of ' + n + ' read') });
        out.push({ t: done + DWELL_MS, go: () => {
            const open = $('fd-open');
            if (open) open.classList.add('out');
        } });
        out.push({ t: done + DWELL_MS + OUT_MS, go: () => {} });
        return out;
    }

    function readTick(t) {
        if (!readOn) return;
        paintReplay(t);
        const e = t - cueT0;
        while (cueI < cue.length && cue[cueI].t <= e) cue[cueI++].go();
        if (cueI >= cue.length) {
            sysI = (sysI + 1) % SYSTEMS.length;
            cue = schedule(); cueI = 0; cueT0 = t;
        }
        requestAnimationFrame(readTick);
    }

    /* Off the moment the camera leaves station zero or the tab is hidden, and
       it starts the current system again rather than resuming mid-sentence -
       half a read is not worth coming back to. */
    function readWant(on) {
        if (on === readOn) return;
        readOn = on;
        if (!on) return;
        cue = schedule(); cueI = 0; cueT0 = performance.now();
        requestAnimationFrame(readTick);
    }

    function startRead() {
        fitReplay();
        drawSystem();
        if (CALM) {
            // the session, already finished, which is the frame worth stopping on
            paintReplay(RP_B + 900);
            const n = picks(SYSTEMS[0]).length;
            for (let i = 0; i < n; i++) { light(i); fill(i); }
            setLive('Backtest Machine \u00b7 ' + n + ' of ' + n + ' read');
            return;
        }
        readWant(true);
        document.addEventListener('visibilitychange',
            () => readWant(!document.hidden && at === 0));
    }

    // ============================================== the other desk, running

    /* A picture of a terminal proves nothing, so this one runs. It plays the
       loop BarTest Replay exists for, on a fixed series so it is the same
       session every time: the tape moves forward one bar at a time, a trade
       goes on at a bar that has not happened yet, and the dock keeps the
       score. Pressing it goes to the Replay station rather than into the
       terminal itself - somebody who has not read what it is should read that
       first, and the station is where that is written.

       The window holds every bar of the session and the price axis is taken
       from all of them at once, so the chart does not rescale under itself
       while it prints. */

    const TAPE = (() => {
        let x = 20160624, p = 1.2684;
        const rnd = () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        const out = [];
        for (let i = 0; i < 46; i++) {
            const o = p;
            // it turns where the trade goes on, which is the point of the demo
            p += (i < 30 ? -0.00013 : 0.00046) + (rnd() - 0.5) * 0.00165;
            out.push([o, Math.max(o, p) + rnd() * 0.0007,
                         Math.min(o, p) - rnd() * 0.0007, p]);
        }
        return out;
    })();

    const RP_ENTRY_BAR = 30, RP_LAST_BAR = 45;
    const RP_A = 3400, RP_B = 6500, RP_CYCLE = 9600, RP_STEP = 190;
    const rpEntry = TAPE[RP_ENTRY_BAR][3], rpExit = TAPE[RP_LAST_BAR][3];

    const rchart = $('rp-chart');
    const rctx = rchart ? rchart.getContext('2d') : null;
    let rW = 0, rH = 0, rShown = -1, rPhase = -1;

    function fitReplay() {
        if (!rchart || !rctx) return;
        const r = rchart.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const dpr = Math.min(devicePixelRatio || 1, 2);
        rW = r.width; rH = r.height;
        rchart.width = Math.round(r.width * dpr);
        rchart.height = Math.round(r.height * dpr);
        rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        rShown = -1;                       // force the dock to repaint too
    }

    function rpAt(e) {
        if (e < RP_A)  return { shown: 15 + Math.min(16, (e / RP_STEP) | 0), phase: 0 };
        if (e < RP_B)  return { shown: 31 + Math.min(15, ((e - RP_A) / RP_STEP) | 0), phase: 1 };
        return { shown: 46, phase: 2 };
    }

    /* One lot of 0.10 on a dollar-quoted pair is a dollar a pip, which is why
       the account can move in whole numbers without anybody having to be told
       the contract size. */
    const RP_BAL = 50000, RP_PER_PIP = 1;
    const pips = (a, b) => (b - a) * 10000;
    const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
    const signed = v => (v >= 0 ? '+' : '\u2212') + plural(+Math.abs(v).toFixed(0), 'pip');
    const money = v => (v >= 0 ? '+$' : '\u2212$') + Math.abs(v).toFixed(2);
    const hhmm = bar => {
        const m = 9 * 60 + 15 + bar * 15;
        return String(((m / 60) | 0) % 24).padStart(2, '0') + ':' +
               String(m % 60).padStart(2, '0');
    };

    function paintReplay(t) {
        if (!rctx || !rW) return;
        const st = rpAt(t % RP_CYCLE);
        drawTape(st);
        if (st.shown !== rShown || st.phase !== rPhase) {
            rShown = st.shown; rPhase = st.phase;
            drawDock(st);
        }
    }

    function drawTape(st) {
        const padL = 9, padR = 54, padT = 11, padB = 19;
        const w = rW - padL - padR, h = rH - padT - padB;

        let hi = -Infinity, lo = Infinity;
        for (const b of TAPE) { if (b[1] > hi) hi = b[1]; if (b[2] < lo) lo = b[2]; }
        const pad = (hi - lo) * 0.08;
        hi += pad; lo -= pad;
        const y = p => padT + (hi - p) / (hi - lo) * h;

        const slots = TAPE.length + 3;          // the gap on the right is the point
        const slot = w / slots;
        const bw = Math.max(1.6, slot * 0.6);
        const x = i => padL + i * slot + slot / 2;

        rctx.clearRect(0, 0, rW, rH);
        rctx.font = '9px "IBM Plex Mono", monospace';
        rctx.textBaseline = 'middle';

        /* the axes, which are most of what makes a chart read as a chart */
        rctx.strokeStyle = 'rgba(236,231,221,.055)';
        rctx.lineWidth = 1;
        for (let g = 0; g <= 4; g++) {
            const yy = Math.round(padT + h * g / 4) + 0.5;
            rctx.beginPath(); rctx.moveTo(padL, yy); rctx.lineTo(rW - padR, yy); rctx.stroke();
            rctx.fillStyle = '#635e78';
            rctx.textAlign = 'left';
            rctx.fillText((hi - (hi - lo) * g / 4).toFixed(4), rW - padR + 7, yy);
        }
        const axis = Math.round(rH - padB) + 0.5;
        rctx.strokeStyle = 'rgba(236,231,221,.09)';
        rctx.beginPath(); rctx.moveTo(padL, axis); rctx.lineTo(rW - padR, axis); rctx.stroke();
        rctx.textAlign = 'center';
        rctx.fillStyle = '#635e78';
        for (let i = 4; i < TAPE.length; i += 10) rctx.fillText(hhmm(i), x(i), rH - padB / 2 + 1);

        for (let i = 0; i < st.shown; i++) {
            const b = TAPE[i], up = b[3] >= b[0];
            rctx.strokeStyle = rctx.fillStyle = up ? '#20b26c' : '#ef454a';
            rctx.lineWidth = Math.max(1, bw * 0.17);
            rctx.beginPath(); rctx.moveTo(x(i), y(b[1])); rctx.lineTo(x(i), y(b[2])); rctx.stroke();
            const top = y(Math.max(b[0], b[3])), bot = y(Math.min(b[0], b[3]));
            rctx.fillRect(x(i) - bw / 2, top, bw, Math.max(1, bot - top));
        }

        const last = TAPE[st.shown - 1][3];

        if (st.phase >= 1) {                       // the trade, once it is on
            const ey = y(rpEntry);
            rctx.strokeStyle = 'rgba(53,208,127,.5)';
            rctx.lineWidth = 1;
            rctx.setLineDash([3, 4]);
            rctx.beginPath();
            rctx.moveTo(x(RP_ENTRY_BAR), ey); rctx.lineTo(rW - padR, ey);
            rctx.stroke();
            rctx.setLineDash([]);

            rctx.fillStyle = '#20b26c';
            const mx = x(RP_ENTRY_BAR), my = y(TAPE[RP_ENTRY_BAR][2]) + 5;
            rctx.beginPath();
            rctx.moveTo(mx, my); rctx.lineTo(mx - 4.5, my + 7); rctx.lineTo(mx + 4.5, my + 7);
            rctx.closePath(); rctx.fill();
        }
        if (st.phase === 2) {                      // and once it is off
            rctx.fillStyle = '#f7a600';
            const mx = x(RP_LAST_BAR), my = y(TAPE[RP_LAST_BAR][1]) - 5;
            rctx.beginPath();
            rctx.moveTo(mx, my); rctx.lineTo(mx - 4.5, my - 7); rctx.lineTo(mx + 4.5, my - 7);
            rctx.closePath(); rctx.fill();
        }

        const ly = y(last);
        rctx.strokeStyle = 'rgba(236,231,221,.17)';
        rctx.setLineDash([2, 3]);
        rctx.beginPath(); rctx.moveTo(padL, ly); rctx.lineTo(rW - padR, ly); rctx.stroke();
        rctx.setLineDash([]);

        const up = last >= TAPE[0][0];
        rctx.fillStyle = up ? '#20b26c' : '#ef454a';
        rctx.fillRect(rW - padR + 3, ly - 8, padR - 6, 16);
        rctx.fillStyle = '#06050e';
        rctx.font = '600 9px "IBM Plex Mono", monospace';
        rctx.textAlign = 'center';
        rctx.fillText(last.toFixed(4), rW - padR + 3 + (padR - 6) / 2, ly);
    }

    function drawDock(st) {
        const last = TAPE[st.shown - 1][3];
        const open = TAPE[0][0];
        const held = st.shown - 1 - RP_ENTRY_BAR;
        const live = st.phase === 1 ? pips(rpEntry, last) : 0;
        const shut = pips(rpEntry, rpExit);

        const set = (id, text, tone) => {
            const el = $(id);
            if (!el) return;
            el.textContent = text;
            if (tone !== undefined) el.className = tone || '';
        };

        set('rp-price', last.toFixed(4));
        const chg = (last - open) / open * 100;
        set('rp-chg', (chg >= 0 ? '+' : '\u2212') + Math.abs(chg).toFixed(2) + '%',
            chg >= 0 ? 'up' : 'down');
        set('rp-clock', hhmm(st.shown - 1));

        const cash = st.phase === 2 ? shut * RP_PER_PIP : 0;
        const paper = live * RP_PER_PIP;
        set('rp-eq', '$' + (RP_BAL + cash + paper).toLocaleString('en-US',
            { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        set('rp-upl', st.phase === 1 ? money(paper) : '$0.00',
            st.phase === 1 ? (paper >= 0 ? 'up' : 'down') : '');

        const prog = $('rp-prog');
        if (prog) prog.style.width = (st.shown / TAPE.length * 100).toFixed(1) + '%';

        const state = $('rp-state');
        if (state) {
            state.textContent = st.phase === 0 ? 'Playing'
                              : st.phase === 1 ? 'Long 0.10' : 'Closed';
            state.className = 'rp-state' + (st.phase === 1 ? ' long'
                                          : st.phase === 2 ? ' done' : '');
        }
        const pos = $('rp-pos');
        if (pos) {
            pos.textContent = st.phase === 1 ? 'Long 0.10 @ ' + rpEntry.toFixed(4) : 'Flat';
            pos.className = 'rp-t-pos' + (st.phase === 1 ? ' long' : '');
        }

        const tabs = $('rp-tabs');
        if (tabs) [].forEach.call(tabs.children,
            (b, i) => b.classList.toggle('on', i === (st.phase === 2 ? 2 : 0)));

        const read = $('rp-read');
        if (!read) return;
        const cell = (k, v, tone) =>
            '<span><i>' + k + '</i><u' + (tone ? ' class="' + tone + '"' : '') + '>' +
            v + '</u></span>';

        if (st.phase === 0) {
            read.innerHTML = cell('Bars', st.shown + ' / ' + TAPE.length) +
                             cell('Position', 'Flat') +
                             cell('Step', '1 bar') +
                             cell('Session', 'Example');
        } else if (st.phase === 1) {
            read.innerHTML = cell('Entry', rpEntry.toFixed(4)) +
                             cell('Open P&amp;L', signed(live), live >= 0 ? 'up' : 'down') +
                             cell('Unrealised', money(paper), paper >= 0 ? 'up' : 'down') +
                             cell('Held', plural(held, 'bar'));
        } else {
            read.innerHTML = cell('Trades', '1') +
                             cell('Result', signed(shut), shut >= 0 ? 'up' : 'down') +
                             cell('Realised', money(cash), cash >= 0 ? 'up' : 'down') +
                             cell('Session', 'Example');
        }
    }

    // ============================================================ the camera

    function place(p) {
        /* p is 0..1 over the whole route. Find which span it falls in: inside
           a station's hold the camera stands still, between two it travels. */
        const t = p * marks.total;
        const sp = marks.spans;

        let i = 0;
        for (let k = 0; k < sp.length; k++) if (t >= sp[k].from) i = k;

        let a = i, b = i, leg = 0;
        if (t > sp[i].to && i < sp.length - 1) {
            a = i; b = i + 1;
            leg = clamp((t - sp[i].to) / LEG, 0, 1);
        }

        const A = ROUTE[a], B = ROUTE[b];
        const k = ease(leg);
        cam.x = lerp(A.cx * VW + VW / 2, B.cx * VW + VW / 2, k);
        cam.y = lerp(A.cy * VH + VH / 2, B.cy * VH + VH / 2, k);
        /* Zoom is 1 wherever anyone is reading, and pulls back only while
           moving — so text is never rendered at a fractional scale, and the
           journey still shows you the shape of the place. */
        cam.z = 1 - 0.26 * Math.sin(Math.PI * leg);
        legK = Math.sin(Math.PI * leg);
        at = leg > 0.5 ? b : a;

        // the tape prints across station zero's hold and nowhere else
        const s0 = sp[0];
        openP = clamp((t - s0.from) / (s0.to - s0.from), 0, 1);
    }

    function applyCamera() {
        const world = $('fd-world');
        if (world) {
            world.style.transform =
                'translate3d(' + (VW / 2 - cam.x * cam.z).toFixed(2) + 'px,' +
                (VH / 2 - cam.y * cam.z).toFixed(2) + 'px,0) scale(' + cam.z.toFixed(4) + ')';
        }
        document.querySelectorAll('.fd-station').forEach((el, i) =>
            el.classList.toggle('near', i === at));
        document.querySelectorAll('#fd-rail button').forEach((b, i) =>
            b.classList.toggle('on', i === at));
        document.querySelectorAll('.fd-links button').forEach(b =>
            b.classList.toggle('on', b.dataset.st !== undefined && +b.dataset.st === at));
        paintSky();
    }

    // ============================================================== scroll

    let queued = false;
    function read() {
        queued = false;
        if (CALM) return;
        /* While a modal pins the body the page reports scroll 0, which would
           throw the camera back to the first station behind the overlay. */
        if (document.body.classList.contains('modal-locked')) return;

        const track = $('fd-track');
        if (!track) return;
        const travel = track.offsetHeight - VH;
        if (travel <= 0) return;
        const p = clamp(scrollY / travel, 0, 1);

        place(p);

        shownBars = Math.max(FLOOR,
            Math.round(FLOOR + openP * (BREXIT.length - FLOOR)));

        readWant(at === 0 && !document.hidden);
        document.body.classList.toggle('fd-moved', p > 0.004);
        document.body.classList.toggle('fd-stuck', p > 0.02);

        applyCamera();
    }
    function onScroll() { if (!queued) { queued = true; requestAnimationFrame(read); } }

    function goTo(i) {
        const sp = marks.spans[i];
        if (!sp) return;
        const mid = (sp.from + sp.to) / 2;
        const track = $('fd-track');
        const travel = track.offsetHeight - VH;
        scrollTo({ top: (mid / marks.total) * travel, behavior: CALM ? 'auto' : 'smooth' });
    }

    function measure() {
        VW = innerWidth; VH = innerHeight;
        const track = $('fd-track');
        /* The track's height is what the whole route costs in scroll. One
           screen per unit of hold or travel keeps a leg feeling like a leg on
           any display. */
        if (track) track.style.height = (marks.total * VH + VH) + 'px';
        fitCanvas();
        fitReplay();
        read();
    }

    // ===================================================== the example report

    /* An equity curve worth looking at has a shape, not just a slope: a run
       up, a drawdown deep enough to be honest about, and a recovery. Fixed
       seed, so the page draws the same curve every time — an example that
       changed on reload would be a chart of nothing. */
    function equityPath() {
        let seed = 20160624, v = 0;
        const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - .5;
        const pts = [];
        for (let i = 0; i <= 120; i++) {
            v += (i > 52 && i < 74 ? -0.62 : 0.34) + rnd() * 1.5;
            pts.push(v);
        }
        const lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts);
        return pts.map((p, i) =>
            (i ? 'L' : 'M') + (i / 120 * 640).toFixed(1) + ' ' +
            (150 - (p - lo) / (hi - lo) * 128).toFixed(1)).join(' ');
    }

    function paintReport() {
        const svg = $('fd-curve');
        if (!svg || svg.dataset.done) return;
        svg.dataset.done = '1';
        const d = equityPath();
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

    // ============================================================== the tiers

    /* Built from the subscription modal's own cards. The modal carries the
       Stripe price ids and the amounts, so it stays the one place a price is
       stated — change it there and this follows. */
    function buildTiers() {
        const host = $('fd-tiers');
        if (!host) return;
        const cards = document.querySelectorAll('#subscription-modal-overlay .tier-card');
        if (!cards.length) return;

        host.innerHTML = Array.from(cards).map((card, i) => {
            const name = card.querySelector('.tier-name');
            const desc = card.querySelector('.tier-desc');
            const m = +card.dataset.monthAmt || 0;
            const yr = +card.dataset.yearAmt || 0;
            const feats = Array.from(card.querySelectorAll('.tier-features li')).map(li =>
                '<li' + (li.querySelector('.unavailable') ? ' class="no"' : '') + '>' +
                li.textContent.trim() + '</li>').join('');
            /* A column divided by a hairline, not a box. Three boxed cards
               side by side is the shape every SaaS page has had for ten
               years; the same information set as type, separated by a rule,
               reads as a price list in a good catalogue instead. */
            return '<article class="fd-tier' + (i === cards.length - 1 ? ' lead' : '') + '">' +
                '<span class="role">' + (name ? name.textContent.trim() : '') + '</span>' +
                '<div class="fd-price"><b class="fd-tnum" data-m="' + m + '" data-y="' +
                    (yr / 12).toFixed(2) + '">' + m + '</b><i>$ / month</i></div>' +
                '<p class="fd-billed" data-m="Billed monthly" data-y="$' + yr +
                    ' billed once a year">Billed monthly</p>' +
                '<p class="fd-tier-desc">' + (desc ? desc.textContent.trim() : '') + '</p>' +
                '<ul class="fd-list">' + feats + '</ul>' +
                '<div class="foot"><button class="fd-btn' +
                    (i === cards.length - 1 ? ' brass' : '') + '" data-plans>Choose this</button></div>' +
                '</article>';
        }).join('');

        const mB = $('fd-cyc-m'), yB = $('fd-cyc-y');
        function cycle(yearly) {
            if (mB) mB.setAttribute('aria-pressed', String(!yearly));
            if (yB) yB.setAttribute('aria-pressed', String(yearly));
            host.querySelectorAll('.fd-price b').forEach(b =>
                b.textContent = yearly ? b.dataset.y : b.dataset.m);
            host.querySelectorAll('.fd-billed').forEach(p =>
                p.textContent = yearly ? p.dataset.y : p.dataset.m);
        }
        if (mB) mB.addEventListener('click', () => cycle(false));
        if (yB) yB.addEventListener('click', () => cycle(true));
    }

    // ================================================================ wiring

    function wire() {
        document.addEventListener('click', e => {
            const go = e.target.closest('[data-service]');
            if (go) { e.preventDefault(); goService(go.dataset.service); return; }
            if (e.target.closest('[data-plans]')) {
                e.preventDefault();
                const b = $('nav-subscription-btn');
                if (b) b.click();
                return;
            }
            const st = e.target.closest('[data-st]');
            if (st) { e.preventDefault(); goTo(+st.dataset.st); }
        });

        /* Closing the submission page hands the screen back. app.js owns the
           overlay's own close; this only has to undo what opening it did. */
        const close = $('abort-console-btn');
        if (close) close.addEventListener('click',
            () => document.body.classList.remove('fd-console'));
    }

    /* Straight in. The old flow put a description panel between the click and
       the thing — read this, then press Initialize, then arrive. Everything
       that panel said is now on the station you clicked from, so the click
       goes where it says it goes.

       The gate is the same gate: not signed in means the sign-in dialog, and
       nothing opens behind it. */
    async function goService(id) {
        if (window.BTAccess) {
            let a = null;
            try { a = await BTAccess.get(); } catch (e) {}
            if (a && !a.signedIn) {
                if (window.setAuthMode) window.setAuthMode('signin');
                const am = $('auth-modal-overlay');
                if (am) am.classList.add('active');
                return;
            }
        }
        if (id === 'replay') { location.href = 'replay.html'; return; }
        /* The reports library was only reachable from the account badge and
           from inside the submission page, which is the one place you are
           not when you go looking for a finished report. It stands beside
           Submit a system now, behind the same gate. */
        if (id === 'reports') {
            if (typeof window.openReportsLibrary === 'function') window.openReportsLibrary();
            return;
        }
        if (id === 'backtest') {
            if (typeof window.fillConsoleRail === 'function') window.fillConsoleRail();
            const gas = $('gas-giant-atmosphere');
            if (gas) gas.classList.add('active');
            document.body.classList.add('fd-console');
        }
    }

    /* ------------------------------------------------ reading it back

       The single thing that stops somebody submitting a system is not knowing
       whether they have said enough. So the page reads what they have written
       and marks off the seven things a rule set needs before anyone can code
       it. It is a completeness check and the page says so — it is not
       claiming to have understood the strategy, and it never blocks the
       submit button, because a trader who leaves something out on purpose is
       still allowed to send it. */
    const READS = [
        ['entry',     /\b(buy|long|sell|short|enter|entry|entries|cross(es|ing)?\s+above|cross(es|ing)?\s+below|breakout)\b/i],
        ['exit',      /\b(exit|close|take[- ]?profit|target|tp|profit\s+at|r:?r|reward)\b/i],
        ['stop',      /\b(stop|sl|stop[- ]?loss|invalidat\w*|below\s+the\s+\w+\s+low|above\s+the\s+\w+\s+high)\b/i],
        ['risk',      /\b(risk|\d+(\.\d+)?\s*%|percent|lot|position\s+size|sizing|per\s+trade)\b/i],
        ['market',    /\b([A-Z]{6}|eur\/?usd|gbp\/?usd|usd\/?jpy|xau|gold|silver|btc|eth|nas100|us30|spx|forex|indices|crypto|stocks?)\b/i],
        ['timeframe', /\b(\d+\s?(m|min|mins|minute|minutes|h|hr|hour|hours|d|day|daily|w|week|weekly)|m1|m5|m15|m30|h1|h4|d1|intraday|swing)\b/i],
        ['period',    /\b(since\s+(19|20)\d\d|(19|20)\d\d\s*(to|-|–)\s*(19|20)\d\d|last\s+\w+\s+years?|\d+\s+years?|as\s+far\s+back|all\s+(the\s+)?history|whole\s+history)\b/i]
    ];

    const NOTES = [
        'Start writing and this fills in.',
        'Keep going — the more of these are lit, the less the desk has to assume.',
        'Enough to code, and the desk will ask about anything still missing.',
        'That is a complete rule set. Send it whenever you are ready.'
    ];

    function readBack() {
        const box = $('sc-checks');
        const rules = $('system-rules');
        if (!box || !rules) return;

        const text = (rules.value || '') + ' ' + (($('system-name') || {}).value || '');
        let got = 0;
        READS.forEach(([key, re]) => {
            const hit = re.test(text);
            if (hit) got++;
            const li = box.querySelector('[data-k="' + key + '"]');
            if (li) li.classList.toggle('got', hit);
        });

        const score = $('sc-score'), fill = $('sc-bar-fill'), note = $('sc-note');
        if (score) score.textContent = got + ' / ' + READS.length;
        if (fill) fill.style.width = (got / READS.length * 100).toFixed(1) + '%';
        if (note) {
            note.textContent = got === 0 ? NOTES[0]
                             : got < 4   ? NOTES[1]
                             : got < 7   ? NOTES[2]
                             : NOTES[3];
        }
    }

    function wireSubmitPage() {
        const rules = $('system-rules'), name = $('system-name');
        if (!rules) return;
        rules.addEventListener('input', readBack);
        if (name) name.addEventListener('input', readBack);
        readBack();
    }

    // ================================================================= start

    function start() {
        document.documentElement.classList.add('fd-on');
        buildTiers();
        wire();
        wireSubmitPage();

        startRead();

        if (CALM) {
            shownBars = BREXIT.length;
            paintReport();
            document.querySelectorAll('.fd-station').forEach(el => el.classList.add('near'));
            return;
        }

        addEventListener('scroll', onScroll, { passive: true });
        addEventListener('resize', measure, { passive: true });
        measure();

        /* The report draws itself the first time its station is the one you
           are standing at, not on a timer and not on load. */
        const watch = setInterval(() => {
            if (at === 1) { paintReport(); clearInterval(watch); }
        }, 260);
    }

    if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start);
    else start();
})();
