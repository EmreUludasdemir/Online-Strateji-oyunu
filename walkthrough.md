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
   - province status and risk,
   - terrain, tier, strategic value, and realm strength,
   - wood/stone/food/gold value,
   - nearby camps, resources, passes, and sanctuaries.
5. Choose the province action:
   - `Kesif` opens a scout-style field command for that tile.
   - `Devleti Gor` recenters toward the realm capital.
   - `Akin` marks the province as a raid target.
   - `Sancak` opens a claim/banner-style field command.
   - friendly/neutral provinces can also offer support or trade actions.

## Expected Feel

The map should now read closer to a browser grand-strategy layer: realms have names, colors, borders, relations, and province-level strategic identity. The player can inspect provinces without needing a city, camp, or resource node under the cursor.

## Verification Notes

- `render_game_to_text()` exposes current map UI state including the selected map mode.
- Province helper behavior is covered in `apps/web/src/lib/politicalMap.test.ts`.
- Browser smoke output was captured and inspected during the pass; generated artifacts are not required for normal development.
