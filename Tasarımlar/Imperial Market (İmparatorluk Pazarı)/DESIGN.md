# Design System Document

## 1. Overview & Creative North Star: "The Sovereign Archive"

The visual direction for this design system is defined by the **"Sovereign Archive"** North Star. We are moving away from the typical "gamified" UI of bright, saturated buttons and cluttered HUDs. Instead, we are building a digital command center that feels like an authoritative, high-end editorial record of a growing empire.

The system breaks the "template" look through **intentional asymmetry** and **atmospheric depth**. We use wide margins, overlapping semi-transparent layers, and high-contrast typography to create an environment that feels both ancient and technologically advanced. This is not just a game interface; it is a premium strategic instrument.

---

## 2. Colors: Metallic Depth & Gilded Focus

The palette is rooted in deep, metallic neutrals that provide a "cinema-grade" backdrop, allowing gold accents and resource colors to command attention.

### Surface Hierarchy & Nesting
To achieve a "bespoke" feel, we abandon flat layouts. Use the `surface-container` tiers to stack depth:
*   **Base Layer:** `surface` (#111316) for the primary background.
*   **Secondary Zones:** `surface-container-low` (#1a1c1f) for side panels or navigation footers.
*   **Actionable Cards:** `surface-container-high` (#282a2d) or `highest` (#333538) to pull important data forward.

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders to section off large areas of the UI. Separation must be achieved via background color shifts. For example, a resource panel (`surface-container-low`) should sit directly against the main map or dashboard (`surface`) without a stroke.

### Signature Textures & Glass
*   **Glassmorphism:** Use `surface-variant` with a 60-80% opacity and a `backdrop-filter: blur(12px)` for floating modals and tooltips. This integrates the UI with the "world" behind it.
*   **Gilded Accents:** Use the `primary_container` (#fdd488) to `primary_fixed_dim` (#e9c176) gradient for high-value CTAs (e.g., "Declare War" or "Ascend").

### Resource Token Mapping
*   **Wood:** `tertiary_fixed_dim` (#ffb870) - Warm, organic orange/brown.
*   **Stone:** `secondary` (#b8c9d3) - Cool, metallic grey.
*   **Gold:** `primary_fixed` (#ffdea5) - Lustrous, brilliant yellow.
*   **Food:** `tertiary_container` (#ffd1a7) - Earthy, soft orange.

---

## 3. Typography: The Editorial Authority

The system uses a sophisticated tri-font pairing to distinguish between narrative, data, and action.

*   **Display & Headlines (Newsreader):** A strong, authoritative serif. Use `display-lg` for victory screens and `headline-md` for territory names. This conveys the "Sovereign" weight of your decisions.
*   **Body & Titles (Manrope):** A clean, modern sans-serif. Use `body-md` for unit descriptions and `title-sm` for resource labels. It ensures legibility during complex management tasks.
*   **Data & Technical (Space Grotesk):** Used for `label-md` and `label-sm`. This mono-spaced influence should be used for coordinates, countdown timers, and resource counts to provide a "tactical" feel.

---

## 4. Elevation & Depth: Tonal Layering

Traditional drop shadows are too "web-standard." We use **Ambient Shadows** and **Tonal Stacking**.

*   **The Layering Principle:** Instead of a shadow, place a `surface-container-highest` element inside a `surface-container-low` section to create "natural lift."
*   **Ambient Shadows:** For floating unit cards, use a tinted shadow: `color: on-surface` at 6% opacity, with a 32px blur and 16px Y-offset. This mimics a soft, atmospheric glow rather than a harsh black shadow.
*   **The "Ghost Border" Fallback:** If a border is required for accessibility in resource bars, use `outline-variant` (#4d4732) at **20% opacity**. It should be felt, not seen.

---

## 5. Components: Strategic Primitives

### Buttons (The Gilded Interaction)
*   **Primary:** Solid `primary_fixed_dim` with `on_primary_fixed` text. Sharp corners (`rounded-sm`: 0.125rem) to maintain a military, disciplined look.
*   **Secondary:** Ghost style. `outline` border (at 30% opacity) with `on_surface` text. Use for "Cancel" or "Details."
*   **State:** On hover, primary buttons should gain a subtle `inner-shadow` glow to mimic gold reflecting light.

### Resource Chips
*   **Visual Style:** Semi-transparent backgrounds (`surface-container-highest` at 40%) with a left-aligned colored bar (2px) matching the resource type (e.g., Green for Wood). 
*   **Spacing:** Use `spacing-2` (0.4rem) between the icon and the value.

### Strategic Cards & Lists
*   **Forbid Dividers:** Do not use horizontal lines between list items (e.g., troop lists). Use `spacing-3` (0.6rem) and alternating subtle background shifts (`surface-container-low` vs `surface-container-lowest`).
*   **Interactive State:** On hover, a card should shift from `surface-container-low` to `surface-variant`.

### Atmospheric Input Fields
*   **Style:** Underlined only. Use the `outline` token for the bottom border (1px). When focused, the border transitions to `primary` (Gold) with a soft 2px glow.

---

## 6. Do's and Don'ts

### Do:
*   **Do** use asymmetrical layouts. A sidebar that doesn't reach the bottom of the screen creates a more "custom" feel.
*   **Do** use `spaceGrotesk` for all numerical data. It emphasizes the "strategy" and "calculation" aspect of the game.
*   **Do** apply `backdrop-blur` to any element that sits over the game map to maintain immersion.

### Don't:
*   **Don't** use `rounded-full` (pill shapes) for buttons. It is too "friendly" and "app-like." Stick to `rounded-sm` or `none` for a more rigid, architectural feel.
*   **Don't** use pure white (#ffffff) for text. Always use `on_surface` (#e2e2e6) to prevent eye strain against the dark metallic background.
*   **Don't** use high-contrast borders for containers. Let the colors do the work of defining space.