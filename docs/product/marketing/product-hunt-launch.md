# Product Hunt Launch — Weblab

> Goal: drive a large, concentrated spike of branded "Weblab" search demand and high-quality backlinks within a single 24-hour window. This is the single biggest signal Google uses to elect *the* Weblab entity.

**Owner:** Ludvig Hedin
**Status:** Draft — finalize 1 week before launch
**Target launch window:** Tuesday or Wednesday, 12:01 AM PST (best PH ranking dynamics)

---

## TL;DR — what to do

1. **Pre-launch (T-14 to T-1):** prepare assets, line up hunters/upvoters, build a "ship list" newsletter, schedule social posts.
2. **Launch day (T-0):** post at 12:01 AM PST, respond to every comment within 30 min for 12+ hours, push social waves at 9 AM, 12 PM, 3 PM, 6 PM PST.
3. **Post-launch (T+1 to T+7):** thank-you posts, write a "lessons learned" blog post (more SEO juice), capture the top X/LinkedIn engagement into testimonials.

---

## Positioning options (pick one before writing the page)

| # | Tagline (≤60 chars) | Best for |
|---|---|---|
| A | The visual editor that ships pull requests, not prototypes. | Engineering-led teams, GitHub-savvy crowd |
| B | Cursor for designers — design with your real React components. | Design-engineering, dev-tool curious |
| C | Stop rebuilding mocks. Edit the real codebase visually. | Pragmatic frontend leads |
| D | An infinite canvas for your real React app. | Design-tool aesthetic crowd |

**Recommended:** **B** for headline reach, **A** as a fallback. B has the highest brand-search lift potential because "Cursor" is already a known reference point.

---

## Product Hunt page assets

### Tagline (60 chars max)
> Cursor for designers — design with your real React components.

### Description (260 chars max)
> Weblab is a visual editor for your existing React codebase. Edit real components on an infinite canvas. AI is constrained to your design system. Changes ship as pull requests engineers can merge. Open source.

### First comment / "maker comment" (the most important text)

> Hi PH 👋 — Ludvig here, founder of Weblab.
>
> Designers and engineers are stuck in a loop. Designers mock something in Figma, engineers translate it, the design system drifts, AI generates more drift, and nothing actually ships clean.
>
> Weblab is the editor I always wanted: an infinite canvas that uses *your real React components* as the building blocks. AI can only use the things in your design system — your buttons, your tokens, your spacing. Every change becomes a pull request your engineers review and merge.
>
> Three things I'd love feedback on today:
> 1. Does the "PR not prototype" framing land for your team?
> 2. What design-system / component-library combo do you wish was first-class?
> 3. What's the one workflow you'd want us to nail next?
>
> We're open source (Apache 2.0, forked and rebuilt with permission), based in Sweden, and shipping fast. AMA.
>
> 🛠 Try it free → https://weblab.build/projects
> 💻 GitHub → https://github.com/Ludvig-Hedin/Weblab

### Topics / categories
Primary: **Design Tools**
Secondary: **Developer Tools**, **Artificial Intelligence**

### Maker(s)
- Ludvig Hedin — founder, building from Sweden

---

## Visual assets — checklist

| Asset | Spec | Status |
|---|---|---|
| Logo / icon | 240×240 PNG, transparent or dark bg | ☐ |
| Gallery image 1 (hero) | 1270×760 PNG/JPG — clean canvas screenshot showing real components | ☐ |
| Gallery image 2 | 1270×760 — AI editing in action with PR diff visible | ☐ |
| Gallery image 3 | 1270×760 — design-system constraints panel | ☐ |
| Gallery image 4 | 1270×760 — Claude Code / vibe-coding workflow visual | ☐ |
| Gallery image 5 | 1270×760 — team / collaboration shot or testimonial | ☐ |
| Demo video (optional but boosts ranking) | 30-60s, MP4, ≤256MB | ☐ |
| OG image for shares | 1200×630 — already at /og-image.png, verify it has the new tagline | ☐ |

**Visual rule:** every image must have one large, readable headline. PH thumbnails are tiny — text needs to survive a 200px-wide preview.

### Video script (60s)
1. **0–8s:** "Designers and engineers don't speak the same language. Mocks become specs become Jira tickets become drift."
2. **8–20s:** Show Weblab canvas opening, real React components appearing, designer dragging one onto the canvas.
3. **20–40s:** Show AI prompt: "make this card use our brand color" — show it constrained to design tokens, no drift.
4. **40–55s:** Show "Open Pull Request" → GitHub PR appearing in next tab.
5. **55–60s:** "Weblab. Cursor for designers. weblab.build."

---

## Pre-launch (T-14 → T-1)

### T-14 days
- [ ] Lock in a hunter with strong PH following (look for someone with 1k+ followers and recent successful hunts in design/dev tools — DM 5-10 candidates).
- [ ] Set up `https://weblab.build/launching` waitlist page (or repurpose home with a "Launching on PH on [date]" badge).
- [ ] Create launch-day Twitter/X thread draft.
- [ ] Email Ludvig's network — "we're launching, save the date" — no asks yet.
- [ ] Set up a `/launching` route OR add a launch banner to homepage with countdown.

### T-7 days
- [ ] Submit "Coming Soon" page on Product Hunt — gets indexed, builds early follower list.
- [ ] Schedule 5 X/Twitter posts and 2 LinkedIn posts for launch day (9 AM, 12 PM, 3 PM, 6 PM, 9 PM PST).
- [ ] Reach out to 30-50 people personally — "I'm launching [date] on PH, would mean a lot if you upvoted/commented" — NO mass messages.
- [ ] Brief any team members or close advocates on what to do day-of (one focused ask: comment first thing in the morning, share one network).
- [ ] Post in 3-5 relevant communities (read their rules first):
  - [ ] r/SideProject
  - [ ] r/webdev
  - [ ] Design Tools Slack / Designer Hangout
  - [ ] Indie Hackers
  - [ ] Hacker News (Show HN, only on launch day, separate URL)

### T-3 days
- [ ] Final review of all PH copy + assets.
- [ ] Test the demo video on mobile (most upvoters scroll on mobile).
- [ ] Confirm hunter is ready to post at 12:01 AM PST.
- [ ] Set up PostHog event for `source=producthunt` and verify spike is tracked.
- [ ] Draft the "thank you" follow-up post for T+1.
- [ ] Verify weblab.build is fully indexed in Google (otherwise the spike traffic gets wasted on direct visits, not branded search).

### T-1 day
- [ ] Sleep early. PH launch days are 18-hour grinds.
- [ ] Verify scheduled posts.
- [ ] Pre-write 5 stock comment responses to common questions (pricing, framework support, comparison vs Lovable/Bolt/v0).

---

## Launch day (T-0) playbook

### 12:01 AM PST
- [ ] Hunter posts.
- [ ] Maker comment goes up within 5 minutes.
- [ ] First social posts go out within 15 minutes.

### Hour-by-hour
| Time (PST) | Action |
|---|---|
| 12:01 AM | Launch live, maker comment, X/LinkedIn wave 1 |
| 6 AM | Send "we just launched" email to your list |
| 8 AM | Post in HN as "Show HN: Weblab — visual editor for React that ships PRs" |
| 9 AM | Social wave 2 (with screenshot of current PH ranking) |
| 12 PM | Reddit posts go live in scheduled communities |
| 3 PM | Social wave 3 — feature a piece of feedback from a real PH commenter |
| 6 PM | Social wave 4 — milestone post if you've hit a top-5 position |
| 9 PM | Social wave 5 — final push, thank everyone |
| 11:59 PM | Final upvote-friendly post: "12 hours left, here's what we learned today" |

### Comment-response rules
- **Respond to every comment within 30 minutes for the first 12 hours.** PH's algorithm rewards engagement velocity, not just upvotes.
- Don't paste — write each response. Even short (1-2 sentence) personalized replies.
- If someone says "this is just like X" — engage warmly, link them to the relevant `/compare/X` page, do not get defensive.
- Save the gnarly questions for a long-form blog post on T+2 ("what we heard on launch day").

### Forbidden
- Buying upvotes — instant disqualification, and PH bans you forever.
- Using a fresh / unverified hunter — drops your launch into "low ranking" purgatory.
- Begging in DMs — invite, don't beg.
- Cross-posting to PH from a banned account.

---

## Post-launch (T+1 → T+7)

### T+1
- [ ] Thank-you post on PH (in the comment thread, not as a separate post).
- [ ] Thank-you tweet thread tagging key supporters.
- [ ] Email everyone who signed up — "thanks, here's what's next."
- [ ] If you placed top-5: order the badge for the homepage / footer.

### T+3
- [ ] Publish "What we learned launching Weblab on Product Hunt" blog post (this ranks for "Product Hunt launch lessons" plus drives more branded search).
- [ ] Reach out to anyone who called you "the X alternative" and turn it into a comparison page or testimonial.

### T+7
- [ ] Audit Google Search Console for spike in branded "Weblab" searches.
- [ ] Audit GitHub stars curve — PH usually adds 200-500 stars in week 1 if launch went well.
- [ ] Update homepage with PH badge if top-3.

---

## Success metrics

| Metric | Floor | Target | Stretch |
|---|---|---|---|
| PH rank (day) | Top 10 | Top 5 | #1 |
| PH upvotes | 250 | 500 | 1000 |
| Comments | 30 | 60 | 100 |
| Branded "Weblab" searches week-of | +500% baseline | +1000% | +2000% |
| GitHub stars added | +100 | +300 | +500 |
| Direct traffic to weblab.build (24h) | 5,000 | 15,000 | 30,000 |
| Sign-ups | 200 | 500 | 1500 |

---

## Risk mitigation

- **Site goes down under traffic.** Verify Vercel autoscaling. Pre-warm caches by hitting `/`, `/features`, `/compare/lovable`, `/compare/bolt`, `/compare/v0`, `/pricing`. Consider stripping non-critical client JS for launch week.
- **Onboarding friction.** Make `/projects` the public CTA — no signup wall before someone sees the editor.
- **Negative comments.** Have a 1-paragraph "we hear you, here's how we think about it" response ready for the most predictable critiques (pricing, framework support, AI ethics, fork attribution).
- **Hunter drops out.** Have a backup hunter committed.
- **Google traffic from spike doesn't convert to brand search.** Run paid Twitter/X for 48h targeted at "design engineer" / "frontend developer" interest with the exact phrase "Weblab" in the copy — manufactures branded searches.
