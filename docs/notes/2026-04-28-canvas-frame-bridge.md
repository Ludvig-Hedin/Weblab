# Canvas Frame Bridge Notes

Updated: 2026-04-28

## Problem

The design canvas could show a live preview before the iframe bridge was actually ready. In CodeSandbox-backed previews this left the page visible but unselectable, while the console filled with repeated Penpal timeout and `getElementAtLoc` errors.

## Fix

- The frame now stays in a non-ready state until both the preload script and the Penpal bridge are connected.
- Preload-script installation failures now propagate back to the sandbox manager so retries can continue instead of silently marking the bridge as installed.
- Successful bridge connections now cancel any previously scheduled iframe reload, which prevents a healthy preview from being reloaded by an older failure timer.
- The bridge setup no longer reads `iframe.contentDocument` unless the iframe is same-origin, avoiding cross-origin failures against `*.csb.app` previews.
- Gesture handling now exits quietly while the bridge is still coming up instead of throwing repeated selection errors on every mouse move.

## User-Facing Impact

- Design mode should only become interactive once element selection is actually available.
- CodeSandbox previews should stop oscillating between visible-but-dead and reloading states.

## Architectural Note

This keeps readiness decisions at the frame bridge boundary instead of relying on sandbox/preload state alone. The iframe preview can render before the editing bridge is available; the canvas must not treat those as equivalent.
