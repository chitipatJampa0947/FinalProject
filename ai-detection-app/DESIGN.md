# Design System Specification: The Transparent Guardian

## 1. Overview & Creative North Star
This design system is built upon the Creative North Star of **"The Transparent Guardian."** In an era of AI-generated uncertainty, this system does not just provide a utility; it provides an authoritative, editorial experience that feels both high-performance and deeply private.

To move beyond the "standard SaaS" look, we employ an **Editorial Layout Philosophy**. This means prioritizing high-contrast typography scales, intentional asymmetry, and a rejection of traditional UI "boxes." We treat the interface as a digital canvas where depth is created through light and layering rather than rigid lines. The goal is to make the Thai AI text detection process feel like a premium forensic analysis—clinical, precise, and indisputable.

---

## 2. Colors & Surface Philosophy
The palette is rooted in the contrast between the synthetic (AI) and the organic (Human), anchored by a professional Indigo core.

### The "No-Line" Rule
**Strict Directive:** 1px solid borders for sectioning are prohibited. 
Structure must be defined through **Background Tonal Shifts**. For example, a main content area using `surface-container-low` should sit directly against a `surface` background. The eye should perceive the boundary through color value changes, not a "drawn" line.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of fine paper. 
- **Level 0 (Base):** `surface` (#faf8ff) - The vast, open canvas.
- **Level 1 (Sections):** `surface-container-low` (#f2f3ff) - Subtle grouping of related data.
- **Level 2 (Cards):** `surface-container-highest` (#dae2fd) - High-priority interaction zones.

### Glassmorphism & Signature Textures
To convey "Privacy-First" transparency, floating elements (modals, dropdowns) must use a **Glass Effect**:
- **Background:** `surface` at 70% opacity.
- **Effect:** `backdrop-blur: 20px`.
- **Signature Gradient:** For primary actions, use a linear gradient from `primary` (#3525cd) to `primary_container` (#4f46e5) at a 135-degree angle. This adds a "soul" to the action that a flat color lacks.

---

## 3. Typography: The Editorial Voice
The typography system balances the global precision of **Inter** with the local elegance of **Sarabun**. 

- **The Dual-Type Scale:** Use Inter for all English text and numerical data (metrics, percentages). Use Sarabun for all Thai content to ensure maximum legibility and cultural resonance.
- **Thai Readability Note:** Thai script requires higher line-heights (`leading-relaxed`). Ensure all Thai body text has a line-height of at least 1.6x the font size to prevent glyph "clashing."
- **Visual Hierarchy:**
    - **Display-LG:** Used for detection percentages (e.g., "98% AI"). Bold, loud, and authoritative.
    - **Headline-MD:** Used for section headers. High contrast against body text.
    - **Label-SM:** All caps with increased letter-spacing for metadata and technical specs.

---

## 4. Elevation & Depth
We eschew traditional drop shadows in favor of **Tonal Layering** and **Ambient Light**.

### The Layering Principle
Depth is achieved by stacking surface tokens. An input field should not be a white box with a shadow; it should be a `surface-container-highest` well carved into a `surface-container-low` section.

### Ambient Shadows
When an element must "float" (e.g., a floating action button or a critical modal):
- **Blur:** 40px to 60px.
- **Opacity:** 4% - 8%.
- **Color:** Use a tinted version of `on-surface` (#131b2e) rather than pure black. This mimics natural light passing through a professional workspace.

### The "Ghost Border" Fallback
If accessibility requirements demand a border, use a **Ghost Border**: `outline-variant` at 15% opacity. It should be felt, not seen.

---

## 5. Components

### The Detection Input (Core Component)
- **Style:** A large, borderless `surface-container-low` area. 
- **Interaction:** On focus, the background shifts to `surface-container-high`. 
- **Thai Optimization:** Text cursor height must be adjusted to accommodate Thai vowels and tone marks.

### Buttons
- **Primary:** Utilizes the Signature Gradient (Indigo). `xl` roundedness (0.75rem) to feel approachable yet modern.
- **Secondary:** Transparent background with a `Ghost Border`. Text in `primary`.
- **Tertiary:** No background, no border. Purely typographic with a subtle `primary_fixed` hover state.

### AI vs. Human Indicators (The "Tension" Chips)
- **AI-Detected:** `tertiary_container` (#bf0f3c) background with `on_tertiary` text. Use for highlighting suspicious Thai syntax.
- **Human-Verified:** `secondary_container` (#6cf8bb) background with `on_secondary_container` text. Use for confirming organic writing patterns.

### Lists & Data Grids
- **Forbid Dividers:** Do not use horizontal lines between list items. Use 16px of vertical whitespace or alternating `surface` / `surface-container-low` backgrounds.
- **Vertical Rhythm:** Align all list content to a strict 8px grid to maintain the "high-performance" feel.

---

## 6. Do's and Don'ts

### Do
- **Do** use `display-lg` for the primary detection result. It should be the first thing the user sees.
- **Do** leave generous whitespace (32px+) around the Thai text input to reduce cognitive load.
- **Do** use `emerald-500` (Human) to reward the user and `rose-500` (AI) as a clinical warning, not a "punishment."

### Don't
- **Don't** use pure black (#000000) for text. Use `slate-900` (`on_surface`) to maintain a premium, ink-on-paper feel.
- **Don't** use standard Material Design "elevated" cards with 100% opacity shadows. They look "template-heavy."
- **Don't** use condensed fonts for Thai text; the loops in Thai characters require the "breathing room" provided by Sarabun.

### Accessibility & Privacy
The interface must reflect the "Privacy-First" theme. Use clear, `label-md` text to explain *why* an analysis is happening locally or how data is being encrypted. Privacy is not a footnote; it is a design feature communicated through clarity and calm.