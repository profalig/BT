document.addEventListener('DOMContentLoaded', () => {
    // ---- Elements Setup ----
    const body = document.body;
    
    // UI Modals
    const authModal = document.getElementById('auth-modal-overlay');
    const subModal = document.getElementById('subscription-modal-overlay');
    const gasGiantConsole = document.getElementById('gas-giant-atmosphere');
    
    // Nav Buttons
    const btnAuth = document.getElementById('nav-agent-btn');
    const btnSub = document.getElementById('nav-subscription-btn');
    const btnCredits = document.getElementById('nav-credits-btn');
    const btnReports = document.getElementById('nav-reports-btn');
    
    // Action Buttons
    const btnReturn = document.getElementById('return-btn');
    const btnModuleAction = document.getElementById('module-action-btn');
    const btnAbortConsole = document.getElementById('abort-console-btn');
    const closeBtns = document.querySelectorAll('.modal-close-btn');
    
    // Auth Tabs & Form Elements
    const authTabs = document.querySelectorAll('.auth-tab');
    const authSubmitBtn = document.querySelector('#auth-form .submit-system-btn');
    
    // Subscription Tier Buttons
    const tierBtns = document.querySelectorAll('.tier-btn');
    
    // Planet Elements
    const planets = document.querySelectorAll('.planet');
    const viewport = document.getElementById('spaceship-viewport');
    
    const planetData = {
        'backtest': { title: "DEEP BACKTEST CORE", desc: "Access the quantitative processing grid. Upload custom logic for historic market stress-testing." },
        'databank': { title: "SYSTEM DATABANK", desc: "Library of pre-compiled winning alpha strategies. Securely query decades of global asset tick-data." },
        'about': { title: "COMMAND CENTER", desc: "Learn about the engineering and quants behind the Systematic Factory framework." },
        'contact': { title: "COMMUNICATIONS LINK", desc: "Establish direct uplink with the lead quantitative support desk." },
        'campus': { title: "TRAINING CAMPUS", desc: "Review documentation, API endpoints, and structural guidelines for strategy architecture." }
    };

    // ---- Functionality: Modals & Top Navigation ----
    
    function openModal(modal) {
        if(modal) {
            modal.style.display = 'flex';
            setTimeout(() => { modal.style.opacity = '1'; }, 10);
        }
    }

    function closeModal(modal) {
        if(modal) {
            modal.style.display = 'none';
        }
    }

    // Open Modals from HUD
    if(btnAuth) btnAuth.addEventListener('click', () => openModal(authModal));
    if(btnSub) btnSub.addEventListener('click', () => openModal(subModal));
    
    // Give empty HUD slots a temporary alert so they "work"
    if(btnCredits) btnCredits.addEventListener('click', () => alert('Credits ledger connecting...'));
    if(btnReports) btnReports.addEventListener('click', () => alert('Fetching historical reports...'));

    // Close Modals via Close Buttons
    closeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            closeModal(e.target.closest('div[id$="-overlay"]'));
        });
    });

    // Handle clicking outside modal to close
    window.addEventListener('click', (e) => {
        if(e.target === authModal) closeModal(authModal);
        if(e.target === subModal) closeModal(subModal);
    });

    // ---- Functionality: Auth Tabs (Sign In / Sign Up Toggle) ----
    authTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            // Remove active class from all tabs
            authTabs.forEach(t => t.classList.remove('active'));
            // Add active class to clicked tab
            e.target.classList.add('active');
            
            // Change the submit button text based on the active tab
            if (e.target.innerText === 'SIGN UP') {
                authSubmitBtn.innerHTML = 'CREATE ACCOUNT <i class="fa-solid fa-user-plus"></i>';
            } else {
                authSubmitBtn.innerHTML = 'AUTHENTICATE <i class="fa-solid fa-key"></i>';
            }
        });
    });

    // ---- Functionality: Form Submissions ----
    document.getElementById('auth-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const activeTab = document.querySelector('.auth-tab.active').innerText;
        alert(`${activeTab} request initiated. Connecting to secure server...`);
        closeModal(authModal);
    });

    document.getElementById('system-submit-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        alert('System uplink successful. Deep backtest initiated! (-1 Credit)');
        closeModal(gasGiantConsole);
    });

    // ---- Functionality: Subscription Buttons ----
    tierBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tierName = e.target.closest('.tier-card').querySelector('.tier-name').innerText;
            alert(`Initializing secure payment gateway for: ${tierName}`);
        });
    });

    // ---- Functionality: Space Viewport & Planet Zoom ----
    planets.forEach(planet => {
        planet.addEventListener('click', function(e) {
            const planetId = this.getAttribute('data-id');
            const data = planetData[planetId];
            
            // Set cinematic content
            if(data) {
                document.getElementById('module-title').innerText = data.title;
                document.getElementById('module-desc').innerText = data.desc;
            }

            // Get position to zoom into
            const rect = this.getBoundingClientRect();
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            const offsetX = centerX - (rect.left + rect.width / 2);
            const offsetY = centerY - (rect.top + rect.height / 2);

            // Apply dramatic zoom scaling to viewport
            viewport.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(3)`;
            viewport.style.transition = 'transform 1.2s cubic-bezier(0.25, 1, 0.5, 1)';
            
            // Trigger UI Overlay State
            body.classList.add('landed');
            
            // Highlight current planet
            planets.forEach(p => p.classList.remove('active'));
            this.classList.add('active');
            
            // If they click the backtest planet, change the action button behavior
            if(planetId === 'backtest') {
                btnModuleAction.innerText = "OPEN BACKTEST CONSOLE >";
                btnModuleAction.onclick = () => openModal(gasGiantConsole);
            } else {
                btnModuleAction.innerText = "INITIALIZE MODULE >";
                btnModuleAction.onclick = () => alert(`${data.title} module initiated.`);
            }
        });
    });

    // Return to default space view
    if(btnReturn) {
        btnReturn.addEventListener('click', () => {
            viewport.style.transform = 'translate(0, 0) scale(1)';
            body.classList.remove('landed');
            planets.forEach(p => p.classList.remove('active'));
        });
    }

    // Close Gas Giant Backtest Form
    if(btnAbortConsole) {
        btnAbortConsole.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal(gasGiantConsole);
        });
    }
});