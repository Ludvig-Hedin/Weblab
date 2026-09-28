# apps/desktop (paused)

> **Paused since 2026-09-28.** This is the old Weblab desktop app: an Electron
> shell around the hosted web editor, with sign-in and cloud projects
> (last release `desktop-v0.2.6`). It is kept, not deleted.
>
> **The current desktop app is [`apps/desktop-local`](../desktop-local/)**:
> Weblab for Mac, local-first, no account. weblab.build links to it while the
> site runs in local-app mode. See
> [docs/guides/local-app-mode.md](../../docs/guides/local-app-mode.md).

Do not cut new `desktop-v*` releases from this folder unless the cloud app is
un-paused. Its release workflow is `.github/workflows/desktop-release.yml`
(release notes in [RELEASES.md](RELEASES.md)).
