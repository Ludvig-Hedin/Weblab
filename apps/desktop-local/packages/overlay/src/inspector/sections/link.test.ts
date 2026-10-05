import { describe, expect, it, vi } from "vitest";
import type { SectionContext } from "./context";
import {
  kindOf,
  mailHref,
  pageHref,
  readMail,
  renderLink,
  telHref,
  webHref,
} from "./link";

function actionContext(): SectionContext {
  return {
    headerAction: () => document.createElement("button"),
    register: () => undefined,
    repaintScope: () => (paint: () => void) => paint(),
    section: (_id: string, _label: string, body: HTMLElement) => body,
  } as unknown as SectionContext;
}

describe("Action preview", () => {
  it("runs a panel trigger from its play button", () => {
    document.body.innerHTML =
      '<button id="menu" aria-expanded="false" aria-controls="panel">Menu</button><nav id="panel" hidden></nav>';
    const trigger = document.querySelector("#menu");
    if (!trigger) {
      throw new Error("missing trigger");
    }
    const preview = vi.fn();
    const section = renderLink(actionContext(), trigger, preview);
    const play = section?.querySelector<HTMLButtonElement>(
      '[aria-label="Run action to show content for editing"]'
    );
    expect(play).toBeTruthy();
    play?.click();
    expect(preview).toHaveBeenCalledWith(trigger);
  });

  it("does not run a trigger that opened after the Action row rendered", () => {
    document.body.innerHTML =
      '<button id="menu" aria-expanded="false" aria-controls="panel">Menu</button><nav id="panel" hidden></nav>';
    const trigger = document.querySelector("#menu");
    if (!trigger) {
      throw new Error("missing trigger");
    }
    const preview = vi.fn();
    const section = renderLink(actionContext(), trigger, preview);
    trigger.setAttribute("aria-expanded", "true");
    const play = section?.querySelector<HTMLButtonElement>(
      '[aria-label="Run action to show content for editing"]'
    );
    play?.click();
    expect(preview).not.toHaveBeenCalled();
    expect(section?.querySelector(".ap-link-action-play")).toBeNull();
  });

  it("does not offer play for a form submit", () => {
    document.body.innerHTML = "<form><button>Send</button></form>";
    const trigger = document.querySelector("button");
    if (!trigger) {
      throw new Error("missing trigger");
    }
    const section = renderLink(actionContext(), trigger, vi.fn());
    expect(section?.querySelector(".ap-link-action-play")).toBeNull();
  });
});

describe("kindOf", () => {
  it("opens each href on the tab that can edit it", () => {
    expect(kindOf("mailto:a@b.co")).toBe("email");
    expect(kindOf("tel:+4670")).toBe("phone");
    expect(kindOf("#pricing")).toBe("section");
    expect(kindOf("/about")).toBe("page");
    expect(kindOf("about.html")).toBe("page");
    expect(kindOf("https://example.com")).toBe("url");
    expect(kindOf("//cdn.example.com")).toBe("url");
    expect(kindOf(null)).toBe("url");
  });
});

describe("webHref", () => {
  it("adds https to a bare host", () => {
    expect(webHref("example.com/a")).toEqual({ href: "https://example.com/a" });
  });

  it("refuses a non-web scheme", () => {
    expect("problem" in webHref("javascript:alert(1)")).toBe(true);
  });

  it("refuses text that is not an address", () => {
    expect("problem" in webHref("hello")).toBe(true);
  });
});

describe("pageHref", () => {
  it("keeps a path and refuses another site", () => {
    expect(pageHref("/about")).toEqual({ href: "/about" });
    expect("problem" in pageHref("https://x.com")).toBe(true);
  });
});

describe("mail and phone", () => {
  it("round-trips an address and subject", () => {
    const href = mailHref("hi@x.co", "Hej & välkommen");
    expect(readMail(href)).toEqual({
      address: "hi@x.co",
      subject: "Hej & välkommen",
    });
  });

  it("keeps only digits and a plus in a tel link", () => {
    expect(telHref("+46 (70) 123-45 67")).toBe("tel:+46701234567");
  });
});
