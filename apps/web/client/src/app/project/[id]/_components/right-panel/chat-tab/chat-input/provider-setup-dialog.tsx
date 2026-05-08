'use client';

import { useState } from 'react';

import type { ProviderManifestEntry, ProviderStatus } from '@weblab/ai';
import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';

const INSTALL_HINTS: Record<string, ReadonlyArray<{ os: string; command: string }>> = {
    codex: [
        { os: 'macOS / Linux', command: 'npm install -g @openai/codex' },
        { os: 'Windows', command: 'winget install OpenAI.Codex' },
    ],
    'claude-code': [
        { os: 'macOS / Linux', command: 'npm install -g @anthropic-ai/claude-code' },
        { os: 'Windows', command: 'npm install -g @anthropic-ai/claude-code' },
    ],
    gemini: [
        { os: 'macOS / Linux', command: 'npm install -g @google/gemini-cli' },
        { os: 'Windows', command: 'npm install -g @google/gemini-cli' },
    ],
    opencode: [{ os: 'macOS / Linux', command: 'curl -fsSL https://opencode.ai/install | bash' }],
    cursor: [{ os: 'macOS / Linux / Windows', command: 'See https://docs.cursor.com/cli' }],
    ollama: [
        { os: 'macOS', command: 'brew install ollama' },
        { os: 'Linux', command: 'curl -fsSL https://ollama.com/install.sh | sh' },
        { os: 'Windows', command: 'See https://ollama.com/download' },
    ],
};

export function ProviderSetupDialog({
    entry,
    status,
    open,
    onOpenChange,
    onRecheck,
}: {
    entry: ProviderManifestEntry;
    status: ProviderStatus;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onRecheck?: () => void;
}) {
    const [copied, setCopied] = useState<string | null>(null);

    const copy = (cmd: string) => {
        void navigator.clipboard.writeText(cmd);
        setCopied(cmd);
        setTimeout(() => setCopied((current) => (current === cmd ? null : current)), 1500);
    };

    const isInstall = status.kind === 'install';
    const isSignIn = status.kind === 'sign-in';
    const hints = INSTALL_HINTS[entry.kind] ?? [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {isInstall ? `Install ${entry.label}` : `Sign in to ${entry.label}`}
                    </DialogTitle>
                    <DialogDescription>
                        {isInstall
                            ? `${entry.label} runs on your machine. Install the CLI, then return here and click Re-check.`
                            : entry.webOAuth
                              ? `Connect your ${entry.label} account so Weblab can use your subscription.`
                              : `${entry.label} is only available in the Weblab desktop app.`}
                    </DialogDescription>
                </DialogHeader>

                {isInstall && (
                    <div className="flex flex-col gap-3">
                        {hints.map((h) => (
                            <div
                                key={h.os}
                                className="border-foreground-primary/15 flex flex-col gap-1 rounded-md border p-3"
                            >
                                <span className="text-foreground-tertiary text-mini">{h.os}</span>
                                <div className="flex items-center justify-between gap-2">
                                    <code className="text-small font-mono">{h.command}</code>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => copy(h.command)}
                                    >
                                        {copied === h.command ? 'Copied' : 'Copy'}
                                    </Button>
                                </div>
                            </div>
                        ))}
                        {entry.authCommand && (
                            <p className="text-foreground-tertiary text-mini">
                                After installing, run{' '}
                                <code className="font-mono">{entry.authCommand}</code> in your
                                terminal to sign in.
                            </p>
                        )}
                    </div>
                )}

                {isSignIn && entry.webOAuth && (
                    <div className="flex flex-col gap-3">
                        <p className="text-foreground-secondary text-small">
                            You'll be redirected to {entry.label} to authorize Weblab. We only store
                            an access token — your password never leaves their site.
                        </p>
                    </div>
                )}

                <DialogFooter className="gap-2">
                    {isInstall && onRecheck && (
                        <Button variant="secondary" onClick={onRecheck}>
                            Re-check
                        </Button>
                    )}
                    {isSignIn && entry.webOAuth && (
                        <Button
                            variant="default"
                            onClick={() => {
                                if (entry.webOAuth?.startPath) {
                                    window.location.assign(entry.webOAuth.startPath);
                                }
                            }}
                        >
                            Sign in with {entry.label}
                        </Button>
                    )}
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
