# Sundown Customs v3

Draw the escape, paint the evidence, then put your takeover on the city’s screens.
An original 3D crime-arcade for the web where seven Unlayer image-editor sessions become game state.

[Play Sundown Customs](https://sundown-customs.vercel.app) · [Source](https://github.com/adityasarade/sundown-customs)

![Original Sundown Customs cover illustration](public/art/cover.webp)

## Seven ways the image editor drives the game

Every session uses the native `@unlayer/react-image-editor`, but `editor-contexts.ts` gives each a context-specific theme, enabled tool set, custom SVG tool icons, and Unlayer translations.

1. **Paint Booth: livery to 3D car.** Start with a livery and optional Decal Rack composition, then save pixels that Three.js applies to the car’s hood and side panels. Light theme; draw, text, shapes, stickers, filter, and crop are relabelled **Spray can**, **Tag**, **Stencils**, **Decals**, **Tint**, and **Trim**; save/cancel are **Fit the wrap**/**Bail**.
2. **Crew Emblem: roof, HUD, BAYFEED, and news.** A procedural badge seed becomes an editable crew mark, then appears on the roof, in the driving HUD, as the BAYFEED avatar, and in Bay 9 news. Dark theme; stickers, shapes, text, draw, filter become **Symbols**, **Badge shapes**, **Crew name**, **Freehand**, **Colourway**; **Rep the crew**/**Back** save or cancel.
3. **THE PLAN: drawn route to mission.** On Nico’s map, route ink is analysed pixel-by-pixel, snapped to the road grid, and turned into the destination, GPS ribbon, checkpoints, marked cash crates, and camera heat forecast. Dark theme; draw, shapes, text, stickers become **Route marker**, **Circle a crate**, **Notes**, **Pins**; **Lock the plan**/**Back**. Filters are off.
4. **Spray & Pray: repaint while chased.** The mid-chase editor compares saved pixels with the paint police saw; each full 8% of change clears a wanted star. Its dark context has a live change meter and disguise kits loaded into the running editor with `reset()`; filter, draw, shapes, stickers, text become **Instant respray**, **Spray can**, **Cover-up**, **Fake decals**, **New tag**; **Respray & go**/**Drive off**.
5. **Ink & Iron: tattoo to driver and report.** Pick original flash, refine it in the editor, then its cropped arm texture is used on the driver’s 3D arm, the busted mugshot, and the news witness sketch. Dark theme; draw, text, stickers, shapes, filter become **Needle**, **Script**, **Flash**, **Linework**, **Shading**; **Ink it**/**Chicken out**.
6. **Signal Hijack: deface Bay 9 live.** The composed Bay 9 frame is editable, then airs with static, glitch slices, viewer count, and speech-synthesized anchor lines; the saved takeover also becomes every in-city billboard. Dark theme; draw, text, stickers, shapes, filter become **Deface**, **Your message**, **Pirate stickers**, **Censor bars**, **Signal noise**; **GO LIVE**/**Abort**.
7. **Snappix: 3D shot to BAYFEED.** Capture the real WebGL scene, then crop, grade, border, caption, sticker, or doodle before posting a parody BAYFEED card. Dark theme; crop, filter, frame, text, stickers, draw become **Frame up**, **Snappix filters**, **Borders**, **Caption**, **Stickers**, **Doodle**; **Post to BAYFEED**/**Discard**. Shapes, resize, and corners are off.

## The city

Solana Bay is a 4×4 road grid with civilian traffic, five traffic cameras, two Spray & Pray booths, six possible crate sites, and three drop destinations. The planned route determines the gates, pink GPS ribbon, next-turn card, camera risk, and only the crates the player marked. Cameras can trigger three stars; otherwise a patrol can spot the run. Pursuing cruisers replay the line you actually drove, a helicopter and searchlight appear at three stars, and stalling near a cruiser fills the BUSTED meter.

## GTA radio

The in-browser Web Audio radio includes:

- **COASTLINE FM 88.7** — Sunset synth-pop · 100 BPM
- **NON-STOP NEON 101.3** — Outrun synthwave · 118 BPM
- **BAY SOUL 94.7** — West-coast G-funk · 92 BPM
- **FREESTYLE 105 105.9** — Miami freestyle · 124 BPM
- **BAY TALK 94.1** — Solana Bay talk radio

Station idents and Bay Talk lines use `speechSynthesis`; the engine, pursuit sirens, radio, and UI cues are synthesized in-browser.

## Guided flow

Nico’s BAYPHONE job list exposes the main and optional jobs. The objective pill updates with the next task; contextual help boxes explain the booth, planning, driving, GPS, respray, tattoo, hijack, and photo steps. Loading cards rotate practical tips, and the driving HUD includes the planned GPS card, radar, heat, cash, timer, and current objective.

## Ending and replay

Posting the hijack to the billboards triggers an in-engine fly-by: the camera visits every Bay PD billboard in the 3D city, each now showing your hijacked frame, with a live viewer count and a reactions ticker. It ends on **THE END** — a completion ring, run stats, a gallery of everything you made in the image editor, rolling credits, and a downloadable 1200×1500 "night poster". From there (or from the BAYPHONE once the heist is complete) you can **Play again · keep my crew** — your livery, emblem, plan drawing and tattoo stay as starting points while every job reopens — or **Fresh start · clear everything**, which wipes your creations from this browser and replays Nico's intro.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Accelerate / brake | W / S or ↑ / ↓ | Accelerate and brake-drift pedals |
| Steer | A / D or ← / → | Left / right buttons |
| Drift | Space while steering at speed (brake also drifts) | Brake-drift pedal + steer |
| Boost | Shift | Boost button |
| Radio | R | In-run station button |
| Pause | Esc or pause button | Pause button |
| Inspect / frame car | Drag | Drag |

Automatic throttle is optional; it keeps accelerating until you brake. Switching tabs pauses a drive.

## Testing

- `npm test` currently runs **86 unit tests** across city geometry, GPS turns, driving and pursuit rules, editor-save handling, and pixel-based map analysis.
- `npm run test:e2e` (and `npm run test:e2e:mobile` at 390×844) runs the full v3 playthrough in Chromium. `node tests/e2e/autopilot.mjs` (with `ROUTE=marina|causeway|motel`) drives a full mission using only keyboard input read from live telemetry.
- `node tests/e2e/v3-flow.mjs` is the full v3 playthrough: it draws a route in the real editor, then drives that route with keyboard input.

## Run locally

```sh
npm ci
npm run dev
npm test
npm run test:e2e
node tests/e2e/v3-flow.mjs
```

Open `http://127.0.0.1:5188`.

## Storage and dependencies

The browser stores the callsign, fitted livery, crew emblem, tattoo, underglow, and personal best in local storage. Run captures, CCTV stills, photos, plans, broadcasts, and session state are in memory. There is no application backend, login, secret, runtime AI call, or analytics.

Dependencies include React, Three.js, `@unlayer/react-image-editor`, Lucide, Vite, TypeScript, and Playwright. The hosted editor assets and requested Google Fonts need network access; WebGL is required for the 3D world. The app does not request physical camera, microphone, or location permissions.

## Original art

Illustrations are generated original artwork; the city, vehicle, decals, tattoo flash, audio, and fictional outlets are original to this project. No real brands are used. Sundown Customs is fan-made and is not affiliated with Rockstar Games.
