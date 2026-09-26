# Sundown Customs v3 — submission kit

## Links

- Live: https://sundown-customs.vercel.app
- Public source: https://github.com/adityasarade/sundown-customs
- [Official submission form](https://docs.google.com/forms/d/e/1FAIpQLScfzk0EYvIZb9AuqI3A33H8dIk8WdlWPFNDz5S7TsaPrlVzVw/viewform)

## One-line pitch

An original 3D crime-arcade where seven customized @unlayer image-editor sessions turn player-made pixels into the car, mission, tattoo, broadcast, billboards, and social post.

## Form-ready description

Sundown Customs v3 is an original web crime-arcade set in fictional Solana Bay, built around the native Unlayer React Image Editor. Seven branded contexts use Unlayer translations, tool icons, tool sets, and themes to make image editing the game’s input system. Paint Booth livery becomes the hood and doors of a Three.js car; Crew Emblem becomes the roof texture, HUD mark, BAYFEED avatar, and Bay 9 crest. In THE PLAN, the player draws on Nico’s map: pixel analysis snaps route ink to a 4×4 road grid and creates the destination, GPS ribbon, checkpoints, marked cash crates, and camera heat.

Driving has keyboard and touch controls, traffic, cameras, cops that replay the player’s recorded line, a three-star helicopter, BUSTED meter, GPS card, BAYPHONE jobs, loading tips, and synthesized GTA-style radio. At Spray & Pray, the editor reopens mid-chase with a live per-pixel change meter; every 8% of changed paint clears a wanted star, and disguise kits use the editor instance `reset()` API. Ink & Iron maps edited tattoo art to the driver’s 3D arm, mugshot, and news. Signal Hijack lets players deface the Bay 9 broadcast; it plays back with glitch/static and speech, then appears on city billboards. Finally, a captured WebGL photo goes through Snappix and posts to BAYFEED. No login, backend, runtime AI service, or real brands.

## Five-minute judge route

1. Open the garage, enter a callsign, choose a base livery, optionally add a Decal Rack item, then choose **Make it yours**. Add a small mark in the Paint Booth and save **Fit the wrap**; inspect the result on the 3D car.
2. Open **THE PLAN** from BAYPHONE. In Nico’s map, select **Route marker**, draw from START along roads to a gold drop, optionally circle a yellow crate, and choose **Lock the plan**. On Plan Locked, confirm the generated route, checkpoints, camera count, and stash count, then **Start the run**.
3. Drive with W/A/S/D or arrows. Follow the pink ribbon and GPS card through the yellow gates. Press **R** to hear a station ident. A camera or patrol can start the pursuit; keep moving to avoid BUSTED.
4. If wanted, enter a pink Spray & Pray marker. Select a disguise kit, see it load into the real editor, save **Respray & go**, and watch the per-pixel meter and wanted stars update. Finish the route.
5. From the result flow, open **Hijack Bay 9**, draw or add a message, then **GO LIVE**. Watch the glitching broadcast and choose **Put it on every billboard**. If time permits, try Ink & Iron or capture a photo and post it through Snappix to BAYFEED.

## Draft X post — not published

Sundown Customs v3 turns player-made pixels into a 3D getaway car, a drawn-route mission, a tattoo, a hijacked news broadcast, and city billboards. Built with seven customized editor contexts from @unlayer. #BuiltWithImageEditor

https://sundown-customs.vercel.app

## Entrant’s final steps

- Confirm the live site and public source links work in an anonymous browser session.
- Run `npm test` (84 tests at this revision), `npm run test:e2e`, and `node tests/e2e/v3-flow.mjs` before submitting.
- Publish the launch post with a screenshot or gameplay clip and include its URL in the form.
- Submit the official form and retain its receipt. Use the entrant’s preferred contact email and confirm required form fields directly.

No social post or competition form is sent by this repository.
