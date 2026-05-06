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
