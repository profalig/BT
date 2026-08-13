// ==========================================
// PLANET DATA & ORBIT ENGINE CONFIGURATION
// ==========================================
const planetData = {
    backtest: {
        tag: "ENGINE // SEC-01", title: "Backtest Machine", color: "#00ff66",
        desc: "Submit your system architecture to our core. We conduct a highly accurate, multi-threaded data analysis and return a comprehensive intelligence report.<br><br>Understand your system's edge across multiple market regimes with precise metrics: absolute win/loss rates, maximum drawdown stress-tests, full trade logs, and deep statistical reliability checks.",
        stats: [{ label: "TICK ACCURACY", val: "99.9%" }, { label: "METRICS", val: "30+ Stats" }, { label: "STRESS TEST", val: "Regime Based" }, { label: "REPORTS", val: "Deep Data" }]
    },
    databank: {
        tag: "VAULT // SEC-02", title: "System Databank", color: "#00ffff",
        desc: "Welcome to the System Databank, our curated vault of quantitative trading strategies. Every week, our engineering team researches, refines, and releases new algorithmic models across Crypto and Forex markets.<br><br>These concepts demonstrate verified surface-level profitability and serve as high-potential blueprints. Users are encouraged to run them through our Backtest Machine for deep statistical verification, multi-regime stress testing, and trade log analysis before live deployment.",
        stats: [{ label: "STATUS", val: "ONLINE" }, { label: "UPDATES", val: "Weekly" }, { label: "COVERAGE", val: "Crypto / FX" }, { label: "VALIDATION", val: "Required" }]
    },
    about: {
        tag: "IDENTITY // SEC-03", title: "About The Factory", color: "#b700ff",
        desc: "We are professional quantitative backtesters delivering relentless, institutional-grade market data across multi-year historical cycles (2023, 2024, 2025, 2026 and beyond). Our numbers don't just come out of thin air—we give you itemized, trade-by-trade logs for every single buy and sell order, including wins, losses, and exact execution times.<br><br>Since deep historical lower-timeframe charts are nearly impossible to pull manually, we bring complete transparency to your screen. We calculate exact monthly and annual profits, proving how an initial balance with 2% risk scales over 1, 2, or 4 years. From maximum drawdown charts and win/loss ratios to consecutive loss streaks, we expose every dimension of your strategy so you know with 100% mathematical certainty that your system is truly profitable.",
        stats: [{ label: "OUTPUT", val: "Detailed Report" }, { label: "RECORDS", val: "Trade Log" }, { label: "DATA", val: "Historical Backtest" }, { label: "METRICS", val: "Compounding Analysis" }]
    },
    contact: {
        tag: "COMMS // SEC-04", title: "Contact Us", color: "#ff0055",
        desc: "Direct comm-link to the engineering desk. Reach out for quantitative system discussions, data analytics, or professional networking.<br><br><span style='color:#00f0ff'>Email:</span> backtest.factory@gmail.com<br><span style='color:#00f0ff'>Telegram:</span> @Dr_AliSadeghi<br><span style='color:#00f0ff'>Instagram:</span> backtest.factory",
        stats: [{ label: "COMM LINK", val: "Encrypted" }, { label: "RESPONSE", val: "Active" }, { label: "LOCATION", val: "Italy" }, { label: "NETWORK", val: "Open" }]
    },
    campus: {
        tag: "ACADEMY // SEC-05", title: "Backtesting Campus", color: "#ffd700",
        desc: "The ultimate training ground for quantitative analysis. Our campus is built to teach deep data analysis, AI applications, statistical studies, and high-level data fetching.<br><br>This curriculum is designed specifically for those who want to become professional backtesters, robust coders, and system engineers in the trading industry and beyond.",
        stats: [{ label: "CURRICULUM", val: "Data & AI" }, { label: "SKILLS", val: "Stats / Python" }, { label: "TARGET", val: "Pro Quants" }, { label: "STATUS", val: "Enrolling" }]
    }
};

const orbitConfig = [
    { id: 'backtest', selector: '.orbit-1', duration: 25, reverse: false },
    { id: 'databank', selector: '.orbit-2', duration: 35, reverse: true },
    { id: 'about',    selector: '.orbit-3', duration: 45, reverse: false },
    { id: 'contact',  selector: '.orbit-4', duration: 55, reverse: true },
    { id: 'campus',   selector: '.orbit-5', duration: 65, reverse: false }
];

const orbits = orbitConfig.map(c => ({
    ...c,
    orbitEl: document.querySelector(c.selector),
    planetEl: document.querySelector(`${c.selector} .planet`),
    currentAngle: 0,
    radius: 0
}));

function updateOrbitRadii() { 
    orbits.forEach(o => { 
        if (o.orbitEl) o.radius = o.orbitEl.offsetWidth / 2; 
    }); 
}
updateOrbitRadii();
window.addEventListener('resize', updateOrbitRadii);

const viewport = document.getElementById('spaceship-viewport');
const spaceMatrix = document.getElementById('space-matrix');
const returnBtn = document.getElementById('return-btn');
const moduleDetails = document.querySelector('.module-details');
const actionBtn = document.getElementById('module-action-btn');

let activePlanetData = null;
let isHyperZoomed = false; 
let cam = { x: 0, y: 0, scale: 1 };
let targetCam = { x: 0, y: 0, scale: 1 };

// CAMERA RENDER ENGINE
function renderEngine(time) {
    orbits.forEach(o => {
        if (!o.orbitEl || !o.planetEl) return;
        const progress = (time / (o.duration * 1000)) % 1;
        o.currentAngle = progress * 360;
        if (o.reverse) o.currentAngle = -o.currentAngle;
        
        o.orbitEl.style.transform = `rotate(${o.currentAngle}deg)`;
        o.planetEl.style.transform = `translateX(-50%) rotate(${-o.currentAngle}deg)`;
    });

    const isMobile = window.innerWidth <= 768;

    if (activePlanetData) {
        const o = activePlanetData;
        const rad = (o.currentAngle * Math.PI) / 180;
        const px = o.radius * Math.sin(rad);
        const py = -o.radius * Math.cos(rad);
        
        if (isHyperZoomed) {
            targetCam.scale = isMobile ? 5.5 : 15;
            targetCam.x = -px;
            targetCam.y = -py;
        } else {
            targetCam.scale = isMobile ? 1.8 : 2.8;
            const screenOffset = isMobile ? 0 : -220; 
            targetCam.x = (screenOffset / targetCam.scale) - px;
            targetCam.y = -py;
        }
    } else {
        targetCam.x = 0; targetCam.y = 0; targetCam.scale = 1;
    }

    const lerpSpeed = isHyperZoomed ? 0.05 : (activePlanetData ? 0.12 : 0.08);
    cam.x += (targetCam.x - cam.x) * lerpSpeed;
    cam.y += (targetCam.y - cam.y) * lerpSpeed;
    cam.scale += (targetCam.scale - cam.scale) * lerpSpeed;

    if (viewport) {
        viewport.style.transform = `scale(${cam.scale}) translate3d(${cam.x}px, ${cam.y}px, 0px)`;
    }
    if (spaceMatrix) {
        spaceMatrix.style.transform = `translate3d(${cam.x * 0.15}px, ${cam.y * 0.15}px, 0px)`;
    }

    requestAnimationFrame(renderEngine);
}
requestAnimationFrame(renderEngine);

orbits.forEach(o => {
    if (!o.planetEl) return;
    o.planetEl.addEventListener('click', () => {
        if (document.body.classList.contains('warping') || isHyperZoomed) return;

        orbits.forEach(orbit => orbit.planetEl && orbit.planetEl.classList.remove('active'));
        
        activePlanetData = o;
        o.planetEl.classList.add('active'); 
        document.body.classList.add('warping');

        const data = planetData[o.id];
        
        document.getElementById('module-tag').innerText = data.tag;
        document.getElementById('module-tag').style.color = data.color;
        document.getElementById('module-title').innerText = data.title;
        document.getElementById('module-title').style.color = data.color;
        document.getElementById('module-desc').innerHTML = data.desc; 
        
        moduleDetails.style.borderLeftColor = data.color;
        actionBtn.style.borderColor = data.color;
        actionBtn.style.color = data.color;

        document.getElementById('stats-grid').innerHTML = data.stats.map(s => `
            <div class="stat-card">
                <span class="stat-title">${s.label}</span>
                <span class="stat-value" style="color: ${data.color}">${s.val}</span>
            </div>
        `).join('');

        if (o.id === 'contact' || o.id === 'about') {
            actionBtn.style.display = 'none';
        } else {
            actionBtn.style.display = 'flex';
        }

        setTimeout(() => document.body.classList.add('landed'), 500);
    });
});

returnBtn.addEventListener('click', () => {
    document.body.classList.remove('landed');
    if (activePlanetData && activePlanetData.planetEl) activePlanetData.planetEl.classList.remove('active');
    activePlanetData = null; 
    setTimeout(() => { document.body.classList.remove('warping'); }, 800);
});

// INITIALIZE MODULE BUTTON LOGIC
actionBtn.addEventListener('click', () => {
    if (!activePlanetData) return;

    if (activePlanetData.id === 'backtest') {
        isHyperZoomed = true;
        document.body.classList.remove('landed');
        const titleContainer = document.getElementById('spaceship-title-container');
        const authCorner = document.getElementById('auth-corner');
        if (titleContainer) titleContainer.style.opacity = '0';
        if (authCorner) authCorner.style.opacity = '0';
        
        setTimeout(() => {
            const gasAtmosphere = document.getElementById('gas-giant-atmosphere');
            if (gasAtmosphere) gasAtmosphere.classList.add('active');
        }, 800);
    } else if (activePlanetData.id === 'databank') {
        openDatabankModal();
    } else if (activePlanetData.id === 'campus') {
        showTacticalModal('BACKTESTING CAMPUS', 'Enrolling now for the upcoming Quantitative Engineering cohort. Contact our engineering desk via SEC-04 to apply.', true);
    }
});

// ABORT CONSOLE BUTTON
const abortConsoleBtn = document.getElementById('abort-console-btn');
if (abortConsoleBtn) {
    abortConsoleBtn.addEventListener('click', () => {
        const gasAtmosphere = document.getElementById('gas-giant-atmosphere');
        if (gasAtmosphere) gasAtmosphere.classList.remove('active');
        isHyperZoomed = false;
        
        setTimeout(() => {
            document.body.classList.add('landed');
            const titleContainer = document.getElementById('spaceship-title-container');
            const authCorner = document.getElementById('auth-corner');
            if (titleContainer) titleContainer.style.opacity = '1';
            if (authCorner) authCorner.style.opacity = '1';
        }, 600);
    });
}

// CONSTELLATION PARALLAX & VIDEO HOVER ENGINE
const bullConstellation = document.querySelector('.bull-constellation');
const bearConstellation = document.querySelector('.bear-constellation');

document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 2; 
    const y = (e.clientY / window.innerHeight - 0.5) * 2;
    if (bullConstellation && bearConstellation) {
        bullConstellation.style.setProperty('--parallax-x', `${-x * 60}px`);
        bullConstellation.style.setProperty('--parallax-y', `${-y * 60}px`);
        bearConstellation.style.setProperty('--parallax-x', `${-x * 60}px`);
        bearConstellation.style.setProperty('--parallax-y', `${-y * 60}px`);
    }
});

const triggerAttack = (constellation) => {
    if (!constellation) return;
    constellation.classList.add('highlight');
    const vid = constellation.querySelector('.beast-vid');
    if (vid) {
        if (vid.pauseTimeout) { clearTimeout(vid.pauseTimeout); vid.pauseTimeout = null; }
        vid.currentTime = 0; 
        vid.play().catch(() => {}); 
    }
};

const resetAttack = (constellation) => {
    if (!constellation) return;
    constellation.classList.remove('highlight');
    const vid = constellation.querySelector('.beast-vid');
    if (vid) {
        if (vid.pauseTimeout) clearTimeout(vid.pauseTimeout);
        vid.pauseTimeout = setTimeout(() => { vid.pause(); }, 400);
    }
};

orbits.forEach(o => {
    if (!o.planetEl) return;
    o.planetEl.addEventListener('mouseenter', () => {
        if (['backtest', 'campus'].includes(o.id)) triggerAttack(bullConstellation);
        else if (['databank', 'contact'].includes(o.id)) triggerAttack(bearConstellation);
        else { triggerAttack(bullConstellation); triggerAttack(bearConstellation); }
    });
    o.planetEl.addEventListener('mouseleave', () => { resetAttack(bullConstellation); resetAttack(bearConstellation); });
});

const btcSun = document.getElementById('sun');
const solarSystem = document.getElementById('solar-system');
if (btcSun && solarSystem) {
    btcSun.addEventListener('mouseenter', () => {
        solarSystem.classList.add('show-labels');
        triggerAttack(bullConstellation); triggerAttack(bearConstellation);
    });
    btcSun.addEventListener('mouseleave', () => {
        solarSystem.classList.remove('show-labels');
        resetAttack(bullConstellation); resetAttack(bearConstellation);
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
    
    const density = Math.floor((window.innerWidth * window.innerHeight) / 7500); 
    for (let i = 0; i < density; i++) {
        const text = formulas[Math.floor(Math.random() * formulas.length)];
        const x = Math.random() * window.innerWidth;
        const y = Math.random() * window.innerHeight;
        const fontSize = Math.random() * 12 + 14; 
        ctx.font = `italic ${fontSize}px 'Times New Roman', serif`;
        const alpha = Math.random() * 0.12 + 0.03; 
        const colorRand = Math.random();
        if (colorRand > 0.98) ctx.fillStyle = `rgba(0, 240, 255, ${alpha})`; 
        else if (colorRand > 0.96) ctx.fillStyle = `rgba(255, 0, 85, ${alpha})`; 
        else ctx.fillStyle = `rgba(255, 255, 255, ${alpha + 0.04})`; 
        ctx.fillText(text, x, y);
    }
}
generateBlackboard();
window.addEventListener('resize', generateBlackboard);

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
        if (statusTag) { statusTag.innerText = '// TRANSMISSION STATUS: SECURED'; statusTag.style.color = '#00ff66'; }
        if (card) card.style.borderColor = 'rgba(0, 255, 102, 0.4)';
    }

    if (modalOverlay) modalOverlay.classList.add('active');
}

// SUBSCRIPTION MODAL TRIGGERS
function openSubscriptionModal() {
    const subModal = document.getElementById('subscription-modal-overlay');
    if (subModal) subModal.classList.add('active');
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

        const profileHeaderHtml = `
            <div style="background: rgba(0, 240, 255, 0.05); border: 1px solid rgba(0, 240, 255, 0.3); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 10px; margin-bottom: 12px;">
                    <div>
                        <div style="font-size: 0.75em; color: #888; letter-spacing: 1px;">// CLEARANCE LEVEL: AGENT</div>
                        <div style="font-size: 1.3em; font-weight: bold; color: #00ffff; letter-spacing: 1px;">
                            <i class="fa-solid fa-id-badge"></i> ${callsign}
                        </div>
                    </div>
                    <div style="text-align: right; font-size: 0.85em; color: #aaa;">
                        <div><i class="fa-solid fa-envelope"></i> ${userEmail}</div>
                        <div style="color: #00ff66; margin-top: 2px;">● COMM-LINK ACTIVE</div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; text-align: center;">
                    <div style="background: rgba(255, 215, 0, 0.1); padding: 8px; border-radius: 4px; border: 1px solid rgba(255, 215, 0, 0.3);">
                        <div style="font-size: 0.7em; color: #ffd700;">CREDITS</div>
                        <div style="font-size: 1.2em; font-weight: bold; color: #ffd700;">${availableCredits}</div>
                    </div>
                    <div style="background: rgba(0, 0, 0, 0.4); padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="font-size: 0.7em; color: #888;">TOTAL RUNS</div>
                        <div style="font-size: 1.2em; font-weight: bold; color: #ffffff;">${totalSubmissions}</div>
                    </div>
                    <div style="background: rgba(0, 0, 0, 0.4); padding: 8px; border-radius: 4px; border: 1px solid rgba(0, 255, 102, 0.15);">
                        <div style="font-size: 0.7em; color: #888;">COMPLETED</div>
                        <div style="font-size: 1.2em; font-weight: bold; color: #00ff66;">${completedCount}</div>
                    </div>
                    <div style="background: rgba(0, 0, 0, 0.4); padding: 8px; border-radius: 4px; border: 1px solid rgba(0, 240, 255, 0.15);">
                        <div style="font-size: 0.7em; color: #888;">IN QUEUE</div>
                        <div style="font-size: 1.2em; font-weight: bold; color: #00f0ff;">${pendingCount}</div>
                    </div>
                </div>
            </div>
            <div style="font-size: 0.8em; color: #888; text-align: left; margin-bottom: 10px; letter-spacing: 1px;">
                // TRANSMISSION HISTORY LOG (${totalSubmissions} ARCHIVED)
            </div>
        `;

        if (totalSubmissions === 0) {
            const emptyContent = profileHeaderHtml + `
                <div style="padding: 20px; text-align: center; color: #aaa; border: 1px dashed rgba(255,255,255,0.15); border-radius: 6px;">
                    No backtest transmissions recorded for this account.<br>
                    Initialize a backtest in <b>SEC-01: Backtest Machine</b> to generate your first intelligence report.
                </div>
            `;
            showTacticalModal('AGENT PROFILE // COMMAND CENTER', emptyContent, true);
            return;
        }

        const reportRowsHtml = historyList.map(sub => {
            const dateStr = sub.created_at ? new Date(sub.created_at).toLocaleDateString() : 'RECENT';
            const reportUrl = (sub.report_url || sub.pdf_url || sub.report_link || sub.file_url || sub.url || '').trim();
            const rawStatus = String(sub.status || '').toLowerCase().trim();

            let statusBadge;
            let downloadBtn;

            if (reportUrl) {
                statusBadge = `<span style="color:#00ff66; font-weight:bold;">[ COMPLETED ]</span>`;
                downloadBtn = `<a href="${reportUrl}" target="_blank" download style="color:#00f0ff; text-decoration:underline; font-weight:bold;"><i class="fa-solid fa-file-pdf"></i> DOWNLOAD PDF REPORT</a>`;
            } else if (['completed', 'complete', 'done', 'success'].includes(rawStatus)) {
                statusBadge = `<span style="color:#00ff66; font-weight:bold;">[ COMPLETED ]</span>`;
                downloadBtn = `<span style="color:#ffd700;"><i class="fa-solid fa-triangle-exclamation"></i> Link pending in database</span>`;
            } else if (['failed', 'error', 'rejected'].includes(rawStatus)) {
                statusBadge = `<span style="color:#ff0055; font-weight:bold;">[ FAILED ]</span>`;
                downloadBtn = `<span style="color:#ff0055;"><i class="fa-solid fa-circle-xmark"></i> Execution Error</span>`;
            } else {
                statusBadge = `<span style="color:#ffd700; font-weight:bold;">[ PROCESSING ]</span>`;
                downloadBtn = `<span style="color:#888;"><i class="fa-solid fa-spinner fa-spin"></i> Analyzing Tick Data...</span>`;
            }

            return `
                <div style="background: rgba(0,0,0,0.5); border: 1px solid rgba(0,255,255,0.2); margin-bottom: 10px; padding: 12px 14px; border-radius: 6px; text-align: left;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong style="color: #00ffff; font-size: 1.05em; letter-spacing: 0.5px;">${sub.system_name || 'UNTITLED SYSTEM'}</strong>
                        ${statusBadge}
                    </div>
                    <div style="font-size: 0.8em; color: #aaa; margin: 4px 0;">SUBMITTED: ${dateStr}</div>
                    <div style="margin-top: 8px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 6px; font-size: 0.9em;">${downloadBtn}</div>
                </div>
            `;
        }).join('');

        const finalModalHtml = `
            ${profileHeaderHtml}
            <div style="max-height: 320px; overflow-y: auto; padding-right: 4px;">
                ${reportRowsHtml}
            </div>
        `;

        showTacticalModal('AGENT PROFILE // COMMAND CENTER', finalModalHtml, true);
    } catch (err) {
        showTacticalModal('FETCH ERROR', err.message, false);
    }
}

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
                        mode: mode
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
            
            isHyperZoomed = false;

            setTimeout(() => {
                if (activePlanetData) {
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

            if (currentCredits < 1) {
                showTacticalModal(
                    'INSUFFICIENT CREDITS', 
                    'You have 0 Backtest Credits remaining. Please upgrade your operational tier to unlock additional backtests.', 
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

                // Optimistically update UI locally
                const newCredits = Math.max(0, currentCredits - 1);
                updateCreditBadgeUI(newCredits);

                showTacticalModal(
                    'UPLINK SECURED', 
                    `System parameters received! 1 Backtest Credit used. <b>${newCredits} credit(s) remaining</b>.<br><br>Our engineering team will conduct a multi-threaded data analysis and compile your report shortly.`, 
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
            badgeEl.innerHTML = `CREDITS: ${credits}`;
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
                                    <i class="fa-solid fa-user-shield"></i>
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
                                    <span id="nav-credits-label">CREDITS: ${userCredits}</span>
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
                            <div class="hud-slot reports" id="my-reports-btn">
                                <div class="hud-icon-box">
                                    <i class="fa-solid fa-folder-open"></i>
                                </div>
                                <div class="hud-label-box">
                                    <span>MY REPORTS</span>
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

                    document.getElementById('nav-agent-btn')?.addEventListener('click', openUserReportsModal);
                    document.getElementById('nav-credits-btn')?.addEventListener('click', openSubscriptionModal);
                    document.getElementById('my-sub-btn')?.addEventListener('click', openSubscriptionModal);
                    document.getElementById('my-reports-btn')?.addEventListener('click', openUserReportsModal);

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

// FORCE UNLOCK INPUT FIELD (Fixes click blocking, z-index, text color & key interception)
function unlockAndStyleSearchInput() {
    const inputs = document.querySelectorAll('input');
    
    inputs.forEach(input => {
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
        input.style.setProperty('caret-color', '#00f0ff', 'important'); // Bright cyan typing cursor
        input.style.setProperty('background', 'rgba(0, 0, 0, 0.6)', 'important');
        input.style.setProperty('border', '1px solid #00f0ff', 'important');
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
                        el.style.color = '#00f0ff';
                        el.classList.remove('active');
                    }
                });
            }

            targetBtn.style.background = '#00f0ff';
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
        gridContainer.innerHTML = `<p style="color: #ff3366;">Supabase client offline.</p>`;
        return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        gridContainer.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: #00f0ff;">
                <h3 style="margin-bottom: 1rem;">ACCESS RESTRICTED</h3>
                <p style="color: #a0a0a0; margin-bottom: 1.5rem;">Please sign in or create an account to access the System Databank.</p>
                <button onclick="openAuthModal()" style="background: #00f0ff; color: #000; border: none; padding: 0.75rem 1.5rem; font-weight: bold; cursor: pointer; border-radius: 4px;">
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
        gridContainer.innerHTML = `<p style="color: #ff3366; grid-column: 1 / -1;">Failed to load systems from vault.</p>`;
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
        card.style.cssText = 'border: 1px solid rgba(0, 240, 255, 0.2); padding: 15px; cursor: pointer; background: rgba(0, 240, 255, 0.02); border-radius: 4px;';
        card.onclick = () => viewSystemDetail(sys);

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <h4 style="color: #fff; margin: 0 0 8px 0;">${sys.system_name || sys.title || sys.name || 'Trading Strategy'}</h4>
                <span class="tag" style="border: 1px solid #00ffff; padding: 2px 6px; font-size: 11px; color: #00ffff; border-radius: 3px;">${sys.category || 'Quantitative'}</span>
            </div>
            <p style="font-size: 13px; color: #aaa; margin-bottom: 12px; line-height: 1.4;">${sys.short_description || sys.summary || (sys.full_description ? sys.full_description.substring(0, 100) + '...' : 'No summary.')}</p>
            <div style="font-size: 12px; color: #00ffff; font-family: 'Share Tech Mono', monospace;">
                WIN: ${sys.win_rate ?? 'N/A'}% | NET: ${sys.net_return ?? 'N/A'}%
            </div>
        `;
        container.appendChild(card);
    });
}

// ==========================================
// SYSTEM DETAIL VIEW (EXPANDED CONSOLE & EDITORIAL FORMATTER)
// ==========================================

async function viewSystemDetail(sys) {
    const listView = document.getElementById('databank-list-view') || document.getElementById('systemsGrid');
    let detailView = document.getElementById('databank-detail-view') || document.getElementById('systemDetailView');

    if (!detailView) return;

    if (listView) listView.style.display = 'none';
    detailView.style.display = 'block';

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
                background: #00f0ff;
                border-radius: 3px;
                box-shadow: 0 0 8px rgba(0, 240, 255, 0.5);
            }
            .cyber-scroll::-webkit-scrollbar-thumb:hover {
                background: #00ff66;
            }
        </style>

        <button onclick="showDatabankList()" style="background: transparent; color: #00f0ff; border: 1px solid #00f0ff; padding: 6px 12px; cursor: pointer; font-size: 0.85rem; font-family: 'Share Tech Mono', monospace; margin-bottom: 1rem; border-radius: 4px; transition: 0.2s;">
            &#9664; BACK TO SYSTEM LIST
        </button>

        <h2 style="color: #fff; margin: 0 0 6px 0; font-family: 'Share Tech Mono', monospace; font-size: 1.5rem; letter-spacing: 1px;">
            ${sys.system_name || sys.title || sys.name || 'Trading Strategy'}
        </h2>
        <span class="tag" style="border: 1px solid #00ffff; padding: 2px 8px; font-size: 11px; color: #00ffff; border-radius: 3px; font-family: 'Share Tech Mono', monospace;">
            ${sys.category || 'Crypto'}
        </span>

        <!-- STATS HEADER GRID -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin: 1rem 0 1.25rem 0;">
            <div style="background: rgba(0, 240, 255, 0.05); padding: 0.75rem 1rem; border-left: 3px solid #00f0ff; border-radius: 4px;">
                <div style="font-size: 0.7rem; color: #888; font-family: 'Share Tech Mono', monospace; letter-spacing: 1px;">WIN RATE</div>
                <div style="font-size: 1.4rem; color: #fff; font-weight: bold; font-family: 'Share Tech Mono', monospace;">${sys.win_rate ?? 'N/A'}%</div>
            </div>
            <div style="background: rgba(0, 255, 102, 0.05); padding: 0.75rem 1rem; border-left: 3px solid #00ff66; border-radius: 4px;">
                <div style="font-size: 0.7rem; color: #888; font-family: 'Share Tech Mono', monospace; letter-spacing: 1px;">NET RETURN</div>
                <div style="font-size: 1.4rem; color: #00ff66; font-weight: bold; font-family: 'Share Tech Mono', monospace;">${sys.net_return ?? 'N/A'}%</div>
            </div>
            <div style="background: rgba(255, 0, 85, 0.05); padding: 0.75rem 1rem; border-left: 3px solid #ff0055; border-radius: 4px;">
                <div style="font-size: 0.7rem; color: #888; font-family: 'Share Tech Mono', monospace; letter-spacing: 1px;">MAX DRAWDOWN</div>
                <div style="font-size: 1.4rem; color: #ff0055; font-weight: bold; font-family: 'Share Tech Mono', monospace;">${sys.drawdown ?? sys.max_drawdown ?? 'N/A'}%</div>
            </div>
        </div>

        <!-- TALLER EDITORIAL CONSOLE BOX (460PX HEIGHT) -->
        <div class="cyber-scroll" style="max-height: 460px; min-height: 320px; overflow-y: auto; padding: 1.25rem 1.5rem; background: rgba(0, 0, 0, 0.5); border: 1px solid rgba(0, 240, 255, 0.2); border-radius: 6px; margin-bottom: 1.25rem;">
            ${formatStrategyText(rawDescription)}
        </div>

        <!-- ACTION BUTTON -->
        ${sys.report_url ? `
            <a href="${sys.report_url}" target="_blank" download style="display: inline-block; background: #00f0ff; color: #040912; padding: 10px 20px; text-decoration: none; font-weight: bold; font-family: 'Share Tech Mono', monospace; border-radius: 4px; border: 1px solid #00f0ff; font-size: 0.9rem;">
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
                <h4 style="color: #00f0ff; margin: 1.4rem 0 0.5rem 0; font-family: 'Share Tech Mono', monospace; font-size: 0.88rem; border-bottom: 1px solid rgba(0, 240, 255, 0.2); padding-bottom: 4px; letter-spacing: 1px; text-transform: uppercase;">
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
                    <span style="color: #00f0ff; margin-right: 6px;">•</span>${content}
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

// Suppress default HTML5 browser validation popups globally
document.addEventListener('invalid', (e) => {
  e.preventDefault();
}, true); // 'true' enables event capture because 'invalid' events do not bubble