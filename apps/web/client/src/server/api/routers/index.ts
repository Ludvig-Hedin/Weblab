export * from './chat';
export * from './cms';
export * from './comment';
export * from './code';
export * from './domain';
export * from './figma';
export * from './forward';
export * from './github';
// `image` router is dead code — server-side compression is reached directly
// via `routers/project/project.ts` (compressImageServer). It is intentionally
// not barrel-exported here, and not mounted in root.ts, to avoid surfacing an
// unreachable endpoint via TypeScript autocomplete.
export * from './project';
export * from './provider';
export * from './publish';
export * from './subscription';
export * from './usage';
export * from './user';
