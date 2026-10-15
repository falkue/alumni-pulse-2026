# Circle / PostPlan design system — applied to the Alumni Pulse portal

Source: the user's own artifacts "Circle Start"
and "Postplan Wochenansicht" (PostPlan is
explicitly built "im Circle-Stil"). Tokens: `circle_tokens.css` (light + dark).

## Character
Warm, calm, editorial — like a well-made macOS app on paper. Serif headlines with one
coral accent word, quiet sans-serif UI, generous whitespace, hairline borders, soft
cards, colour used sparingly and always with meaning.

## Page and frame
* Page background `--page` with three very soft radial colour washes
  (`--w1` top-left, `--w2` top-right, `--w3` bottom), `background-attachment: fixed`.
* App window on the page: background `--win`, radius 12 px, `--shadow-win`.
* Sidebar 220–240 px: `--side` + `backdrop-filter: blur(40px) saturate(1.7)`, right hairline.
  Brand row: 20 px dark rounded square logo (`--ink`) with a ring inside, name 650 weight.
  Nav items 28 px high, radius 7, icon in `--accent`, count right-aligned in `--ink-3`
  (tabular numbers), badge = orange pill. Selected item: `--sel` background + 600 weight
  (Circle v2 variant: solid `--solid` with white text — use for the primary active item).
  Section headers in the sidebar: 10.5 px, 650, uppercase, letter-spacing .08em, `--ink-3`.
  Footer line: green 6 px dot + small status text ("Saved · data in the EU").
* Top bar 52 px: page title in serif 26 px with one word in `<em>` coloured `--coral`
  (e.g. "Who *answered*"), muted sub-line 12 px, segmented control and primary button right.

## Typography
* Headlines: `--serif` (Instrument Serif) 400 weight, tight line-height (1.0–1.1),
  letter-spacing −.01em. Sizes: page hero 44 px, section 27–32 px, card title 22–24 px.
  Emphasis inside headlines: `<em>` in `--coral`, never bold.
* UI text: `--sans` 13–14 px / 1.4; secondary text `--ink-2`, meta `--ink-3` 11.5–12 px.
* Labels/kickers: 10.5 px, 650, uppercase, letter-spacing .08em, `--ink-3`.
* Numbers: always `font-variant-numeric: tabular-nums`. KPI value 20 px 650–700.

## Components
* Card: `--card`, 1 px `--line`, radius 11, `--shadow-card`, padding 12–14 px.
  Flat variant without shadow for nested content.
* Stat tile: card with value (20 px, tabular) + label (11.5 px `--ink-3`) + optional delta
  in 11 px 600 `--green` / `--coral`.
* Button: 28 px, radius 7, 1 px `--line-2`, `--card` bg, 12.5 px 500, tiny shadow.
  Primary: `--solid` bg, white text. Ghost: transparent, `--ink-2`.
* Segmented control: container `--sel`, radius 8, padding 2; active segment `--card`
  with 1 px shadow and 600 weight.
* Pill/badge: 20–22 px, radius 999, 10.5–11.5 px 600; background
  `color-mix(in srgb, var(--c) var(--tint), var(--card))`, text
  `color-mix(in srgb, var(--c) 70%, var(--ink))` where `--c` is the semantic colour.
  Outline variant for neutral states.
* AI/suggestion card: violet 5 % tint background, violet 30 % border, uppercase violet tag.
* Inputs: 30 px, radius 7, `--line-2` border, focus = blue border + 3 px blue 18 % ring.
* Focus visible everywhere: 2 px `--blue` outline, offset 1.
* Tables: header row `--pane`, 10.5 px uppercase labels; rows 44–47 px, hairline separators,
  hover `--hover`.
* Avatars/initial chips: circle with radial tint of the entity colour.

## Charts (Alumni Pulse specifics)
* Own school / primary series: `--blue` (bars radius 4 at the data end).
* Peers / context: `--ink-4` dots, `--line-2` ranges; benchmark line dashed `--ink-3`.
* Pyramid: female `--violet`, male `--blue`; benchmark marker `--ink-2` tick.
* Suppressed cells ("< 3"): hatched `--line-2` placeholder, label `--ink-3`.
* Positive delta `--green`, negative `--coral`; warnings/simulated badge `--yellow` pill.
* Gridlines `--line`, axis labels 10–11 px `--ink-3` tabular.

## Do / don't
* Do: one accent word per headline, lots of air, colour only with meaning.
* Don't: bold serif, more than two colours in one chart, heavy shadows, pure black/white text.
