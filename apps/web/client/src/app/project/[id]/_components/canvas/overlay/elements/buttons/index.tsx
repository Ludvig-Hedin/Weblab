import { useEffect, useRef, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';

import { EditorMode } from '@weblab/models';

import { useEditorEngine } from '@/components/store/editor';
import { OverlayChatInput } from './chat';
import { OverlayOpenCode } from './code';
import { OverlayCopyToFigma } from './figma';
import { DEFAULT_INPUT_STATE } from './helpers';

export const OverlayButtons = observer(() => {
    const editorEngine = useEditorEngine();
    const settings = useQuery(api.users.getSettings, {});
    const [inputState, setInputState] = useState(DEFAULT_INPUT_STATE);
    const prevChatPositionRef = useRef<{ x: number; y: number } | null>(null);

    const selectedRect = editorEngine.overlay.state.clickRects[0] ?? null;
    const domId = editorEngine.elements.selected[0]?.domId;

    const isPreviewMode = editorEngine.state.editorMode === EditorMode.PREVIEW;
    const shouldHideButton =
        !selectedRect || isPreviewMode || editorEngine.chat.isStreaming || !settings?.showMiniChat;

    useEffect(() => {
        setInputState(DEFAULT_INPUT_STATE);
    }, [domId]);

    const chatPosition = {
        x: domId ? (document.getElementById(domId)?.getBoundingClientRect().left ?? 0) : 0,
        y: domId ? (document.getElementById(domId)?.getBoundingClientRect().bottom ?? 0) : 0,
    };

    useEffect(() => {
        prevChatPositionRef.current = chatPosition;
    }, [chatPosition.x, chatPosition.y]);

    // Declarative enter animation. The previous version revealed the buttons by
    // imperatively mutating classList in an effect keyed only on [domId] — so
    // after any hide→show cycle with the SAME selection (e.g. chat streaming
    // finishing), React re-created the div in its hidden `opacity-0` state, the
    // effect didn't re-run (domId unchanged), and the buttons stayed invisible
    // yet still clickable (an invisible dead-zone above the element). Driving
    // the reveal off `entered` state fixes both.
    const [entered, setEntered] = useState(false);
    useEffect(() => {
        if (shouldHideButton) {
            setEntered(false);
            return;
        }
        const raf = requestAnimationFrame(() => setEntered(true));
        return () => cancelAnimationFrame(raf);
    }, [shouldHideButton, domId]);

    if (shouldHideButton) {
        return null;
    }

    const animationClass = entered
        ? 'origin-center opacity-100 translate-y-0 transition-all duration-200'
        : 'origin-center opacity-0 -translate-y-2 transition-all duration-200';

    const EDITOR_HEADER_HEIGHT = 86;
    const MARGIN = 8;
    const CHAT_BUTTON_HEIGHT = 42;

    const containerStyle: React.CSSProperties = {
        position: 'fixed',
        top: Math.max(
            EDITOR_HEADER_HEIGHT + MARGIN,
            selectedRect.top - (CHAT_BUTTON_HEIGHT + MARGIN),
        ),
        left: selectedRect.left + selectedRect.width / 2,
        transform: 'translate(-50%, 0)',
        transformOrigin: 'center center',
        pointerEvents: 'auto',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    };

    return (
        <div
            style={containerStyle}
            onClick={(e) => e.stopPropagation()}
            className={animationClass}
            data-element-id={domId}
        >
            <div className="flex flex-row items-center gap-2">
                <OverlayChatInput inputState={inputState} setInputState={setInputState} />
                <OverlayCopyToFigma isInputting={inputState.isInputting} />
                <OverlayOpenCode isInputting={inputState.isInputting} />
            </div>
        </div>
    );
});
