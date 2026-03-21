# Changelog

## [1.3.0](https://github.com/hmathieu31/piano-tracker/compare/piano-tracker-v1.2.1...piano-tracker-v1.3.0) (2026-03-21)


### Features

* migrate to HeroUI component library ([bd9fa59](https://github.com/hmathieu31/piano-tracker/commit/bd9fa59c6ad9054786d444d3a1d9ef010545e250))


### Bug Fixes

* correct HeroUI setup to resolve component rendering issues ([74a6f2e](https://github.com/hmathieu31/piano-tracker/commit/74a6f2eed45b862d46bd1cff1925c625e7e50f55))
* fix Tailwind content path so HeroUI classes aren't purged ([440f2ca](https://github.com/hmathieu31/piano-tracker/commit/440f2ca04943a647ac74d121f48f5ba524292068))

## [1.2.1](https://github.com/hmathieu31/piano-tracker/compare/piano-tracker-v1.2.0...piano-tracker-v1.2.1) (2026-03-21)


### Bug Fixes

* responsive layout + iTunes search API ([7cc2fdf](https://github.com/hmathieu31/piano-tracker/commit/7cc2fdf7ae7a966b8d0ac38e80b566a939767630))

## [1.2.0](https://github.com/hmathieu31/piano-tracker/compare/piano-tracker-v1.1.0...piano-tracker-v1.2.0) (2026-03-21)


### Features

* Phase 1 - MIDI capture, song management & redesigned History ([b0a834e](https://github.com/hmathieu31/piano-tracker/commit/b0a834e20c607e5cb7bb5b2099f13663e72332f8))

## [1.1.0](https://github.com/hmathieu31/piano-tracker/compare/piano-tracker-v1.0.0...piano-tracker-v1.1.0) (2026-03-21)


### Features

* in-app updater + fix CI release trigger ([e587ee2](https://github.com/hmathieu31/piano-tracker/commit/e587ee2608908a8e5dfbfbfef6582827526ff042))
* Init piano tracker v1 ([828725f](https://github.com/hmathieu31/piano-tracker/commit/828725f03d10a4707dfad292dd1851e4fb54fbe4))
* manual MIDI reconnect button in sidebar ([783ed91](https://github.com/hmathieu31/piano-tracker/commit/783ed919b1058633bd09a0e202e9f66bc8b089a8))


### Bug Fixes

* add updater artifacts ([1c62ad5](https://github.com/hmathieu31/piano-tracker/commit/1c62ad5ef521d619ed660b06226a63eee58c9468))
* MIDI reconnection after keyboard power cycle ([71a7672](https://github.com/hmathieu31/piano-tracker/commit/71a767282bb010579d933e0ab76b13d7c16b2055))
* MIDI tracking - filter note-on only, detect disconnect/reconnect ([a91d2ce](https://github.com/hmathieu31/piano-tracker/commit/a91d2cee9ffd4870ab2fb72e56f6003ac3efda54))
* remove WebView2Loader.dll bundle resource for MSVC CI compatibility ([af36448](https://github.com/hmathieu31/piano-tracker/commit/af3644893efa29c671c3c98ede702365f3b09f61))
* tray icon missing and right-click menu not working ([7458d80](https://github.com/hmathieu31/piano-tracker/commit/7458d8088c2d567eeebeeaebae53109874c63066))
* updater check visibility and CI latest.json generation ([0c1db01](https://github.com/hmathieu31/piano-tracker/commit/0c1db01937c86c3d5480a1eb1b2006058c65f96c))
* updater works with private GitHub repo ([3bdcc57](https://github.com/hmathieu31/piano-tracker/commit/3bdcc573097d65dfa90372afdd695758c4f5b39f))

## [1.0.0](https://github.com/hmathieu31/piano-tracker/compare/piano-tracker-v0.4.0...piano-tracker-v1.0.0) (2026-03-21)

### 🎉 First stable release

Piano Tracker v1.0.0 is the first production-ready release. The core feature set —
MIDI tracking, session storage, analytics, auto-updates, and system tray — is
complete and stable.

### Features

* **MIDI auto-detection** — connects on startup; note-on filter prevents idle-keyboard false positives
* **Session tracking** — auto-saves sessions after configurable silence timeout
* **Dashboard** — today's progress, streak, goal ring, recent sessions
* **Charts** — daily/weekly bar charts, session length distribution
* **Heatmap** — GitHub-style yearly activity calendar
* **Insights** — best streak, average session, most productive day/time
* **Achievements** — milestone badges for streaks, time goals, and firsts
* **Goals** — configurable daily practice goal
* **History** — full session log with inline notes
* **Auto-updater** — silent background checks, one-click install & restart
* **System tray** — minimize to tray, left-click to show, right-click menu
* **Manual MIDI reconnect** — sidebar button to force reconnect without restarting
* **Windows notifications** — daily reminder, streak-at-risk alert, weekly summary

### Bug Fixes

* Share updater state via context so banner and settings stay in sync
* MIDI reconnection after keyboard power cycle
* Idle keyboard no longer tracked as a session (note-on filter)
* Tray icon and right-click context menu

## [0.3.6](https://github.com/hmathieu31/piano-tracker/compare/piano-tracker-v0.3.5...piano-tracker-v0.3.6) (2026-03-21)


### Bug Fixes

* MIDI reconnection after keyboard power cycle ([71a7672](https://github.com/hmathieu31/piano-tracker/commit/71a767282bb010579d933e0ab76b13d7c16b2055))

## [0.3.5](https://github.com/hmathieu31/piano-tracker/compare/piano-tracker-v0.3.4...piano-tracker-v0.3.5) (2026-03-21)


### Bug Fixes

* add updater artifacts ([1c62ad5](https://github.com/hmathieu31/piano-tracker/commit/1c62ad5ef521d619ed660b06226a63eee58c9468))

## [0.3.4](https://github.com/hmathieu31/piano-tracker/compare/piano-tracker-v0.3.3...piano-tracker-v0.3.4) (2026-03-20)


### Bug Fixes

* updater works with private GitHub repo ([3bdcc57](https://github.com/hmathieu31/piano-tracker/commit/3bdcc573097d65dfa90372afdd695758c4f5b39f))

## [0.3.3](https://github.com/hmathieu31/piano-tracker/compare/piano-tracker-v0.3.2...piano-tracker-v0.3.3) (2026-03-20)


### Bug Fixes

* updater check visibility and CI latest.json generation ([0c1db01](https://github.com/hmathieu31/piano-tracker/commit/0c1db01937c86c3d5480a1eb1b2006058c65f96c))

## [0.3.2](https://github.com/hmathieu31/piano-tracker/compare/piano-tracker-v0.3.1...piano-tracker-v0.3.2) (2026-03-20)


### Bug Fixes

* tray icon missing and right-click menu not working ([7458d80](https://github.com/hmathieu31/piano-tracker/commit/7458d8088c2d567eeebeeaebae53109874c63066))

## [0.3.1](https://github.com/hmathieu31/piano-tracker/compare/piano-tracker-v0.3.0...piano-tracker-v0.3.1) (2026-03-20)


### Bug Fixes

* remove WebView2Loader.dll bundle resource for MSVC CI compatibility ([af36448](https://github.com/hmathieu31/piano-tracker/commit/af3644893efa29c671c3c98ede702365f3b09f61))

## [0.3.0](https://github.com/hmathieu31/piano-tracker/compare/piano-tracker-v0.2.0...piano-tracker-v0.3.0) (2026-03-20)


### Features

* in-app updater + fix CI release trigger ([e587ee2](https://github.com/hmathieu31/piano-tracker/commit/e587ee2608908a8e5dfbfbfef6582827526ff042))

## [0.2.0](https://github.com/hmathieu31/piano-tracker/compare/piano-tracker-v0.1.0...piano-tracker-v0.2.0) (2026-03-20)


### Features

* Init piano tracker v1 ([828725f](https://github.com/hmathieu31/piano-tracker/commit/828725f03d10a4707dfad292dd1851e4fb54fbe4))


### Bug Fixes

* MIDI tracking - filter note-on only, detect disconnect/reconnect ([a91d2ce](https://github.com/hmathieu31/piano-tracker/commit/a91d2cee9ffd4870ab2fb72e56f6003ac3efda54))
