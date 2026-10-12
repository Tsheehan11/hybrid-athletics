# Hybrid Athletics

**Try it:** [tsheehan11.github.io/hybrid-athletics](https://tsheehan11.github.io/hybrid-athletics/)

A phone-first training tracker for people who do more than one kind of training. It covers bodyweight work at home, gym sessions and up to ten sports (climbing, running, cycling, swimming, field, court, racket, hockey, martial arts, skiing). Fatigue is shared across all of them, so a hard climbing day changes what it suggests in the gym the next day, and the reverse.

It started as *Cali & Climb Log*, a calisthenics + climbing log for one person. It is now a general multi-sport planner with a setup wizard, adaptive scheduling and on-device learning.

- [What it does](#what-it-does)
- [Current implementation](#current-implementation)
- [How suggestions work](#how-suggestions-work)
- [How learning works](#how-learning-works)
- [Timing model](#timing-model)
- [Research basis](#research-basis)
- [Known limitations](#known-limitations)
- [Roadmap: from artifact to app](#roadmap-from-artifact-to-app)

---

## What it does

**Setup.** Before anything else, a short wizard asks for:

- sports and activities, plus experience with each
- for each sport, whether to **improve at it** (sport-specific training) or **train around it** (keep it fresh and cover what it doesn't)
- training experience
- height, weight and gender
- workouts per week and session length
- where you train: home, gym or both, and what equipment you have (pull-up bar, bands, hangboard, weights)
- a short description of your goals, in your own words

From that it builds:

- a set of home workouts
- a set of gym workouts, each with a home version so a no-gym day never breaks the plan
- sport-specific workouts
- a daily checklist
- a starting week

**Set week or flow.** You choose one of two modes.

- **Set week:** the starting plan pins workouts and fixed sport practices to weekdays. As you log, real behaviour takes over from the plan.
- **Flow:** no weekdays at all. It looks at the last 7 days and how often you usually do each sport.

**Today.** One merged list shows the suggested home workout, the suggested gym workout and a verdict for each sport ("good day", "keep it easy", "skip"), each with a reason. Workouts open on their own page.

**Workout pages.** Each workout page has:

- a time estimate
- a timer and a hold stopwatch
- last-time numbers in each set box
- version ladders: easier and harder versions for every exercise
- rep feedback: move up or down a version
- weight progression for gym lifts
- a how-to guide for every exercise
- a warm-up specific to your sport, shown only on the sport page

**Adjust this workout.** Type something like "only 20 minutes" or "no pull-up bar". Claude rewrites that day's workout using the viewer's own Claude account. You can undo, or keep it as a saved template.

**Other pages.** There are also pages for:

- calendar, progress charts and a "ready to level up" list
- the program editor
- "What it has learned", which explains what the app has learned so far
- backup and restore

---

## Current implementation

### Shape of the code

| | |
| --- | --- |
| Delivery | A single self-contained `index.html` (about 300 KB): vanilla JS in one IIFE, no build step and no dependencies |
| Main host | A Claude artifact (claude.ai). The same file also runs as a plain static page (GitHub Pages or opened locally) |
| Rendering | HTML is built as strings and `render()` redraws the view. Event delegation goes through `data-act` / `data-ch` / `data-in` attributes |
| State | `S.program` (profile, templates, week plan, settings) and `S.months` (logs). Derived caches (`HC` history, `SC` suggestions, `LC` learning, `HB` habits) are cleared whenever anything changes |

### Main parts of `index.html`

| Area | Functions |
| --- | --- |
| Exercise library | `rawLib`, `libById`, `resolveTpl(t, kit, P, maxEx, isGym)`, `homeSub` (swaps a gym exercise for a home one based on your kit), `ADDONS` / `ADD_ON` / `addAddons` (sport add-ons) |
| Program generation | `defaultProgram`, `buildProgram(P)`, `planWeek`, `SPORT_TPL` (which templates serve each sport: `h` home, `g` gym, `around`, `opt`) |
| Daily engine | `dayLoad`, `suggest(d)`, `sportPriority`, `sportAdvice`, `whereFor`, `sportGap`, `sportLikely` |
| Learning | `learn()`, `habits()` / `trust` / `sportProb` / `workoutProb`, `lastVersion` |
| Timing | `restSec`, `exSec`, `tplEstMin`, `capByTime`, `fitPlan` |
| Storage | `initStore`, `persist`, `localLoad`, `dataCard` / `bkApply` (backup and restore), `libUpdate` (library upgrades, `LIB_V = 4`) |
| AI adjust | `initAI`, `aiRun`, `aiApply` / `aiUndo` / `aiKeep` |

### Storage

| Where you open it | Where logs are saved |
| --- | --- |
| The Claude artifact link, as the owner or anyone it's shared with who can edit | The artifact's per-user database (`db` capability). Private to that Claude account and synced across their devices |
| The artifact link, view-only | Browser `localStorage` on that device, with a notice that it's local only |
| This repo's `index.html` (locally or on GitHub Pages) | That browser's `localStorage` (key `cali-climb-log-v1`) |

There are two kinds of document:

- `program`: one document holding the profile, templates, week plan and settings.
- `m-YYYY-MM`: one document per month, shaped `{ days: { "YYYY-MM-DD": entry } }`.

A day `entry` holds:

- `where`: home or gym
- `ex`: home sets, keyed by exercise id
- `gym`: gym lifts, each with `ref`, `name` and `sets[{w, r}]`
- `type`, `sx` and `also`: sport sessions, with min, dist, grade, effort and notes
- `sessBy`: timers
- `rate`: session effort (easy, normal or hard)
- `sug`: which workouts were suggested
- `pin`: the template pinned when a workout was opened

Backups are plain JSON shaped `{ app: "hybrid-athletics", v: 1, program, months }`. Restore can either merge or replace.

Runtime capabilities used in the artifact:

- `db`: per-user documents
- `user`: viewer id and write permission
- `sample`: the AI adjust box

---

## How suggestions work

Each template has:

- a **kind**: strength, skill, conditioning, light or recovery
- a **load** on each muscle group: push, pull, legs, core, grip, fingers or wrists

Each sport has a load too. For example, climbing is pull 2, fingers 2, grip 1, core 1, wrists 1.

**Daily load.** `dayLoad(entry)` sums a day's load. Each session is scaled by its effort rating: easy ×0.6, normal ×1, hard ×1.3.

**Fatigue.** For day *d*, fatigue on muscle group *g* is:

```
F[g] = ( load(d−1)[g] + 0.5 · load(d−2)[g] ) · recoveryMultiplier[g]     // learned, see below
```

**Scoring.** Every template is scored, and **the lowest score wins**:

```
score(t) = gymMul · ( Σg F[g]·t.load[g]  +  overlap(t.load, tomorrowSportLoad)/gymMul )
         − min(daysSinceDone, 8)                              // rotation: stale workouts come back
         + kindBase                                           // strength 0, skill/cond 1, light 4, recovery 6
         + contextAdjust                                      // see below
         + 10 if the same workout was done yesterday
         + weekdayPlanBias                                    // set-week only; fades as real habits are learned
         − 1.5 · preference[t]                                // learned, −1..1
         − sportPriorityBonus                                 // sport-specific work not yet done this week
```

**Context.**

- **tired** means 3 or more hard days in a row, 6 or more active days, or the weekly target already met. Recovery gets −9, light gets −4, and strength or conditioning gets +3.
- **behind** means the week is short on workouts. Recovery gets +4.
- **Tomorrow's sport** is predicted from the plan at first and from real logs later. Its load counts against templates that would tire the same muscles. "Improve at" sports count at 0.4 of their load and "train around" sports at 0.8.
- **Sport priority:**
  - Sport-specific ("improve at") templates get a bonus of up to 3 until they've been done twice in the last 7 days.
  - Templates that cover what a "train around" sport misses get +2 until they've been done once.
- **Gym:** gym templates are scored the same way with `gymMul = 1.5`, since gym sessions are heavier.

**Sport verdicts.** `sportAdvice` applies hard rules first:

- No climbing the day after a climb, unless you have 1 or more years of experience, in which case it says "keep it easy".
- A day off after other hard sports.
- An easy session after a heavy day on the same muscles.

Then it compares this week's count with the usual count, and says whether a session is due.

**Where today.** `whereFor`:

- uses whatever you picked;
- otherwise, defaults to home if 25% or fewer of your recent sessions (by weekday in set-week mode) were at the gym.

On a home day, the gym rotation's turn is done as its home version.

**Starting week.** `planWeek` is a greedy planner:

- It picks the N training days, avoiding sport days (a heavier penalty for "train around" sports).
- It avoids back-to-back training days and the day before a hard sport.
- It assigns templates by minimising repeats and overlap with the next day's sport and the previous workout.
- It alternates home and gym when you have both.

---

## How learning works

Everything is **recomputed from the logs** each time (`learn()`, cached until data changes). There is no hidden model state, so every device gives the same answer and correcting a log fixes what the app learned. Each learner starts from a sensible prior and shrinks toward your data as evidence builds.

| What | Signal | Model | Prior and strength |
| --- | --- | --- | --- |
| **Pace** | Timed sessions: actual minutes ÷ estimate for the sets actually logged (ratios from 0.4 to 2.5, last 10) | `pace = (3·1 + Σ r) / (3 + n)`, a shrunk mean | 1.0, worth 3 sessions |
| **Preferences** | `entry.sug` against what was actually done: +1 if you took the suggestion; −1 to the suggestion and +1 to your pick if you swapped | `pref = clamp(Σ / (count + 2), −1, 1)` | 0, worth 2 observations |
| **Recovery** | For each repeated exercise (last done within 21 days, same weight for gym lifts): y = baseline ratio − (today ÷ last time), and x[g] = prior fatigue on g × the template's load on g ÷ 2 | One ridge regression per group: `w = (λ·w0 + Σxy)/(λ + Σx²)`, with multiplier `w/w0` clamped to 0.6–1.8 | w0 = 0.06, λ = 6; stays 1.0 until 4 or more samples |
| **Weekday habits** (set week) | Did you train or do each sport on each weekday, over up to 6 weeks | `p = (1−w)·plan + w·observedRate`, with `w = min(1, weekdaysSeen/4)` | The setup plan; it fully hands over after 4 of each weekday |
| **Sport rhythm** (flow) | Gaps between sessions over 60 days | `gap = (1−w)·(7/perWeek) + w·meanGap`, with `w = min(1, gaps/4)` | The frequency you stated |
| **Home or gym** | The share of recent sessions at the gym | A threshold (25% or less means default to home) | None |
| **Exercise version** | The last version logged on each exercise ladder | The most recent one wins | The template's default |
| **Effort** | The easy / normal / hard rating on each session | Scales that day's load (0.6, 1, 1.3) | Normal |

Learned values feed back into the app:

- **Pace** scales every time estimate and decides which exercises are marked "if you have time".
- **Preferences** shift the score by up to ±1.5.
- **Recovery multipliers** scale `F[g]`. For example, if your push numbers drop more after a push day than average, push fatigue counts for more and push workouts get spread further apart.
- **Habits and rhythm** set "tomorrow's sport", "missed yesterday, move it to today" and whether a sport is due.

The **What it has learned** card shows each one in plain language with its sample count.

---

## Timing model

```
restSec(r)  = parsed from the rest text ("90 s", "2–3 min" → midpoint); 0 for supersets; default 60 s
exSec(x)    = setup (45 s home / 75 s gym)
            + sets · (work · sides + 10 s if per-side)
            + (sets − 1) · restSec
work        = mid-range hold (s) for timed exercises, or mid-range reps × tempo (3 s/rep home, 4 s/rep gym)
estimate    = warm-up (5 min home / 7 min gym / 2 min with no listed warm-up) + Σ exSec        // × learned pace
```

**Trimming to time.**

- At build time, `capByTime` drops exercises until the estimate fits your session length. It drops the highest `pri` first (the lowest-priority exercises) and keeps at least 3.
- On the day, `fitPlan` uses the pace-adjusted estimate. Instead of deleting exercises, it marks the lowest-priority ones as "if you have time".

---

## Research basis

The templates follow a review of the strength and conditioning literature for each sport (summarised in the project notes). Some examples:

- **Climbing:** max hangs and finger work only after about 1 year of climbing; antagonist and shoulder work to train around climbing; no finger load the day after a climb for newer climbers.
- **Running and cycling:** heavy strength work plus plyometrics for running economy; bent-knee calf work for runners; hip flexor work for cyclists.
- **Field, court and hockey:** Nordic hamstring curls, Copenhagen adductions and FIFA 11+ style injury prevention; landing mechanics and calf/ankle work for court sports.
- **Swimming and racket sports:** rotator cuff and scapular work (external rotation, Y-T-W).
- **Martial arts:** neck isometrics, adductors and grip.
- **General:** two or more sessions per muscle group per week; rep ranges matched to the goal; volume capped for beginners.

Sport add-ons (`ADDONS`) attach at most 2 of these extras to a general workout, and only to workouts where they fit. Upper-body extras go on upper-body days and leg extras on leg days.

---

## Known limitations

- **Learning is per person only.** Every user starts from the same hand-set priors (pace 1.0, w0 = 0.06, λ = 6, trust after 4 weeks) that were never fitted to real data.
- **Recovery is linear, with a 2-day window.** It ignores longer fatigue (accumulated weeks) and how groups interact.
- **Preferences ignore context.** The app can't learn "swaps push for legs only on Mondays" or "skips gym when tired".
- **Suggestion logging is too thin to evaluate.** It doesn't record the scores or alternatives at the time of a suggestion, so there's no way to measure later whether a change made suggestions better.
- **Data stays inside each Claude account.** The artifact's database can't be queried across users, so nothing can be learned across people.
- **The AI adjust box needs a Claude account.** View-only and GitHub Pages visitors don't get it.
- **One 300 KB file** is hard to test and extend: the library, engine, learning and UI are all mixed together.

---

## Roadmap: from artifact to app

### Phase 1: Standalone web app

The goal is the same experience with real accounts, offline use, and data you can query.

- **Split the code into modules**, using TypeScript and Vite:
  - `library/`: exercises, templates, sport add-ons and guides, as data instead of code.
  - `engine/`: `dayLoad`, scoring, `planWeek`, timing. These are pure functions with unit tests. The jsdom checks already used during development become the test suite.
  - `learning/`: today's learners, behind one interface (`fit(logs) → params`, `predict(params, context)`).
  - `ui/`: a component framework such as Preact or Svelte, keeping the current look.
- **Offline first:**
  - a PWA with IndexedDB as the local store, synced to the backend when online
  - logging in the gym must never wait on the network
- **Backend:**
  - Postgres with auth, for example Supabase (Postgres, auth and row-level security in one service)
  - static hosting on GitHub Pages, Cloudflare Pages or Vercel
- **A real schema** in place of month blobs: `users`, `profiles`, `templates`, `sessions`, `sets`, `sport_sessions`, `ratings`, plus an append-only `suggestion_events` table. That last table makes every later phase possible.
- **Log every suggestion**, with:
  - the context features (fatigue vector, tired/behind, predicted tomorrow, where)
  - every candidate's score
  - the probability of showing each option
  - the outcome: taken, swapped, skipped, plus effort and performance afterwards
- **Migration:** use the existing backup format (`hybrid-athletics` v1). Export from the artifact, import into the app, and have the importer convert the month blobs into rows.
- **AI adjust** moves to a server endpoint that calls the Claude API, rate-limited per user, so it works for everyone and not only Claude users.

### Phase 2: Learning from everyone's data, with consent

The goal is that new users start from what worked for people like them, not from guessed constants.

- **Consent and privacy first:**
  - pooled learning is opt-in
  - the pooled data keeps only coarse profile buckets and training data; no free text and no exact height or weight
  - full export and delete
  - a cohort is only used when it has at least k users
  - a clear privacy page
- **Population priors by cohort** (sport × experience × home/gym × goal), using empirical Bayes or hierarchical models:
  - **pace:** per-exercise time-per-set and transition times from real timers, replacing the 45/75 s and 3/4 s/rep constants
  - **recovery:** each group's prior weight `w0` and its strength `λ`, fitted from everyone's before/after performance; each user then shrinks from their cohort's mean
  - **habit trust:** how many weeks of data it really takes before observed behaviour predicts better than the plan
- **Library tuning** from the pooled data:
  - which progressions people stall on, to add rungs or change rep ranges
  - which templates get swapped most, to fix or replace them
  - which add-ons get skipped
- **Better default plans:** start new users on the starting plans that similar users actually kept up with.

### Phase 3: More advanced learning

The goal is models that capture longer-term fatigue, context and progression, without giving up the hard safety rules or the plain-language "why".

1. **Fitness-fatigue model per muscle group.** Use a Banister-style impulse-response model: exponentially decaying fatigue with per-group, per-user time constants learned from performance. This replaces the fixed 1-day/0.5-day window and captures fatigue that builds over weeks.
2. **Performance prediction.** Predict the next session's reps or load from recent history plus fatigue, for example a hierarchical model with an estimated 1RM or rep-max curve. Use it for autoregulated targets ("today: 3×7 at 60 kg") and to flag a stall or deload before it happens.
3. **Contextual bandit for suggestions.** Keep today's score as the prior mean and learn corrections with Thompson sampling or LinUCB over context features. The reward combines the suggestion being taken, the session being finished, the effort rating and performance afterwards. Logged probabilities make off-policy evaluation possible before shipping a policy.
4. **Adherence model.** Use logistic regression, then gradient boosting, to predict the probability of training or doing each sport on a given day. It would use weekday, streaks, recent load, how far through the week you are, and optionally the calendar. This replaces the per-weekday blend and drives smarter make-up suggestions.
5. **Periodisation.** Plan blocks such as accumulation and intensification, and trigger deloads from the trend in predicted performance instead of the calendar.
6. **Optional wearable signals** (Apple Health, Google Fit, Garmin), with consent: sleep, HRV and resting heart rate as extra readiness inputs to the fatigue model.

**Guardrails that stay outside the learners:**

- the finger-training gate
- rest after hard sports
- beginner volume caps
- clamps on all learned multipliers

Models can reorder within safe options but never break a safety rule.

**Evaluation before shipping any model:**

- replay historical logs and compare against the current engine
- time-estimate error (MAE)
- calibration of acceptance predictions
- rep and load prediction error
- the share of suggestions taken
- 4-week adherence

Ship only what beats the baseline. Keep the "What it has learned" card honest by reporting each model's sample size and uncertainty.

### Milestones

- [ ] Split `index.html` into library / engine / learning / ui modules with tests (no behaviour change)
- [ ] PWA with IndexedDB storage and backup import
- [ ] Accounts, Postgres schema and sync
- [ ] Suggestion event logging (context, candidates, probabilities, outcome)
- [ ] Server-side AI adjust
- [ ] Consent flow and privacy page
- [ ] Cohort priors for pace and recovery (empirical Bayes)
- [ ] Banister fitness-fatigue per muscle group
- [ ] Performance prediction and autoregulated targets
- [ ] Contextual bandit with off-policy evaluation
- [ ] Adherence model
- [ ] Wearable readiness (optional)

---

## Running it

It's one static file with no build step. Open `index.html` in a browser, or turn on GitHub Pages for this repo (Settings → Pages → deploy from `main`, root). Outside the Claude artifact, data stays in that browser's `localStorage`. Use **Back up** under **Your data** on the program page to move it between devices.

## License

[MIT](LICENSE). Use it, fork it, build on it.
