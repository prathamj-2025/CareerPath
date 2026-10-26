/* Real accounts, through Supabase Auth's REST API (no library, so nothing extra to load).
 *
 * Only runs when /api/config returns a Supabase URL and publishable key. Otherwise the page
 * stays in the browser-only demo mode (the Claude artifact, local tests).
 *
 * The session (access + refresh token) is kept in localStorage so a returning student stays
 * signed in. Every call is guarded, because storage can be blocked.
 */
(function () {
  "use strict";
  var KEY = "cp-session";
  var cfg = null, session = null;

  function store(v) {
    try {
      if (v) window.localStorage.setItem(KEY, JSON.stringify(v)); else window.localStorage.removeItem(KEY);
    } catch (e) { /* blocked storage: signed in for this visit only */ }
  }
  function stored() {
    try { var r = window.localStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; }
  }

  /* One place that talks to Supabase. Resolves { ok, status, body }, never throws. */
  function call(path, o) {
    o = o || {};
    var h = { apikey: cfg.key, "content-type": "application/json" };
    if (o.token) h.authorization = "Bearer " + o.token;
    if (o.headers) Object.keys(o.headers).forEach(function (k) { h[k] = o.headers[k]; });
    return fetch(cfg.url + path, { method: o.method || "GET", headers: h, body: o.body ? JSON.stringify(o.body) : undefined })
      .then(function (r) {
        return r.text().then(function (t) {
          var b = null; try { b = t ? JSON.parse(t) : null; } catch (e) { b = null; }
          return { ok: r.ok, status: r.status, body: b };
        });
      })
      .catch(function () { return { ok: false, status: 0, body: null }; });
  }

  /* Plain-language messages. Supabase error codes are stable; its wording is not. */
  function explain(r) {
    var b = r.body || {}, code = b.error_code || b.code || "", msg = String(b.msg || b.message || b.error_description || "");
    if (r.status === 0) return { code: "network", text: "Could not reach the server. Check your connection and try again." };
    if (code === "invalid_credentials" || /invalid login/i.test(msg)) return { code: "invalid", text: "Wrong email or password." };
    if (code === "email_not_confirmed" || /not confirmed/i.test(msg)) return { code: "unconfirmed", text: "Please confirm your email first. We sent you a link." };
    if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || r.status === 429)
      return { code: "rate", text: "Too many attempts. Please wait a minute and try again." };
    if (code === "weak_password" || /password/i.test(msg) && /(least|weak|short)/i.test(msg))
      return { code: "weak", text: "Choose a stronger password: at least 8 characters." };
    if (code === "user_already_exists" || /already registered/i.test(msg)) return { code: "exists", text: "An account already exists for that email. Try signing in." };
    if (code === "validation_failed" || /valid email|invalid format/i.test(msg)) return { code: "email", text: "Enter a valid email address." };
    if (code === "same_password") return { code: "same", text: "Choose a password you have not used on this account before." };
    if (code === "otp_expired" || /expired/i.test(msg)) return { code: "expired", text: "That link has expired. Request a new one." };
    return { code: "other", text: "Something went wrong. Please try again." };
  }

  function expiresAt(t) { return Date.now() + (Number(t.expires_in) || 3600) * 1000; }
  function toSession(t, user) {
    return { access: t.access_token, refresh: t.refresh_token, exp: expiresAt(t), user: user || t.user || null };
  }
  function keep(s) { session = s; store(s); return s; }

  function refresh() {
    if (!session || !session.refresh) return Promise.resolve(null);
    var old = session.refresh;
    return call("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: old } }).then(function (r) {
      if (r.ok && r.body && r.body.access_token) return keep(toSession(r.body));
      if (r.status === 0) return session;                 // offline: keep what we have, try again later
      keep(null); return null;                            // refresh token revoked or expired
    });
  }

  /* A valid access token, refreshed a minute early. */
  function token() {
    if (!session) return Promise.resolve(null);
    if (session.exp - Date.now() > 60000) return Promise.resolve(session.access);
    return refresh().then(function (s) { return s ? s.access : null; });
  }

  /* The link in a confirmation or reset email returns here with the tokens in the URL fragment. */
  function readLink() {
    var h = String(window.location.hash || "").replace(/^#/, "");
    if (!h || (h.indexOf("access_token=") < 0 && h.indexOf("error") < 0)) return null;
    var p = {};
    h.split("&").forEach(function (kv) { var i = kv.indexOf("="); if (i > 0) p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, " ")); });
    try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch (e) { /* ignore */ }
    return p;
  }

  var CP_AUTH = window.CP_AUTH = {
    enabled: false,
    googleOAuth: false,

    /* Resolves { enabled, session, link } where link is "recovery", "confirmed", "error" or null. */
    init: function () {
      var timeout = new Promise(function (res) { setTimeout(function () { res(null); }, 3500); });
      var ask = fetch("/api/config").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
      return Promise.race([ask, timeout]).then(function (c) {
        if (!c || !c.supabaseUrl || !c.supabaseKey || !/^https?:$/.test(window.location.protocol)) {
          return { enabled: false, session: null, link: null, google: (c && c.googleClientId) || null };
        }
        cfg = { url: String(c.supabaseUrl).replace(/\/+$/, ""), key: c.supabaseKey };
        CP_AUTH.enabled = true; CP_AUTH.googleOAuth = !!c.googleOAuth;
        // An email link opened in a tab that already has the site open only changes the fragment: start over with it.
        window.addEventListener("hashchange", function () {
          if (/access_token=|error_code=|error=/.test(String(window.location.hash))) window.location.reload();
        });
        var link = readLink(), out = { enabled: true, session: null, link: null, linkError: "" };
        if (link && link.access_token) {
          return call("/auth/v1/user", { token: link.access_token }).then(function (r) {
            if (r.ok && r.body && r.body.id) {
              keep(toSession({ access_token: link.access_token, refresh_token: link.refresh_token, expires_in: link.expires_in }, r.body));
              out.session = session; out.link = link.type === "recovery" ? "recovery" : "confirmed";
            } else { out.link = "error"; out.linkError = explain(r).text; }
            return out;
          });
        }
        if (link && (link.error || link.error_code)) {
          out.link = "error"; out.linkError = explain({ status: 400, body: { error_code: link.error_code, msg: link.error_description } }).text;
          return out;
        }
        session = stored();
        if (!session || !session.refresh) { session = null; return out; }
        return (session.exp - Date.now() > 60000 ? Promise.resolve(session) : refresh()).then(function (s) {
          out.session = s; return out;
        });
      });
    },

    session: function () { return session; },

    signUp: function (email, password, meta) {
      return call("/auth/v1/signup", { method: "POST", body: { email: email, password: password, data: meta || {} } }).then(function (r) {
        if (!r.ok) return { error: explain(r) };
        var b = r.body || {};
        if (b.access_token) return { session: keep(toSession(b)) };           // email confirmation is switched off
        var user = b.user || b;
        // With confirmation on, signing up an address that already has an account returns a user with no identities.
        if (user && Array.isArray(user.identities) && user.identities.length === 0) return { error: { code: "exists", text: "An account already exists for that email. Try signing in." } };
        return { confirm: true };
      });
    },

    signIn: function (email, password) {
      return call("/auth/v1/token?grant_type=password", { method: "POST", body: { email: email, password: password } }).then(function (r) {
        if (!r.ok || !r.body || !r.body.access_token) return { error: explain(r) };
        return { session: keep(toSession(r.body)) };
      });
    },

    resend: function (email) {
      return call("/auth/v1/resend", { method: "POST", body: { type: "signup", email: email, options: { emailRedirectTo: window.location.origin + "/" } } })
        .then(function (r) { return r.ok ? { ok: true } : { error: explain(r) }; });
    },

    recover: function (email) {
      return call("/auth/v1/recover?redirect_to=" + encodeURIComponent(window.location.origin + "/"), { method: "POST", body: { email: email } })
        .then(function (r) { return r.ok ? { ok: true } : { error: explain(r) }; });
    },

    updatePassword: function (password) {
      return token().then(function (t) {
        if (!t) return { error: { code: "expired", text: "That link has expired. Request a new one." } };
        return call("/auth/v1/user", { method: "PUT", token: t, body: { password: password } }).then(function (r) {
          return r.ok ? { ok: true } : { error: explain(r) };
        });
      });
    },

    googleUrl: function () {
      return cfg.url + "/auth/v1/authorize?provider=google&redirect_to=" + encodeURIComponent(window.location.origin + "/");
    },

    signOut: function () {
      var t = session && session.access;
      keep(null);
      if (t) call("/auth/v1/logout", { method: "POST", token: t });          // best effort
    },

    /* The signed-in student's own profile row. */
    profile: function () {
      return token().then(function (t) {
        if (!t || !session || !session.user) return { error: { code: "expired", text: "Please sign in again." } };
        return call("/rest/v1/profiles?id=eq." + encodeURIComponent(session.user.id) + "&select=*", { token: t }).then(function (r) {
          if (!r.ok) return { error: explain(r), status: r.status };
          var row = Array.isArray(r.body) ? r.body[0] : null;
          return row ? { profile: row } : { error: { code: "missing", text: "Your profile is not ready yet. Try again in a moment." } };
        });
      });
    },

    saveProfile: function (patch) {
      return token().then(function (t) {
        if (!t || !session || !session.user) return { error: { code: "expired", text: "Please sign in again." } };
        return call("/rest/v1/profiles?id=eq." + encodeURIComponent(session.user.id), { method: "PATCH", token: t, body: patch, headers: { prefer: "return=minimal" } })
          .then(function (r) { return r.ok ? { ok: true } : { error: explain(r), status: r.status }; });
      });
    }
  };
})();
