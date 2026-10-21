// biome-ignore-all lint/correctness/noUndeclaredVariables: app.js owns currentSite in the shared classic-script scope.
// Text stays local until the user reviews and explicitly publishes it.
(() => {
  const host = window.weblab;
  const DOCUMENT_UUID =
    // biome-ignore lint/performance/useTopLevelRegex: this IIFE runs once; keep the constant private to this classic script.
    /^(?:[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}|[a-f\d]{32})$/i;
  if (!host.content) {
    return;
  }
  const editor = document.querySelector('[data-screen="editor"]');
  const state = {
    binding: null,
    busy: "",
    draft: "",
    epoch: 0,
    error: "",
    notice: "",
    open: false,
    original: "",
    pending: null,
    replacingConnection: false,
    review: null,
    revision: null,
    search: "",
    siteId: null,
    status: null,
  };
  let returnFocus = null;

  function node(tag, className = "", text = "") {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
  }
  function button(text, action, primary = false) {
    const element = node("button", `pub-btn${primary ? " primary" : ""}`, text);
    element.type = "button";
    element.addEventListener("click", action);
    return element;
  }
  function fieldLabel(path) {
    const name = path.split(".").at(-1) || "Text";
    if (name === "titleSmall") {
      return "Phone heading";
    }
    if (name === "textXl") {
      return "Large screen text";
    }
    const label = name.replace(/([a-z])([A-Z])/g, "$1 $2");
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  function documentTitles() {
    const titles = new Map();
    for (const path of ["seo.title", "title"]) {
      for (const field of state.status?.fields || []) {
        if (field.path === path && field.value.trim()) {
          titles.set(field.documentId, field.value.trim());
        }
      }
    }
    return titles;
  }
  function documentLabel(documentId, titles) {
    if (titles.has(documentId)) {
      return titles.get(documentId);
    }
    if (DOCUMENT_UUID.test(documentId)) {
      return "Page text";
    }
    const label = documentId
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[-_]/g, " ");
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  function fieldDetails(binding) {
    const details = node("details", "pub-faint");
    details.append(
      node("summary", "", "Field details"),
      node("p", "", binding.documentId),
      node("p", "", binding.path)
    );
    return details;
  }

  const trigger = button("Content", () => {
    if (state.open) {
      leave(close);
    } else {
      open();
    }
  });
  trigger.id = "content-button";
  trigger.hidden = true;
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  document.querySelector(".topbar-right")?.prepend(trigger);

  const blocked = node("span", "pub-error");
  blocked.hidden = true;
  blocked.setAttribute("role", "status");
  trigger.after(blocked);
  const layer = node("div", "pub-layer");
  layer.hidden = true;
  const still = node("img", "pub-still");
  still.alt = "";
  const scrim = node("div", "pub-scrim");
  layer.append(still, scrim);
  const panel = node("section", "pub-panel");
  panel.id = "content-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Content");
  trigger.setAttribute("aria-controls", panel.id);
  document.body.append(layer, panel);

  const inEditor = () => Boolean(editor && !editor.hidden && currentSite);
  const unsaved = () =>
    Boolean(state.binding && state.draft !== state.original);
  const current = (epoch) =>
    state.open && state.epoch === epoch && currentSite?.id === state.siteId;
  const otherPanel = () =>
    [...document.querySelectorAll(".pub-panel:not([hidden])")].some(
      (item) => item !== panel
    );

  function place() {
    const box = trigger.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(box.right - 380, window.innerWidth - 388))}px`;
  }

  function close() {
    if (!state.open) {
      return;
    }
    state.open = false;
    state.epoch += 1;
    state.pending = null;
    state.busy = "";
    const password = panel.querySelector('input[type="password"]');
    if (password) {
      password.value = "";
    }
    panel.hidden = true;
    layer.hidden = true;
    still.removeAttribute("src");
    trigger.setAttribute("aria-expanded", "false");
    if (inEditor() && !otherPanel()) {
      host.publish.freeze(false).catch(() => undefined);
    }
    if (returnFocus?.isConnected && !returnFocus.hidden) {
      returnFocus.focus();
    }
  }

  function leave(action) {
    if (state.busy) {
      return;
    }
    if (unsaved()) {
      state.pending = action;
      render();
      panel.querySelector('[data-focus="keep"]')?.focus();
      return;
    }
    action();
  }

  function checked(result) {
    if (!result || result.ok === false) {
      throw new Error(result?.message || "This action failed. Try again.");
    }
    return result;
  }

  async function readField(binding, epoch) {
    const result = checked(await host.content.read(binding));
    if (!current(epoch)) {
      return;
    }
    if (typeof result.value !== "string") {
      throw new Error("This field is not plain text.");
    }
    state.binding = { documentId: binding.documentId, path: binding.path };
    state.draft = result.value;
    state.original = result.value;
    state.revision = result.revision;
  }

  async function run(label, action) {
    if (state.busy) {
      return;
    }
    const { epoch } = state;
    state.busy = label;
    state.error = "";
    state.notice = "";
    render();
    try {
      await action(epoch);
    } catch (error) {
      if (current(epoch)) {
        state.error = error.message || "This action failed. Try again.";
      }
    } finally {
      if (current(epoch)) {
        state.busy = "";
        render();
      }
    }
  }

  async function refresh(epoch, binding) {
    const status = checked(await host.content.status());
    if (!current(epoch)) {
      return;
    }
    state.status = status;
    if (!unsaved()) {
      state.revision = status.revision;
    }
    if (binding && status.configured) {
      await readField(binding, epoch);
    }
  }

  async function open(binding = null) {
    if (!inEditor()) {
      return;
    }
    if (state.open) {
      if (binding) {
        leave(() => select(binding));
      }
      return;
    }
    if (otherPanel()) {
      blocked.textContent = "Close the other panel first.";
      blocked.hidden = false;
      trigger.focus();
      return;
    }
    blocked.hidden = true;
    returnFocus = document.activeElement?.matches("button, input, textarea, a")
      ? document.activeElement
      : trigger;
    Object.assign(state, {
      binding: null,
      draft: "",
      error: "",
      notice: "",
      open: true,
      original: "",
      pending: null,
      replacingConnection: false,
      review: null,
      search: "",
      siteId: currentSite.id,
      status: null,
    });
    state.epoch += 1;
    const { epoch } = state;
    trigger.setAttribute("aria-expanded", "true");
    await run("Opening content…", async () => {
      let picture;
      try {
        picture = await host.publish.freeze(true);
      } catch {
        close();
        blocked.textContent = "The content panel could not open. Try again.";
        blocked.hidden = false;
        return;
      }
      if (!current(epoch)) {
        if (inEditor() && !otherPanel()) {
          await host.publish.freeze(false);
        }
        return;
      }
      still.hidden = !picture;
      if (picture) {
        still.src = picture;
      }
      layer.hidden = false;
      panel.hidden = false;
      place();
      await refresh(epoch, binding);
    });
    if (current(epoch)) {
      panel.hidden = false;
      place();
      const first =
        panel.querySelector("textarea") ||
        panel.querySelector("input") ||
        panel.querySelector("button");
      first?.focus();
    }
  }

  function select(binding) {
    return run("Loading text…", (epoch) => readField(binding, epoch));
  }

  function prepare() {
    if (unsaved() || state.pending || state.status?.publishing?.pending) {
      return;
    }
    return run("Preparing text editing…", async (epoch) => {
      checked(await host.content.prepare());
      state.review = null;
      await refresh(epoch, state.binding);
      if (current(epoch)) {
        state.notice =
          "Text editing is ready. Pick a field or click text on the page.";
      }
    });
  }

  function save() {
    if (!unsaved() || state.pending || state.status?.publishing?.pending) {
      return;
    }
    const value = state.draft;
    const { binding } = state;
    return run("Saving draft…", async (epoch) => {
      checked(
        await host.content.save({ ...binding, revision: state.revision, value })
      );
      if (!current(epoch)) {
        return;
      }
      // A failed status refresh must not offer to save an already-saved edit.
      state.original = value;
      state.review = null;
      await refresh(epoch, binding);
      if (current(epoch)) {
        state.notice =
          "Draft saved on this Mac. The live site has not changed.";
      }
    });
  }

  function replay(direction) {
    if (state.status?.publishing?.pending) {
      return;
    }
    return run(
      direction === "undo" ? "Undoing text…" : "Redoing text…",
      async (epoch) => {
        checked(await host.content[direction](state.revision));
        state.review = null;
        await refresh(epoch, state.binding);
        if (current(epoch)) {
          state.notice = "Local draft updated. The live site has not changed.";
        }
      }
    );
  }

  function connect(input, replace = false) {
    let token = input.value.trim();
    input.value = "";
    if (!token || state.busy) {
      return;
    }
    return run("Connecting text publishing…", async (epoch) => {
      let connected = false;
      try {
        checked(
          await host.content[replace ? "replaceConnection" : "connect"](token)
        );
        connected = true;
      } catch {
        // Connection errors can contain credentials. Do not retain their cause.
      } finally {
        token = "";
      }
      if (!connected) {
        throw new Error(
          "Could not connect. Check the project write token and try again."
        );
      }
      state.replacingConnection = false;
      state.review = null;
      await refresh(epoch, null);
      if (current(epoch)) {
        state.notice =
          "Text publishing is connected. Review saved changes before publishing.";
      }
    });
  }

  function reviewText() {
    if (unsaved() || state.pending) {
      return;
    }
    return run("Reviewing text changes…", async (epoch) => {
      const result = checked(await host.content.review());
      if (!current(epoch)) {
        return;
      }
      const { review } = result;
      if (
        !review ||
        typeof review.id !== "string" ||
        !Array.isArray(review.changes) ||
        !review.changes.every(
          (change) =>
            change &&
            [change.documentId, change.path, change.before, change.after].every(
              (value) => typeof value === "string"
            )
        )
      ) {
        throw new Error("The text review could not be read. Try again.");
      }
      state.review = review;
    });
  }

  function publishText() {
    if (
      !state.review ||
      unsaved() ||
      state.pending ||
      state.status?.publishing?.pending
    ) {
      return;
    }
    const reviewId = state.review.id;
    return run("Publishing reviewed text…", async (epoch) => {
      state.review = null;
      state.status = {
        ...state.status,
        publishing: { ...state.status.publishing, pending: true },
      };
      try {
        checked(await host.content.publish(reviewId));
      } finally {
        if (current(epoch)) {
          await refresh(epoch, state.binding);
        }
      }
      if (!current(epoch)) {
        return;
      }
      if (current(epoch)) {
        state.notice = state.status?.publishing?.pending
          ? "The publish result is not confirmed. Check publish status before trying again."
          : "Text was published to Sanity. The live page may take up to 60 seconds to update. Check the website.";
      }
    });
  }

  function reconcileText() {
    if (state.pending) {
      return;
    }
    return run("Checking text publish status…", async (epoch) => {
      checked(await host.content.reconcile());
      if (!current(epoch)) {
        return;
      }
      state.review = null;
      await refresh(epoch, unsaved() ? null : state.binding);
      if (current(epoch)) {
        state.notice = state.status?.publishing?.pending
          ? "The publish result is still not confirmed. Keep these drafts and check again."
          : "Publish status checked. Check the website; its content may stay cached for up to 60 seconds.";
      }
    });
  }

  function restoreText() {
    if (unsaved() || state.pending) {
      return;
    }
    return run("Restoring earlier text as a draft…", async (epoch) => {
      checked(await host.content.restore());
      if (!current(epoch)) {
        return;
      }
      state.review = null;
      await refresh(epoch, state.binding);
      if (current(epoch)) {
        state.notice =
          "Earlier text is now a local draft. Review and publish it to change the live site.";
      }
    });
  }

  function renderTextReview(group, locked) {
    if (!state.review) {
      return;
    }
    group.append(
      node(
        "p",
        "pub-muted",
        "Review each change. Publishing changes these text fields on the live site."
      )
    );
    const titles = documentTitles();
    for (const change of state.review.changes) {
      const item = node("div", "pub-note");
      item.append(
        node(
          "p",
          "pub-faint",
          `${documentLabel(change.documentId, titles)} · ${fieldLabel(change.path)}`
        ),
        fieldDetails(change)
      );
      for (const [label, value] of [
        ["Before", change.before],
        ["After", change.after],
      ]) {
        const content = node("pre", "pub-muted", value);
        content.style.whiteSpace = "pre-wrap";
        content.style.overflowWrap = "anywhere";
        item.append(node("b", "pub-label", label), content);
      }
      group.append(item);
    }
    const publish = button("Publish text changes live", publishText, true);
    publish.disabled = locked || state.review.changes.length === 0;
    group.append(publish);
  }

  function renderConnectionForm(group) {
    const label = node("label", "pub-note");
    label.append(node("span", "pub-label", "Sanity project write token"));
    const input = node("input");
    input.type = "password";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Sanity project write token");
    input.disabled = Boolean(state.busy);
    label.append(input);
    const replacing = state.replacingConnection;
    const submit = button(
      replacing ? "Replace connection" : "Connect text publishing",
      () => connect(input, replacing)
    );
    submit.disabled = Boolean(state.busy || state.pending);
    group.append(
      node(
        "p",
        "pub-muted",
        replacing
          ? "Replace the saved write token for this same project and dataset. The old token stays saved until you click Replace connection. This does not publish text."
          : "Use a write token for this Sanity project. Enter it only here, never in chat. The app stores it with system encryption."
      ),
      label,
      submit
    );
    if (replacing) {
      const cancel = button("Keep current connection", () => {
        input.value = "";
        state.replacingConnection = false;
        render();
      });
      cancel.disabled = Boolean(state.busy);
      group.append(cancel);
    }
  }

  function renderPublishing(body) {
    if (
      !state.status?.configured ||
      typeof host.content.review !== "function"
    ) {
      return;
    }
    const group = node("section", "pub-note");
    group.dataset.contentPublishing = "true";
    group.append(
      node("h3", "pub-label", "Publish text"),
      node(
        "p",
        "pub-muted",
        "This publishes saved text. Design changes use the site's Publish panel."
      )
    );
    const locked = Boolean(state.busy || state.pending || unsaved());
    if (!state.status.connected || state.replacingConnection) {
      renderConnectionForm(group);
    } else if (state.status.publishing?.pending) {
      group.append(
        node(
          "p",
          "pub-muted",
          "A text publish is waiting for confirmation. Saving and undo are paused. Check its status before editing or publishing again."
        )
      );
      const check = button("Check publish status", reconcileText);
      check.disabled = Boolean(state.busy || state.pending);
      group.append(check);
    } else {
      const review = button("Review text changes", reviewText);
      review.disabled = locked || !(state.status.dirtyCount > 0);
      group.append(review);
      if (state.status.publishing?.canRestore) {
        const restore = button("Restore published text as draft", restoreText);
        restore.disabled = locked;
        group.append(restore);
      }
      renderTextReview(group, locked);
    }
    if (
      state.status.connected &&
      !state.replacingConnection &&
      typeof host.content.replaceConnection === "function"
    ) {
      const replace = button("Replace text connection", () => {
        state.replacingConnection = true;
        state.review = null;
        render();
        panel.querySelector('input[type="password"]')?.focus();
      });
      replace.disabled = Boolean(state.busy || state.pending);
      group.append(replace);
    }
    body.append(group);
  }

  function renderFields(body) {
    const label = node("label", "pub-search");
    const search = node("input");
    search.type = "search";
    search.placeholder = "Find text";
    search.setAttribute("aria-label", "Find text");
    search.value = state.search;
    search.disabled = Boolean(state.busy);
    label.append(search);
    const list = node("div", "pub-menu");
    const count = node("span", "pub-faint");
    const titles = documentTitles();
    function paintList() {
      list.replaceChildren();
      const query = state.search.toLocaleLowerCase();
      const fields = (state.status?.fields || []).filter((field) =>
        `${documentLabel(field.documentId, titles)} ${field.documentId} ${field.path} ${field.value}`
          .toLocaleLowerCase()
          .includes(query)
      );
      count.textContent =
        fields.length > 100
          ? `Showing 100 of ${fields.length} fields. Search to narrow the list.`
          : `${fields.length} text fields`;
      for (const field of fields.slice(0, 100)) {
        const row = button("", () => select(field));
        row.className = "pub-mi";
        row.disabled = Boolean(state.busy);
        const description = node("span", "pub-mi-main");
        description.append(
          node("b", "", fieldLabel(field.path)),
          node("span", "", field.value || "Empty text"),
          node("span", "pub-faint", documentLabel(field.documentId, titles))
        );
        row.title = field.path;
        row.append(description);
        list.append(row);
      }
      if (fields.length === 0) {
        list.append(node("p", "pub-muted", "No matching text fields."));
      }
    }
    search.addEventListener("input", () => {
      state.search = search.value;
      paintList();
    });
    paintList();
    body.append(label, count, list);
  }

  function renderEditor(body, foot) {
    const browse = button("All text", () =>
      leave(() => {
        state.binding = null;
        state.error = "";
        render();
      })
    );
    browse.disabled = Boolean(state.busy);
    body.append(
      browse,
      node("h3", "pub-label", fieldLabel(state.binding.path)),
      node(
        "p",
        "pub-faint",
        documentLabel(state.binding.documentId, documentTitles())
      )
    );
    body.append(fieldDetails(state.binding));
    if (state.error) {
      body.append(
        button("Reload saved text", () => leave(() => select(state.binding)))
      );
    }
    const label = node("label", "pub-note");
    label.append(node("span", "pub-label", "Text"));
    const textarea = node("textarea");
    textarea.rows = 7;
    textarea.value = state.draft;
    textarea.disabled = Boolean(
      state.busy || state.status?.publishing?.pending
    );
    textarea.dataset.focus = "text";
    label.append(textarea);
    body.append(label);
    const history = node("div", "pub-foot");
    const undo = button("Undo text", () => replay("undo"));
    const redo = button("Redo text", () => replay("redo"));
    const saveButton = button("Save draft", save, true);
    function buttons() {
      const refreshCopy = body.querySelector("[data-content-refresh]");
      if (refreshCopy) {
        refreshCopy.disabled = Boolean(
          state.busy ||
            state.pending ||
            unsaved() ||
            state.status?.publishing?.pending
        );
      }
      saveButton.disabled =
        Boolean(
          state.busy || state.pending || state.status?.publishing?.pending
        ) || !unsaved();
      undo.disabled = Boolean(
        state.busy ||
          unsaved() ||
          state.status?.publishing?.pending ||
          !state.status?.canUndo
      );
      redo.disabled = Boolean(
        state.busy ||
          unsaved() ||
          state.status?.publishing?.pending ||
          !state.status?.canRedo
      );
    }
    textarea.addEventListener("input", () => {
      state.draft = textarea.value;
      state.review = null;
      buttons();
      // Keep the caret and input. Only refresh publication controls.
      body.querySelector("[data-content-publishing]")?.remove();
      renderPublishing(body);
    });
    buttons();
    history.append(undo, redo);
    body.append(history);
    foot.append(saveButton);
  }

  function renderPending(body) {
    if (state.pending) {
      body.append(
        node("p", "pub-muted", "You have text that is not saved. Discard it?")
      );
      const actions = node("div", "pub-foot");
      const keep = button(
        "Keep editing",
        () => {
          state.pending = null;
          render();
          panel.querySelector("textarea")?.focus();
        },
        true
      );
      keep.dataset.focus = "keep";
      actions.append(
        keep,
        button("Discard text", () => {
          const action = state.pending;
          state.pending = null;
          state.draft = state.original;
          action?.();
        })
      );
      body.append(actions);
    }
  }

  function renderRefresh(body) {
    if (state.status?.configured && state.status.dirtyCount === 0) {
      const refreshCopy = button("Refresh text copy", prepare);
      refreshCopy.dataset.contentRefresh = "true";
      refreshCopy.disabled = Boolean(
        state.busy ||
          state.pending ||
          unsaved() ||
          state.status.publishing?.pending
      );
      body.append(refreshCopy);
    }
  }

  function render() {
    const focus = document.activeElement;
    const focusKey = panel.contains(focus) ? focus.dataset.focus : null;
    const head = node("div", "pub-head");
    head.append(
      node("h2", "", "Content"),
      node("p", "pub-muted", "Edit text here. Saved drafts stay on this Mac.")
    );
    const body = node("div", "pub-body");
    const message = node(
      "p",
      state.error ? "pub-error" : "pub-faint",
      state.error || state.busy || state.notice
    );
    message.setAttribute("role", state.error ? "alert" : "status");
    if (message.textContent) {
      body.append(message);
    }
    renderPending(body);
    const foot = node("div", "pub-foot");
    const closeButton = button("Close", () => leave(close));
    closeButton.disabled = Boolean(state.busy);
    foot.append(closeButton);
    if (state.status && !state.status.configured) {
      body.append(
        node(
          "p",
          "pub-muted",
          "Prepare a local copy of the site's text to edit it here."
        )
      );
      const start = button("Prepare text editing", prepare, true);
      start.disabled = Boolean(state.busy);
      foot.append(start);
    } else if (state.binding) {
      renderEditor(body, foot);
    } else if (state.status?.configured) {
      renderFields(body);
    } else if (state.error) {
      foot.append(
        button(
          "Try again",
          () => run("Loading content…", (epoch) => refresh(epoch, null)),
          true
        )
      );
    }
    renderRefresh(body);
    renderPublishing(body);
    panel.replaceChildren(head, body, foot);
    if (focusKey) {
      [...panel.querySelectorAll("[data-focus]")]
        .find((item) => item.dataset.focus === focusKey)
        ?.focus();
    }
  }

  scrim.addEventListener("click", () => leave(close));
  // Close before another top-bar action runs. Unsaved input blocks that action
  // until the user chooses to discard it. Existing publish panels own freeze
  // only after this panel has released it.
  document.addEventListener(
    "click",
    (event) => {
      if (
        !state.open ||
        panel.contains(event.target) ||
        trigger.contains(event.target)
      ) {
        return;
      }
      const target = event.target.closest("header button");
      if (!target) {
        return;
      }
      if (state.busy || unsaved()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        leave(() => {
          close();
          target.click();
        });
      } else {
        close();
      }
    },
    true
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (!state.open) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        leave(close);
      } else if (event.key === "Tab") {
        const controls = [
          ...panel.querySelectorAll(
            "button:not(:disabled), input:not(:disabled), textarea:not(:disabled)"
          ),
        ];
        const [first] = controls;
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      } else if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        save();
      }
    },
    true
  );

  function screenChanged() {
    trigger.hidden = !inEditor();
    if (!inEditor()) {
      blocked.hidden = true;
      // Normal navigation is guarded above. An external site close must not
      // retain a binding from the old site for the next site.
      close();
    }
  }
  if (editor) {
    new MutationObserver(screenChanged).observe(editor, {
      attributeFilter: ["hidden"],
      attributes: true,
    });
  }
  window.addEventListener("resize", () => state.open && place());
  host.content.onSelect((binding) => {
    if (
      binding &&
      typeof binding.documentId === "string" &&
      typeof binding.path === "string"
    ) {
      open(binding);
    }
  });
  screenChanged();
})();
