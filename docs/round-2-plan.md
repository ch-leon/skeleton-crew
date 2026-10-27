# Round 2 implementation plan

Status: implementation specification only. This PR adds only this document; no gameplay, configuration, or dependency changes.

## Goal and code baseline

Build one replayable Hollow Sea voyage around three additions: a branching sea chart pursued by the ghost armada, two-way boarding with grappling hooks, and a real Lantern Cay shop. Keep the current static Vite/TypeScript/Canvas architecture, tactical pause, nautical palette, and landscape iPhone Safari target. No backend, external assets, account, save migration, audio requirement, or engine is needed.

Reviewed repository baseline: main at `38d1849b9feadfd04eb0bd5098d493e7619c7957`. References below describe that code, not hypothetical existing abstractions.

| Existing file / symbols | Current behavior and required seam |
| --- | --- |
| `src/main.ts`: `nodes`, numeric `encounters`, `stop`, `visit`, `renderMap` | Five sequential stops; one enabled node; encounter lookup, ghost selection and ending depend on indices. Replace index logic with node IDs and encounter IDs. |
| `src/main.ts`: `showEncounter`, `resolveBattle`, `finish` | Lantern Cay is two one-shot choices, including 25 gold for 45 hull. Gold starts at 25; battles award 35/65. Wins restore crew health and add 8 morale. Route progression and rewards are coupled here. |
| `src/main.ts`: `roomClick`, `startBattle`, `updateBattleUI`, `frame` | Friendly room taps move crew; enemy taps always target cannons. Three-card roster, initials, morale average and end-screen denominator assume three pirates. Simulation runs fixed 0.1-second steps; pause clears accumulated time. |
| `src/combat.ts`: `Pirate`, `Ship`, `Combat`, `createCombat` | Crew have room/destination/travel but no identity, faction or ship location. Enemy ships have no crew. New battles reset player rooms, ward and charge, while hull and crew persist. |
| `src/combat.ts`: `systems`, `traitBoost`, `impact`, `step` | Crew work only on their roster's ship; enemy damage control is automatic. Cannons use fixed 10 damage / 16-second player reload. Efficiency has a 30% floor. Hull loss precedes victory for simultaneous sinking. |
| `src/render.ts`: `drawBattle`, `pirate`, `Box`, `colors` | Six rooms per ship, canvas graphics with DOM room buttons layered above. Crew drawn from each ship's roster; palette has three entries. Preserve CSS-pixel hit boxes and DPR scaling. |
| `src/style.css` | Fixed five-node chart and three-column roster; safe-area rules, portrait curtain, reduced-motion support, compact landscape rules down to 320–374 px high. New controls must not shrink existing room targets. |
| `src/combat.test.ts`, `package.json`, `.github/workflows/ci.yml` | Vitest covers existing combat rules and 20-seed 180–300-second baseline pacing. CI runs npm ci, tests and TypeScript/Vite build. |
| `docs/SPEC.md`, `docs/VALIDATION.md`, `README.md` | First-slice requirements and validation history. Physical iPhone Safari checks are still outstanding; past Chromium checks are not device validation. |

The new mechanics below supersede the five-stop flow for round 2. Preserve existing rules unless an explicit change is stated. All numeric additions are initial tuning values, centralized in the owning feature's constants.

## Delivery: exactly three workstreams

Independent feature development requires a small interface handoff because the current app is monolithic. Do not let three branches each edit main.ts or combat.ts. The handoff and final integration belong to the feature owners below, not a fourth workstream.

| Workstream | Exclusive file ownership throughout implementation | Deliverable |
| --- | --- | --- |
| A — Branching chart / run integration | Existing `src/main.ts`, `src/style.css`; new `src/run.ts`, `src/run.test.ts`, `src/contracts.ts`, `src/chart.ts`, `src/chart-view.ts`, `src/chart.css`, `src/chart.test.ts`, `src/integration.test.ts` | Graph, fog, transitions, run state, shared app wiring, dynamic roster and shared help/ending UI. |
| B — Boarding / combat integration | Existing `src/combat.ts`, `src/combat.test.ts`, `src/render.ts`; new `src/boarding.ts`, `src/boarding.test.ts`, `src/boarding-view.ts`, `src/boarding.css` | Crew identity/location, grapples, melee, capture, enemy boarding AI, rendering and combat consumption of equipment. |
| C — Lantern Cay / equipment definitions | New `src/port.ts`, `src/port.test.ts`, `src/port-view.ts`, `src/port.css`, `src/equipment.ts`, `src/equipment.test.ts` | Catalog, stock, validated transactions, shop UI, cannon and charm definitions / derived modifiers. |

No other source files, package files or workflows need changes for this scope. Each owner imports its feature stylesheet from its own view module. Feature selectors are scoped under .chart-r2, .boarding-r2 or .port-r2. Only A changes shared CSS. These are proposed paths, not files present at the baseline.

### Interface handoff and merge sequence

1. A publishes the contracts, canonical run-state adapter, and main.ts mount/callback slots; retain the old flow until the feature modules are connected. B publishes additive crew/location and equipment fields with defaults and compatible exports from combat.ts. A and B keep their exclusive files even during this step.
2. Freeze the agreed API shape below on the shared base. C publishes equipment types and pure defaults early. Feature implementations then proceed independently against small fixtures and no-op adapters; nobody copies another owner's logic into their files.
3. A, B and C submit their own modules/tests. Changes to a contract go through A; changes to combat types through B. Request an owner patch instead of touching their files.
4. A wires the real chart, boarding view and port view in main.ts using the agreed calls; B wires equipment effects into combat.ts. Merge completed features in any order after the handoff, keeping incomplete entry points unavailable. A runs integrated acceptance after all three are present.

This is implementation sequencing only; this planning PR does not perform the handoff or any extraction.

### Shared contract and state rules

- A owns `RunState`: seed, player ship, gold, equipment, chart, current node, active visit, cleared node IDs, journal and terminal outcome. There is one canonical gold/ship state, replacing the separate main.ts globals. No feature keeps a second wallet.
- Equipment is `{ weapon: 'roundshot' | 'chainshot', charms: CharmId[] }`; default roundshot and no charms. C owns these identifiers, definitions and pure `deriveModifiers(equipment)`. B consumes a resolved modifier snapshot when creating combat; no runtime circular imports. Use type-only imports where needed.
- B extends Pirate with stable `id`, `faction: 'player' | 'enemy'`, `shipId: 'player' | 'enemy'`, and explicit transit state. Existing room/destination/travel remain same-ship movement fields. Ship.crew is the ownership roster, never a container for current occupants. An occupant query examines both rosters and current location. Do not splice a pirate between rosters.
- B exposes `queueBoard(combat, crewId, enemyRoom)`, `queueRetreat(combat, crewId)`, `moveCrewById(combat, crewId, shipId, room)`, `stepBoarding(combat, dt)`, and `finalizeBoarding(combat)`. Validation failures return a reason without mutation. Commands queue while paused; simulation progresses only on resume.
- A's chart API separates `previewJump(run, nodeId)` from `commitJump(run, nodeId)` and `completeVisit(run, visitId, outcome)`. Only completion clears the node; only a committed jump advances fog. Visit IDs make rewards/completion idempotent.
- C exposes `createPortStock(seed, nodeId)`, `quotePurchase(run, stock, itemId)`, and `purchase(run, stock, itemId)`. Quotes show exact costs/effects; purchase revalidates against current state and commits debit, benefit and stock together, or changes nothing. No timers or combat mutation in the shop.
- Views mount into owner-provided DOM roots and receive read state plus command callbacks. Each mount returns dispose(); remove event listeners and stale controls on transitions. A owns the common header, modal/focus handling, screen lifecycle and visibility/rotation handlers. B's view emits crew/board/retreat orders; A routes room taps using an explicit command mode.
- A is the sole award/ending dispatcher. A completed battle calls B's cleanup before applying the existing 35/65 reward, health recovery and +8 morale, then clears the visit exactly once. New encounter payloads use IDs, never stop numbers. Equipment and recruits persist across battles, not across refresh/restart.

## A — Branching sea chart and ghost armada

### Topology and encounters

Use a seeded, validated directed graph laid out left to right in three lanes:

- Start anchorage at depth 0; three nodes at each depth 1–5; one Pale Sovereign boss at depth 6.
- Each start/intermediate node has 2–3 distinct outgoing choices to the next depth, except depth-5 nodes, which converge on the one boss. Mark this final convergence clearly rather than pretending it offers three choices.
- No backtracking, lateral loops, duplicate destinations, or orphan nodes. Every node is reachable from start and can reach the boss. At least one outgoing edge from every nonterminal node is a normal passage.
- Each depth-2 node is a Black Fin battle; depth 4 offers one optional battle and two encounters. Depth 3 includes Lantern Cay in one lane; every depth-2 node must connect to it plus at least one alternative. All paths therefore have access to the port, but visiting it is optional.
- Reuse Drowned Bell and Widow's Passage encounter definitions at other eligible nodes with distinct node IDs; avoid consecutive identical encounters on an edge. Add names/flavor as data, preserving their existing two-choice resource effects. Do not reuse the old Lantern Cay encounter.
- Every edge carries `jumpCost: 1 | 2`: normal passage costs one fog advance; a clearly marked treacherous passage costs two. Select optional cost-2 edges deterministically from the seed. Never conceal their cost behind encounter resolution.
- Seed topology/encounter assignment independently from combat randomness, using the existing seeded utility or a shared deterministic helper. Reopening a chart cannot reroll routes or shop stock. If generation validation fails, use a known valid authored graph; test the fallback.

### Fog model: discrete, forecastable pressure

Fog moves only on committed jumps, including the boss approach. It never advances with real time, shopping, reading, pause, battle duration, tab hiding or animation.

State: `fogFront = -2`, `fogContacts = 0`; start depth = 0. For destination depth d and edge cost k, preview `nextFront = fogFront + k`. All depths at or behind nextFront are covered. Commit advances the front by k exactly once. If d <= nextFront, apply direct 30 hull damage (bypassing ward/sails) and increment fogContacts. The second contact ends the run as “Overtaken by the ghost armada,” regardless of remaining hull. Hull reaching zero on the first contact also loses.

Example: from start, two cost-2 passages yield arrivals (depth 1, front 0, safe), then (depth 2, front 2, first contact, −30 hull). A following cost-1 passage to depth 3/front 3 causes the second contact and defeat. Six normal passages remain safe. Thus choices affect pressure without a wall-clock deadline; once caught, the warning must explain that the next jump is fatal under this round's rules. No fog-reset purchase or escape mechanic is included.

Display the front on the whole chart, safe/covered nodes with patterns and labels, current separation, and a permanent “Fog advances on sailing” hint. Preview must show edge cost, projected front, damage and fatal outcome before confirmation. Covered reachable nodes remain selectable with an explicit dangerous Sail confirmation, rather than soft-locking the run.

Jump transaction order:

1. Validate map screen, resolved current visit, reachable destination and no pending transition.
2. Lock the Sail control and record the unique arrival/visit ID.
3. Commit destination and fog front; resolve fog damage/contact and journal it.
4. If terminal, show the loss screen; do not open the encounter/shop/boss or award anything.
5. Otherwise dispatch by node kind: encounter, paused battle, port, or paused boss.
6. On completion, record cleared node and return to chart; only defeating the boss wins.

An encounter hull loss still ends the run immediately. Closing help/log never clears a visit. Leaving the shop clears that port visit but does not advance fog again; the next Sail does. Duplicate taps/callbacks must not double-jump, double-award or double-advance.

### Touch layout

Replace the large chart intro with a compact status strip. Reserve at least 168 px for the three-lane map (three 44 px rows plus gaps); horizontally scroll the chart at smaller widths instead of shrinking nodes. Keep current position and next choices visible on entry; provide 44 px previous/next chart controls as an alternative to scrolling. Decorative SVG edges never intercept touches.

Tapping a node selects it and shows its name, kind, passage cost and fog forecast in a detail panel; it does not sail. A distinct 44 px-high Sail button commits. Unreachable nodes can show read-only details but cannot enable Sail. Use short node labels on the map and full names in the panel. Show a compact legend for battle, encounter, port, boss and fog; no meaning conveyed by color alone.

### Acceptance criteria

- A1: For at least 100 seeded graphs, all structural constraints hold, every normal choice offers 2–3 destinations, and the final convergence is the only single-choice exception.
- A2: Selecting, scrolling, reading and waiting leave the entire run unchanged. One accepted Sail advances exactly its edge cost, even under repeated taps.
- A3: Preview and actual fog outcome agree at safe, first-contact, zero-hull and second-contact boundaries; fatal fog resolves before destination content.
- A4: The player can choose divergent paths, visit or skip Lantern Cay, and reach the Pale Sovereign. Boss identity/endings use node kind, not an index or count.
- A5: Encounter completion, battle reward, port departure and restart leave consistent current/cleared nodes. Restart resets fog, stock, wallet, equipment, crew and log.
- A6: Nodes and Sail remain readable and operable at 667×375 and 844×390, including compact toolbar conditions.

## B — Boarding with grappling hooks

### Orders, location and grapple lifecycle

Both ships receive crew. Keep the player's initial three named pirates; give Black Fin two defenders and the Pale Sovereign three, each at 100 HP / 75 morale. Start enemies without player trait bonuses for initial tuning. Roster capacity for the player is five, including incapacitated crew.

A grapple is a reusable combat action, not a shop requirement or a new powered room. Each faction can have one crossing active at a time, with a 12-second cooldown after an outbound crossing finishes. Ready at combat start. Boarding stages from friendly Cargo hold (room 4), takes 2 seconds to attach plus 3 seconds to cross, and arrives in the selected enemy room. Travel to staging uses existing movement timing and morale/water penalties; attach/cross timings are fixed.

Selecting a pirate exposes Board and, when abroad, Retreat. Board then tapping an enemy room queues the outbound order, clears any conflicting movement order and labels the destination. A pending order may be replaced/cancelled before crossing starts; an active crossing cannot be retargeted. Invalid orders explain “Hook cooling down,” “Already crossing,” or “Crew incapacitated.” Queuing on the home ship does not remove the pirate from home occupancy until crossing begins.

Represent transit explicitly with origin/destination ship and room, phase and remaining time. During the crossing the pirate is in neither ship's occupancy list: no work, traits, melee or room hazards. During staging/attachment the pirate remains vulnerable in Cargo hold. Incapacitation there cancels the order and releases the hook. No rope cutting, ranged interception or multi-pirate group command in this round.

Retreat is always available for a conscious pirate aboard the other ship. They move to that ship's Cargo hold, then return in a 3-second crossing to their home Cargo hold; no attach time and no outbound cooldown requirement. One active crossing per faction still applies: retreat requests wait FIFO behind the active crossing and take priority over outbound requests. The return rope is not blocked by hostile room ownership. Incapacitation before crossing cancels retreat. Telegraph queued/active retreat; never teleport at command time.

### Melee, hazards and captured rooms

Use the same fixed 0.1-second simulation tick and pause gate as artillery:

- Opposing conscious occupants in the same room fight automatically. Each deals 5 HP/second × moraleRate (1 or 0.6), independent of trait. Pick the lowest stable-ID conscious opponent each tick; apply all damage simultaneously from the pre-damage snapshot, so mutual incapacitation is possible.
- A moving pirate remains in its origin room until travel completes, matching current movement semantics; it can be attacked there but does not attack or work while moving. Recompute occupancy after arrivals and before melee.
- Fighting suppresses normal repair/extinguishing/sealing and trait bonuses for engaged crew. Boarders on hostile ships never perform friendly damage control or grant station traits there. Safe, unengaged defenders retain existing work and recovery.
- Hazards and health/morale updates use the physically occupied ship/room, once per pirate per tick. Crossing pirates receive none. Prevent passive health regeneration while engaged; preserve existing safe-room regeneration otherwise.
- Room capture requires at least one stationary conscious invader, no conscious defenders, and 3 uninterrupted seconds. Progress resets when contested or vacated. A captured room remains occupied only while at least one conscious invader stays there; when the last leaves or falls, control returns immediately to the ship's faction.
- Captured Cannons/Ward/Sails/Pumps supply zero effective output despite assigned power: stall charge without clearing it, stop ward regeneration without deleting existing ward, remove dodge, or stop pumping respectively. This overrides the current 30% efficiency floor. Power allocation is retained and cannot exceed six; full system behavior resumes when control returns.
- Cargo hold/Quarters capture is visibly marked but has no system effect. Capture neither inflicts free hull damage nor wins the battle. Eliminating the enemy crew leaves an unmanned enemy ship; hull destruction remains the victory condition.
- Retain enemy automatic damage control only in unoccupied rooms with no invaders; suppress it in contested/captured rooms. Enemy defenders use the same work rules as friendly crew. Recheck battle pacing because enemy crew repair changes durability.

Tick order: advance movement/crossings; compute occupants; apply simultaneous melee; apply occupant hazards and work once; update capture; run systems and artillery; settle terminal hull results. Suppress safe-room regeneration for incapacitated crew, preserving the existing rule that they recover only after victory. When a staging/crossing slot is released, dequeue the next valid request on the following tick. Extract crew work from the current systems loop so it cannot execute twice. Pause/result checks occur before every simulation mutation.

Enemy AI uses a deterministic decision clock (every 2 active seconds). Prioritize defending a home room containing invaders, then returning an abroad pirate below 25 HP. When the hook is ready, send at most one boarder abroad, keeping at least one conscious home defender; target player Cannons first, then Ward if Cannons already contains an enemy boarder. Telegraph the 2-second hook attachment and destination in the event strip. Defender movement uses the same APIs as player orders. No AI action during pause or after result.

### Battle completion and rendering

Preserve defeat precedence when both hulls reach zero. On a player victory, finalize all owned pirates back to player Cargo hold, including incapacitated pirates and any active crossings; clear grapples/capture/orders. This is an explicit automatic rescue rule for the round, with a journal summary. Then apply existing post-win full HP and +8 morale. On defeat, freeze the final state and show the loss; no reward, rescue benefit or further AI actions. Never carry enemy crew into the run.

Draw crew by physical location and faction, not array ownership; stable IDs drive selection. Use faction badges/shapes plus distinct colors, capture stripes/progress, a rope during active crossing, and visible home/abroad/transit roster labels. For crowded rooms show a count plus a selectable roster rather than shrinking sprites indefinitely. Palette/initials must support five recruits and enemy pirates.

Command mode is one of inspect, move, aim, board or retreat. Selecting Cannons enters aim; selecting Board enters board; an enemy-room tap in board mode must never retarget artillery. First battlefield tap while running only pauses. Room button accessible labels reflect current action and ship. A integrates these callbacks in main.ts; B supplies boarding controls/render state.

### Acceptance criteria

- B1: Both factions can board and retreat through actual timed phases; one pirate exists in exactly one location or one transit state, never both ships.
- B2: A paused combat snapshot, including AI/capture/grapple timers, is unchanged after stepping. Tab hiding and portrait rotation cannot advance boarding.
- B3: Melee targets deterministically, resolves simultaneous damage, respects morale, and disables incapacitated orders. Hazards/work are applied once at the physical location.
- B4: Capture takes three uncontested seconds, disables only the captured system, and immediately releases when invaders leave/fall; it never bypasses the six-power limit.
- B5: Moving a Gunner or Witch-touched abroad removes their home bonus; invaders never repair or buff the enemy ship.
- B6: Retreat works during cooldown and through contested rooms, subject to normal travel/damage. Victory rescue and defeat cleanup leave no orphan transit or queued order.
- B7: Enemy AI demonstrably boards, defends and retreats without leaving its final defender voluntarily. Boarding and cannon targeting cannot be confused by touch.
- B8: Existing ward/dodge/fire/flood/pause/terminal tests still pass. Review the 20-seed baseline pacing with explicit no-board and AI-board fixtures; document tuning changes rather than simply deleting the pacing assertion.

## C — Lantern Cay shop

### Stock, prices and persistence

Replace the old one-choice encounter with a full port screen. Visits have no combat or real-time fog pressure. Show current gold, actual/max hull, roster count, equipped cannon and charms. Initial catalog:

| Item | Price / stock | Effect and purchase rules |
| --- | --- | --- |
| Oak & pitch | 15 gold; unlimited | Repair up to 30 hull, capped at player.maxHull. Disable at full hull. Show exact gain for partial repairs; fixed price, no hidden prorating. |
| Recruit | 40 gold; two named offers per port | One Gunner and one Mender, generated once from seed/node ID, unique stable IDs; 100 HP / 75 morale, home Quarters, no transit. Each offer sold once. Disable when roster reaches five. |
| Chainshot cannon | 45 gold; one | Replace equipped Roundshot for the rest of the run. No extra power budget, second weapon slot, resale or mid-battle swapping. Disable if already owned. Show damage/reload comparison before purchase. |
| Shipwright's Knot charm | 25 gold; one | Multiply friendly crew damage-control work by 1.20 on their home ship. Applies to extinguishing, sealing and room repair, not hull repair, movement, melee or enemy crew. |
| Witchglass charm | 30 gold; one | Ward capacity +4 (12 → 16); recharge rate unchanged. Does not refill ward on purchase; next combat starts at the derived capacity. |

Charms equip automatically in two slots, unique by ID. No stacking duplicates, selling or unequipping this round. Equipment modifiers are derived from base values each combat; never repeatedly multiply persisted values on reopen/restart.

Chainshot: 14-second base reload at cannon power 2, 6 hull/ward damage, and 3× remaining unabsorbed damage to the targeted room (18 on a fully unwarded hit), compared with Roundshot's 16 seconds / 10 damage / 2× room damage. Keep sails dodge, ward-first absorption, Gunner reload bonus and existing fire/breach probabilities. A fully warded or dodged shot does no room damage. B extends the impact/weapon path to accept room multiplier and reload definition; C owns the numbers. Enemy cannons retain existing 19/16.5-second reload and 8/10 damage unless separately tuned by B.

Economy sanity check: starting 25 gold plus mandatory Black Fin reward 35 gives 60 before port absent encounter changes. That buys one recruit plus one repair, Chainshot plus one repair, or both charms. Optional depth-4 combat adds later reward but cannot retroactively fund the one-way port visit. A player arriving with zero gold can always depart.

### Transaction and interface behavior

Port stock is created once on arrival and held under its visit ID. Rerender, help, rotation and repeated clicks cannot replenish stock or reroll names. No revisiting cleared nodes.

Choose a catalog item to show details; a separate Buy control commits its quoted price. On click recheck port visit still active, item stock, gold, hull/roster limits and ownership. Apply the whole transaction once, update balances immediately and journal the purchase; invalid transactions mutate nothing. Two rapid deliberate repair purchases may both succeed if funds/damage remain, but a single DOM event must never produce duplicate callbacks. Discrete stock items/recruits can only be bought once.

Use a two-column landscape layout: scrollable catalog on the left, selected item/details on the right. Keep gold and Leave port pinned. Buy, category/item controls and Leave are at least 44×44 CSS px. Show disabled reasons in text (“Need 10 more gold,” “Crew full,” “Already owned,” “Hull full”), not faded color alone. Do not shrink product copy below 14 px to fit; scroll the detail pane instead. Purchase success uses a polite live region without stealing focus. Leave requires no purchase and clears the visit once. No autosail.

A updates all three-pirate assumptions: roster scroll with 44 px cards, generated initials and colors, morale divided by roster length with a zero-length guard, ending count based on actual roster size, maxHull instead of literal 180. Recruits must be selectable and rendered in the very next battle.

### Acceptance criteria

- C1: Repairs, recruits, Chainshot and both charms can be purchased with exact integer debits and correct benefits; insufficient funds never make gold negative.
- C2: Hull caps, full roster, sold stock, duplicate cannon/charm and stale visit commands fail without partial mutation; zero-gold departure works.
- C3: Reopening/rerendering preserves stock and equipment. A new run restores 25 gold, initial crew, Roundshot and no charms.
- C4: Recruits persist across the next encounter/battle and can board, retreat, work and recover using the same rules as original crew.
- C5: Chainshot reload/ward/room damage and both charm effects match the catalog; purchase of one never changes unrelated stats. Repeated combat creation cannot stack modifiers.
- C6: Shop controls, disabled explanations, current balances and departure remain usable at supported phone sizes without obscuring the Safari safe area.

## Integration and verification plan

Automated implementation gates (not claims that future mechanics already pass):

- A: graph property tests over 100 seeds; deterministic regeneration; invalid edges; preview/commit parity; first/second fog contact; fog-before-boss precedence; idempotent visit/reward flow and complete reset.
- B: fixed-step tests for both directions, crossing contention, cancelling/incapacitation, pause invariance, same-room melee, simultaneous incapacitation, capture/release of all four systems, occupancy-based traits/hazards, enemy AI and terminal cleanup.
- C: transaction table tests at exact/insufficient gold; partial/full hull; capacity boundary; duplicate stock; stale visit; derived equipment defaults and nonstacking effects.
- A's integration tests: alternate routes to port; buy recruit/cannon/charm; complete a boarding battle; preserve resources; enter boss; fog fatality prevents content/reward; duplicate completion does not award twice. Tests use pure state fixtures, not production debug buttons.
- Run `npm ci`, `npm test`, `npm run build`. Preserve Vite's /skeleton-crew/ base and static Pages deployment. Inspect console errors and built asset loading. No new dependency is required.
- Record actual device/browser, viewport, seed and outcome for manual checks. A owns the integrated result; each feature owner fixes failures in their exclusive files. Do not represent planned tests as executed.

### Manual checklist — landscape iPhone Safari

Run the complete checklist on a physical iPhone Safari, plus viewport checks at 667×375 and 844×390 and a compact 320–374 px viewport height. Desktop keyboard/Chromium smoke checks supplement device checks.

**Shared layout and lifecycle**

- [ ] Expanded/collapsed Safari bars, notch and home indicator do not cover Sail, Buy, Leave, Resume, crew cards, power controls or rooms; all actionable hit areas measure at least 44×44 CSS px with no overlaps.
- [ ] Essential labels/status are readable without zoom; text, icon/shape and pattern distinguish fog, enemy crew, capture and disabled actions. Reduced-motion mode preserves state feedback.
- [ ] Rotate to portrait during crossing/melee, then back: curtain blocks input, battle stays paused, timers and fog unchanged. Switch tabs for 30 seconds and return with no offline progress.
- [ ] Help/log/port dialogs trap focus correctly where applicable; closing restores usable focus. Keyboard navigation and Space do not accidentally Buy or Sail. Screen reader labels distinguish ship, room and command.
- [ ] Pause remains reachable with five crew; scrolling roster/shop/chart does not trigger an unintended order or purchase.

**Chart and fog**

- [ ] Start two seeded runs and select different branches; only connected nodes enable Sail, and the final convergence is clear.
- [ ] Inspect/scroll/select nodes repeatedly: no travel or fog advance until Sail. Double-tap Sail: one arrival, one charge to fog.
- [ ] Take a normal passage, then a treacherous one; displayed projected front equals the actual front and safe/covered pattern.
- [ ] With a controlled seed/fixture, trigger first contact: −30 hull once. Trigger zero-hull and second-contact losses separately; no destination content/reward opens, including at boss.
- [ ] Take an all-normal route to completion, access Lantern Cay from each depth-2 lane in fixtures, and complete a route that skips it.

**Boarding**

- [ ] Start paused; select Rook → Board → enemy Cannons. Cannon aim stays unchanged. Resume and watch staging, attach, crossing and landing.
- [ ] Enemy telegraph appears; enemy boarder reaches a player room. Send a defender there and observe health loss, fighting state and interrupted work.
- [ ] Capture enemy Cannons and observe charge stall; retreat/leave and observe recovery. Repeat with Ward, Sails and Pumps using controlled states.
- [ ] Move a station specialist abroad and verify their home bonus disappears; inspect fire/water effects on the physically occupied ship.
- [ ] Retreat a wounded pirate while the outbound hook cools down; test a queued return behind an active crossing, then incapacitation before escape.
- [ ] Pause during each phase: movement, melee, capture, hook cooldown and AI freeze. Resume without duplicate arrivals.
- [ ] Win while crew are abroad, incapacitated or crossing: all owned crew return and recover once. Lose/simultaneously sink: no reward or continued simulation.

**Port and equipment**

- [ ] Arrive with 60 gold; buy recruit + repair and verify 5 gold remains. Check new pirate's name, trait and next-battle controls.
- [ ] In separate runs/fixtures buy Chainshot + repair, and both charms. Verify displayed costs, equipped status, combat reload/room damage, repair boost and 16-point ward capacity.
- [ ] Test exact funds, one gold short, zero gold, nearly full hull, full hull, five crew, sold recruit, owned cannon and owned charm. No partial debit/benefit.
- [ ] Rapidly tap a sold item, rotate, open/close help and rerender: stock does not replenish and modifiers do not stack.
- [ ] Leave without buying; one visit completes, no extra fog advance, no accidental Sail. Cannot buy through a stale port view.

**Full run / regression**

- [ ] Complete chart → encounter → battle → port → battle/encounter → boss using boarding and purchases; log and end stats match the run.
- [ ] Existing power cap, auto-fire targeting, wards, dodge, flooding, fires, crew repairs and pause still work.
- [ ] Restart after both win and loss: original three crew, 180 hull, 25 gold, no purchases/stock carryover, reset fog and log. Refresh also starts a new session as before.
- [ ] Production preview loads at /skeleton-crew/ with no missing assets or console exceptions. Physical Safari results are recorded separately from emulation.

## Risks and boundaries

The highest implementation risk is mixing crew ownership with physical location; occupancy queries and single-pass health/work updates are mandatory. The highest integration risk is competing edits in main.ts; exclusive ownership and callback seams address it. Phone height is the limiting UI dimension: prefer scrolling feature panes and the roster over squeezing controls.

Fog values, melee DPS, enemy repair and shop prices need playtesting. Keep deterministic fixtures and adjust centralized constants with an explicit balance note; do not silently weaken acceptance tests. Existing combat pacing is a reference, not evidence that new boarding balance already works.

Out of scope: save/resume, multiple sectors, procedural room layouts, ship upgrades beyond the specified cannon/charms, selling/equipment inventory, crew permadeath, prizes from capturing an entire ship, rope cutting, touch dragging, networking and deployment changes. This PR ends at a reviewable plan; implementation belongs to the three follow-up workstreams.
