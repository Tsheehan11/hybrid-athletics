/* Accounts and sync, talking to Supabase's auth and REST endpoints directly (no SDK).
   The app works without this: when config.js is empty, configured() is false and
   everything stays on the device. */
window.HASync = (function () {
  "use strict";
  var C = window.HA_CONFIG || {};
  var URL = String(C.supabaseUrl || "").replace(/\/+$/, "");
  var KEY = String(C.supabaseKey || "");
  var SK = "ha-session-v1";
  var sess = null;
  try { sess = JSON.parse(localStorage.getItem(SK) || "null"); } catch (_) { sess = null; }

  function save() { try { if (sess) localStorage.setItem(SK, JSON.stringify(sess)); else localStorage.removeItem(SK); } catch (_) {} }
  function configured() { return !!(URL && KEY); }
  function user() { return sess && sess.user ? { id: sess.user.id, email: sess.user.email } : null; }

  function fail(code, message) { var e = new Error(message || code); e.code = code; return e; }
  function call(path, opts) {
    opts = opts || {};
    var headers = { apikey: KEY, "Content-Type": "application/json" };
    if (opts.token) headers.Authorization = "Bearer " + opts.token;
    if (opts.prefer) headers.Prefer = opts.prefer;
    return fetch(URL + path, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .catch(function () { throw fail("offline", "Can't reach the server. Check your connection."); })
      .then(function (res) {
        return res.text().then(function (txt) {
          var j = null; try { j = txt ? JSON.parse(txt) : null; } catch (_) {}
          if (!res.ok) throw fail(res.status === 401 || res.status === 403 ? "auth" : res.status === 429 ? "rate" : "server",
            (j && (j.error_description || j.msg || j.message)) || "Something went wrong (" + res.status + ").");
          return j;
        });
      });
  }
  function setSess(j) {
    sess = { access_token: j.access_token, refresh_token: j.refresh_token,
      expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000,
      user: { id: j.user.id, email: j.user.email } };
    save();
  }
  function signIn(email, pw) {
    return call("/auth/v1/token?grant_type=password", { method: "POST", body: { email: email, password: pw } })
      .then(function (j) { setSess(j); return user(); });
  }
  /* Resolves {user} when signed in straight away, or {confirm:true} when the project asks for email confirmation first. */
  function signUp(email, pw) {
    return call("/auth/v1/signup", { method: "POST", body: { email: email, password: pw } })
      .then(function (j) { if (j && j.access_token) { setSess(j); return { user: user() }; } return { confirm: true }; });
  }
  function signOut() {
    var t = sess && sess.access_token; sess = null; save();
    if (t) call("/auth/v1/logout", { method: "POST", token: t }).catch(function () {});
  }
  var refreshing = null;
  function token() {
    if (!sess) return Promise.reject(fail("auth", "Sign in again."));
    if (Date.now() < sess.expires_at - 60000) return Promise.resolve(sess.access_token);
    if (!refreshing) refreshing = call("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: sess.refresh_token } })
      .then(function (j) { setSess(j); refreshing = null; return sess.access_token; },
        function (err) { refreshing = null; if (err.code === "auth") { sess = null; save(); } throw err; });
    return refreshing;
  }
  /* Every document this account has: [{id, data, updated_ms}] */
  function pull() {
    return token().then(function (t) { return call("/rest/v1/docs?select=id,data,updated_ms", { token: t }); })
      .then(function (rows) { return rows || []; });
  }
  /* Upsert documents: [{id, data, updated_ms}] */
  function push(rows) {
    return token().then(function (t) {
      var uid = sess.user.id;
      return call("/rest/v1/docs?on_conflict=user_id,id", { method: "POST", token: t, prefer: "resolution=merge-duplicates,return=minimal",
        body: rows.map(function (r) { return { user_id: uid, id: r.id, data: r.data, updated_ms: r.updated_ms }; }) });
    });
  }
  return { configured: configured, user: user, signIn: signIn, signUp: signUp, signOut: signOut, pull: pull, push: push };
})();
