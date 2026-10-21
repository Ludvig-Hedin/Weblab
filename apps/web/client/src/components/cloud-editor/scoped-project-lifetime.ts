export type ScopedProjectIdentity = Readonly<{ userId: string | null; sessionId: string | null }>;
export type ScopedProjectEpoch = ScopedProjectIdentity & Readonly<{ epoch: number }>;

/** UI lifetime only. The caller must obtain fresh backend authority before admit. */
export class ScopedProjectLifetime {
    private identity: ScopedProjectIdentity = { userId: null, sessionId: null };
    private version = 0;
    private admittedVersion: number | null = null;

    observe(identity: ScopedProjectIdentity): number {
        if (
            identity.userId !== this.identity.userId ||
            identity.sessionId !== this.identity.sessionId
        ) {
            this.identity = { ...identity };
            this.invalidate();
        }
        return this.version;
    }

    capture(): ScopedProjectEpoch {
        return { ...this.identity, epoch: this.version };
    }
    invalidate(): void {
        this.version++;
        this.admittedVersion = null;
    }
    current(captured: ScopedProjectEpoch): boolean {
        return (
            captured.epoch === this.version &&
            captured.userId !== null &&
            captured.sessionId !== null &&
            captured.userId === this.identity.userId &&
            captured.sessionId === this.identity.sessionId
        );
    }
    admit(captured: ScopedProjectEpoch): boolean {
        if (!this.current(captured)) return false;
        this.admittedVersion = captured.epoch;
        return true;
    }
    admitted(captured: ScopedProjectEpoch): boolean {
        return this.current(captured) && this.admittedVersion === captured.epoch;
    }
}
