'use client';

import { useState, useTransition } from 'react';

import { BrandLogo } from '@weblab/ui/brand';
import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';

import { verifyDesignPassword } from '../actions';

export function PasswordGate() {
    const [password, setPassword] = useState('');
    const [error, setError] = useState(false);
    const [isPending, startTransition] = useTransition();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(async () => {
            const ok = await verifyDesignPassword(password);
            if (ok) {
                window.location.reload();
            } else {
                setError(true);
                setPassword('');
            }
        });
    };

    return (
        <div className="bg-background flex min-h-screen items-center justify-center px-4">
            <div className="w-full max-w-xs">
                <BrandLogo className="mb-8 h-4" />
                <h1 className="text-foreground mb-1 text-sm font-medium">Design system</h1>
                <p className="text-foreground-tertiary mb-6 text-xs">
                    Enter the password to access this page.
                </p>
                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="ds-password" className="text-xs">
                            Password
                        </Label>
                        <Input
                            id="ds-password"
                            type="password"
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                setError(false);
                            }}
                            placeholder="••••••••"
                            autoFocus
                            className={error ? 'border-destructive' : ''}
                        />
                        {error && <p className="text-destructive text-xs">Incorrect password.</p>}
                    </div>
                    <Button type="submit" disabled={isPending || !password}>
                        {isPending ? 'Verifying…' : 'Unlock'}
                    </Button>
                </form>
            </div>
        </div>
    );
}
