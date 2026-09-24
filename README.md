# Sundown Customs

**Your paint. Your getaway.** An original coastal custom-car shop and playable arcade delivery for Unlayer’s Build With React Image Editor challenge.

[Play Sundown Customs](https://sundown-customs.vercel.app) · [Public source](https://github.com/adityasarade/sundown-customs)

![Original Sundown Customs cover illustration](public/art/cover.webp)

## The experience

Open the garage, choose one of three original liveries, and give it your own mark in **Unlayer React Image Editor**. The exact saved bitmap becomes the hood and side-panel texture of a drivable 3D coupe. Take the last delivery: four checkpoints around a fictional coastal circuit, a 90-second closing time, traffic, boost, and drift points. Finish or retry with your custom car intact.

Back at the shop, drag to frame your car, capture the actual 3D scene, and open that photograph in Unlayer for a second creative pass. Download the photograph, original livery, or a personalized 1600 × 1200 run card.

The experience is original: a fictional Solana Bay, an authored Solstice ’87 coupe, procedural architecture and palms, canvas-authored liveries, and an optional original synthesized radio bed. The cover is original generated illustration, distinct from the live low-poly 3D scene.

## Why the editor is central

- `src/Editor.tsx` mounts the real `@unlayer/react-image-editor` component with Draw, Text, Filter, Crop, Shapes, and Stickers.
- Unlayer’s native `onSave({ dataUrl })` is the only way to fit a custom livery and unlock the delivery. The save gate rejects untouched exports when runtime evidence is available and tracks edits before Save clears the dirty flag.
- `src/World.tsx` loads that exact `dataUrl` as a Three.js texture, with proper color space and disposal. A crop is mapped to each authored panel; the original saved bitmap stays intact for download.
- The finished scene is captured from the actual WebGL canvas. Photo editing uses the same native editor and preserves its returned export.
- Livery content changes the car’s appearance, **not its handling or score**. No image recognition or semantic analysis is claimed. Driving actions, checkpoint completion, time, drift, boost reserve, and collisions determine the score.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Accelerate / brake | W / S or up / down | Gas / drift pedals |
| Steer | A / D or left / right | Left / right buttons |
| Drift | Space while steering at speed | Drift + steer |
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

The latest livery, callsign, and personal best are stored in this browser’s local storage. Other photographs and run state are held in memory. Storage failure does not prevent the current session from working. **New build** clears the fitted livery. No analytics or application backend is present.

The hosted Unlayer runtime and its assets require a network connection. Google Fonts are requested with local font fallbacks. WebGL is required for the 3D world; an explicit error is shown when unavailable. The app requests no physical camera, microphone, or location permissions. Photo mode captures the game canvas only.

See [verification](docs/verification.md), [asset provenance](docs/provenance.md), [competition strategy](docs/competition-strategy.md), and the [submission kit](docs/submission-kit.md).
