/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
// Post-migration stub: the Drizzle client is gone. Any runtime caller that
// reaches `db.query.X` / `db.insert(...)` etc. throws immediately so the
// caller is rewritten to use Convex queries/mutations.
//
// New code MUST NOT import `db` from here.

function throwingProxy(): never {
    throw new Error(
        '[@weblab/db/src/client] Drizzle is removed. Use Convex queries/mutations instead.',
    );
}

export const db = new Proxy(
    {},
    {
        get() {
            return throwingProxy;
        },
    },
) as never;
