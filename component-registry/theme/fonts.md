# Fonts — the only typefaces the AI may use

Pick the pair that matches the committed direction. Load with `next/font`
(`next/font/google` or a local file). Never use Inter at its default weight, and
never introduce a third family. Enable `font-optical-sizing: auto` and tabular
numerals (`font-variant-numeric: tabular-nums`) on data.

## Direction A — Soft modern (default)

_Reference feel: Sana, Apple, OpenAI, Linear, Vercel._

- **Display + text:** `Geist` (one family, two roles via weight/size).
- **Mono (code, IDs, timers):** `Geist Mono`.

```ts
// app/layout.tsx
import { Geist, Geist_Mono } from 'next/font/google';

const sans = Geist({ subsets: ['latin'], variable: '--font-sans' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });
```

## Direction B — Editorial premium

_Reference feel: Legora._

- **Display / headlines:** `Fraunces` (variable serif, optical sizing) — the hero.
- **UI / long body:** `Geist` (restrained sans).

```ts
import { Fraunces, Geist } from 'next/font/google';

const display = Fraunces({ subsets: ['latin'], variable: '--font-display', axes: ['opsz'] });
const sans = Geist({ subsets: ['latin'], variable: '--font-sans' });
```

## Rules

- Commit to one direction per site. Do not blend A and B.
- Tracking: negative on display (~-0.02em), easing to 0 at body size.
- Leading: 1.1–1.25 on headings, ~1.5 on body.
- When editing an existing project, use **its** fonts. Do not swap them.
