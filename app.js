// SUPABASE AUTHENTICATION STATE LISTENER
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            if (session && session.user) {
                const user = session.user;
                const displayName = user.user_metadata?.display_name || user.email.split('@')[0];
                
                // Fetch updated credits for layout
                const userProfile = await fetchOrCreateUserProfile(user);
                const userCredits = userProfile ? userProfile.credits : 0;
                
                if (authCorner) {
                    if (window.innerWidth <= 768) {
                        // MOBILE: NEW COMPACT HUD LAYOUT
                        authCorner.innerHTML = `
                            <div class="hud-bar mobile-only">
                                <div class="hud-slot subs" id="nav-subscription-btn">
                                    <div class="hud-icon-box"><i class="fa-solid fa-gem"></i></div>
                                    <div class="hud-label-box"><span>SUBS</span></div>
                                </div>
                                <div class="hud-slot reports" id="my-reports-btn">
                                    <div class="hud-icon-box"><i class="fa-solid fa-folder-open"></i></div>
                                    <div class="hud-label-box"><span>REPORTS</span></div>
                                </div>
                                <div class="hud-slot agent">
                                    <div class="hud-icon-box"><span class="status-dot"></span><i class="fa-solid fa-user-astronaut"></i></div>
                                    <div class="hud-label-box"><span>${displayName.toUpperCase()}</span></div>
                                </div>
                                <div class="hud-slot credits">
                                    <div class="hud-icon-box"><i class="fa-solid fa-bolt"></i></div>
                                    <div class="hud-label-box"><span>CR: ${userCredits}</span></div>
                                </div>
                                <div class="hud-slot logout" id="signout-btn">
                                    <div class="hud-icon-box"><i class="fa-solid fa-power-off"></i></div>
                                    <div class="hud-label-box"><span>LOGOUT</span></div>
                                </div>
                            </div>
                        `;
                    } else {
                        // PC: ORIGINAL DOCK LAYOUT (Leaves styling from style.css completely intact)
                        authCorner.innerHTML = `
                            <div class="dock-content pc-only">
                                <div class="user-badge">
                                    <span class="user-status-dot"></span>
                                    AGENT: ${displayName.toUpperCase()}
                                </div>
                                <div class="dock-divider"></div>
                                <div class="credit-badge">
                                    CREDITS: ${userCredits}
                                </div>
                                <div class="dock-divider"></div>
                                <button class="auth-btn sub-nav-btn" id="my-sub-btn">
                                    <i class="fa-solid fa-gem"></i> SUBS
                                </button>
                                <button class="auth-btn" id="my-reports-btn">
                                    <i class="fa-solid fa-folder-open"></i> REPORTS
                                </button>
                                <button class="auth-btn logout-btn" id="signout-btn">
                                    <i class="fa-solid fa-power-off"></i>
                                </button>
                            </div>
                        `;
                    }
                    
                    // Re-bind listeners for authenticated elements
                    const newSignoutBtn = document.getElementById('signout-btn');
                    if (newSignoutBtn) newSignoutBtn.addEventListener('click', handleSignOut);
                    const mySubBtn = document.getElementById('nav-subscription-btn') || document.getElementById('my-sub-btn');
                    if (mySubBtn) mySubBtn.addEventListener('click', openSubscriptionModal);
                    const myReportsBtn = document.getElementById('my-reports-btn');
                    if (myReportsBtn) myReportsBtn.addEventListener('click', openUserReportsModal);
                }
            }
        } else if (event === 'SIGNED_OUT') {
            if (authCorner) {
                if (window.innerWidth <= 7