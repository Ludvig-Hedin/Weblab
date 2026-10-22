// Foundation-only ordinary bookmarks. Never ask Finder to locate or mount a folder.
ObjC.import('Foundation');

function run(argv) {
    try {
        if (argv.length !== 1 || argv[0].length > 70000) throw new Error('invalid_input');
        var input = JSON.parse(argv[0]);
        var error = Ref();
        if (input.operation === 'create') {
            if (typeof input.path !== 'string' || input.path.length > 4096 || input.path[0] !== '/') {
                throw new Error('invalid_input');
            }
            var url = $.NSURL.fileURLWithPath(input.path);
            var bookmark = url.bookmarkDataWithOptionsIncludingResourceValuesForKeysRelativeToURLError(
                0, $(), $(), error
            );
            return JSON.stringify({ bookmark: ObjC.unwrap(bookmark.base64EncodedStringWithOptions(0)) });
        }
        if (input.operation === 'resolve') {
            if (typeof input.bookmark !== 'string' || input.bookmark.length > 65536) {
                throw new Error('invalid_input');
            }
            var data = $.NSData.alloc.initWithBase64EncodedStringOptions(input.bookmark, 0);
            var stale = Ref();
            var resolved = $.NSURL.URLByResolvingBookmarkDataOptionsRelativeToURLBookmarkDataIsStaleError(
                data, 768, $(), stale, error
            );
            return JSON.stringify({ path: ObjC.unwrap(resolved.path), stale: Boolean(stale[0]) });
        }
        throw new Error('invalid_input');
    } catch (_) {
        return JSON.stringify({ error: 'bookmark_unavailable' });
    }
}
