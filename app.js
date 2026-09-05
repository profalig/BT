// ==========================================
// PLANET DATA & ORBIT ENGINE CONFIGURATION
// ==========================================
const planetData = {
    backtest: {
        tag: "ENGINE // SEC-01", title: "Backtest Machine", color: "#ffd9ac",
        lead: "Submit a system. Get the truth about its edge.",
        body: "Your architecture goes into our core for a highly accurate, multi-threaded analysis, and comes back as a comprehensive intelligence report.",
        points: [
            { icon: "fa-layer-group", title: "Multi-regime stress testing",
              text: "Measured across bull, bear and ranging markets — not one lucky stretch." },
            { icon: "fa-list-check", title: "Trade-by-trade logs",
              text: "Every entry and exit recorded, with exact execution times." },
            { icon: "fa-chart-line", title: "Deep statistical checks",
              text: "Win/loss rates, maximum drawdown and reliability, computed on real tick data." }
        ],
        stats: [{ label: "TICK ACCURACY", val: "99.9%" }, { label: "METRICS", val: "30+ Stats" }, { label: "STRESS TEST", val: "Regime Based" }, { label: "REPORTS", val: "Deep Data" }]
    },
    replay: {
        tag: "TERMINAL // SEC-06", title: "BarTest Replay", color: "#ffc98a",
        lead: "Trade the past, one candle at a time.",
        action: "OPEN THE TERMINAL",
        body: "A full charting terminal that hides the future. Choose any date, step the market forward bar by bar and trade it with a real order ticket — then read the result the same way the Backtest Machine reads a submitted system.",
        points: [
            { icon: "fa-backward-step", title: "Replay any market",
              text: "The chart is cut at your date and the bars after it are withheld, not merely hidden." },
            { icon: "fa-receipt", title: "A real order ticket",
              text: "Market, limit and stop orders, leverage, fees on both sides and automatic position sizing from your risk." },
            { icon: "fa-pen-ruler", title: "Forty drawing tools and nine studies",
              text: "Fibonacci, channels, patterns and positions, plus a place to run your own system code." }
        ],
        stats: [{ label: "MARKETS", val: "Crypto / FX" }, { label: "HISTORY", val: "Since 1999" }, { label: "FILLS", val: "1-Minute" }, { label: "EXPORT", val: "PDF / CSV" }]
    },
    databank: {
        tag: "FACTORY // SEC-02", title: "System Building Factory", color: "#e4e6ea",
        lead: "Where quantitative trading systems are built and released.",
        body: "Every week our engineering team researches, refines and releases new algorithmic models across crypto and forex markets.",
        points: [
            { icon: "fa-flask", title: "Researched weekly",
              text: "New models released on a continuous research cycle." },
            { icon: "fa-shield-halved", title: "Verified surface profitability",
              text: "High-potential blueprints, not finished systems." },
            { icon: "fa-arrow-right-arrow-left", title: "Built to be verified",
              text: "Run any model through the Backtest Machine before live deployment." }
        ],
        stats: [{ label: "STATUS", val: "ONLINE" }, { label: "UPDATES", val: "Weekly" }, { label: "COVERAGE", val: "Crypto / FX" }, { label: "VALIDATION", val: "Required" }]
    },
    about: {
        tag: "IDENTITY // SEC-03", title: "About BarTest", color: "#d2d5db",
        lead: "Our numbers do not come out of thin air.",
        body: "We are professional quantitative backtesters delivering institutional-grade market data across multi-year historical cycles.",
        points: [
            { icon: "fa-receipt", title: "Itemised execution records",
              text: "Trade-by-trade logs for every buy and sell, wins and losses alike." },
            { icon: "fa-clock-rotate-left", title: "Deep historical coverage",
              text: "Lower-timeframe history that is near impossible to pull by hand." },
            { icon: "fa-seedling", title: "Compounding proven, not claimed",
              text: "Exactly how a balance at 2% risk scales over one, two or four years." }
        ],
        stats: [{ label: "OUTPUT", val: "Detailed Report" }, { label: "RECORDS", val: "Trade Log" }, { label: "DATA", val: "Historical" }, { label: "METRICS", val: "Compounding" }]
    },
    contact: {
        tag: "COMMS // SEC-04", title: "Contact Us", color: "#f0e2cf",
        lead: "Direct comm-link to the engineering desk.",
        body: "Reach out for quantitative system discussions, data analytics, or professional networking.",
        links: [
            { icon: "fa-envelope", label: "Email", val: "backtest.factory@gmail.com", href: "mailto:backtest.factory@gmail.com" },
            { icon: "fa-paper-plane", label: "Telegram", val: "@Dr_AliSadeghi", href: "https://t.me/Dr_AliSadeghi" },
            { icon: "fa-instagram", label: "Instagram", val: "backtest.factory", href: "https://instagram.com/backtest.factory", brand: true }
        ],
        stats: [{ label: "COMM LINK", val: "Encrypted" }, { label: "RESPONSE", val: "Active" }, { label: "LOCATION", val: "Italy" }, { label: "NETWORK", val: "Open" }]
    },
    campus: {
        tag: "ACADEMY // SEC-05", title: "Trading Campus", color: "#ffe9c4",
        lead: "The training ground for quantitative analysis.",
        body: "Built to teach deep data analysis, AI applications, statistical study design and high-level data fetching.",
        points: [
            { icon: "fa-database", title: "Data and AI foundations",
              text: "How to fetch, clean and interrogate market data at scale." },
            { icon: "fa-square-root-variable", title: "Statistical study design",
              text: "Build tests that can actually falsify an edge." },
            { icon: "fa-code", title: "Production-grade code",
              text: "For those becoming professional backtesters and system engineers." }
        ],
        stats: [{ label: "CURRICULUM", val: "Data & AI" }, { label: "SKILLS", val: "Stats / Python" }, { label: "TARGET", val: "Pro Quants" }, { label: "STATUS", val: "Enrolling" }]
    }
};

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function clamp01(v) { return Math.min(Math.max(v, 0), 1); }

// INTRO SCENE SCROLL ENGINE
// Scroll scrubs the growth footage: the camera pushes through a luxury room
// and a seedling grows branch by branch. Each branch that forms brings one
// service card forward, so the tree itself is the navigation.
(function initIntroScene() {
    const introScene   = document.getElementById('intro-scene');
    const introSticky  = document.getElementById('intro-sticky');
    const roomScene    = document.getElementById('room-scene');
    const video        = document.getElementById('room-video');    // full quality
    const lqVideo      = document.getElementById('room-video-lq'); // instant proxy
    const glow         = document.getElementById('grow-glow');
    const scrollHint   = document.getElementById('scroll-hint');
    const branches     = [...document.querySelectorAll('.branch')];
    if (!introScene || !video || !roomScene) return;

    let targetTime = 0;
    let shownTime  = -1;
    let duration   = 0;
    let progress   = 0;
    let primed     = false;
    // Whichever clip is currently on screen. Starts as the proxy so the scroll
    // is live almost immediately, then becomes the full-quality clip.
    let active     = lqVideo || video;

    // Never overlap a seek: on iOS Safari, writing currentTime again before
    // the previous seek's `seeked` event has fired can wedge the media
    // pipeline outright — the element stops responding to ANY further seek
    // and the hero freezes for the rest of the session. That is exactly what
    // "the phone does nothing" was, from a change that dropped this guard
    // after a benchmark run in this Chromium-based preview pane showed a
    // higher update rate without it. Chrome's decoder coalesces overlapping
    // seeks; Safari's does not — and that difference cannot be seen from
    // inside Chrome. This guard is permanent. See requestSeek()/onSeeked()
    // by the scrub loop for how it stays fast anyway.
    let seekPending  = false;
    let seekIssuedAt = 0;

    // Portrait phones get the portrait master, everything else the landscape
    // one. Re-evaluated rather than decided once at parse time: on first run
    // the viewport can still be reporting pre-layout dimensions, which picked
    // the phone file on a wide desktop. Only swaps when the mode genuinely
    // changes, so a plain resize never re-downloads the video.
    let sourceMode = null;
    let blobUrl    = null;
    let loadToken  = 0;
    function pickSource() {
        const portrait = window.matchMedia('(orientation: portrait)').matches
            || document.documentElement.clientWidth <= 900;
        const mode = portrait ? 'phone' : 'desktop';
        if (mode === sourceMode) return;
        sourceMode = mode;
        duration = 0; shownTime = -1; primed = false; upgraded = false;
        active = lqVideo;
        seekPending = false;
        video.classList.remove('shown');
        lqVideo.classList.remove('faded');
        lqVideo.style.display = '';   // may have been released on a prior pick

        lqVideo.poster = portrait ? lqVideo.dataset.posterPhone
                                  : lqVideo.dataset.posterDesktop;
        lqVideo.src    = portrait ? lqVideo.dataset.srcPhone
                                  : lqVideo.dataset.srcDesktop;
        lqVideo.load();

        fetchClip(portrait ? video.dataset.srcPhone : video.dataset.srcDesktop,
                  ++loadToken);
    }

    // TWO-TIER LOAD
    // Waiting for the full clip before anything moves is what made the opening
    // feel frozen. A ~1.4MB proxy streams in under half a second and is what
    // the first scrolls actually scrub, while the full-quality clip downloads
    // in the background. Fetching that one to a Blob rather than streaming it
    // matters: scrubbing seeks constantly, and a seek into a byte range that
    // has not arrived yet paints nothing, so the tree would stop growing while
    // the scroll carried on. From memory, every seek is local and cannot stall.
    // iOS Safari accounts a blob: URL against the tab's memory, and holding a
    // ~14MB clip there — plus the transient copy made while assembling it, plus
    // two live 1080x1920 decoders — is enough to get the tab killed with
    // "A problem repeatedly occurred", especially while back-scrolling, where
    // every seek has to decode forward from the previous keyframe. There the
    // clip is streamed from its URL instead and left in the media cache, which
    // is not JS heap. Everywhere else the Blob is kept: it is what guarantees
    // a seek can never stall on the network.
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    function fetchClip(url, token) {
        if (isIOS || !window.fetch || typeof URL.createObjectURL !== 'function') {
            directSrc(url); return;
        }
        fetch(url).then(res => {
            if (!res.ok || !res.blob) throw 0;
            return res.blob();
        }).then(blob => {
            if (!blob || token !== loadToken) return;
            if (blobUrl) URL.revokeObjectURL(blobUrl);
            blobUrl = URL.createObjectURL(blob);
            video.src = blobUrl;
            video.load();
        }).catch(() => {});
    }

    // The streaming path, used on iOS and anywhere fetch/Blob is unavailable.
    //
    // This function went missing in an earlier refactor and nothing caught it
    // for days: Chrome never reaches the branch that calls it (it has fetch,
    // and isIOS is false), so the ReferenceError could only ever fire on a
    // real iPhone. There it threw inside pickSource, which at the time ran
    // BEFORE the scroll listener was attached — so one missing function took
    // out the entire interface, and every environment available for testing
    // reported the page as healthy. Safari finally named it outright:
    // "Can't find variable: directSrc".
    //
    // The element is authored preload="none" so the Blob path owns its own
    // download; on this path it has to be told to buffer, or canplaythrough
    // never fires and the upgrade to full quality never happens.
    function directSrc(url) {
        video.preload = 'auto';
        video.src = url;
        video.load();
    }

    // Two live <video> decoders is not a free safety net — it is by far the
    // most expensive thing on this page. Measured on the deployed build, the
    // full clip seeks in 11.7ms once the proxy is released and 133.1ms while
    // it is still loaded: 11x. A screen recording from a real machine showed
    // ~16 hero updates/sec with ~100ms stalls, which matches the slow figure
    // almost exactly — that contention WAS the scroll lag.
    //
    // The proxy was previously kept alive forever because an earlier handoff
    // revealed the full clip on a timer and could hand over to an element
    // that had never painted, leaving a blank hero. That is no longer how it
    // works: show() runs only after requestVideoFrameCallback confirms a real
    // presented frame, so by then the proxy has nothing left to protect
    // against and its decoder is pure cost.
    function releaseProxy() {
        setTimeout(() => {
            // Bail if anything looks off — a live proxy beats a blank hero.
            if (active !== video || video.readyState < 2) return;
            try {
                lqVideo.pause();
                lqVideo.removeAttribute('src');
                lqVideo.load();
                lqVideo.style.display = 'none';
            } catch (e) {}
        }, 400);
    }

    // Hand over only once the full clip can render the exact frame already on
    // screen, so the swap is a change of sharpness and nothing else.
    let upgraded = false;
    function upgrade() {
        if (upgraded || !duration || video.readyState < 3) return;
        upgraded = true;

        const show = () => {
            video.classList.add('shown');
            lqVideo.classList.add('faded');
            active = video;
            seekPending = false; // any pending flag belonged to the proxy's seek
            releaseProxy();
        };

        // Swap only once the full clip has genuinely PRESENTED a frame.
        // A <video> that has never painted renders as nothing, so revealing
        // it on a timer could hand the visitor an empty hero — and the proxy
        // is deliberately left loaded underneath, never torn down, so if this
        // never fires the page simply keeps running on the proxy instead of
        // going blank. That failure mode is what "the phone does nothing" was.
        if (typeof video.requestVideoFrameCallback === 'function') {
            video.requestVideoFrameCallback(show);
        } else {
            video.addEventListener('seeked', function once() {
                video.removeEventListener('seeked', once);
                show();
            });
        }

        // Mobile will not paint a video that has never played.
        const pr = video.play();
        if (pr && pr.then) pr.then(() => video.pause()).catch(() => {});
        video.currentTime = Math.max(0, Math.min(shownTime < 0 ? 0 : shownTime,
                                                 duration - 0.03));
    }
    video.addEventListener('canplaythrough', upgrade);
    video.addEventListener('loadeddata', upgrade);

    // STAGED SCRUB MAP: scroll progress -> time in the clip.
    // Read off the footage: the room push-in runs to ~1.30s, the tree then
    // grows continuously (lit pixels climb 2 -> 107) until ~4.30s, then
    // settles. Growth is split evenly so each service gets its own stretch
    // of scroll rather than all five arriving at once.
    const SCRUB_MAP = [
        [0.000, 0.00],   // held on the room — SCROLL TO BEGIN
        [0.060, 0.35],
        [0.170, 1.30],   // camera has pushed in; the seedling is about to grow
        [0.290, 1.95],   // branch 1
        [0.390, 2.45],   // branch 2
        [0.490, 2.90],   // branch 3
        [0.590, 3.35],   // branch 4
        [0.690, 3.80],   // branch 5
        [0.790, 4.35],   // branch 6
        [0.900, 5.10]    // full tree, settled
    ];

    // Scroll position at which each branch's card lights, and the range the
    // room glow ramps over. Deliberately scroll-driven, not video-driven: an
    // earlier version keyed these to the video's own eased playback time so
    // they would land in exact sync with the growth, but that coupled the
    // whole interface to the decoder — if the clip stalled or hadn't loaded,
    // no cards and no glow appeared AT ALL and the page looked dead. Scroll
    // position is always live, so this can never go blank. The cards lead
    // the picture by the easing interval (a couple hundred ms), which reads
    // as nothing next to a hero that might not render at all.
    const BRANCH_AT = [0.305, 0.405, 0.505, 0.605, 0.705, 0.805];
    const GLOW_FROM = 0.17;
    const GLOW_TO   = 0.72;

    function scrubTimeFor(p) {
        if (p <= SCRUB_MAP[0][0]) return SCRUB_MAP[0][1];
        for (let i = 1; i < SCRUB_MAP.length; i++) {
            const [p0, t0] = SCRUB_MAP[i - 1];
            const [p1, t1] = SCRUB_MAP[i];
            if (p <= p1) return t0 + (t1 - t0) * ((p - p0) / (p1 - p0));
        }
        return SCRUB_MAP[SCRUB_MAP.length - 1][1];
    }


    // Exposed for the ?debug=1 readout: when progress will not move on a real
    // device, these are the numbers that say why.
    let dbgScrollEvents = 0, dbgTotal = 0, dbgRectTop = 0, dbgSceneH = 0;
    let dbgUpd = 0, dbgRate = 0, dbgWindow = 0, dbgLastT = -1;
    let dbgSeekMs = 0, dbgSeekMax = 0, dbgRaf = 0, dbgRafRate = 0;
    function readScroll() {
        const rect  = introScene.getBoundingClientRect();
        const total = introScene.offsetHeight - window.innerHeight;
        const done  = Math.min(Math.max(-rect.top, 0), total);
        progress = total > 0 ? done / total : 0;
        dbgTotal = total; dbgRectTop = Math.round(rect.top);
        dbgSceneH = introScene.offsetHeight;
        if (duration) targetTime = Math.min(scrubTimeFor(progress), duration - 0.03);
    }

    // Scroll fires far more often than any of these values actually change,
    // and every write to an inline style costs a recalc whether or not the
    // value differs. Each one is therefore latched and only written on a real
    // change; classList.toggle already no-ops when the state matches.
    let lastGlow = -1;
    let lastPE   = null;
    function updateIntro() {
        if (document.body.classList.contains('modal-locked')) return;
        readScroll();

        if (scrollHint) scrollHint.classList.toggle('hidden', progress > 0.04);
        const pe = progress >= 1 ? 'none' : 'auto';
        if (pe !== lastPE) { introScene.style.pointerEvents = pe; lastPE = pe; }

        paintForFrame();
    }

    // Runs from updateIntro() on every scroll event — not from the scrub
    // loop, and not from anything the video does. See the comment on
    // BRANCH_AT above for why.
    function paintForFrame() {
        if (glow) {
            // Quantised to 100 steps: past that the change is invisible but
            // still repaints a full-viewport gradient.
            const g = Math.round(clamp01((progress - GLOW_FROM) / (GLOW_TO - GLOW_FROM)) * 90) / 100;
            if (g !== lastGlow) { glow.style.opacity = g; lastGlow = g; }
        }

        branches.forEach((el, i) => {
            el.classList.toggle('lit', progress >= BRANCH_AT[i]);
        });

        // Warm room HUD at the start, cooler once the tree dominates.
        document.body.classList.toggle('in-space', progress >= GLOW_TO);
    }

    // The hint no longer gates anything: the proxy makes the scene scrubbable
    // almost at once, so there is nothing to wait for and nothing to lock.
    function markReady() {
        if (!scrollHint) return;
        scrollHint.textContent = 'SCROLL TO BEGIN';
        scrollHint.classList.remove('preparing');
    }
    lqVideo.addEventListener('loadeddata', markReady);
    markReady();

    // Seeking runs from a rAF loop that eases toward the scroll target rather
    // than being set straight from the scroll handler: scroll events fire far
    // faster than a video can seek, and hammering currentTime makes the
    // decoder thrash.
    // A mouse wheel arrives in ~100px jumps, so mapping scroll straight to a
    // frame makes the growth lurch. Easing toward the target instead walks the
    // clip through the frames in between, which reads as motion rather than a
    // jump — this is most of why the desktop felt less smooth than touch
    // scrolling, which is already continuous. The rate is expressed per second
    // so it behaves the same on a 60Hz and a 144Hz display.
    const EASE_SECONDS = 0.22;
    let lastFrame = 0;

    // Fires the moment the active element's in-flight seek resolves, rather
    // than waiting for the next rAF tick to notice — that shaves up to one
    // frame (~16ms) of dead time between one seek finishing and the next
    // starting, without ever writing currentTime while a seek is still
    // pending. That is the entire performance case for this over a flat
    // "seek every frame": get the same throughput the unguarded version
    // measured in Chrome, without the guarantee-breaking part.
    function requestSeek() {
        if (!duration || !active) return;
        if (seekPending) {
            // Self-heal: if a `seeked` event is ever swallowed (observed in
            // some WebKit versions on a source-change race), do not stay
            // stuck waiting for it for the rest of the session.
            if (performance.now() - seekIssuedAt < 1200) return;
            seekPending = false;
        }
        const want = Math.max(0, Math.min(shownTime, duration - 0.03));
        if (Math.abs(want - active.currentTime) <= 0.004) return;
        seekPending  = true;
        seekIssuedAt = performance.now();
        active.currentTime = want;
    }
    function onSeeked(e) {
        if (e.target !== active) return;
        // Time each seek. This is the number that separates "the decoder is
        // slow" from "something else is throttling the loop" — updates/sec
        // alone conflates the two.
        const ms = performance.now() - seekIssuedAt;
        dbgSeekMs = dbgSeekMs ? (dbgSeekMs * 0.8 + ms * 0.2) : ms;
        if (ms > dbgSeekMax) dbgSeekMax = ms;
        seekPending = false;
        requestSeek(); // shownTime may already have moved on; chain immediately
    }
    video.addEventListener('seeked', onSeeked);
    lqVideo.addEventListener('seeked', onSeeked);

    function scrubLoop(now) {
        const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0.016;
        lastFrame = now;
        // While a modal pins the body with position:fixed the page reports
        // scrollY 0, which would drag the hero back to its first frame behind
        // the overlay and then animate back on close. Park instead.
        if (document.body.classList.contains('modal-locked')) {
            requestAnimationFrame(scrubLoop);
            return;
        }
        // Live scrub rate, for the ?debug=1 readout: how many times per second
        // the picture actually changes while scrolling. This is the number
        // that decides whether it feels smooth, not seek latency in isolation.
        if (active && active.currentTime !== dbgLastT) {
            dbgLastT = active.currentTime; dbgUpd++;
        }
        dbgRaf++;
        if (now - dbgWindow >= 1000) { dbgRate = dbgUpd; dbgUpd = 0;
            dbgRafRate = dbgRaf; dbgRaf = 0; dbgSeekMax = 0; dbgWindow = now; }

        if (duration && active) {
            const diff = targetTime - shownTime;
            if (Math.abs(diff) > 0.004) {
                // Ease EVERY frame, on wall-clock time. This is cheap (no DOM,
                // no video) and safe to run unconditionally — it is only the
                // actual seek below that must never overlap itself.
                shownTime += diff * (1 - Math.pow(0.1, dt / EASE_SECONDS));
            }
            requestSeek();
        }
        requestAnimationFrame(scrubLoop);
    }

    // Mobile browsers will not render a frame from a <video> that has never
    // begun playback, and they ignore preload="auto" to save data. One muted
    // inline play/pause forces the decoder to produce frames; after that,
    // seeking paints normally.
    // Priming has to be RETRIED, not fired once. play() rejects outright if
    // the element has no data yet, and iOS additionally refuses muted
    // autoplay in Low Power Mode. With {once:true} those listeners were spent
    // on attempts that could not succeed, leaving the element unprimed — so
    // it never painted a frame and the hero sat on its poster while the
    // scroll appeared to do nothing. Stay attached until one attempt lands.
    const PRIME_EVENTS = ['pointerdown', 'touchstart', 'touchend', 'click', 'scroll'];
    function detachPrime() {
        PRIME_EVENTS.forEach(ev => window.removeEventListener(ev, prime));
    }
    function primeDone() {
        primed = true;
        lqVideo.pause();
        lqVideo.currentTime = Math.max(0, Math.min(shownTime < 0 ? 0 : shownTime,
                                                   (duration || 1) - 0.03));
        detachPrime();
        nudgeFullLoad();
    }

    // iOS will not preload a <video> without a user gesture no matter what
    // the preload attribute says. On a real iPhone the full clip therefore
    // sat at readyState 0 indefinitely — the debug readout showed
    // "full rs:0" while the proxy, primed by the first touch, was at rs:4 —
    // so the upgrade never fired and the phone stayed on the soft proxy.
    // Now that priming proves a gesture has happened, give the full clip the
    // same nudge.
    function nudgeFullLoad() {
        if (!isIOS || !video.getAttribute('src') || video.readyState >= 1) return;
        try {
            video.load();
            const pr = video.play();
            if (pr && pr.then) pr.then(() => video.pause()).catch(() => {});
        } catch (e) {}
    }
    function prime() {
        if (primed) return;
        const pr = lqVideo.play();
        // On rejection deliberately do nothing: the listeners stay attached
        // and the next gesture tries again.
        if (pr && pr.then) pr.then(primeDone).catch(() => {});
        else primeDone();
    }
    PRIME_EVENTS.forEach(ev =>
        window.addEventListener(ev, prime, { passive: true }));

    // Duration comes from the proxy, which arrives first; both cuts are the
    // same length. Must also run immediately when the file is cached, since
    // loadedmetadata and canplay have already fired by then and waiting on
    // them would leave duration at 0 forever.
    function initVideo() {
        if (duration) return;
        duration = lqVideo.duration || 0;
        if (!duration) return;
        if (shownTime < 0) shownTime = 0;
        readScroll();
        updateIntro();
        upgrade();
    }
    lqVideo.addEventListener('loadedmetadata', initVideo);
    lqVideo.addEventListener('canplay', () => { initVideo(); prime(); });
    lqVideo.addEventListener('durationchange', initVideo);
    if (lqVideo.readyState >= 1) { initVideo(); prime(); }

    // Clicking a branch opens that service, reusing the existing panels.
    branches.forEach(el => {
        el.addEventListener('click', () => {
            if (!el.classList.contains('lit')) return;
            openService(el.dataset.id);
        });
    });

    // Bump this on every change that ships. It is the only way to tell, from
    // a phone, whether you are looking at the current build or a cached one —
    // which has repeatedly been the difference between "the fix did not work"
    // and "the fix never arrived".
    const BUILD = 'build-16  2026-09-03  fastdecode';
    try { console.log('BarTest ' + BUILD); } catch (e) {}

    // Append ?debug=1 to the URL for an on-screen readout. A phone cannot be
    // inspected from here, so this exists to be screenshotted and sent back
    // rather than guessed at.
    if (/[?&]debug=1/.test(location.search)) {
        const box = document.createElement('div');
        box.style.cssText = 'position:fixed;left:6px;top:6px;z-index:99999;' +
            'font:11px/1.4 monospace;color:#6f6;background:rgba(0,0,0,.85);' +
            'padding:8px 10px;border:1px solid #6f6;border-radius:4px;' +
            'white-space:pre;pointer-events:none';
        document.body.appendChild(box);
        const mediaErr = m => m ? ('ERR' + m.code) : 'ok';
        setInterval(() => {
            box.textContent =
                BUILD + '\n' +
                'iOS:' + isIOS + '  primed:' + primed + '  src:' + sourceMode + '\n' +
                'scrollY:' + Math.round(window.scrollY) +
                    '  vh:' + window.innerHeight + '  evts:' + dbgScrollEvents + '\n' +
                'sceneH:' + dbgSceneH + '  total:' + Math.round(dbgTotal) +
                    '  top:' + dbgRectTop + '\n' +
                'dur:' + duration.toFixed(2) + '  prog:' + progress.toFixed(3) + '\n' +
                'UPDATES/SEC:' + dbgRate + '   rAF:' + dbgRafRate + '\n' +
                'seekMs:' + dbgSeekMs.toFixed(0) + '   worst:' + dbgSeekMax.toFixed(0) + '\n' +
                'target:' + targetTime.toFixed(2) + '  shown:' + shownTime.toFixed(2) + '\n' +
                'active:' + (active === video ? 'FULL' : 'proxy') +
                    '  seekPending:' + seekPending + '\n' +
                'proxy rs:' + lqVideo.readyState + ' t:' + lqVideo.currentTime.toFixed(2) +
                    ' ' + mediaErr(lqVideo.error) + '\n' +
                'full  rs:' + video.readyState + ' t:' + video.currentTime.toFixed(2) +
                    ' ' + mediaErr(video.error) + '\n' +
                'swapped:' + video.classList.contains('shown') +
                    '  cards:' + document.querySelectorAll('.branch.lit').length + '\n' +
                'body:[' + document.body.className + ']\n' +
                'initErr:[' + initError + ']';
        }, 200);
    }

    // ORDER MATTERS HERE, and getting it wrong is what broke the phone.
    //
    // These listeners and the scrub loop used to be attached AFTER
    // pickSource(). pickSource touches media APIs, and on a real iPhone
    // something in there threw: the debug readout showed scrollY climbing to
    // 1750 with evts:0 — the page scrolling while the scroll listener had
    // never been attached at all, because the throw happened first. Every
    // other symptom followed from that one fact: progress frozen at 0.000,
    // the scrub loop never started, the full clip never requested.
    //
    // Wiring input up first means a failure anywhere in media setup can
    // still only cost the video, never the whole interface.
    window.addEventListener('scroll', () => { dbgScrollEvents++; updateIntro(); },
                            { passive: true });
    window.addEventListener('resize', () => { safePickSource(); updateIntro(); });
    window.addEventListener('orientationchange', () => setTimeout(safePickSource, 150));
    requestAnimationFrame(scrubLoop);

    // Any failure in here is recorded and shown in the ?debug=1 readout
    // rather than taking the page down with it.
    let initError = '';
    function safePickSource() {
        try { pickSource(); }
        catch (e) { initError = (e && e.message) ? e.message : String(e); }
    }
    safePickSource();
    updateIntro();
})();

// ==========================================
// PROCEDURAL STARFIELD GENERATOR
// Paints two tileable star layers (dim/far + bright/glowing near) onto
// canvases at runtime and drops them in as CSS background-images, so the
// deep-space backdrop needs no external image assets.
// ==========================================
(function initStarfield() {
    function generateStarLayer(size, count, opts) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        for (let i = 0; i < count; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = opts.minR + Math.random() * (opts.maxR - opts.minR);
            const a = opts.minA + Math.random() * (opts.maxA - opts.minA);
            const roll = Math.random();
            const color = roll < 0.72 ? '255,255,255' : (roll < 0.9 ? '150,215,255' : '255,224,168');

            if (opts.glow) {
                const grad = ctx.createRadialGradient(x, y, 0, x, y, r * opts.glowMult);
                grad.addColorStop(0, `rgba(${color},${a * 0.5})`);
                grad.addColorStop(1, `rgba(${color},0)`);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(x, y, r * opts.glowMult, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.fillStyle = `rgba(${color},${Math.min(1, a + 0.25)})`;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        return canvas.toDataURL('image/png');
    }

    const far = document.querySelector('.starfield-far');
    const near = document.querySelector('.starfield-near');

    if (far) {
        far.style.backgroundImage = `url(${generateStarLayer(600, 110, { minR: 0.35, maxR: 1.0, minA: 0.25, maxA: 0.6, glow: false })})`;
    }
    if (near) {
        near.style.backgroundImage = `url(${generateStarLayer(820, 46, { minR: 0.8, maxR: 1.9, minA: 0.55, maxA: 1, glow: true, glowMult: 4.5 })})`;
    }
})();

// The service panel is shared by every entry point.
const moduleDetails = document.querySelector('.module-details');
const actionBtn = document.getElementById('module-action-btn');
const returnBtn = document.getElementById('return-btn');

// ==========================================
// OPEN A SERVICE
// Shared entry point: a branch click (and anything else) routes here, which
// fills the existing detail panel from planetData and shows it.
// ==========================================
let activeServiceId = null;

function openService(id) {
    const data = planetData[id];
    if (!data) return;
    activeServiceId = id;
    document.body.classList.add('warping');

    const esc = t => String(t).replace(/[&<>"]/g, c =>
        ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

    document.getElementById('module-tag').innerText = data.tag;
    document.getElementById('module-tag').style.color = data.color;
    document.getElementById('module-title').innerText = data.title;
    document.getElementById('module-title').style.color = data.color;
    document.getElementById('module-rule').style.background = data.color;
    document.getElementById('module-lead').innerText = data.lead || '';
    document.getElementById('module-lead').style.color = data.color;
    document.getElementById('module-desc').innerText = data.body || '';

    moduleDetails.style.borderLeftColor = data.color;
    actionBtn.style.borderColor = data.color;
    actionBtn.style.color = data.color;

    // Capability rows, or contact links where the row IS the action.
    const rows = data.links
        ? data.links.map(l => `
            <li class="module-point is-link">
              <a href="${esc(l.href)}"${/^https?:/.test(l.href) ? ' target="_blank" rel="noopener"' : ''}>
                <i class="${l.brand ? 'fa-brands' : 'fa-solid'} ${esc(l.icon)}" style="color:${esc(data.color)}"></i>
                <span class="mp-body">
                  <span class="mp-title">${esc(l.label)}</span>
                  <span class="mp-text">${esc(l.val)}</span>
                </span>
                <i class="fa-solid fa-arrow-up-right-from-square mp-go"></i>
              </a>
            </li>`).join('')
        : (data.points || []).map(pt => `
            <li class="module-point">
              <i class="fa-solid ${esc(pt.icon)}" style="color:${esc(data.color)}"></i>
              <span class="mp-body">
                <span class="mp-title">${esc(pt.title)}</span>
                <span class="mp-text">${esc(pt.text)}</span>
              </span>
            </li>`).join('');
    document.getElementById('module-points').innerHTML = rows;

    document.getElementById('stats-grid').innerHTML = data.stats.map(st => `
        <div class="stat-card">
            <span class="stat-title">${esc(st.label)}</span>
            <span class="stat-value" style="color: ${esc(data.color)}">${esc(st.val)}</span>
        </div>
    `).join('');

    // Number the children so they can fade in one after another rather than
    // the whole slab arriving at once — that stagger is most of what makes
    // the panel feel considered instead of dumped on screen.
    let i = 0;
    moduleDetails.querySelectorAll(
        '.module-tag, h2, .module-rule, .module-lead, #module-desc, .module-point, .stat-card, .action-btn, #return-btn'
    ).forEach(el => el.style.setProperty('--i', i++));

    // About and Contact are read-only — nothing to initialise.
    actionBtn.style.display = (id === 'contact' || id === 'about') ? 'none' : 'flex';
    // "INITIALIZE MODULE" is right for a machine you feed a system to. A
    // terminal you simply open deserves to say so.
    setActionLabel(data.action || 'INITIALIZE MODULE');
    /* Everything above About and Contact needs an account. Say so on the
       button rather than letting someone press it and be refused — and only
       once the session is known, so a slow network cannot flash the wrong
       label at a member. */
    if (window.BTAccess && id !== 'contact' && id !== 'about') {
        const forId = id;
        BTAccess.get().then(a => {
            if (activeServiceId !== forId) return;
            if (!a.signedIn) setActionLabel('SIGN IN TO INITIALIZE');
        });
    }

    setTimeout(() => document.body.classList.add('landed'), 60);
}

function setActionLabel(text) {
    actionBtn.innerHTML = text + ' <i class="fa-solid fa-chevron-right"></i>';
}

function closeService() {
    document.body.classList.remove('landed');
    activeServiceId = null;
    setTimeout(() => { document.body.classList.remove('warping'); }, 600);
}

returnBtn.addEventListener('click', closeService);

// INITIALIZE MODULE BUTTON LOGIC
actionBtn.addEventListener('click', async () => {
    if (!activeServiceId) return;

    /* One gate for every service that is not About or Contact. It runs
       before anything opens, so nothing behind it has to check again. */
    if (window.BTAccess) {
        const access = await BTAccess.get();
        if (!access.signedIn) {
            document.body.classList.remove('landed');
            showTacticalModal('CLEARANCE REQUIRED',
                'Create an account or sign in to initialise this module. ' +
                'Registration is free and comes with one backtest credit.', false);
            if (window.setAuthMode) window.setAuthMode('signin');
            const am = document.getElementById('auth-modal-overlay');
            if (am) am.classList.add('active');
            return;
        }
    }

    if (activeServiceId === 'backtest') {
        document.body.classList.remove('landed');
        const titleContainer = document.getElementById('spaceship-title-container');
        const authCorner = document.getElementById('auth-corner');
        if (titleContainer) titleContainer.style.opacity = '0';
        if (authCorner) authCorner.style.opacity = '0';
        
        fillConsoleRail();
        setTimeout(() => {
            const gasAtmosphere = document.getElementById('gas-giant-atmosphere');
            if (gasAtmosphere) gasAtmosphere.classList.add('active');
        }, 800);
    } else if (activeServiceId === 'replay') {
        // Same tab. The terminal carries a back arrow that returns here, and
        // the browser's own Back button restores this scroll position, which
        // a second tab never would.
        window.location.href = 'replay.html';
    } else if (activeServiceId === 'databank') {
        openDatabankModal();
    } else if (activeServiceId === 'campus') {
        showTacticalModal('TRADING CAMPUS',
            'The Trading Campus is still under development. Registrations of interest are open for the ' +
            'first Quantitative Engineering cohort — reach the engineering desk through ' +
            'Contact Us and you will be told the moment it opens.', true);
    }
});

/* The replay terminal sends anyone who hits a locked control back here with
   ?plans=1, and so does a Stripe cancellation. Open the pricing for them
   rather than dropping them at the top of the page wondering what happened. */
document.addEventListener('DOMContentLoaded', () => {
    const wants = location.search;
    if (/[?&]plans=1/.test(wants) || /[?&]signin=1/.test(wants)) {
        const signin = /[?&]signin=1/.test(wants);
        setTimeout(() => {
            if (signin) {
                if (window.setAuthMode) window.setAuthMode('signin');
                const am = document.getElementById('auth-modal-overlay');
                if (am) am.classList.add('active');
            } else openSubscriptionModal();
        }, 400);
        try { history.replaceState(null, '', location.pathname); } catch (e) {}
    }
});

/* Credits are no longer a currency. You cannot buy them: the three tiers are
   subscriptions, and a subscription that includes the Backtest Machine runs
   as many backtests as you like. What is left of credits is the free run
   every new account is given to try the thing once — plus whatever balance
   people who bought the old packs still hold, which is honoured.

   Every surface that mentions backtests reads this one description, so the
   HUD, the console rail and the report log can never disagree. */
function backtestState(a) {
    if (!a || !a.signedIn)
        return { unlimited: false, signedIn: false, value: '—', label: 'BACKTEST RUNS', short: 'BACKTESTS: --' };
    if (a.plan && a.backtest)
        return { unlimited: true, signedIn: true, value: '∞', label: 'UNLIMITED BACKTESTS',
                 short: 'BACKTESTS: &#8734;' };
    return { unlimited: false, signedIn: true, value: String(a.credits),
             label: a.credits === 1 ? 'FREE BACKTEST LEFT' : 'FREE BACKTESTS LEFT',
             short: 'FREE RUNS: ' + a.credits };
}

/* The console's own rail: how many runs are left, whose account this is,
   and a way to your reports without closing the console to find them. */
async function fillConsoleRail() {
    const n   = document.getElementById('console-credits');
    const who = document.getElementById('console-who');
    if (!n || !who) return;
    n.textContent = '—';
    who.textContent = 'checking…';
    if (!window.BTAccess) { who.textContent = ''; return; }
    try {
        const a = await BTAccess.get(true);
        const st = backtestState(a);
        n.classList.toggle('is-unlimited', st.unlimited);
        n.textContent = st.value;
        const label = document.getElementById('console-credits-label');
        if (label) label.textContent = st.label;
        who.textContent = a.signedIn
            ? (a.planLabel ? a.email + ' · ' + a.planLabel : a.email)
            : 'not signed in';
        // Nothing to upgrade to when it is already unlimited.
        const up = document.getElementById('console-plans-btn');
        if (up) up.hidden = st.unlimited;
    } catch (e) { who.textContent = ''; }
}

document.addEventListener('DOMContentLoaded', () => {
    const rep = document.getElementById('console-reports-btn');
    if (rep) rep.addEventListener('click', openReportsLibrary);
    const pl = document.getElementById('console-plans-btn');
    if (pl) pl.addEventListener('click', openSubscriptionModal);
});

/* =====================================================================
   PRICING: monthly / yearly

   Each card carries both Stripe prices. The toggle rewrites what is shown
   and, more importantly, the data-price-id the checkout handler reads — so
   the page can never advertise one number and charge another.

   USDC is deliberately left out of it: crypto cannot recur, so a coin
   payment always buys one month at the monthly price whichever way the
   toggle is set.
   ===================================================================== */
let billingCycle = 'month';

function applyBillingCycle(cycle) {
    billingCycle = (cycle === 'year') ? 'year' : 'month';
    const yearly = billingCycle === 'year';

    document.querySelectorAll('#billing-toggle .bt-opt').forEach(b =>
        b.classList.toggle('active', b.dataset.cycle === billingCycle));

    document.querySelectorAll('.tier-card[data-tier]').forEach(card => {
        const amt = card.dataset[yearly ? 'yearAmt' : 'monthAmt'];
        const id  = card.dataset[yearly ? 'yearId'  : 'monthId'];

        /* The headline is always a MONTHLY figure. Showing $590 where $59 was
           makes the annual plan look like a price rise instead of a saving —
           the number people are comparing is what it costs them a month, so
           that is the number that gets the big type. The real charge is right
           underneath it and on the button, which is where it belongs. */
        const monthAmt = +card.dataset.monthAmt;
        const perMonth = yearly ? (+amt / 12) : +amt;
        const saving   = yearly ? (monthAmt * 12 - +amt) : 0;

        const priceEl = card.querySelector('.tier-price');
        const amtEl = card.querySelector('.tier-price .amt');
        const perEl = card.querySelector('.tier-price .per');
        const bill  = card.querySelector('.tier-billed');
        if (priceEl) priceEl.classList.toggle('is-equiv', yearly);
        if (amtEl) amtEl.textContent = yearly
            ? (Math.round(perMonth * 100) / 100).toFixed(2) : amt;
        if (perEl) perEl.textContent = ' / mo';
        if (bill) {
            bill.innerHTML = yearly
                ? '$' + amt + ' billed yearly &middot; <b>save $' + saving + '</b>'
                : 'billed monthly';
        }

        const btn = card.querySelector('.select-tier-btn');
        if (btn) {
            btn.setAttribute('data-price-id', id);
            const label = btn.querySelector('.btn-amt');
            if (label) label.textContent = '$' + amt + (yearly ? '/yr' : '/mo');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('billing-toggle');
    if (toggle) {
        toggle.querySelectorAll('.bt-opt').forEach(b =>
            b.addEventListener('click', () => applyBillingCycle(b.dataset.cycle)));
        applyBillingCycle('month');
    }

    /* The USDC buttons were inline onclick handlers carrying their own copy of
       the price. They read the card they sit in instead, so a price can only
       be wrong in one place. */
    document.querySelectorAll('.crypto-pay-btn[data-usdc]').forEach(b =>
        b.addEventListener('click', () => {
            const card = b.closest('.tier-card');
            if (!card) return;
            openCryptoModal(card.dataset.name, +card.dataset.monthAmt, 0, card.dataset.tier);
        }));
});

// ABORT CONSOLE BUTTON
const abortConsoleBtn = document.getElementById('abort-console-btn');
if (abortConsoleBtn) {
    abortConsoleBtn.addEventListener('click', () => {
        const gasAtmosphere = document.getElementById('gas-giant-atmosphere');
        if (gasAtmosphere) gasAtmosphere.classList.remove('active');
        
        setTimeout(() => {
            document.body.classList.add('landed');
            const titleContainer = document.getElementById('spaceship-title-container');
            const authCorner = document.getElementById('auth-corner');
            if (titleContainer) titleContainer.style.opacity = '1';
            if (authCorner) authCorner.style.opacity = '1';
        }, 600);
    });
}

// BLACKBOARD GENERATOR
function generateBlackboard() {
    const canvas = document.getElementById('blackboard-bg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.scale(dpr, dpr);
    
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    
    const formulas = [
        "dS_t = μS_t dt + σS_t dW_t", "E = mc²", "∇ × E = - ∂B / ∂t", "w* = Σ⁻¹ μ", "iℏ(∂Ψ/∂t) = HΨ", 
        "Sharpe = (R_p - R_f) / σ_p", "∫ e^{-x^2} dx = √π", "F = G(m₁m₂)/r²", "O(n log n)",
        "P(A|B) = [P(B|A)P(A)]/P(B)", "ΔS ≥ 0", "S = k log W", "e^{iπ} + 1 = 0", "∇·E = ρ/ε₀", 
        "Cov(X,Y) = E[XY] - E[X]E[Y]", "Δ = ∂V / ∂S", "Γ = ∂²V / ∂S²", "A = UΣV^T", "d(uv) = u dv + v du",
        "L = T - V", "H = p·q̇ - L", "df = (∂f/∂x)dx + (∂f/∂y)dy", "∮ B·dl = μ₀I", "λ = h/p", "F = ma", 
        "PV = nRT", "V = (4/3)πr³", "lim(x→∞) (1 + 1/x)^x = e", "sin²θ + cos²θ = 1"
    ];
    
    const density = Math.floor((window.innerWidth * window.innerHeight) / 14000);
    for (let i = 0; i < density; i++) {
        const text = formulas[Math.floor(Math.random() * formulas.length)];
        const x = Math.random() * window.innerWidth;
        const y = Math.random() * window.innerHeight;
        const fontSize = Math.random() * 12 + 14; 
        ctx.font = `italic ${fontSize}px 'Times New Roman', serif`;
        const alpha = Math.random() * 0.05 + 0.015; 
        const colorRand = Math.random();
        if (colorRand > 0.98) ctx.fillStyle = `rgba(210, 213, 219, ${alpha})`; 
        else if (colorRand > 0.96) ctx.fillStyle = `rgba(255, 0, 85, ${alpha})`; 
        else ctx.fillStyle = `rgba(255, 255, 255, ${alpha + 0.04})`; 
        ctx.fillText(text, x, y);
    }
}

// TACTICAL HUD MODAL TRIGGER
function showTacticalModal(title, message, isSuccess = true) {
    const modalOverlay = document.getElementById('tactical-modal-overlay');
    const heading = document.getElementById('modal-heading');
    const msg = document.getElementById('modal-message');
    const statusTag = document.querySelector('.modal-status-tag');
    const card = document.querySelector('.tactical-modal-card');

    if (heading) heading.innerText = title;
    if (msg) msg.innerHTML = message;

    if (!isSuccess) {
        if (statusTag) { statusTag.innerText = '// TRANSMISSION STATUS: ERROR'; statusTag.style.color = '#ff0055'; }
        if (card) card.style.borderColor = 'rgba(255, 0, 85, 0.5)';
    } else {
        if (statusTag) { statusTag.innerText = '// TRANSMISSION STATUS: SECURED'; statusTag.style.color = '#ffb066'; }
        if (card) card.style.borderColor = 'rgba(255, 176, 102, 0.4)';
    }

    if (modalOverlay) modalOverlay.classList.add('active');
}

// SUBSCRIPTION MODAL TRIGGERS
function openSubscriptionModal() {
    const subModal = document.getElementById('subscription-modal-overlay');
    if (subModal) subModal.classList.add('active');

    // Wake up Render server in the background so Checkout is instant
    fetch('https://backtest-worker-fs1a.onrender.com', { mode: 'no-cors' }).catch(() => {});
}

function closeSubscriptionModal() {
    const subModal = document.getElementById('subscription-modal-overlay');
    if (subModal) subModal.classList.remove('active');
}

function openAuthModal() {
    const authModal = document.getElementById('auth-modal-overlay');
    if (authModal) authModal.classList.add('active');
}

// SUPABASE CLIENT INITIALIZATION
const SUPABASE_URL = 'https://woxswhiayrkecspebuwb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndveHN3aGlheXJrZWNzcGVidXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MTc5ODYsImV4cCI6MjEwMDk5Mzk4Nn0.faEmt5_tw6dN9Cs-pKJHa9D0yyEBbAl4oT0Y9QWYuFg';

let supabaseClient = null;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    // bt-access.js reads the same session from here rather than building a
    // second client: two clients on one origin race each other's refresh.
    window.supabaseClient = supabaseClient;
}

// USER PROFILE ENGINE
async function fetchOrCreateUserProfile(user) {
    if (!supabaseClient || !user) return null;

    try {
        let { data: profile } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

        if (!profile) {
            const { data: newProfile, error: createError } = await supabaseClient
                .from('user_profiles')
                .insert([{ 
                    id: user.id, 
                    email: user.email, 
                    credits: 1 
                }])
                .select()
                .single();

            if (createError) {
                console.error("Error creating user profile:", createError);
                return null;
            }
            return newProfile;
        }

        return profile;
    } catch (err) {
        console.error("User Profile Error:", err);
        return null;
    }
}

/* Editing your own profile writes to two different places, because the two
   fields belong in two different places.

   The NAME goes to auth metadata, which a signed-in user is allowed to write
   without any table policy at all.

   The PICTURE cannot go there: user_metadata is carried inside the JWT, so an
   image in it would be attached to every single request the browser makes.
   It goes to a column instead, and that column needs a narrow permission —
   column-level, so the same policy cannot be used to hand yourself credits
   or a plan:

     alter table public.user_profiles add column avatar_url text;

     create policy "Users can edit their own picture"
       on public.user_profiles for update to authenticated
       using (auth.uid() = id) with check (auth.uid() = id);

     revoke update on public.user_profiles from authenticated, anon;
     grant  update (avatar_url) on public.user_profiles to authenticated;

   The revoke matters as much as the grant: without it the policy would allow
   an update to ANY column, credits and plan included. */
function wireProfileEditor(session, access) {
    const box  = document.getElementById('prof-editor');
    if (!box) return;
    const msg  = document.getElementById('prof-msg');
    const name = document.getElementById('prof-name-input');
    const file = document.getElementById('prof-file');
    let picked = undefined;                  // undefined = untouched, null = remove

    const open = () => { box.hidden = false; setTimeout(() => name && name.focus(), 30); };
    document.getElementById('prof-edit-btn')?.addEventListener('click', open);
    document.getElementById('prof-av-btn')?.addEventListener('click', open);
    document.getElementById('prof-cancel-btn')?.addEventListener('click', () => { box.hidden = true; });
    document.getElementById('prof-pick-btn')?.addEventListener('click', () => file && file.click());

    document.getElementById('prof-clear-btn')?.addEventListener('click', () => {
        picked = null;
        setPreview(null);
        say('Picture will be removed when you save.');
    });

    function say(text, bad) {
        if (!msg) return;
        msg.textContent = text || '';
        msg.classList.toggle('bad', !!bad);
    }
    function setPreview(url) {
        const holder = document.getElementById('prof-av-btn');
        if (!holder || !window.BTUI) return;
        const pen = holder.querySelector('.prof-av-pen');
        holder.innerHTML = BTUI.avatar(session.user.id,
            (name && name.value) || session.user.user_metadata?.display_name,
            session.user.email, 52, url);
        if (pen) holder.appendChild(pen);
    }

    file?.addEventListener('change', async () => {
        const f = file.files && file.files[0];
        if (!f) return;
        say('Preparing…');
        try {
            picked = await BTUI.squashImage(f, 160);
            setPreview(picked);
            say('Looks good. Press Save to keep it.');
        } catch (e) {
            picked = undefined;
            say(e.message || 'That image could not be used.', true);
        }
        file.value = '';
    });

    document.getElementById('prof-save-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('prof-save-btn');
        btn.disabled = true;
        say('Saving…');
        const problems = [];
        try {
            const wanted = (name.value || '').trim().slice(0, 32);
            const current = session.user.user_metadata?.display_name || '';
            if (wanted !== current) {
                const { error } = await supabaseClient.auth.updateUser({
                    data: { display_name: wanted || null }
                });
                if (error) problems.push('name: ' + error.message);
            }
            if (picked !== undefined) {
                const { error } = await supabaseClient.from('user_profiles')
                    .update({ avatar_url: picked }).eq('id', session.user.id);
                if (error) problems.push('picture: ' + error.message);
            }
        } catch (e) {
            problems.push(e.message || String(e));
        }
        btn.disabled = false;

        if (problems.length) {
            // Almost always the column or the grant is missing; say which.
            say(problems.join(' · '), true);
            return;
        }
        say('Saved.');
        if (window.BTAccess) BTAccess.forget();
        setTimeout(() => { closeTacticalThen(openUserReportsModal); }, 500);
    });
}

/* The profile lives inside the tactical modal, so anything it opens has to
   get that out of the way first or it lands behind it. */
function closeTacticalThen(fn) {
    const ov = document.getElementById('tactical-modal-overlay');
    if (ov) ov.classList.remove('active');
    setTimeout(fn, 220);
}

// AGENT PROFILE & REPORTS MODAL
async function openUserReportsModal() {
    if (!supabaseClient) {
        showTacticalModal('SYSTEM ERROR', 'Supabase client is not initialized.', false);
        return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session || !session.user) {
        showTacticalModal('ACCESS DENIED', 'Please authenticate to view your transmission log.', false);
        return;
    }

    const activeUserId = session.user.id;
    const userEmail = session.user.email;
    const callsign = (session.user.user_metadata?.display_name || userEmail.split('@')[0]).toUpperCase();

    try {
        const userProfile = await fetchOrCreateUserProfile(session.user);
        const availableCredits = userProfile ? userProfile.credits : 0;
        const btState = backtestState(window.BTAccess ? await BTAccess.get() : null);

        const { data: submissions, error } = await supabaseClient
            .from('submissions')
            .select('*')
            .eq('user_id', activeUserId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const historyList = submissions || [];
        
        const totalSubmissions = historyList.length;
        const completedCount = historyList.filter(s => {
            const hasUrl = (s.report_url || s.pdf_url || s.report_link || s.file_url || s.url || '').trim();
            const rawStatus = String(s.status || '').toLowerCase().trim();
            return hasUrl || ['completed', 'complete', 'done', 'success'].includes(rawStatus);
        }).length;
        const pendingCount = totalSubmissions - completedCount;

        /* The profile panel answers the three questions someone opens it for:
           who am I signed in as, what am I on, and how much of it is left.
           Before this it showed a credit count and an email and nothing else —
           you could not tell from your own account page which plan you were
           paying for. */
        const access = window.BTAccess ? await BTAccess.get(true) : null;
        const av = window.BTUI
            ? BTUI.avatar(activeUserId, session.user.user_metadata?.display_name, userEmail, 52,
                          access && access.avatarUrl)
            : '<i class="fa-solid fa-id-badge"></i>';

        const planName = (access && access.planLabel) || 'Free account';
        const planTone = (access && access.plan) ? '#ffd700' : '#8c9099';
        const since = userProfile && userProfile.created_at
            ? new Date(userProfile.created_at).toLocaleDateString(undefined,
                { year: 'numeric', month: 'short' })
            : null;
        const renews = userProfile && userProfile.plan_expires_at
            ? new Date(userProfile.plan_expires_at).toLocaleDateString(undefined,
                { year: 'numeric', month: 'short', day: 'numeric' })
            : null;

        const detail = [];
        if (since)  detail.push(`<span><i class="fa-solid fa-calendar-day"></i> Member since ${since}</span>`);
        if (renews) detail.push(`<span><i class="fa-solid fa-rotate"></i> Renews ${renews}</span>`);
        detail.push(`<span><i class="fa-solid fa-envelope"></i> ${userEmail}</span>`);

        const profileHeaderHtml = `
            <div class="prof-card">
                <div class="prof-head">
                    <div class="prof-id">
                        <button type="button" class="prof-av" id="prof-av-btn"
                                title="Change your picture">${av}<span class="prof-av-pen">
                            <i class="fa-solid fa-camera"></i></span></button>
                        <span class="prof-idtext">
                            <span class="prof-name">${callsign}
                                <button type="button" class="prof-edit" id="prof-edit-btn"
                                        title="Edit your name"><i class="fa-solid fa-pen"></i></button>
                            </span>
                            <span class="prof-plan" style="color:${planTone}; border-color:${planTone}44; background:${planTone}14;">
                                ${(access && access.plan) ? '<i class="fa-solid fa-gem"></i>' : '<i class="fa-solid fa-user"></i>'} ${planName}
                            </span>
                        </span>
                    </div>
                    <button type="button" class="prof-manage" onclick="closeTacticalThen(openSubscriptionModal)">
                        ${(access && access.plan) ? 'CHANGE PLAN' : 'SEE THE PLANS'} <i class="fa-solid fa-chevron-right"></i>
                    </button>
                </div>

                <div class="prof-detail">${detail.join('')}</div>

                <div class="prof-editor" id="prof-editor" hidden>
                    <label class="prof-field">
                        <span>DISPLAY NAME</span>
                        <input type="text" id="prof-name-input" maxlength="32" spellcheck="false"
                               value="${(session.user.user_metadata?.display_name || '').replace(/"/g, '&quot;')}"
                               placeholder="${userEmail.split('@')[0]}">
                    </label>
                    <div class="prof-editor-row">
                        <button type="button" class="prof-btn" id="prof-pick-btn">
                            <i class="fa-solid fa-image"></i> CHOOSE A PICTURE</button>
                        <button type="button" class="prof-btn danger" id="prof-clear-btn"
                                ${access && access.avatarUrl ? '' : 'hidden'}>
                            <i class="fa-solid fa-xmark"></i> REMOVE</button>
                    </div>
                    <input type="file" id="prof-file" accept="image/*" hidden>
                    <div class="prof-editor-row end">
                        <span class="prof-msg" id="prof-msg"></span>
                        <button type="button" class="prof-btn ghost" id="prof-cancel-btn">CANCEL</button>
                        <button type="button" class="prof-btn save" id="prof-save-btn">SAVE</button>
                    </div>
                </div>

                <div class="prof-stats">
                    <div class="prof-stat accent">
                        <div class="prof-stat-label">${btState.unlimited ? 'BACKTESTS' : 'FREE RUNS'}</div>
                        <div class="prof-stat-value">${btState.value}</div>
                    </div>
                    <div class="prof-stat">
                        <div class="prof-stat-label">TOTAL RUNS</div>
                        <div class="prof-stat-value">${totalSubmissions}</div>
                    </div>
                    <div class="prof-stat">
                        <div class="prof-stat-label">COMPLETED</div>
                        <div class="prof-stat-value" style="color:#ffb066;">${completedCount}</div>
                    </div>
                    <div class="prof-stat">
                        <div class="prof-stat-label">IN QUEUE</div>
                        <div class="prof-stat-value" style="color:#d2d5db;">${pendingCount}</div>
                    </div>
                </div>
            </div>
        `;

        const profileHtml = profileHeaderHtml + `
            <div class="prof-actions">
                <button type="button" class="prof-btn wide" onclick="closeTacticalThen(openReportsLibrary)">
                    <i class="fa-solid fa-folder-open"></i> MY REPORTS (${totalSubmissions})
                </button>
            </div>`;

        showTacticalModal('AGENT PROFILE // COMMAND CENTER', profileHtml, true);
        wireProfileEditor(session, access);

    } catch (err) {
        showTacticalModal('FETCH ERROR', err.message, false);
    }
}

/* =====================================================================
   MY REPORTS

   Its own room rather than a scrolling strip inside the account panel.
   One case file per submitted system: what you sent, what came back, and
   the two things you actually want to do with it. Reached from the agent
   badge, from the profile, and from the submission console's own rail —
   because the moment you most want your last report is while you are
   writing the next one.
   ===================================================================== */
let rlSubs = [], rlFilter = 'all';

function rlStateOf(sub) {
    const url = (sub.report_url || sub.pdf_url || sub.report_link || sub.file_url || sub.url || '').trim();
    const raw = String(sub.status || '').toLowerCase().trim();
    if (url || ['completed', 'complete', 'done', 'success'].includes(raw))
        return { key: 'done', label: 'COMPLETED', tone: '#ffb066', url: url };
    if (['failed', 'error', 'rejected'].includes(raw))
        return { key: 'failed', label: 'FAILED', tone: '#ff5f7a', url: '' };
    return { key: 'queue', label: 'IN QUEUE', tone: '#ffd700', url: '' };
}

async function openReportsLibrary() {
    const box = document.getElementById('reports-library');
    if (!box) return;
    if (!supabaseClient) {
        showTacticalModal('SYSTEM ERROR', 'Supabase client is not initialized.', false);
        return;
    }
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session || !session.user) {
        showTacticalModal('ACCESS DENIED', 'Please authenticate to view your reports.', false);
        return;
    }

    box.hidden = false;
    document.getElementById('rl-grid').innerHTML =
        '<div class="rl-empty"><i class="fa-solid fa-spinner fa-spin"></i>Reading your archive…</div>';

    try {
        const { data, error } = await supabaseClient
            .from('submissions').select('*')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false });
        if (error) throw error;
        rlSubs = data || [];
    } catch (err) {
        document.getElementById('rl-grid').innerHTML =
            `<div class="rl-empty"><i class="fa-solid fa-triangle-exclamation"></i>${err.message}</div>`;
        return;
    }
    renderReportsLibrary();
}

function renderReportsLibrary() {
    const grid = document.getElementById('rl-grid');
    const counts = document.getElementById('rl-counts');
    if (!grid) return;

    const states = rlSubs.map(rlStateOf);
    const done = states.filter(x => x.key === 'done').length;
    const queue = states.filter(x => x.key === 'queue').length;

    if (counts) counts.innerHTML =
        `<div class="rl-count"><b>${rlSubs.length}</b><span>SUBMITTED</span></div>
         <div class="rl-count"><b style="color:#ffb066">${done}</b><span>COMPLETED</span></div>
         <div class="rl-count"><b style="color:#ffd700">${queue}</b><span>IN QUEUE</span></div>`;

    const shown = rlSubs
        .map((sub, i) => ({ sub, st: states[i], no: rlSubs.length - i }))
        .filter(r => rlFilter === 'all' || r.st.key === rlFilter);

    if (!shown.length) {
        grid.innerHTML = rlSubs.length
            ? `<div class="rl-empty"><i class="fa-solid fa-folder-open"></i>
                 Nothing in this view yet.</div>`
            : `<div class="rl-empty"><i class="fa-solid fa-folder-open"></i>
                 No systems submitted yet.<br>
                 Send one through the <b>Backtest Machine</b> and its report lands here.</div>`;
        return;
    }

    grid.innerHTML = shown.map(({ sub, st, no }) => {
        const date = sub.created_at
            ? new Date(sub.created_at).toLocaleDateString(undefined,
                { year: 'numeric', month: 'short', day: 'numeric' })
            : 'RECENT';
        let foot;
        if (st.key === 'done') {
            foot = `<button type="button" class="rl-btn" data-open="${rlSubs.indexOf(sub)}">
                        <i class="fa-solid fa-chart-line"></i> VIEW REPORT</button>` +
                   (st.url
                     ? `<a class="rl-link" href="${st.url}" target="_blank" rel="noopener" download>
                          <i class="fa-solid fa-file-pdf"></i> PDF</a>`
                     : `<span class="rl-wait" style="color:#ffd700">
                          <i class="fa-solid fa-triangle-exclamation"></i> PDF pending</span>`);
        } else if (st.key === 'failed') {
            foot = `<span class="rl-wait" style="color:#ff5f7a">
                      <i class="fa-solid fa-circle-xmark"></i> Could not be completed</span>`;
        } else {
            foot = `<span class="rl-wait" style="color:rgba(255,255,255,.45)">
                      <i class="fa-solid fa-spinner fa-spin"></i> With the engineering desk</span>`;
        }
        return `
            <article class="rl-case" style="--case-tone:${st.tone}">
                <span class="rl-case-no">${String(no).padStart(2, '0')}</span>
                <div class="rl-case-head">
                    <span class="rl-case-name">${(sub.system_name || 'Untitled system')
                        .replace(/[<>]/g, '')}</span>
                    <span class="rl-chip" style="color:${st.tone}">${st.label}</span>
                </div>
                <div class="rl-case-date">SUBMITTED ${date.toUpperCase()}</div>
                <div class="rl-case-foot">${foot}</div>
            </article>`;
    }).join('');

    grid.querySelectorAll('[data-open]').forEach(b =>
        b.addEventListener('click', () => {
            const sub = rlSubs[Number(b.dataset.open)];
            if (!sub) return;
            document.getElementById('reports-library').hidden = true;
            window.__rptLast = sub;
            openReportDashboard(sub);
        }));
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('rl-close')?.addEventListener('click', () => {
        document.getElementById('reports-library').hidden = true;
    });
    document.getElementById('reports-library')?.addEventListener('click', e => {
        if (e.target.id === 'reports-library') e.target.hidden = true;
    });
    document.getElementById('rl-filters')?.addEventListener('click', e => {
        const b = e.target.closest('.rl-filter');
        if (!b) return;
        rlFilter = b.dataset.filter;
        document.querySelectorAll('.rl-filter').forEach(x =>
            x.classList.toggle('active', x === b));
        renderReportsLibrary();
    });
});
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const box = document.getElementById('reports-library');
    if (box && !box.hidden) box.hidden = true;
});

// MOBILE HUD TOUCH EXPANSION ENGINE
document.addEventListener('click', (e) => {
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) return;

    const slot = e.target.closest('.hud-slot');

    if (slot) {
        if (!slot.classList.contains('expanded') && !slot.classList.contains('active') && !slot.classList.contains('open')) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            document.querySelectorAll('.hud-slot').forEach(s => {
                s.classList.remove('expanded', 'active', 'open');
            });

            slot.classList.add('expanded', 'active', 'open');
            slot.closest('.hud-bar')?.classList.add('open');
        }
    } else {
        document.querySelectorAll('.hud-slot').forEach(s => {
            s.classList.remove('expanded', 'active', 'open');
        });
        document.querySelectorAll('.hud-bar').forEach(bar => {
            bar.classList.remove('open');
        });
    }
}, true);

// APPLICATION INITIALIZATION & AUTHENTICATION
let authMode = 'signin';

document.addEventListener('DOMContentLoaded', () => {
    const closeModalBtn = document.getElementById('close-modal-btn');
    const closeSubBtn = document.getElementById('close-sub-btn');
    const navSubBtn = document.getElementById('nav-subscription-btn');
    const systemSubmitForm = document.getElementById('system-submit-form');
    const systemNameInput = document.getElementById('system-name');
    const emailInput = document.getElementById('contact-email');
    const rulesInput = document.getElementById('system-rules');
    const submitBtn = document.getElementById('submit-btn');

    const authModal = document.getElementById('auth-modal-overlay');
    const closeAuthBtn = document.getElementById('close-auth-btn');
    const tabSignIn = document.getElementById('tab-signin');
    const tabSignUp = document.getElementById('tab-signup');
    const authForm = document.getElementById('auth-form');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const usernameGroup = document.getElementById('username-group');
    const authCorner = document.getElementById('auth-corner');
    const googleBtn = document.getElementById('google-auth-btn');

    if (navSubBtn) navSubBtn.addEventListener('click', openSubscriptionModal);
    if (closeSubBtn) closeSubBtn.addEventListener('click', closeSubscriptionModal);

    // STRIPE CHECKOUT INTEGRATION
    document.querySelectorAll('.select-tier-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const button = e.currentTarget;
            const priceId = button.getAttribute('data-price-id');
            const creditsToAdd = button.getAttribute('data-credits') || '0';
            const mode = button.getAttribute('data-mode') || 'subscription';
            const planName = button.getAttribute('data-plan') || 'Plan';
            // machine | replay | full — what the webhook writes to
            // user_profiles.plan, and what gates the two products.
            const planKey = button.getAttribute('data-tier') || '';

            if (!priceId || priceId.includes('ID_HERE')) {
                showTacticalModal('CONFIGURATION NOTICE', `Stripe Price ID for ${planName} is missing. Update the <code>data-price-id</code> attribute in index.html.`, false);
                return;
            }

            if (!supabaseClient) {
                showTacticalModal('SYSTEM ERROR', 'Supabase authentication client is unavailable.', false);
                return;
            }

            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session || !session.user) {
                closeSubscriptionModal();
                showTacticalModal('AUTHENTICATION REQUIRED', 'Please sign in or register an account before proceeding to Stripe Checkout.', false);
                setAuthMode('signin');
                if (authModal) authModal.classList.add('active');
                return;
            }

            const originalBtnHtml = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> UPLINKING TO STRIPE...';

            try {
                const backendServerUrl = 'https://backtest-worker-fs1a.onrender.com';
                const response = await fetch(`${backendServerUrl}/create-checkout-session`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        priceId: priceId,
                        userId: session.user.id,
                        creditsToAdd: parseInt(creditsToAdd, 10),
                        mode: mode,
                        planKey: planKey
                    })
                });

                const data = await response.json();

                if (!response.ok || data.error) {
                    throw new Error(data.error || 'Failed to initialize Stripe Checkout session.');
                }

                if (data.url) {
                    window.location.href = data.url;
                } else {
                    throw new Error('No checkout URL returned from server gateway.');
                }
            } catch (err) {
                console.error('Stripe Uplink Error:', err);
                showTacticalModal('GATEWAY ERROR', err.message, false);
                button.disabled = false;
                button.innerHTML = originalBtnHtml;
            }
        });
    });

    // CLOSE MODAL LOGIC
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            const modalOverlay = document.getElementById('tactical-modal-overlay');
            if (modalOverlay) modalOverlay.classList.remove('active');
            
            const gasAtmosphere = document.getElementById('gas-giant-atmosphere');
            if (gasAtmosphere) gasAtmosphere.classList.remove('active');
            
    
            setTimeout(() => {
                if (activeServiceId) {
                    document.body.classList.add('landed');
                }
                const titleContainer = document.getElementById('spaceship-title-container');
                if (authCorner) authCorner.style.opacity = '1';
                if (titleContainer) titleContainer.style.opacity = '1';
            }, 400);
        });
    }

    // BACKTEST SUBMISSION ENGINE
    if (systemSubmitForm) {
        systemSubmitForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!supabaseClient) {
                showTacticalModal('SYSTEM ERROR', 'Supabase client failed to load.', false);
                return;
            }

            const { data: { session } } = await supabaseClient.auth.getSession();
            
            if (!session || !session.user) {
                showTacticalModal('AUTHENTICATION REQUIRED', 'Please sign in or create an account to run backtests with your free credit.', false);
                setAuthMode('signin');
                if (authModal) authModal.classList.add('active');
                return;
            }

            const userId = session.user.id;
            const systemName = systemNameInput.value.trim();
            const email = emailInput.value.trim();
            const rules = rulesInput.value.trim();

            if (!systemName || !email || !rules) {
                showTacticalModal('MISSING PARAMETERS', 'Please fill out all transmission parameters.', false);
                return;
            }

            const profile = await fetchOrCreateUserProfile(session.user);
            const currentCredits = profile ? profile.credits : 0;

            /* A Backtest or Full subscriber runs as many as they like, so the
               credit balance is not consulted at all. Credits remain the route
               for anyone without a plan. */
            const access = window.BTAccess ? await BTAccess.get(true) : null;
            const unlimited = !!(access && access.plan && access.backtest);

            if (!unlimited && currentCredits < 1) {
                showTacticalModal(
                    'NO BACKTESTS AVAILABLE',
                    'This account has no backtest credits and no plan that includes the ' +
                    'Backtest Machine. Backtest Access and Full Access both run as many ' +
                    'backtests as you want.',
                    false
                );
                openSubscriptionModal();
                return;
            }

            const originalBtnText = submitBtn.innerHTML;
            submitBtn.innerText = 'UPLINKING TO CORE...';
            submitBtn.disabled = true;

            fetch("https://backtest-worker-fs1a.onrender.com", { mode: "no-cors" }).catch(() => {});

            try {
                const { error: subError } = await supabaseClient
                    .from('submissions')
                    .insert([{ 
                        system_name: systemName, 
                        email: email, 
                        rules: rules, 
                        status: 'pending',
                        user_id: userId
                    }]);

                if (subError) throw subError;

                // Optimistically update UI locally. A subscriber spends nothing,
                // so nothing is decremented and nothing is claimed about a balance.
                const newCredits = unlimited ? currentCredits : Math.max(0, currentCredits - 1);
                if (!unlimited) updateCreditBadgeUI(newCredits);
                fillConsoleRail();

                showTacticalModal(
                    'UPLINK SECURED', 
                    (unlimited
                        ? `System parameters received. Your plan runs as many backtests as you want, so nothing was deducted.`
                        : `System parameters received! 1 Backtest Credit used. <b>${newCredits} credit(s) remaining</b>.`) +
                    `<br><br>Your rules go to the engineering desk to be turned into code and run against real historical data. The report lands in your inbox, and in MY REPORTS, as soon as it is out.`, 
                    true
                );

                systemNameInput.value = '';
                rulesInput.value = '';
            } catch (err) {
                console.error('Submission Error:', err.message);
                showTacticalModal('UPLINK FAILED', err.message, false);
            } finally {
                submitBtn.innerHTML = originalBtnText;
                submitBtn.disabled = false;
            }
        });
    }

    function updateCreditBadgeUI(credits) {
        const badgeEl = document.getElementById('nav-credits-label');
        if (badgeEl) {
            badgeEl.innerHTML = `FREE RUNS: ${credits}`;
        }
    }

    function setAuthMode(mode) {
        authMode = mode;
        if (mode === 'signin') {
            if (tabSignIn) tabSignIn.classList.add('active');
            if (tabSignUp) tabSignUp.classList.remove('active');
            if (usernameGroup) usernameGroup.style.display = 'none';
            if (authSubmitBtn) authSubmitBtn.innerHTML = 'AUTHENTICATE <i class="fa-solid fa-key"></i>';
        } else {
            if (tabSignUp) tabSignUp.classList.add('active');
            if (tabSignIn) tabSignIn.classList.remove('active');
            if (usernameGroup) usernameGroup.style.display = 'block';
            if (authSubmitBtn) authSubmitBtn.innerHTML = 'CREATE CLEARANCE (1 FREE CREDIT) <i class="fa-solid fa-user-plus"></i>';
        }
    }

    // The branch gate lives outside this closure and needs to open the same
    // panel on the same tab.
    window.setAuthMode = setAuthMode;

    if (tabSignIn && tabSignUp) {
        tabSignIn.addEventListener('click', () => setAuthMode('signin'));
        tabSignUp.addEventListener('click', () => setAuthMode('signup'));
    }

    if (closeAuthBtn && authModal) {
        closeAuthBtn.addEventListener('click', () => authModal.classList.remove('active'));
    }

    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!supabaseClient) {
                showTacticalModal('AUTHENTICATION ERROR', 'Supabase client is offline.', false);
                return;
            }

            const email = document.getElementById('auth-email').value.trim();
            const password = document.getElementById('auth-password').value;
            const usernameInput = document.getElementById('auth-username');
            const username = usernameInput ? usernameInput.value.trim() : '';

            if (!email || !password) {
                showTacticalModal('ACCESS DENIED', 'Please input both Access ID and Security Password.', false);
                return;
            }

            authSubmitBtn.innerText = 'PROCESSING CLEARANCE...';
            authSubmitBtn.disabled = true;

            try {
                if (authMode === 'signup') {
                    if (!username) {
                        showTacticalModal('CALLSIGN REQUIRED', 'Please specify a Callsign / Username for sign-up.', false);
                        authSubmitBtn.disabled = false;
                        setAuthMode('signup');
                        return;
                    }

                    const { data, error } = await supabaseClient.auth.signUp({ 
                        email, 
                        password,
                        options: {
                            data: { display_name: username },
                            emailRedirectTo: window.location.origin
                        }
                    });

                    if (error) throw error;

                    if (data?.user) {
                        await fetchOrCreateUserProfile(data.user);
                    }

                    authModal.classList.remove('active');
                    showTacticalModal(
                        'CLEARANCE CREATED', 
                        'Check your email comm-link to verify your account. Your <b>1 Free Credit</b> has been assigned!', 
                        true
                    );
                } else {
                    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
                    if (error) throw error;

                    if (data?.user) {
                        await fetchOrCreateUserProfile(data.user);
                    }

                    authModal.classList.remove('active');
                    const displayName = data.user.user_metadata?.display_name || data.user.email.split('@')[0];
                    showTacticalModal('ACCESS GRANTED', `Authenticated as AGENT: ${displayName}`, true);
                }
            } catch (err) {
                showTacticalModal('AUTHENTICATION FAILED', err.message, false);
            } finally {
                setAuthMode(authMode);
                authSubmitBtn.disabled = false;
            }
        });
    }

    async function handleOAuth(provider) {
        if (!supabaseClient) return;
        try {
            const { error } = await supabaseClient.auth.signInWithOAuth({
                provider: provider,
                options: { redirectTo: window.location.origin }
            });
            if (error) throw error;
        } catch (err) {
            showTacticalModal('OAUTH FAILED', err.message, false);
        }
    }

    if (googleBtn) googleBtn.addEventListener('click', () => handleOAuth('google'));

    if (supabaseClient) {
        const hashStr = window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash;
        const hashParams = new URLSearchParams(hashStr);
        const queryParams = new URLSearchParams(window.location.search);

        const urlError = hashParams.get('error') || queryParams.get('error');
        const urlErrorDesc = hashParams.get('error_description') || queryParams.get('error_description');
        const authType = hashParams.get('type') || queryParams.get('type');
        const paymentStatus = queryParams.get('payment');

        if (paymentStatus === 'success') {
            showTacticalModal('PAYMENT SUCCESSFUL', 'Transaction complete! Your subscription credits have been assigned to your profile.', true);
            window.history.replaceState(null, null, window.location.pathname);
        } else if (paymentStatus === 'cancelled') {
            showTacticalModal('PAYMENT CANCELLED', 'Stripe checkout session was cancelled. No charges were made.', false);
            window.history.replaceState(null, null, window.location.pathname);
        } else if (urlError || urlErrorDesc) {
            const formattedMsg = urlErrorDesc 
                ? decodeURIComponent(urlErrorDesc).replace(/\+/g, ' ') 
                : 'Verification link is invalid or has expired.';
            showTacticalModal('LINK EXPIRED', formattedMsg, false);
            window.history.replaceState(null, null, window.location.pathname);
        } else if (authType === 'signup' || authType === 'email_confirmation') {
            showTacticalModal('EMAIL VERIFIED', 'Access Clearance Confirmed. 1 Free Credit Provisioned.', true);
            window.history.replaceState(null, null, window.location.pathname);
        } else if (window.location.hash.includes('access_token') || window.location.search.includes('code')) {
            window.history.replaceState(null, null, window.location.pathname);
        }

        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if (session && session.user) {
                const displayName = session.user.user_metadata?.display_name || session.user.email.split('@')[0];
                
                const profile = await fetchOrCreateUserProfile(session.user);
                const userCredits = profile ? profile.credits : 0;

                const contactEmailInput = document.getElementById('contact-email');
                if (contactEmailInput) {
                    contactEmailInput.value = session.user.email;
                }

                if (authCorner) {
                    authCorner.innerHTML = `
                        <div class="hud-bar">
                            <div class="hud-slot agent" id="nav-agent-btn">
                                <div class="hud-icon-box">
                                    <span class="status-dot"></span>
                                    ${window.BTUI ? BTUI.avatar(session.user.id, displayName,
                                        session.user.email, 24, profile && profile.avatar_url)
                                                  : '<i class="fa-solid fa-user-shield"></i>'}
                                </div>
                                <div class="hud-label-box">
                                    <span id="nav-user-label">AGENT: ${displayName.toUpperCase()}</span>
                                </div>
                            </div>
                            <div class="hud-slot credits" id="nav-credits-btn">
                                <div class="hud-icon-box">
                                    <i class="fa-solid fa-coins"></i>
                                </div>
                                <div class="hud-label-box">
                                    <span id="nav-credits-label">FREE RUNS: ${userCredits}</span>
                                </div>
                            </div>
                            <div class="hud-slot subs" id="my-sub-btn">
                                <div class="hud-icon-box">
                                    <i class="fa-solid fa-gem"></i>
                                </div>
                                <div class="hud-label-box">
                                    <span>SUBSCRIPTIONS</span>
                                </div>
                            </div>
                            <div class="hud-slot logout" id="signout-btn">
                                <div class="hud-icon-box">
                                    <i class="fa-solid fa-power-off"></i>
                                </div>
                                <div class="hud-label-box">
                                    <span>LOGOUT</span>
                                </div>
                            </div>
                        </div>
                    `;

                    // Filled once access is known; a raw credit count would be
                    // wrong for anyone on a plan that includes the machine.
                    if (window.BTAccess) BTAccess.get().then(a => {
                        const el = document.getElementById('nav-credits-label');
                        if (el) el.innerHTML = backtestState(a).short;
                    });

                    document.getElementById('nav-agent-btn')?.addEventListener('click', openUserReportsModal);
                    document.getElementById('nav-credits-btn')?.addEventListener('click', openSubscriptionModal);
                    document.getElementById('my-sub-btn')?.addEventListener('click', openSubscriptionModal);

                    document.getElementById('signout-btn')?.addEventListener('click', async () => {
                        await supabaseClient.auth.signOut();
                        window.location.reload();
                    });
                }
            } else {
                if (authCorner) {
                    authCorner.innerHTML = `
                        <div class="hud-bar">
                            <div class="hud-slot subs" id="nav-subscription-btn">
                                <div class="hud-icon-box"><i class="fa-solid fa-gem"></i></div>
                                <div class="hud-label-box"><span>SUBSCRIPTIONS</span></div>
                            </div>
                            <div class="hud-slot agent sign-in">
                                <div class="hud-icon-box"><i class="fa-solid fa-user"></i></div>
                                <div class="hud-label-box"><span>SIGN IN</span></div>
                            </div>
                            <div class="hud-slot credits sign-up">
                                <div class="hud-icon-box"><i class="fa-solid fa-user-plus"></i></div>
                                <div class="hud-label-box"><span>SIGN UP</span></div>
                            </div>
                        </div>
                    `;
                    document.getElementById('nav-subscription-btn')?.addEventListener('click', openSubscriptionModal);
                    document.querySelector('.sign-in')?.addEventListener('click', () => {
                        setAuthMode('signin');
                        if (authModal) authModal.classList.add('active');
                    });
                    document.querySelector('.sign-up')?.addEventListener('click', () => {
                        setAuthMode('signup');
                        if (authModal) authModal.classList.add('active');
                    });
                }
            }
        });
    }
});

// ==========================================
// SYSTEM DATABANK ENGINE (SEARCH INPUT UNLOCK & OVERLAY FIX)
// ==========================================

let cachedSystems = [];
let currentCategoryFilter = 'ALL';
let currentSearchQuery = '';

function openDatabankModal() {
    const modal = document.getElementById('databank-modal') || document.getElementById('hud-modal');
    if (modal) modal.classList.remove('hidden');
    showDatabankList();
    
    // Force unlock & style search input immediately
    unlockAndStyleSearchInput();
    setupDatabankEventListeners();
    fetchTradingSystems();
}

function closeDatabankModal() {
    const modal = document.getElementById('databank-modal') || document.getElementById('hud-modal');
    if (modal) modal.classList.add('hidden');
}

function showDatabankList() {
    const listView = document.getElementById('databank-list-view') || document.getElementById('systemsGrid');
    const detailView = document.getElementById('databank-detail-view') || document.getElementById('systemDetailView');
    if (listView) listView.style.display = 'grid';
    if (detailView) detailView.style.display = 'none';
}

// FORCE UNLOCK INPUT FIELD (Target ONLY the Databank Search Bar)
function unlockAndStyleSearchInput() {
    // Restrict selector strictly to Databank search inputs so other form inputs are not affected
    const searchInputs = document.querySelectorAll('#databank-modal input, #databank-list-view input, #systemsGrid input, input[placeholder*="Search"]');
    
    searchInputs.forEach(input => {
        // Unlock HTML attributes
        input.removeAttribute('disabled');
        input.removeAttribute('readonly');
        input.disabled = false;
        input.readOnly = false;

        // Force clickable & visible styling directly via JS
        input.style.setProperty('pointer-events', 'auto', 'important');
        input.style.setProperty('position', 'relative', 'important');
        input.style.setProperty('z-index', '999999', 'important');
        input.style.setProperty('color', '#ffffff', 'important'); // Visible white text
        input.style.setProperty('caret-color', '#d2d5db', 'important'); // Bright cyan typing cursor
        input.style.setProperty('background', 'rgba(0, 0, 0, 0.6)', 'important');
        input.style.setProperty('border', '1px solid #d2d5db', 'important');
        input.style.setProperty('user-select', 'text', 'important');
        input.style.setProperty('-webkit-user-select', 'text', 'important');

        // Stop 3D/Canvas global listeners from swallowing key presses
        const stopPropagation = (e) => e.stopPropagation();
        input.onkeydown = stopPropagation;
        input.onkeyup = stopPropagation;
        input.onkeypress = stopPropagation;

        // Ensure clicking explicitly focuses the box
        input.onclick = (e) => {
            e.stopPropagation();
            input.focus();
        };

        // Live filtering listener
        input.oninput = (e) => {
            currentSearchQuery = e.target.value.toLowerCase().trim();
            applyDatabankFilters();
        };
    });
}

function setupDatabankEventListeners() {
    if (window._databankListenersAttached) return;
    window._databankListenersAttached = true;

    // Global Category Filter Click Handler (ALL / CRYPTO / FOREX)
    document.addEventListener('click', (e) => {
        const targetBtn = e.target.closest('button, div, span, a');
        if (!targetBtn) return;

        const text = targetBtn.innerText.trim().toUpperCase();
        if (['ALL', 'CRYPTO', 'FOREX'].includes(text)) {
            const parentContainer = targetBtn.parentElement;
            if (parentContainer) {
                const siblings = parentContainer.querySelectorAll('button, div, span, a');
                siblings.forEach(el => {
                    const elText = el.innerText.trim().toUpperCase();
                    if (['ALL', 'CRYPTO', 'FOREX'].includes(elText)) {
                        el.style.background = 'transparent';
                        el.style.color = '#d2d5db';
                        el.classList.remove('active');
                    }
                });
            }

            targetBtn.style.background = '#d2d5db';
            targetBtn.style.color = '#000000';
            targetBtn.classList.add('active');

            currentCategoryFilter = text;
            applyDatabankFilters();
        }
    });
}

// Run unlocking routines when DOM loads and on window clicks
setupDatabankEventListeners();
document.addEventListener('DOMContentLoaded', unlockAndStyleSearchInput);
window.addEventListener('load', unlockAndStyleSearchInput);

async function fetchTradingSystems() {
    const gridContainer = document.getElementById('systems-grid') || document.getElementById('systemsGrid');
    if (!gridContainer) return;

    if (!supabaseClient) {
        gridContainer.innerHTML = `<p style="color: #e0836b;">Supabase client offline.</p>`;
        return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        gridContainer.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: #d2d5db;">
                <h3 style="margin-bottom: 1rem;">ACCESS RESTRICTED</h3>
                <p style="color: #a0a0a0; margin-bottom: 1.5rem;">Please sign in or create an account to access the System Databank.</p>
                <button onclick="openAuthModal()" style="background: #d2d5db; color: #0a0a0b; border: none; padding: 0.75rem 1.5rem; font-weight: bold; cursor: pointer; border-radius: 4px;">
                    SIGN IN / SIGN UP
                </button>
            </div>
        `;
        return;
    }

    try {
        const { data: systems, error } = await supabaseClient
            .from('trading_systems')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        cachedSystems = systems || [];
        applyDatabankFilters();
    } catch (err) {
        console.error('Error fetching systems:', err.message);
        gridContainer.innerHTML = `<p style="color: #e0836b; grid-column: 1 / -1;">Failed to load systems from vault.</p>`;
    }
}

function applyDatabankFilters() {
    const gridContainer = document.getElementById('systems-grid') || document.getElementById('systemsGrid');
    if (!gridContainer) return;

    const query = currentSearchQuery;

    const filtered = cachedSystems.filter(sys => {
        const fullSystemDataString = JSON.stringify(sys).toLowerCase();
        const sysCat = String(sys.category || '').toLowerCase();

        // 1. Category Filter Logic
        let matchesCategory = false;
        if (currentCategoryFilter === 'ALL') {
            matchesCategory = true;
        } else if (currentCategoryFilter === 'CRYPTO') {
            matchesCategory = sysCat.includes('crypto') || fullSystemDataString.includes('btc') || fullSystemDataString.includes('eth');
        } else if (currentCategoryFilter === 'FOREX') {
            matchesCategory = sysCat.includes('forex') || sysCat.includes('fx') || 
                (sysCat === '' && (fullSystemDataString.includes('eur') || fullSystemDataString.includes('gbp') || fullSystemDataString.includes('jpy')));
        }

        // 2. Search Query Logic
        const matchesSearch = !query || fullSystemDataString.includes(query);

        return matchesCategory && matchesSearch;
    });

    renderSystemGrid(filtered, gridContainer);
}

function renderSystemGrid(systems, container) {
    if (!container) return;
    container.innerHTML = "";

    if (!systems || systems.length === 0) {
        container.innerHTML = `<p style="color: #888; grid-column: 1 / -1; padding: 20px 0; text-align: center;">No matching trading systems found in the vault.</p>`;
        return;
    }

    systems.forEach(sys => {
        const card = document.createElement('div');
        card.className = 'system-card';
        card.style.cssText = 'border: 1px solid rgba(210, 213, 219, 0.2); padding: 15px; cursor: pointer; background: rgba(210, 213, 219, 0.02); border-radius: 4px;';
        card.onclick = () => viewSystemDetail(sys);

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <h4 style="color: #fff; margin: 0 0 8px 0;">${sys.system_name || sys.title || sys.name || 'Trading Strategy'}</h4>
                <span class="tag" style="border: 1px solid #e4e6ea; padding: 2px 6px; font-size: 11px; color: #e4e6ea; border-radius: 3px;">${sys.category || 'Quantitative'}</span>
            </div>
            <p style="font-size: 13px; color: #aaa; margin-bottom: 12px; line-height: 1.4;">${sys.short_description || sys.summary || (sys.full_description ? sys.full_description.substring(0, 100) + '...' : 'No summary.')}</p>
            <div style="font-size: 12px; color: #e4e6ea; font-family: 'Share Tech Mono', monospace;">
                WIN: ${sys.win_rate ?? 'N/A'}% | NET: ${sys.net_return ?? 'N/A'}%
            </div>
        `;
        container.appendChild(card);
    });
}

// ==========================================
// SYSTEM DETAIL VIEW (MOBILE RESPONSIVE FIXED)
// ==========================================

async function viewSystemDetail(sys) {
    const listView = document.getElementById('databank-list-view') || document.getElementById('systemsGrid');
    let detailView = document.getElementById('databank-detail-view') || document.getElementById('systemDetailView');

    if (!detailView) return;

    if (listView) listView.style.display = 'none';
    detailView.style.display = 'block';

    const isMobile = window.innerWidth <= 768;
    const rawDescription = sys.full_description || sys.description || sys.short_description || '';

    detailView.innerHTML = `
        <style>
            .cyber-scroll::-webkit-scrollbar {
                width: 6px;
            }
            .cyber-scroll::-webkit-scrollbar-track {
                background: rgba(0, 0, 0, 0.6);
                border-radius: 3px;
            }
            .cyber-scroll::-webkit-scrollbar-thumb {
                background: #d2d5db;
                border-radius: 3px;
                box-shadow: 0 0 8px rgba(210, 213, 219, 0.5);
            }
            .cyber-scroll::-webkit-scrollbar-thumb:hover {
                background: #ffb066;
            }
        </style>

        <button onclick="showDatabankList()" style="background: transparent; color: #d2d5db; border: 1px solid #d2d5db; padding: 5px 10px; cursor: pointer; font-size: ${isMobile ? '0.75rem' : '0.85rem'}; font-family: 'Share Tech Mono', monospace; margin-bottom: 0.75rem; border-radius: 4px; transition: 0.2s;">
            &#9664; BACK TO SYSTEM LIST
        </button>

        <h2 style="color: #fff; margin: 0 0 4px 0; font-family: 'Share Tech Mono', monospace; font-size: ${isMobile ? '1.1rem' : '1.5rem'}; letter-spacing: 1px;">
            ${sys.system_name || sys.title || sys.name || 'Trading Strategy'}
        </h2>
        <span class="tag" style="border: 1px solid #e4e6ea; padding: 2px 6px; font-size: 10px; color: #e4e6ea; border-radius: 3px; font-family: 'Share Tech Mono', monospace;">
            ${sys.category || 'Crypto'}
        </span>

        <!-- RESPONSIVE STATS HEADER GRID -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: ${isMobile ? '0.4rem' : '1rem'}; margin: 0.75rem 0;">
            <div style="background: rgba(210, 213, 219, 0.05); padding: ${isMobile ? '0.4rem 0.5rem' : '0.75rem 1rem'}; border-left: 3px solid #d2d5db; border-radius: 4px;">
                <div style="font-size: ${isMobile ? '0.6rem' : '0.7rem'}; color: #888; font-family: 'Share Tech Mono', monospace; letter-spacing: 0.5px;">WIN RATE</div>
                <div style="font-size: ${isMobile ? '0.95rem' : '1.4rem'}; color: #fff; font-weight: bold; font-family: 'Share Tech Mono', monospace;">${sys.win_rate ?? 'N/A'}%</div>
            </div>
            <div style="background: rgba(255, 176, 102, 0.05); padding: ${isMobile ? '0.4rem 0.5rem' : '0.75rem 1rem'}; border-left: 3px solid #ffb066; border-radius: 4px;">
                <div style="font-size: ${isMobile ? '0.6rem' : '0.7rem'}; color: #888; font-family: 'Share Tech Mono', monospace; letter-spacing: 0.5px;">NET RETURN</div>
                <div style="font-size: ${isMobile ? '0.95rem' : '1.4rem'}; color: #ffb066; font-weight: bold; font-family: 'Share Tech Mono', monospace;">${sys.net_return ?? 'N/A'}%</div>
            </div>
            <div style="background: rgba(255, 0, 85, 0.05); padding: ${isMobile ? '0.4rem 0.5rem' : '0.75rem 1rem'}; border-left: 3px solid #ff0055; border-radius: 4px;">
                <div style="font-size: ${isMobile ? '0.6rem' : '0.7rem'}; color: #888; font-family: 'Share Tech Mono', monospace; letter-spacing: 0.5px;">MAX DD</div>
                <div style="font-size: ${isMobile ? '0.95rem' : '1.4rem'}; color: #ff0055; font-weight: bold; font-family: 'Share Tech Mono', monospace;">${sys.drawdown ?? sys.max_drawdown ?? 'N/A'}%</div>
            </div>
        </div>

        <!-- RESPONSIVE CONSOLE BOX (LIGHTER HEIGHT FOR MOBILE) -->
        <div class="cyber-scroll" style="max-height: ${isMobile ? '240px' : '460px'}; min-height: ${isMobile ? '180px' : '320px'}; overflow-y: auto; padding: ${isMobile ? '0.75rem 0.85rem' : '1.25rem 1.5rem'}; background: rgba(0, 0, 0, 0.5); border: 1px solid rgba(210, 213, 219, 0.2); border-radius: 6px; margin-bottom: 0.85rem;">
            ${formatStrategyText(rawDescription)}
        </div>

        <!-- ACTION BUTTON -->
        ${sys.report_url ? `
            <a href="${sys.report_url}" target="_blank" download style="display: inline-block; background: #d2d5db; color: #040912; padding: ${isMobile ? '8px 14px' : '10px 20px'}; text-decoration: none; font-weight: bold; font-family: 'Share Tech Mono', monospace; border-radius: 4px; border: 1px solid #d2d5db; font-size: ${isMobile ? '0.75rem' : '0.9rem'};">
                <i class="fa-solid fa-file-pdf"></i> DOWNLOAD FULL PDF REPORT
            </a>
        ` : ''}
    `;
}

// DYNAMIC EDITORIAL PARSER: Adapts to whatever layout you write in Supabase
function formatStrategyText(text) {
    if (!text) return `<p style="color: #666;">No detailed documentation attached.</p>`;

    // Split text into individual lines from Supabase
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let outHtml = '';

    lines.forEach(line => {
        // 1. DYNAMIC HEADER DETECTION:
        // Matches lines starting with # or ##, short lines ending with ':', or common header names
        const isMarkdownHeader = /^#{1,6}\s+/.test(line);
        const isColonHeader = !line.startsWith('-') && !line.startsWith('*') && line.endsWith(':') && line.length < 65;
        const isKnownHeader = !line.startsWith('-') && !line.startsWith('*') && (
            /^(Core Indicators|Entry Rules|Long \(Buy\) Conditions|Short \(Sell\) Conditions|Risk Management|Exit Rules)/i.test(line)
        ) && line.length < 65;

        if (isMarkdownHeader || isColonHeader || isKnownHeader) {
            // Clean up title text (strip # and trailing colon for a clean HUD title look)
            const cleanTitle = line.replace(/^#{1,6}\s+/, '').replace(/:$/, '').trim();
            outHtml += `
                <h4 style="color: #d2d5db; margin: 1.4rem 0 0.5rem 0; font-family: 'Share Tech Mono', monospace; font-size: 0.88rem; border-bottom: 1px solid rgba(210, 213, 219, 0.2); padding-bottom: 4px; letter-spacing: 1px; text-transform: uppercase;">
                    ${cleanTitle}
                </h4>`;
            return;
        }

        // 2. BULLET POINT DETECTION:
        if (line.startsWith('-') || line.startsWith('*')) {
            let content = line.replace(/^[-*]\s*/, '').trim();

            // Support markdown bold **text** or auto-bold labels before a colon
            content = content.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #e2e8f0; font-weight: 600;">$1</strong>');
            if (!content.startsWith('<strong')) {
                content = content.replace(/^([^:]+:)/, '<strong style="color: #e2e8f0; font-weight: 600;">$1</strong>');
            }

            outHtml += `
                <div style="margin: 6px 0 6px 12px; line-height: 1.6; color: #94a3b8; font-size: 0.88rem; font-family: system-ui, -apple-system, sans-serif;">
                    <span style="color: #d2d5db; margin-right: 6px;">•</span>${content}
                </div>`;
            return;
        }

        // 3. REGULAR PARAGRAPH TEXT:
        let content = line.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #e2e8f0; font-weight: 600;">$1</strong>');
        if (!content.startsWith('<strong')) {
            content = content.replace(/^([^:]+:)/, '<strong style="color: #e2e8f0; font-weight: 600;">$1</strong>');
        }

        outHtml += `<p style="margin: 6px 0; color: #94a3b8; line-height: 1.6; font-size: 0.88rem; font-family: system-ui, -apple-system, sans-serif;">${content}</p>`;
    });

    return outHtml;
}


// ==========================================
// USDC CRYPTO PAYMENT SYSTEM CONTROLLER
// ==========================================

// 1. Config: Define your receiving wallet addresses
const CRYPTO_WALLETS = {
    solana: "2C3P2uoRTUq9WVggAHhUBwA5EJ7Em8WEQJgQA5hsaWo7",
    ethereum: "0x13581166EE5CDD412358209539d94F2b79D94341"
};

let currentCryptoState = {
    planName: "",
    amount: 0,
    credits: 0,
    planKey: "",        // machine | replay | full — same field the card path sends
    network: "solana"
};

// 2. Open Crypto Modal
function openCryptoModal(planName, amount, credits, planKey) {
    currentCryptoState.planName = planName;
    currentCryptoState.amount = amount;
    currentCryptoState.credits = credits;
    currentCryptoState.planKey = planKey || '';
    currentCryptoState.network = "solana"; // Default network

    // Update UI elements
    document.getElementById('crypto-plan-title').innerText = `PAY FOR ${planName.toUpperCase()} WITH USDC`;
    document.getElementById('crypto-amount-due').innerText = `$${amount}.00 USDC`;
    document.getElementById('tx-hash-input').value = "";

    // Show modal & set up network display
    document.getElementById('crypto-modal-overlay').style.display = 'flex';
    switchCryptoNetwork('solana');
}

// 3. Close Crypto Modal
function closeCryptoModal() {
    document.getElementById('crypto-modal-overlay').style.display = 'none';
}

// 4. Switch Network (Solana <-> Ethereum)
function switchCryptoNetwork(network) {
    currentCryptoState.network = network;
    const tabSol = document.getElementById('tab-solana');
    const tabEth = document.getElementById('tab-ethereum');
    const walletAddressEl = document.getElementById('crypto-wallet-address');
    const qrCodeEl = document.getElementById('crypto-qr-code');

    const selectedAddress = CRYPTO_WALLETS[network];
    walletAddressEl.innerText = selectedAddress;

    if (network === 'solana') {
        tabSol.style.background = '#d2d5db';
        tabSol.style.color = '#000';
        tabEth.style.background = 'transparent';
        tabEth.style.color = '#d2d5db';
    } else {
        tabEth.style.background = '#d2d5db';
        tabEth.style.color = '#000';
        tabSol.style.background = 'transparent';
        tabSol.style.color = '#d2d5db';
    }

    // Generate Dynamic QR Code using public API
    const qrData = encodeURIComponent(selectedAddress);
    qrCodeEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${qrData}`;
}

// 5. Copy Address to Clipboard
function copyWalletAddress() {
    const address = document.getElementById('crypto-wallet-address').innerText;
    navigator.clipboard.writeText(address).then(() => {
        alert("Wallet address copied to clipboard!");
    }).catch(err => {
        console.error("Failed to copy address: ", err);
    });
}

// Updated submitTransactionForVerification with Live Backend Fetch
async function submitTransactionForVerification() {
    const txHash = document.getElementById('tx-hash-input').value.trim();
    const btn = document.getElementById('verify-payment-btn');

    if (!txHash) {
        alert("Please paste your transaction hash (TxID) before submitting.");
        return;
    }

    if (!supabaseClient) {
        alert("Supabase client is offline. Please refresh.");
        return;
    }

    // Grab current user session to send userId to backend
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session || !session.user) {
        alert("Please sign in before verifying crypto payments.");
        return;
    }

    const originalBtnHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> VERIFYING ON-CHAIN...`;

    try {
        const backendServerUrl = 'https://backtest-worker-fs1a.onrender.com';
        const response = await fetch(`${backendServerUrl}/verify-crypto-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: session.user.id,
                txHash: txHash,
                network: currentCryptoState.network,
                creditsToAdd: currentCryptoState.credits,
                priceUsdc: currentCryptoState.amount,
                planName: currentCryptoState.planName,
                planKey: currentCryptoState.planKey
            })
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            throw new Error(data.error || 'Verification failed on-chain.');
        }

        alert(`Payment verified! ${data.message || 'Credits added successfully.'}`);
        closeCryptoModal();
        window.location.reload(); // Reload to refresh credit balance badge

    } catch (error) {
        console.error("Verification error:", error);
        alert(`Verification Error: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalBtnHtml;
    }
}