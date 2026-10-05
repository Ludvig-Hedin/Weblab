export type DesktopAuthProtocol = 'weblab' | 'weblab-beta';

/** Only the trusted deployment chooses a native handler, never request parameters. */
export function desktopAuthProtocol(value: string): DesktopAuthProtocol {
    if (value !== 'weblab' && value !== 'weblab-beta') throw new Error('Invalid desktop authentication protocol.');
    return value;
}

export function desktopHandoffUrl({ protocol, ticket, state }: {
    protocol: DesktopAuthProtocol;
    ticket: string;
    state: string;
}): string {
    const scheme = desktopAuthProtocol(protocol);
    if (typeof ticket !== 'string' || !ticket || ticket.length > 16_384 ||
        typeof state !== 'string' || !/^[a-f0-9]{64}$/.test(state)) {
        throw new Error('Invalid desktop authentication handoff.');
    }
    return `${scheme}://auth/handoff?ticket=${encodeURIComponent(ticket)}&state=${encodeURIComponent(state)}`;
}
