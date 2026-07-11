# Editable instance-prop input overwrites a dynamic binding with a literal silently

- **Discovered:** 2026-06-12 (caveman-review of component instance props)
- **Where:** apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v4/sections/component-instance.tsx `PropField`.
- **Symptom:** when an instance prop is bound to a dynamic expression, `getInstancePropValues` returns `null`; `effective = value ?? prop.defaultValue` shows the *default* in an editable text input. Committing writes a string literal, silently replacing the dynamic expression — with no "dynamic" indicator on editable types (only non-editable props show the italic "dynamic" hint).
- **Next step:** when `value === null` on an editable prop, render a read-only "dynamic" chip with an explicit "override" affordance instead of a pre-filled input.
- **Risk if ignored:** user unknowingly clobbers a dynamic prop value.
- **Tags:** `#bug` `#editor` `#ux`
