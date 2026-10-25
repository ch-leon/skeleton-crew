# Slice validation

## Automated
- TypeScript check and Vite static production build pass; generated HTML references `/skeleton-crew/assets/`.
- Vitest exercises pause invariance, bounded power, ward-first damage, dodge, morale/movement, cannon and ward traits, flooding, pumps, fire spread, crew damage control, enemy reload/fire, victory/defeat and simultaneous sinking.
- Twenty seeded raider fights, default power/stations, cargo-hold target: average **205.3 s**, range **202.2–217.6 s**. These are active simulation seconds, not a promise for every tactical configuration.

## Browser smoke checks
Run in local Chromium with touch/mobile emulation; no production-only test hooks added to the game.
- At **844×390** and **667×375**, every enabled button and all 12 room hit areas measure at least **44×44 CSS px**. Canvas scales with device pixel ratio. Desktop **1440×900** also inspected.
- Completed first encounter; selected Rook and queued movement; selected cannons and an enemy room; removed Sails power and added Cannons power; resumed and verified the clock advanced; touched a room and verified time froze.
- Portrait **390×844** shows the rotation curtain. Landscape returns to paused play.
- Full five-stop browser run: paid respects, won the Black Fin duel (**3m24s**), bought hull repairs, paid the ferryman, defeated the Pale Sovereign (**4m41s**). End log contained all five entries; reward gold and hull persisted; restart reset gold to 25. No browser runtime errors.
- Dark chart, cutaway rooms, crew, power rail, encounter modal and ending inspected in screenshots.

## Manual acceptance still needed
- Physical iPhone Safari: landscape with expanded/collapsed browser bars, notch/home indicator safe areas, touch accuracy, rotate back and forth, tab switch, and a full run. The layout includes a compact landscape variant for 320–374 px viewport heights.
- After merge, enable repository Pages source **GitHub Actions** and confirm the main deployment publishes https://ch-leon.github.io/skeleton-crew/.
