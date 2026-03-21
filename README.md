# 🎹 Ivory Piano Tracker

> Strava for piano. Sit down and play — Ivory handles the rest.

A desktop app that automatically tracks your piano practice via MIDI. No timers, no buttons. Built with [Tauri 2](https://tauri.app) + React + TypeScript. Runs on Windows, lives in the system tray.

---

## Features

- **Auto-tracking** — MIDI note-on detection starts and ends sessions automatically; reconnects if the keyboard is power-cycled
- **Dashboard** — daily goal ring, live session status, practice streak, in-progress songs, and a 7-day chart
- **Repertoire** — song library with cover art, three learning stages (🌱 Learning → 🎵 Practicing → ⭐ Mastered), mood trends, and MIDI piano roll per session
- **Stats** — bar/line charts (30/90/365 days), GitHub-style yearly heatmap, and personal insights (best streak, time-of-day breakdown)
- **Post-session tagging** — a toast invites you to tag what you played; the modal suggests practice type and mood based on your history, and prompts you to advance the song's mastery stage when the criteria are met
- **History** — session log with note editing and MIDI file export
- **Achievements** — badge wall with real-time confetti on unlock
- **Notifications** — daily reminder, streak-at-risk alert, weekly summary (local, no internet)
- **Auto-updater** — checks on startup, installs in one click

---

## Installation

Download the latest installer from [Releases](https://github.com/hmathieu31/piano-tracker/releases/latest).

> Requires Microsoft Edge WebView2 (downloaded automatically if missing).

---

## Development

```powershell
npm install
.\dev.ps1        # launches tauri dev with correct cargo PATH
.\build.ps1      # produces installer in src-tauri\target\release\bundle\
```

**Tech stack:** Tauri 2 · React 18 · TypeScript · Tailwind CSS · HeroUI · Framer Motion · Recharts · SQLite (rusqlite) · midir

---

## CI/CD

Conventional commits on `main` trigger [release-please](https://github.com/googleapis/release-please) → release PR → on merge, GitHub release + signed Windows installers are published automatically.

Required secret: `TAURI_SIGNING_PRIVATE_KEY`

---

## License

MIT

