# 🎹 Piano Tracker

A desktop app that automatically tracks your piano practice time via MIDI — no buttons to press, no timers to start. Just sit down and play.

Built with [Tauri 2](https://tauri.app) + React + TypeScript. Runs on Windows, stays in the system tray.

---

## Features

- **Automatic session detection** — listens for MIDI note-on events. Practice starts when you play, ends after configurable seconds of silence
- **Daily goal tracking** — set a daily practice target, see your progress ring fill up
- **7-page dashboard**
  - **Today** — circular goal ring, live status, streak counter, 7-day mini bar chart
  - **Goals** — progress bar + day-by-day breakdown for the week
  - **Charts** — bar and line charts over selectable time periods
  - **Heatmap** — GitHub-style yearly calendar of practice days
  - **Insights** — personal records, time-of-day breakdown
  - **Achievements** — badge wall with confetti on unlock
  - **History** — session log grouped by month with inline note editing
- **Settings** — daily goal, notifications, session end delay
- **System tray** — left-click to show/hide, right-click for Open / Quit
- **Local notifications** — daily reminder, streak-at-risk alert, weekly summary (Windows toast, no internet)
- **Auto-updater** — checks for new releases on startup, installs and relaunches in one click

---

## Installation

Download the latest installer from [Releases](https://github.com/hmathieu31/piano-tracker/releases/latest):

| File | Description |
|------|-------------|
| `Piano Tracker_x.y.z_x64-setup.exe` | NSIS installer (recommended) |
| `Piano Tracker_x.y.z_x64_en-US.msi` | MSI installer |

> **Note:** Microsoft Edge WebView2 is required. The installer will download and install it automatically if not present.

---

## How it works

1. Connect your piano via USB MIDI
2. Launch Piano Tracker — it appears in the system tray
3. Start playing — the app detects MIDI note-on events and begins a session automatically
4. Stop playing — after the configured silence period (default 10s) the session is saved
5. If the keyboard is turned off and back on, the app reconnects automatically

Sessions are stored locally in a SQLite database at `%APPDATA%\com.hugom.piano-tracker\piano-tracker.db`.

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org) 20+
- [Rust](https://rustup.rs) (via rustup, toolchain `stable-x86_64-pc-windows-gnu`)
- A MIDI-connected piano

### Running locally

```powershell
# Install frontend dependencies
npm install

# Start dev server (sets the correct cargo PATH)
.\dev.ps1
```

> `dev.ps1` prepends `~\.cargo\bin` to PATH to use the rustup cargo rather than any system-installed version.

### Building a release installer

```powershell
.\build.ps1
# Output: src-tauri\target\release\bundle\
```

### Tech stack

| Layer | Technology |
|-------|-----------|
| Shell | Tauri 2 |
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS v3 |
| Charts | Recharts |
| Database | SQLite via rusqlite (bundled) |
| MIDI | midir (WinMM backend) |
| Notifications | tauri-plugin-notification |
| Updates | tauri-plugin-updater |

---

## CI / CD

Pushing to `main` with [conventional commits](https://www.conventionalcommits.org) (e.g. `fix:`, `feat:`) triggers [release-please](https://github.com/googleapis/release-please), which:

1. Opens/updates a release PR with a generated changelog
2. On merge: creates a GitHub release and bumps versions in `package.json`, `tauri.conf.json`, and `Cargo.toml`
3. Triggers the Windows build workflow, which signs and uploads installers + `latest.json` (for the in-app updater) to the release

To manually trigger a build for an existing release:  
**Actions → Manual Build → Run workflow → enter the release tag**

### Required GitHub secret

| Secret | Value |
|--------|-------|
| `TAURI_SIGNING_PRIVATE_KEY` | Content of the minisign private key used to sign update packages |

---

## License

MIT

