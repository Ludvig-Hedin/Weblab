/** biome-ignore-all lint/suspicious/noEmptyBlockStatements: the Electron and DOM fakes below are intentional no-op stubs. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { expect, test } from "vitest";

const preloadDir = path.dirname(fileURLToPath(import.meta.url));

for (const preload of ["preload.js", "editor-preload.js"]) {
  test(`${preload} sends Finder folders to main without intercepting images`, () => {
    const listeners = new Map<string, (event: unknown) => void>();
    const calls: [string, string][] = [];
    const electron = {
      contextBridge: { exposeInMainWorld() {} },
      ipcRenderer: {
        invoke: (channel: string, folder: string) => {
          calls.push([channel, folder]);
          return Promise.resolve();
        },
        on() {},
        removeListener() {},
      },
      webUtils: { getPathForFile: () => "/site-a" },
    };
    const source = fs.readFileSync(path.join(preloadDir, preload), "utf8");
    vm.runInNewContext(source, {
      document: {
        addEventListener: (name: string, listener: (event: unknown) => void) =>
          listeners.set(name, listener),
      },
      require: (name: string) => {
        if (name !== "electron") {
          throw new Error(`Sandboxed preload cannot load ${name}`);
        }
        return electron;
      },
    });
    let prevented = false;
    const drop = (item: { kind: string; type: string; isDirectory: boolean }) =>
      listeners.get("drop")?.({
        dataTransfer: {
          items: [
            {
              getAsFile: () => ({}),
              kind: item.kind,
              type: item.type,
              webkitGetAsEntry: () => ({ isDirectory: item.isDirectory }),
            },
          ],
        },
        preventDefault: () => {
          prevented = true;
        },
        stopImmediatePropagation() {},
      });

    drop({ isDirectory: false, kind: "file", type: "image/png" });
    expect(calls).toEqual([]);
    expect(prevented).toBe(false);
    drop({ isDirectory: true, kind: "file", type: "" });
    expect(calls).toEqual([["sites:dropFolder", "/site-a"]]);
    expect(prevented).toBe(true);
  });
}
