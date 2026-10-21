export type InvitationOwner = {
    userId: string | null | undefined;
    sessionId: string | null | undefined;
};

const sameOwner = (a: InvitationOwner, b: InvitationOwner) =>
    a.userId === b.userId && a.sessionId === b.sessionId;

/** One mounted invitation surface. Clerk events invalidate operations even across A → B → A. */
export class InvitationLifecycle {
    private mounted = false;
    private generation = 0;
    private pending: number | null = null;
    private scope = '';
    private owner: InvitationOwner;
    private activation: {
        target: InvitationOwner;
        origin: InvitationOwner;
        transitive: boolean;
        arrived: boolean;
    } | null = null;

    constructor(
        private readonly readOwner: () => InvitationOwner,
        private readonly enabled: () => boolean,
    ) {
        this.owner = { ...readOwner() };
    }

    mount() {
        this.mounted = true;
        this.owner = { ...this.readOwner() };
        this.invalidate();
    }

    unmount() {
        this.mounted = false;
        this.invalidate();
    }

    setScope(scope: string) {
        if (scope === this.scope) return;
        this.scope = scope;
        this.invalidate();
    }

    private invalidate() {
        this.generation++;
        this.pending = null;
        this.activation = null;
    }

    /** Returns true only when a change cancels the current surface's operation. */
    observe(owner: InvitationOwner): boolean {
        if (sameOwner(owner, this.owner)) return false;
        this.owner = { ...owner };
        const activation = this.activation;
        if (activation) {
            if (sameOwner(owner, activation.target)) {
                activation.arrived = true;
                return false;
            }
            if (
                !activation.arrived &&
                owner.userId === undefined &&
                owner.sessionId === undefined
            ) {
                activation.transitive = true;
                return false;
            }
            if (
                !activation.arrived &&
                !activation.transitive &&
                sameOwner(owner, activation.origin)
            )
                return false;
        }
        this.invalidate();
        return true;
    }

    begin() {
        this.observe(this.readOwner());
        if (
            !this.mounted ||
            !this.enabled() ||
            this.pending !== null ||
            this.owner.userId === undefined ||
            this.owner.sessionId === undefined
        )
            return null;
        const turn = ++this.generation;
        this.pending = turn;
        const origin = { ...this.owner };
        const owned = () => {
            this.observe(this.readOwner());
            return this.mounted && this.pending === turn && this.generation === turn;
        };
        const current = () => owned() && this.enabled();
        return {
            current,
            activate: (target: { userId: string; sessionId: string }) => {
                if (
                    !current() ||
                    origin.userId !== null ||
                    origin.sessionId !== null ||
                    !target.userId ||
                    !target.sessionId
                )
                    return false;
                this.activation = {
                    origin,
                    target: { ...target },
                    transitive: false,
                    arrived: false,
                };
                return true;
            },
            finish: () => {
                if (!owned()) return false;
                this.pending = null;
                this.activation = null;
                return true;
            },
        };
    }
}

/** Keep completion, error and finally effects behind the same captured lifetime. */
export async function runInvitationClaim<T>(
    operation: NonNullable<ReturnType<InvitationLifecycle['begin']>>,
    dispatch: () => Promise<T>,
    effects: { success: (value: T) => void; failure: (error: unknown) => void; finish: () => void },
) {
    try {
        if (!operation.current()) return;
        const result = await dispatch();
        if (operation.current()) effects.success(result);
    } catch (error) {
        if (operation.current()) effects.failure(error);
    } finally {
        if (operation.finish()) effects.finish();
    }
}
