import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import release from "./release-flow.js";

const { createReleaseFlow } = release;
const link = { orgId: "team_example", projectId: "prj_example" };
let root: string;
const movedRoots: string[] = [];
interface Deployment {
  id: string;
  meta: { weblabRelease?: string };
  projectId: string;
  readyState: string;
  target: string | null;
  url: string;
}

function fixture(verify = () => undefined) {
  let live = "previous";
  let sequence = 0;
  const snapshots: string[] = [];
  const deployments = new Map<string, Deployment>([
    [
      "previous",
      {
        id: "previous",
        meta: {},
        projectId: link.projectId,
        readyState: "READY",
        target: "production",
        url: "previous.example.test",
      },
    ],
  ]);
  const provider = {
    build: vi.fn(
      (
        snapshot: { directory: string },
        production: boolean,
        intentId: string
      ) => {
        snapshots.push(snapshot.directory);
        if (!fs.existsSync(path.join(snapshot.directory, "package.json"))) {
          throw new Error("Snapshot was missing before build");
        }
        sequence += 1;
        const id = `deployment${sequence}`;
        deployments.set(id, {
          id,
          meta: { weblabRelease: intentId },
          projectId: link.projectId,
          readyState: "READY",
          target: production ? "production" : null,
          url: `${id}.example.test`,
        });
        return Promise.resolve({ id });
      }
    ),
    deployment: vi.fn((id: string) => {
      const deployment = deployments.get(id);
      if (!deployment) {
        throw new Error("Unknown fixture deployment");
      }
      return Promise.resolve(structuredClone(deployment));
    }),
    findBuild: vi.fn(async (id: string) =>
      [...deployments.values()].filter(
        (deployment) => deployment.meta.weblabRelease === id
      )
    ),
    project: vi.fn(async () => ({
      id: link.projectId,
      targets: { production: { id: live } },
    })),
    promote: vi.fn((id: string) => {
      live = id;
      return Promise.resolve();
    }),
    rollback: vi.fn((id: string) => {
      live = id;
      return Promise.resolve();
    }),
  };
  const flow = createReleaseFlow({ link, provider, root, verify });
  async function candidate() {
    await flow.build(false);
    await flow.review(flow.state().preview.id);
    await flow.build(true);
    await flow.review(flow.state().candidate.id);
    return flow.state().candidate.id as string;
  }
  return {
    candidate,
    deployments,
    flow,
    live: () => live,
    provider,
    setLive: (id: string) => {
      live = id;
    },
    snapshots,
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "weblab-release-flow-"));
  execFileSync("git", ["init", "-q", root]);
  fs.writeFileSync(
    path.join(root, "package.json"),
    '{"name":"release-fixture"}'
  );
  fs.writeFileSync(path.join(root, "page.tsx"), "Original source");
  fs.mkdirSync(path.join(root, ".vercel"));
  fs.writeFileSync(
    path.join(root, ".vercel/project.json"),
    JSON.stringify(link)
  );
});
afterEach(() => {
  fs.rmSync(root, { force: true, recursive: true });
  for (const moved of movedRoots.splice(0)) {
    fs.rmSync(moved, { force: true, recursive: true });
  }
});

test("preview and staged production builds do not switch the live website", async () => {
  const f = fixture();
  const id = await f.candidate();
  expect(f.flow.state().candidate.reviewed).toBe(true);
  expect(f.flow.state().candidate.id).toBe(id);
  expect(f.live()).toBe("previous");
  expect(f.provider.promote).not.toHaveBeenCalled();
  expect(f.provider.rollback).not.toHaveBeenCalled();
  for (const directory of f.snapshots) {
    expect(fs.existsSync(directory)).toBe(false);
  }
  expect((await f.flow.publish()).published).toBe(true);
  expect(f.live()).toBe(id);
});

test("production build requires a reviewed preview of exactly these source bytes", async () => {
  const f = fixture();
  await expect(f.flow.build(true)).rejects.toThrow("review a test link");
  expect(f.provider.build).not.toHaveBeenCalled();
  await f.flow.build(false);
  await expect(f.flow.build(true)).rejects.toThrow("review a test link");
  await f.flow.review(f.flow.state().preview.id);
  fs.writeFileSync(path.join(root, "page.tsx"), "New source");
  await expect(f.flow.build(true)).rejects.toThrow("exact changes");
  expect(f.provider.build).toHaveBeenCalledTimes(1);
});

test("source changes invalidate both review and final publication", async () => {
  const f = fixture();
  await f.flow.build(false);
  const previewId = f.flow.state().preview.id;
  fs.writeFileSync(path.join(root, "page.tsx"), "Changed before review");
  await expect(f.flow.review(previewId)).rejects.toThrow("site changed");
  fs.writeFileSync(path.join(root, "page.tsx"), "Original source");
  await f.candidate();
  fs.writeFileSync(path.join(root, "page.tsx"), "Changed after review");
  await expect(f.flow.publish()).rejects.toThrow("Review the current");
  expect(f.provider.promote).not.toHaveBeenCalled();
});

test("a newer remote release blocks promotion of an older reviewed candidate", async () => {
  const f = fixture();
  await f.candidate();
  f.setLive("someone-elses-release");
  await expect(f.flow.publish()).rejects.toThrow("Someone else published");
  expect(f.provider.promote).not.toHaveBeenCalled();
  expect(f.flow.state().pending).toBeNull();
});

test("a lost build response is reconciled by its persisted intent without rebuilding", async () => {
  const f = fixture();
  const build = f.provider.build.getMockImplementation();
  f.provider.build.mockImplementationOnce(async (snapshot, production, id) => {
    await build?.(snapshot, production, id);
    throw new Error("Lost response");
  });
  await expect(f.flow.build(false)).rejects.toThrow("pending release");
  expect(f.flow.state().pending.kind).toBe("build");
  await expect(f.flow.build(false)).rejects.toThrow("not confirmed");
  const reopened = createReleaseFlow({ link, provider: f.provider, root });
  const result = await reopened.reconcile();
  expect(result.release.preview.reviewed).toBe(false);
  expect(result.release.pending).toBeNull();
  expect(f.provider.build).toHaveBeenCalledTimes(1);
  expect(fs.existsSync(f.snapshots[0])).toBe(false);
});

test("missing or ambiguous build matches retain pending intent", async () => {
  const f = fixture();
  f.provider.build.mockRejectedValueOnce(new Error("Unknown outcome"));
  await expect(f.flow.build(false)).rejects.toThrow("pending release");
  await expect(f.flow.reconcile()).rejects.toThrow("not yet confirmed");
  const candidate = f.deployments.get("previous");
  if (!candidate) {
    throw new Error("Missing fixture");
  }
  f.provider.findBuild.mockResolvedValueOnce([candidate, candidate]);
  await expect(f.flow.reconcile()).rejects.toThrow("not yet confirmed");
  expect(f.flow.state().pending).not.toBeNull();
});

test("explicit build recovery requires the same intent, no remote build and unchanged live site", async () => {
  const f = fixture();
  f.provider.build.mockRejectedValueOnce(new Error("CLI did not start"));
  await expect(f.flow.build(false)).rejects.toThrow("pending release");
  const { id } = f.flow.state().pending;
  await expect(f.flow.abandonBuild("stale-id")).rejects.toThrow("Only this");
  f.setLive("external-release");
  await expect(f.flow.abandonBuild(id)).rejects.toThrow("live site changed");
  expect(f.flow.state().pending.id).toBe(id);
  f.setLive("previous");
  const remote = f.deployments.get("previous");
  if (!remote) {
    throw new Error("Missing fixture");
  }
  f.provider.findBuild.mockResolvedValueOnce([remote]);
  await expect(f.flow.abandonBuild(id)).rejects.toThrow("has this build");
  f.provider.findBuild.mockRejectedValueOnce(new Error("Offline"));
  await expect(f.flow.abandonBuild(id)).rejects.toThrow("Offline");
  expect(f.flow.state().pending.id).toBe(id);
  await f.flow.abandonBuild(id);
  expect(f.flow.state().pending).toBeNull();
  expect(f.flow.state().abandonedBuild.id).toBe(id);
  await f.flow.build(false);
  expect(f.flow.state().preview.reviewed).toBe(false);
  expect(f.provider.promote).not.toHaveBeenCalled();
});

test("an uncertain live switch can never use build recovery", async () => {
  const f = fixture();
  await f.candidate();
  f.provider.promote.mockRejectedValueOnce(new Error("Unknown outcome"));
  await expect(f.flow.publish()).rejects.toThrow("Unknown outcome");
  await expect(f.flow.abandonBuild(f.flow.state().pending.id)).rejects.toThrow(
    "Only this"
  );
  expect(f.flow.state().pending.kind).toBe("promote");
});

test("a confirmed failed build clears the pending gate without creating a preview", async () => {
  const f = fixture();
  const build = f.provider.build.getMockImplementation();
  f.provider.build.mockImplementationOnce(async (snapshot, production, id) => {
    const result = await build?.(snapshot, production, id);
    const deployment = result ? f.deployments.get(result.id) : undefined;
    if (!deployment) {
      throw new Error("Missing fixture");
    }
    deployment.readyState = "ERROR";
    throw new Error("Build failed");
  });
  await expect(f.flow.build(false)).rejects.toThrow("pending release");
  const result = await f.flow.reconcile();
  expect(result.release.pending).toBeNull();
  expect(result.release.preview).toBeNull();
  expect(f.provider.promote).not.toHaveBeenCalled();
});

test("a promotion with a lost response reconciles the exact candidate", async () => {
  const f = fixture();
  const id = await f.candidate();
  f.provider.promote.mockImplementationOnce((target) => {
    f.setLive(target);
    throw new Error("Lost promote response");
  });
  await expect(f.flow.publish()).rejects.toThrow("Lost promote");
  expect(f.flow.state().pending.kind).toBe("promote");
  const result = await f.flow.reconcile();
  expect(result.release.live.id).toBe(id);
  expect(result.release.candidate).toBeNull();
  expect(result.release.pending).toBeNull();
  expect(f.provider.promote).toHaveBeenCalledTimes(1);
});

test("unconfirmed promotion retains its pending gate", async () => {
  const f = fixture();
  await f.candidate();
  f.provider.promote.mockRejectedValueOnce(new Error("Unknown switch outcome"));
  await expect(f.flow.publish()).rejects.toThrow("Unknown switch");
  await expect(f.flow.reconcile()).rejects.toThrow("not confirmed");
  expect(f.flow.state().pending.kind).toBe("promote");
});

test("rollback restores the recorded previous release and handles a lost response", async () => {
  const f = fixture();
  const id = await f.candidate();
  await f.flow.publish();
  f.provider.rollback.mockImplementationOnce((target) => {
    f.setLive(target);
    throw new Error("Lost rollback response");
  });
  await expect(f.flow.rollback()).rejects.toThrow("Lost rollback");
  const result = await f.flow.reconcile();
  expect(result.release.live.id).toBe("previous");
  expect(result.release.live.previousId).toBe(id);
  expect(result.release.pending).toBeNull();
});

test("rollback refuses a newer remote release or a previous version from another site", async () => {
  const f = fixture();
  const id = await f.candidate();
  await f.flow.publish();
  f.setLive("other-release");
  await expect(f.flow.rollback()).rejects.toThrow("Someone else published");
  f.setLive(id);
  const previous = f.deployments.get("previous");
  if (!previous) {
    throw new Error("Missing fixture");
  }
  previous.projectId = "prj_other";
  await expect(f.flow.rollback()).rejects.toThrow("previous version");
  expect(f.provider.rollback).not.toHaveBeenCalled();
});

function gate() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const delayedEdges = [
  "build-project",
  "build-response",
  "build-deployment",
  "review-deployment",
  "promote-response",
  "rollback-response",
  "reconcile-build",
  "reconcile-promote",
  "reconcile-rollback",
] as const;

for (const replace of [false, true]) {
  for (const edge of delayedEdges) {
    test(`${edge} refuses a ${replace ? "replacement" : "moved"} source root without rewriting release intent`, async () => {
      const directory = root;
      const identity = fs.statSync(directory, { bigint: true });
      const f = fixture(() => {
        const current = fs.statSync(directory, { bigint: true });
        if (
          current.dev !== identity.dev ||
          current.ino !== identity.ino ||
          current.birthtimeNs !== identity.birthtimeNs
        ) {
          throw new Error("Source folder changed");
        }
      });
      const entered = gate();
      const waiting = gate();
      const pause = async <T>(result: T | Promise<T>) => {
        const value = await result;
        entered.resolve();
        await waiting.promise;
        return value;
      };
      let operation: () => Promise<unknown>;
      if (edge === "build-project") {
        f.provider.project.mockImplementationOnce(() =>
          pause({
            id: link.projectId,
            targets: { production: { id: f.live() } },
          })
        );
        operation = () => f.flow.build(false);
      } else if (edge === "build-response") {
        const build = f.provider.build.getMockImplementation();
        if (!build) {
          throw new Error("Missing build fixture");
        }
        f.provider.build.mockImplementationOnce(
          (snapshot, production, intent) =>
            pause(build(snapshot, production, intent))
        );
        operation = () => f.flow.build(false);
      } else if (edge === "build-deployment" || edge === "review-deployment") {
        if (edge === "review-deployment") {
          await f.flow.build(false);
        }
        const id = f.flow.state().preview?.id;
        const deployment = f.provider.deployment.getMockImplementation();
        if (!deployment) {
          throw new Error("Missing deployment fixture");
        }
        f.provider.deployment.mockImplementationOnce((target) =>
          pause(deployment(target))
        );
        operation =
          edge === "build-deployment"
            ? () => f.flow.build(false)
            : () => f.flow.review(id);
      } else if (edge === "promote-response" || edge === "rollback-response") {
        await f.candidate();
        if (edge === "rollback-response") {
          await f.flow.publish();
        }
        const mutation =
          edge === "promote-response"
            ? f.provider.promote
            : f.provider.rollback;
        mutation.mockImplementationOnce((target) => {
          f.setLive(target);
          return pause(undefined);
        });
        operation =
          edge === "promote-response"
            ? () => f.flow.publish()
            : () => f.flow.rollback();
      } else {
        if (edge === "reconcile-build") {
          const build = f.provider.build.getMockImplementation();
          if (!build) {
            throw new Error("Missing build fixture");
          }
          f.provider.build.mockImplementationOnce(
            async (snapshot, production, intent) => {
              await build(snapshot, production, intent);
              throw new Error("Lost response");
            }
          );
          await expect(f.flow.build(false)).rejects.toThrow("Lost response");
        } else {
          await f.candidate();
          if (edge === "reconcile-rollback") {
            await f.flow.publish();
          }
          const mutation =
            edge === "reconcile-promote"
              ? f.provider.promote
              : f.provider.rollback;
          mutation.mockImplementationOnce((target) => {
            f.setLive(target);
            throw new Error("Lost response");
          });
          await expect(
            edge === "reconcile-promote" ? f.flow.publish() : f.flow.rollback()
          ).rejects.toThrow("Lost response");
        }
        if (edge === "reconcile-promote") {
          f.provider.project.mockImplementationOnce(() =>
            pause({
              id: link.projectId,
              targets: { production: { id: f.live() } },
            })
          );
        } else {
          const deployment = f.provider.deployment.getMockImplementation();
          if (!deployment) {
            throw new Error("Missing deployment fixture");
          }
          f.provider.deployment.mockImplementationOnce((target) =>
            pause(deployment(target))
          );
        }
        operation = () => f.flow.reconcile();
      }
      const running = operation();
      await entered.promise;
      const journal = path.join(directory, ".vercel/weblab-release.json");
      const before = fs.existsSync(journal)
        ? fs.readFileSync(journal, "utf8")
        : null;
      const calls = {
        build: f.provider.build.mock.calls.length,
        deployment: f.provider.deployment.mock.calls.length,
        promote: f.provider.promote.mock.calls.length,
        rollback: f.provider.rollback.mock.calls.length,
      };
      const moved = `${directory}-moved`;
      fs.renameSync(directory, moved);
      movedRoots.push(moved);
      if (replace) {
        fs.cpSync(moved, directory, { recursive: true });
      }
      waiting.resolve();
      await expect(running).rejects.toThrow();
      await expect(operation()).rejects.toThrow();
      for (const destination of replace ? [directory, moved] : [moved]) {
        const file = path.join(destination, ".vercel/weblab-release.json");
        expect(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null).toBe(
          before
        );
      }
      if (!["build-project", "review-deployment"].includes(edge)) {
        expect(before && JSON.parse(before).pending).toBeTruthy();
      }
      expect(f.provider.build).toHaveBeenCalledTimes(calls.build);
      expect(f.provider.promote).toHaveBeenCalledTimes(calls.promote);
      expect(f.provider.rollback).toHaveBeenCalledTimes(calls.rollback);
      expect(f.provider.deployment).toHaveBeenCalledTimes(calls.deployment);
      for (const snapshot of f.snapshots) {
        expect(fs.existsSync(snapshot)).toBe(false);
      }
    });
  }
}
