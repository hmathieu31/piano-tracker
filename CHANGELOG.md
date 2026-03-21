# Changelog

## [1.7.1](https://github.com/hmathieu31/piano-tracker/compare/piano-tracker-v1.7.0...piano-tracker-v1.7.1) (2026-03-21)


### Bug Fixes

* add missing difficulty field in row_to_session SongRecord initializer ([20d38c6](https://github.com/hmathieu31/piano-tracker/commit/20d38c623c1c79914ccca2f0e73a8a1313f09791))

## [1.7.0](https://github.com/hmathieu31/piano-tracker/compare/piano-tracker-v1.6.0...piano-tracker-v1.7.0) (2026-03-21)


### Features

* add difficulty level (1-5) to songs ([84a0707](https://github.com/hmathieu31/piano-tracker/commit/84a0707d58ce5782e01be646617cf67690847fb7))

## [1.6.0](https://github.com/hmathieu31/piano-tracker/compare/piano-tracker-v1.5.0...piano-tracker-v1.6.0) (2026-03-21)


### Features

* **dev:** add simulation controls for session-ended and level-up prompt ([a1108f2](https://github.com/hmathieu31/piano-tracker/commit/a1108f2c0eeeab5be0eb85095b2643c19fba683e))
* in-app session toast as gateway to tagging modal ([342b2af](https://github.com/hmathieu31/piano-tracker/commit/342b2afa813b58a65d5b01aa9d2020782a86faec))
* post-session tagging modal with mastery suggestions ([4db4376](https://github.com/hmathieu31/piano-tracker/commit/4db43766d8b2470bac6b9990cbfd6581fd273d0d))
* smart context-aware practice type suggestions in SessionTagModal ([22042f7](https://github.com/hmathieu31/piano-tracker/commit/22042f72bae9caf4f9e03f136d6cedaf5caa17b1))
* smooth modal animations — framer-motion transitions + animated checkmark ([ee05f71](https://github.com/hmathieu31/piano-tracker/commit/ee05f71085e06e45f5b7f15694f6988c64158216))


### Bug Fixes

* animated checkmark SVG using framer-motion pathLength ([8b348aa](https://github.com/hmathieu31/piano-tracker/commit/8b348aacda9d54b771b67c2be278de7275ab8a19))
* auto-delete orphan songs when all sessions are unlinked ([4add3d0](https://github.com/hmathieu31/piano-tracker/commit/4add3d0685b51a60bc5ce7d02538466cd7d20920))

## [1.5.0](https://github.com/hmathieu31/piano-tracker/compare/piano-tracker-v1.4.0...piano-tracker-v1.5.0) (2026-03-21)


### Features

* Repertoire page fully redesigned as a 3-column Kanban learning board (Learning / Practicing / Mastered) with cover-art-forward song cards and centred detail modal ([849e2e7](https://github.com/hmathieu31/piano-tracker/commit/849e2e73d69928c654e494aae0e098656e110bdc))
* New Collection view (album-art grid) with group-by Genre / Artist / Stage / All toggle ([849e2e7](https://github.com/hmathieu31/piano-tracker/commit/849e2e73d69928c654e494aae0e098656e110bdc))
* App renamed to **Ivory Piano Tracker** with a new custom piano icon ([849e2e7](https://github.com/hmathieu31/piano-tracker/commit/849e2e73d69928c654e494aae0e098656e110bdc))
* Tray right-click menu: added Restart option ([849e2e7](https://github.com/hmathieu31/piano-tracker/commit/849e2e73d69928c654e494aae0e098656e110bdc))
* Dev seed data command (7 songs, 50 sessions) with DEV-only Settings panel ([849e2e7](https://github.com/hmathieu31/piano-tracker/commit/849e2e73d69928c654e494aae0e098656e110bdc))
* Strava-for-piano UX vision: sectioned sidebar (PRACTICE / PROGRESS / DISCOVER), IVORY brand, Coach teaser page, forgetting-curve nudges on Dashboard ([3d70378](https://github.com/hmathieu31/piano-tracker/commit/3d703789e90e05c4b82eda9f7c65dcd45af1ab14))
* Piano Session Hub: Library with mood tracking (emoji picker), mastery progression (Learning→Practicing→Mastered), merged Stats page ([ef1a8b7](https://github.com/hmathieu31/piano-tracker/commit/ef1a8b7b64cc90e07bae17f37a64c2af4e3a0d2f))
* Remove Cozy Cloud integration; configurable MIDI export save folder ([3bf5df2](https://github.com/hmathieu31/piano-tracker/commit/3bf5df213d7d3a8c779e0c64e2d0a13da3c7d78))

## [1.3.1](https://github.com/hmathieu31/piano-tracker/compare/piano-tracker-v1.3.0...piano-tracker-v1.3.1) (2026-03-21)


### Bug Fixes

* fix MIDI reconnect after keyboard power cycle ([f0f9ee7](https://github.com/hmathieu31/piano-tracker/commit/f0f9ee71b41db293ee6dacf2a2e7f166ab6fed40))
* fix Spotify link and MIDI export in Tauri webview ([eb539f9](https://github.com/hmathieu31/piano-tracker/commit/eb539f9b51c504c8064ee4ea5bca395f79f02fc9))
* share updater state via context so banner shows on manual check ([1c4cef3](https://github.com/hmathieu31/piano-tracker/commit/1c4cef3d43dba3b16a5be5c7074b19a490beaf25))

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
