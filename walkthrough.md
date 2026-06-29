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

## Expected Feel

The map should now read closer to a browser grand-strategy layer: realms have names, colors, borders, relations, claims, treaties, and province-level strategic identity. The player can inspect provinces without needing a city, camp, or resource node under the cursor, then move from province intelligence into realm diplomacy without leaving the map.

## Verification Notes

- `render_game_to_text()` exposes current map UI state including the selected map mode.
- Province and diplomacy helper behavior is covered in `apps/web/src/lib/politicalMap.test.ts`.
- `corepack pnpm smoke:field-command` is currently stale for the older field-command dialog text (`Field Command: Barbarian Camp 5`) and is tracked separately from the political/diplomacy map flow.
- Browser smoke output was captured and inspected during the pass; generated artifacts are not required for normal development.
