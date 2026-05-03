import type { NodeApi } from 'react-arborist';

import type { LayerNode } from '@weblab/models/element';

interface TreeRowProps {
    node: NodeApi<LayerNode>;
    innerRef: React.Ref<HTMLDivElement>;
    attrs: Record<string, any>;
    children: React.ReactNode;
}

export const TreeRow = ({ node, innerRef, attrs, children }: TreeRowProps) => {
    return (
        <div
            ref={innerRef}
            {...attrs}
            className={
                node.isFocused
                    ? 'ring-foreground-primary/40 rounded-sm ring-1 outline-none ring-inset'
                    : 'outline-none'
            }
        >
            {children}
        </div>
    );
};
