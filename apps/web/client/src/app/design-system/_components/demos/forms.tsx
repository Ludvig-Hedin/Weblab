'use client';

import type { FormEvent } from 'react';
import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@weblab/ui/button';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@weblab/ui/form';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { RadioGroup, RadioGroupItem } from '@weblab/ui/radio-group';
import { Switch } from '@weblab/ui/switch';
import { Textarea } from '@weblab/ui/textarea';

import { Section } from '../section';

const schema = z.object({
    email: z.email({ message: 'Enter a valid email address.' }),
    handle: z
        .string()
        .min(3, { message: 'At least 3 characters.' })
        .max(24, { message: 'At most 24 characters.' }),
    bio: z.string().max(280, { message: 'Bio must be 280 characters or fewer.' }),
    theme: z.enum(['light', 'dark', 'system']),
    notify: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const defaultValues: FormValues = {
    email: 'invalid-email',
    handle: 'ab',
    bio: '',
    theme: 'system',
    notify: true,
};

export function FormsDemo() {
    return (
        <div id="forms">
            <Section
                title="Form scaffold"
                tag="forms"
                inspectId="input"
                filePath="packages/ui/src/components/form.tsx"
            >
                <p className="text-foreground-tertiary mb-4 max-w-prose text-xs">
                    The canonical pattern: <code>Form</code> + <code>FormField</code> +
                    <code className="mx-1">FormControl</code> + <code>FormMessage</code>. Wires
                    react-hook-form into our inputs with <code>aria-invalid</code> and{' '}
                    <code>aria-describedby</code> set automatically. 9 places currently hand-roll{' '}
                    <code>{'<p className="text-red-500">'}</code> error markup — they should migrate
                    to <code>FormMessage</code>.
                </p>
                <ProfileForm />
            </Section>

            <Section title="Inline field" tag="forms" inspectId="input">
                <p className="text-foreground-tertiary mb-4 max-w-prose text-xs">
                    Single-field example. Mirrors profile-setup / auth-form patterns.
                </p>
                <InlineEmailForm />
            </Section>
        </div>
    );
}

function ProfileForm() {
    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues,
        mode: 'onTouched',
    });

    useEffect(() => {
        void form.trigger();
    }, [form]);

    const handle = form.handleSubmit(() => undefined);
    const onSubmit = (event: FormEvent<HTMLFormElement>) => {
        void handle(event);
    };

    return (
        <Form {...form}>
            <form onSubmit={onSubmit} className="grid max-w-xl gap-5">
                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                                <Input
                                    type="email"
                                    placeholder="you@weblab.build"
                                    autoComplete="email"
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                Used for sign-in and product notifications.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="handle"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Handle</FormLabel>
                            <FormControl>
                                <Input placeholder="your-handle" {...field} />
                            </FormControl>
                            <FormDescription>
                                Shown on shared links: weblab.build/&lt;handle&gt;.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="bio"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Bio</FormLabel>
                            <FormControl>
                                <Textarea
                                    placeholder="A short description…"
                                    className="min-h-20"
                                    maxLength={280}
                                    {...field}
                                />
                            </FormControl>
                            <div className="text-foreground-tertiary flex justify-between text-tiny tabular-nums">
                                <FormMessage className="text-tiny" />
                                <span className="ml-auto">{field.value.length} / 280</span>
                            </div>
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="theme"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Theme</FormLabel>
                            <FormControl>
                                <RadioGroup
                                    value={field.value}
                                    onValueChange={field.onChange}
                                    className="flex gap-6"
                                >
                                    {(['light', 'dark', 'system'] as const).map((value) => (
                                        <div key={value} className="flex items-center gap-2">
                                            <RadioGroupItem
                                                value={value}
                                                id={`form-theme-${value}`}
                                            />
                                            <Label
                                                htmlFor={`form-theme-${value}`}
                                                className="capitalize"
                                            >
                                                {value}
                                            </Label>
                                        </div>
                                    ))}
                                </RadioGroup>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="notify"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-2xl border p-4">
                            <div className="grid gap-1">
                                <FormLabel>Product updates</FormLabel>
                                <FormDescription>
                                    Get an email when we ship a feature you can use.
                                </FormDescription>
                            </div>
                            <FormControl>
                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                        </FormItem>
                    )}
                />

                <div className="flex items-center gap-3">
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                        Save changes
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => form.reset(defaultValues)}>
                        Reset
                    </Button>
                </div>
            </form>
        </Form>
    );
}

const inlineSchema = z.object({
    email: z.email({ message: 'Enter a valid email address.' }),
});

type InlineValues = z.infer<typeof inlineSchema>;

function InlineEmailForm() {
    const form = useForm<InlineValues>({
        resolver: zodResolver(inlineSchema),
        defaultValues: { email: '' },
        mode: 'onSubmit',
    });

    const handle = form.handleSubmit(() => undefined);
    const onSubmit = (event: FormEvent<HTMLFormElement>) => {
        void handle(event);
    };

    return (
        <Form {...form}>
            <form
                onSubmit={onSubmit}
                className="flex max-w-md flex-col gap-3 sm:flex-row sm:items-start"
            >
                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem className="grow">
                            <FormControl>
                                <Input
                                    type="email"
                                    placeholder="you@weblab.build"
                                    autoComplete="email"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button type="submit">Subscribe</Button>
            </form>
        </Form>
    );
}
