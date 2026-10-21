// Materialize the installed production graph without a package-manager deploy
// command. Workspace links and Bun's isolated store never enter the app bundle.
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";

const OMIT = new Set([
  ".DS_Store",
  ".git",
  ".npmrc",
  ".pnpm-store",
  ".yarnrc",
  ".yarnrc.yml",
  "node_modules",
]);
const PACKAGE_NAME = /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i;
const ATTRIBUTION = /^(readme|license)(\.|$)/i;

function inside(root, path) {
  const rel = relative(root, path);
  return (
    rel === "" || !(rel === ".." || rel.startsWith("../") || isAbsolute(rel))
  );
}

function omitted(name) {
  return OMIT.has(name) || name === ".env" || name.startsWith(".env.");
}

function manifestAt(path) {
  return JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
}

function installedPackage(from, name) {
  if (
    !PACKAGE_NAME.test(name) ||
    name.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new Error(`Invalid dependency name: ${name}`);
  }
  let dir = from;
  for (;;) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) {
      return realpathSync(candidate);
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function compatible(values, current) {
  if (!Array.isArray(values)) {
    return true;
  }
  return (
    !values.includes(`!${current}`) &&
    (!values.some((value) => !value.startsWith("!")) ||
      values.includes(current))
  );
}

function copyTree(source, target, packageRoot, ancestors = new Set()) {
  if (omitted(basename(source))) {
    return;
  }
  const actual = realpathSync(source);
  if (!inside(packageRoot, actual)) {
    throw new Error(`Package link leaves its folder: ${source}`);
  }
  if (relative(packageRoot, actual).split("/").some(omitted)) {
    return;
  }
  const info = statSync(actual);
  if (info.isDirectory()) {
    if (ancestors.has(actual)) {
      throw new Error(`Package contains a link cycle: ${source}`);
    }
    mkdirSync(target, { recursive: true });
    const next = new Set(ancestors).add(actual);
    for (const name of readdirSync(actual).sort()) {
      copyTree(join(actual, name), join(target, name), packageRoot, next);
    }
  } else if (info.isFile()) {
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(actual, target);
    chmodSync(target, info.mode % 0o1000);
  } else {
    throw new Error(`Unsupported runtime file: ${source}`);
  }
}

function copyPackage(source, destination, manifest, workspace) {
  mkdirSync(destination, { recursive: true });
  // Local workspaces may contain credentials and unpublished source files.
  // Their runtime contract is built dist plus legal attribution only.
  const entries = workspace
    ? ["dist", ...readdirSync(source).filter((name) => ATTRIBUTION.test(name))]
    : readdirSync(source);
  for (const name of entries.sort()) {
    if (name !== "package.json") {
      copyTree(join(source, name), join(destination, name), source);
    }
  }
  const { devDependencies: _dev, scripts: _scripts, ...runtime } = manifest;
  writeFileSync(
    join(destination, "package.json"),
    `${JSON.stringify(runtime, null, 2)}\n`
  );
}

/** No links, developer files or .env files may survive in the staged tree. */
export function assertRuntimeTree(root) {
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const info = lstatSync(path);
    if (info.isSymbolicLink()) {
      throw new Error(`Symlink in staged runtime: ${path}`);
    }
    if (omitted(name) && name !== "node_modules") {
      throw new Error(`Private file in staged runtime: ${path}`);
    }
    if (info.isDirectory()) {
      assertRuntimeTree(path);
    }
  }
}

/**
 * Direct dependencies claim their top-level slots first. Transitive version
 * conflicts get ordinary nested node_modules, preserving Node/Bun resolution.
 * All folders are real copies, including optional native SDK packages.
 */
export function stageRuntime({
  entry,
  destination,
  workspaceRoots = [entry],
  exclude = [],
  platform = process.platform,
  arch = process.arch,
}) {
  const root = resolve(destination);
  const source = realpathSync(entry);
  if (existsSync(root)) {
    throw new Error(`Runtime destination already exists: ${root}`);
  }
  const workspaces = new Set(workspaceRoots.map((path) => realpathSync(path)));
  const excluded = new Set(exclude);
  const initial = { manifest: manifestAt(source), source, target: root };
  const pending = [initial];
  const placed = new Map([[root, initial]]);

  function visiblePackage(from, name) {
    let dir = from;
    while (inside(root, dir)) {
      const found = placed.get(join(dir, "node_modules", name));
      if (found) {
        return found;
      }
      dir = dirname(dir);
    }
    return null;
  }

  function enqueue(parent, name, optional) {
    if (excluded.has(name)) {
      return;
    }
    const depSource = installedPackage(parent.source, name);
    if (!depSource) {
      if (optional) {
        return;
      }
      throw new Error(
        `Missing production dependency ${name} of ${parent.manifest.name}. Run bun install first.`
      );
    }
    const manifest = manifestAt(depSource);
    if (
      !(compatible(manifest.os, platform) && compatible(manifest.cpu, arch))
    ) {
      if (optional) {
        return;
      }
      throw new Error(
        `Production dependency ${name} does not support ${platform}/${arch}.`
      );
    }
    const visible = visiblePackage(parent.target, name);
    if (visible?.source === depSource) {
      return;
    }
    const hoisted = join(root, "node_modules", name);
    const target = placed.has(hoisted)
      ? join(parent.target, "node_modules", name)
      : hoisted;
    if (placed.has(target)) {
      throw new Error(`Conflicting runtime dependency at ${target}`);
    }
    const item = { manifest, source: depSource, target };
    placed.set(target, item);
    pending.push(item);
  }

  for (const item of pending) {
    copyPackage(
      item.source,
      item.target,
      item.manifest,
      workspaces.has(item.source)
    );
    const dependencies = new Map();
    for (const name of Object.keys(
      item.manifest.peerDependencies ?? {}
    ).sort()) {
      dependencies.set(
        name,
        Boolean(item.manifest.peerDependenciesMeta?.[name]?.optional)
      );
    }
    for (const name of Object.keys(item.manifest.dependencies ?? {}).sort()) {
      dependencies.set(name, false);
    }
    for (const name of Object.keys(
      item.manifest.optionalDependencies ?? {}
    ).sort()) {
      dependencies.set(name, true);
    }
    for (const [name, optional] of dependencies) {
      enqueue(item, name, optional);
    }
  }
  assertRuntimeTree(root);
  return initial.manifest;
}
