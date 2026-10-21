import { afterEach, expect, test, vi } from "vitest";
import { InlineContentEditor } from "./inline-content";
import { contentBinding } from "./local-content";
import { encodeStega } from "./stega";

vi.mock("../toast", () => ({ toast: vi.fn() }));
const binding = { documentId: "home", path: 'sections[_key=="hero"].title' };
const marker = (field = binding) =>
  encodeStega({ origin: "sanity.io", weblab: field });
const editors: InlineContentEditor[] = [];
function fixture(value = "Original title", tagName = "h1") {
  let ended: ((event: { editId: string }) => void) | undefined;
  const native = {
    abandonInline: vi.fn(async (_id: string) => ({ ok: true })),
    beginInline: vi.fn(async (_field: typeof binding) => ({
      editId: "edit1",
      ok: true,
      revision: 3,
      value,
    })),
    onInlineEnd: vi.fn((callback: (event: { editId: string }) => void) => {
      ended = callback;
      return vi.fn();
    }),
    stageInline: vi.fn(async (_edit: { editId: string; value: string }) => ({
      ok: true,
    })),
  };
  Object.assign(window, { weblabHost: { content: native } });
  const owner = vi.fn();
  const editor = new InlineContentEditor({ setTextOwner: owner });
  editors.push(editor);
  const node = document.createElement(tagName);
  node.textContent = value + marker();
  document.body.append(node);
  const input = (text: string) => {
    node.textContent = text;
    node.dispatchEvent(new Event("input"));
  };
  return {
    editor,
    end: (editId = "edit1") => ended?.({ editId }),
    input,
    native,
    node,
    owner,
  };
}
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.dispose();
  }
  document.body.replaceChildren();
  Reflect.deleteProperty(window, "weblabHost");
  vi.clearAllMocks();
});

test("reads the field, stages each input immediately and leaves persistence to native", async () => {
  const f = fixture();
  const originalNode = f.node.firstChild;
  expect(f.editor.begin(f.node, null)).toBe(true);
  await flush();
  expect(f.native.beginInline).toHaveBeenCalledWith(binding);
  expect(f.node.textContent).toBe("Original title");
  expect(f.editor.active).toBe(true);
  expect(f.owner).toHaveBeenLastCalledWith(f.node);
  f.input("First edit");
  f.input("Final edit");
  expect(f.native.stageInline.mock.calls.map(([edit]) => edit.value)).toEqual([
    "First edit",
    "Final edit",
  ]);
  f.node.blur();
  await flush();
  expect(f.editor.active).toBe(false);
  expect(f.node.textContent).toBe("Final edit");
  expect(f.owner).toHaveBeenLastCalledWith(null);
  f.end();
  expect(f.node.firstChild).toBe(originalNode);
  expect(f.node.textContent).toBe(`Original title${marker()}`);
  expect(f.node.hasAttribute("contenteditable")).toBe(false);
});

test("split text restores the exact original children and their listeners", async () => {
  const f = fixture("First second");
  const first = document.createElement("span");
  first.className = "split-word";
  first.textContent = "First";
  const second = document.createElement("span");
  second.className = "split-word";
  second.textContent = `second${marker()}`;
  const listener = vi.fn();
  first.addEventListener("click", listener);
  f.node.replaceChildren(first, document.createTextNode(" "), second);
  const children = Array.from(f.node.childNodes);
  expect(f.editor.begin(first, null)).toBe(true);
  await flush();
  expect(f.node.childNodes).toHaveLength(1);
  f.input("Changed heading");
  f.end();
  expect(Array.from(f.node.childNodes)).toEqual(children);
  first.click();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(f.node.textContent).toBe(`First second${marker()}`);
});

test("dirty text blocks another field but can be resumed without losing input", async () => {
  const f = fixture();
  f.editor.begin(f.node, null);
  await flush();
  f.input("Keep me");
  f.editor.finish();
  const other = document.createElement("p");
  other.textContent = `Other${marker({ ...binding, path: "description" })}`;
  document.body.append(other);
  expect(f.editor.begin(other, null)).toBe(true);
  expect(f.native.beginInline).toHaveBeenCalledTimes(1);
  expect(f.node.textContent).toBe("Keep me");
  expect(f.editor.begin(f.node, null)).toBe(true);
  expect(f.editor.active).toBe(true);
  expect(f.node.textContent).toBe("Keep me");
  f.end("unrelated");
  expect(f.editor.active).toBe(true);
  f.end();
  expect(f.editor.active).toBe(false);
});

test("an empty proposal can be resumed after blur and corrected", async () => {
  const f = fixture();
  const originalNode = f.node.firstChild;
  f.editor.begin(f.node, null);
  await flush();
  f.input("");
  f.node.blur();
  expect(f.editor.active).toBe(false);
  expect(f.node.textContent).toBe("");
  expect(f.native.stageInline).toHaveBeenLastCalledWith({
    editId: "edit1",
    value: "",
  });
  expect(f.editor.begin(f.node, null)).toBe(true);
  expect(f.editor.active).toBe(true);
  expect(f.node.childNodes).toHaveLength(1);
  expect(f.node.textContent).toBe("");
  f.input("Corrected title");
  expect(f.native.beginInline).toHaveBeenCalledTimes(1);
  expect(f.native.stageInline).toHaveBeenLastCalledWith({
    editId: "edit1",
    value: "Corrected title",
  });
  f.end();
  expect(f.node.firstChild).toBe(originalNode);
});

test.each(["blur", "escape", "finish"] as const)(
  "a browser placeholder stays empty after %s and its BR target reopens the field",
  async (exit) => {
    const f = fixture();
    const originalNode = f.node.firstChild;
    f.editor.begin(f.node, null);
    await flush();
    const placeholder = document.createElement("br");
    f.node.replaceChildren(document.createTextNode(""), placeholder);
    f.node.dispatchEvent(new Event("input"));
    if (exit === "blur") {
      f.node.blur();
    } else if (exit === "escape") {
      f.node.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })
      );
    } else {
      f.editor.finish();
    }
    expect(f.editor.active).toBe(false);
    expect(f.native.stageInline.mock.calls.map(([edit]) => edit.value)).toEqual(
      [""]
    );
    expect(f.node.style.minHeight).not.toBe("");
    expect(f.editor.begin(placeholder, null)).toBe(true);
    expect(f.editor.active).toBe(true);
    expect(f.node.textContent).toBe("");
    f.input("Corrected title");
    f.editor.finish();
    expect(f.native.stageInline.mock.calls.map(([edit]) => edit.value)).toEqual(
      ["", "Corrected title"]
    );
    expect(f.native.beginInline).toHaveBeenCalledTimes(1);
    f.end();
    expect(f.node.firstChild).toBe(originalNode);
  }
);

test.each([
  ["<br><br>", "\n\n"],
  ["\n", "\n"],
  ["Text<br>", "Text\n"],
  ["\n<br>", "\n\n"],
])("preserves intentional line breaks in %j", async (html, value) => {
  const f = fixture();
  f.editor.begin(f.node, null);
  await flush();
  f.node.innerHTML = html;
  f.node.dispatchEvent(new Event("input"));
  f.editor.finish();
  expect(f.native.stageInline.mock.calls.map(([edit]) => edit.value)).toEqual([
    value,
  ]);
});

test("a marked empty known field opens and preserves its original marker", async () => {
  const f = fixture("");
  const originalNode = f.node.firstChild;
  expect(f.editor.begin(f.node, null)).toBe(true);
  await flush();
  expect(f.native.beginInline).toHaveBeenCalledWith(binding);
  expect(f.editor.active).toBe(true);
  expect(f.node.textContent).toBe("");
  expect(f.owner).toHaveBeenLastCalledWith(f.node);
  f.input("New title");
  expect(f.native.stageInline).toHaveBeenLastCalledWith({
    editId: "edit1",
    value: "New title",
  });
  f.end();
  expect(f.node.firstChild).toBe(originalNode);
  expect(contentBinding(f.node.textContent ?? "")).toEqual(binding);
});

test.each(["fill", "end", "dispose"] as const)(
  "an empty inline field retains a hit area after blur and restores styles on %s",
  async (finish) => {
    const f = fixture("Original title", "span");
    f.node.style.setProperty("display", "inline", "important");
    f.node.style.setProperty("min-height", "7px", "important");
    f.node.style.setProperty("min-width", "3px");
    f.node.style.setProperty("line-height", "24px");
    f.node.style.setProperty("outline-width", "2px", "important");
    f.node.style.setProperty("outline-style", "dotted");
    f.node.style.setProperty("outline-color", "blue", "important");
    f.editor.begin(f.node, null);
    await flush();
    f.input("");
    expect(f.node.style.display).toBe("inline-block");
    expect(f.node.style.minHeight).toContain("24px");
    expect(f.node.style.minWidth).toContain("1ch");
    expect(f.node.style.outlineWidth).toBe("1px");
    expect(f.node.style.outlineStyle).toBe("dashed");
    expect(f.node.style.outlineColor.toLowerCase()).toBe("currentcolor");
    expect(f.node.style.getPropertyPriority("min-height")).toBe("important");
    const emptyStyle = f.node.getAttribute("style");
    f.node.blur();
    expect(f.node.getAttribute("style")).toBe(emptyStyle);
    f.node.style.setProperty("color", "red");
    if (finish === "fill") {
      f.editor.begin(f.node, null);
      f.input("Filled title");
    } else if (finish === "end") {
      f.end();
    } else {
      f.editor.dispose();
    }
    expect(f.node.style.display).toBe("inline");
    expect(f.node.style.getPropertyPriority("display")).toBe("important");
    expect(f.node.style.minHeight).toBe("7px");
    expect(f.node.style.getPropertyPriority("min-height")).toBe("important");
    expect(f.node.style.minWidth).toBe("3px");
    expect(f.node.style.getPropertyPriority("min-width")).toBe("");
    expect(f.node.style.color).toBe("red");
    expect(f.node.style.lineHeight).toBe("24px");
    expect(f.node.style.outlineWidth).toBe("2px");
    expect(f.node.style.getPropertyPriority("outline-width")).toBe("important");
    expect(f.node.style.outlineStyle).toBe("dotted");
    expect(f.node.style.getPropertyPriority("outline-style")).toBe("");
    expect(f.node.style.outlineColor).toBe("blue");
    expect(f.node.style.getPropertyPriority("outline-color")).toBe("important");
  }
);

test("ending an empty edit preserves newer style values and removes temporary properties", async () => {
  const f = fixture("");
  f.editor.begin(f.node, null);
  await flush();
  expect(f.node.style.minHeight).not.toBe("");
  expect(f.node.style.minWidth).not.toBe("");
  f.node.style.setProperty("min-height", "80px");
  f.node.style.setProperty("outline-color", "red");
  f.end();
  expect(f.node.style.minHeight).toBe("80px");
  expect(f.node.style.getPropertyPriority("min-height")).toBe("");
  expect(f.node.style.minWidth).toBe("");
  expect(f.node.style.display).toBe("");
  expect(f.node.style.outlineWidth).toBe("");
  expect(f.node.style.outlineStyle).toBe("");
  expect(f.node.style.outlineColor).toBe("red");
});

test("does not choose the first of different bindings or a malformed marker", () => {
  expect(
    contentBinding(
      `One${marker()}Two${marker({ ...binding, path: "description" })}`
    )
  ).toBeNull();
  expect(contentBinding(`One${marker()}Two${marker()}`)).toEqual(binding);
  expect(
    contentBinding(`One${marker()}${encodeStega({ origin: "sanity.io" })}`)
  ).toBeNull();
  const f = fixture();
  f.node.textContent += `Other${marker({ ...binding, path: "description" })}`;
  expect(f.editor.begin(f.node, null)).toBe(false);
  expect(f.native.beginInline).not.toHaveBeenCalled();
});

test("refuses component containers and preserves non-CMS behavior", () => {
  const f = fixture();
  const container = document.createElement("section");
  f.node.replaceWith(container);
  container.append(f.node);
  expect(f.editor.begin(container, null)).toBe(false);
  f.node.textContent = "Unbound text";
  expect(f.editor.begin(f.node, null)).toBe(false);
  expect(f.native.beginInline).not.toHaveBeenCalled();
});

test("an async read with mismatched visible text cannot replace the page", async () => {
  const f = fixture();
  f.native.beginInline.mockResolvedValueOnce({
    editId: "edit1",
    ok: true,
    revision: 3,
    value: "Another field",
  });
  const child = f.node.firstChild;
  f.editor.begin(f.node, null);
  await flush();
  expect(f.editor.active).toBe(false);
  expect(f.node.firstChild).toBe(child);
  expect(f.native.abandonInline).toHaveBeenCalledWith("edit1");
  expect(f.native.stageInline).not.toHaveBeenCalled();
});

test("a stale async read after finish is abandoned without changing the DOM", async () => {
  const f = fixture();
  const child = f.node.firstChild;
  f.editor.begin(f.node, null);
  f.editor.finish();
  await flush();
  expect(f.editor.active).toBe(false);
  expect(f.node.firstChild).toBe(child);
  expect(f.native.abandonInline).toHaveBeenCalledWith("edit1");
});

test("disconnect restores original detached markup and clears the text owner", async () => {
  const f = fixture();
  const child = f.node.firstChild;
  f.editor.begin(f.node, null);
  await flush();
  f.input("Keep proposal");
  f.node.remove();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(f.node.firstChild).toBe(child);
  expect(f.editor.active).toBe(false);
  expect(f.owner).toHaveBeenLastCalledWith(null);
  expect(f.native.stageInline).toHaveBeenLastCalledWith({
    editId: "edit1",
    value: "Keep proposal",
  });
});

test("commit stages text even if no input event was delivered", async () => {
  const f = fixture();
  f.editor.begin(f.node, null);
  await flush();
  f.node.textContent = "Commit fallback";
  f.editor.finish();
  expect(f.native.stageInline).toHaveBeenCalledWith({
    editId: "edit1",
    value: "Commit fallback",
  });
  expect(f.node.textContent).toBe("Commit fallback");
  f.end();
  expect(f.node.textContent).toBe(`Original title${marker()}`);
});

test("no native bridge leaves ordinary editing untouched", () => {
  Reflect.deleteProperty(window, "weblabHost");
  const editor = new InlineContentEditor({ setTextOwner: vi.fn() });
  editors.push(editor);
  const node = document.createElement("h1");
  node.textContent = `Original title${marker()}`;
  expect(editor.begin(node, null)).toBe(false);
});

test("failed staging retains visible input and finish retries the exact proposal", async () => {
  const f = fixture();
  f.editor.begin(f.node, null);
  await flush();
  f.native.stageInline.mockRejectedValueOnce(new Error("Connection lost"));
  f.input("Keep failed proposal");
  await flush();
  expect(f.node.textContent).toBe("Keep failed proposal");
  f.editor.finish();
  expect(f.native.stageInline).toHaveBeenCalledTimes(2);
  expect(f.native.stageInline).toHaveBeenLastCalledWith({
    editId: "edit1",
    value: "Keep failed proposal",
  });
  expect(f.node.textContent).toBe("Keep failed proposal");
});

test("native end never stages an extra proposal and disposal restores original nodes", async () => {
  const f = fixture();
  const child = f.node.firstChild;
  f.node.setAttribute("contenteditable", "false");
  f.editor.begin(f.node, null);
  await flush();
  f.input("Staged");
  const calls = f.native.stageInline.mock.calls.length;
  f.node.textContent = "Unsubmitted DOM change";
  f.end();
  expect(f.native.stageInline).toHaveBeenCalledTimes(calls);
  expect(f.node.firstChild).toBe(child);
  expect(f.node.getAttribute("contenteditable")).toBe("false");
  f.editor.begin(f.node, null);
  await flush();
  f.editor.dispose();
  expect(f.node.firstChild).toBe(child);
  expect(f.editor.active).toBe(false);
});

test("native field coordinates use the text node owning document", async () => {
  const f = fixture();
  const caret = vi.fn(() => ({ offset: 2, offsetNode: f.node.firstChild }));
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: caret,
  });
  try {
    f.editor.begin(f.node, { x: 25, y: 40 });
    await flush();
    expect(caret).toHaveBeenCalledWith(25, 40);
    expect(window.getSelection()?.anchorOffset).toBe(2);
  } finally {
    Reflect.deleteProperty(document, "caretPositionFromPoint");
  }
});

test("the old clean session ending during a new read does not cancel the new field", async () => {
  const f = fixture();
  f.editor.begin(f.node, null);
  await flush();
  let release: () => void = () => undefined;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.native.beginInline.mockImplementationOnce(async () => {
    await wait;
    return { editId: "edit2", ok: true, revision: 3, value: "Second title" };
  });
  const second = document.createElement("h2");
  second.textContent = `Second title${marker({ ...binding, path: "description" })}`;
  document.body.append(second);
  expect(f.editor.begin(second, null)).toBe(true);
  f.end("edit1");
  release();
  await flush();
  expect(f.editor.active).toBe(true);
  expect(f.owner).toHaveBeenLastCalledWith(second);
  expect(second.textContent).toBe("Second title");
  expect(f.node.textContent).toBe(`Original title${marker()}`);
  expect(f.native.abandonInline).not.toHaveBeenCalledWith("edit2");
});

test("an end for the new ID before its read resolves prevents reopening that edit", async () => {
  const f = fixture();
  const child = f.node.firstChild;
  let release: () => void = () => undefined;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.native.beginInline.mockImplementationOnce(async () => {
    await wait;
    return { editId: "edit2", ok: true, revision: 3, value: "Original title" };
  });
  f.editor.begin(f.node, null);
  f.end("edit2");
  release();
  await flush();
  expect(f.editor.active).toBe(false);
  expect(f.node.firstChild).toBe(child);
  expect(f.native.stageInline).not.toHaveBeenCalled();
  expect(f.owner).not.toHaveBeenCalled();
});

test("dispose during a pending read abandons its clean result and preserves child identity", async () => {
  const f = fixture();
  const child = f.node.firstChild;
  let release: () => void = () => undefined;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.native.beginInline.mockImplementationOnce(async () => {
    await wait;
    return { editId: "late", ok: true, revision: 3, value: "Original title" };
  });
  f.editor.begin(f.node, null);
  f.editor.dispose();
  release();
  await flush();
  expect(f.editor.active).toBe(false);
  expect(f.node.firstChild).toBe(child);
  expect(f.native.abandonInline).toHaveBeenCalledWith("late");
  expect(f.native.stageInline).not.toHaveBeenCalled();
});

test("a changed binding with identical text while reading cannot open the old field", async () => {
  const f = fixture();
  f.editor.begin(f.node, null);
  f.node.textContent = `Original title${marker({ ...binding, path: "description" })}`;
  const changedChild = f.node.firstChild;
  await flush();
  expect(f.editor.active).toBe(false);
  expect(f.node.firstChild).toBe(changedChild);
  expect(f.native.abandonInline).toHaveBeenCalledWith("edit1");
});
