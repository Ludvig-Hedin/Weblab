import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { expect, test } from "vitest";

const nativeRequire = createRequire(import.meta.url);
const source = fs.readFileSync(new URL("./upload.js", import.meta.url), "utf8");
const privateNames = [".weblab", ".vercel", ".airship", ".claude", ".codex"];
const rename = (to: string, from: string) =>
  `2 R. N... 100644 100644 100644 abc def R100 ${to}\0${from}\0`;
interface FileStatus {
  from: string;
  path: string;
  secret: boolean;
}
interface UploadApi {
  changeSummary: (cwd: string, paths: string[]) => Promise<string>;
  isSecret: (path: string) => boolean;
  parseStatus: (raw: string) => { files: FileStatus[] };
  upload: (
    cwd: string,
    input: { paths: unknown; note?: string; newBranch?: boolean }
  ) => Promise<{ ok: boolean; code?: string }>;
}
function setup(
  entries = "? src/page.tsx\0",
  statusFails = false,
  gitAvailable = true
) {
  const calls: string[][] = [];
  const module = { exports: {} };
  const raw = `# branch.head work\0# branch.upstream origin/work\0# branch.ab +0 -0\0${entries}`;
  const mocks: Record<string, unknown> = {
    "./github": {
      account: () => ({ login: "designer" }),
      gitAuthEnv: () => ({}),
      readToken: () => "fixture-token",
    },
    "./runtime": { canUseGit: () => gitAvailable, childEnv: () => ({}) },
    "./sites": { checkVerifiedPath: () => undefined },
    "node:child_process": {
      execFile: (
        _binary: string,
        args: string[],
        _options: object,
        callback: (error: object | null, stdout: string, stderr: string) => void
      ) => {
        calls.push(args);
        let stdout = "";
        if (args.includes("status")) {
          callback(statusFails ? { code: 1 } : null, raw, "");
          return;
        }
        if (args.includes("--is-inside-work-tree")) {
          stdout = "true";
        }
        if (args.includes("get-url")) {
          stdout = "https://github.com/example/site.git";
        }
        if (args.includes("symbolic-ref")) {
          stdout = "origin/main";
        }
        if (args.includes("user.email")) {
          stdout = "designer@example.test";
        }
        if (args.includes("diff")) {
          stdout = `safe diff for ${args.at(-1)}`;
        }
        callback(null, stdout, "");
      },
    },
  };
  vm.runInNewContext(source, {
    module,
    process: { env: {} },
    require: (name: string) => mocks[name] ?? nativeRequire(name),
  });
  return { api: module.exports as UploadApi, calls };
}

test("private directories are secret at every depth without an ignore file", () => {
  const { api } = setup();
  for (const name of privateNames) {
    for (const path of [
      name,
      `${name}/state.json`,
      `apps/site/${name}/nested/state.json`,
    ]) {
      expect(api.isSecret(path)).toBe(true);
      expect(api.parseStatus(`? ${path}\0`).files[0]?.secret).toBe(true);
    }
    expect(api.isSecret(`${name}-public/file.ts`)).toBe(false);
  }
  for (const path of [
    ".env",
    "site/.env.local",
    "key.pem",
    "site/key.key",
    "id_rsa.pub",
    "site/.npmrc",
  ]) {
    expect(api.isSecret(path)).toBe(true);
  }
  expect(api.isSecret("src/page.tsx")).toBe(false);
});

test("rename sources stay private even when the destination looks public", () => {
  const { api } = setup();
  for (const from of ["site/.weblab/content/draft.json", ".env.local"]) {
    const [file] = api.parseStatus(rename("src/copy.json", from)).files;
    expect(file).toMatchObject({ from, path: "src/copy.json", secret: true });
  }
});

test.each([
  ...privateNames.map((name) => `nested/${name}/state.json`),
  ".env.local",
])("forced private selection %s fails before any change", async (path) => {
  const { api, calls } = setup(`? ${path}\0? src/page.tsx\0`);
  expect(
    await api.upload("/fixture", {
      newBranch: true,
      paths: ["src/page.tsx", path],
    })
  ).toMatchObject({ code: "private-files", ok: false });
  expect(
    calls.some((args) =>
      ["checkout", "reset", "add", "commit", "push"].some((operation) =>
        args.includes(operation)
      )
    )
  ).toBe(false);
});

test("forced private rename selections fail natively", async () => {
  const { api, calls } = setup(
    rename("src/copy.json", ".weblab/content/draft.json")
  );
  expect(
    await api.upload("/fixture", { paths: ["src/copy.json"] })
  ).toMatchObject({ code: "private-files", ok: false });
  expect(
    calls.some((args) => args.includes("push") || args.includes("add"))
  ).toBe(false);
});

test("AI summaries never read private paths, private rename origins or arbitrary paths", async () => {
  const paths = privateNames.map((name) => `site/${name}/state.json`);
  const { api, calls } = setup(
    `${paths.map((path) => `? ${path}\0`).join("")}${rename("copy.json", ".vercel/project.json")}? src/page.tsx\0`
  );
  const summary = await api.changeSummary("/fixture", [
    ...paths,
    "copy.json",
    "../outside.txt",
    ".",
    "src/page.tsx",
  ]);
  expect(summary).toContain("safe diff for src/page.tsx");
  const diffs = calls.filter((args) => args.includes("diff"));
  expect(diffs).toHaveLength(1);
  expect(diffs[0]?.at(-1)).toBe("src/page.tsx");
});

test("AI summaries fail closed when current file status cannot be read", async () => {
  const { api, calls } = setup("? src/page.tsx\0", true);
  expect(await api.changeSummary("/fixture", ["src/page.tsx"])).toBe("");
  expect(calls.some((args) => args.includes("diff"))).toBe(false);
});

test("ordinary selected files still commit and push while private files stay unselected", async () => {
  const { api, calls } = setup(
    "? src/page.tsx\0? .weblab/content/draft.json\0"
  );
  expect(
    await api.upload("/fixture", {
      note: "Update page",
      paths: ["src/page.tsx"],
    })
  ).toMatchObject({ ok: true });
  expect(calls.find((args) => args.includes("add"))).toEqual([
    "--literal-pathspecs",
    "add",
    "-A",
    "--",
    "src/page.tsx",
  ]);
  expect(calls.some((args) => args.includes("push"))).toBe(true);
});

test.each(
  [
    null,
    "src/page.tsx",
    {},
    [null],
    [1],
    [""],
    ["."],
    [".."],
    ["../outside.txt"],
    ["src/../outside.txt"],
    ["/outside.txt"],
    ["src//page.tsx"],
    ["src/./page.tsx"],
    ["src\\page.tsx"],
    ["C:/outside.txt"],
    ["src/page\0.tsx"],
    ["src/page\n.tsx"],
    [".git/config"],
    ["nested/.GIT/config"],
    [".env.local"],
  ].map((paths) => ({ paths }))
)(
  "invalid/private selection $paths is refused before any Git command",
  async ({ paths }) => {
    const { api, calls } = setup();
    expect(
      await api.upload("/fixture", { newBranch: true, paths })
    ).toMatchObject({ code: "private-files", ok: false });
    expect(calls).toEqual([]);
  }
);

test("Git unavailable reports no remote without executing a Git command", async () => {
  const { api, calls } = setup("? src/page.tsx\0", false, false);
  expect(
    await api.upload("/fixture", { paths: ["src/page.tsx"] })
  ).toMatchObject({ code: "no-remote", ok: false });
  expect(calls).toEqual([]);
});

test("selected commits use literal commit-only paths without resetting the index", async () => {
  const { api, calls } = setup("? src/page.tsx\0");
  expect(
    await api.upload("/fixture", { note: "Selection", paths: ["src/page.tsx"] })
  ).toMatchObject({ ok: true });
  expect(calls.some((args) => args.includes("reset"))).toBe(false);
  expect(calls.find((args) => args.includes("commit"))).toEqual([
    "--literal-pathspecs",
    "commit",
    "--only",
    "-q",
    "-m",
    "Selection",
    "--",
    "src/page.tsx",
  ]);
});

async function uploadRenderer(privateOnly = false) {
  const requireOverlay = createRequire(
    new URL("../../../packages/overlay/package.json", import.meta.url)
  );
  const { Window } = requireOverlay("happy-dom");
  const window = new Window();
  const { document } = window;
  document.body.innerHTML =
    '<header><div id="title">Site</div><div class="topbar-right"></div></header><section data-screen="editor"></section><div id="gh-dialog" hidden></div>';
  const files = [
    ...(privateOnly
      ? []
      : [
          {
            dir: "src",
            kind: "edited",
            name: "page.tsx",
            path: "src/page.tsx",
            secret: false,
          },
        ]),
    {
      dir: "",
      kind: "new",
      name: ".env.local",
      path: ".env.local",
      secret: true,
    },
  ];
  window.weblab = {
    deploy: { onLogin: () => undefined, onProgress: () => undefined },
    publish: {
      freeze: () => Promise.resolve(null),
      note: () => Promise.resolve({ text: "Update page" }),
      onJob: () => undefined,
      status: () =>
        Promise.resolve({
          ahead: 0,
          branch: "work",
          defaultBranch: "main",
          files,
          git: true,
          remote: { github: true },
          repo: true,
          signedIn: true,
        }),
    },
  };
  const context = vm.createContext({
    CSS: window.CSS,
    currentSite: { id: "site" },
    document,
    MutationObserver: window.MutationObserver,
    navigator: window.navigator,
    setInterval: () => 0,
    window,
  });
  vm.runInContext(
    fs.readFileSync(new URL("../renderer/publish.js", import.meta.url), "utf8"),
    context
  );
  document.querySelector('[data-panel="upload"]').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { document, window };
}

test("Upload selection disables private files and counts only selectable files", async () => {
  const { window, document } = await uploadRenderer();
  try {
    const secret = () =>
      document.querySelector('[data-act="toggle"][data-path=".env.local"]');
    const all = () => document.querySelector('[data-act="toggle-all"]');
    expect(secret().disabled).toBe(true);
    expect(secret().getAttribute("aria-checked")).toBe("false");
    expect(all().textContent).toContain("1 of 1 file");
    expect(all().getAttribute("aria-checked")).toBe("true");
    // A forged DOM control still cannot select a private path through the handler.
    secret().disabled = false;
    secret().click();
    expect(secret().getAttribute("aria-checked")).toBe("false");
    all().click();
    expect(all().textContent).toContain("0 of 1 file");
    all().click();
    expect(all().textContent).toContain("1 of 1 file");
    expect(secret().getAttribute("aria-checked")).toBe("false");
  } finally {
    await window.happyDOM.abort();
  }
});

test("Upload cannot select an all-private file list", async () => {
  const { window, document } = await uploadRenderer(true);
  try {
    const all = document.querySelector('[data-act="toggle-all"]');
    expect(all.disabled).toBe(true);
    expect(all.textContent).toContain("0 of 0 files");
    expect(document.querySelector('[data-act="upload"]').disabled).toBe(true);
    expect(document.querySelector('[data-act="toggle"]').disabled).toBe(true);
  } finally {
    await window.happyDOM.abort();
  }
});
