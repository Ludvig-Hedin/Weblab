import type { FigmaTopLevelFrame } from './types';
import { toComponentName } from './utils';

const toTsxCommentText = (value: string): string => {
    return value
        .replace(/\r?\n/g, ' ')
        .replace(/\*\//g, '* /')
        .replace(/\/\*/g, '/ *')
        .replace(/\{/g, '(')
        .replace(/\}/g, ')');
};

export function scaffoldFrameComponent(frame: FigmaTopLevelFrame): string {
    const name = toComponentName(frame.name);
    const commentName = toTsxCommentText(frame.name);
    return `// TODO: Replace this stub with the actual implementation for "${commentName}"
export default function ${name}() {
  return (
    <div
      style={{
        width: ${frame.width},
        height: ${frame.height},
        backgroundColor: '${frame.backgroundColor}',
        position: 'relative',
      }}
    >
      {/* ${commentName} - imported from Figma */}
    </div>
  );
}
`;
}

export function scaffoldAppPage(frames: FigmaTopLevelFrame[]): string {
    const imports = frames
        .map(
            (f) =>
                `import ${toComponentName(f.name)} from '@/components/${toComponentName(f.name)}';`,
        )
        .join('\n');
    const renders = frames.map((f) => `      <${toComponentName(f.name)} />`).join('\n');
    return `${imports}

export default function Page() {
  return (
    <main>
${renders}
    </main>
  );
}
`;
}

export interface ScaffoldedFile {
    path: string;
    content: string;
}

/**
 * Build the full set of project files for a Figma import: one component file per
 * selected frame plus the `src/app/page.tsx` that renders them.
 *
 * Frame names are de-duplicated by component name so two frames that sanitize to
 * the same identifier (e.g. "Hero" and "hero") don't collide on the same file
 * path or import — the second gets a numeric suffix ("Hero2"). The de-duped name
 * is used for BOTH the component file and the page import so they stay in sync.
 *
 * Pure + side-effect free so it can run identically on the client (preview) and
 * inside the Convex `createFromFigma` action (which writes these into the
 * provisioned Next.js sandbox).
 */
export function scaffoldFigmaProjectFiles(frames: FigmaTopLevelFrame[]): ScaffoldedFile[] {
    const usedNames = new Set<string>();
    const dedupedFrames: FigmaTopLevelFrame[] = frames.map((frame) => {
        const baseName = toComponentName(frame.name);
        let uniqueName = baseName;
        let counter = 2;
        while (usedNames.has(uniqueName)) {
            uniqueName = `${baseName}${counter}`;
            counter++;
        }
        usedNames.add(uniqueName);
        return { ...frame, name: uniqueName };
    });

    return [
        ...dedupedFrames.map((frame) => ({
            path: `src/components/${toComponentName(frame.name)}.tsx`,
            content: scaffoldFrameComponent(frame),
        })),
        {
            path: 'src/app/page.tsx',
            content: scaffoldAppPage(dedupedFrames),
        },
    ];
}
