import type React from 'react';
import { makeAutoObservable } from 'mobx';

import type { ShadcnBlockManifestItem } from '@weblab/constants';
import type {
    ComponentInsertData,
    DomElement,
    DropElementProperties,
    ElementPosition,
    ImageContentData,
    RectDimensions,
} from '@weblab/models';
import { DefaultSettings, EditorAttributes } from '@weblab/constants';
import { EditorMode, InsertMode } from '@weblab/models';
import {
    type ActionElement,
    type ActionLocation,
    type ActionTarget,
    type InsertElementAction,
    type RemoveElementAction,
    type UpdateStyleAction,
} from '@weblab/models/actions';
import { StyleChangeType } from '@weblab/models/style';
import { colors } from '@weblab/ui/tokens';
import { canHaveBackgroundImage, createDomId, createOid, urlToRelativePath } from '@weblab/utility';

import type { EditorEngine } from '../engine';
import type { FrameData } from '../frames';
import type { IFrameView } from '@/app/project/[id]/_components/canvas/frame/view';
import { getRelativeMousePositionToFrameView } from '../overlay/utils';

export class InsertManager {
    isDrawing = false;
    private drawOrigin: ElementPosition | undefined;

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    getDefaultProperties(mode: InsertMode): DropElementProperties {
        switch (mode) {
            case InsertMode.INSERT_TEXT:
                return {
                    tagName: 'p',
                    styles: {
                        fontSize: '20px',
                        lineHeight: '24px',
                        color: '#000000',
                    },
                    textContent: null,
                };
            case InsertMode.INSERT_DIV:
                return {
                    tagName: 'div',
                    styles: {
                        width: '100px',
                        height: '100px',
                        backgroundColor: colors.blue[100],
                    },
                    textContent: null,
                };
            case InsertMode.INSERT_FLEX_DIV:
                return {
                    tagName: 'div',
                    styles: {
                        display: 'flex',
                        gap: '8px',
                        padding: '12px',
                        width: '200px',
                        height: '100px',
                        backgroundColor: colors.blue[100],
                    },
                    textContent: null,
                };
            case InsertMode.INSERT_BUTTON:
                return {
                    tagName: 'button',
                    styles: {
                        padding: '8px 16px',
                        backgroundColor: colors.blue[500],
                        color: '#ffffff',
                        borderRadius: '6px',
                        fontSize: '14px',
                        border: 'none',
                        cursor: 'pointer',
                    },
                    textContent: 'Button',
                };
            case InsertMode.INSERT_HEADING:
                return {
                    tagName: 'h1',
                    styles: {
                        fontSize: '32px',
                        lineHeight: '40px',
                        fontWeight: '700',
                        color: '#000000',
                    },
                    textContent: 'Heading',
                };
            case InsertMode.INSERT_LINK:
                return {
                    tagName: 'a',
                    styles: {
                        color: colors.blue[600],
                        textDecoration: 'underline',
                        fontSize: '16px',
                    },
                    textContent: 'Link',
                };
            case InsertMode.INSERT_INPUT:
                return {
                    tagName: 'input',
                    styles: {
                        padding: '8px 12px',
                        border: '1px solid #d4d4d4',
                        borderRadius: '6px',
                        fontSize: '14px',
                        width: '200px',
                    },
                    textContent: null,
                };
            case InsertMode.INSERT_WEBLAB_LIST:
                // CMS list marker: a regular <div> that the preview iframe
                // clones once per CMS item at runtime. Source code stays
                // runnable without our runtime — the marker attribute is the
                // only thing the preload script keys off.
                return {
                    tagName: 'div',
                    styles: {
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        padding: '16px',
                        width: '320px',
                        minHeight: '120px',
                        borderRadius: '12px',
                        border: '1px dashed #CBD5E1',
                    },
                    textContent: null,
                    attributes: { 'data-weblab-list': '' },
                };
            default:
                throw new Error(`No element properties defined for mode: ${mode}`);
        }
    }

    start(e: React.MouseEvent<HTMLDivElement>) {
        this.isDrawing = true;
        this.drawOrigin = {
            x: e.clientX,
            y: e.clientY,
        };
        this.updateInsertRect(this.drawOrigin);
    }

    draw(e: React.MouseEvent<HTMLDivElement>) {
        if (!this.isDrawing || !this.drawOrigin) {
            return;
        }
        const currentPos = {
            x: e.clientX,
            y: e.clientY,
        };
        this.updateInsertRect(currentPos);
    }

    async end(e: React.MouseEvent<HTMLDivElement>, frameView: IFrameView | null) {
        if (!this.isDrawing || !this.drawOrigin) {
            return null;
        }

        this.isDrawing = false;
        this.editorEngine.overlay.state.updateInsertRect(null);

        if (!frameView) {
            console.error('frameView not found');
            return;
        }
        const currentPos = { x: e.clientX, y: e.clientY };
        const newRect = this.getDrawRect(currentPos);

        const origin = getRelativeMousePositionToFrameView(e, frameView);
        await this.insertElement(frameView, newRect, origin);
        this.drawOrigin = undefined;
        this.editorEngine.state.setEditorMode(EditorMode.DESIGN);
    }

    private updateInsertRect(pos: ElementPosition) {
        const rect = this.getDrawRect(pos);
        const overlayContainer = document.getElementById(EditorAttributes.OVERLAY_CONTAINER_ID);
        if (!overlayContainer) {
            console.error('Overlay container not found');
            return;
        }
        const containerRect = overlayContainer.getBoundingClientRect();
        this.editorEngine.overlay.state.updateInsertRect({
            ...rect,
            top: rect.top - containerRect.top,
            left: rect.left - containerRect.left,
        });
    }

    private getDrawRect(currentPos: ElementPosition): RectDimensions {
        if (!this.drawOrigin) {
            return {
                top: currentPos.y,
                left: currentPos.x,
                width: 0,
                height: 0,
            };
        }
        const { x, y } = currentPos;
        let startX = this.drawOrigin.x;
        let startY = this.drawOrigin.y;
        let width = x - startX;
        let height = y - startY;

        if (width < 0) {
            startX = x;
            width = Math.abs(width);
        }

        if (height < 0) {
            startY = y;
            height = Math.abs(height);
        }

        return {
            top: startY,
            left: startX,
            width,
            height,
        };
    }

    async insertElement(frameView: IFrameView, newRect: RectDimensions, origin: ElementPosition) {
        const insertAction = await this.createInsertAction(frameView, newRect, origin);
        if (!insertAction) {
            console.error('Failed to create insert action');
            return;
        }
        await this.editorEngine.action.run(insertAction);
    }

    async createInsertAction(
        frameView: IFrameView,
        newRect: RectDimensions,
        origin: ElementPosition,
    ): Promise<InsertElementAction | undefined> {
        const location = await frameView.getInsertLocation(origin.x, origin.y);
        if (!location) {
            console.error('Insert position not found');
            return;
        }

        const frameData = this.editorEngine.frames.get(frameView.id);
        if (!frameData) {
            console.error('Frame data not found');
            return;
        }
        const branchId = frameData.frame.branchId;

        const mode = this.editorEngine.state.insertMode;
        if (!mode) {
            console.error('Insert mode not found');
            return;
        }
        const domId = createDomId();
        const oid = createOid();
        const width = Math.max(Math.round(newRect.width), 30);
        const height = Math.max(Math.round(newRect.height), 30);
        const defaultProperties = this.getDefaultProperties(mode);
        const didDrag = newRect.width > 3 || newRect.height > 3;
        const sizeStyles: Record<string, string> = didDrag
            ? {
                  width: `${width}px`,
                  height: `${height}px`,
              }
            : {};

        const actionElement: ActionElement = {
            domId,
            oid,
            branchId,
            tagName: defaultProperties.tagName,
            attributes: {
                [EditorAttributes.DATA_WEBLAB_DOM_ID]: domId,
                [EditorAttributes.DATA_WEBLAB_INSERTED]: 'true',
                [EditorAttributes.DATA_WEBLAB_ID]: oid,
                ...defaultProperties.attributes,
            },
            children: [],
            textContent: defaultProperties.textContent,
            styles: {
                ...defaultProperties.styles,
                ...sizeStyles,
            },
        };

        const targets: Array<ActionTarget> = [
            {
                frameId: frameView.id,
                branchId,
                domId,
                oid: null,
            },
        ];

        return {
            type: 'insert-element',
            targets: targets,
            location: location,
            element: actionElement,
            editText: mode === InsertMode.INSERT_TEXT,
            pasteParams: null,
            codeBlock: null,
        };
    }

    async insertDroppedImage(
        frame: FrameData,
        dropPosition: { x: number; y: number },
        imageData: ImageContentData,
        altKey = false,
    ) {
        if (!frame.view) {
            console.error('No frame view found');
            return;
        }

        const location = await frame.view.getInsertLocation(dropPosition.x, dropPosition.y);

        if (!location) {
            console.error('Failed to get insert location for drop');
            return;
        }

        const targetElement = await frame.view.getElementAtLoc(
            dropPosition.x,
            dropPosition.y,
            true,
        );

        if (!targetElement) {
            console.error('Failed to get element at drop position');
            return;
        }

        if (targetElement.tagName.toLowerCase() === 'img') {
            await this.updateImageSource(frame, targetElement, imageData);
            return;
        }

        if (altKey && canHaveBackgroundImage(targetElement.tagName)) {
            const actionElement = await frame.view.getActionElement(targetElement.domId);
            if (actionElement) {
                this.updateElementBackgroundAction(frame, actionElement, imageData, targetElement);
                return;
            }
        }
        this.insertImageElement(frame, location, imageData);
    }

    private async updateImageSource(
        frame: FrameData,
        targetElement: DomElement,
        imageData: ImageContentData,
    ) {
        if (!frame.view) {
            console.error('No frame view found');
            return;
        }

        const actionElement = await frame.view.getActionElement(targetElement.domId);
        if (!actionElement) {
            console.error('Failed to get action element for target');
            return;
        }

        const url = imageData.originPath.replace(
            new RegExp(`^${DefaultSettings.IMAGE_FOLDER}\/`),
            '',
        );

        const currentLocation = await frame.view.getActionLocation(targetElement.domId);
        if (!currentLocation) {
            console.error('Failed to get current element location');
            return;
        }

        const removeAction: RemoveElementAction = {
            type: 'remove-element',
            targets: [
                {
                    frameId: frame.frame.id,
                    branchId: frame.frame.branchId,
                    domId: actionElement.domId,
                    oid: actionElement.oid,
                },
            ],
            location: currentLocation,
            element: actionElement,
            editText: false,
            pasteParams: null,
            codeBlock: null,
        };

        // Create new image element with updated src
        const updatedImageElement: ActionElement = {
            ...actionElement,
            attributes: {
                ...actionElement.attributes,
                src: `/${url}`,
                alt: imageData.fileName,
            },
        };

        const insertAction: InsertElementAction = {
            type: 'insert-element',
            targets: [
                {
                    frameId: frame.frame.id,
                    branchId: frame.frame.branchId,
                    domId: actionElement.domId,
                    oid: actionElement.oid,
                },
            ],
            element: updatedImageElement,
            location: currentLocation,
            editText: false,
            pasteParams: null,
            codeBlock: null,
        };

        // Run remove + insert inside one history transaction so the swap is
        // batched through a single commit instead of landing as two
        // independent pushes — a remove that saved while the insert failed
        // would otherwise silently delete the image.
        this.editorEngine.history.startTransaction();
        try {
            await this.editorEngine.action.run(removeAction);
            await this.editorEngine.action.run(insertAction);
        } finally {
            await this.editorEngine.history.commitTransaction();
        }
    }

    insertImageElement(frame: FrameData, location: ActionLocation, imageData: ImageContentData) {
        const url = imageData.originPath.replace(
            new RegExp(`^${DefaultSettings.IMAGE_FOLDER}\/`),
            '',
        );
        const domId = createDomId();
        const oid = createOid();

        const imageElement: ActionElement = {
            domId,
            oid,
            branchId: frame.frame.branchId,
            tagName: 'img',
            children: [],
            attributes: {
                [EditorAttributes.DATA_WEBLAB_ID]: oid,
                [EditorAttributes.DATA_WEBLAB_DOM_ID]: domId,
                [EditorAttributes.DATA_WEBLAB_INSERTED]: 'true',
                src: `/${url}`,
                alt: imageData.fileName,
            },
            styles: {
                width: DefaultSettings.IMAGE_DIMENSION.width,
                height: DefaultSettings.IMAGE_DIMENSION.height,
            },
            textContent: null,
        };

        const action: InsertElementAction = {
            type: 'insert-element',
            targets: [{ frameId: frame.frame.id, branchId: frame.frame.branchId, domId, oid }],
            element: imageElement,
            location,
            editText: false,
            pasteParams: null,
            codeBlock: null,
        };
        this.editorEngine.action.run(action);
    }

    updateElementBackgroundAction(
        frame: FrameData,
        targetElement: ActionElement,
        imageData: ImageContentData,
        originalElement: DomElement,
    ) {
        const url = imageData.originPath.replace(
            new RegExp(`^${DefaultSettings.IMAGE_FOLDER}\/`),
            '',
        );
        const originStyles = originalElement.styles?.computed;
        let original = {};
        if (originStyles?.backgroundImage) {
            const backgroundImageValue = originStyles.backgroundImage;
            if (backgroundImageValue) {
                original = {
                    backgroundImage: {
                        value: urlToRelativePath(backgroundImageValue),
                        type: StyleChangeType.Value,
                    },
                    backgroundSize: {
                        value: originStyles.backgroundSize,
                        type: StyleChangeType.Value,
                    },
                    backgroundPosition: {
                        value: originStyles.backgroundPosition,
                        type: StyleChangeType.Value,
                    },
                };
            }
        }

        const action: UpdateStyleAction = {
            type: 'update-style',
            targets: [
                {
                    change: {
                        updated: {
                            backgroundImage: {
                                value: `url('/${url}')`,
                                type: StyleChangeType.Value,
                            },
                            backgroundSize: {
                                value: 'cover',
                                type: StyleChangeType.Value,
                            },
                            backgroundPosition: {
                                value: 'center',
                                type: StyleChangeType.Value,
                            },
                        },
                        original,
                    },

                    domId: targetElement.domId,
                    oid: targetElement.oid,
                    frameId: frame.frame.id,
                    branchId: frame.frame.branchId,
                },
            ],
        };
        this.editorEngine.action.run(action);
    }

    async insertDroppedElement(
        frame: FrameData,
        dropPosition: { x: number; y: number },
        properties: DropElementProperties,
    ) {
        if (!frame.view) {
            console.error('No frame view found');
            return;
        }

        const location = await frame.view.getInsertLocation(dropPosition.x, dropPosition.y);

        if (!location) {
            console.error('Failed to get insert location for drop');
            return;
        }

        const domId = createDomId();
        const oid = createOid();
        const element: ActionElement = {
            domId,
            oid,
            branchId: frame.frame.branchId,
            tagName: properties.tagName,
            styles: properties.styles,
            children: [],
            attributes: {
                [EditorAttributes.DATA_WEBLAB_ID]: oid,
                [EditorAttributes.DATA_WEBLAB_DOM_ID]: domId,
                [EditorAttributes.DATA_WEBLAB_INSERTED]: 'true',
                ...properties.attributes,
            },
            textContent: properties.textContent || null,
        };

        const action: InsertElementAction = {
            type: 'insert-element',
            targets: [
                {
                    frameId: frame.frame.id,
                    branchId: frame.frame.branchId,
                    domId,
                    oid: null,
                },
            ],
            element,
            location,
            editText: properties.tagName === 'p',
            pasteParams: null,
            codeBlock: null,
        };

        await this.editorEngine.action.run(action);

        if (properties.children?.length && frame.view) {
            await this.insertChildElements(frame, domId, properties.children);
        }
    }

    async insertDroppedBlock(
        frame: FrameData,
        dropPosition: { x: number; y: number },
        block: ShadcnBlockManifestItem,
    ) {
        if (!frame.view) {
            console.error('No frame view found');
            return;
        }

        const location = await frame.view.getInsertLocation(dropPosition.x, dropPosition.y);

        if (!location) {
            console.error('Failed to get insert location for block drop');
            return;
        }

        const domId = createDomId();
        const oid = createOid();
        const element: ActionElement = {
            domId,
            oid,
            branchId: frame.frame.branchId,
            tagName: 'section',
            styles: {},
            children: [],
            attributes: {
                [EditorAttributes.DATA_WEBLAB_ID]: oid,
                [EditorAttributes.DATA_WEBLAB_DOM_ID]: domId,
                [EditorAttributes.DATA_WEBLAB_INSERTED]: 'true',
                [EditorAttributes.DATA_WEBLAB_COMPONENT_NAME]: block.componentName,
            },
            textContent: null,
        };

        const codeBlock = getShadcnBlockCodeBlock(block);

        const action: InsertElementAction = {
            type: 'insert-element',
            targets: [
                {
                    frameId: frame.frame.id,
                    branchId: frame.frame.branchId,
                    domId,
                    oid: null,
                },
            ],
            element,
            location,
            editText: false,
            pasteParams: null,
            codeBlock,
        };

        await this.editorEngine.action.run(action);
    }

    private async insertChildElements(
        frame: FrameData,
        parentDomId: string,
        children: DropElementProperties[],
    ): Promise<void> {
        for (const child of children) {
            const childDomId = createDomId();
            const childOid = createOid();

            const childElement: ActionElement = {
                domId: childDomId,
                oid: childOid,
                branchId: frame.frame.branchId,
                tagName: child.tagName,
                styles: child.styles,
                children: [],
                attributes: {
                    [EditorAttributes.DATA_WEBLAB_ID]: childOid,
                    [EditorAttributes.DATA_WEBLAB_DOM_ID]: childDomId,
                    [EditorAttributes.DATA_WEBLAB_INSERTED]: 'true',
                    ...child.attributes,
                },
                textContent: child.textContent || null,
            };

            const insertAction: InsertElementAction = {
                type: 'insert-element',
                targets: [
                    {
                        frameId: frame.frame.id,
                        branchId: frame.frame.branchId,
                        domId: childDomId,
                        oid: null,
                    },
                ],
                element: childElement,
                location: {
                    type: 'append',
                    targetDomId: parentDomId,
                    targetOid: null,
                },
                editText: false,
                pasteParams: null,
                codeBlock: null,
            };

            await this.editorEngine.action.run(insertAction);

            if (child.children?.length) {
                await this.insertChildElements(frame, childDomId, child.children);
            }
        }
    }

    async insertDroppedComponent(
        frame: FrameData,
        dropPosition: { x: number; y: number },
        data: ComponentInsertData,
    ) {
        if (!frame.view) {
            console.error('No frame view found');
            return;
        }

        const location = await frame.view.getInsertLocation(dropPosition.x, dropPosition.y);
        if (!location) {
            console.error('Failed to get insert location for component drop');
            return;
        }

        const domId = createDomId();
        const oid = createOid();
        const element: ActionElement = {
            domId,
            oid,
            branchId: frame.frame.branchId,
            tagName: 'section',
            styles: {},
            children: [],
            attributes: {
                [EditorAttributes.DATA_WEBLAB_ID]: oid,
                [EditorAttributes.DATA_WEBLAB_DOM_ID]: domId,
                [EditorAttributes.DATA_WEBLAB_INSERTED]: 'true',
            },
            textContent: null,
        };

        const codeBlock = getUserComponentCodeBlock(data);

        const action: InsertElementAction = {
            type: 'insert-element',
            targets: [
                {
                    frameId: frame.frame.id,
                    branchId: frame.frame.branchId,
                    domId,
                    oid: null,
                },
            ],
            element,
            location,
            editText: false,
            pasteParams: null,
            codeBlock,
        };

        await this.editorEngine.action.run(action);
    }

    /**
     * Single entrypoint for "drop on canvas/frame" — reads the dataTransfer
     * payload (component / shadcn-block / image / element) and dispatches to the
     * matching insertDropped*. Returns true if a drop was handled.
     *
     * Both the per-frame gesture screen and the canvas-level drop handler call
     * this so the insert path is identical regardless of where the user
     * actually released the pointer.
     */
    async insertFromDataTransfer(
        frame: FrameData,
        dropPosition: ElementPosition,
        dataTransfer: DataTransfer,
        altKey = false,
    ): Promise<boolean> {
        const componentData = dataTransfer.getData('application/weblab-component');
        if (componentData) {
            let data: ComponentInsertData;
            try {
                data = JSON.parse(componentData) as ComponentInsertData;
            } catch {
                console.error('[InsertManager] Failed to parse component drag data');
                return false;
            }
            await this.insertDroppedComponent(frame, dropPosition, data);
            return true;
        }

        const propertiesData = dataTransfer.getData('application/json');
        if (!propertiesData) return false;

        // The drag sources tag their payloads with a `type` discriminator
        // ("image" / "shadcn-block") for non-element drops; raw element drops
        // ship a DropElementProperties shape directly.
        type DragPayload =
            | (ImageContentData & { type: 'image' })
            | { type: 'shadcn-block'; block: ShadcnBlockManifestItem }
            | DropElementProperties;
        let properties: DragPayload;
        try {
            properties = JSON.parse(propertiesData) as DragPayload;
        } catch {
            console.error('[InsertManager] Failed to parse element drag data');
            return false;
        }

        if ('type' in properties && properties.type === 'image') {
            await this.insertDroppedImage(frame, dropPosition, properties, altKey);
            return true;
        }
        if ('type' in properties && properties.type === 'shadcn-block') {
            await this.insertDroppedBlock(frame, dropPosition, properties.block);
            return true;
        }
        await this.insertDroppedElement(frame, dropPosition, properties);
        return true;
    }

    clear() {
        // Clear drawing state
        this.isDrawing = false;
    }
}

function getUserComponentCodeBlock(data: ComponentInsertData): string {
    const importPath = toImportPath(data.filePath);
    const importLine =
        data.exportType === 'default'
            ? `import ${data.componentName} from "${importPath}";`
            : `import { ${data.componentName} } from "${importPath}";`;

    return `${importLine}

<section data-weblab-inserted="true">
  <${data.componentName} />
</section>;`;
}

function toImportPath(filePath: string): string {
    // filePath is relative to project root, e.g. "src/components/MyCard.tsx"
    // Convert to @/ alias path — this is valid for any Next.js/Vite project with src/
    const withoutSrc = filePath.startsWith('src/') ? filePath.slice(4) : filePath;
    return `@/${withoutSrc.replace(/\.(tsx|ts|jsx|js)$/, '')}`;
}

function getShadcnBlockCodeBlock(block: ShadcnBlockManifestItem): string {
    const importLine = `import { ${block.componentName} } from "${block.importPath}";`;

    if (block.category !== 'primitive') {
        return `${importLine}

<section data-weblab-inserted="true" data-ocname="${block.componentName}">
  <${block.componentName} />
</section>;`;
    }

    const primitiveMarkup: Record<string, string> = {
        button: '<Button>Button</Button>',
        card: '<Card className="p-6">Card content</Card>',
        badge: '<Badge>Badge</Badge>',
        separator: '<Separator />',
        progress: '<Progress value={60} />',
        avatar: '<Avatar className="size-10" />',
    };

    return `${importLine}

<section data-weblab-inserted="true" data-ocname="${block.componentName}">
  ${primitiveMarkup[block.registryName] ?? `<${block.componentName} />`}
</section>;`;
}
