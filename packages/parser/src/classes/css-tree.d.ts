// The upstream DefinitelyTyped package omits the public tokenizer API.
import 'css-tree';

declare module 'css-tree' {
    export function tokenize(
        source: string,
        callback: (type: number, start: number, end: number) => void,
    ): void;
    export const tokenTypes: Record<
        | 'AtKeyword'
        | 'Ident'
        | 'Function'
        | 'String'
        | 'Url'
        | 'Comment'
        | 'WhiteSpace'
        | 'LeftParenthesis'
        | 'RightParenthesis'
        | 'Colon'
        | 'Dimension'
        | 'Comma'
        | 'Delim',
        number
    >;
}
