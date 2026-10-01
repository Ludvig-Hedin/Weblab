import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { handleAssetsRequest } from "./assets";
import { captureProjectRoot, MOVED_PROJECT_MESSAGE } from "./root-identity";

const fixtures: string[] = [];
afterEach(() => {
  for (const directory of fixtures.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});
function fixture() {
  const parent = mkdtempSync(join(tmpdir(), "weblab-running-root-"));
  fixtures.push(parent);
  const root = join(parent, "site");
  mkdirSync(root);
  return { parent, root };
}
test("a running root remains valid while its contents change", () => {
  const { root } = fixture();
  const assert = captureProjectRoot(root);
  mkdirSync(join(root, "new-content"));
  expect(assert).not.toThrow();
});
test("a moved root and a replacement at the old path both fail closed", () => {
  const { parent, root } = fixture();
  const assert = captureProjectRoot(root);
  renameSync(root, join(parent, "moved"));
  expect(assert).toThrow(MOVED_PROJECT_MESSAGE);
  mkdirSync(root);
  expect(assert).toThrow(MOVED_PROJECT_MESSAGE);
});
test("a symlink to the moved original cannot silently rebind a running editor", () => {
  const { parent, root } = fixture();
  const assert = captureProjectRoot(root);
  const moved = join(parent, "moved");
  renameSync(root, moved);
  symlinkSync(moved, root);
  expect(assert).toThrow(MOVED_PROJECT_MESSAGE);
});
test("an upload rechecks the root after receiving its delayed body", async () => {
  const { parent, root } = fixture();
  const assertProjectRoot = captureProjectRoot(root);
  const png = Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    Buffer.alloc(24, 1),
  ]);
  let request: http.ClientRequest;
  const server = http.createServer((req, res) => {
    handleAssetsRequest(req, res, {
      assertProjectRoot,
      projectRoot: root,
    }).catch(() => res.destroy());
    req.once("data", () => {
      renameSync(root, join(parent, "moved"));
      mkdirSync(root);
      request.end(png.subarray(8));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const status = await new Promise<number>((resolve, reject) => {
      request = http.request(
        {
          headers: {
            "content-type": "image/png",
            origin: `http://127.0.0.1:${port}`,
          },
          host: "127.0.0.1",
          method: "POST",
          path: "/__airship/api/assets?name=logo.png",
          port,
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode ?? 0));
        }
      );
      request.on("error", reject);
      request.write(png.subarray(0, 8));
    });
    expect(status).toBe(409);
    expect(readdirSync(root)).toEqual([]);
    expect(readdirSync(join(parent, "moved"))).toEqual([]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
