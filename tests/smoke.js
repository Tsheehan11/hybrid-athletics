/* Smoke test: boots the real app in jsdom, with the network mocked, and walks the main paths.
   Run with: npm install && npm test */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const ROOT = path.join(__dirname, "..");

function page(config) {
  return fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
    .replace(/<link rel="stylesheet" href="styles.css">/, "")
    .replace(/<script src="([^"]+)"><\/script>/g, (m, f) => "<script>" +
      (f === "config.js" ? "window.HA_CONFIG=" + JSON.stringify(config || {}) : fs.readFileSync(path.join(ROOT, f), "utf8")) + "</script>");
}
const remote = { docs: [] };
function boot(seed, config) {
  const errors = [];
  const dom = new JSDOM(page(config), { runScripts: "dangerously", pretendToBeVisual: true, url: "https://example.test/", beforeParse(w) {
    w.scrollTo = () => {};
    if (seed) w.localStorage.setItem("cali-climb-log-v1", JSON.stringify(seed));
    w.addEventListener("error", (e) => errors.push(String(e.message)));
    w.fetch = (url, o = {}) => {
      const J = (b, st = 200) => Promise.resolve({ ok: st < 300, status: st, text: () => Promise.resolve(b == null ? "" : JSON.stringify(b)), json: () => Promise.resolve(b) });
      if (/auth\/v1\/token/.test(url)) return J({ access_token: "tok", refresh_token: "ref", expires_in: 3600, user: { id: "u1", email: "me@example.com" } });
      if (/rest\/v1\/docs\?select/.test(url)) return J(remote.docs);
      if (/rest\/v1\/docs/.test(url)) { JSON.parse(o.body).forEach((r) => { remote.docs = remote.docs.filter((x) => x.id !== r.id).concat([r]); }); return J(null, 201); }
      return J({}, 404);
    };
  } });
  const w = dom.window, doc = w.document;
  return { w, doc, errors, S: () => w.__cali.S, render: () => w.__cali.render(),
    click(sel) { const el = typeof sel === "string" ? doc.querySelector(sel) : sel; assert(el, "missing " + sel); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); },
    type(sel, v) { const el = doc.querySelector(sel); assert(el, "missing " + sel); el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); } };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const names = (a) => [...a.doc.querySelectorAll(".ex .ex-name")].map((n) => { const s = n.querySelector("select"); return s ? s.value : n.textContent; });

(async () => {
  /* a device with one logged day, so the setup wizard is skipped */
  const d = new Date(), key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const seed = { months: { ["m-" + key.slice(0, 7)]: { days: { [key]: { type: "home", tpl: "push", ex: { d1b: { name: "Push-ups", sets: [10, 9, 8], unit: "reps", tgt: { sets: 3, min: 5, max: 8 } } } } } } } };
  const reply = { mode: "changes", note: "Shorter.", changes: [{ op: "remove", target: "Table rows", why: "saves time" }, { op: "add", exercise: { name: "Dead bug", sets: 2, min: 8, max: 10, unit: "reps", perSide: true }, why: "core" }] };
  const a = boot(seed, { supabaseUrl: "https://x.supabase.co", supabaseKey: "anon" });
  await wait(400);

  /* character sheet */
  a.click('[data-act="tab"][data-v="prog"]');
  assert.strictEqual(a.doc.querySelector(".page-title").textContent, "Character sheet");
  assert(a.doc.querySelector(".radar"), "radar chart");
  const push = [...a.doc.querySelectorAll(".ab")].find((x) => /Push/.test(x.textContent));
  assert(parseFloat(push.querySelector("b").textContent) > 0, "push load counted");

  /* edit today's workout by hand: remove one, add one, logged sets stay */
  a.click('[data-act="tab"][data-v="today"]');
  a.S().view = "session"; a.S().act = "home"; a.render();
  const before = names(a);
  a.click(a.doc.querySelectorAll('[data-act="ex-del"]')[before.length - 1]);
  assert.strictEqual(names(a).length, before.length - 1);
  a.type("#addx-name", "Hollow hold"); a.click('[data-act="ex-add"]');
  assert(names(a).includes("Hollow hold"));
  const day = () => a.S().months["m-" + key.slice(0, 7)].days[key];
  assert.strictEqual(JSON.stringify(day().ex.d1b.sets), "[10,9,8]", "logged sets survive an edit");

  /* helper: writes a request for Claude, reads the pasted reply, lists the changes, applies them */
  assert(!a.doc.getElementById("ai-q") || a.doc.querySelector('[data-act="chg"]').getAttribute("aria-expanded") === "true");
  if (!a.doc.getElementById("ai-q")) a.click('[data-act="chg"]');
  a.type("#ai-q", "only 20 minutes"); a.click('[data-act="ai-go"]');
  const link = a.doc.querySelector('a[href^="https://claude.ai/new?q="]');
  assert(link && /only%2020%20minutes/.test(link.href), "request link carries the prompt");
  a.type("#ai-reply", "nonsense"); a.click('[data-act="ai-read"]');
  assert(/doesn't look like/.test(a.doc.querySelector(".ai-err").textContent));
  a.type("#ai-reply", "Here you go:\n```json\n" + JSON.stringify(reply) + "\n```"); a.click('[data-act="ai-read"]');
  assert.strictEqual(a.doc.querySelectorAll(".nm.prop").length, 2, "two proposed changes");
  a.click('[data-act="ai-apply"]');
  assert(names(a).includes("Dead bug") && !names(a).includes("Table rows"));

  /* account: sign in on this device uploads; a fresh device signs in and gets the logs */
  a.S().view = "today"; a.render(); a.click('[data-act="tab"][data-v="plan"]');
  a.type("#sy-email", "me@example.com"); a.type("#sy-pw", "password1"); a.click('[data-act="sy-in"]'); await wait(900);
  assert(remote.docs.some((r) => r.id === "m-" + key.slice(0, 7) && r.user_id === "u1"), "logs uploaded");
  const b = boot(null, { supabaseUrl: "https://x.supabase.co", supabaseKey: "anon" });
  await wait(400);
  b.click('[data-act="su-return"]'); b.type("#sy-email", "me@example.com"); b.type("#sy-pw", "password1"); b.click('[data-act="sy-in"]'); await wait(400);
  assert(!b.S().setup, "wizard closes once logs arrive");
  assert(b.S().months["m-" + key.slice(0, 7)].days[key], "second device has the day");

  /* no account configured: still works, account card says so */
  const c = boot(seed, {}); await wait(400);
  c.click('[data-act="tab"][data-v="plan"]');
  assert(/aren't switched on/.test(c.doc.body.textContent));

  assert.strictEqual(JSON.stringify([a.errors, b.errors, c.errors]), "[[],[],[]]");
  console.log("ok: sheet, manual edit, helper, sync, local-only");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
