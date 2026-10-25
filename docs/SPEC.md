# Skeleton Crew — first playable slice

## Scope
Static Vite + TypeScript canvas game, no backend or external assets. One sea, five sequential chart nodes: three two-choice encounters and two battles, ending against the tougher Pale Sovereign. Persistent hull, gold and three pirates' morale; battle rewards; victory/defeat ship's log; restart. Canvas cutaway ships have six rooms each. Dark nautical ink, brass and ghost green palette.

## Controls & phone layout
Landscape iPhone Safari is the primary target (667×375 CSS px and larger); portrait shows a rotation curtain and pauses combat. All interactive hit areas are at least 44×44 CSS px. Touch battlefield to pause, then select a pirate (roster or room), then a friendly room to order movement. Select Cannons, then an enemy room to set repeating fire. Bottom rail −/+ buttons distribute six power across four systems (0–3 each). Explicit Resume / Pause toggle; Space on desktop. Orders queue while paused and execute on resume. Switching tabs pauses. Help explains the same controls. No gesture or audio dependency.

## Systems & initial balance
- Hull: player 180, raider 130, ghost 170. Gold starts 25; wins pay 35 / 65. No hull repair from crew: encounters provide hull repairs.
- Cannons: 10 damage, base 16 s recharge at power 2; Gunner stationed there gives ×1.25 recharge. Player chooses a room, enemy picks randomly. Enemy base reload 19 s (ghost 16.5 s), 8 / 10 damage. Charge stalls without power. Damage resolves ward first; sails can dodge.
- Ward-witch: capacity 12, powered recharge 0.18 per power/s after 5 s without impact. Witch-touched stationed there gives ×1.5 recharge. Sails dodge 5% per power. Bilge pumps drain each room 0.035 water per power/s.
- Six rooms: Cannons, Ward, Sails (upper); Bilge, Hold, Quarters (lower). Health 100; health and water reduce system efficiency, minimum 30% while powered.
- Three pirates: Rook (Gunner), Nell (Mender, ×1.8 repairs), Vesper (Witch-touched). Morale 75/100, health 100; morale below 35 slows work/movement to 60%. Travel between rooms takes ~1.2 s per grid step, slower in water. Crew automatically extinguish, seal holes, then repair occupied rooms. Crew recover health slowly in safe rooms, morale falls under hazards.
- Unwarded hits: room damage ×2; 30% fire chance, 30% lower-deck breach chance. Fire grows/spreads to adjacent rooms, damages hull, room and crew. Breaches add water; flooded rooms take damage and slow crew. Crew seal breaches at 0.12/s and extinguish at 0.20/s; repair 3 health/s. Enemy has slow automatic damage control. Crew incapacitate at 0 health and recover after a win.
- Target battle length 180–300 active seconds with normal power and crew management; pause time excluded. Fixed 0.1 s simulation steps and injected seeded random for reproducible tests. No offline simulation.

## Acceptance checks
- `npm ci`, `npm test`, `npm run build` pass; build uses `/skeleton-crew/` asset prefix.
- Both ships show six touchable rooms; three named traits, morale and health are visible. Every action target measures ≥44 px at 667×375. Portrait blocks play; rotation/tab hiding pauses.
- While paused, elapsed time, hazards, reload and movement freeze. Crew movement, repeat target and power changes take effect after resume; total allocated power never exceeds six.
- Ward absorbs before hull; sails dodge; cannon power/trait changes reload; holes admit water; pumps drain; fires spread; crew repair/extinguish; low morale slows work. AI fires at random rooms.
- Five nodes can complete in order; exactly two choices per text encounter change resources; first battle awards gold; final ghost is stronger; hull 0 loses, enemy hull 0 wins; ending records choices, battles and surviving crew.
- PR CI runs tests/build; main push builds and deploys static `dist` through GitHub Pages Actions. Repository Pages source must be GitHub Actions. Physical iPhone Safari acceptance remains a manual device check.
