import type { MessageContext } from '@weblab/models';
import { MessageContextType } from '@weblab/models';

import type { ContextClass } from './models';
import {
    AgentRuleContext,
    BranchContext,
    ErrorContext,
    FileContext,
    HighlightContext,
    ImageContext,
} from './classes';

const CONTEXT_CLASSES_MAP = new Map<string, ContextClass>(
    Object.entries({
        [MessageContextType.FILE]: FileContext,
        [MessageContextType.HIGHLIGHT]: HighlightContext,
        [MessageContextType.ERROR]: ErrorContext,
        [MessageContextType.BRANCH]: BranchContext,
        [MessageContextType.IMAGE]: ImageContext,
        [MessageContextType.AGENT_RULE]: AgentRuleContext,
    }),
);

export function getContextClass(type: MessageContextType) {
    return CONTEXT_CLASSES_MAP.get(type);
}

// Utility functions for cases where type is determined at runtime
export function getContextPrompt(context: MessageContext): string {
    try {
        const contextClass = getContextClass(context.type);
        if (!contextClass) {
            throw new Error(`No context class found for type: ${context.type}`);
        }
        return contextClass.getPrompt(context);
    } catch (error) {
        console.error('Error getting context prompt:', error);
        return 'unknown context';
    }
}

export function getContextLabel(context: MessageContext): string {
    try {
        const contextClass = getContextClass(context.type);
        if (!contextClass) {
            throw new Error(`No context class found for type: ${context.type}`);
        }
        return contextClass.getLabel(context);
    } catch (error) {
        console.error('Error getting context label:', error);
        return 'unknown context';
    }
}
