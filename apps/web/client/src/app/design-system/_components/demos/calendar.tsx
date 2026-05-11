'use client';

import { useState } from 'react';

import { Calendar } from '@weblab/ui/calendar';

import { Section } from '../section';

export function CalendarDemo() {
    const [date, setDate] = useState<Date | undefined>(new Date());

    return (
        <Section
            title="Calendar"
            tag="data"
            inspectId="calendar"
            filePath="packages/ui/src/components/calendar.tsx"
            id="calendar"
        >
            <div className="flex flex-wrap gap-6">
                <div className="space-y-2">
                    <p className="text-foreground-tertiary text-xs">Single date</p>
                    <Calendar
                        mode="single"
                        selected={date}
                        onSelect={setDate}
                        className="border-border rounded-md border"
                    />
                </div>
                <div className="space-y-2">
                    <p className="text-foreground-tertiary text-xs">With disabled past days</p>
                    <Calendar
                        mode="single"
                        selected={date}
                        onSelect={setDate}
                        disabled={{ before: new Date() }}
                        className="border-border rounded-md border"
                    />
                </div>
            </div>
        </Section>
    );
}
