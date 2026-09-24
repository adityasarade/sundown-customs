# Verification

September 24, 2026. These are observed checks, not claims of exhaustive device coverage.

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
