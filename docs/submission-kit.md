# Sundown Customs — submission kit

Prepared September 24, 2026. Publication and validation status is recorded in `verification.md`. This document is a draft kit, not an official contest submission receipt.

## Links

- Live: https://sundown-customs.vercel.app
- Public source: https://github.com/adityasarade/sundown-customs
- [Official submission form](https://docs.google.com/forms/d/e/1FAIpQLScfzk0EYvIZb9AuqI3A33H8dIk8WdlWPFNDz5S7TsaPrlVzVw/viewform)

## One-line pitch

Paint your getaway car and your crew emblem in Unlayer, get five wanted stars for the livery, then repaint it mid-chase to vanish — and watch Bay 9 News air your actual car.

## Form-ready description

Sundown Customs is an original GTA-inspired crime-arcade set in fictional Solana Bay, built around Unlayer React Image Editor across five branded contexts of the same native editor. You stamp pre-built decals (crew badges, race numbers, fictional sponsors) from the Decal Rack onto a livery, then open it in the Paint Booth — a context with its own Unlayer `translations` (Draw → "Spray can", Text → "Tag", Shapes → "Stencils", Save → "Fit the wrap") and custom tool icons. The exact saved bitmap becomes the hood and door texture of a drivable 3D coupe. A second context, the Crew Emblem Creator, builds a 512×512 GTA Online–style badge that rides the car roof, the HUD, and the news broadcast.

Then Nico sends you on The Last Delivery. At the north pier the harbour cameras clock your paint: WANTED. Police cruisers chase you along your own driving line, a helicopter searchlight joins at three stars, and a BUSTED meter fills if you stall. Your way out is Spray & Pray: drive into the respray booth and the game pauses while Unlayer reopens on your current livery in a dark, disguise-kit-equipped context. Kits load straight into the running editor via the instance `reset()` API; a straight per-pixel comparison between the paint the cameras saw and your new save measures how much you changed — every 8% drops a wanted star, with a live meter while you paint. The repainted bitmap is fitted to the car instantly and the chase resumes.

Finish (MISSION PASSED), get BUSTED, or run out of time, and Bay 9 News airs the story: a satirical anchor segment built from a real security-camera still of your car rendered from the 3D scene, your before/after livery, the measured change percentage, and your crew emblem. Save the broadcast as a 1600×900 PNG, then use photo mode, a fourth Unlayer context (Snappix) on your captured shot, a parody BAYFEED post, and a downloadable run card. GTA-style HUD (stars, cash, radar, phone texts), three synthesized radio stations, original generated art, keyboard and touch controls. No login, backend, runtime AI service or franchise assets.

## Judge route (4 minutes)

1. Open the garage (Nico's intro), pick a starting livery and underglow.
2. Stamp a couple of **Decal Rack** symbols onto the livery, then open the **Crew Emblem Creator** and save a quick emblem (it lands on the roof and HUD).
3. **Make it yours**: open the paint booth, add text or a brush stroke, native **Save**. The car wears your exact pixels.
4. **Take the delivery** (automatic throttle optional). Drive north to the pier: WANTED.
5. Keep moving, turn right, then right again onto the east road. Drive into the pink **Spray & Pray** marker and load a **disguise kit** for a big, fast repaint. Save, watch the stars drop.
6. Finish the loop back at the garage → MISSION PASSED.
7. **You made the news** → Bay 9 airs the CCTV still, the before/after paint, and your crew emblem → **Save the broadcast**.
8. **Photo mode** → capture the 3D scene → open in **Snappix** (borders, filters, caption) → Save posts to **BAYFEED**.

## Draft X post — not published

Paint your getaway car and your crew emblem in @unlayer's React Image Editor. Get five wanted stars, then repaint mid-chase to disappear — every 8% of paint you change drops a star. Bay 9 News airs your actual car after.

#BuiltWithImageEditor

https://sundown-customs.vercel.app

## Entrant’s final steps

- Public site and source passed anonymous HTTP checks; the complete production route is documented in [verification](verification.md).
- Star the upstream React Image Editor repository if required by the challenge FAQ.
- Publish the launch post with a screenshot or gameplay clip and include its URL in the form.
- Submit the official form and retain the receipt before **September 24, 23:59 UTC** (**September 25, 05:29 IST**).

No social post or competition form has been sent by this build workflow. Fill the form’s contact email with the entrant’s preferred address and confirm its required boxes yourself.
