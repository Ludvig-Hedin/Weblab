import { addOidsToAst, getAstFromContent, getContentFromAst } from '@weblab/parser';

/**
 * Raw Next.js scaffold sources (pre-instrumentation). Kept here so the
 * scaffolder and its tests share one canonical copy.
 */
export const NEXT_SCAFFOLD_PAGE_SRC =
    'export default function Page() {\n  return <main className="min-h-screen" />;\n}\n';

export const NEXT_SCAFFOLD_LAYOUT_SRC =
    'import \'./globals.css\';\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html lang="en"><body>{children}</body></html>;\n}\n';

/**
 * Stamp `data-oid` source-tracking attributes onto scaffold JSX before it is
 * written to the sandbox.
 *
 * Why this exists: scaffolded files are written straight to the sandbox dev
 * server, which is the ONE write path that bypasses the editor's
 * `CodeFileSystem` — the only other place that injects `data-oid`. Without an
 * oid in the served DOM, the preload cannot map a rendered element back to its
 * source, so `getRemoveAction` returns `null` and deletion fails with
 * "Remove action not found" on a freshly-created project. Stamping oids here
 * makes the very first render the dev server serves already editable, instead
 * of depending on the asynchronous boot re-sync (and its fire-and-forget
 * push-back) landing first.
 *
 * Idempotent with the boot sync: `addOidsToAst` preserves existing valid oids,
 * so the later `CodeFileSystem` pass leaves these attributes untouched (no oid
 * churn, no duplicate-element confusion). Falls back to the unmodified source
 * if parsing ever fails, so a parser hiccup can never block project creation.
 */
export async function instrumentScaffoldJsx(content: string): Promise<string> {
    try {
        const ast = getAstFromContent(content);
        if (!ast) {
            return content;
        }
        const { ast: oidAst } = addOidsToAst(ast);
        return await getContentFromAst(oidAst, content);
    } catch {
        return content;
    }
}
