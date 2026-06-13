/**
 * Public, React-free entry for @weblab/wireframe-blocks.
 *
 * Safe to import from the Convex runtime and any server context: exposes the
 * block catalog metadata, content schemas, id/category helpers, and the pure
 * code emitter. React renderers live behind the separate "./browser" entry so
 * importing this never pulls React into a server bundle.
 */
export * from './types';
export * from './meta';
export * from './style-guide';
export * from './emit/build-emit';
