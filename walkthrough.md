# Frontier Dominion Walkthrough

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

## Expected Feel

The map should now read closer to a browser grand-strategy layer: realms have names, colors, borders, relations, claims, treaties, province control, and province-level strategic identity. The player can inspect provinces without needing a city, camp, or resource node under the cursor, then move from province intelligence into realm diplomacy or expansion orders without leaving the map.

## Verification Notes

- `render_game_to_text()` exposes current map UI state including the selected map mode.
- Province and diplomacy helper behavior is covered in `apps/web/src/lib/politicalMap.test.ts`.
- Claims and expansion helper behavior is covered in the same test file, including allied/friendly raid locks, prepared raid state, claimed province recommendations, unknown province scouting, occupied province management, and advisor text.
- `corepack pnpm smoke:field-command` is currently stale for the older field-command dialog text (`Field Command: Barbarian Camp 5`) and is tracked separately from the political/diplomacy map flow.
- Browser smoke output was captured and inspected during the pass; generated artifacts are not required for normal development.
