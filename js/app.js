/*
 * app.js — the main screen: today's habits, the week heatmap, notes,
 * and the Google Drive sync controls.
 */

import {
  loadLocal, saveLocal, seedState,
  sortedHabits, addHabit, removeHabit, updateHabit, moveHabit,
  isDone, toggleDay, getNote, setNote,
  currentStreak, bestStreak,
  todayISO, addDays, mondayIndex,
} from './store.js';

import { syncWithDrive, isConfigured, hasCachedToken } from './sync.js';

const THEME_KEY = 'habit-tracker-theme';
const CONNECTED_KEY = 'habit-tracker-connected';

let state = loadLocal() || seedState();
let syncTimer = null;

const els = {
  todayLabel: document.getElementById('todayLabel'),
  combinedWeek: document.getElementById('combinedWeek'),
  combinedStat: document.getElementById('combinedStat'),
  habitList: document.getElementById('habitList'),
  newHabit: document.getElementById('newHabit'),
  addBtn: document.getElementById('addBtn'),
  themeToggle: document.getElementById('themeToggle'),
  syncBtn: document.getElementById('syncBtn'),
  syncStatus: document.getElementById('syncStatus'),
  template: document.getElementById('habitTemplate'),
};

/* ---------------- theme ---------------- */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
}

function initTheme() {
  let theme = 'dark';
  try { theme = localStorage.getItem(THEME_KEY) || 'dark'; } catch (_) {}
  applyTheme(theme);
}

/* ---------------- helpers ---------------- */

function currentWeekDates() {
  const today = new Date();
  const start = addDays(today, -mondayIndex(today));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function makeDayCell(date, { done, today, future, onClick, intensity }) {
  const iso = todayISO(date);
  const wrap = document.createElement('div');
  wrap.className = 'daycell';

  const dow = document.createElement('span');
  dow.className = 'dow';
  dow.textContent = DOW[mondayIndex(date)];

  const cell = document.createElement('div');
  cell.className = 'cell';
  if (done) cell.classList.add('cell--done');
  if (today) cell.classList.add('cell--today');
  if (future) cell.classList.add('cell--future');
  if (typeof intensity === 'number' && intensity > 0) {
    cell.classList.add('cell--done');
    cell.style.opacity = String(0.35 + 0.65 * intensity);
  }

  const num = document.createElement('span');
  num.className = 'dotday';
  num.textContent = String(date.getDate());

  wrap.append(dow, cell, num);
  wrap.title = iso;
  if (onClick && !future) {
    wrap.addEventListener('click', () => onClick(iso));
  }
  return wrap;
}

/* ---------------- persistence ---------------- */

function persist() {
  saveLocal(state);
  scheduleSync();
}

function scheduleSync() {
  if (!isConfigured() || !hasCachedToken()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => doSync(true), 1500);
}

/* ---------------- rendering ---------------- */

function renderToday() {
  els.todayLabel.textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function renderCombined() {
  const habits = sortedHabits(state);
  const total = habits.length;
  els.combinedWeek.innerHTML = '';
  const week = currentWeekDates();
  const today = todayISO();

  let doneThisWeek = 0;
  week.forEach((date) => {
    const iso = todayISO(date);
    const future = iso > today;
    let count = 0;
    habits.forEach((h) => { if (isDone(state, h.id, iso)) count += 1; });
    if (!future) doneThisWeek += count;
    const intensity = total ? count / total : 0;
    els.combinedWeek.append(makeDayCell(date, {
      done: count > 0, today: iso === today, future, intensity,
    }));
  });

  const possible = total * 7;
  els.combinedStat.textContent = total
    ? `${doneThisWeek} of ${possible} this week`
    : 'No habits yet';
}

function renderHabits() {
  const habits = sortedHabits(state);
  els.habitList.innerHTML = '';

  if (!habits.length) {
    const p = document.createElement('p');
    p.className = 'empty-note';
    p.textContent = 'No habits yet — add one below to begin.';
    els.habitList.append(p);
    return;
  }

  const today = todayISO();
  const week = currentWeekDates();

  habits.forEach((habit) => {
    const node = els.template.content.firstElementChild.cloneNode(true);
    node.dataset.id = habit.id;

    node.querySelector('.dot').style.background = habit.color;
    node.querySelector('.name').textContent = habit.name;

    const streakEl = node.querySelector('.streak');
    const cur = currentStreak(state, habit.id);
    const best = bestStreak(state, habit.id);
    streakEl.innerHTML = `<b>${cur}</b> day streak · best ${best}`;

    const tick = node.querySelector('.tick');
    if (isDone(state, habit.id, today)) tick.classList.add('tick--done');
    tick.addEventListener('click', () => {
      toggleDay(state, habit.id, today);
      persist();
      render();
    });

    // week strip
    const strip = node.querySelector('.week-strip');
    week.forEach((date) => {
      const iso = todayISO(date);
      strip.append(makeDayCell(date, {
        done: isDone(state, habit.id, iso),
        today: iso === today,
        future: iso > today,
        onClick: (d) => { toggleDay(state, habit.id, d); persist(); render(); },
      }));
    });

    // note editor (per habit, per day — here, today)
    const noteBtn = node.querySelector('.note-btn');
    const editor = node.querySelector('.note-editor');
    const textarea = editor.querySelector('textarea');
    textarea.value = getNote(state, habit.id, today);
    noteBtn.addEventListener('click', () => {
      editor.classList.toggle('open');
      if (editor.classList.contains('open')) textarea.focus();
    });
    textarea.addEventListener('input', () => {
      setNote(state, habit.id, today, textarea.value.trim());
      persist();
    });

    node.querySelector('.rename-btn').addEventListener('click', () => {
      const next = prompt('Rename habit', habit.name);
      if (next && next.trim()) {
        updateHabit(state, habit.id, { name: next.trim() });
        persist();
        render();
      }
    });

    node.querySelectorAll('.move-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        moveHabit(state, habit.id, Number(btn.dataset.dir));
        persist();
        render();
      });
    });

    node.querySelector('.delete-btn').addEventListener('click', () => {
      if (confirm(`Delete "${habit.name}" and its history?`)) {
        removeHabit(state, habit.id);
        persist();
        render();
      }
    });

    els.habitList.append(node);
  });
}

function render() {
  renderToday();
  renderCombined();
  renderHabits();
}

/* ---------------- sync ---------------- */

function setStatus(text, kind) {
  els.syncStatus.textContent = text || '';
  els.syncStatus.className = 'muted sync-status' + (kind === 'error' ? ' error' : '');
}

async function doSync(silent) {
  if (!isConfigured()) {
    setStatus('Sync off — paste your Google Client ID in js/config.js (see README).', 'error');
    return;
  }
  setStatus(silent ? 'Syncing…' : 'Connecting to Google…');
  try {
    state = await syncWithDrive(state);
    try { localStorage.setItem(CONNECTED_KEY, '1'); } catch (_) {}
    render();
    setStatus('Synced · ' + new Date().toLocaleTimeString());
  } catch (err) {
    if (silent) setStatus('Changes saved locally. Click ⟳ to sync.', 'error');
    else setStatus('Sync failed: ' + err.message, 'error');
  }
}

/* ---------------- wire up ---------------- */

els.addBtn.addEventListener('click', () => {
  const name = els.newHabit.value.trim();
  if (!name) return;
  addHabit(state, name);
  els.newHabit.value = '';
  persist();
  render();
});

els.newHabit.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') els.addBtn.click();
});

els.themeToggle.addEventListener('click', () => {
  const now = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(now);
});

els.syncBtn.addEventListener('click', () => doSync(false));

window.addEventListener('online', () => scheduleSync());

initTheme();
render();

// Quietly sync on open only if we already hold a valid token (no popups).
if (isConfigured() && hasCachedToken()) doSync(true);
