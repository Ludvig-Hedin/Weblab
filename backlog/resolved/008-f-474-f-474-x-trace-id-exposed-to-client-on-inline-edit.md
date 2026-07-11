# F-474 — `X-Trace-Id` exposed to client on `inline-edit`

- **Discovered:** 2026-05-28 (deeper bug-hunt pass on F-470..F-479)
- **Resolved:** 2026-07-07 — header now only set when `env.NODE_ENV !== 'production'`; omitted entirely in production.
- **Tags:** `#security` `#observability`
