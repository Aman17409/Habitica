/*
 * store.js — data model, local persistence, streaks and merge logic.
 *
 * The whole app state is one plain object, shaped exactly like the JSON file
 * we keep in Google Drive:
 *
 *   {
 *     schemaVersion: 1,
 *     app: "habit-tracker",
 *     updatedAt: "2026-10-25T09:30:00+05:30",
 *     habits: [ { id, name, type, color, order, archived, createdAt } ],
 *     entries: { "<habitId>": { "<YYYY-MM-DD>": { done: true, note: "" } } }
 *   }
 *
 * A "tick" habit is just done:true for a date. Notes live beside the tick,
 * per habit per day. Nothing here touches the network — sync.js does that.
 */

export const STORAGE_KEY = 'habit-tracker-state-v1';

/* ---------- date helpers (all local time, never UTC) ---------- */

export function todayISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Monday-first index for a date (0 = Monday ... 6 = Sunday). */
export function mondayIndex(date) {
  return (date.getDay() + 6) % 7;
}

export function uid() {
  return 'h' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

/* ---------- state construction ---------- */

export function emptyState() {
  return {
    schemaVersion: 1,
    app: 'habit-tracker',
    updatedAt: new Date().toISOString(),
    habits: [],
    entries: {},
  };
}

const SEEDS = [
  { name: 'Wake up at 8', color: '#8b7fd4' },
  { name: 'Sleep at 2', color: '#7fb0d4' },
  { name: 'Journal your day', color: '#c78fb4' },
];

export function seedState() {
  const s = emptyState();
  SEEDS.forEach((seed, i) => {
    s.habits.push({
      id: uid(),
      name: seed.name,
      type: 'tick',
      color: seed.color,
      order: i + 1,
      archived: false,
      createdAt: todayISO(),
    });
  });
  return s;
}

/* ---------- local persistence ---------- */

export function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalize(JSON.parse(raw));
  } catch (err) {
    console.warn('Could not read local state:', err);
    return null;
  }
}

export function saveLocal(state) {
  state.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Could not write local state:', err);
  }
  return state;
}

function normalize(s) {
  s = s || {};
  s.habits = Array.isArray(s.habits) ? s.habits : [];
  s.entries = s.entries && typeof s.entries === 'object' ? s.entries : {};
  s.schemaVersion = s.schemaVersion || 1;
  s.app = s.app || 'habit-tracker';
  return s;
}

/* ---------- habit operations ---------- */

export function addHabit(state, name, color) {
  const palette = ['#8b7fd4', '#7fb0d4', '#c78fb4', '#86c7a8', '#d4b07f', '#9fa8d4'];
  state.habits.push({
    id: uid(),
    name: name.trim(),
    type: 'tick',
    color: color || palette[state.habits.length % palette.length],
    order: state.habits.length + 1,
    archived: false,
    createdAt: todayISO(),
  });
  return state;
}

export function removeHabit(state, id) {
  state.habits = state.habits.filter((h) => h.id !== id);
  delete state.entries[id];
  return state;
}

export function updateHabit(state, id, patch) {
  const h = state.habits.find((x) => x.id === id);
  if (h) Object.assign(h, patch);
  return state;
}

export function moveHabit(state, id, delta) {
  const ordered = sortedHabits(state);
  const i = ordered.findIndex((h) => h.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ordered.length) return state;
  const tmp = ordered[i];
  ordered[i] = ordered[j];
  ordered[j] = tmp;
  ordered.forEach((h, idx) => { h.order = idx + 1; });
  return state;
}

export function sortedHabits(state) {
  return [...state.habits].sort((a, b) => (a.order || 0) - (b.order || 0));
}

/* ---------- day operations ---------- */

export function isDone(state, habitId, date) {
  const e = state.entries[habitId] && state.entries[habitId][date];
  return !!(e && e.done);
}

export function toggleDay(state, habitId, date) {
  if (!state.entries[habitId]) state.entries[habitId] = {};
  const cur = state.entries[habitId][date];
  if (cur && cur.done) {
    if (cur.note) state.entries[habitId][date] = { done: false, note: cur.note };
    else delete state.entries[habitId][date];
  } else {
    state.entries[habitId][date] = { done: true, note: (cur && cur.note) || '' };
  }
  return state;
}

export function getNote(state, habitId, date) {
  const e = state.entries[habitId] && state.entries[habitId][date];
  return e ? (e.note || '') : '';
}

export function setNote(state, habitId, date, note) {
  if (!state.entries[habitId]) state.entries[habitId] = {};
  const cur = state.entries[habitId][date] || { done: false, note: '' };
  cur.note = note;
  if (!cur.done && !note) delete state.entries[habitId][date];
  else state.entries[habitId][date] = cur;
  return state;
}

/* ---------- streaks ---------- */

/** Consecutive completed days ending today (or yesterday, if today is not yet done). */
export function currentStreak(state, habitId) {
  let count = 0;
  let d = new Date();
  if (!isDone(state, habitId, todayISO(d))) d = addDays(d, -1);
  while (isDone(state, habitId, todayISO(d))) {
    count += 1;
    d = addDays(d, -1);
  }
  return count;
}

export function bestStreak(state, habitId) {
  const days = Object.keys(state.entries[habitId] || {})
    .filter((k) => state.entries[habitId][k].done)
    .sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const day of days) {
    if (prev && (parseISO(day) - parseISO(prev)) === 86400000) run += 1;
    else run = 1;
    if (run > best) best = run;
    prev = day;
  }
  return best;
}

export function completionRate(state, habitId, days = 30) {
  let done = 0;
  let d = new Date();
  for (let i = 0; i < days; i += 1) {
    if (isDone(state, habitId, todayISO(d))) done += 1;
    d = addDays(d, -1);
  }
  return Math.round((done / days) * 100);
}

/* ---------- merge (used by sync) ----------
 * Ticks are a set of dates, so two devices merge as a safe union:
 * a day is done if either side says so; notes are kept if either side has one.
 * Habit definitions are keyed by id, later list wins on name/colour clashes.
 */
export function mergeStates(a, b) {
  a = normalize(a || emptyState());
  b = normalize(b || emptyState());
  const out = emptyState();

  const habits = new Map();
  [...a.habits, ...b.habits].forEach((h) => habits.set(h.id, h));
  out.habits = [...habits.values()].sort((x, y) => (x.order || 0) - (y.order || 0));

  const ids = new Set([...Object.keys(a.entries), ...Object.keys(b.entries)]);
  ids.forEach((id) => {
    const da = a.entries[id] || {};
    const db = b.entries[id] || {};
    const days = new Set([...Object.keys(da), ...Object.keys(db)]);
    const merged = {};
    days.forEach((day) => {
      const ea = da[day];
      const eb = db[day];
      const done = !!(ea && ea.done) || !!(eb && eb.done);
      const note = (ea && ea.note) || (eb && eb.note) || '';
      if (done || note) merged[day] = { done, note };
    });
    if (Object.keys(merged).length) out.entries[id] = merged;
  });

  out.updatedAt = new Date().toISOString();
  return out;
}
