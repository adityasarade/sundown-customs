# Verification

## v3 "Heist Night" checks (September 26, 2026)

- `npm test`: 86 passing unit tests (city grid and projection, missions and GPS turns incl. U-turn, mission driving/pursuit/respray/stash/timeout rules, pixel map analysis, editor save gate).
- `npm run test:e2e` (1440×900) and `npm run test:e2e:mobile` (390×844): 6/6 steps each, zero page errors, against the real hosted Unlayer editor. The script draws a route with the mouse on Nico's map in the plan context (garage → east → north → Causeway), locks it (read as CAUSEWAY LOT, 100% drawn, 2 cameras), drives the resulting mission using only keyboard input from live telemetry (3★ at the bridge camera, a Spray & Pray disguise kit cleared the stars, MISSION PASSED in ~44 s), opens the news, hijacks the live frame (draws on it, GO LIVE, billboards), inks a flash tattoo in the chair, and posts a Snappix to BAYFEED.
- `ROUTE=marina|motel npm run test:autopilot`: both routes completed by keyboard autopilot; the camera-free Palm Motel route drew the late patrol (1★) as designed.
- Audio (headless, radio on): all five stations run with no errors; measured master peaks −11 to −15 dBFS after gain staging; engine and siren layers respond to speed/cops.
- Codex reviews (gpt-5.6-sol) of the v3 diff found six issues (async phase races, broadcast using the next mission, late-crossing win, speech not muted, stale station idents, aimless scribbles treated as plans); all fixed, two covered by new tests.
- Production build passes; dev hooks (`__sd`) absent from `dist`.

September 24, 2026. These are observed checks, not claims of exhaustive device coverage.

## GTA update checks (September 24, 16:00–16:30 UTC)

- `npm test`: 15 passing tests, adding wanted trigger at the north pier, respray star math (min one star, full clear empties cops), busted after stalling with a cop behind, respray booth entry that re-arms after a cancel, and cop pursuit poses.
- Chrome 1440 × 860 (headless, dev build with dev-only teleport hooks that are stripped from production): WANTED at the pier with CCTV still, three cruisers flanking along the driven line, BUSTED meter, Spray & Pray opening native Unlayer in dark theme, Technicolor preset saved → measured 76% new → all stars cleared → MISSION PASSED → Bay 9 News with before/after and 76% stamp.
- Chrome 390 × 844: same route; Invert preset measured 100% new; HUD, respray meter, result and news layouts checked and a radar/banner overlap fixed.
- Production build passes; `__sd` dev hooks absent from `dist`. A Codex review of the diff found one flow bug (cancelled respray disabled the booth), fixed and covered by a test.

## Local release checks

- `npm test`: 10 passing tests covering the four-checkpoint route, timeout, drift, collision cooldown, repeated steering, completed-route scoring, unchanged editor Save, dirty-flag reset, and export fallback.
- `npm run build`: TypeScript and Vite production build passed. Three.js is split into its own roughly 129 KB gzip chunk; Vite reports its uncompressed size above 500 KB.
- Chrome desktop: opened native Unlayer; unchanged Save was rejected; added `GHOST` text; native Save fitted the edited livery to the 3D car.
- 390 × 844 viewport: checked landing and garage; fixed camera framing; drew and saved an additional native-editor stroke. Editor tools reflow beneath a usable canvas.
- Completed all four checkpoints through actual browser controls with optional automatic throttle: 27.8 seconds, score 2,083. No test-only completion hook was used.
- Pause, resume, and retry checked. Retry visibly resets to 0/4 checkpoints and 1:30 while retaining the edited car. Traffic now uses run time and freezes with pause.
- Captured the real 3D scene, opened the shot in native Unlayer, applied Vintage, and saved back to photo mode.
- Downloaded and visually inspected the 1600 × 1200 PNG run card. It contains the actual edited photo, exact edited livery, callsign, score, and rounded time.
- Browser logs revealed a deprecated Three.js shadow-map setting; replaced with supported PCFShadowMap.

## Public production checks

- Published at https://sundown-customs.vercel.app with source at https://github.com/adityasarade/sundown-customs. Both the app and raw source returned HTTP 200 without credentials.
- On the production origin: native Draw → Save → fitted livery → delivery briefing → four checkpoints → completed run. Actual result: **22.7 seconds, 3,114 points**.
- Captured a new angle, opened it in Unlayer, resized to 390 × 844, applied Sepia, and saved the finished photograph. Downloaded the resulting run card from the production app.
- Production browser console: no captured warnings or errors during this route.
- [Landing screenshot](screenshots/landing.png), [fitted car](screenshots/garage.png), [completed run](screenshots/completed-run.png), [mobile photo editor](screenshots/mobile-editor.png), [downloaded production run card](screenshots/production-run-card.png).
- Vercel CLI deployment is active. Its automatic GitHub connection did not succeed, so future source pushes alone are not confirmed to redeploy; use `vercel --prod` from this project.

## Limits

- Mobile checks use Chrome viewport emulation, not physical iOS or Android hardware.
- Keyboard completion was exercised; the touch controls were inspected but a full touch-only run was not completed.
- Timeout and drift scoring have automated coverage; a browser playthrough of every failure state was not performed.
- The Unlayer hosted runtime needs network access. Performance varies with WebGL hardware. No claim of offline operation or commercial-game graphics is made.
- No contest form or social post has been sent.
