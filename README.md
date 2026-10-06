# Cali & Climb Log

A phone-first tracker for a bodyweight calisthenics routine built around climbing, gym days and runs.

## What it does

- **Today**: pick Home, Gym, Climb or Rest, tick off a run, and work through the daily checklist.
- **Suggestions**: each day suggests which home workout to do next, whether it's a good day to climb or run, and when to back off.
- **Workout rotation**: the suggested workout depends on what you did the last two days, so muscle groups get rest and every workout comes around.
- **Workout timer**: starts on your first logged set (or tap Start). Finish stops it and confirms the session is saved.
- **Last-time numbers**: each set box shows what you did last time, so progressive overload is built in.
- **Easier and harder versions**: every exercise has a ladder of versions. Pick one from the dropdown.
- **Rep feedback**: as you log sets, it tells you when you're above the range (move to the next harder version) or below it (drop to the next easier one).
- **Gym workouts**: four climber-friendly templates (Lower + Core, Push + Shoulders, Pull + Grip, Full Body). Tapping Gym loads the suggested one, with target sets and reps, last time's weights and the suggested next weight.
- **Weight progression**: hit the top of the rep range on every set and it tells you the next weight (+5 lb upper, +10 lb lower by default). Fall below the range and it suggests dropping about 10%.
- **Daily checklist**: every-day essentials (wrists, scapular push-ups, hollow hold, side plank, deep squat) plus that workout's stretches.
- **Calendar**: activity per day, checklist streak, training days and runs this week.
- **Progress**: trend line per exercise and a "ready to level up" list.
- **Program editor**: edit every home and gym workout, weight jumps, the essentials and the gym weight unit.

## How the suggestions work

Each workout has a type (strength, skill, light, recovery) and a load on muscle groups (push, pull, legs, core, grip, wrists). Climbing counts as heavy pull and grip, gym sessions as moderate full body, and runs as light legs.

For a given day the app adds up yesterday's load plus half of the day before's, then scores every workout:

```
score = overlap with recent load
      - days since you last did it (capped at 8)
      + type penalty (strength 0, skill 1, light 4, recovery 6)
      + 10 if you did the same workout yesterday
```

The lowest score wins. After 3 hard days in a row, or 6 active days in a row, recovery and light workouts are favoured instead.

- **Climbing**: skipped the day after a climb; easier problems suggested after a gym day.
- **Gym**: the same overlap scoring over the gym templates, so the day after climbing it avoids Pull + Grip, and the day after a push session it avoids pushing.
- **Running**: easy only after a heavy leg day, a day off suggested after a run, capped at 3 a week while building up.

## Where data is saved

| Where you open it | Where logs are saved |
| --- | --- |
| The Claude artifact link | Your Claude account, private to you, synced across devices |
| This repo's `index.html` (locally or on GitHub Pages) | That browser's `localStorage` only, on that device |

The two don't sync with each other. Use the artifact link as the main tracker. Logs are grouped one document per month, and the program is a single document.

## Running it

It's a single static file with no build step. Open `index.html` in a browser, or turn on GitHub Pages for this repo (Settings → Pages → deploy from `main`, root).
