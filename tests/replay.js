/* Replay real logs through the suggestion engine and compare fatigue models.
   Usage: node tests/replay.js path/to/backup.json   (the file from Program → Your data → Back up)

   For each fatigue kernel (how much each earlier day's load still counts) it reports:
   A. Performance: when you repeat an exercise, does more carried-in fatigue on the muscles the
      workout trains go with worse numbers than last time? r is the correlation (more negative is
      better); skill is how much a leave-one-out straight-line fit beats guessing the average
      (above 0 means the fatigue number has real predictive value).
   B. Choice: replaying each day with only the logs before it, how often the engine's first pick
      is the workout you actually did, and that workout's average rank. This one is biased toward
      whichever engine was making the suggestions at the time, so read it as a sanity check. */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const file = process.argv[2];
if (!file) { console.error("Usage: node tests/replay.js backup.json"); process.exit(2); }
const backup = JSON.parse(fs.readFileSync(file, "utf8"));
if (!backup.program || !backup.months) { console.error("Not a Hybrid Athletics backup."); process.exit(2); }

const KERNELS = [
  ["yesterday only", [1]],
  ["current (1, 0.5)", [1, 0.5]],
  ["3 days, halving", [1, 0.5, 0.25]],
  ["5 days, halving", [1, 0.5, 0.25, 0.125, 0.0625]],
  ["7 days, slow decay", [1, 0.7, 0.5, 0.35, 0.25, 0.17, 0.12]],
];

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
  .replace(/<link rel="stylesheet" href="styles.css">/, "")
  .replace(/<script src="([^"]+)"><\/script>/g, (m, f) => "<script>" + (f === "config.js" ? "window.HA_CONFIG={}" : fs.readFileSync(path.join(ROOT, f), "utf8")) + "</script>");
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://example.test/", beforeParse(w) {
  w.scrollTo = () => {}; w.fetch = () => Promise.reject(new Error("offline"));
  w.localStorage.setItem("cali-climb-log-v1", JSON.stringify({ program: backup.program, months: backup.months }));
} });

const avg = (a) => a.reduce((p, q) => p + q, 0) / a.length;
const filled = (v) => v !== null && v !== undefined && v !== "";
function pearson(xs, ys) {
  const mx = avg(xs), my = avg(ys); let sxy = 0, sxx = 0, syy = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}
/* leave-one-out: fit y = a + b·x without point i, predict it; compare with predicting the mean of the rest */
function looSkill(xs, ys) {
  let em = 0, ef = 0;
  for (let i = 0; i < xs.length; i++) {
    const X = xs.filter((_, j) => j !== i), Y = ys.filter((_, j) => j !== i), mx = avg(X), my = avg(Y);
    let sxy = 0, sxx = 0; X.forEach((x, j) => { sxy += (x - mx) * (Y[j] - my); sxx += (x - mx) ** 2; });
    const b = sxx ? sxy / sxx : 0;
    ef += (ys[i] - (my + b * (xs[i] - mx))) ** 2; em += (ys[i] - my) ** 2;
  }
  return em ? 1 - ef / em : 0;
}

setTimeout(() => {
  const C = dom.window.__cali, E = C.engine, S = C.S, full = JSON.parse(JSON.stringify(S.months));
  const days = E.allDays().map((p) => p[0]);
  console.log(days.length + " logged days, " + days[0] + " to " + days[days.length - 1] + "\n");
  const rows = [];
  KERNELS.forEach(([name, k]) => {
    S.months = JSON.parse(JSON.stringify(full)); E.setKernel(k);
    /* A: fatigue vs repeat performance */
    const xs = [], ys = [];
    E.allDays().forEach(([d, e]) => {
      if (!E.homeDone(e) || e.min) return; const t = E.tplOf(e); if (!t || !t.load) return;
      const F = E.fatigue(d); let x = 0; for (const g in t.load) x += (F[g] || 0) * t.load[g] / 2;
      for (const id in e.ex || {}) {
        const r = e.ex[id]; if (!r || !r.name) continue;
        const cur = (r.sets || []).filter(filled).map(Number); if (!cur.length) continue;
        const prev = E.lastHome(r.name, d); if (!prev) continue;
        if ((new Date(d) - new Date(prev.d)) / 864e5 > 21) continue;
        const pv = prev.sets.filter(filled).map(Number); if (!pv.length) continue;
        xs.push(x); ys.push(Math.max(0.5, Math.min(1.5, avg(cur) / Math.max(1, avg(pv)))));
      }
    });
    /* B: would the engine have picked what was done, knowing only the past? */
    let n = 0, top = 0, rankSum = 0;
    days.forEach((d) => {
      const m = full["m-" + d.slice(0, 7)], e = m && m.days[d];
      if (!e) return;
      S.months = JSON.parse(JSON.stringify(full)); E.reset();
      if (!E.homeDone(e) || e.min) return; const t = E.tplOf(e); if (!t || String(t.id).indexOf("u-") === 0) return;
      const past = {}; for (const mk in full) { const ds = {}; for (const k2 in full[mk].days) if (k2 < d) ds[k2] = full[mk].days[k2]; if (Object.keys(ds).length) past[mk] = { days: ds }; }
      S.months = past; E.reset();
      const rank = C.suggest(d).rank || [], ids = [t.id, E.pairId(t.id)].filter(Boolean);
      const at = rank.findIndex((r) => ids.includes(r.id) || (r.from && ids.includes(r.from)));
      if (at < 0) return; n++; rankSum += at + 1; if (at === 0) top++;
    });
    rows.push({ name, pairs: xs.length, r: pearson(xs, ys), skill: xs.length > 3 ? looSkill(xs, ys) : 0, days: n, top: n ? top / n : 0, rank: n ? rankSum / n : 0 });
  });
  const f = (v, d = 2) => (v >= 0 ? " " : "") + v.toFixed(d);
  console.log("kernel                 | A: pairs    r     skill | B: days  first pick  avg rank");
  rows.forEach((r) => console.log(r.name.padEnd(22) + " | " + String(r.pairs).padStart(8) + "  " + f(r.r) + "  " + f(r.skill) + " | " + String(r.days).padStart(7) + "  " + (Math.round(r.top * 100) + "%").padStart(9) + "  " + r.rank.toFixed(2).padStart(8)));
  console.log("\nFewer than about 100 pairs, or skill within ±0.05 of the current kernel, is not enough to justify a change.");
  process.exit(0);
}, 600);
