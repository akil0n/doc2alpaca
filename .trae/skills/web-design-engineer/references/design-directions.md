# Design Direction Advisor — Extended Reference

Read this when the request is vague ("make something nice", "I don't know what style I want") and no design context exists. The main SKILL.md already covers the mechanism (3 differentiated directions, named designer references, hard rule against same-school picks). This file provides the school taxonomy — six high-level philosophical lenses, each with named anchors and the sample copy you use to recommend it.

---

## How to Use This File

1. Read the user's request and the four positioning questions (narrative role / viewing distance / visual temperature / capacity)
2. Pick **3 schools from different rows** below that genuinely fit the user's context
3. Recommend each with: named designer/studio + 2–3 lines of "why this fits you" + 3–4 signature visual cues + (optional) one famous touchstone work
4. Wait for the user to pick one (or remix two)
5. After the user picks a school, recommend concrete design direction specifics from the anchor references
6. The chosen direction becomes the design context — write it into `brand-spec.md` and proceed to the main workflow

---

## The Six Schools

### 1. Information Architecture

**Vibe**: Rational, data-driven, restrained, hierarchy-led
**Best for**: Safe / professional / B2B / data products / institutional
**Why it works**: Treats the page as a system of typographic and grid relationships. The "design" disappears so the information speaks.

| Anchor | What to borrow |
|---|---|
| **Pentagram** (Paula Scher, Michael Bierut) | Bold typography as image; identity through type relationships; sparing color use |
| **Edward Tufte** | Maximum data-ink ratio; small multiples; smallest sufficient difference |
| **Massimo Vignelli** | Helvetica-style restraint; strict grid; 6 typefaces is enough for a lifetime |
| **Bloomberg Terminal** | Mission-critical density; amber-on-near-black; monospaced data |
| **NYT / Broadsheet editorial** | Multi-deck hierarchy; serif headlines; place-rich photography |

**Sample copy when recommending**:
> "Pentagram-style information architecture — your dashboard becomes a system of typographic relationships rather than a UI. Headlines do the heavy visual lifting; everything else recedes. Best when you want institutional credibility and your data is the hero."

---

### 2. Editorial / Minimalist

**Vibe**: Whitespace, refined typography, quiet luxury, considered
**Best for**: Premium / high-end / quiet / lifestyle / prestige B2C
**Why it works**: Treats whitespace as the primary design material. Restraint reads as confidence.

| Anchor | What to borrow |
|---|---|
| **Kenya Hara (MUJI)** | Whiteness as a value; ex-formation; emptiness as fullness |
| **Apple HIG / Marketing** | Generous negative space; hero product on white; one-thought-per-screen |
| **Dieter Rams (Braun)** | "Less but better"; honest materials; functional decoration is a contradiction |
| **Aesop** | Cream/sage palette; serif copy as conversation; product as protagonist |
| **Monocle** | Magazine-grade kicker / headline / dek hierarchy; international considered |

**Sample copy when recommending**:
> "Kenya Hara-style editorial minimalism — the page is mostly whitespace, with one serif headline carrying emotional weight and the product anchored in a single hero shot. Best when premium positioning matters more than feature density."

---

### 3. Motion / Experimental

**Vibe**: Bold, generative, sensory, kinetic, technical
**Best for**: Distinctive / launch films / brand moments / awwwards-style / tech storytelling
**Why it works**: Movement and surprise are the brand. Static screenshots can't capture the experience.

| Anchor | What to borrow |
|---|---|
| **Field.io** | Generative type and form; data-driven motion; the page is a system that makes itself |
| **Active Theory** | WebGL hero moments; physics-driven interactions; cinematic transitions |
| **Resn** | Storytelling through scroll; payoff for exploration; surprise is the reward |

**Sample copy when recommending**:
> "Field.io-style motion-led identity — the page generates itself in front of the visitor through choreographed scroll-driven sequences. Best when the launch moment matters and your audience will share clips."

---

### 4. Brutalist / Raw

**Vibe**: Anti-design, honest, unpolished, confrontational
**Best for**: Differentiated / confident / counter-culture / publishing / artist platforms
**Why it works**: Ugly-on-purpose reads as authentic in a sea of polished AI defaults.

| Anchor | What to borrow |
|---|---|
| **Are.na** | Raw HTML feel; system fonts on purpose; content > chrome |
| **Bloomberg Businessweek covers** (Richard Turley era) | Typographic violence; magazine grid abused; copy as image |
| **Balenciaga** (post-2017) | Default browser styling weaponized; hero text in Helvetica at absurd scale |
| **Craigslist** | Information density without apology; everything is a link |

**Sample copy when recommending**:
> "Are.na/Bloomberg-style brutalism — system fonts, harsh type contrast, no rounded corners, no shadows. Confrontational on purpose. Best when you're a strong contrarian voice."

---

### 5. Warm Humanist

**Vibe**: Approachable, organic, hand-touched, friendly without being childish
**Best for**: Lifestyle / education / approachable B2C / community products / health
**Why it works**: Conveys that real humans made this for real humans.

| Anchor | What to borrow |
|---|---|
| **Mailchimp** (early Freddie era) | Hand-drawn marks; warm illustration; personality in microcopy |
| **Stripe Press** | Editorial serif + warm palette + tactile object photography |
| **Studio Dumbar** | Identity through movement and personality, not through restraint |
| **Headspace / Calm** | Soft pastels, rounded everything, breathing-pace motion |

**Sample copy when recommending**:
> "Stripe Press / early Mailchimp warmth — humanist serifs, cream palette, illustrations that feel hand-touched. Best when you want trust and approachability over institutional polish."

---

### 6. Modern Tool / Builder SaaS

**Vibe**: Quiet luxury for tools, hairline detail, warm dark + monospace accents
**Best for**: Developer tools, B2B SaaS, AI tools, infrastructure / platform products, productivity apps
**Why it works**: Confident restraint reads as "made by people who use tools," not "made by marketers."

| Anchor | What to borrow |
|---|---|
| **Linear** | Hairline 1px borders, warm dark ground, selective purple accent < 5% of pixels, keyboard-first chips |
| **Vercel** (recent) | Black + white precision broken by one feathered gradient mesh; deploy-log realism in the hero |
| **Raycast** | Glassy command-palette as hero; per-extension color dots used as small accents |
| **Notion** (pre-AI era) | Friendly serif headlines + emoji-as-icon on cream surfaces; structure first, warmth second |

**Sample copy when recommending**:
> "Linear-style modern-tool aesthetic — warm dark ground, hairline 1px borders, a single purple accent used on less than 5% of pixels, monospace shortcut chips. Best when your audience is technical and 'serious but designed' matters more than 'fun and accessible.'"

---

## When the User Picks (or Remixes)

Common user responses:
- **"I'll go with #2."** → Direction confirmed. Write it into `brand-spec.md`. Proceed to main workflow.
- **"I like A's color but C's layout."** → Confirm the remix in writing, then proceed.
- **"None of these feel right — show me more."** → Ask one targeted question, then offer 3 fresh directions.
- **"I don't know, you pick."** → Pick the safest one (usually Editorial / Minimalist), state reasoning, and propose a 5-minute v0.

---

## AI-Prompt Templates

Format: `[philosophy DNA] + [content description] + [technical params]`

✅ **Good**:
> "Kenya Hara-influenced minimalism with 80% whitespace, single muted terracotta (#C04A1A) accent, GT Sectra serif headline, single product hero on warm off-white (#F2EFE8) ground, soft top-down lighting, 3:2 aspect"

❌ **Bad**:
> "minimalist style, premium feel, high quality"

Always include:
- Color HEX (not "warm" / "cool")
- Aspect ratio and dimensions
- Composition rules (rule-of-thirds, centered, asymmetric)
- What to avoid (e.g., "no purple gradient, no emoji, no rounded cards")

---

## Anti-Patterns in Direction Recommendation

- Recommending 3 picks from the same row — the user can't tell them apart
- Recommending "minimalism" / "modern" / "clean" — these are not directions, they are AI-default words
- Recommending without any "why this fits you" — each option must explain its fit
- Showing 5+ directions — choice paralysis. 3 is the sweet spot.
- Asking the user to score each direction 1–10 — make a recommendation; the user will agree or push back
