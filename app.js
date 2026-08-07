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
        desc: "Here we present quantitative trading systems that demonstrate high potential and surface-level profitability. However, initial light-layer ideas are just the beginning.<br><br>These concepts must be rigorously checked by the user in our Backtest Machine for deep statistical data analysis before being considered reliable for live trading. This magnificent databank is currently under active development by our engineering team.",
        stats: [{ label: "STATUS", val: "Under Dev" }, { label: "SYSTEMS", val: "Curating" }, { label: "VALIDATION", val: "Required" }, { label: "POTENTIAL", val: "High" }]
    },
    about: {
        tag: "IDENTITY // SEC-03", title: "About The Factory", color: "#b700ff",
        desc: "We are professional quantitative backtesters delivering relentless, institutional-grade market data across multi-year historical cycles (2023, 2024, 2025, 2026 and beyond). Our numbers don't just come out of thin air—we give you itemized, trade-by-trade logs for every single buy and sell order, including wins, losses, and exact execution times.<br><br>Since deep historical lower-timeframe charts are nearly impossible to pull manually, we bring complete transparency to your screen. We calculate exact monthly and annual profits, proving how an initial balance with 2% risk scales over 1, 2, or 4 years. From maximum drawdown charts and win/loss ratios to consecutive loss streaks, we expose every dimension of your strategy so you know with 100% mathematical certainty that your system is truly profitable.",
        stats: [{ label: "OUTPUT", val: "Detailed Report" }, { label: "RECORDS", val: "Trade Log" }, { label: "DATA", val: "Historical Backtest" }, { label: "METRICS", val: "Compounding Analysis" }]
    },
    contact: {
        tag: "COMMS // SEC-04", title: "Contact Us", color: "#ff0055",
        desc: "Direct comm-link to the engineering desk. Reach out for quantitative system discussions, data analytics, or professional networking.<br><br><span style='color:#00f0ff'>Email:</span> ali.sadeghiu7u7@gmail.com<br><span style='color:#00f0ff'>Telegram:</span> @Dr_AliSadeghi<br><span style='color:#00f0ff'>Instagram:</span> [ Uplink Spot Reserved... ]",
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

function updateOrbitRadii() { orbits.forEach(o => { if (o.orbitEl) o.radius = o.orbitEl.offsetWidth / 2; }); }
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

function renderEngine(time) {
    orbits.forEach(o => {
        if (!o.orbitEl || !o.planetEl) return;
        const progress = (time / (o.duration * 1000)) % 1;
        o.currentAngle = progress * 360;
        if (o.reverse) o.currentAngle = -o.currentAngle;
        
        o.orbitEl.style.transform = `rotate(${o.currentAngle}deg)`;
        o.planetEl.style.transform = `translateX(-50%) rotate(${-o.currentAngle}deg)`;
    });

    if (activePlanetData) {
        const o = activePlanetData;
        const rad = (o.currentAngle * Math.PI) / 180;
        const px = o.radius * Math.sin(rad);
        const py = -o.radius * Math.cos(rad);
        
        if (isHyperZoomed) {
            targetCam.scale = 15;
            targetCam.x = -px;
            targetCam.y = -py;
        } else {
            targetCam.scale = 2.8;
            const screenOffset = -220; 
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

    if (viewport) viewport.style.transform = `scale(${cam.scale}) translate(${cam.x}px, ${cam.y}px)`;
    if (spaceMatrix) spaceMatrix.style.transform = `translate(${cam.x * 0.15}px, ${cam.y * 0.15}px)`;

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
        showTacticalModal('SYSTEM DATABANK', 'The System Databank is currently under active development. High-edge quantitative strategy models will be released soon.', true);
    } else if (activePlanetData.id === 'campus') {
        showTacticalModal('BACKTESTING CAMPUS', 'Enrolling now for the upcoming Quantitative Engineering cohort. Contact our engineering desk via SEC-04 to apply.', true);
    }
});

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

// ==========================================
// CONSTELLATION PARALLAX & VIDEO HOVER ENGINE
// ==========================================
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

// ==========================================
// DENSE BLACKBOARD GENERATOR ENGINE
// ==========================================
function generateBlackboard() {
    const canvas = document.getElementById('blackboard-bg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const formulas = [
        "dS_t = μS_t dt + σS_t dW_t", "E = mc²", "∇ × E = - ∂B / ∂t", "w* = Σ⁻¹ μ", "iℏ(∂Ψ/∂t) = HΨ", 
        "Sharpe = (R_p - R_f) / σ_p", "∫ e^{-x^2} dx = √π", "F = G(m₁m₂)/r²", "O(n log n)",
        "P(A|B) = [P(B|A)P(A)]/P(B)", "ΔS ≥ 0", "S = k log W", "e^{iπ} + 1 = 0", "∇·E = ρ/ε₀", 
        "Cov(X,Y) = E[XY] - E[X]E[Y]", "Δ = ∂V / ∂S", "Γ = ∂²V / ∂S²", "A = UΣV^T", "d(uv) = u dv + v du",
        "L = T - V", "H = p·q̇ - L", "df = (∂f/∂x)dx + (∂f/∂y)dy", "∮ B·dl = μ₀I", "λ = h/p", "F = ma", 
        "PV = nRT", "V = (4/3)πr³", "lim(x→∞) (1 + 1/x)^x = e", "sin²θ + cos²θ = 1"
    ];
    
    const density = Math.floor((canvas.width * canvas.height) / 7500); 
    for (let i = 0; i < density; i++) {
        const text = formulas[Math.floor(Math.random() * formulas.length)];
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
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

// ==========================================
// TACTICAL HUD MODAL TRIGGER
// ==========================================
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

// ==========================================
// SUBSCRIPTION MODAL TRIGGER
// ==========================================
function openSubscriptionModal() {
    const subModal = document.getElementById('subscription-modal-overlay');
    if (subModal) subModal.classList.add('active');
}

function closeSubscriptionModal() {
    const subModal = document.getElementById('subscription-modal-overlay');
    if (subModal) subModal.classList.remove('active');
}

// ==========================================
// HUD BINDING ENGINE (DESKTOP DIRECT // MOBILE 2-TAP)
// ==========================================
function bindHudSlot(element, actionCallback) {
    if (!element) return;
    element.addEventListener('click', (e) => {
        // STRICT MOBILE CHECK: Screen width <= 768px ONLY
        const isMobile = window.innerWidth <= 768;

        if (isMobile && !element.classList.contains('expanded')) {
            e.preventDefault();
            e.stopPropagation();
            document.querySelectorAll('.hud-slot').forEach(slot => slot.classList.remove('expanded'));
            element.classList.add('expanded');
            return;
        }

        element.classList.remove('expanded');
        if (typeof actionCallback === 'function') {
            actionCallback(e);
        }
    });
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.hud-slot')) {
        document.querySelectorAll('.hud-slot').forEach(slot => slot.classList.remove('expanded'));
    }
});

// ==========================================
// SUPABASE CLIENT INITIALIZATION
// ==========================================
const SUPABASE_URL = 'https://woxswhiayrkecspebuwb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInRefiI6IndveHN3aGlheXJrZWNzcGVidXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MTc5ODYsImV4cCI6MjEwMDk5Mzk4Nn0.faEmt5_tw6dN9Cs-pKJHa9D0yyEBbAl4oT0Y9QWYuFg';

let supabaseClient = null;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ==========================================
// USER PROFILE & FREE CREDIT ENGINE
// ==========================================
async function fetchOrCreateUserProfile(user) {
    if (!supabaseClient || !user) return null;

    try {
        let { data: profile, error } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

        if (!profile) {
            console.log("Creating new user profile with 1 Free Credit for User:", user.id);
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

// ==========================================
// AGENT PROFILE & PERMANENT HISTORY ENGINE
// ==========================================
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
    const rawName = session.user.user_metadata?.full_name || session.user.user_metadata?.display_name || userEmail.split('@')[0];
    const callsign = rawName.toUpperCase();

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

// ==========================================
// APPLICATION INITIALIZATION & AUTHENTICATION ENGINE
// ==========================================
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

    if (navSubBtn) bindHudSlot(navSubBtn, openSubscriptionModal);
    if (closeSubBtn) closeSubBtn.addEventListener('click', closeSubscriptionModal);

    // STRIPE CHECKOUT INTEGRATION LOGIC
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

    // BACKTEST SUBMISSION FORM
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

                const newCredits = currentCredits - 1;
                await supabaseClient
                    .from('user_profiles')
                    .update({ credits: newCredits })
                    .eq('id', userId);

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

    // EMAIL / PASSWORD AUTH SUBMISSION
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
                            emailRedirectTo: window.location.origin + window.location.pathname
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
                    const displayName = data.user.user_metadata?.full_name || data.user.user_metadata?.display_name || data.user.email.split('@')[0];
                    showTacticalModal('ACCESS GRANTED', `Authenticated as AGENT: ${displayName.toUpperCase()}`, true);
                    openUserReportsModal();
                }
            } catch (err) {
                showTacticalModal('AUTHENTICATION FAILED', err.message, false);
            } finally {
                setAuthMode(authMode);
                authSubmitBtn.disabled = false;
            }
        });
    }

    // OAUTH AUTHENTICATION (GOOGLE)
    if (googleBtn) {
        googleBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (!supabaseClient) {
                showTacticalModal('AUTHENTICATION ERROR', 'Supabase client is offline.', false);
                return;
            }

            try {
                const targetRedirect = window.location.origin + window.location.pathname;
                const { error } = await supabaseClient.auth.signInWithOAuth({
                    provider: 'google',
                    options: { 
                        redirectTo: targetRedirect,
                        queryParams: {
                            prompt: 'select_account'
                        }
                    }
                });
                if (error) throw error;
            } catch (err) {
                console.error("Google Auth Exception:", err);
                showTacticalModal('GOOGLE OAUTH ERROR', err.message || 'Failed to initialize Google authentication link.', false);
            }
        });
    }

    // AUTH STATE LISTENER & SESSION BINDING
    if (supabaseClient) {
        const queryParams = new URLSearchParams(window.location.search);
        const hashStr = window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash;
        const hashParams = new URLSearchParams(hashStr);

        const urlError = hashParams.get('error') || queryParams.get('error');
        const urlErrorDesc = hashParams.get('error_description') || queryParams.get('error_description');
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
                : 'Authentication attempt failed or link expired.';
            showTacticalModal('AUTHENTICATION ERROR', formattedMsg, false);
            window.history.replaceState(null, null, window.location.pathname);
        }

        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if (session && session.user) {
                const modal = document.getElementById('auth-modal-overlay');
                if (modal) modal.classList.remove('active');

                const rawName = session.user.user_metadata?.full_name || session.user.user_metadata?.display_name || session.user.email.split('@')[0];
                const displayName = rawName.toUpperCase();
                
                let userCredits = 0;
                try {
                    const profile = await fetchOrCreateUserProfile(session.user);
                    userCredits = profile ? profile.credits : 0;
                } catch (e) {
                    console.error("Profile check warning:", e);
                }

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
                                    <span id="nav-user-label">AGENT: ${displayName}</span>
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

                    bindHudSlot(document.getElementById('nav-agent-btn'), openUserReportsModal);
                    bindHudSlot(document.getElementById('nav-credits-btn'), openSubscriptionModal);
                    bindHudSlot(document.getElementById('my-sub-btn'), openSubscriptionModal);
                    bindHudSlot(document.getElementById('my-reports-btn'), openUserReportsModal);

                    bindHudSlot(document.getElementById('signout-btn'), async () => {
                        await supabaseClient.auth.signOut();
                        window.location.reload();
                    });
                }

                // If returning from OAuth redirect, automatically open the Command Center / Reports
                if (event === 'SIGNED_IN' || window.location.hash.includes('access_token') || window.location.search.includes('code')) {
                    openUserReportsModal();
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

                    bindHudSlot(document.getElementById('nav-subscription-btn'), openSubscriptionModal);
                    
                    bindHudSlot(document.querySelector('.sign-in'), () => {
                        setAuthMode('signin');
                        if (authModal) authModal.classList.add('active');
                    });

                    bindHudSlot(document.querySelector('.sign-up'), () => {
                        setAuthMode('signup');
                        if (authModal) authModal.classList.add('active');
                    });
                }
            }
        });
    }
});