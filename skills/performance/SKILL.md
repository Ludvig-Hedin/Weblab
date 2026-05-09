---
name: performance
description: Make the app fast — Core Web Vitals, bundle size, image/font loading, server vs client boundaries, caching, MobX/React render hygiene.
---

# Performance Skill

Use this skill when the user asks to "make it faster", "optimize", "improve LCP/INP/CLS", "reduce bundle", "fix slow page", "infinite re-renders", "Lighthouse perf", or ships any new public route or heavy feature.

## Targets — measure, don't guess

- **LCP (Largest Contentful Paint)** ≤ 2.5s on 4G mobile.
- **INP (Interaction to Next Paint)** ≤ 200ms.
- **CLS (Cumulative Layout Shift)** ≤ 0.1.
- **TTFB** ≤ 600ms (Vercel/Railway hosted is usually fine).
- **JS bundle for an above-the-fold landing page** ≤ 100KB compressed.

Lighthouse score is a proxy. Real-user monitoring (Web Vitals API) is the truth.

## Stack-specific rules

### Server vs client boundaries

- **Default to Server Components.** Add `'use client'` only for events, state, browser APIs, or client-only libraries (MobX observers, Framer Motion, etc.).
- Push `'use client'` as deep into the tree as possible. Don't mark a whole route client just because one button needs `useState`.
- Server Components don't ship JavaScript to the browser. Use them aggressively for static content, data display, layouts.

### Data fetching

- Fetch in Server Components, not in `useEffect`. Eliminates loading flicker + reduces waterfalls.
- Co-locate fetches with the component that needs them. Next.js dedupes within a request.
- Use `cache()` from `react` for request-scoped memoization.
- Stream slow data with `<Suspense>` rather than blocking the whole page.

### Images

- **Always `next/image`.** Never `<img>` for non-decorative content.
- Above-the-fold: `priority` prop. Below-the-fold: lazy-load (default).
- Set `sizes` accurately. `sizes="(max-width: 640px) 100vw, 50vw"` matches actual layout. Wrong `sizes` ships an oversized variant.
- `width` + `height` (or `fill` + sized parent) — eliminates CLS.
- Modern formats (`avif`, `webp`) — Next handles.

### Fonts

- `next/font/google` or `next/font/local`. Self-hosts and inlines correctly.
- Subset to characters you use. Avoid loading 8 weights when you ship 2.
- `display: 'swap'` to avoid invisible text during load.

### Bundle size

- Audit with `next build` output. Look at `First Load JS` per route.
- Replace heavy deps. `moment` → `date-fns` (or native `Intl`). `lodash` → `lodash-es` + named imports. `chart.js` for one chart → ship just the modules used.
- Dynamic-import below-the-fold widgets: `const Heavy = dynamic(() => import('./Heavy'), { ssr: false })`.
- Tree-shake icon libraries — `import { Icon } from '@weblab/ui/icons'` is fine; `import * as Icons` ships the lot.

### Caching (Vercel/Next 16)

- Static pages cached at the edge by default.
- For data: `unstable_cache` (or `'use cache'` directive in Next 16) with explicit `revalidateTag`.
- ISR via `revalidate` export.
- API routes: `Cache-Control` headers.
- Avoid `no-store` unless truly per-request.

## React render hygiene

- **Memoize the right things.** `useMemo` only for expensive computations. Wrapping a primitive `useMemo(() => 1, [])` is noise.
- **`useCallback` for stable handlers passed to memoized children**, not everywhere.
- **`React.memo` on leaf components that re-render with same props frequently.** Don't memoize the whole tree.
- **Don't pass new object/array literals as props every render.** `<Comp options={{a:1}} />` re-renders the child. Hoist or `useMemo`.
- **Keys on lists must be stable.** No `key={index}` for reorderable lists.
- **`useEffect` is your slowest tool.** If you're using it for data sync, you're probably wrong — use Server Components or React Query.

## MobX (this repo's pattern)

- Wrap components with `observer` so they auto-re-render on observable change. Without it, the component goes stale.
- Create stores with `useState(() => new Store())`, not `useMemo` (per CLAUDE.md — `useMemo` may drop value).
- Don't put store instances in effect deps if it loops. Split concerns.
- Computed values: `@computed` (or `makeAutoObservable` auto-detects) — better than running heavy work in render.

## Common slow patterns to fix on sight

- `useEffect(() => fetch(...), [])` on a public page — move to Server Component fetch.
- `'use client'` at the top of a marketing page — strip it; add only where needed.
- Loading the entire icon set with `import * as Icons`.
- Inline arrow functions as props to `React.memo`-d children — defeats memoization.
- A dialog rendered always but hidden with `display: none` — mount lazily.
- An animation running 60fps continuously off-screen — use `IntersectionObserver` to pause.
- Heavy syntax-highlighter loaded synchronously — `dynamic()` import.
- Re-fetching the same data in 3 components — hoist to a parent or use a query layer.

## Diagnosis workflow

1. **Measure first.** Open DevTools → Performance → record. Or run Lighthouse on the deployed URL (not localhost).
2. **Read the build output.** Which routes have the largest First Load JS? Which chunks dominate?
3. **Look at the network waterfall.** Long blocking requests? Render-blocking CSS or fonts?
4. **Profile React.** React DevTools → Profiler → record an interaction. Which components rendered, why?
5. **Form a hypothesis. Make ONE change. Measure again.** Don't change five things and call it improved.

## Anti-patterns

- "Let's add Redux for performance." It almost never helps. Co-located state is faster.
- Pre-emptive `useMemo` everywhere — added complexity, no measured win.
- `console.log` in production hot paths — surprisingly costly.
- Polling APIs every second for "real-time" — use WebSockets or Server-Sent Events.
- Loading every locale's translation strings on every page — split per locale.
- Putting a 3MB hero image through `next/image` doesn't make it not 3MB. Compress at source.

When the user asks "is this fast enough", the answer is a number with a measurement source — not a feeling.
