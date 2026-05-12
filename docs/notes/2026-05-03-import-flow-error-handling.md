# Import Flow Error Handling - 2026-05-03

## Summary

- Local project import now shows explicit user-facing errors when finalization starts without an authenticated user, without selected files, or without a project response.
- GitHub import retry now retries the selected repository from the finalizing step instead of only returning to repository selection.
- Email OTP verification now uses the active Weblab foreground token instead of the stale Onlook token.

## Rationale

These changes prevent users from being stranded on import finalization screens with no actionable feedback and remove a stale brand styling reference from the auth flow.
