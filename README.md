# Skeleton Crew

A fantasy pirate, FTL-style real-time-with-pause roguelite for **landscape iPhone Safari**. Captain the Wayward across the Hollow Sea: three pirates, six rooms, four powered systems, and a final duel with a ghost ship. Static Vite + TypeScript + HTML canvas; no backend, engine, external assets, or account required.

**Live URL:** [https://ch-leon.github.io/skeleton-crew/](https://ch-leon.github.io/skeleton-crew/) — the main-branch Pages workflow publishes here after merge and Pages setup below.

## Play

1. Hold your phone sideways. Tap **Weigh anchor**, make your first choice, and follow the highlighted chart node.
2. Battles start paused. Tap a pirate in the roster, then a friendly room to order movement. Orders execute after **Resume**. Crew automatically extinguish fires, seal breaches, then repair room systems. They cannot restore hull in combat.
3. Tap **Cannons** on the bottom rail, then an enemy room to target it. Cannons automatically repeat fire when charged; the gold outline marks the target. You can also directly tap an enemy room while paused.
4. Use **− / +** to distribute six power across Cannons, Ward-witch, Sails and Bilge pumps. Free power from one system before adding it elsewhere. Each system supports 0–3 power. The rail shows power pips; the command strip shows cannon charge.
5. Touch the battlefield while running to pause. Make your orders, then tap **Resume**; the same button toggles **Pause**. Desktop also supports Space when a button does not have focus. Switching tabs or rotating to portrait pauses combat.
6. Sink the enemy before your hull reaches zero. Battles pay gold; encounters offer repairs or morale. Complete all five stops to break the curse. Read your ship’s log, then sail again.

**The crew:** Rook / Gunner reloads faster when stationed at Cannons. Nell / Mender extinguishes, seals, and repairs faster. Vesper / Witch-touched strengthens ward recharge when stationed at Ward-witch. Their roster shows morale (MRL), health (HP), and destination. Morale below 35 slows movement and work; fire can incapacitate crew. Crew recover health after a win.

**The ship:** Green ward absorbs cannon damage and recharges after five seconds without a hit. Sails increase dodge chance. Lower-deck breaches admit water; pumps drain every room. Orange flames spread and hurt crew, rooms and hull; blue water slows crew and harms systems. Send crew to damaged rooms. Room health bars show system condition. Hull, gold and morale carry between battles; hazards and room damage clear between them.

A typical battle lasts **3–5 active minutes**, excluding tactical pauses. The three text encounters each offer two choices. The first battle pays 35 gold; the tougher Pale Sovereign pays 65. A voyage is session-only: refreshing starts a new run. There is no audio.

## Develop and verify

Requires Node.js **22.12+** (or 24) and npm.

```sh
npm ci
npm run dev
# Open the printed URL, normally http://localhost:5173/skeleton-crew/
npm test
npm run build
npm run preview
```

`npm run build` type-checks TypeScript and creates static files in `dist/`. Vite’s base is `/skeleton-crew/`, including production asset URLs. Serve the build over HTTP rather than opening `index.html` as a file. No environment variables are needed.

Combat lives in `src/combat.ts`, independent of canvas/DOM. Vitest covers pause invariance, power limits, wards/dodge, crew movement/morale, reload/traits, flooding/pumps, spreading fire, crew damage control, enemy fire and battle outcomes. Twenty seeded first battles also check average pacing against the 180–300 second target. Rendering is in `src/render.ts`; voyage and touch controls are in `src/main.ts`. See [the short specification](docs/SPEC.md) and [validation record](docs/VALIDATION.md).

## GitHub Pages

In the repository’s **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**. Merge the pull request into `main`.

- `.github/workflows/ci.yml` runs `npm ci`, tests and production build on pull requests and non-main pushes.
- `.github/workflows/pages.yml` runs tests/build on every push to `main` (or manual dispatch), uploads `dist`, and deploys using GitHub’s Pages Actions and OIDC. No deployment secrets are needed.
- The workflow uses a `github-pages` environment and serialized deployments. Check its deployment URL and job status in Actions after merging.

Physical iPhone Safari verification is still required, especially browser toolbar/safe-area behavior. Browser automation uses phone-sized Chromium viewports; it does not establish Safari device compatibility by itself.
