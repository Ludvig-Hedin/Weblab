import { describe, expect, mock, test } from 'bun:test';

import type { EditorEngine } from '@weblab/web-client/src/components/store/editor/engine';
import { SearchReplaceEditTool } from '../../src/tools/classes/search-replace-edit';
import { SearchReplaceMultiEditFileTool } from '../../src/tools/classes/search-replace-multi-edit';

describe('SearchReplaceEditTool', () => {
    test('should replace single occurrence', async () => {
        let writtenContent = '';
        const mockFileSystem = {
            initialize: mock(() => Promise.resolve()),
            readFile: mock(() => Promise.resolve('Hello world, this is a test')),
            writeFile: mock((path: string, content: string) => {
                writtenContent = content;
                return Promise.resolve(true);
            }),
        };

        const mockEditorEngine = {
            branches: {
                getBranchDataById: mock(() => ({ codeEditor: mockFileSystem })),
            },
        } as unknown as EditorEngine;

        const tool = new SearchReplaceEditTool();
        const result = await tool.handle(
            {
                branchId: 'test-branch',
                file_path: '/test/file.ts',
                old_string: 'Hello',
                new_string: 'Hi',
                replace_all: false,
            },
            mockEditorEngine,
        );

        expect(result).toBe('File /test/file.ts edited successfully');
        expect(writtenContent).toBe('Hi world, this is a test');
    });

    test('should throw error when string not found', async () => {
        const mockFileSystem = {
            initialize: mock(() => Promise.resolve()),
            readFile: mock(() => Promise.resolve('Hello world')),
            writeFile: mock(() => Promise.resolve(true)),
        };

        const mockEditorEngine = {
            branches: {
                getBranchDataById: mock(() => ({ codeEditor: mockFileSystem })),
            },
        } as unknown as EditorEngine;

        const tool = new SearchReplaceEditTool();

        await expect(
            tool.handle(
                {
                    branchId: 'test-branch',
                    file_path: '/test/file.ts',
                    old_string: 'NotFound',
                    new_string: 'Replacement',
                    replace_all: false,
                },
                mockEditorEngine,
            ),
        ).rejects.toThrow('String not found in file: NotFound');
    });

    test('should replace all occurrences when replace_all is true', async () => {
        let writtenContent = '';
        const mockFileSystem = {
            initialize: mock(() => Promise.resolve()),
            readFile: mock(() => Promise.resolve('test test test')),
            writeFile: mock((path: string, content: string) => {
                writtenContent = content;
                return Promise.resolve(true);
            }),
        };

        const mockEditorEngine = {
            branches: {
                getBranchDataById: mock(() => ({ codeEditor: mockFileSystem })),
            },
        } as unknown as EditorEngine;

        const tool = new SearchReplaceEditTool();
        const result = await tool.handle(
            {
                branchId: 'test-branch',
                file_path: '/test/file.ts',
                old_string: 'test',
                new_string: 'replacement',
                replace_all: true,
            },
            mockEditorEngine,
        );

        expect(result).toBe('File /test/file.ts edited successfully');
        expect(writtenContent).toBe('replacement replacement replacement');
    });

    test('should handle missing file system', async () => {
        const mockEditorEngine = {
            branches: {
                getBranchDataById: mock(() => null),
            },
        } as unknown as EditorEngine;

        const tool = new SearchReplaceEditTool();

        await expect(
            tool.handle(
                {
                    branchId: 'invalid-branch',
                    file_path: '/test/file.ts',
                    old_string: 'test',
                    new_string: 'replacement',
                    replace_all: false,
                },
                mockEditorEngine,
            ),
        ).rejects.toThrow('file system not found');
    });

    test('should keep $-patterns in new_string literal (single replace)', async () => {
        let writtenContent = '';
        const mockFileSystem = {
            initialize: mock(() => Promise.resolve()),
            readFile: mock(() => Promise.resolve('const price = PLACEHOLDER;')),
            writeFile: mock((path: string, content: string) => {
                writtenContent = content;
                return Promise.resolve(true);
            }),
        };
        const mockEditorEngine = {
            branches: {
                getBranchDataById: mock(() => ({ codeEditor: mockFileSystem })),
            },
        } as unknown as EditorEngine;

        const tool = new SearchReplaceEditTool();
        await tool.handle(
            {
                branchId: 'test-branch',
                file_path: '/test/file.ts',
                old_string: 'PLACEHOLDER',
                // `$$` would collapse to `$` and `$&` would re-insert the match
                // with a string replacement arg.
                new_string: "'$$10' + `$&` + \"$'\"",
                replace_all: false,
            },
            mockEditorEngine,
        );

        expect(writtenContent).toBe("const price = '$$10' + `$&` + \"$'\";");
    });

    test('should keep $-patterns in new_string literal (replace_all)', async () => {
        let writtenContent = '';
        const mockFileSystem = {
            initialize: mock(() => Promise.resolve()),
            readFile: mock(() => Promise.resolve('X and X')),
            writeFile: mock((path: string, content: string) => {
                writtenContent = content;
                return Promise.resolve(true);
            }),
        };
        const mockEditorEngine = {
            branches: {
                getBranchDataById: mock(() => ({ codeEditor: mockFileSystem })),
            },
        } as unknown as EditorEngine;

        const tool = new SearchReplaceEditTool();
        await tool.handle(
            {
                branchId: 'test-branch',
                file_path: '/test/file.ts',
                old_string: 'X',
                new_string: '$$',
                replace_all: true,
            },
            mockEditorEngine,
        );

        expect(writtenContent).toBe('$$ and $$');
    });

    test('should throw when replace_all target is not found', async () => {
        const mockFileSystem = {
            initialize: mock(() => Promise.resolve()),
            readFile: mock(() => Promise.resolve('Hello world')),
            writeFile: mock(() => Promise.resolve(true)),
        };
        const mockEditorEngine = {
            branches: {
                getBranchDataById: mock(() => ({ codeEditor: mockFileSystem })),
            },
        } as unknown as EditorEngine;

        const tool = new SearchReplaceEditTool();

        await expect(
            tool.handle(
                {
                    branchId: 'test-branch',
                    file_path: '/test/file.ts',
                    old_string: 'NotFound',
                    new_string: 'Replacement',
                    replace_all: true,
                },
                mockEditorEngine,
            ),
        ).rejects.toThrow('String not found in file: NotFound');
        expect(mockFileSystem.writeFile).not.toHaveBeenCalled();
    });
});

describe('SearchReplaceMultiEditFileTool', () => {
    test('should apply multiple edits sequentially', async () => {
        let writtenContent = '';
        const mockFileSystem = {
            initialize: mock(() => Promise.resolve()),
            readFile: mock(() => Promise.resolve('Hello world, this is a test')),
            writeFile: mock((path: string, content: string) => {
                writtenContent = content;
                return Promise.resolve(true);
            }),
        };

        const mockEditorEngine = {
            branches: {
                getBranchDataById: mock(() => ({ codeEditor: mockFileSystem })),
            },
        } as unknown as EditorEngine;

        const tool = new SearchReplaceMultiEditFileTool();
        const result = await tool.handle(
            {
                branchId: 'test-branch',
                file_path: '/test/file.ts',
                edits: [
                    { old_string: 'Hello', new_string: 'Hi', replace_all: false },
                    { old_string: 'world', new_string: 'universe', replace_all: false },
                ],
            },
            mockEditorEngine,
        );

        expect(result).toBe('File /test/file.ts edited with 2 changes');
        expect(writtenContent).toBe('Hi universe, this is a test');
    });

    test('should handle empty edits array', async () => {
        let writtenContent = '';
        const mockFileSystem = {
            initialize: mock(() => Promise.resolve()),
            readFile: mock(() => Promise.resolve('Hello world')),
            writeFile: mock((path: string, content: string) => {
                writtenContent = content;
                return Promise.resolve(true);
            }),
        };

        const mockEditorEngine = {
            branches: {
                getBranchDataById: mock(() => ({ codeEditor: mockFileSystem })),
            },
        } as unknown as EditorEngine;

        const tool = new SearchReplaceMultiEditFileTool();
        const result = await tool.handle(
            {
                branchId: 'test-branch',
                file_path: '/test/file.ts',
                edits: [],
            },
            mockEditorEngine,
        );

        expect(result).toBe('File /test/file.ts edited with 0 changes');
        expect(writtenContent).toBe('Hello world');
    });

    test('should handle missing file system', async () => {
        const mockEditorEngine = {
            branches: {
                getBranchDataById: mock(() => null),
            },
        } as unknown as EditorEngine;

        const tool = new SearchReplaceMultiEditFileTool();

        await expect(
            tool.handle(
                {
                    branchId: 'invalid-branch',
                    file_path: '/test/file.ts',
                    edits: [{ old_string: 'test', new_string: 'replacement', replace_all: false }],
                },
                mockEditorEngine,
            ),
        ).rejects.toThrow('file system not found');
    });

    test('should keep $-patterns literal and throw on missing replace_all target', async () => {
        let writtenContent = '';
        const mockFileSystem = {
            initialize: mock(() => Promise.resolve()),
            readFile: mock(() => Promise.resolve('a a b')),
            writeFile: mock((path: string, content: string) => {
                writtenContent = content;
                return Promise.resolve(true);
            }),
        };
        const mockEditorEngine = {
            branches: {
                getBranchDataById: mock(() => ({ codeEditor: mockFileSystem })),
            },
        } as unknown as EditorEngine;

        const tool = new SearchReplaceMultiEditFileTool();
        await tool.handle(
            {
                branchId: 'test-branch',
                file_path: '/test/file.ts',
                edits: [
                    { old_string: 'a', new_string: '$$', replace_all: true },
                    { old_string: 'b', new_string: "$&$'", replace_all: false },
                ],
            },
            mockEditorEngine,
        );
        expect(writtenContent).toBe("$$ $$ $&$'");

        await expect(
            tool.handle(
                {
                    branchId: 'test-branch',
                    file_path: '/test/file.ts',
                    edits: [{ old_string: 'missing', new_string: 'x', replace_all: true }],
                },
                mockEditorEngine,
            ),
        ).rejects.toThrow('String not found in file: missing');
    });
});
