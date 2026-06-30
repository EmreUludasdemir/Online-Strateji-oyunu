# Frontier Dominion Walkthrough

## Demo QA Path

1. Log in with `demo_alpha / demo12345`.
2. Start on `/app/dashboard` and confirm the compact city-scene layout, resource bar, sound toggle, and `KaÄŸan Brifingi` tutorial advisor.
3. Open `/app/city` and `/app/army` to confirm the core upgrade/training decision surfaces still render.
4. Open `/app/map`, switch to `Toy`, select a province, issue one enabled expansion order, then open `Elcilik Defteri`.
5. Open `/app/reports` after the map interaction to confirm the loop can reach battle/report feedback.
6. Repeat the dashboard and map checks at a mobile width; the map canvas and city scene should remain the dominant visual area.
7. Run the focused release smoke with `corepack pnpm smoke:release-demo` against the local web shell.

## Political Map Gameplay

1. Log in with a demo commander and open `Sefer Haritasi`.
2. Use the map-mode rail above the world map to switch the strategic lens:
   - `Arazi`: soft terrain-first view.
   - `Devlet`: political realm colors and borders.
   - `Tehdit`: hostile pressure and nearby camp risk.
   - `Bereket`: dominant province resource value.
   - `Toy`: alliance and realm relation view.
   - `Sefer`: route/march readability view.
3. Click an empty province tile on the world map to open `Yurt Defteri`.
4. Read the province card:
   - realm tag and realm identity,
   - province status, relation, diplomatic risk, and border tension,
   - terrain, tier, strategic value, and realm strength,
   - wood/stone/food/gold value,
   - nearby camps, resources, passes, and sanctuaries,
   - visible claims and neighboring contesting realms.
5. Choose the province action:
   - `Kesif` opens a scout-style field command for that tile.
   - `Devleti Gor` opens the realm diplomacy dossier and recenters toward the capital.
   - `Akin` marks the province as a raid target.
   - `Sancak` opens a claim/banner-style field command.
   - friendly/neutral provinces can also offer support or trade actions.

## Diplomacy and Realm Relations

1. Open `Sefer Haritasi` and switch the map mode to `Toy`.
2. Read the relation overlay:
   - allied/friendly realms use cool supportive colors,
   - neutral/wary realms use muted political colors,
   - hostile/rival realms use warmer danger colors,
   - claimed provinces show diagonal treaty/claim marks,
   - high-tension borders show a stronger outline,
   - player-relevant claims show a small gold claim mark.
3. Use the `Toy Iliskileri` card on the right rail to scan the most urgent realms.
4. Click `Elcilik Defteri` to open the diplomacy drawer. It lists every known realm with:
   - relation badge,
   - realm strength,
   - border status,
   - controlled province count,
   - known claim count,
   - `Yurdu Gor` action.
5. Click a realm tag from `Yurt Defteri` or `Yurdu Gor` in the drawer to open the realm detail panel.
6. Read the realm detail panel:
   - realm name, tag, and color,
   - relation and border tension,
   - strength, threat, influence, and controlled provinces,
   - capital tile,
   - active treaties,
   - known claims,
   - advisor text and recommended diplomatic action.
7. Use realm actions from the panel:
   - `Elci Gonder` for neutral/wary realms,
   - `Yurdu Kesfet` for unknown or hostile realms,
   - `Harac Oner` for hostile/rival pressure,
   - `Gecit Hakki` for route diplomacy,
   - `Ahid Oner` for pact building,
   - `Hudut Gerginligi` to switch back into the `Toy` relation map mode.

## Claims and Expansion Loop

1. Open `Sefer Haritasi`, switch to `Toy`, and select a province.
2. In `Yurt Defteri`, read the dossier header first:
   - realm tag and province name,
   - `Iliski`, `Durum`, `Hudut`, `Risk`, and `Kontrol` badges,
   - terrain, tier, strategic value, realm strength, resources, and nearby pressure.
3. Use `Kontrol & Etki` to judge the expansion path:
   - `Etki` shows Toy influence in the province,
   - `Claim` shows player claim strength,
   - `Direnc` shows local resistance,
   - `Kontrol` shows the current owner's hold.
4. Choose an expansion order:
   - unknown provinces prefer `Yurdu Kesfet`,
   - neutral/wary/hostile provinces can move through envoy, influence, claim, raid preparation, raid, or submission depending on risk,
   - friendly/allied provinces do not enable raid orders and should lean toward support or border fortification,
   - claimed/occupied/controlled provinces shift away from repeat claims and toward fortify/withdraw/manage style decisions.
5. After an order resolves, read the feedback box under `Kontrol & Etki`.
6. Watch `Hudut Ceridesi` on the map rail:
   - newest orders show province name, action type, result, realm reaction, tension change, and age,
   - empty state tells the player to select a province and issue a first expansion order.
7. Re-check `Toy` mode on the world map. Influence, claim, contested status, occupation/control, and high resistance now affect overlay marks without adding map text clutter.

## First 5 Minutes Tutorial

1. Reset the first-time flow with `/app/dashboard?tutorial=reset` or start it fresh with `/app/dashboard?tutorial=start`.
2. The `Kağan Brifingi` advisor opens as an in-world Divan guidance card. It shows:
   - chapter label,
   - step count and progress bar,
   - current objective,
   - short strategic reason,
   - focused target label,
   - pause, skip, and primary action controls.
3. Chapter 1 teaches city economy:
   - accept `Başlangıç Buyruğu`,
   - inspect the top resource bar,
   - open `Oba Merkezi`,
   - complete the Town Hall / `Kağan Otağı` upgrade condition.
4. Chapter 2 teaches army preparation:
   - open `Kışla`,
   - start infantry training or resume past an already active infantry queue,
   - open `Sefer Haritası`.
5. Chapter 3 teaches province expansion:
   - select a nearby province to open `Yurt Defteri`,
   - scout it or continue if the province is already observed,
   - move to influence/claim guidance,
   - later steps guide a march and report read.
6. Completion is not based on plain button clicks. Steps advance when the app observes the real route/action state:
   - route visited,
   - upgrade started or already achieved,
   - infantry training started,
   - province selected,
   - province scout/observed state,
   - expansion action,
   - march sent,
   - report opened.
7. Tutorial state persists in `localStorage` under `frontier_tutorial_state`. It supports paused, skipped, completed, and reset states.
8. For browser smoke and QA, `window.select_map_province(x, y)` uses the same province-selection path as the Phaser canvas and is exposed only as an automation helper.

## Sound Design and Audio Feedback

1. The game shell has a compact sound toggle in the top HUD quick actions.
   - `Sesi Kapat` mutes all cues.
   - `Sesi Ac` restores the persisted sound preference.
   - The setting is saved in `localStorage` under `frontier_audio_settings`.
2. Audio is quiet by default and never plays loud music or looping ambience.
3. Browser autoplay rules are respected:
   - the audio context unlocks only after pointer or keyboard interaction,
   - if Web Audio is unavailable, all cue calls safely no-op.
4. The current implementation uses procedural Web Audio placeholders for short tactile cues:
   - button/panel taps,
   - tutorial step seals,
   - upgrade/training/research starts,
   - province selection,
   - map mode changes,
   - scout/claim/influence/raid actions,
   - march dispatch,
   - victory/defeat/report/resource cues.
5. Future real assets can be dropped under `apps/web/public/assets/audio/` and mapped by cue id. The current `manifest.json` documents expected filenames and categories.
6. For QA, `window.frontierAudio` exposes `state()`, `play(cueId)`, `setMuted(...)`, `setMasterVolume(...)`, and `toggleMuted()`.
7. `render_game_to_text()` includes an `audio` snapshot so smoke tests can verify settings and last triggered cue without needing actual sound output detection.

## Expected Feel

The map and onboarding should now read closer to a browser grand-strategy layer: realms have names, colors, borders, relations, claims, treaties, province control, and province-level strategic identity. The first-time flow teaches those systems through Kağan/Divan commands instead of an external product tour.

## Verification Notes

- `render_game_to_text()` exposes current map UI state including the selected map mode.
- Province and diplomacy helper behavior is covered in `apps/web/src/lib/politicalMap.test.ts`.
- Claims and expansion helper behavior is covered in the same test file, including allied/friendly raid locks, prepared raid state, claimed province recommendations, unknown province scouting, occupied province management, and advisor text.
- Tutorial state, route/action progression, storage, reset, advisor, and highlight target behavior are covered in `apps/web/src/lib/tutorialFlow.test.ts`.
- Audio preference persistence, cue mapping, mute safety, throttling, and unavailable-Web-Audio no-op behavior are covered in `apps/web/src/lib/audioManager.test.ts`.
- `corepack pnpm smoke:field-command` now follows the current Turkish `Saha Buyrugu` / `Buyruk Tepsisi` field-command flow through stable `data-*` hooks instead of the older English dialog text.
- `corepack pnpm smoke:release-demo` covers the final demo loop: login, audio toggle, tutorial state, dashboard/city/army/map, province expansion, diplomacy drawer, reports, and mobile screenshots.
- Browser smoke output was captured and inspected during the pass; generated artifacts are not required for normal development.
