'use client';

import type { IframeHTMLAttributes } from 'react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { connect, WindowMessenger } from 'penpal';

import type { Frame } from '@weblab/models';
import type {
    PenpalChildMethods,
    PenpalParentMethods,
    PromisifiedPendpalChildMethods,
} from '@weblab/penpal';
import { PENPAL_PARENT_CHANNEL } from '@weblab/penpal';
import { WebPreview, WebPreviewBody } from '@weblab/ui/ai-elements';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';

export type IFrameView = HTMLIFrameElement & {
    isPenpalReady: () => boolean;
    setZoomLevel: (level: number) => void;
    supportsOpenDevTools: () => boolean;
    reload: () => void;
    isLoading: () => boolean;
} & PromisifiedPendpalChildMethods;

// Creates a proxy that provides safe fallback methods for any property access
const createSafeFallbackMethods = (): PromisifiedPendpalChildMethods => {
    return new Proxy({} as PromisifiedPendpalChildMethods, {
        get(_target, prop: string | symbol) {
            if (typeof prop === 'symbol') return undefined;

            return async (..._args: any[]) => {
                const method = String(prop);
                if (
                    method.startsWith('get') ||
                    method.includes('capture') ||
                    method.includes('build')
                ) {
                    return null;
                }
                if (method.includes('Count')) {
                    return 0;
                }
                if (method.includes('Editable') || method.includes('supports')) {
                    return false;
                }
                return undefined;
            };
        },
    });
};

const canReadIframeDocument = (iframe: HTMLIFrameElement): boolean => {
    try {
        void iframe.contentDocument;
        return true;
    } catch {
        return false;
    }
};

interface FrameViewProps extends IframeHTMLAttributes<HTMLIFrameElement> {
    frame: Frame;
    reloadIframe: () => void;
    onConnectionFailed: () => void;
    onConnectionSuccess: () => void;
    penpalTimeoutMs?: number;
    isInDragSelection?: boolean;
    /**
     * Number of penpal handshakes that have already failed for this
     * frame. Used to gate console logging: the first cold-boot timeout
     * is expected (sandbox dev server is still starting) and should
     * not log as an error. Once we've definitively failed multiple
     * times, the same error is worth surfacing for debugging.
     */
    connectionFailureCount?: number;
}

const PENPAL_LOG_FAILURE_THRESHOLD = 2;

export const FrameComponent = observer(
    forwardRef<IFrameView, FrameViewProps>(
        (
            {
                frame,
                reloadIframe,
                onConnectionFailed,
                onConnectionSuccess,
                penpalTimeoutMs = 5000,
                isInDragSelection = false,
                connectionFailureCount = 0,
                ...restProps
            },
            ref,
        ) => {
            const { popover, ...props } = restProps;
            const editorEngine = useEditorEngine();
            const iframeRef = useRef<HTMLIFrameElement>(null);
            const zoomLevel = useRef(1);
            const isConnecting = useRef(false);
            const connectionRef = useRef<ReturnType<typeof connect> | null>(null);
            const [penpalChild, setPenpalChild] = useState<PromisifiedPendpalChildMethods | null>(null);
            const isSelected = editorEngine.frames.isSelected(frame.id);
            const isActiveBranch = editorEngine.branches.activeBranch.id === frame.branchId;

            const setupPenpalConnection = () => {
                try {
                    if (!iframeRef.current?.contentWindow) {
                        console.error(`${PENPAL_PARENT_CHANNEL} (${frame.id}) - No iframe found`);
                        onConnectionFailed();
                        return;
                    }

                    if (!frame.url) {
                        console.error(
                            `${PENPAL_PARENT_CHANNEL} (${frame.id}) - No frame URL provided`,
                        );
                        onConnectionFailed();
                        return;
                    }

                    const iframeDoc = canReadIframeDocument(iframeRef.current)
                        ? iframeRef.current.contentDocument
                        : null;
                    if (
                        iframeDoc?.readyState === 'complete' &&
                        iframeDoc.body?.innerText?.includes('404')
                    ) {
                        console.error(
                            `${PENPAL_PARENT_CHANNEL} (${frame.id}) - Frame URL returned 404`,
                        );
                        onConnectionFailed();
                        return;
                    }

                    if (isConnecting.current) {
                        console.log(
                            `${PENPAL_PARENT_CHANNEL} (${frame.id}) - Connection already in progress`,
                        );
                        return;
                    }
                    isConnecting.current = true;

                    // Destroy any existing connection
                    if (connectionRef.current) {
                        connectionRef.current.destroy();
                        connectionRef.current = null;
                    }

                    // SECURITY: only accept postMessage traffic from the iframe's
                    // own origin. With `'*'` any window holding a reference to
                    // this one (e.g. a popup we opened) could complete the
                    // Penpal handshake and pollute MobX layer-tree state.
                    let allowedOrigin: string | undefined;
                    try {
                        allowedOrigin = new URL(frame.url).origin;
                    } catch {
                        // Malformed frame URL — bail out before attaching a messenger
                        // that would otherwise default to a permissive policy.
                        console.error(
                            `${PENPAL_PARENT_CHANNEL} (${frame.id}) - Invalid frame URL: ${frame.url}`,
                        );
                        onConnectionFailed();
                        return;
                    }
                    const messenger = new WindowMessenger({
                        remoteWindow: iframeRef.current.contentWindow,
                        allowedOrigins: [allowedOrigin],
                    });

                    const connection = connect({
                        messenger,
                        methods: {
                            getFrameId: () => frame.id,
                            getBranchId: () => frame.branchId,
                            onWindowMutated: () => {
                                editorEngine.frameEvent.handleWindowMutated();
                            },
                            onWindowResized: () => {
                                editorEngine.frameEvent.handleWindowResized();
                            },
                            onDomProcessed: (data: {
                                layerMap: Record<string, any>;
                                rootNode: any;
                            }) => {
                                editorEngine.frameEvent.handleDomProcessed(frame.id, data);
                            },
                            onContentResized: ({ height }: { width: number; height: number }) => {
                                editorEngine.frames.setContentHeight(frame.id, height);
                            },
                        } satisfies PenpalParentMethods,
                    });

                    connectionRef.current = connection;

                    // Create a timeout promise that rejects after specified timeout
                    let timeoutId: ReturnType<typeof setTimeout> | null = null;
                    const timeoutPromise = new Promise<never>((_, reject) => {
                        timeoutId = setTimeout(() => {
                            reject(
                                new Error(`Penpal connection timeout after ${penpalTimeoutMs}ms`),
                            );
                        }, penpalTimeoutMs);
                    });

                    // Race the connection promise against the timeout
                    Promise.race([connection.promise, timeoutPromise])
                        .then((child) => {
                            if (timeoutId) {
                                clearTimeout(timeoutId);
                            }
                            isConnecting.current = false;
                            if (!child) {
                                console.error(
                                    `${PENPAL_PARENT_CHANNEL} (${frame.id}) - Connection failed: child is null`,
                                );
                                onConnectionFailed();
                                return;
                            }

                            // Drop the noisy success log — it fires every
                            // time a frame loads and adds nothing for
                            // debugging. Failures still log below.
                            const remote = child as unknown as PenpalChildMethods;
                            const promised = remote as unknown as PromisifiedPendpalChildMethods;
                            setPenpalChild(promised);
                            // Mark the connection successful up-front so the
                            // "trouble connecting" UI hides; below we still
                            // inspect the post-connect calls and retry
                            // `processDom` on rejection — without that retry
                            // the layer tree is empty and selection silently
                            // dies on first paint (HMR mid-handshake is the
                            // common trigger).
                            onConnectionSuccess();
                            void Promise.allSettled([
                                promised.setFrameId(frame.id),
                                promised.setBranchId(frame.branchId),
                                promised.handleBodyReady(),
                                promised.processDom(),
                            ]).then((results) => {
                                const processDomResult = results[3];
                                if (
                                    processDomResult &&
                                    processDomResult.status === 'rejected' &&
                                    connectionRef.current === connection
                                ) {
                                    console.warn(
                                        `${PENPAL_PARENT_CHANNEL} (${frame.id}) - processDom() rejected on first connect, retrying`,
                                        processDomResult.reason,
                                    );
                                    requestAnimationFrame(() => {
                                        if (connectionRef.current !== connection) return;
                                        // Penpal-promisified methods are not
                                        // typed as Promise on the raw
                                        // PenpalChildMethods interface, so
                                        // wrap with Promise.resolve to attach
                                        // a catch handler safely.
                                        Promise.resolve(promised.processDom()).catch(
                                            (err: unknown) => {
                                                console.warn(
                                                    `${PENPAL_PARENT_CHANNEL} (${frame.id}) - processDom() retry failed`,
                                                    err,
                                                );
                                            },
                                        );
                                    });
                                }
                            });
                        })
                        .catch((error) => {
                            if (timeoutId) {
                                clearTimeout(timeoutId);
                            }
                            isConnecting.current = false;
                            connection.destroy();
                            if (connectionRef.current === connection) {
                                connectionRef.current = null;
                            }
                            // First-attempt timeouts are expected during
                            // sandbox cold-boot — the dev server inside
                            // the container takes 10–15s to start, and
                            // the retry loop in useFrameReload already
                            // handles them. Only surface the error after
                            // we've definitively failed enough times for
                            // it to be useful debugging signal.
                            if (connectionFailureCount >= PENPAL_LOG_FAILURE_THRESHOLD) {
                                console.warn(
                                    `${PENPAL_PARENT_CHANNEL} (${frame.id}) - Failed to setup penpal connection:`,
                                    error,
                                );
                            }
                            onConnectionFailed();
                        });
                } catch (error) {
                    isConnecting.current = false;
                    console.error(`${PENPAL_PARENT_CHANNEL} (${frame.id}) - Setup failed:`, error);
                    onConnectionFailed();
                }
            };

            const promisifyMethod = <T extends (...args: any[]) => any>(
                method: T | undefined,
            ): ((...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>) => {
                return async (...args: Parameters<T>) => {
                    try {
                        if (!method) throw new Error('Method not initialized');
                        return method(...args);
                    } catch (error) {
                        console.error(
                            `${PENPAL_PARENT_CHANNEL} (${frame.id}) - Method failed:`,
                            error,
                        );
                    }
                };
            };

            const remoteMethods = useMemo((): PromisifiedPendpalChildMethods => {
                if (!penpalChild) {
                    return createSafeFallbackMethods();
                }

                return {
                    processDom: promisifyMethod(penpalChild?.processDom),
                    getElementAtLoc: promisifyMethod(penpalChild?.getElementAtLoc),
                    getElementByDomId: promisifyMethod(penpalChild?.getElementByDomId),
                    getElementByOid: promisifyMethod(penpalChild?.getElementByOid),
                    setFrameId: promisifyMethod(penpalChild?.setFrameId),
                    setBranchId: promisifyMethod(penpalChild?.setBranchId),
                    getElementIndex: promisifyMethod(penpalChild?.getElementIndex),
                    getComputedStyleByDomId: promisifyMethod(penpalChild?.getComputedStyleByDomId),
                    updateElementInstance: promisifyMethod(penpalChild?.updateElementInstance),
                    getFirstWeblabElement: promisifyMethod(penpalChild?.getFirstWeblabElement),
                    setElementType: promisifyMethod(penpalChild?.setElementType),
                    getElementType: promisifyMethod(penpalChild?.getElementType),
                    getParentElement: promisifyMethod(penpalChild?.getParentElement),
                    getChildrenCount: promisifyMethod(penpalChild?.getChildrenCount),
                    getOffsetParent: promisifyMethod(penpalChild?.getOffsetParent),
                    getActionLocation: promisifyMethod(penpalChild?.getActionLocation),
                    getActionElement: promisifyMethod(penpalChild?.getActionElement),
                    getInsertLocation: promisifyMethod(penpalChild?.getInsertLocation),
                    getRemoveAction: promisifyMethod(penpalChild?.getRemoveAction),
                    getTheme: promisifyMethod(penpalChild?.getTheme),
                    setTheme: promisifyMethod(penpalChild?.setTheme),
                    startDrag: promisifyMethod(penpalChild?.startDrag),
                    drag: promisifyMethod(penpalChild?.drag),
                    dragAbsolute: promisifyMethod(penpalChild?.dragAbsolute),
                    endDragAbsolute: promisifyMethod(penpalChild?.endDragAbsolute),
                    endDrag: promisifyMethod(penpalChild?.endDrag),
                    endAllDrag: promisifyMethod(penpalChild?.endAllDrag),
                    startEditingText: promisifyMethod(penpalChild?.startEditingText),
                    editText: promisifyMethod(penpalChild?.editText),
                    stopEditingText: promisifyMethod(penpalChild?.stopEditingText),
                    updateStyle: promisifyMethod(penpalChild?.updateStyle),
                    insertElement: promisifyMethod(penpalChild?.insertElement),
                    removeElement: promisifyMethod(penpalChild?.removeElement),
                    moveElement: promisifyMethod(penpalChild?.moveElement),
                    groupElements: promisifyMethod(penpalChild?.groupElements),
                    ungroupElements: promisifyMethod(penpalChild?.ungroupElements),
                    insertImage: promisifyMethod(penpalChild?.insertImage),
                    removeImage: promisifyMethod(penpalChild?.removeImage),
                    isChildTextEditable: promisifyMethod(penpalChild?.isChildTextEditable),
                    handleBodyReady: promisifyMethod(penpalChild?.handleBodyReady),
                    captureScreenshot: promisifyMethod(penpalChild?.captureScreenshot),
                    buildLayerTree: promisifyMethod(penpalChild?.buildLayerTree),
                    setCapabilities: promisifyMethod(penpalChild?.setCapabilities),
                    setCmsData: promisifyMethod(penpalChild?.setCmsData),
                    findListAncestorOid: promisifyMethod(penpalChild?.findListAncestorOid),
                };
            }, [penpalChild]);

            useImperativeHandle(ref, (): IFrameView => {
                const iframe = iframeRef.current;
                if (!iframe) {
                    console.error(`${PENPAL_PARENT_CHANNEL} (${frame.id}) - Iframe - Not found`);
                    // Return safe fallback with no-op methods and safe defaults
                    const fallbackElement = document.createElement('iframe');
                    const safeFallback: IFrameView = Object.assign(fallbackElement, {
                        isPenpalReady: () => false,
                        // Custom sync methods with safe no-op implementations
                        supportsOpenDevTools: () => false,
                        setZoomLevel: () => {},
                        reload: () => {},
                        isLoading: () => false,
                        // Reuse the safe fallback methods from remoteMethods
                        ...remoteMethods,
                    });
                    return safeFallback;
                }

                const syncMethods = {
                    isPenpalReady: () => penpalChild !== null,
                    supportsOpenDevTools: () => {
                        try {
                            return !!iframe.contentWindow && 'openDevTools' in iframe.contentWindow;
                        } catch {
                            return false;
                        }
                    },
                    setZoomLevel: (level: number) => {
                        zoomLevel.current = level;
                        iframe.style.transform = `scale(${level})`;
                        iframe.style.transformOrigin = 'top left';
                    },
                    reload: () => reloadIframe(),
                    isLoading: () => {
                        if (!canReadIframeDocument(iframe)) {
                            return false;
                        }
                        return iframe.contentDocument?.readyState !== 'complete';
                    },
                };

                const frameView = Object.assign(iframe, {
                    ...syncMethods,
                    ...remoteMethods,
                }) as IFrameView;

                editorEngine.frames.registerView(frame, frameView);

                return frameView;
            }, [penpalChild, frame, iframeRef]);

            useEffect(() => {
                return () => {
                    if (connectionRef.current) {
                        connectionRef.current.destroy();
                        connectionRef.current = null;
                    }
                    setPenpalChild(null);
                    isConnecting.current = false;
                    // Drop the dead view from the manager so callers iterating
                    // `frames.getAll()` don't keep hitting a destroyed penpal
                    // channel after a sandbox restart. The next mount
                    // re-attaches a fresh view via registerView.
                    editorEngine.frames.deregisterView(frame.id);
                };
            }, [frame.id, editorEngine.frames]);

            return (
                <WebPreview>
                    <WebPreviewBody
                        ref={iframeRef}
                        id={frame.id}
                        className={cn(
                            'outline outline-4 backdrop-blur-sm transition',
                            isActiveBranch && 'outline-foreground-brand',
                            isActiveBranch && !isSelected && 'outline-dashed',
                            !isActiveBranch && isInDragSelection && 'outline-foreground-brand',
                        )}
                        src={frame.url}
                        sandbox="allow-modals allow-forms allow-same-origin allow-scripts allow-popups allow-downloads"
                        allow="geolocation; microphone; camera; midi; encrypted-media"
                        style={(() => {
                            // Width drives the viewport (so Tailwind / @media respond
                            // to the breakpoint). Height auto-fits the page content
                            // reported by the iframe via onContentResized so each
                            // breakpoint shows the WHOLE page, not a clipped viewport.
                            const width = frame.breakpoint?.width ?? frame.dimension.width;
                            const reported = editorEngine.frames.get(frame.id)?.contentHeight;
                            const MIN_HEIGHT = 360;
                            const MAX_HEIGHT = 50_000; // safety cap for runaway pages
                            const height = Math.min(
                                MAX_HEIGHT,
                                Math.max(MIN_HEIGHT, reported ?? frame.dimension.height),
                            );
                            return { width, height };
                        })()}
                        onLoad={setupPenpalConnection}
                        onError={() => {
                            // Notify the restart-sandbox button so it can
                            // surface the warning state and let the user trigger
                            // a sandbox restart. Iframe `error` events cover
                            // network-level load failures (DNS, refused
                            // connection, etc.); HTTP error responses such as
                            // 502 usually still emit `load`.
                            try {
                                window.dispatchEvent(
                                    new CustomEvent('weblab:sandbox-iframe-error', {
                                        detail: { frameId: frame.id },
                                    }),
                                );
                            } catch (err) {
                                console.error('Failed to dispatch iframe error event', err);
                            }
                        }}
                        {...props}
                    />
                </WebPreview>
            );
        },
    ),
);
