# "Reset all properties" removes dynamically-bound instance attributes too

- **Discovered:** 2026-06-12 (caveman-review of component instance props)
- **Where:** apps/web/client/src/components/store/editor/components/index.ts `resetAllInstanceProps`.
- **Symptom:** it builds `{ __remove: true }` for every key from `getInstancePropValues`, which includes props whose value parsed as `null` (a dynamic expression like `title={foo}`). "Reset all" therefore strips a real dynamic binding, not just literal overrides.
- **Next step:** skip keys whose parsed value is `null` (dynamic) when building the remove set, or confirm with the user. `resetInstanceProp` (single) has the same property but is explicit per-prop.
- **Risk if ignored:** a "reset" can silently delete a hand-written dynamic prop on the usage site.
- **Tags:** `#bug` `#editor`
