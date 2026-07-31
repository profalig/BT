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
        tag: "IDENTITY // SEC-03", title: "About Us", color: "#b700ff",
        desc: "I am Ali Sadeghi, CEO and founder of System & Backtest Factory. With a PhD in Structural Engineering and years of experience coding in Python and data analysis, I bring a real-world, rigorous engineering mindset to the chaotic financial markets.<br><br>Based in Rome, Europe, I have always been obsessed with trading and building algorithmic systems. My true passion lies in going deep into data analysis to uncover the mathematical capabilities and statistics of trading systems. I am a professional backtester dedicated to finding, testing, and validating new edges.",
        stats: [{ label: "CEO & FOUNDER", val: "Ali Sadeghi" }, { label: "LOCATION", val: "Rome, EU" }, { label: "BACKGROUND", val: "PhD Struct. Eng" }, { label: "CORE SKILL", val: "Python / Data" }]
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

function updateOrbitRadii() { orbits.forEach(o => o.radius = o.orbitEl.offsetWidth / 2); }
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

    viewport.style.transform = `scale(${cam.scale}) translate(${cam.x}px, ${cam.y}px)`;
    spaceMatrix.style.transform = `translate(${cam.x * 0.15}px, ${cam.y * 0.15}px)`;

    requestAnimationFrame(renderEngine);
}
requestAnimationFrame(renderEngine);

orbits.forEach(o => {
    o.planetEl.addEventListener('click', () => {
        if (document.body.classList.contains('warping') || isHyperZoomed) return;

        orbits.forEach(orbit => orbit.planetEl.classList.remove('active'));
        
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

        if(o.id === 'contact' || o.id === 'about') {
            actionBtn.style.display = 'none';
        } else {
            actionBtn.style.display = 'flex';
        }

        setTimeout(() => document.body.classList.add('landed'), 500);
    });
});

returnBtn.addEventListener('click', () => {
    document.body.classList.remove('landed');
    if (activePlanetData) activePlanetData.planetEl.classList.remove('active');
    activePlanetData = null; 
    setTimeout(() => { document.body.classList.remove('warping'); }, 800);
});

// INITIALIZE MODULE BUTTON LOGIC (THE ZOOM)
actionBtn.addEventListener('click', () => {
    if (activePlanetData && activePlanetData.id === 'backtest') {
        isHyperZoomed = true;
        document.body.classList.remove('landed');
        document.getElementById('spaceship-title-container').style.opacity = '0';
        document.getElementById('auth-corner').style.opacity = '0';
        
        setTimeout(() => {
            document.getElementById('gas-giant-atmosphere').classList.add('active');
        }, 800);
    }
});

// ABORT CONSOLE BUTTON (ZOOM OUT)
document.getElementById('abort-console-btn').addEventListener('click', () => {
    document.getElementById('gas-giant-atmosphere').classList.remove('active');
    isHyperZoomed = false;
    
    setTimeout(() => {
        document.body.classList.add('landed');
        document.getElementById('spaceship-title-container').style.opacity = '1';
        document.getElementById('auth-corner').style.opacity = '1';
    }, 600);
});

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
    constellation.classList.add('highlight');
    const vid = constellation.querySelector('.beast-vid');
    if (vid) {
        if (vid.pauseTimeout) { clearTimeout(vid.pauseTimeout); vid.pauseTimeout = null; }
        vid.currentTime = 0; 
        vid.play().catch(e => console.log("Autoplay blocked")); 
    }
};

const resetAttack = (constellation) => {
    constellation.classList.remove('highlight');
    const vid = constellation.querySelector('.beast-vid');
    if (vid) {
        if (vid.pauseTimeout) clearTimeout(vid.pauseTimeout);
        vid.pauseTimeout = setTimeout(() => { vid.pause(); }, 400);
    }
};

orbits.forEach(o => {
    o.planetEl.addEventListener('mouseenter', () => {
        if (['backtest', 'campus'].includes(o.id)) triggerAttack(bullConstellation);
        else if (['databank', 'contact'].includes(o.id)) triggerAttack(bearConstellation);
        else { triggerAttack(bullConstellation); triggerAttack(bearConstellation); }
    });
    o.planetEl.addEventListener('mouseleave', () => { resetAttack(bullConstellation); resetAttack(bearConstellation); });
});

const btcSun = document.getElementById('sun');
const solarSystem = document.getElementById('solar-system');
btcSun.addEventListener('mouseenter', () => {
    solarSystem.classList.add('show-labels');
    triggerAttack(bullConstellation); triggerAttack(bearConstellation);
});
btcSun.addEventListener('mouseleave', () => {
    solarSystem.classList.remove('show-labels');
    resetAttack(bullConstellation); resetAttack(bearConstellation);
});

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
        if (statusTag) statusTag.innerText = '// TRANSMISSION STATUS: ERROR';
        if (statusTag) statusTag.style.color = '#ff0055';
        if (card) card.style.borderColor = 'rgba(255, 0, 85, 0.5)';
    } else {
        if (statusTag) statusTag.innerText = '// TRANSMISSION STATUS: SECURED';
        if (statusTag) statusTag.style.color = '#00ff66';
        if (card) card.style.borderColor = 'rgba(0, 255, 102, 0.4)';
    }

    if (modalOverlay) modalOverlay.classList.add('active');
}

// ==========================================
// USER REPORTS FETCH & RENDER ENGINE
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
    console.log("[DEBUG] Active User Session ID:", activeUserId);

    try {
        const { data: submissions, error } = await supabaseClient
            .from('submissions')
            .select('*')
            .eq('user_id', activeUserId)
            .order('created_at', { ascending: false });

        console.log("[DEBUG] Query Results:", submissions);

        if (error) {
            console.error("[DEBUG] Database Error:", error);
            throw error;
        }

        if (!submissions || submissions.length === 0) {
            showTacticalModal(
                'TACTICAL LOG // EMPTY',
                `No system backtests linked to User ID: <code style="color:#00ffff; font-size:0.85em;">${activeUserId}</code>.<br><br>If you updated the row manually, verify that the <b>user_id</b> in Supabase matches this exact string.`,
                true
            );
            return;
        }

        let reportRowsHtml = submissions.map(sub => {
            const dateStr = sub.created_at ? new Date(sub.created_at).toLocaleDateString() : 'RECENT';
            
            // Flexibly find URL column even if key variation exists
            const reportUrl = (sub.report_url || sub.pdf_url || sub.report_link || sub.file_url || sub.url || '').trim();
            const rawStatus = String(sub.status || '').toLowerCase().trim();

            let statusBadge;
            let downloadBtn;

            // If a download URL is present, auto-enable completed state
            if (reportUrl) {
                statusBadge = `<span style="color:#00ff66; font-weight:bold;">[ COMPLETED ]</span>`;
                downloadBtn = `<a href="${reportUrl}" target="_blank" download style="color:#00f0ff; text-decoration:underline; font-weight:bold;"><i class="fa-solid fa-file-pdf"></i> DOWNLOAD PDF REPORT</a>`;
            } else if (['completed', 'complete', 'done', 'success'].includes(rawStatus)) {
                statusBadge = `<span style="color:#00ff66; font-weight:bold;">[ COMPLETED ]</span>`;
                downloadBtn = `<span style="color:#ffd700;"><i class="fa-solid fa-triangle-exclamation"></i> Link pending in database (report_url cell is empty)</span>`;
            } else {
                statusBadge = `<span style="color:#ffd700; font-weight:bold;">[ PROCESSING ]</span>`;
                downloadBtn = `<span style="color:#888;"><i class="fa-solid fa-spinner fa-spin"></i> Analyzing Tick Data...</span>`;
            }

            return `
                <div style="background: rgba(0,0,0,0.5); border: 1px solid rgba(0,255,255,0.25); margin-bottom: 12px; padding: 14px; border-radius: 6px; text-align: left;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong style="color: #00ffff; font-size: 1.1em; letter-spacing: 0.5px;">${sub.system_name || 'UNTITLED SYSTEM'}</strong>
                        ${statusBadge}
                    </div>
                    <div style="font-size: 0.85em; color: #aaa; margin: 6px 0;">SUBMITTED: ${dateStr}</div>
                    <div style="margin-top: 10px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 8px;">${downloadBtn}</div>
                </div>
            `;
        }).join('');

        showTacticalModal('MY BACKTEST REPORTS', reportRowsHtml, true);
    } catch (err) {
        showTacticalModal('FETCH ERROR', err.message, false);
    }
}

// ==========================================
// SUPABASE CLIENT INITIALIZATION
// ==========================================
const SUPABASE_URL = 'https://woxswhiayrkecspebuwb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndveHN3aGlheXJrZWNzcGVidXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MTc5ODYsImV4cCI6MjEwMDk5Mzk4Nn0.faEmt5_tw6dN9Cs-pKJHa9D0yyEBbAl4oT0Y9QWYuFg';

let supabaseClient = null;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

document.addEventListener('DOMContentLoaded', () => {
    const submitBtn = document.getElementById('submit-btn');
    const systemNameInput = document.getElementById('system-name');
    const emailInput = document.getElementById('contact-email');
    const rulesInput = document.getElementById('system-rules');
    const closeModalBtn = document.getElementById('close-modal-btn');

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
                const authCorner = document.getElementById('auth-corner');
                if (titleContainer) titleContainer.style.opacity = '1';
                if (authCorner) authCorner.style.opacity = '1';
            }, 400);
        });
    }

    // BACKTEST SUBMISSION WITH USER LINKING
    if (submitBtn) {
        submitBtn.addEventListener('click', async (e) => {
            e.preventDefault();

            if (!supabaseClient) {
                showTacticalModal('SYSTEM ERROR', 'Supabase client failed to load.', false);
                return;
            }

            const systemName = systemNameInput.value.trim();
            const email = emailInput.value.trim();
            const rules = rulesInput.value.trim();

            if (!systemName || !email || !rules) {
                showTacticalModal('MISSING PARAMETERS', 'Please fill out all transmission parameters.', false);
                return;
            }

            const originalBtnText = submitBtn.innerHTML;
            submitBtn.innerText = 'UPLINKING TO CORE...';
            submitBtn.disabled = true;

            try {
                const { data: { session } } = await supabaseClient.auth.getSession();
                const userId = session?.user?.id || null;

                const { data, error } = await supabaseClient
                    .from('submissions')
                    .insert([{ 
                        system_name: systemName, 
                        email: email, 
                        rules: rules, 
                        status: 'pending',
                        user_id: userId
                    }]);

                if (error) throw error;

                showTacticalModal('UPLINK SECURED', 'System parameters received. Our engineering team will conduct a multi-threaded data analysis and compile your report shortly.', true);

                systemNameInput.value = '';
                rulesInput.value = '';
                if (!userId) emailInput.value = '';
            } catch (err) {
                console.error('Submission Error:', err.message);
                showTacticalModal('UPLINK FAILED', err.message, false);
            } finally {
                submitBtn.innerHTML = originalBtnText;
                submitBtn.disabled = false;
            }
        });
    }
});

// ==========================================
// AUTHENTICATION ENGINE
// ==========================================
let authMode = 'signin';

document.addEventListener('DOMContentLoaded', () => {
    const authModal = document.getElementById('auth-modal-overlay');
    const closeAuthBtn = document.getElementById('close-auth-btn');
    const tabSignIn = document.getElementById('tab-signin');
    const tabSignUp = document.getElementById('tab-signup');
    const authForm = document.getElementById('auth-form');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const usernameGroup = document.getElementById('username-group');
    const authCorner = document.getElementById('auth-corner');
    const googleBtn = document.getElementById('google-auth-btn');

    function setAuthMode(mode) {
        authMode = mode;
        if (mode === 'signin') {
            tabSignIn.classList.add('active');
            tabSignUp.classList.remove('active');
            if (usernameGroup) usernameGroup.style.display = 'none';
            authSubmitBtn.innerHTML = 'AUTHENTICATE <i class="fa-solid fa-key"></i>';
        } else {
            tabSignUp.classList.add('active');
            tabSignIn.classList.remove('active');
            if (usernameGroup) usernameGroup.style.display = 'block';
            authSubmitBtn.innerHTML = 'CREATE CLEARANCE <i class="fa-solid fa-user-plus"></i>';
        }
    }

    if (tabSignIn && tabSignUp) {
        tabSignIn.addEventListener('click', () => setAuthMode('signin'));
        tabSignUp.addEventListener('click', () => setAuthMode('signup'));
    }

    if (closeAuthBtn) {
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
            const username = document.getElementById('auth-username').value.trim();

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

                    authModal.classList.remove('active');
                    showTacticalModal(
                        'CLEARANCE CREATED', 
                        'Check your email comm-link to verify your clearance parameters.', 
                        true
                    );
                } else {
                    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
                    if (error) throw error;

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
            const { data, error } = await supabaseClient.auth.signInWithOAuth({
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

        if (urlError || urlErrorDesc) {
            const formattedMsg = urlErrorDesc 
                ? decodeURIComponent(urlErrorDesc).replace(/\+/g, ' ') 
                : 'Verification link is invalid or has expired.';
            showTacticalModal('LINK EXPIRED', formattedMsg, false);
            window.history.replaceState(null, null, window.location.pathname);
        } else if (authType === 'signup' || authType === 'email_confirmation') {
            showTacticalModal('EMAIL VERIFIED', 'Access Clearance Confirmed. Tactical Link Established.', true);
            window.history.replaceState(null, null, window.location.pathname);
        } else if (window.location.hash.includes('access_token') || window.location.search.includes('code')) {
            window.history.replaceState(null, null, window.location.pathname);
        }

        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (session && session.user) {
                const displayName = session.user.user_metadata?.display_name || session.user.email.split('@')[0];
                
                const contactEmailInput = document.getElementById('contact-email');
                if (contactEmailInput) {
                    contactEmailInput.value = session.user.email;
                }

                // Inject MY REPORTS button when user is logged in
                authCorner.innerHTML = `
                    <div class="user-badge"><i class="fa-solid fa-shield-halved"></i> AGENT: ${displayName.toUpperCase()}</div>
                    <button id="my-reports-btn" class="auth-btn"><i class="fa-solid fa-folder-open"></i> MY REPORTS</button>
                    <button id="signout-btn" class="auth-btn"><i class="fa-solid fa-power-off"></i> LOGOUT</button>
                `;

                document.getElementById('my-reports-btn').addEventListener('click', openUserReportsModal);

                document.getElementById('signout-btn').addEventListener('click', async () => {
                    await supabaseClient.auth.signOut();
                    window.location.reload();
                });
            } else {
                authCorner.innerHTML = `
                    <button class="auth-btn sign-in"><i class="fa-solid fa-user"></i> SIGN IN</button>
                    <button class="auth-btn sign-up"><i class="fa-solid fa-user-plus"></i> SIGN UP</button>
                `;
                document.querySelector('.auth-btn.sign-in')?.addEventListener('click', () => {
                    setAuthMode('signin');
                    authModal.classList.add('active');
                });
                document.querySelector('.auth-btn.sign-up')?.addEventListener('click', () => {
                    setAuthMode('signup');
                    authModal.classList.add('active');
                });
            }
        });
    }
});