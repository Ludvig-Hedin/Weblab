import { convertToBase64 } from '@weblab/utility';

import type { ReadFileInput, ReadFileOutput } from '../../../types';
import type { WebSocketSession } from '@codesandbox/sdk';
import { readRemoteFile } from './utils';

export async function readFile(
    client: WebSocketSession,
    { args }: ReadFileInput,
): Promise<ReadFileOutput> {
    const file = await readRemoteFile(client, args.path);
    if (!file) {
        throw new Error(`Failed to read file ${args.path}`);
    }
    if (file.type === 'text') {
        return {
            file: {
                path: file.path,
                content: file.content,
                type: file.type,
                toString: () => {
                    return file.content;
                },
            },
        };
    } else {
        return {
            file: {
                path: file.path,
                content: file.content,
                type: file.type,
                toString: () => {
                    // file.content is a Uint8Array (bytes 0-255) for binary
                    // files; convertToBase64 maps each byte via String.fromCharCode
                    // then btoa, which is correct base64 for that range.
                    return file.content ? convertToBase64(file.content) : '';
                },
            },
        };
    }
}
