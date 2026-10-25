# Habitica

A minimal, ad-free habit tracker that runs as a static site on **GitHub Pages**
and keeps your data in **your own Google Drive**. No accounts on our side, no
servers, no tracking, no cost.

- One tap to mark a habit done.
- Current **and** best streak per habit.
- **Week** heatmap (per habit + combined) and **month** calendar heatmap.
- Optional **note per habit, per day**.
- **Dark** (soft bluish-purple) and **light** (soft off-white) themes.
- Fully responsive — works on a phone and a big PC screen.
- Your data is one human-readable **JSON** file in your Drive. You own it.

---

## Files

```
index.html        main app (today, add habit, week heatmap)
stats.html        stats page (month heatmaps, streaks)
css/styles.css    all styling + both themes
js/config.js      ← the one file you edit (your Google Client ID)
js/store.js       data model, local storage, streaks, merge
js/sync.js        Google Drive sync
js/app.js         main app logic
js/charts.js      stats page logic
```

---

## Part 1 — Put it on GitHub Pages

1. Create a new **public** repository on GitHub (e.g. `habit-tracker`).
2. Upload every file in this folder, keeping the folder structure
   (`css/` and `js/` stay as folders).
3. In the repo: **Settings → Pages**.
   - Under *Build and deployment*, set **Source = Deploy from a branch**.
   - Branch = **main**, folder = **/ (root)**. Save.
4. Wait a minute. Your app is live at
   `https://YOUR-USERNAME.github.io/habit-tracker/`.

> A free GitHub account requires the repo to be public. That's fine here —
> nothing secret is ever stored in the code. The only value in `config.js`
> is a **Client ID**, which is public by design.

---

## Part 2 — Connect Google Drive (one-time)

You need to create a Google OAuth **Client ID** and paste it into
`js/config.js`. This takes about five minutes.

1. Go to <https://console.cloud.google.com/> and create a new project
   (any name, e.g. "Habit Tracker").
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**. Fill in an app name and your email.
   - Under **Scopes**, you can leave defaults; the app requests
     `.../auth/drive.appdata` at sign-in (a *non-sensitive* scope, so no
     Google review is required for personal use).
   - Under **Test users**, add your own Google address (while the app is in
     "Testing").
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins** — add both:
     - `https://YOUR-USERNAME.github.io`
     - `http://localhost:8000` (optional, for local testing)
   - Leave "Authorized redirect URIs" empty — the browser token flow
     doesn't need one.
5. Copy the **Client ID** it gives you (ends in
   `.apps.googleusercontent.com`).
6. Open `js/config.js` and paste it:
   ```js
   export const CLIENT_ID = '1234567890-abc123.apps.googleusercontent.com';
   ```
7. Commit the change. Reload the site and press the **⟳** button once to
   sign in and connect. After that it syncs automatically.

> **Never** add a *client secret* to this project. The browser flow doesn't
> use one, and a secret in a public repo would be exposed.

### What gets stored, and where
Everything lives in **one JSON file** in the hidden *app data folder* of your
Drive — visible only to this app, never to a third-party server. Structure:

```json
{
  "schemaVersion": 1,
  "app": "habit-tracker",
  "updatedAt": "2026-10-25T09:30:00+05:30",
  "habits": [
    { "id": "h1", "name": "Wake up at 8", "type": "tick",
      "color": "#8b7fd4", "order": 1, "archived": false }
  ],
  "entries": {
    "h1": { "2026-10-25": { "done": true, "note": "woke at 8:05" } }
  }
}
```

### How sync stays safe across two devices
A tick is just a date being marked, so merging your phone and your PC is a
plain **union**: a day counts as done if *either* device says so, and a note
is kept if *either* has one. That means syncing can't lose a tick.

---

## Local testing (optional)

Modules need to be served over HTTP, not opened as a file. From this folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

---

## Roadmap

- Measured habits (counts/goals, e.g. "8 glasses of water").
- Reminders (limited in a browser page; needs "add to home screen").
