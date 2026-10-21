# apps/desktop (team editor)

> **Resumed 2026-10-05 for the invited team.** This is the Electron shell
> around the hosted web editor on weblab.build, with sign-in, private working
> copies of local Git projects and reviewed handoff. It was paused between
> 2026-09-28 and 2026-10-05 (last public release `desktop-v0.2.6`).
>
> **The public Mac download is still [`apps/desktop-local`](../desktop-local/)**:
> Weblab for Mac, local-first, no account. weblab.build links to it while the
> site runs in local-app mode. See
> [docs/guides/local-app-mode.md](../../docs/guides/local-app-mode.md).

`desktop-v*` tags build team installers through
`.github/workflows/desktop-release.yml` (release notes in
[RELEASES.md](RELEASES.md)). Those releases are never marked as the
repository's latest release, because the public download follows
`releases/latest`. Signing in needs an email on the sign-in allowlists.
