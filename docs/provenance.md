# Asset and implementation provenance

Prepared September 24, 2026.

- **Cover illustration:** `public/art/cover.png`, created for this project with OpenAI’s built-in image generation tool. Original fictional coastal workshop, coupe, and mechanic; no supplied franchise or competitor image was used. `cover.webp` is an optimized derivative produced with cwebp, quality 86. The illustration is cover art, not a screenshot of gameplay.
- **3D car and world:** authored procedural geometry in `src/World.tsx`, including the coupe, marina, buildings, palms, signs, roads, and civilian cars. No external model pack or game asset is included.
- **Liveries:** three original 1200 × 600 Canvas 2D compositions in `src/artwork.ts`. User edits are provided by Unlayer and used directly as textures. No AI-generated artwork is fabricated at runtime.
- **Audio:** original Web Audio synthesis in `src/audio.ts`; no commercial music or franchise radio recording. User gesture required.
- **Typography:** Barlow Condensed and DM Sans from Google Fonts (SIL Open Font License). The browser provides fallbacks if those requests fail.
- **Icons:** Lucide (ISC license).
- **Libraries:** React, Three.js, Vite, TypeScript and Unlayer React Image Editor. Their upstream license notices remain in installed packages and generated bundles where required. Unlayer’s hosted runtime remains subject to its own terms.
- **Integration helpers:** editor warmup, accessible action names, and save gate adapted from this workspace’s Dead Air project. The new game, interface, geometry, liveries, and cover were authored for Sundown Customs.

This is an independent GTA-inspired competition entry, not an official Rockstar or Take-Two product. It uses no franchise logos, characters, screenshots, trailer footage, leaked assets, real-world map data, or competitor code/artwork.
