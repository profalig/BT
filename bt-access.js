/* ==========================================================================
   BarTest — who is signed in, and what they have paid for

   Shared by the marketing page and the replay terminal, which are separate
   documents on the same origin: the Supabase session lives in localStorage,
   so both read the same sign-in without asking the user twice.

   THE THREE PLANS
     machine   Backtest Machine only
     replay    BarTest Replay & Chart, in full
     full      both

   The plan is a single text column on user_profiles. It does not exist yet,
   and everything here is written so that it does not have to:

       alter table user_profiles add column plan text;

   Until that column is there, `profile.plan` reads undefined and access
   falls back to the credit balance — which is what "you can run a backtest"
   has always meant here — so nobody who has already paid loses anything.
   ========================================================================== */
window.BTAccess = (function () {
'use strict';

const SUPABASE_URL = 'https://woxswhiayrkecspebuwb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndveHN3aGlheXJrZWNzcGVidXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MTc5ODYsImV4cCI6MjEwMDk5Mzk4Nn0.faEmt5_tw6dN9Cs-pKJHa9D0yyEBbAl4oT0Y9QWYuFg';

const PLANS = {
    machine: { key: 'machine', label: 'Backtest Access', backtest: true,  replay: false },
    replay:  { key: 'replay',  label: 'Replay Access',   backtest: false, replay: true  },
    full:    { key: 'full',    label: 'Full Access',     backtest: true,  replay: true  }
};

const LOCKED = { signedIn: false, email: null, plan: null, planLabel: null,
                 credits: 0, backtest: false, replay: false, degraded: false };

let client = null;
function db() {
    if (client) return client;
    // app.js builds one for the marketing page; never make a second on a page
    // that already has it, or two clients race each other's token refresh.
    if (window.supabaseClient) { client = window.supabaseClient; return client; }
    if (window.supabase && window.supabase.createClient) {
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return client;
    }
    return null;
}

function entitle(profile, session, degraded) {
    const raw  = profile && typeof profile.plan === 'string' ? profile.plan.trim().toLowerCase() : '';
    let plan = PLANS[raw] || null;

    /* A plan that has run out is no plan. The webhook normally clears it on
       cancellation, but a webhook that never arrives — Stripe outage, the
       worker asleep, the endpoint moved — would otherwise leave someone with
       access forever. The date is the backstop; no date means no expiry. */
    const until = profile && profile.plan_expires_at;
    if (plan && until) {
        const t = Date.parse(until);
        if (isFinite(t) && t < Date.now()) plan = null;
    }
    /* Stripe says past_due or unpaid before it says cancelled. Trust it. */
    const st = profile && typeof profile.plan_status === 'string'
        ? profile.plan_status.trim().toLowerCase() : '';
    if (plan && st && st !== 'active' && st !== 'trialing') plan = null;
    const credits = profile ? (+profile.credits || 0) : 0;
    const meta = (session && session.user && session.user.user_metadata) || {};
    return {
        signedIn:  !!(session && session.user),
        email:     session && session.user ? session.user.email : null,
        userId:    session && session.user ? session.user.id : null,
        // The name lives in auth metadata, where the user is allowed to write
        // it without any table policy. The picture cannot: it is far too big
        // to sit in a JWT, so it lives in a column of its own.
        displayName: meta.display_name || null,
        avatarUrl: (profile && profile.avatar_url) || null,
        plan:      plan ? plan.key : null,
        planLabel: plan ? plan.label : null,
        credits:   credits,
        // A credit balance predates plans and still buys a backtest run.
        backtest:  plan ? plan.backtest : credits > 0,
        replay:    plan ? plan.replay : false,
        // The profile could not be read at all. Whether someone is signed in
        // comes from local storage and is always known; what they have paid
        // for needs the network. Locking a paying customer out because
        // Supabase blinked is worse than letting an unchecked one through a
        // paywall they could open with devtools anyway.
        degraded:  !!degraded
    };
}

function withTimeout(p, ms) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

let pending = null, cached = null;

/* Resolves to the access object. Cached, because half a dozen call sites ask
   for it on the same page load; pass true to look again after a purchase. */
function get(force) {
    if (!force && cached) return Promise.resolve(cached);
    if (!force && pending) return pending;
    const c = db();
    if (!c) return Promise.resolve(Object.assign({}, LOCKED));

    pending = (async () => {
        try {
            const { data } = await c.auth.getSession();
            const session = data && data.session;
            if (!session || !session.user) return Object.assign({}, LOCKED);
            let profile = null, degraded = false;
            try {
                const res = await withTimeout(c.from('user_profiles').select('*')
                    .eq('id', session.user.id).maybeSingle(), 7000);
                profile = res.data;
                if (res.error) degraded = true;
            } catch (e) { profile = null; degraded = true; }
            return entitle(profile, session, degraded);
        } catch (e) {
            return Object.assign({}, LOCKED);
        }
    })().then(a => { cached = a; pending = null; return a; });

    return pending;
}

/* Signing in or out anywhere on the origin invalidates what we hold. */
(function watch() {
    const c = db();
    if (!c || !c.auth || !c.auth.onAuthStateChange) return;
    try {
        c.auth.onAuthStateChange(() => { cached = null; pending = null; });
    } catch (e) {}
})();

return {
    get: get,
    plans: PLANS,
    forget: function () { cached = null; pending = null; },
    // The pricing table lives on the marketing page; everything that has to
    // send someone there goes through one place.
    plansUrl: function (why) { return '/?plans=1' + (why ? '&for=' + why : ''); }
};

})();
