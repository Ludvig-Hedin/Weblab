'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@weblab/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@weblab/ui/alert';
import { Avatar, AvatarFallback } from '@weblab/ui/avatar';
import { Badge } from '@weblab/ui/badge';
import { Button } from '@weblab/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@weblab/ui/card';
import { Checkbox } from '@weblab/ui/checkbox';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { Progress } from '@weblab/ui/progress';
import { RadioGroup, RadioGroupItem } from '@weblab/ui/radio-group';
import { Skeleton } from '@weblab/ui/skeleton';
import { Slider } from '@weblab/ui/slider';
import { Switch } from '@weblab/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@weblab/ui/tabs';
import { Textarea } from '@weblab/ui/textarea';
import { Toggle } from '@weblab/ui/toggle';

type ButtonVariant = NonNullable<React.ComponentProps<typeof Button>['variant']>;
type ButtonSize = NonNullable<React.ComponentProps<typeof Button>['size']>;
type BadgeVariant = NonNullable<React.ComponentProps<typeof Badge>['variant']>;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <p className="text-foreground-tertiary text-[10px] font-medium">{label}</p>
            <div className="flex flex-wrap items-center gap-2">{children}</div>
        </div>
    );
}

export function VariantsPreview({ id }: { id: string }) {
    if (id === 'button') {
        const variants: ButtonVariant[] = [
            'default',
            'secondary',
            'outline',
            'ghost',
            'destructive',
            'link',
        ];
        const sizes: ButtonSize[] = ['lg', 'default', 'sm'];
        return (
            <div className="space-y-5">
                <Row label="Variant">
                    {variants.map((v) => (
                        <Button key={v} variant={v}>
                            {v}
                        </Button>
                    ))}
                </Row>
                <Row label="Size">
                    {sizes.map((s) => (
                        <Button key={s} size={s}>
                            {s}
                        </Button>
                    ))}
                    <Button size="icon">
                        <Icons.Plus className="h-4 w-4" />
                    </Button>
                </Row>
                <Row label="State">
                    <Button disabled>Disabled</Button>
                    <Button>
                        <Icons.LoadingSpinner className="h-4 w-4 animate-spin" /> Loading
                    </Button>
                </Row>
            </div>
        );
    }

    if (id === 'badge') {
        const variants: BadgeVariant[] = ['default', 'secondary', 'destructive', 'outline'];
        return (
            <Row label="Variant">
                {variants.map((v) => (
                    <Badge key={v} variant={v}>
                        {v}
                    </Badge>
                ))}
            </Row>
        );
    }

    if (id === 'input') {
        return (
            <div className="space-y-3">
                <Input placeholder="Default" />
                <Input placeholder="Disabled" disabled />
                <Input defaultValue="With value" />
            </div>
        );
    }

    if (id === 'textarea') {
        return (
            <div className="space-y-3">
                <Textarea placeholder="Write something…" rows={3} />
                <Textarea defaultValue="With value" rows={2} />
                <Textarea placeholder="Disabled" disabled rows={2} />
            </div>
        );
    }

    if (id === 'card') {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Card title</CardTitle>
                </CardHeader>
                <CardContent className="text-foreground-secondary text-sm">
                    Body content rendered with current tokens.
                </CardContent>
            </Card>
        );
    }

    if (id === 'checkbox') {
        return (
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <Checkbox id="vp-c1" />
                    <Label htmlFor="vp-c1">Unchecked</Label>
                </div>
                <div className="flex items-center gap-2">
                    <Checkbox id="vp-c2" defaultChecked />
                    <Label htmlFor="vp-c2">Checked</Label>
                </div>
                <div className="flex items-center gap-2">
                    <Checkbox id="vp-c3" disabled defaultChecked />
                    <Label htmlFor="vp-c3" className="opacity-50">
                        Disabled
                    </Label>
                </div>
            </div>
        );
    }

    if (id === 'radio') {
        return (
            <RadioGroup defaultValue="a" className="space-y-2">
                <div className="flex items-center gap-2">
                    <RadioGroupItem id="vp-r1" value="a" />
                    <Label htmlFor="vp-r1">Option A</Label>
                </div>
                <div className="flex items-center gap-2">
                    <RadioGroupItem id="vp-r2" value="b" />
                    <Label htmlFor="vp-r2">Option B</Label>
                </div>
            </RadioGroup>
        );
    }

    if (id === 'switch') {
        return (
            <div className="flex gap-4">
                <Switch defaultChecked />
                <Switch />
                <Switch disabled defaultChecked />
            </div>
        );
    }

    if (id === 'slider') {
        return (
            <div className="space-y-3">
                <Slider defaultValue={[40]} />
                <Slider defaultValue={[20, 80]} />
            </div>
        );
    }

    if (id === 'toggle' || id === 'toggle-group') {
        return (
            <div className="flex gap-2">
                <Toggle>
                    <Icons.TextAlignLeft className="h-4 w-4" />
                </Toggle>
                <Toggle defaultPressed>
                    <Icons.TextAlignCenter className="h-4 w-4" />
                </Toggle>
                <Toggle>
                    <Icons.TextAlignRight className="h-4 w-4" />
                </Toggle>
            </div>
        );
    }

    if (id === 'tabs') {
        return (
            <Tabs defaultValue="a" className="w-full">
                <TabsList>
                    <TabsTrigger value="a">First</TabsTrigger>
                    <TabsTrigger value="b">Second</TabsTrigger>
                    <TabsTrigger value="c">Third</TabsTrigger>
                </TabsList>
                <TabsContent value="a" className="text-foreground-secondary mt-3 text-sm">
                    Tab A content
                </TabsContent>
                <TabsContent value="b" className="text-foreground-secondary mt-3 text-sm">
                    Tab B content
                </TabsContent>
                <TabsContent value="c" className="text-foreground-secondary mt-3 text-sm">
                    Tab C content
                </TabsContent>
            </Tabs>
        );
    }

    if (id === 'accordion') {
        return (
            <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="a">
                    <AccordionTrigger>First</AccordionTrigger>
                    <AccordionContent>First answer.</AccordionContent>
                </AccordionItem>
                <AccordionItem value="b">
                    <AccordionTrigger>Second</AccordionTrigger>
                    <AccordionContent>Second answer.</AccordionContent>
                </AccordionItem>
            </Accordion>
        );
    }

    if (id === 'alert') {
        return (
            <div className="space-y-3">
                <Alert>
                    <Icons.InfoCircled className="h-4 w-4" />
                    <AlertTitle>Default</AlertTitle>
                    <AlertDescription>Informational message.</AlertDescription>
                </Alert>
                <Alert variant="destructive">
                    <Icons.ExclamationTriangle className="h-4 w-4" />
                    <AlertTitle>Destructive</AlertTitle>
                    <AlertDescription>Something went wrong.</AlertDescription>
                </Alert>
            </div>
        );
    }

    if (id === 'progress') {
        return (
            <div className="space-y-3">
                <Progress value={20} />
                <Progress value={50} />
                <Progress value={85} />
            </div>
        );
    }

    if (id === 'skeleton') {
        return (
            <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-20 w-full rounded-xl" />
            </div>
        );
    }

    if (id === 'avatar') {
        return (
            <div className="flex items-end gap-3">
                <Avatar className="h-12 w-12">
                    <AvatarFallback>LH</AvatarFallback>
                </Avatar>
                <Avatar className="h-9 w-9">
                    <AvatarFallback>WB</AvatarFallback>
                </Avatar>
                <Avatar className="h-7 w-7">
                    <AvatarFallback>?</AvatarFallback>
                </Avatar>
            </div>
        );
    }

    return (
        <p className="text-foreground-tertiary text-xs italic">
            Variant preview not configured for this component. Tokens still apply globally.
        </p>
    );
}
