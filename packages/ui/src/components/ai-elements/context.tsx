'use client';

import type { LanguageModelUsage } from 'ai';
import type { ComponentProps } from 'react';
import { createContext, useContext } from 'react';
import { estimateCost } from 'tokenlens';

import { Button } from '../../components/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../../components/hover-card';
import { Progress } from '../../components/progress';
import { cn } from '../../utils';

const PERCENT_MAX = 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const pct = (used: number, max: number) => (max > 0 ? clamp01(used / max) : 0);
const ICON_RADIUS = 10;
const ICON_VIEWBOX = 24;
const ICON_CENTER = 12;
const ICON_STROKE_WIDTH = 2;

type ContextSchema = {
    usedTokens: number;
    maxTokens: number;
    usage?: LanguageModelUsage;
    modelId?: string;
};

const ContextContext = createContext<ContextSchema | null>(null);

const useContextValue = () => {
    const context = useContext(ContextContext);

    if (!context) {
        throw new Error('Context components must be used within Context');
    }

    return context;
};

export type ContextProps = ComponentProps<typeof HoverCard> & ContextSchema;

export const Context = ({ usedTokens, maxTokens, usage, modelId, ...props }: ContextProps) => (
    <ContextContext.Provider
        value={{
            usedTokens,
            maxTokens,
            usage,
            modelId,
        }}
        data-oid="c007a4ed5e"
    >
        <HoverCard closeDelay={0} openDelay={0} {...props} data-oid="91a232ff34" />
    </ContextContext.Provider>
);

const ContextIcon = () => {
    const { usedTokens, maxTokens } = useContextValue();
    const circumference = 2 * Math.PI * ICON_RADIUS;
    const usedPercent = pct(usedTokens, maxTokens);
    const dashOffset = circumference * (1 - usedPercent);

    return (
        <svg
            aria-label="Model context usage"
            height="20"
            role="img"
            style={{ color: 'currentcolor' }}
            viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
            width="20"
            data-oid="9f4b8c2b88"
        >
            <circle
                cx={ICON_CENTER}
                cy={ICON_CENTER}
                fill="none"
                opacity="0.25"
                r={ICON_RADIUS}
                stroke="currentColor"
                strokeWidth={ICON_STROKE_WIDTH}
                data-oid="63bce590ba"
            />

            <circle
                cx={ICON_CENTER}
                cy={ICON_CENTER}
                fill="none"
                opacity="0.7"
                r={ICON_RADIUS}
                stroke="currentColor"
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                strokeWidth={ICON_STROKE_WIDTH}
                style={{ transformOrigin: 'center', transform: 'rotate(-90deg)' }}
                data-oid="6170e5e326"
            />
        </svg>
    );
};

export type ContextTriggerProps = ComponentProps<typeof Button>;

export const ContextTrigger = ({ children, className, ...props }: ContextTriggerProps) => {
    const { usedTokens, maxTokens } = useContextValue();
    const usedPercent = pct(usedTokens, maxTokens);
    const renderedPercent = new Intl.NumberFormat('en-US', {
        style: 'percent',
        maximumFractionDigits: 0,
    }).format(usedPercent);

    return (
        <HoverCardTrigger asChild data-oid="3bac57f0d9">
            {children ?? (
                <Button
                    type="button"
                    variant="ghost"
                    className={cn('group', className)}
                    {...props}
                    data-oid="d91ff3d708"
                >
                    <ContextIcon data-oid="438ddb24c0" />
                    {/* Percentage is hidden by default and revealed on hover — the
                        ring icon alone communicates usage at rest; `hidden` keeps
                        it out of the flex flow so no empty gap is reserved. */}
                    <span
                        className="text-muted-foreground hidden text-xs font-medium group-hover:inline-block group-focus-within:inline-block"
                        data-oid="d85b511f5a"
                    >
                        {renderedPercent}
                    </span>
                </Button>
            )}
        </HoverCardTrigger>
    );
};

export type ContextContentProps = ComponentProps<typeof HoverCardContent>;

export const ContextContent = ({ className, ...props }: ContextContentProps) => (
    <HoverCardContent
        className={cn('min-w-[240px] divide-y overflow-hidden p-0', className)}
        {...props}
        data-oid="3ea82526be"
    />
);

export type ContextContentHeader = ComponentProps<'div'>;

export const ContextContentHeader = ({ children, className, ...props }: ContextContentHeader) => {
    const { usedTokens, maxTokens } = useContextValue();
    const usedPercent = pct(usedTokens, maxTokens);
    const displayPct = new Intl.NumberFormat('en-US', {
        style: 'percent',
        maximumFractionDigits: 1,
    }).format(usedPercent);
    const used = new Intl.NumberFormat('en-US', {
        notation: 'compact',
    }).format(usedTokens);
    const total = new Intl.NumberFormat('en-US', {
        notation: 'compact',
    }).format(maxTokens);

    return (
        <div className={cn('w-full space-y-2 p-3', className)} {...props} data-oid="21a748af5f">
            {children ?? (
                <>
                    <div
                        className="flex items-center justify-between gap-3 text-xs"
                        data-oid="6078214c76"
                    >
                        <p data-oid="62788d78bf">{displayPct}</p>
                        <p className="text-muted-foreground font-mono" data-oid="7a19df4ef8">
                            {used} / {total}
                        </p>
                    </div>
                    <div className="space-y-2" data-oid="5b726c182b">
                        <Progress
                            className="bg-muted"
                            value={Math.round(usedPercent * PERCENT_MAX)}
                            data-oid="3c852e12d6"
                        />
                    </div>
                </>
            )}
        </div>
    );
};

export type ContextContentBody = ComponentProps<'div'>;

export const ContextContentBody = ({ children, className, ...props }: ContextContentBody) => (
    <div className={cn('w-full p-3', className)} {...props} data-oid="48576f387c">
        {children}
    </div>
);

export type ContextContentFooter = ComponentProps<'div'>;

export const ContextContentFooter = ({ children, className, ...props }: ContextContentFooter) => {
    const { modelId, usage } = useContextValue();
    const costUSD = modelId
        ? estimateCost({
              modelId,
              usage: {
                  input: usage?.inputTokens ?? 0,
                  output: usage?.outputTokens ?? 0,
              },
          }).totalUSD
        : undefined;
    const totalCost = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(costUSD ?? 0);

    return (
        <div
            className={cn(
                'bg-secondary flex w-full items-center justify-between gap-3 p-3 text-xs',
                className,
            )}
            {...props}
            data-oid="cd82ef66bc"
        >
            {children ?? (
                <>
                    <span className="text-muted-foreground" data-oid="8cfb3df7e6">
                        Total cost
                    </span>
                    <span data-oid="b7d1661ba4">{totalCost}</span>
                </>
            )}
        </div>
    );
};

export type ContextInputUsageProps = ComponentProps<'div'>;

export const ContextInputUsage = ({ className, children, ...props }: ContextInputUsageProps) => {
    const { usage, modelId } = useContextValue();
    const inputTokens = usage?.inputTokens ?? 0;

    if (children) {
        return children;
    }

    if (!inputTokens) {
        return null;
    }

    const inputCost = modelId
        ? estimateCost({
              modelId,
              usage: { input: inputTokens, output: 0 },
          }).totalUSD
        : undefined;
    const inputCostText = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(inputCost ?? 0);

    return (
        <div
            className={cn('flex items-center justify-between text-xs', className)}
            {...props}
            data-oid="97f2f5617e"
        >
            <span className="text-muted-foreground" data-oid="e5b2b62113">
                Input
            </span>
            <TokensWithCost costText={inputCostText} tokens={inputTokens} data-oid="dbfe5b9130" />
        </div>
    );
};

export type ContextOutputUsageProps = ComponentProps<'div'>;

export const ContextOutputUsage = ({ className, children, ...props }: ContextOutputUsageProps) => {
    const { usage, modelId } = useContextValue();
    const outputTokens = usage?.outputTokens ?? 0;

    if (children) {
        return children;
    }

    if (!outputTokens) {
        return null;
    }

    const outputCost = modelId
        ? estimateCost({
              modelId,
              usage: { input: 0, output: outputTokens },
          }).totalUSD
        : undefined;
    const outputCostText = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(outputCost ?? 0);

    return (
        <div
            className={cn('flex items-center justify-between text-xs', className)}
            {...props}
            data-oid="277ccf9758"
        >
            <span className="text-muted-foreground" data-oid="a81a264ef7">
                Output
            </span>
            <TokensWithCost costText={outputCostText} tokens={outputTokens} data-oid="a5a62ee434" />
        </div>
    );
};

export type ContextReasoningUsageProps = ComponentProps<'div'>;

export const ContextReasoningUsage = ({
    className,
    children,
    ...props
}: ContextReasoningUsageProps) => {
    const { usage, modelId } = useContextValue();
    const reasoningTokens = usage?.reasoningTokens ?? 0;

    if (children) {
        return children;
    }

    if (!reasoningTokens) {
        return null;
    }

    const reasoningCost = modelId
        ? estimateCost({
              modelId,
              usage: { reasoningTokens },
          }).totalUSD
        : undefined;
    const reasoningCostText = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(reasoningCost ?? 0);

    return (
        <div
            className={cn('flex items-center justify-between text-xs', className)}
            {...props}
            data-oid="a5edc379a6"
        >
            <span className="text-muted-foreground" data-oid="746c58d52a">
                Reasoning
            </span>
            <TokensWithCost
                costText={reasoningCostText}
                tokens={reasoningTokens}
                data-oid="6c1ecceb8d"
            />
        </div>
    );
};

export type ContextCacheUsageProps = ComponentProps<'div'>;

export const ContextCacheUsage = ({ className, children, ...props }: ContextCacheUsageProps) => {
    const { usage, modelId } = useContextValue();
    const cacheTokens = usage?.cachedInputTokens ?? 0;

    if (children) {
        return children;
    }

    if (!cacheTokens) {
        return null;
    }

    const cacheCost = modelId
        ? estimateCost({
              modelId,
              usage: { cacheReads: cacheTokens, input: 0, output: 0 },
          }).totalUSD
        : undefined;
    const cacheCostText = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(cacheCost ?? 0);

    return (
        <div
            className={cn('flex items-center justify-between text-xs', className)}
            {...props}
            data-oid="08203b7053"
        >
            <span className="text-muted-foreground" data-oid="71b205de69">
                Cache
            </span>
            <TokensWithCost costText={cacheCostText} tokens={cacheTokens} data-oid="130cc40f31" />
        </div>
    );
};

const TokensWithCost = ({
    tokens,
    costText,
    showCost = false,
}: {
    tokens?: number;
    costText?: string;
    showCost?: boolean;
}) => {
    return (
        <span data-oid="9c358ff8c7">
            {tokens === undefined
                ? '—'
                : new Intl.NumberFormat('en-US', {
                      notation: 'compact',
                  }).format(tokens)}
            {showCost && costText ? (
                <span className="text-muted-foreground ml-2" data-oid="d59c386137">
                    • {costText}
                </span>
            ) : null}
        </span>
    );
};
