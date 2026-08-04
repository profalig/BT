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

// INITIALIZE MODULE BUTTON LOGIC (THE ZOOM & ACTIONS)
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

// ABORT CONSOLE BUTTON (ZOOM OUT)
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
        if (card) card.style.borderColor = 'rgba(255, 0, 85, 0.4)';
    } else {
        if (statusTag) { statusTag.innerText = '// TRANSMISSION STATUS: SECURE'; statusTag.style.color = '#00ff66'; }
        if (card) card.style.borderColor = 'rgba(0, 255, 102, 0.4)';
    }

    if (modalOverlay) modalOverlay.classList.add('active');
}