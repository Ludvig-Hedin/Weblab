import React from 'react';
import { ArrowUp, AtSign, Layout, MessageSquare, Paperclip, Sparkles } from 'lucide-react';

import { fontStack, palette } from '../utils/tokens';

export interface ChatMessage {
    role: 'user' | 'ai';
    text: string;
    /** Frame (composition-local) at which the message is fully typed. */
    typedThroughFrame: number;
    /** Frame at which the message starts revealing. */
    startFrame: number;
}

export interface RightPanelChatMockProps {
    messages: ChatMessage[];
    currentFrame: number;
    /** Show the bottom typing indicator until this frame. */
    aiTypingUntilFrame?: number;
    /** Composer placeholder text. */
    placeholder?: string;
    /** Pre-filled composer text (visible characters scale with composerProgress). */
    composerText?: string;
    /** 0..1 typing progress for `composerText`. */
    composerProgress?: number;
    /**
     * Frame at which the composer's text is "sent" — the input clears,
     * a new bubble appears in the messages list with a fade+slide-up
     * animation, and the AI response can start streaming below.
     */
    onSendFrame?: number;
    /**
     * When true, the composer's send button is rendered in the active
     * (filled blue) state. Defaults to true when there's a non-empty
     * composer or messages, false otherwise — but callers can force it.
     */
    sendActive?: boolean;
    /**
     * Optional small badge above composer (e.g. "Reference attached").
     * Visible from the given frame onward.
     */
    composerBadge?: { text: string; from: number };
}

// lucide MessageSquare stands in for the @weblab/ui ChatBubble icon (not
// available in this Remotion workspace).
type IconCmp = typeof Layout;
const ChatBubbleIcon: IconCmp = MessageSquare;

const charsForMessage = (m: ChatMessage, frame: number): string => {
    if (frame <= m.startFrame) return '';
    if (frame >= m.typedThroughFrame) return m.text;
    const span = m.typedThroughFrame - m.startFrame;
    const t = (frame - m.startFrame) / Math.max(1, span);
    const visibleChars = Math.floor(m.text.length * t);
    return m.text.slice(0, visibleChars);
};

const TabPill: React.FC<{
    label: string;
    Icon: IconCmp;
    active?: boolean;
    accent?: boolean;
}> = ({ label, Icon, active, accent }) => (
    <div
        style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            height: 28,
            padding: '0 12px',
            fontSize: 11.5,
            fontFamily: fontStack,
            color: active ? palette.textPrimary : palette.textMuted,
            background: 'transparent',
            borderBottom: active
                ? `2px solid ${accent ? palette.blue : palette.textPrimary}`
                : '2px solid transparent',
            fontWeight: active ? 500 : 400,
            letterSpacing: 0.05,
        }}
    >
        <Icon size={12} strokeWidth={1.7} />
        {label}
    </div>
);

const UserBubble: React.FC<{ children: React.ReactNode; opacity?: number; lift?: number }> = ({
    children,
    opacity = 1,
    lift = 0,
}) => (
    <div
        style={{
            display: 'flex',
            justifyContent: 'flex-end',
            paddingLeft: 8,
            paddingRight: 0,
            opacity,
            transform: `translateY(${lift}px)`,
        }}
    >
        <div
            style={{
                maxWidth: '90%',
                background: palette.surface,
                color: palette.textPrimary,
                border: `1px solid ${palette.borderSubtle}`,
                padding: '8px 12px',
                borderRadius: 10,
                fontSize: 13,
                lineHeight: 1.45,
                fontFamily: fontStack,
                boxShadow: '0 1px 0 rgba(0,0,0,0.35)',
            }}
        >
            {children}
        </div>
    </div>
);

const AssistantPlain: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div
        style={{
            color: palette.textPrimary,
            fontSize: 13,
            lineHeight: 1.6,
            fontFamily: fontStack,
            padding: '4px 12px',
            paddingRight: 14,
        }}
    >
        {children}
    </div>
);

const TypingDots: React.FC<{ frame: number }> = ({ frame }) => {
    const phase = (n: number) => {
        const off = (frame + n * 4) % 24;
        return off < 12 ? 1 : 0.25;
    };
    return (
        <div style={{ display: 'inline-flex', gap: 4, padding: '4px 0' }}>
            {[0, 1, 2].map((i) => (
                <div
                    key={i}
                    style={{
                        width: 5,
                        height: 5,
                        borderRadius: 999,
                        background: palette.textMuted,
                        opacity: phase(i),
                    }}
                />
            ))}
        </div>
    );
};

const Caret: React.FC<{ frame: number; height?: number }> = ({ frame, height = 13 }) => (
    <span
        style={{
            display: 'inline-block',
            width: 1.5,
            height,
            background: palette.textPrimary,
            marginLeft: 2,
            verticalAlign: 'middle',
            opacity: Math.floor(frame / 12) % 2 === 0 ? 1 : 0,
        }}
    />
);

export const RightPanelChatMock: React.FC<RightPanelChatMockProps> = ({
    messages,
    currentFrame,
    aiTypingUntilFrame,
    placeholder = 'Ask, refine, redesign...',
    composerText,
    composerProgress = 1,
    onSendFrame,
    sendActive,
    composerBadge,
}) => {
    // Composer "send" semantics: BEFORE onSendFrame, composerText shows in
    // the input field. AT onSendFrame, the text disappears from the input
    // and a new user bubble appears in the messages list with a 12-frame
    // fade+slide-up animation.
    const sent = onSendFrame !== undefined && currentFrame >= onSendFrame;

    const composerVisible =
        !sent && composerText !== undefined
            ? composerText.slice(
                  0,
                  Math.floor(composerText.length * Math.max(0, Math.min(1, composerProgress))),
              )
            : '';
    const hasComposerText = composerVisible.length > 0;
    const sendEnabled = sendActive ?? hasComposerText;

    // The "sent" bubble — renders in the messages list once onSendFrame
    // has passed, with a 12-frame fade-in / slide-up.
    const sentBubble: ChatMessage | null =
        sent && composerText !== undefined
            ? {
                  role: 'user',
                  text: composerText,
                  startFrame: onSendFrame ?? 0,
                  typedThroughFrame: onSendFrame ?? 0,
              }
            : null;
    const sentSpan = 12;
    const sentLocal = sent ? Math.max(0, currentFrame - (onSendFrame ?? 0)) : 0;
    const sentT = Math.min(1, sentLocal / sentSpan);
    const sentLift = (1 - sentT) * 8;
    const sentOpacity = sentT;

    const lastMsg = messages.at(-1);
    const lastUserShown = sentBubble ? (onSendFrame ?? 0) : (lastMsg?.typedThroughFrame ?? 0);
    const showTyping =
        aiTypingUntilFrame !== undefined &&
        currentFrame < aiTypingUntilFrame &&
        currentFrame > lastUserShown;

    const showBadge = composerBadge !== undefined && currentFrame >= composerBadge.from && !sent;

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                background: palette.surface,
                display: 'flex',
                flexDirection: 'column',
                fontFamily: fontStack,
            }}
        >
            {/* Top tab strip — Chat | Comments | Style. Chat active with subtle blue underline. */}
            <div
                style={{
                    height: 44,
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: `1px solid ${palette.borderSubtle}`,
                    paddingLeft: 8,
                    paddingRight: 8,
                    flexShrink: 0,
                    gap: 4,
                }}
            >
                <TabPill label="Chat" Icon={Sparkles} active accent />
                <TabPill label="Comments" Icon={ChatBubbleIcon} />
                <TabPill label="Style" Icon={Layout} />
            </div>

            {/* Conversation */}
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    overflow: 'hidden',
                    padding: '14px 0',
                }}
            >
                {messages.map((m, idx) => {
                    if (currentFrame < m.startFrame) return null;
                    const visible = charsForMessage(m, currentFrame);
                    const isStreaming =
                        currentFrame < m.typedThroughFrame && currentFrame > m.startFrame;
                    if (m.role === 'user') {
                        return (
                            <UserBubble key={idx}>
                                {visible}
                                {isStreaming && <Caret frame={currentFrame} />}
                            </UserBubble>
                        );
                    }
                    return (
                        <AssistantPlain key={idx}>
                            {visible}
                            {isStreaming && <Caret frame={currentFrame} />}
                        </AssistantPlain>
                    );
                })}
                {sentBubble && (
                    <UserBubble opacity={sentOpacity} lift={sentLift}>
                        {sentBubble.text}
                    </UserBubble>
                )}
                {showTyping && (
                    <AssistantPlain>
                        <TypingDots frame={currentFrame} />
                    </AssistantPlain>
                )}
            </div>

            {/* Composer */}
            <div style={{ padding: 12, flexShrink: 0 }}>
                {showBadge && (
                    <div
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 9px',
                            borderRadius: 999,
                            background: 'rgba(0,129,222,0.14)',
                            border: '1px solid rgba(0,129,222,0.4)',
                            color: palette.blueSoft,
                            fontSize: 10.5,
                            fontWeight: 500,
                            marginBottom: 8,
                            letterSpacing: 0.1,
                        }}
                    >
                        <Paperclip size={10} strokeWidth={1.8} />
                        {composerBadge?.text}
                    </div>
                )}
                <div
                    style={{
                        border: `1px solid ${palette.borderSubtle}`,
                        borderRadius: 12,
                        background: palette.surface,
                        padding: '10px 12px',
                        minHeight: 52,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                    }}
                >
                    <div
                        style={{
                            color: hasComposerText ? palette.textPrimary : palette.textMuted,
                            fontSize: 13,
                            minHeight: 18,
                            lineHeight: 1.4,
                            fontFamily: fontStack,
                        }}
                    >
                        {hasComposerText ? (
                            <>
                                {composerVisible}
                                {composerProgress < 1 && <Caret frame={currentFrame} />}
                            </>
                        ) : (
                            placeholder
                        )}
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            color: palette.textMuted,
                        }}
                    >
                        <Paperclip size={14} strokeWidth={1.7} />
                        <AtSign size={14} strokeWidth={1.7} />
                        <div style={{ flex: 1 }} />
                        <div
                            style={{
                                width: 28,
                                height: 28,
                                borderRadius: 999,
                                background: sendEnabled ? palette.blue : palette.surfaceActive,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: sendEnabled ? '#fff' : palette.textDisabled,
                            }}
                        >
                            <ArrowUp size={14} strokeWidth={2.4} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
