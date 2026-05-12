# Weblab Blog — 12-Week Content Calendar

> Goal: rank for category long-tail SEO, drive sustained branded-search demand, and build topical authority before the Product Hunt launch (week 4-5).

**Cadence:** 2 posts per week (Tuesday + Thursday, 9 AM CET). Total: 24 posts.
**Length target:** 1,400–2,200 words per post unless flagged "deep dive" (3,000+).
**Author:** Ludvig Hedin (signed posts), with `Author` schema markup on each.
**Internal-linking rule:** every post links back to (a) the homepage, (b) one feature page, (c) one comparison page, (d) one earlier blog post.

---

## How to use this doc

1. Each post has: target keyword, working title, intent, hook, outline, internal links, CTA, format/format-rules, and word count.
2. Drafts go in a Notion doc, get a 24h review pass, then ship.
3. After publishing, log the URL + GSC-tracked keyword rank weekly in `/docs/product/marketing/seo-tracking.md` (create when you start).
4. Posts marked "comparison page support" are the SEO companion content for the `/compare/*` landing pages — always link them together.
5. Posts marked "showcase" are designed for social/Twitter virality more than search; use them to spike branded search.

---

## Week 1 — Foundation: define the category

### Post 1.1 — "Cursor for Designers: what we mean and why we use the term"
- **Target keyword:** cursor for designers
- **Intent:** Informational (high search demand, low competition)
- **Hook:** "Cursor changed how engineers work with AI. Designers got... nothing. Here's the playbook for what 'Cursor for designers' actually means."
- **Outline:** (1) Why the analogy works, (2) What Cursor got right that designers need, (3) Five attributes a real Cursor-for-designers product needs, (4) How Weblab does each, (5) What's next.
- **Internal links:** /, /features/ai, /workflows/claude-code, /compare/v0
- **CTA:** "Try Weblab on your codebase →"
- **Format:** Standard long-form, hero image, two screenshots
- **Words:** 2,000

### Post 1.2 — "Why your design system keeps drifting (and how to fix it without buying another tool)"
- **Target keyword:** design system drift
- **Intent:** Informational (decision-stage SEO)
- **Hook:** "Every design system manager has the same recurring nightmare. The fix isn't governance — it's tooling."
- **Outline:** (1) The four drift vectors (Figma divergence, AI generation, copy-paste implementation, time), (2) Why governance fails, (3) The constrained-AI fix, (4) Pattern walkthrough.
- **Internal links:** /features/ai, /features/builder, blog 1.1
- **CTA:** "See how Weblab constrains AI to your design system →"
- **Format:** Long-form + a diagram of the four drift vectors
- **Words:** 1,800

---

## Week 2 — Comparisons that rank fast

### Post 2.1 — "Weblab vs Lovable: when each one is the right tool" (comparison page support)
- **Target keyword:** weblab vs lovable, lovable alternative
- **Intent:** Commercial-comparison (highest CTR-to-signup ratio)
- **Hook:** "Both ship AI-built UIs. They are not the same product."
- **Outline:** (1) The 30-second answer, (2) When Lovable wins, (3) When Weblab wins, (4) Hybrid workflow (use both), (5) Migration tips.
- **Internal links:** /compare/lovable, /compare/bolt, /features/ai
- **CTA:** "See the full comparison →"
- **Format:** Comparison post with table, 4 screenshots
- **Words:** 1,600

### Post 2.2 — "v0, Bolt, Lovable, Weblab: a designer's decision tree"
- **Target keyword:** ai design tools comparison
- **Intent:** Informational with commercial intent
- **Hook:** A flowchart that answers "which AI design tool should I use?" in three questions.
- **Outline:** (1) Decision-tree intro, (2) Decision tree itself, (3) Why each tool wins different use cases, (4) Why we built Weblab.
- **Internal links:** /compare, all four /compare/* pages, /features/ai
- **CTA:** "Try Weblab if your codebase already exists →"
- **Format:** Decision-tree post, illustrated flowchart, comparison table
- **Words:** 2,200

---

## Week 3 — Workflows people are actually searching

### Post 3.1 — "Adding a visual canvas to Claude Code: a designer's workflow" (showcase)
- **Target keyword:** claude code visual editor, claude code for designers
- **Intent:** Informational (Anthropic ecosystem people are highly engaged, share well)
- **Hook:** "Claude Code is the best agent for engineers. Here's how a design team finally joins the workflow."
- **Outline:** (1) The Claude Code workflow, (2) Where designers fall off, (3) How Weblab fills the gap, (4) Walkthrough screenshots, (5) What's next for the integration.
- **Internal links:** /workflows/claude-code, /, /features/ai
- **CTA:** "Try the Claude Code workflow →"
- **Format:** Tutorial-style with 8 screenshots
- **Words:** 2,000

### Post 3.2 — "Vibe coding for teams: how to make AI-built UIs collaborative" (showcase)
- **Target keyword:** vibe coding for teams, vibe coding collaboration
- **Intent:** Informational + commercial
- **Hook:** "Vibe coding feels great solo. Then you try to ship it with a team and it falls apart."
- **Outline:** (1) Why vibe coding is solo by default, (2) The team-coding bottlenecks, (3) Team-vibe-coding patterns, (4) Where Weblab fits.
- **Internal links:** /workflows/vibe-coding, blog 3.1
- **CTA:** "See how teams vibe-code together →"
- **Format:** Long-form + a "before/after" comparison
- **Words:** 1,800

---

## Week 4 — Pre-Launch authority push (Product Hunt is week 5)

### Post 4.1 — "Open source visual editor for React: why we forked Onlook"
- **Target keyword:** onlook alternative, open source visual editor for react
- **Intent:** Commercial (intercept "Onlook alternative" searches)
- **Hook:** "Forks are usually a red flag. Here's why this one isn't."
- **Outline:** (1) The Onlook foundation, (2) What we extended, (3) Apache-2.0 attribution and respect for the original, (4) Roadmap, (5) How to migrate from Onlook to Weblab.
- **Internal links:** /compare/onlook, /, /features/ai
- **CTA:** "Try Weblab →"
- **Format:** Founder-narrative post, no fluff
- **Words:** 1,600

### Post 4.2 — "Design with your real React components: a 5-minute walkthrough" (showcase)
- **Target keyword:** edit react components visually, visual editor for react codebase
- **Intent:** Informational with commercial intent
- **Hook:** "Five minutes from cloning your repo to shipping a PR."
- **Outline:** Step-by-step with screenshots and a 90s embedded video.
- **Internal links:** /, /features/builder, /workflows/claude-code
- **CTA:** Embedded `Get started` button
- **Format:** Tutorial with embedded video, 12 screenshots
- **Words:** 1,400 (the video does the heavy lifting)

---

## Week 5 — Product Hunt launch week (HEAVY visibility)

### Post 5.1 — "We're launching Weblab on Product Hunt: here's what we built and why" (showcase)
- **Target keyword:** Weblab launch, Weblab Product Hunt
- **Intent:** Branded, viral
- **Publish:** 12 hours before PH launch.
- **Hook:** Founder letter — direct, vulnerable, specific.
- **Outline:** (1) Where the idea came from, (2) The four things we obsessed over, (3) What's broken about today's tools, (4) What we built, (5) Ask: please try it and give feedback.
- **Internal links:** all /compare/*, /, /features
- **CTA:** "Try Weblab today →" + "Upvote on PH at 12:01 AM PST →"
- **Format:** Founder essay, single hero image, 1-2 inline screenshots
- **Words:** 1,200 (essays don't need to be long)

### Post 5.2 — "What we learned launching on Product Hunt" (post-PH)
- **Target keyword:** Product Hunt launch lessons
- **Intent:** Informational (broader audience than just our customers; great for backlinks)
- **Publish:** 48 hours after PH launch.
- **Hook:** "We hit #X. Here's the actual playbook."
- **Outline:** Real numbers, what worked, what didn't, what we'd do differently. Be honest. Honest PH retros earn shares from other founders.
- **Internal links:** /, /compare, blog 5.1
- **CTA:** Soft CTA — "Try Weblab →" at the bottom
- **Format:** Numbers-heavy post, charts of upvote velocity
- **Words:** 2,000

---

## Week 6 — Long-tail authority

### Post 6.1 — "Visual editor for an existing React codebase: the missing tool"
- **Target keyword:** visual editor for existing react codebase
- **Intent:** Commercial-discovery (super specific, low-volume but very high-conversion)
- **Hook:** "Why every visual editor for the last 10 years has failed engineering teams."
- **Outline:** (1) The history of visual editors, (2) Why they failed (no real-component awareness), (3) The tipping point: AI + JSX parsers, (4) What "good" looks like.
- **Internal links:** /features/builder, /, blog 1.1
- **CTA:** "Try Weblab →"
- **Format:** Mini-history post with screenshots of each era
- **Words:** 2,000

### Post 6.2 — "Figma to React: stop translating, start editing the real thing" (showcase)
- **Target keyword:** figma to react, figma alternative for code
- **Intent:** Commercial
- **Hook:** "The Figma-to-React handoff is the most expensive ritual in modern product teams."
- **Outline:** (1) The cost of handoffs (real numbers if you have them), (2) Why "Figma to code" tools don't fix it, (3) The "edit the real thing" alternative, (4) Side-by-side workflow comparison.
- **Internal links:** /, /features/builder, blog 6.1
- **CTA:** "Skip the handoff →"
- **Format:** Side-by-side workflow diagrams
- **Words:** 1,800

---

## Week 7 — Engineer audience

### Post 7.1 — "How Weblab parses your React codebase (a Babel-on-JSX deep dive)" (deep dive)
- **Target keyword:** parse react components, babel jsx parser
- **Intent:** Engineer-focused thought leadership; collects backlinks from dev newsletters (Frontend Focus, Bytes, TLDR, JS Weekly)
- **Hook:** "We needed to make a visual editor that ships PRs. Here's the AST work that made it possible."
- **Outline:** Technical deep dive — JSX parsing, AST → canvas mapping, code-roundtripping, edge cases, performance.
- **Internal links:** /, /features/builder, GitHub repo
- **CTA:** "Read the source on GitHub →"
- **Format:** Code-heavy, syntax-highlighted, diagrams of the AST → canvas mapping
- **Words:** 3,200 (deep dive)

### Post 7.2 — "Constraining AI to a design system: how we keep outputs mergeable"
- **Target keyword:** ai design system constraint, design system aware ai
- **Intent:** Thought leadership + commercial
- **Hook:** "Most AI tools generate generic UI. Here's how we make sure ours can only generate yours."
- **Outline:** (1) The drift problem, (2) Token-aware AI, (3) Component-aware AI, (4) Real examples, (5) What's hard.
- **Internal links:** /features/ai, blog 1.2, /compare/v0
- **CTA:** "See it in action →"
- **Format:** Conceptual post + screenshots of the constraint UI
- **Words:** 2,200

---

## Week 8 — Designer audience

### Post 8.1 — "The state of design engineering in 2026: tools, teams, and the new role"
- **Target keyword:** design engineer, design engineering
- **Intent:** Industry thought leadership; broad-audience post
- **Hook:** "Design engineering is the role every team's hiring for. Here's what it actually is."
- **Outline:** (1) Definitions, (2) What design engineers do day-to-day, (3) Tooling stacks (mention Weblab), (4) Hiring patterns, (5) Where it goes from here.
- **Internal links:** /, /about, blog 1.1
- **CTA:** Newsletter signup, soft Weblab CTA
- **Format:** Industry analysis post
- **Words:** 2,400

### Post 8.2 — "Five things designers ask for that Weblab actually delivers" (showcase)
- **Target keyword:** weblab features, design tool wishlist
- **Intent:** Commercial-discovery
- **Hook:** Designer's wish list → product features.
- **Outline:** Five wishes (real-component editing, design-system-aware AI, infinite canvas, team comments, ship-as-PR), each with a screenshot.
- **Internal links:** /features, /features/ai, /features/builder
- **CTA:** "Try Weblab →"
- **Format:** Listicle, 5 sections, screenshots
- **Words:** 1,400

---

## Week 9 — Comparison + objection handling

### Post 9.1 — "When Weblab is the wrong tool" (deep dive)
- **Target keyword:** weblab review, weblab limitations
- **Intent:** Trust-building (the #1 most-shared founder content; ranks well for branded searches)
- **Hook:** "We're going to talk you out of using Weblab — for the cases where it isn't the fit."
- **Outline:** Five "do not buy if..." cases, each with the better alternative.
- **Internal links:** /compare/lovable, /compare/bolt, /compare/v0
- **CTA:** None (trust post — let the integrity do the work)
- **Format:** Honest, no-marketing-fluff style
- **Words:** 1,800

### Post 9.2 — "Weblab vs Bolt: when chat-first beats canvas-first" (comparison page support)
- **Target keyword:** weblab vs bolt, bolt alternative
- **Intent:** Commercial-comparison
- **Hook:** "There's no winner in this fight. There's only the right tool for the moment."
- **Outline:** Same structure as the 2.1 post — both/and framing.
- **Internal links:** /compare/bolt, /compare/lovable
- **CTA:** "See the full comparison →"
- **Format:** Comparison post
- **Words:** 1,600

---

## Week 10 — Customer / community signal

### Post 10.1 — "How [first real customer] uses Weblab to ship X faster" (customer story)
- **Target keyword:** weblab case study
- **Intent:** Social proof, branded discovery
- **Hook:** Specific number that moved.
- **Outline:** Customer profile, problem, before, switch, after, lessons.
- **Internal links:** /, /pricing, /features
- **CTA:** "Talk to us about your team →"
- **Format:** Case study, customer logo, photo, quote pull-outs
- **Words:** 1,400

### Post 10.2 — "Open-source contributions to Weblab: month one" (showcase)
- **Target keyword:** weblab github, weblab contributors
- **Intent:** Community-building, GitHub-stars driver
- **Hook:** "Thirty PRs. Seventeen contributors. Here's what shipped."
- **Outline:** Highlight reel of contributors, what they shipped, what's next.
- **Internal links:** GitHub repo, /, /about
- **CTA:** "Contribute →"
- **Format:** Round-up, contributor avatars, feature screenshots
- **Words:** 1,200

---

## Week 11 — Workflow library

### Post 11.1 — "Workflow library: shipping a feature from prompt to PR in Weblab" (tutorial)
- **Target keyword:** prompt to pr, ai to pr workflow
- **Intent:** Tutorial / informational
- **Hook:** Step-by-step.
- **Outline:** Real workflow with screenshots — cloning, editing on canvas, AI-assisted change, opening PR, merging.
- **Internal links:** /, /features, /workflows/claude-code
- **CTA:** "Try it on your repo →"
- **Format:** Tutorial post, 15 screenshots, 90s video
- **Words:** 2,000

### Post 11.2 — "Workflow library: editing a Tailwind + shadcn/ui app visually" (tutorial)
- **Target keyword:** tailwind visual editor, shadcn ui visual editor
- **Intent:** Tutorial
- **Hook:** "Tailwind utility classes and shadcn primitives — visual editing without losing the underlying code."
- **Outline:** Step-by-step.
- **Internal links:** /features/builder, blog 11.1
- **CTA:** "Try it →"
- **Format:** Tutorial post, screenshots
- **Words:** 1,800

---

## Week 12 — Quarter wrap-up

### Post 12.1 — "12 weeks of Weblab: what we shipped, what we learned, what's next" (essay)
- **Target keyword:** weblab progress, weblab roadmap
- **Intent:** Branded, founder-essay, builds long-term audience
- **Hook:** Specific. Numbers. Honesty about what didn't work.
- **Outline:** Quarter retro — wins, misses, what's next.
- **Internal links:** /, /pricing, /about
- **CTA:** Newsletter signup, soft product CTA
- **Format:** Founder essay
- **Words:** 1,800

### Post 12.2 — "The 'design system aware AI' bet" (deep dive thought-leadership)
- **Target keyword:** design system ai, ai design constraints
- **Intent:** Thought leadership, ranks for the category over time
- **Hook:** "We bet the company on the idea that AI should be constrained by your design system. Here's why."
- **Outline:** (1) The bet, (2) The alternative bets we rejected, (3) Why the constraints matter long-term, (4) Where this goes in 2027.
- **Internal links:** /features/ai, blog 7.2, /
- **CTA:** Newsletter, soft CTA
- **Format:** Founder thought-leadership essay
- **Words:** 2,400

---

## Production rules

### Every post must include
- A clear H1 with the target keyword in the first 60 characters.
- Title-tag override in Next.js metadata if the H1 is too long for SERPs.
- Meta description: ≤155 chars, includes the target keyword and a CTA verb.
- One above-the-fold internal link (don't bury links).
- An author byline with `Person` schema.
- A "last updated" date.
- An OG image (use the existing `/og-image.png` until per-post images are ready).
- Internal links to (a) home, (b) one feature page, (c) one comparison page, (d) one earlier blog post.
- A CTA at the 50% mark and a stronger CTA at the bottom.

### Forbidden
- Generic AI-written intros ("In today's fast-paced world...").
- Listicles padded with definitions everyone already knows.
- Inflated stats without citation.
- Disparaging competitors. Stay specific and factual; let the comparison do the work.

### Reuse
- Each blog post becomes a 5-tweet thread, a LinkedIn post, and a 60-second loom/clip.
- Repurpose every post as a snippet in the launch-week social waves.
- Funnel weekly posts into a monthly newsletter ("Weblab Notes #N").

### Distribution

| Channel | Frequency | Notes |
|---|---|---|
| X/Twitter | Per post (thread) | Tag @weblabbuild once handle is live |
| LinkedIn | Per post | Founder voice, link last |
| Hacker News | Selective (3-4 posts/quarter) | Only deep dives, never marketing posts |
| Reddit | Selective | r/webdev, r/reactjs, r/SideProject — read each sub's rules first |
| Frontend Focus / Bytes / TLDR | Submit deep dives | These newsletters drive long-tail readers and DR-50+ backlinks |
| LinkedIn newsletter | Weekly digest | Once you have 50+ subs |

---

## Tracking

After each post ships, add a row to `/docs/product/marketing/seo-tracking.md`:

| URL | Target keyword | Published | Week 1 rank | Week 4 rank | Week 12 rank | Conversions |
|---|---|---|---|---|---|---|

Review monthly. Kill underperformers' rewrite budget after 90 days if rank > 30.

---

## Stretch goals (if you have capacity)

1. Guest post in Smashing Magazine on "design-system-aware AI."
2. Podcast appearance: ShopTalk, JS Party, The Cloudcast.
3. Sponsored post in TLDR Newsletter (paid, ~$3-5k for AI/Frontend track) — schedules to coincide with launch.
4. Build a public dashboard: `weblab.build/state-of-design-engineering` — quarterly survey results, instantly link-worthy.
