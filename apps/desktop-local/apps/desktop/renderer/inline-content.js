// biome-ignore-all lint/correctness/noUndeclaredVariables: app.js owns currentSite in the shared classic-script scope.
// Native controls save local text drafts while the page stays live and editable.
(() => {
  const content = window.weblab?.content;
  const editor = document.querySelector('[data-screen="editor"]');
  const topbar = document.querySelector(".topbar-right");
  if (!(content?.onInline && editor && topbar)) {
    return;
  }
  let state = null;
  let epoch = 0;
  let observedSite = null;
  let panelOpen = false;
  let hydration = 0;
  const group = document.createElement("div");
  group.className = "inline-content";
  group.hidden = true;
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Page text editing");
  const note = document.createElement("span");
  note.className = "pub-faint";
  note.setAttribute("role", "status");
  note.setAttribute("aria-live", "polite");
  function button(label, action) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "pub-btn";
    element.textContent = label;
    element.addEventListener("click", action);
    return element;
  }
  const save = button("Save text", () => perform("commitInline"));
  save.classList.add("primary");
  const discard = button("Discard", () => perform("cancelInline"));
  const undo = button("Undo", () => perform("undo"));
  const redo = button("Redo", () => perform("redo"));
  group.append(note, save, discard, undo, redo);
  topbar.prepend(group);

  const siteId = () => (editor.hidden ? null : currentSite?.id);
  function reset() {
    state = null;
    epoch += 1;
    group.hidden = true;
    note.textContent = "";
  }
  function syncSite() {
    const site = siteId();
    const panel = document.querySelector("#content-panel");
    const open = Boolean(panel && !panel.hidden);
    const panelClosed = panelOpen && !open;
    panelOpen = open;
    if (observedSite !== site) {
      observedSite = site;
      reset();
      hydrateHistory();
    } else if (panelClosed) {
      hydrateHistory();
    }
  }
  const idleHistory = () => !state || (state.phase === "saved" && !state.busy);
  async function hydrateHistory() {
    const site = siteId();
    if (!(site && idleHistory()) || typeof content.status !== "function") {
      return;
    }
    hydration += 1;
    const request = hydration;
    const ticket = epoch;
    try {
      const result = await content.status();
      if (
        request !== hydration ||
        ticket !== epoch ||
        site !== siteId() ||
        !idleHistory()
      ) {
        return;
      }
      if (!result?.ok) {
        return; // Sites without local content must open without an error.
      }
      if (
        !result.configured ||
        result.publishing?.pending ||
        !(result.canUndo || result.canRedo)
      ) {
        reset();
        return;
      }
      if (
        !Number.isSafeInteger(result.revision) ||
        result.revision < 0 ||
        (state && result.revision < state.revision)
      ) {
        return;
      }
      state = {
        busy: "",
        canRedo: Boolean(result.canRedo),
        canUndo: Boolean(result.canUndo),
        dirty: false,
        editId: `history:${site}`,
        error: "",
        phase: "saved",
        revision: result.revision,
        siteId: site,
      };
      render();
    } catch {
      // A background history read must never interrupt the page or active text.
    }
  }
  function render() {
    syncSite();
    if (!state) {
      return;
    }
    group.hidden = false;
    const editing = state.phase !== "saved";
    note.textContent =
      state.error ||
      state.busy ||
      (editing ? "Edit text on page" : "Text saved");
    note.className = state.error ? "pub-error" : "pub-faint";
    note.title = note.textContent;
    save.hidden = !editing;
    discard.hidden = !editing;
    undo.hidden = editing;
    redo.hidden = editing;
    save.disabled = Boolean(state.busy || !state.dirty);
    discard.disabled = Boolean(state.busy);
    undo.disabled = Boolean(state.busy || !state.canUndo);
    redo.disabled = Boolean(state.busy || !state.canRedo);
  }
  function stillCurrent(ticket, site, edit) {
    syncSite();
    return (
      state &&
      epoch === ticket &&
      state.siteId === site &&
      state.editId === edit
    );
  }
  function applySummary(result) {
    if (!Number.isSafeInteger(result.revision) || result.revision < 0) {
      throw new Error("Text status could not be checked. Try again.");
    }
    if (result.revision < state.revision) {
      throw new Error("Text changed again. Use the current text controls.");
    }
    state.revision = result.revision;
    state.canUndo = Boolean(result.canUndo);
    state.canRedo = Boolean(result.canRedo);
  }
  function applyResult(action, result) {
    if (!result?.ok) {
      throw new Error(result?.message || "Text could not be saved. Try again.");
    }
    if (action === "cancelInline") {
      reset();
      hydrateHistory();
      return;
    }
    applySummary(result);
    state.phase = "saved";
    state.dirty = false;
  }
  async function perform(action) {
    syncSite();
    if (!state || state.busy || (action === "commitInline" && !state.dirty)) {
      return;
    }
    hydration += 1;
    const ticket = epoch;
    const { siteId: site, editId: edit, revision } = state;
    state.error = "";
    state.busy =
      action === "cancelInline" ? "Discarding text…" : "Saving text…";
    render();
    try {
      const result = await content[action](
        action === "undo" || action === "redo" ? revision : edit
      );
      if (!stillCurrent(ticket, site, edit)) {
        return;
      }
      applyResult(action, result);
    } catch (error) {
      if (stillCurrent(ticket, site, edit)) {
        state.error = error.message || "Text could not be saved. Try again.";
      }
    } finally {
      if (stillCurrent(ticket, site, edit)) {
        state.busy = "";
        render();
      }
    }
  }

  content.onInline((event) => {
    syncSite();
    if (
      !event ||
      event.siteId !== siteId() ||
      !event.siteId ||
      typeof event.editId !== "string" ||
      !event.editId ||
      !["editing", "staged", "saved", "cancelled"].includes(event.phase) ||
      !Number.isSafeInteger(event.revision) ||
      event.revision < 0
    ) {
      return;
    }
    if (event.phase === "cancelled") {
      if (state?.editId === event.editId) {
        reset();
        hydrateHistory();
      }
      return;
    }
    if (event.phase === "saved" && state?.editId !== event.editId) {
      return;
    }
    hydration += 1;
    if (state?.editId !== event.editId) {
      epoch += 1;
      state = {
        busy: "",
        canRedo: false,
        canUndo: false,
        editId: event.editId,
        error: "",
        siteId: event.siteId,
      };
    } else if (event.revision < state.revision) {
      return;
    }
    state.phase = event.phase;
    state.dirty = event.phase !== "saved" && Boolean(event.dirty);
    state.revision = event.revision;
    if (event.phase === "saved") {
      state.canUndo = event.canUndo ?? true;
      state.canRedo = event.canRedo ?? false;
    }
    render();
  });

  // Save/discard stays on the live page. Other header actions must wait.
  document.addEventListener(
    "click",
    (event) => {
      syncSite();
      if (
        !state ||
        group.contains(event.target) ||
        !event.target.closest?.("header button")
      ) {
        return;
      }
      if (state.dirty || state.busy) {
        event.preventDefault();
        event.stopImmediatePropagation();
        state.error = state.busy
          ? "Wait for text to finish saving."
          : "Save or discard text first.";
        render();
      }
    },
    true
  );
  new MutationObserver(syncSite).observe(document.body, {
    attributes: true,
    childList: true,
    subtree: true,
  });
  syncSite();
})();
