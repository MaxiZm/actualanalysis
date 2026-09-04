# Design — ActualAnalysis

A locked design system for the comparison app. Every route shares this system; extend it here before adding per-page exceptions.

## Genre

Modern-minimal, technical, and austere. Data is the primary visual material.

## Macrostructure family

- App pages: Workbench — dense controls, tables, and charts with no marketing hero.
- Content pages: Long Document — sticky local navigation and compact technical prose.
- Utility pages: Index-First — short, scan-friendly lists and tables.

## Theme

Cobalt on a cool near-white paper, with the existing dark override. The blue accent is reserved for selection, focus, links, and chart emphasis. Organization colors are categorical data tokens, not decorative accents.

## Typography

- Display: Space Grotesk, weight 700, roman.
- Body: IBM Plex Sans, weight 400.
- Mono/data: JetBrains Mono, weight 500.
- Tables use 13–14px labels with tabular numerals; running text never drops below 16px.

## Spacing

Four-point named scale from `apps/web/tokens.css`. Components use tokens rather than raw spacing values.

## Motion

- Selection emphasis: opacity/transform only, 120–220ms.
- Tooltips: immediate on focus, delayed on hover.
- Button press: 1px translation.
- Reduced motion: opacity-only and at most 150ms.

## Microinteractions stance

- Silent success; no decorative toasts.
- Keyboard-first filters, sorting, chart points, search, and dialogs.
- Highlight selection is reflected in the URL and shared by every chart.

## CTA voice

Compact outlined controls with 4–6px radii. Labels are literal actions: “Compare”, “Clear”, “Export PNG”, “Show superseded”.

## Per-page allowances

- App pages use no decorative enrichment.
- Charts may use grids, patterns, and organization colors only to encode data.
- Methodology may use longer prose; every other route obeys its phase-2 prose budget.

## What pages MUST share

Header, compact snapshot summary, font stack, palette, filter language, chart color mapping, focus treatment, table density, and inline footer.

## What pages MAY differ on

Chart sequence, column set, local sticky tools, and the balance between table and plot.

## Exports

The live source of truth is `apps/web/tokens.css`.

### tokens.css

```css
:root {
  --color-paper: oklch(98.5% 0.004 250);
  --color-paper-2: oklch(96% 0.008 250);
  --color-paper-3: oklch(92% 0.01 250);
  --color-ink: oklch(20% 0.02 258);
  --color-ink-2: oklch(31% 0.018 257);
  --color-rule: oklch(84% 0.014 252);
  --color-accent: oklch(48% 0.2 256);
  --color-accent-ink: oklch(98% 0.006 250);
  --color-focus: oklch(14% 0.02 256);
  --font-display: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
  --font-body: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --space-3xs: 0.25rem;
  --space-2xs: 0.5rem;
  --space-xs: 0.75rem;
  --space-sm: 1rem;
  --space-md: 1.25rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --radius-sm: 0.375rem;
  --radius-md: 0.625rem;
}
```

### Tailwind v4 `@theme`

```css
@theme {
  --color-paper: oklch(98.5% 0.004 250);
  --color-paper-2: oklch(96% 0.008 250);
  --color-paper-3: oklch(92% 0.01 250);
  --color-ink: oklch(20% 0.02 258);
  --color-ink-2: oklch(31% 0.018 257);
  --color-rule: oklch(84% 0.014 252);
  --color-accent: oklch(48% 0.2 256);
  --font-display: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
  --font-body: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --spacing-3xs: 0.25rem;
  --spacing-2xs: 0.5rem;
  --spacing-xs: 0.75rem;
  --spacing-sm: 1rem;
  --spacing-md: 1.25rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### DTCG tokens

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "paper": { "$value": "oklch(98.5% 0.004 250)", "$type": "color" },
    "ink": { "$value": "oklch(20% 0.02 258)", "$type": "color" },
    "accent": { "$value": "oklch(48% 0.2 256)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Space Grotesk, ui-sans-serif, system-ui, sans-serif", "$type": "fontFamily" },
    "body": { "$value": "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif", "$type": "fontFamily" },
    "mono": { "$value": "JetBrains Mono, ui-monospace, monospace", "$type": "fontFamily" }
  },
  "space": {
    "xs": { "$value": "0.75rem", "$type": "dimension" },
    "md": { "$value": "1.25rem", "$type": "dimension" },
    "xl": { "$value": "2rem", "$type": "dimension" }
  }
}
```

### shadcn/ui variables

```css
:root {
  --background: 98.5% 0.004 250;
  --foreground: 20% 0.02 258;
  --card: 96% 0.008 250;
  --card-foreground: 20% 0.02 258;
  --primary: 48% 0.2 256;
  --primary-foreground: 98% 0.006 250;
  --secondary: 92% 0.01 250;
  --secondary-foreground: 31% 0.018 257;
  --border: 84% 0.014 252;
  --input: 84% 0.014 252;
  --ring: 14% 0.02 256;
  --radius: 0.375rem;
}
```


## Brand mark

The twin-A monogram shares a horizontal baseline: two model profiles compared on one scale. Use the solid cobalt tile and white mark at small sizes; preserve the SVG geometry. Header 30px, footer 24px. The mark uses `--color-brand` (#0758CE) and `--color-brand-ink` (white), fixed across light and dark themes. Source: `apps/web/public/brand/actualanalysis.svg`.
