import { parse, t } from '@weblab/parser/src/packages';
import { readContentTextTarget, type ContentTextTarget } from '@weblab/parser/src/code-edit/content-target';

type ComponentTarget = Extract<ContentTextTarget, { kind: 'component-literal' }>;

/** A DOM OID is only a hint. Resolve one supported owner from the complete saved file. */
export function selectedComponentTextTarget(source: string, oid: string): ComponentTarget | null {
    try {
        const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
        const targets: ComponentTarget[] = [];
        for (const node of ast.program.body) {
            if (!t.isExportNamedDeclaration(node) || !t.isFunctionDeclaration(node.declaration) || !node.declaration.id) continue;
            const target: ComponentTarget = { kind: 'component-literal', exportName: node.declaration.id.name, oid };
            try { readContentTextTarget(source, target); targets.push(target); } catch { /* Unsupported owners are not offered. */ }
        }
        return targets.length === 1 ? targets[0]! : null;
    } catch { return null; }
}
