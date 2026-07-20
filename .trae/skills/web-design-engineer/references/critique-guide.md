# Critique Mode — Detailed Reference

Read this when running Step 7 of the workflow (user asked for review, or self-check before delivery). The main SKILL.md already covers the 5 dimensions and output format. This file provides scoring rubrics, per-output-type weighting, and the common-issue catalog.

**Critique the design, not the designer.** Be specific, actionable, and grounded in design language — not vague taste claims.

---

## The Five Dimensions — Detailed Rubrics

### 1. Philosophy Alignment

How well does every detail trace back to the chosen design direction?

| Score | Standard |
|---|---|
| 9–10 | Every detail embodies the chosen philosophy; nothing reads as "borrowed from elsewhere" |
| 7–8 | Direction is correct, signature traits land, 1–2 minor drift moments |
| 5–6 | Intent visible, but mixed-in foreign elements dilute purity |
| 3–4 | Surface mimicry only; the underlying values aren't understood |
| 1–2 | No discernible relationship to any stated direction |

### 2. Visual Hierarchy

Does the eye flow where the designer intends?

| Score | Standard |
|---|---|
| 9–10 | Eye flows naturally along the intended path; zero friction |
| 7–8 | Primary/secondary clear; 1–2 spots where hierarchy is muddy |
| 5–6 | Title vs. body distinguishable, but middle layers collapse together |
| 3–4 | Information sits flat with no clear entry point |
| 1–2 | Chaotic — viewer doesn't know where to look first |

### 3. Craft Quality

Pixel-level execution: alignment, spacing, color discipline.

| Score | Standard |
|---|---|
| 9–10 | Pixel-perfect; alignment, spacing, color all flawless |
| 7–8 | Refined overall; 1–2 minor alignment or spacing issues |
| 5–6 | Basically aligned, but spacing is inconsistent and color use is unsystematic |
| 3–4 | Obvious alignment errors, chaotic spacing, too many colors |
| 1–2 | Sloppy — looks like a draft |

### 4. Functionality

Does each element earn its place?

| Score | Standard |
|---|---|
| 9–10 | Every element serves a goal; zero redundancy |
| 7–8 | Function-led overall, with minor decoration that could be cut |
| 5–6 | Usable, but obvious decorative elements compete for attention |
| 3–4 | Form > function; users have to work to find information |
| 1–2 | Decoration drowns the content's ability to communicate |

### 5. Originality

Avoids clichés while staying coherent within the philosophy.

| Score | Standard |
|---|---|
| 9–10 | Refreshing; finds a unique expression within the chosen philosophy |
| 7–8 | Has its own ideas; not template-by-numbers |
| 5–6 | Average; reads as a template execution |
| 3–4 | Heavy use of clichés (gradient orbs for "AI", chat bubbles for "conversation") |
| 1–2 | Pure template / stock-asset assembly |

---

## Per-Output-Type Weighting

| Output type | Most important | Secondary | Can relax |
|---|---|---|---|
| Landing page / marketing site | Functionality, Visual hierarchy | Originality | — |
| Dashboard / data product | Functionality, Craft quality | Visual hierarchy | Originality |
| HTML slide deck | Visual hierarchy, Functionality | Craft | Originality |
| Mobile app prototype | Functionality, Craft | Visual hierarchy | Philosophy alignment |
| Brand launch animation / hero film | Originality, Visual hierarchy | Philosophy | Functionality |
| Editorial / portfolio | Originality, Philosophy | Visual hierarchy | Functionality |
| Documentation site | Functionality, Visual hierarchy | Craft | Originality |
| Interactive prototype | Functionality, Visual hierarchy | Craft | Originality |

---

## Common Issues — Top 10 Catalog

### 1. AI-tech cliché
Gradient orbs, digital rain, blue circuit boards, robot faces. Use abstract metaphors instead.

### 2. Insufficient type-size hierarchy
Title and body too similar in size (< 2.5×). Title at least 3× body (16px body → 48–64px title).

### 3. Too many colors
5+ colors without clear primary/secondary structure. Limit to 1 primary + 1 secondary + 1 accent + grayscale.

### 4. Inconsistent spacing
Ad-hoc spacing with no system. Adopt an 8pt grid {8, 16, 24, 32, 48, 64, 96}.

### 5. Insufficient whitespace
Every region filled with content. Whitespace should be at least 40% of total area (60%+ for minimalist).

### 6. Too many fonts
3+ font families. At most 2 (1 display + 1 body).

### 7. Inconsistent alignment
Mixed left-, center-, and right-aligned blocks. Pick one alignment (typically left) and apply globally.

### 8. Decoration eclipses content
Background patterns / gradients / shadows steal focus. Apply the deletion test.

### 9. Cyber-neon overuse
Dark navy `#0D1117` + neon-glow accents (GitHub-dark / "AI dev tool" cliché). Pick a more distinctive palette.

### 10. Information density mismatched to medium
Wall of text on a slide; 10 elements crammed into a social cover. Different media have different optimal density.

---

## Output Template

```markdown
## Design Critique
**Overall: X.X / 10** [Excellent (8+) / Good (6–7.9) / Needs work (4–5.9) / Failing (<4)]
**By dimension**:
- Philosophy alignment: X / 10 — [one-sentence reason]
- Visual hierarchy: X / 10 — [one-sentence reason]
- Craft quality: X / 10 — [one-sentence reason]
- Functionality: X / 10 — [one-sentence reason]
- Originality: X / 10 — [one-sentence reason]

### Keep
- [Specific things done well, in design language]

### Fix (sorted by severity)
**1. [Issue name]** — ⚠️ Critical / ⚡ Important / 💡 Polish
- Current: [what it looks like now]
- Why: [why it's a problem]
- Fix: [concrete change with specific values]

### Quick Wins (top 3 if you only have 5 minutes)
- [ ] [Highest-impact change]
- [ ] [Second]
- [ ] [Third]
```

---

## Critique Anti-Patterns

- Vague taste claims: "the colors are off" → bad. "The accent saturation is too high — at oklch(0.65 0.25 25) it competes with the primary; reduce to 0.18 chroma" → good.
- Praise without specifics: "looks great!" provides zero learning. Say what is great and why.
- Mixing severity: critical hierarchy bug next to polish-level color tweak. Sort by ⚠️ → ⚡ → 💡.
- More than 7 fix items: cognitive overload. Group related issues.
- Critiquing without grounding: every "Fix" should reference a principle (hierarchy, craft, philosophy).
- Critiquing the designer instead of the design: "you didn't think this through" → bad. "This element doesn't earn its place — consider removing" → right framing.
