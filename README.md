# Sundown Customs

**Paint it. Drive it. Get made. Repaint your way out.** An original coastal crime-arcade built around Unlayer's React Image Editor.

[Play Sundown Customs](https://sundown-customs.vercel.app) · [Public source](https://github.com/adityasarade/sundown-customs)

![Original Sundown Customs cover illustration](public/art/cover.webp)

## The experience

Open the paint booth and mark up a livery in **Unlayer React Image Editor** — draw, text, filters, shapes, stickers, a crop. The exact bitmap you save becomes the hood and door texture of a drivable, low-poly 3D Solstice '87 coupe; pick a body finish and neon underglow in the garage.

Then run **"The Last Delivery"**: four checkpoints around a fictional coastal loop, 90 seconds on the clock. At the north pier the harbour cameras get a clean shot of your paint job and you go **WANTED** — up to five stars, police cruisers that chase you along the exact line you drove, a helicopter searchlight once you're hot enough, and a BUSTED meter that fills if you stall with a cruiser on your bumper.

**Spray & Pray:** duck into the respray booth on the east road and the run pauses — Unlayer reopens on your current livery, dark-themed, with a live change meter running while you paint. A per-pixel comparison (a 160×80 colour-delta sample, no image recognition) measures how much of the livery you actually changed against what the cameras saw; every 8% changed drops one star, and the repainted bitmap is re-fitted to the car the instant you save.

A GTA-style HUD tracks stars, cash, the clock, and a radar with a blip for the respray booth; Nico texts you through the run; MISSION PASSED, BUSTED, and MISSION FAILED all land differently. Get caught or repaint your way clear and **Bay 9 News** runs the story — a satirical anchor segment built from the actual CCTV still rendered from a fixed security-camera angle on the real WebGL scene the moment you went wanted, a before/after paint comparison stamped with the real measured percentage, and a ticker. "Save the broadcast" composes all of that into a real 1600×900 PNG. From there: photo mode, a second Unlayer pass on your captured 3D shot, and a personalized run card.

Everything is original work: a fictional Solana Bay, an authored coupe, procedural low-poly architecture, generated illustrations for the cover, Nico, the chase loading screen, the respray booth, and the news anchor — no real brands or people — plus an optional synthesized radio bed and siren, off by default.

## Why the editor is central

- `src/Editor.tsx` mounts the real `@unlayer/react-image-editor` with Draw, Text, Filter, Crop, Shapes, and Stickers, and switches into a dark-themed respray mode with its own live change meter polling `getImage()` every 1.4s.
- Unlayer's native `onSave({ dataUrl })` is the only way to fit a livery, drop a wanted star, or keep a photograph. The save gate rejects an unedited export when runtime evidence is available and tracks changes before Save can clear the dirty flag.
- `src/paint-diff.ts` is the entire "did you change it" logic: draw both saved bitmaps to a 160×80 canvas and count pixels whose colour moved past a threshold. No recognition, no heuristics about *what* was painted — only how much.
- `src/World.tsx` loads the saved `dataUrl` as a Three.js texture onto the car and captures the actual WebGL canvas — once for the wanted CCTV still, again for photo mode.
- `src/News.tsx` composes the saved broadcast PNG from those real captured images: the CCTV still, the before/after livery, and the measured change percentage — nothing here is a mock-up.
- `src/driving.ts` is pure, dependency-free game logic (wanted heat, star thresholds, cop pursuit, the respray star math, bust timing) with its own `node:test` suite in `tests/driving.test.ts` — none of it touches rendering.
- Livery content changes the car's look, **not its handling or score**. Driving, checkpoints, time, drift, boost, and how many stars you're carrying decide the outcome.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Accelerate / brake | W / S or up / down | Gas pedal / brake-drift pedal |
| Steer | A / D or left / right | Left / right buttons |
| Drift | Space (or brake) while steering at speed | Brake-drift pedal + steer |
| Boost | Shift while accelerating | Lightning button |
| Pause | Escape or pause button | Pause button |
| Inspect / frame car | Drag the scene | Drag horizontally |

An optional automatic throttle keeps the car accelerating while the player steers. Brake still interrupts it. Leaving the tab pauses the run. Motion is reduced when the browser preference requests it. Sound starts only after the radio toggle is pressed.

The mobile editor reflows the real native tool settings beneath the canvas and labels its icon-only Save/Cancel actions. No replacement drawing tool is used.

## Run locally

Use Node 22.13+ (Node 25 was used during development).

```sh
npm ci
npm run dev
npm test
npm run build
```

Open `http://127.0.0.1:5188`. Vercel serves the static `dist` directory. There is no server, secret, runtime AI call, login, or API key to configure.

## Storage and dependencies

The latest livery, callsign, and personal best are stored in this browser's local storage. Captured CCTV stills, photographs, and run state live in memory only. Storage failure does not prevent the current session from working. **New build** clears the fitted livery. No analytics or application backend is present.

The hosted Unlayer runtime and its assets require a network connection. Google Fonts are requested with local font fallbacks. WebGL is required for the 3D world; an explicit error is shown when unavailable. The app requests no physical camera, microphone, or location permissions — photo mode and the CCTV still both capture the game's own WebGL canvas.

See [verification](docs/verification.md), [asset provenance](docs/provenance.md), [competition strategy](docs/competition-strategy.md), and the [submission kit](docs/submission-kit.md).
