# 🎹 Ivory Piano Tracker

> Strava for piano. Sit down and play — Ivory handles the rest.

A desktop app that automatically tracks your piano practice via MIDI detection, builds your personal song repertoire, and surfaces meaningful analytics about your progress. No timers to start, no buttons to press.

Built with [Tauri 2](https://tauri.app) + React + TypeScript. Runs on Windows, lives in the system tray.

---

## Features at a glance

| Category | Highlights |
|---|---|
| **Auto-tracking** | MIDI note-on detection — sessions start/end automatically |
| **Dashboard** | Daily goal ring, streak counter, 7-day chart, in-progress songs |
| **Repertoire** | Song library with cover art, learning stages, mood trends |
| **Stats** | Bar charts, heatmap, insights — 30/90/365 day windows |
| **Post-session tagging** | Smart song-tagging flow with mood, practice type, mastery suggestions |
| **Achievements** | Badge wall with confetti on unlock |
| **History** | Session log with MIDI piano roll, note editing, export |
| **Coach** | Upcoming AI-powered features (spaced repetition, daily plans…) |

---

## How it works

1. Connect your piano via USB MIDI
2. Launch Ivory — it appears in the system tray (🎹)
3. **Start playing** — MIDI note-on events trigger a session automatically
4. **Stop playing** — after the configured silence period (default 10 s) the session is saved
5. A **toast notification** slides up: tag what you played, log your mood, or dismiss it
6. Sessions, songs, and MIDI events are stored locally in SQLite — no internet required

> If the keyboard is powered off and back on, Ivory reconnects automatically.

Data lives at: `%APPDATA%\com.hugom.piano-tracker\piano-tracker.db`

---

## Pages

### 🏠 Home

Your daily dashboard:

- **Goal ring** — circular progress towards your daily target (green when met)
- **Live status card** — shows whether a session is active right now, elapsed time, and MIDI connection state
- **Practice streak** — current 🔥 streak vs. all-time best, with progress bar
- **In progress songs** — 4 most-recently-played songs (learning/practicing stages) with session count, days since played, avg mood
- **Time to revisit** — songs not touched in 14+ days nudge you to keep them fresh
- **Recent sessions** — last 5 sessions with mood emoji, song title, and duration
- **7-day mini chart** — bar chart of daily totals; green = goal met, cyan = today

### 📚 Repertoire

Your personal song library, organised by learning stage:

| Stage | Badge | Meaning |
|---|---|---|
| Learning | 🌱 | First encounters; exploring the piece |
| Practicing | 🎵 | Regular work; building fluency |
| Mastered | ⭐ | Performance-ready |

Each song card shows cover art (fetched from MusicBrainz/Spotify metadata, or a gradient placeholder), title, artist, total practice time, session count, last-played date, and a mood trend sparkline.

**Song detail modal** — full session history, MIDI piano roll visualisation, genre editing, MIDI file export, and one-click status advancement.

### 📊 Stats

Four sub-pages behind a tab bar:

- **Overview** — today's progress card + past-7-days breakdown grid (date, minutes, % of goal)
- **Charts** — daily bar chart and weekly line chart; 30/90/365 day window selector; goal reference line
- **Heatmap** — GitHub-style 52 × 7 calendar for the past 365 days; intensity = practice volume
- **Insights** — total hours, session count, avg session length, best streak; personal records (longest session, best day); time-of-day productivity split (morning / afternoon / evening)

### 📝 History

Full session log grouped by month. Per-session row: mood emoji, linked song title, date, duration chip. Expanding a session opens a detail panel with:

- Full metadata editing (note, mood, linked song)
- MIDI piano roll (notes plotted over time as a heatmap)
- MIDI file export to a configurable folder

### 🏆 Achievements

Unlockable badge wall. Badges unlock in real-time; confetti fires on the first unlock of each badge. Locked badges show their criteria.

### 🤖 Coach *(coming soon)*

Roadmap placeholder for upcoming features: spaced-repetition reminders, AI progress analysis, daily practice plans, exercise library, monthly challenges, and MIDI performance review.

### ⚙️ Settings

| Setting | Default |
|---|---|
| Daily goal | 30 min |
| Session end silence | 10 s |
| Daily reminder notification | On |
| Streak-at-risk alert | On |
| Weekly summary notification | On |
| Reminder hour | 19:00 |
| MIDI export folder | (system default) |

---

## Post-session tagging flow

Every session longer than 5 seconds triggers a **toast** at the bottom of the screen:

```
🎹  Nice session! 4 min 22 s     What did you play?
[×]                              [Tag it →]
```

The toast auto-dismisses after 20 s. Clicking **Tag it** opens the tagging modal:

### Step 1 — Song picker

Shows your 6 most recently-played songs. Each row displays:
- Cover art, title, artist
- Session count + days since last played + average mood emoji
- **Context badge** — *New*, *Comeback* (21+ days away), *Challenging* (low avg mood), or *Flowing* (consistent good sessions)

You can search MusicBrainz for a new song inline (600 ms debounce), or skip tagging entirely.

### Step 2 — Practice details

An **adaptive headline** describes what the app knows about you and this song (e.g. *"This one is fighting back — pinpoint what to fix 🔬"* when avg mood is low). Four practice types are presented:

| Type | Icon | When suggested |
|---|---|---|
| First listen | 🌱 | New / comeback songs |
| Drill a section | 🔬 | Struggling / low mood |
| Full run-through | 🔄 | Flowing, building fluency |
| Performance run | ✨ | High fluency, ready to shine |

The most contextually relevant type is shown as a full-width **featured tile** (auto-selected). Three alternatives are shown in a compact grid.

Below the type selector: a **mood picker** (😞 → 🤩) and an optional **note** field.

### Step 3 — Mastery suggestion *(conditional)*

After saving, the app checks whether this song is ready to advance. If so, you see:

```
🎖️  "Clair de Lune" is ready to level up!
     🌱 Learning  →  🎵 Practicing
     [Not yet]   [Yes, level up! 🚀]
```

Confirming triggers a **confetti celebration** and updates the song's stage.

### Step 4 — Done

An animated SVG checkmark (ring draws → checkmark strokes) confirms the session was saved. The modal auto-closes after ~1.5 s.

---

## Installation

Download the latest installer from [Releases](https://github.com/hmathieu31/piano-tracker/releases/latest):

| File | Description |
|------|-------------|
| `Ivory Piano Tracker_x.y.z_x64-setup.exe` | NSIS installer (recommended) |
| `Ivory Piano Tracker_x.y.z_x64_en-US.msi` | MSI installer |

> **Requirement:** Microsoft Edge WebView2 runtime. The installer downloads it automatically if not present.

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org) 20+
- [Rust](https://rustup.rs) (rustup, toolchain `stable-x86_64-pc-windows-gnu`)
- A MIDI-connected piano (or use the built-in simulator)

### Running locally

```powershell
npm install
.\dev.ps1        # prepends ~/.cargo/bin to PATH, then launches tauri dev
```

### Dev simulator

In development builds a floating **🛠️ toolbar** appears (bottom-right):

- **Duration slider** + "Fire session-ended event" — inserts a fake session into the DB and triggers the full toast → modal tagging flow
- **Level-up presets** — opens the mastery suggestion step directly with pre-filled song data

### Building a release installer

```powershell
.\build.ps1
# Output: src-tauri\target\release\bundle\
```

### Tech stack

| Layer | Technology |
|---|---|
| Shell | Tauri 2 |
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS v3, HeroUI components |
| Animations | Framer Motion |
| Charts | Recharts |
| Database | SQLite via rusqlite (bundled) |
| MIDI | midir (WinMM backend) |
| Notifications | tauri-plugin-notification |
| Updates | tauri-plugin-updater |

---

## CI/CD

Pushing to `main` with [conventional commits](https://www.conventionalcommits.org) (`fix:`, `feat:`, etc.) triggers [release-please](https://github.com/googleapis/release-please):

1. Opens/updates a release PR with a generated changelog
2. On merge: creates a GitHub release, bumps versions in `package.json`, `tauri.conf.json`, and `Cargo.toml`
3. Triggers the Windows build workflow — signs and uploads installers + `latest.json` (for the in-app updater)

To manually trigger a build for an existing tag:  
**Actions → Manual Build → Run workflow → enter the release tag**

### Required GitHub secret

| Secret | Value |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Content of the minisign private key used to sign update packages |

---

## License

MIT

