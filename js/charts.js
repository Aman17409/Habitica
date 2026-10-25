/*
 * charts.js — the stats page: month heatmaps (per habit and combined)
 * plus a few plain numbers. No chart libraries, so it all works offline.
 */

import {
  loadLocal, seedState, sortedHabits, isDone,
  currentStreak, bestStreak, completionRate,
  todayISO, mondayIndex,
} from './store.js';

const THEME_KEY = 'habit-tracker-theme';
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

let state = loadLocal() || seedState();

/* ---------------- theme ---------------- */

function initTheme() {
  let theme = 'dark';
  try { theme = localStorage.getItem(THEME_KEY) || 'dark'; } catch (_) {}
  document.documentElement.setAttribute('data-theme', theme);
}

document.getElementById('themeToggle').addEventListener('click', () => {
  const now = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', now);
  try { localStorage.setItem(THEME_KEY, now); } catch (_) {}
});

/* ---------------- month grid ---------------- */

function monthDates(ref = new Date()) {
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = mondayIndex(first); // blank cells before day 1
  const cells = [];
  for (let i = 0; i < lead; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function buildMonthGrid(container, valueFor) {
  container.innerHTML = '';
  DOW.forEach((d) => {
    const h = document.createElement('div');
    h.className = 'dow';
    h.textContent = d;
    container.append(h);
  });

  const today = todayISO();
  monthDates().forEach((date) => {
    const cell = document.createElement('div');
    if (!date) {
      cell.className = 'cell pad';
      container.append(cell);
      return;
    }
    const iso = todayISO(date);
    cell.className = 'cell';
    const v = valueFor(iso); // 0..1 (1 = done, fractional = partial for combined)
    if (v > 0) {
      cell.classList.add('cell--done');
      if (v < 1) cell.style.opacity = String(0.35 + 0.65 * v);
    }
    if (iso === today) cell.classList.add('cell--today');
    if (iso > today) cell.classList.add('cell--future');
    cell.title = iso;
    container.append(cell);
  });
}

/* ---------------- stat rows ---------------- */

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function statRow(label, value) {
  const row = document.createElement('div');
  row.className = 'stat-row';
  const l = document.createElement('span');
  l.className = 'muted';
  l.textContent = label;
  const v = document.createElement('b');
  v.textContent = value;
  row.append(l, v);
  return row;
}

/* ---------------- render ---------------- */

function render() {
  const habits = sortedHabits(state);
  const today = todayISO();

  document.getElementById('monthLabel').textContent =
    new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const total = habits.length;

  // combined month grid: intensity = share of habits done that day
  buildMonthGrid(document.getElementById('combinedMonth'), (iso) => {
    if (!total) return 0;
    let count = 0;
    habits.forEach((h) => { if (isDone(state, h.id, iso)) count += 1; });
    return count / total;
  });

  // per-habit cards
  const cards = document.getElementById('statCards');
  cards.innerHTML = '';
  const template = document.getElementById('statCardTemplate');

  if (!habits.length) {
    const p = document.createElement('p');
    p.className = 'empty-note';
    p.textContent = 'No habits yet. Add some on the main page.';
    cards.append(p);
  }

  habits.forEach((habit) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector('.dot').style.background = habit.color;
    node.querySelector('.name').textContent = habit.name;
    node.querySelector('.streak').innerHTML =
      `<b>${currentStreak(state, habit.id)}</b> day streak`;

    buildMonthGrid(node.querySelector('.month-grid'), (iso) =>
      isDone(state, habit.id, iso) ? 1 : 0);

    const rows = node.querySelector('.stat-rows');
    rows.append(
      statRow('Best streak', plural(bestStreak(state, habit.id), 'day')),
      statRow('Last 30 days', completionRate(state, habit.id, 30) + '%'),
      statRow('This month done', plural(monthDone(state, habit.id), 'day')),
    );

    cards.append(node);
  });

  // overall
  const overall = document.getElementById('overall');
  overall.innerHTML = '';
  let ticksThisMonth = 0;
  monthDates().filter(Boolean).forEach((d) => {
    const iso = todayISO(d);
    habits.forEach((h) => { if (isDone(state, h.id, iso)) ticksThisMonth += 1; });
  });
  overall.append(
    statRow('Habits tracked', String(total)),
    statRow('Completed today', habits.filter((h) => isDone(state, h.id, today)).length + ' / ' + total),
    statRow('Ticks this month', String(ticksThisMonth)),
  );
}

function monthDone(state, habitId) {
  const dates = monthDates().filter(Boolean);
  let n = 0;
  dates.forEach((d) => { if (isDone(state, habitId, todayISO(d))) n += 1; });
  return n;
}

initTheme();
render();
