// apps/web/client/src/components/ai-prompt-composer/types.ts
import type React from 'react';

export interface MentionItem {
    id: string;
    label: string;
    path: string;
    isDirectory: boolean;
}

export interface MentionConfig {
    searchFiles: (query: string) => Promise<MentionItem[]>;
    onMentionSelect: (item: MentionItem) => void;
}

export interface SlashCommand {
    name: string;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    action: () => void;
    keywords?: string[];
}
