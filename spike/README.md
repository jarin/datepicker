# Phase-1 spike — hyperbolic (Lobachevsky) date picker feasibility

Throwaway spike to settle the **math/stability** and **selection-precision** gates
from the feasibility plan before committing to a real hyperbolic picker mode.

Run: `node spike/run.mjs` (no deps).

- `poincare.mjs` — a small *precise* Poincaré-disk kit: complex arithmetic,
  SU(1,1) isometries (`recenter`, `rotation`, `compose`, `apply`, `inverse`,
  `normalize`), and the hyperbolic distance.
- `run.mjs` — the gates + a reproducible report.

## Verdict: **PASS** — Phase 1 gates cleared. Building it is feasible.

### What the numbers say (float64)

| Gate | Result |
|---|---|
| **1a** teleport (recompute view from anchor) | centres target **exactly** (0). |
| **1b** smooth pan (10k small deltas + renormalize) | invariant drift `1.4e-14`, centring `7.3e-12` — sub-pixel. |
| **2** pan-there-and-back at ρ≤18 | `4.8e-9` — ~6 orders below one pixel (≈`4e-3` of disk radius). |
| **3** ±50y **daily** range, worst-case radial packing | no adjacent dates collapse up to **ρ_max≈18**; dips below `1e-12` around **ρ≈22**. |
| **3b** focus+context payoff | adjacent edge dates are `6.4e-10` apart on screen; recentring restores `1.9e-4` (**×3e5**, clickable). |

### Engineering guidance discovered (carry into Phase 2)

1. **Render** in the Poincaré disk; represent view transforms as **SU(1,1)**.
2. **Teleport (click-to-recenter): recompute `recenter(target)` from the anchor.**
   Do **not** incrementally compose large jumps — that subtracts ~1e15-scale
   matrices (catastrophic cancellation).
3. **Smooth drag-pan:** compose **small** deltas and `normalize()` each step.
4. **Bound the range** so the farthest date sits at **ρ ≲ 18** (≈ `|z|` within
   `3e-8` of the boundary). The "time recedes to infinity" metaphor must stay a
   *visual* one — pushing real dates past ρ≈22 makes neighbours collapse in
   float64. Angular spread (real layout) relaxes this; pure-radial is worst case.
5. **Edge dates aren't directly clickable** (sub-pixel apart). Selection *must*
   go through recentring — which is exactly the focus+context interaction, and
   gives ~3e5× more screen separation at the centre.
6. The SU(1,1) **invariant is ill-conditioned at large ρ** (entries ~1e4 ⇒
   `|a|²−|b|²` subtracts two ~1.6e8 numbers ⇒ only good to ~3e-8). It's cosmetic
   here (centring/round-trip are exact-to-sub-pixel). If a future need requires a
   tight invariant, switch the *math* to the **hyperboloid/Lorentz** model or a
   tangent-space parametrization (per arXiv 2211.00181) and keep Poincaré only
   for rendering.

## Phase 2 — rendering + Möbius navigation: **PASS**

`tiling.html` (+ `perf.mjs` CDP driver) renders a regular `{p,q}` tiling in the
Poincaré disk, navigated by Möbius transforms, and measures frame time.

- **Tiling**: central regular p-gon (circumradius `cosh R = cos(π/p)/sin(π/q)`),
  filled by **edge-reflection BFS** (hyperbolic reflection = inversion in the
  geodesic's orthogonal circle), deduped by quantized centroid.
- **Edges**: true **geodesic arcs** — the circle through the two endpoints and
  the inverse point `a*=a/|a|²` (orthogonal to the unit circle).
- **Navigation**: recompute-from-anchor (`V = recenter(target)`) + drag-to-pan.

### Perf (headless Chrome, canvas-2D, 560px disk)

| config | tiles | avg | p95 | worst |
|---|---|---|---|---|
| {7,3} | 1200 | 120fps (cap) | 9.3ms | 9.5ms |
| {7,3} | 2200 | 120fps (cap) | 9.3ms | 9.4ms |
| {5,4} | 2200 | 120fps (cap) | 9.3ms | 9.4ms |
| {8,3} | 3000 | 120fps (cap) | 9.3ms | 9.5ms |

Frame time stays **< 9.5ms even at 3000 tiles** (≥100fps of capacity) → clears
60fps with margin. **Software-only floor** (`--disable-gpu`): ~47fps @1200,
~16fps @2200 — so low-power/software devices want a smaller budget, which the
culling below provides for free.

### Phase-2 engineering notes
1. **Cull by on-screen size** (tile px ∝ `1−|z|²`; skip < ~2px). Focus+context
   means most tiles are sub-pixel context near the boundary; a date picker only
   needs the few hundred visible cells regardless of total tiling size.
2. **Keep navigation bounded** (recompute-from-anchor / orbit). Unbounded drift
   both pushes all content off-screen *and* overflows the transform (Phase 1).
3. **canvas-2D is sufficient** at these counts; reach for WebGL only for
   many-thousand-tile scenes or to beat software rasterizers on weak devices.

## Phase 3 — date layout + selection: **PASS (with a layout finding)**

`datepicker.html` (+ `select.mjs` CDP test) maps real dates into the disk,
renders them with focus+context, and selects by click (nearest date) / pan to
navigate.

- **Layout (Mapping A, flat):** concentric **year-rings** (year → hyperbolic
  radius ρ, monotone, ρ_max≈14 per Phase 1), **day-of-year → angle**; leap years
  handled (`daysInYear` 365/366). ±10y = **7,671** dates.
- **Selection:** click → nearest date by hyperbolic distance; drag → Möbius pan;
  default view centred on today.

### Result (47 sample dates incl. both leap days)

| how | hit rate |
|---|---|
| **after recentring on the target, then click** | **100%** |
| direct, no navigation (click where it renders) | 15% (near 3/15, mid 2/12, far 2/20) |

The selection-correctness **gate passes**: every date is reliably reachable by
navigating it to the magnified centre. Direct-click is low *by design* — only
the focused region is clickable at once (focus+context); to select elsewhere you
pan there first.

### Layout finding (the important part)
The flat concentric-ring layout is geometrically valid and numerically fine, but
**UX-poor**: a single year-ring has enormous hyperbolic circumference
(`2π·sinh ρ`), so a year's *own* days scatter all the way to the boundary —
centred on today you mostly see "2 Jun" of *other years* strung radially, not a
usable month/week. (See the rendered screenshot.) This confirms the Phase-0
recommendation: the real layout should be the **hierarchical year→month→day tree**
(Mapping B, the Lamping hyperbolic-browser pattern), where drilling in
(click year → months → days) keeps a *usable, contiguous* set of dates in focus.

## Phase 3b — hierarchical year→month→day tree (Mapping B): **PASS**

`tree.html` (+ `tree.mjs` CDP driver) implements the layout the flat version
pointed to: the **Lamping hyperbolic tree**.

- **Layout:** root → year → month → day. Each node carries a Möbius transform
  `T = parentT ∘ rot(φ) ∘ translateOut(step)`; children fan across an angular
  aperture that re-expands at each level (negative curvature gives the room).
  Geodesic-arc edges. ±5y = **4,161 nodes / 4,017 day-leaves**.
- **Interaction:** click nearest node → recenter (drill in); a day-leaf also
  selects. Drag → Möbius pan.

### Drill-down (screenshots `/tmp/tree-{root,year,month}.png`)
- **root**: 11 year nodes ringing the centre, each subtree fanning to the edge.
- **click 2026**: its 12 months ring the centre, readable; other years recede.
- **click June**: its days **1–30 fan out, numbered and clickable**; neighbour
  months sit alongside as context.

This is the win the flat layout lacked: the focused region is always a
*contiguous, meaningful* set (a year's months, a month's days).

### Selection (37 dates incl. both leap days)
| how | hit rate |
|---|---|
| **drill year→month→day, then click** | **100%** |
| direct from root, one click | 43% |

**Gate PASS.** Tunables (`s0/s1/s2` step per level, `expand/minap/maxap`
aperture) are URL params; `s2=1.7` keeps a month's days close enough to label
when focused. Node count (~4k) renders comfortably (cf. Phase 2's 3k-tile budget).

### Feasibility scorecard
P1 math/stability ✅ · P2 render/perf ✅ · P3 layout + selection ✅ (use the tree).
The remaining unknowns are product/UX, not feasibility.

## Phase 4 — UX / accessibility: **PASS (feasible) — but honestly inefficient**

`tree-a11y.html` (+ `a11y.mjs`) adds the only viable a11y pattern for an
inherently-visual hyperbolic widget: a **parallel ARIA tree** that drives the
view; the canvas is `aria-hidden`.

- ARIA `tree`/`treeitem`, roving `tabindex`, `aria-level`/`-expanded`/`-selected`,
  lazy-expanded focus path, `aria-live` announcements, focus follows.
- **Keyboard-only selection: 100%** (21/21 incl. Feb 29), no mouse.
- **Honest cost:** avg **25**, worst **48** keystrokes (native date input ≈ 3);
  day touch targets **~5–6px** at month focus (WCAG min 24, comfy 44). So it's
  *accessible by construction* but far slower than a normal picker, and the
  ~30-day fan is below tap size — a **"week" grouping level** would lift that.

## Phase 4b — deep, range-adaptive layout (millennium→…→day)

`tree-deep.html` (+ `tree-deep.mjs`) generalises the tree to arbitrary ranges:
**millennium → century → decade → year → month → day**, with single-child
grouping nodes **auto-collapsed** (small ranges stay shallow; huge ones grow the
extra levels). Months/days are materialised lazily, so node count is bounded
regardless of range.

Measured over the **full AD/CE era, 0–2400 (2,401 years)** — millennia render as
**"0s / 1000s / 2000s"**:
- skeleton ≈ 2,668 nodes; **max branching ≤ ~31** at every level.
- a date is **~6 shallow hops** deep; deepest day-leaf **ρ ≈ 9.8** — well inside
  the Phase-1 safe bound (ρ≲18, collapse ~22). Numerically fine.
- contrast: a **flat** fan of 2,401 years off the root → **0.5px/year**
  (unclickable) and up to **2,401** keyboard presses. Grouping is what makes big
  ranges work — and deep balanced hierarchies are exactly hyperbolic space's
  strong suit.

**Takeaway:** the range is essentially unbounded (centuries/millennia cost
*depth*, which hyperbolic space gives cheaply); the real UX limiters are
per-level fan-out (touch size) and keyboard hops (type-ahead/jump would help).

## Phase 4c — the *complete* tree: week → weekday → time-to-seconds

`tree-deep.html` (now driven by `tree-time.mjs`) is the full thing. After month
the path is **week (ISO week-of-year) → weekday (Mon–Sun) → AM/PM → hour →
minute → second**, so a leaf is a full **timestamp**. The complete hierarchy:

`millennium → century → decade → year → month → week → weekday → AM/PM → hour → minute → second` (11 levels).

- **Week/weekday correctness** (proleptic Gregorian — JS `Date` is wrong for
  years < 100, which the 0–2400 range includes): days grouped into Mon–Sun ISO
  weeks; a week shows **only the weekdays whose date is in that month**. Verified
  invariant — weekday-leaves per month == days-in-month, with boundary weeks
  shrinking: e.g. `1776-07` → `W27:7,W28:7,W29:7,W30:7,W31:3` (Jul 29–31 only);
  `2026-02` → `W5:1` (Feb 1 is a lone Sunday). No invalid weekdays.
- **Time:** AM/PM → 12 hours → 60 minutes → 60 seconds.
- **Depth/precision:** a full timestamp is **11 hops**; deepest leaf **ρ ≈ 14.7**
  (`1776-07-04 15:30:45`) — still inside the Phase-1 safe bound (<18). Step
  shrunk to 1.4 to keep 11 levels under the wall.
- **Verified:** a full real-click drill year→…→second selects exactly
  `2026-06-02 15:30:45`.

### Feasibility scorecard — study complete
P1 math/stability ✅ · P2 render/perf ✅ · P3 layout+selection ✅ ·
P4 accessible ✅ (efficiency ❌ vs a normal picker, by nature) ·
range = all of AD/CE ✅ · full date **+ time-to-seconds** ✅.
**Verdict: feasible and buildable to a complete timestamp; never *efficient* —
perfect for this product, not for a serious one.**

### Not covered
Phase 5 — integrate as a `WackyDatePicker` mode behind `value`/`onChange`.
(`tree-deep.mjs` is the earlier day-only milestone driver; `tree-time.mjs`
supersedes it for the complete tree.)
