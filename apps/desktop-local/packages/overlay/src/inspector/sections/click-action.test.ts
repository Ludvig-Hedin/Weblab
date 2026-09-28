import { describe, expect, it } from "vitest";
import { clickAction } from "./click-action";

function button(html: string): Element {
  document.body.innerHTML = html;
  const node = document.querySelector("[data-subject]");
  if (!node) {
    throw new Error("no subject");
  }
  return node;
}

describe("clickAction", () => {
  it("names a dialog trigger and the dialog's title", () => {
    const node = button(`
      <button data-subject aria-haspopup="dialog" aria-controls="d">Book</button>
      <div id="d" role="dialog" aria-label="Book a demo"></div>`);
    expect(clickAction(node)).toMatchObject({
      detail: "Book a demo",
      previewable: true,
      text: "Opens a dialog",
    });
  });

  it("reads a closed Radix trigger, whose dialog is not mounted", () => {
    const node = button(
      `<button data-subject aria-haspopup="dialog" aria-expanded="false" aria-controls="gone">Book</button>`
    );
    expect(clickAction(node)?.text).toBe("Opens a dialog");
  });

  it("knows a submit button sends its form", () => {
    const node = button("<form><button data-subject>Send</button></form>");
    expect(clickAction(node)?.text).toBe("Sends the form");
    expect(clickAction(node)?.previewable).toBeUndefined();
  });

  it("offers reveal for a collapsed navigation panel", () => {
    const node = button(
      `<button data-subject aria-expanded="false" aria-controls="mobile-navigation">Menu</button><nav id="mobile-navigation" hidden></nav>`
    );
    expect(clickAction(node)).toMatchObject({
      previewable: true,
      text: "Shows and hides a panel",
    });
  });

  it("does not run an already open panel again", () => {
    const node = button(
      `<button data-subject aria-expanded="true" aria-controls="mobile-navigation">Menu</button><nav id="mobile-navigation"></nav>`
    );
    expect(clickAction(node)?.previewable).toBeUndefined();
  });

  it("does not submit a form that also declares a dialog", () => {
    const node = button(
      `<form><button data-subject aria-haspopup="dialog">Open</button></form>`
    );
    expect(clickAction(node)).toMatchObject({ text: "Sends the form" });
    expect(clickAction(node)?.previewable).toBeUndefined();
  });

  it("does not play close or unknown commands", () => {
    const node = button(
      `<button data-subject command="request-close" commandfor="d">Close</button><dialog id="d"></dialog>`
    );
    expect(clickAction(node)?.previewable).toBeUndefined();
    node.setAttribute("command", "--custom-action");
    expect(clickAction(node)?.previewable).toBeUndefined();
  });

  it("does not play a popover hide action", () => {
    const node = button(
      `<button data-subject popovertarget="p" popovertargetaction="hide">Hide</button><div id="p" popover></div>`
    );
    expect(clickAction(node)?.previewable).toBeUndefined();
  });

  it("names a React click handler with a meaningful name", () => {
    const node = button(`<button data-subject type="button">Go</button>`);
    function openPricing(): void {
      // Stand-in handler.
    }
    Object.assign(node, { __reactProps$abc: { onClick: openPricing } });
    expect(clickAction(node)).toMatchObject({
      detail: "openPricing",
      text: "Runs code when clicked",
    });
    expect(clickAction(node)?.previewable).toBeUndefined();
  });

  it("says nothing for a button with no behaviour it can see", () => {
    const node = button(`<button data-subject type="button">Go</button>`);
    expect(clickAction(node)).toBeNull();
  });
});
