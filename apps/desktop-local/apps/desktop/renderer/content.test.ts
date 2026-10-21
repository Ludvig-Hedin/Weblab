import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createContext, runInContext } from "node:vm";
import { afterEach, expect, test } from "vitest";

const requireOverlay = createRequire(
  new URL("../../../packages/overlay/package.json", import.meta.url)
);
const { Window } = requireOverlay("happy-dom");
const source = readFileSync(new URL("./content.js", import.meta.url), "utf8");
const windows: InstanceType<typeof Window>[] = [];
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  for (const window of windows.splice(0)) {
    window.happyDOM.abort();
  }
});

interface Binding {
  documentId: string;
  path: string;
}
type Field = Binding & { value: string };

function setup(
  fields: Field[] = [{ documentId: "home", path: "title", value: "Hello" }]
) {
  const window = new Window();
  windows.push(window);
  const { document } = window;
  document.body.innerHTML =
    '<header><button id="back">Back</button><div class="topbar-right"></div><button id="publish">Publish</button></header><section data-screen="editor"></section>';
  const freeze: boolean[] = [];
  const saves: (Binding & { revision: number; value: string })[] = [];
  const history: { direction: string; revision: number }[] = [];
  let selected: (binding: Binding) => void = () => undefined;
  let revision = 1;
  let failure = "";
  let configured = true;
  const values = fields.map((field) => ({ ...field }));
  let previous = "";
  let next = "";
  const content = {
    onSelect: (cb: typeof selected) => {
      selected = cb;
    },
    prepare: () => {
      configured = true;
      return Promise.resolve({ ok: true });
    },
    read: (binding: Binding) => ({
      ok: true,
      revision,
      value: values.find((field) => field.path === binding.path)?.value,
    }),
    redo: (version: number) => {
      history.push({ direction: "redo", revision: version });
      values[0].value = next;
      next = "";
      revision += 1;
      return Promise.resolve({ ok: true, revision });
    },
    save: (input: Binding & { revision: number; value: string }) => {
      saves.push(input);
      if (failure) {
        return Promise.resolve({ message: failure, ok: false });
      }
      previous = values[0].value;
      values[0].value = input.value;
      revision += 1;
      return Promise.resolve({ ok: true, revision });
    },
    status: () => ({
      canRedo: Boolean(next),
      canUndo: revision > 1,
      configured,
      fields: values,
      ok: true,
      revision,
    }),
    undo: (version: number) => {
      history.push({ direction: "undo", revision: version });
      next = values[0].value;
      values[0].value = previous;
      revision += 1;
      return Promise.resolve({ ok: true, revision });
    },
  };
  window.weblab = {
    content,
    publish: {
      freeze: (value: boolean) => {
        freeze.push(value);
        return Promise.resolve(null);
      },
    },
  };
  const context = createContext({
    currentSite: { id: "site-a" },
    document,
    MutationObserver: window.MutationObserver,
    window,
  });
  runInContext(source, context);
  const click = (text: string) => {
    const target = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === text
    );
    if (!target) {
      throw new Error(`Button not found: ${text}`);
    }
    target.click();
  };
  const type = (value: string) => {
    const textarea = document.querySelector("textarea");
    if (!textarea) {
      throw new Error("Text field not found");
    }
    textarea.value = value;
    textarea.dispatchEvent(new window.Event("input"));
  };
  return {
    click,
    content,
    document,
    fail: (message: string) => {
      failure = message;
    },
    freeze,
    history,
    saves,
    select: (binding = fields[0]) => selected(binding),
    type,
    unconfigured: () => {
      configured = false;
    },
    window,
  };
}

test("opens selected text, saves full text with its revision, and supports saved undo/redo", async () => {
  const app = setup();
  app.select();
  await flush();
  expect(app.document.querySelector("textarea").value).toBe("Hello");
  app.type("Full new text\nSecond line");
  app.click("Save draft");
  await flush();
  expect(app.saves).toEqual([
    {
      documentId: "home",
      path: "title",
      revision: 1,
      value: "Full new text\nSecond line",
    },
  ]);
  expect(app.document.body.textContent).toContain("Draft saved on this Mac");
  app.click("Undo text");
  await flush();
  expect(app.document.querySelector("textarea").value).toBe("Hello");
  app.click("Redo text");
  await flush();
  expect(app.document.querySelector("textarea").value).toBe(
    "Full new text\nSecond line"
  );
  expect(app.history).toEqual([
    { direction: "undo", revision: 2 },
    { direction: "redo", revision: 3 },
  ]);
});

test("keeps unsaved text until explicit discard and restores focus after close", async () => {
  const app = setup();
  app.document.querySelector("#content-button").focus();
  app.select();
  await flush();
  app.type("Keep me");
  app.click("Close");
  expect(app.document.querySelector("#content-panel").hidden).toBe(false);
  expect(app.document.querySelector("textarea").value).toBe("Keep me");
  app.click("Keep editing");
  expect(app.document.querySelector("textarea").value).toBe("Keep me");
  app.click("Close");
  app.click("Discard text");
  expect(app.document.querySelector("#content-panel").hidden).toBe(true);
  expect(app.document.activeElement.id).toBe("content-button");
  expect(app.freeze).toEqual([true, false]);
});

test("guards selection and top-bar navigation while text is unsaved", async () => {
  const app = setup([
    { documentId: "home", path: "title", value: "First" },
    { documentId: "home", path: "subtitle", value: "Second" },
  ]);
  let published = 0;
  app.document.querySelector("#publish").addEventListener("click", () => {
    published += 1;
  });
  app.select();
  await flush();
  app.type("Keep me");
  app.select({ documentId: "home", path: "subtitle", value: "Second" });
  expect(app.document.querySelector("textarea").value).toBe("Keep me");
  app.click("Keep editing");
  app.click("Publish");
  expect(published).toBe(0);
  app.click("Discard text");
  expect(published).toBe(1);
  expect(app.document.querySelector("#content-panel").hidden).toBe(true);
});

test("keeps input after a revision conflict and shows the native error", async () => {
  const app = setup();
  app.select();
  await flush();
  app.type("Do not lose this");
  app.fail("Another edit changed this field. Reload it first.");
  app.click("Save draft");
  await flush();
  expect(app.document.querySelector("textarea").value).toBe("Do not lose this");
  expect(app.document.querySelector('[role="alert"]').textContent).toContain(
    "Another edit"
  );
});

test("refuses to take freeze from another publish panel", async () => {
  const app = setup();
  const other = app.document.createElement("section");
  other.className = "pub-panel";
  app.document.body.append(other);
  app.click("Content");
  await flush();
  expect(app.freeze).toEqual([]);
  expect(app.document.querySelector("#content-panel").hidden).toBe(true);
  expect(app.document.body.textContent).toContain(
    "Close the other panel first"
  );
});

test("caps the field list, searches values, and renders content as plain text", async () => {
  const fields = Array.from({ length: 150 }, (_, index) => ({
    documentId: "home",
    path: `field${index}`,
    value: index === 149 ? '<img src=x onerror="bad()">' : `Text ${index}`,
  }));
  const app = setup(fields);
  app.click("Content");
  await flush();
  expect(app.document.querySelectorAll(".pub-mi").length).toBe(100);
  const search = app.document.querySelector('input[type="search"]');
  search.value = "onerror";
  search.dispatchEvent(new app.window.Event("input"));
  expect(app.document.querySelectorAll(".pub-mi").length).toBe(1);
  expect(app.document.querySelector("#content-panel img")).toBeNull();
  expect(app.document.querySelector(".pub-mi-main > span").textContent).toBe(
    '<img src=x onerror="bad()">'
  );
});

test("prepares content only on request and returns to field selection", async () => {
  const app = setup();
  app.unconfigured();
  app.click("Content");
  await flush();
  app.click("Prepare text editing");
  await flush();
  expect(app.document.querySelectorAll(".pub-mi").length).toBe(1);
  expect(app.document.body.textContent).toContain("Text editing is ready");
});

function publishing(app: ReturnType<typeof setup>) {
  const { status } = app.content;
  const calls = {
    connect: [] as string[],
    publish: [] as string[],
    reconcile: 0,
    replaceConnection: [] as string[],
    restore: 0,
    review: 0,
  };
  const state = {
    canRestore: false,
    connected: true,
    dirtyCount: 1,
    pending: false,
  };
  Object.assign(app.content, {
    connect: (token: string) => {
      calls.connect.push(token);
      state.connected = true;
      return { ok: true };
    },
    publish: (id: string) => {
      calls.publish.push(id);
      state.dirtyCount = 0;
      state.canRestore = true;
      return { ok: true };
    },
    reconcile: () => {
      calls.reconcile += 1;
      state.pending = false;
      return { ok: true };
    },
    replaceConnection: (token: string) => {
      calls.replaceConnection.push(token);
      return { ok: true };
    },
    restore: () => {
      calls.restore += 1;
      state.dirtyCount = 1;
      return { ok: true };
    },
    review: () => {
      calls.review += 1;
      return {
        ok: true,
        review: {
          changes: [
            {
              after: "<script>doNotRun()</script>\nAfter",
              before: "Before\n  exact",
              documentId: "home",
              path: "title",
            },
          ],
          id: "review-1",
        },
      };
    },
    status: () => ({
      ...status(),
      connected: state.connected,
      dirtyCount: state.dirtyCount,
      publishing: {
        canRestore: state.canRestore,
        pending: state.pending,
        review: null,
      },
    }),
  });
  return { calls, state };
}

test("requires an explicit review and live publish click; renders exact before and after as text", async () => {
  const app = setup();
  const publish = publishing(app);
  app.click("Content");
  await flush();
  expect(publish.calls.publish).toEqual([]);
  expect(
    [...app.document.querySelectorAll("button")].some(
      (button) => button.textContent === "Publish text changes live"
    )
  ).toBe(false);
  app.click("Review text changes");
  await flush();
  expect(publish.calls.review).toBe(1);
  expect(publish.calls.publish).toEqual([]);
  expect(
    [...app.document.querySelectorAll("pre")].map(
      (element) => element.textContent
    )
  ).toEqual(["Before\n  exact", "<script>doNotRun()</script>\nAfter"]);
  expect(app.document.querySelector("#content-panel script")).toBeNull();
  app.click("Publish text changes live");
  await flush();
  expect(publish.calls.publish).toEqual(["review-1"]);
  expect(app.document.body.textContent).toContain("published to Sanity");
  expect(app.document.body.textContent).toContain("60 seconds");
});

test("clears the write token on submit and keeps unsaved text during connection", async () => {
  const app = setup();
  const publish = publishing(app);
  publish.state.connected = false;
  app.select();
  await flush();
  app.type("Keep my unsaved words");
  const password = app.document.querySelector('input[type="password"]');
  expect(password).not.toBeNull();
  password.value = "fake-test-token";
  app.click("Connect text publishing");
  expect(password.value).toBe("");
  await flush();
  expect(publish.calls.connect).toEqual(["fake-test-token"]);
  expect(app.document.body.textContent).not.toContain("fake-test-token");
  expect(app.document.querySelector("textarea").value).toBe(
    "Keep my unsaved words"
  );
  expect(publish.calls.publish).toEqual([]);
});

test("shows a safe connection error without echoing tokens or dropping draft input", async () => {
  const app = setup();
  const publish = publishing(app);
  publish.state.connected = false;
  Object.assign(app.content, {
    connect: () => {
      throw new Error("upstream echoed fake-private-token");
    },
  });
  app.select();
  await flush();
  app.type("Unsaved text");
  app.document.querySelector('input[type="password"]').value =
    "fake-private-token";
  app.click("Connect text publishing");
  await flush();
  expect(app.document.querySelector("textarea").value).toBe("Unsaved text");
  expect(app.document.querySelector('input[type="password"]').value).toBe("");
  expect(app.document.body.textContent).not.toContain("fake-private-token");
  expect(app.document.body.textContent).toContain("Could not connect");
});

test("replacing a connected token requires a separate explicit action and preserves unsaved text", async () => {
  const app = setup();
  const publish = publishing(app);
  app.select();
  await flush();
  app.type("Keep these unsaved words");
  app.click("Replace text connection");
  expect(publish.calls.replaceConnection).toEqual([]);
  expect(app.document.body.textContent).toContain("same project and dataset");
  let password = app.document.querySelector('input[type="password"]');
  password.value = "not-submitted";
  app.click("Keep current connection");
  expect(password.value).toBe("");
  expect(publish.calls.replaceConnection).toEqual([]);
  app.click("Replace text connection");
  password = app.document.querySelector('input[type="password"]');
  password.value = "replacement-test-token";
  app.click("Replace connection");
  expect(password.value).toBe("");
  await flush();
  expect(publish.calls.replaceConnection).toEqual(["replacement-test-token"]);
  expect(publish.calls.connect).toEqual([]);
  expect(publish.calls.publish).toEqual([]);
  expect(app.document.querySelector("textarea").value).toBe(
    "Keep these unsaved words"
  );
  expect(app.document.body.textContent).not.toContain("replacement-test-token");
});

test("failed replacement remains retryable without echoing the new token", async () => {
  const app = setup();
  publishing(app);
  Object.assign(app.content, {
    replaceConnection: () => {
      throw new Error("secret replacement-test-token");
    },
  });
  app.click("Content");
  await flush();
  app.click("Replace text connection");
  app.document.querySelector('input[type="password"]').value =
    "replacement-test-token";
  app.click("Replace connection");
  await flush();
  expect(app.document.querySelector('input[type="password"]').value).toBe("");
  expect(app.document.body.textContent).not.toContain("replacement-test-token");
  expect(app.document.body.textContent).toContain("Could not connect");
  expect(app.document.body.textContent).toContain("Keep current connection");
});

test("closing replacement clears the input and never changes a pending publication", async () => {
  const app = setup();
  const publish = publishing(app);
  publish.state.pending = true;
  app.click("Content");
  await flush();
  app.click("Replace text connection");
  const password = app.document.querySelector('input[type="password"]');
  password.value = "unsubmitted-test-token";
  app.click("Content");
  expect(password.value).toBe("");
  expect(publish.calls.replaceConnection).toEqual([]);
  expect(publish.calls.publish).toEqual([]);
  expect(publish.state.pending).toBe(true);
});

test("invalidates reviewed changes on typing and keeps review blocked until local save", async () => {
  const app = setup();
  const publish = publishing(app);
  app.select();
  await flush();
  app.click("Review text changes");
  await flush();
  app.type("New unsaved text");
  expect(app.document.querySelector("textarea").value).toBe("New unsaved text");
  expect(
    [...app.document.querySelectorAll("button")].some(
      (button) => button.textContent === "Publish text changes live"
    )
  ).toBe(false);
  const review = [...app.document.querySelectorAll("button")].find(
    (button) => button.textContent === "Review text changes"
  );
  expect(review.disabled).toBe(true);
  expect(publish.calls.publish).toEqual([]);
});

test("checks uncertain publication without retrying the publish and restores only a draft", async () => {
  const app = setup();
  const publish = publishing(app);
  publish.state.pending = true;
  publish.state.canRestore = true;
  app.click("Content");
  await flush();
  app.click("Check publish status");
  await flush();
  expect(publish.calls.reconcile).toBe(1);
  expect(publish.calls.publish).toEqual([]);
  app.click("Restore published text as draft");
  await flush();
  expect(publish.calls.restore).toBe(1);
  expect(publish.calls.publish).toEqual([]);
  expect(app.document.body.textContent).toContain(
    "Earlier text is now a local draft"
  );
});

test("failed publish refreshes pending status and cannot submit the same review again", async () => {
  const app = setup();
  const publish = publishing(app);
  Object.assign(app.content, {
    publish: () => {
      publish.state.pending = true;
      return { message: "The request outcome is unknown.", ok: false };
    },
  });
  app.click("Content");
  await flush();
  app.click("Review text changes");
  await flush();
  app.click("Publish text changes live");
  await flush();
  expect(app.document.body.textContent).toContain("outcome is unknown");
  expect(
    [...app.document.querySelectorAll("button")].some(
      (button) => button.textContent === "Check publish status"
    )
  ).toBe(true);
  expect(
    [...app.document.querySelectorAll("button")].some(
      (button) => button.textContent === "Publish text changes live"
    )
  ).toBe(false);
});

test("uses plain field names and keeps full keyed paths in details", async () => {
  const app = setup([
    {
      documentId: "home",
      path: 'sections[_key=="hero"].titleSmall',
      value: "Phone title",
    },
  ]);
  app.click("Content");
  await flush();
  expect(app.document.querySelector(".pub-mi b").textContent).toBe(
    "Phone heading"
  );
  app.select();
  await flush();
  expect(app.document.querySelector("#content-panel h3").textContent).toBe(
    "Phone heading"
  );
  const details = app.document.querySelector("details");
  expect(details.open).toBe(false);
  expect(details.textContent).toContain('sections[_key=="hero"].titleSmall');
  expect(details.textContent).toContain("home");
});

test("shows page title instead of UUID and searches its fields by title, ID and path", async () => {
  const id = "58855781-9caf-432b-978d-f37ced246161";
  const target = {
    documentId: id,
    path: 'sections[_key=="hero"].description',
    value: "Body copy",
  };
  const app = setup([
    target,
    { documentId: id, path: "seo.title", value: "Search title" },
    { documentId: id, path: "title", value: "<b>About Example</b>" },
  ]);
  app.click("Content");
  await flush();
  expect(app.document.querySelector(".pub-mi .pub-faint").textContent).toBe(
    "<b>About Example</b>"
  );
  expect(app.document.querySelector(".pub-menu").textContent).not.toContain(id);
  const search = app.document.querySelector('input[type="search"]');
  for (const query of ["About Example", id, 'sections[_key=="hero"]']) {
    search.value = query;
    search.dispatchEvent(new app.window.Event("input"));
    expect(app.document.querySelector(".pub-menu").textContent).toContain(
      "Body copy"
    );
  }
  app.select(target);
  await flush();
  const heading = app.document.querySelector("#content-panel h3");
  expect(heading.nextElementSibling.textContent).toBe("<b>About Example</b>");
  expect(heading.nextElementSibling.querySelector("b")).toBeNull();
  const details = app.document.querySelector("details");
  expect(details.open).toBe(false);
  expect(details.textContent).toContain(id);
  expect(details.textContent).toContain(target.path);
});

test("uses SEO title then readable ID or generic page text as fallbacks", async () => {
  const id = "58855781-9caf-432b-978d-f37ced246161";
  const fields = [
    { documentId: id, path: "description", value: "UUID page" },
    { documentId: "other-page", path: "description", value: "Readable page" },
    { documentId: "siteContent", path: "description", value: "Site copy" },
    { documentId: "third-page", path: "description", value: "SEO page" },
    { documentId: "third-page", path: "title", value: "  " },
    { documentId: "third-page", path: "seo.title", value: "SEO context" },
  ];
  const app = setup(fields);
  app.click("Content");
  await flush();
  const labels = [...app.document.querySelectorAll(".pub-mi .pub-faint")].map(
    (label) => label.textContent
  );
  expect(labels.slice(0, 4)).toEqual([
    "Page text",
    "Other page",
    "Site Content",
    "SEO context",
  ]);
});

test("offers refresh for a clean copy, but not while draft input is unsaved", async () => {
  const app = setup();
  const publish = publishing(app);
  publish.state.dirtyCount = 0;
  let prepared = 0;
  Object.assign(app.content, {
    prepare: () => {
      prepared += 1;
      return { ok: true };
    },
  });
  app.select();
  await flush();
  app.type("Keep pending input");
  const refresh = [...app.document.querySelectorAll("button")].find(
    (button) => button.textContent === "Refresh text copy"
  );
  // Publication state changes on typing must not leave an enabled refresh.
  expect(refresh.disabled).toBe(true);
  refresh.click();
  await flush();
  expect(prepared).toBe(0);
  expect(app.document.querySelector("textarea").value).toBe(
    "Keep pending input"
  );
  app.type("Hello");
  app.click("Refresh text copy");
  await flush();
  expect(prepared).toBe(1);
});

test("pauses field writes and undo while publish status is uncertain", async () => {
  const app = setup();
  const publish = publishing(app);
  publish.state.pending = true;
  app.select();
  await flush();
  expect(app.document.querySelector("textarea").disabled).toBe(true);
  for (const text of ["Save draft", "Undo text", "Redo text"]) {
    expect(
      [...app.document.querySelectorAll("button")].find(
        (button) => button.textContent === text
      ).disabled
    ).toBe(true);
  }
  expect(app.document.body.textContent).toContain("Saving and undo are paused");
  app.document.dispatchEvent(
    new app.window.KeyboardEvent("keydown", {
      bubbles: true,
      key: "s",
      metaKey: true,
    })
  );
  expect(app.saves).toEqual([]);
  app.click("Check publish status");
  await flush();
  expect(publish.calls.reconcile).toBe(1);
  expect(app.document.querySelector("textarea").disabled).toBe(false);
});
