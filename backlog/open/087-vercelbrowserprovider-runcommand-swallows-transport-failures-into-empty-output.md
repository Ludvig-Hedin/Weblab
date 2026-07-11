# `VercelBrowserProvider.runCommand` swallows transport failures into empty output

- **Discovered:** 2026-06-11 (canvas-editor bug hunt)
- **Where:** apps/web/client/src/components/store/editor/sandbox/vercel-browser-provider.ts (`runCommand` catch)
- **Symptom:** callers (git manager, CLISession) receive `{ output: '' }` when the sandbox is unreachable and misinterpret it (e.g. "package.json parse failed", git ops silently no-op).
- **Why:** the catch returns an empty result instead of rethrowing; mitigated for the dev-runner by an empty-output retry, but git flows still can't distinguish failure from empty stdout.
- **Next step:** change `runCommand` to throw and audit every caller (`git.ts` ~20 call sites, terminal.ts). `TODO(bug-hunt)` marker in the catch block.
