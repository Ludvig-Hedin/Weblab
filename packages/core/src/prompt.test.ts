import {
  EDIT_OUTPUT_JSON_SCHEMA,
  EditStructuredOutputSchema,
  type StyleChange,
} from "@airship/protocol";
import { describe, expect, it } from "vitest";
import {
  buildEditPrompt,
  renderChange,
  structuredOutputInstruction,
  systemPrompt,
} from "./prompt";
import { splitStructured } from "./providers/opencode-events";

/*
 * The change line is the whole contract between the inspector and the agent for
 * a style edit, and the token clause is the part that is easy to get subtly
 * wrong: the same sentence has to serve a custom property, a utility class, a
 * near miss and an explicit detach, and each asks for a different edit.
 */

const base: StyleChange = {
  from: "12px",
  property: "padding-top",
  to: "16px",
};

describe("renderChange", () => {
  it("renders a bare delta when no token was resolved", () => {
    expect(renderChange(base)).toBe("padding-top: 12px → 16px");
  });

  it("tells the agent to write a custom property in place of the value", () => {
    const line = renderChange({
      ...base,
      token: { exact: true, kind: "css-var", name: "--pk-space-md" },
    });
    expect(line).toContain("[token: --pk-space-md");
    expect(line).toContain("write this token instead of the literal value");
  });

  it("tells the agent to add a utility class rather than write a value", () => {
    // The distinction that matters: a class is applied to the element, it is
    // not a value that can appear on the right of a declaration.
    const line = renderChange({
      ...base,
      token: { exact: true, kind: "utility-class", name: ".pt-4" },
    });
    expect(line).toContain("[token: .pt-4");
    expect(line).toContain("add this utility class to the element");
  });

  it("carries the value delta even when a class token is named", () => {
    // Regression: `to` used to be the token's *name*, so this line read
    // `padding-top: 12px → .pt-4`, which is not a value the agent can act on.
    expect(
      renderChange({
        ...base,
        token: { exact: true, kind: "utility-class", name: ".pt-4" },
      })
    ).toContain("padding-top: 12px → 16px");
  });

  it("phrases a near miss as a suggestion, not an instruction", () => {
    const line = renderChange({
      ...base,
      to: "13px",
      token: {
        actual: "12px",
        exact: false,
        kind: "css-var",
        name: "--pk-space-sm",
      },
    });
    expect(line).toContain("nearest token: --pk-space-sm = 12px");
    expect(line).toContain("unless the exact value was deliberate");
  });

  it("states a detach as a standing instruction", () => {
    const line = renderChange({ ...base, hardcode: true });
    expect(line).toContain("do not substitute a token");
  });

  it("lets a detach win over a token that slipped through", () => {
    // The change set drops the token on a hardcoded slot, so this should not be
    // reachable — the assertion is that the renderer does not contradict it if
    // it ever is.
    const line = renderChange({
      ...base,
      hardcode: true,
      token: { exact: true, kind: "css-var", name: "--pk-space-md" },
    });
    expect(line).not.toContain("--pk-space-md");
  });
});

/*
 * The structured-output contract rides the opencode system prompt because
 * opencode's `format` option cannot be relied on (its forced tool call is
 * rejected by thinking models). These assertions run against the schema, not
 * literals, so adding a field fails the test instead of silently drifting.
 */
describe("structured output contract", () => {
  it("rides the opencode system prompt and names every schema field", () => {
    const sys = systemPrompt("opencode");
    expect(sys).toContain("<structuredoutput>");
    for (const name of EDIT_OUTPUT_JSON_SCHEMA.required) {
      expect(sys).toContain(`"${name}"`);
    }
  });

  it("stays out of the claude and codex prompts", () => {
    // Both constrain the decode natively; wrapper-tag instructions there would
    // only invite stray tags in prose.
    expect(systemPrompt("claude")).not.toContain("<structuredoutput>");
    expect(systemPrompt("codex")).not.toContain("<structuredoutput>");
  });

  it("contains no filled-in example a model could echo", () => {
    // A model that echoed a complete example verbatim would hand the extractor
    // a payload that parses. The tags appear empty, side by side.
    expect(structuredOutputInstruction()).toContain(
      "<structuredoutput></structuredoutput>"
    );
  });

  it("round-trips a payload written as instructed through the extractor", () => {
    // Pins the prompt and the extractor together: if either side changes its
    // spelling of the wrapper, this breaks here instead of in production.
    const payload = {
      filesChanged: ["src/app.tsx"],
      followUps: ["Tighten the focus ring"],
      summary: "Rounded the card corners.",
    };
    const message = `All done — the card now uses the token.\n\n<structuredoutput>${JSON.stringify(payload)}</structuredoutput>`;
    const { payload: lifted, prose } = splitStructured(message);
    expect(prose).toBe("All done — the card now uses the token.\n\n");
    const parsed = EditStructuredOutputSchema.safeParse(
      JSON.parse(lifted ?? "null")
    );
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(payload);
  });
});

describe("structural changes", () => {
  const element = {
    classes: [],
    displayName: null,
    tagName: "section",
    textPreview: "",
  };

  it("tells the agent where an insert goes and what it is", () => {
    const prompt = buildEditPrompt({
      prompt: "",
      structuralChanges: [
        {
          element,
          html: '<button type="button">Buy</button>',
          op: "insert",
          position: "inside",
          source: null,
        },
      ],
    });
    expect(prompt).toContain("Insert a new <button> as the last child of");
    expect(prompt).toContain('<button type="button">Buy</button>');
    expect(prompt).toContain("For an insert:");
    expect(prompt).not.toContain("For a delete:");
  });

  it("names both tags of a tag change and the wrapper of a wrap", () => {
    const prompt = buildEditPrompt({
      prompt: "",
      structuralChanges: [
        { element, fromTag: "div", op: "retag", source: null, toTag: "nav" },
        { element, html: '<a href="#">', op: "wrap", source: null },
      ],
    });
    expect(prompt).toContain("Change the tag from <div> to <nav>");
    expect(prompt).toContain('New wrapper: <a href="#">');
  });
});

describe("component edits", () => {
  const component = {
    callSite: { file: "src/app/about/page.tsx", line: 34 },
    definition: "src/components/sections/page-hero.tsx",
    name: "PageHero",
    pages: ["/about", "/security"],
  };
  const element = {
    classes: [],
    displayName: null,
    tagName: "h1",
    textPreview: "About",
  };

  it("sends a prop edit to the call site, never the component file", () => {
    const prompt = buildEditPrompt({
      prompt: "",
      propChanges: [
        {
          component,
          control: "enum",
          from: "dark",
          origin: { kind: "literal" },
          prop: "tone",
          to: "light",
        },
      ],
    });
    expect(prompt).toContain("<PageHero> used at src/app/about/page.tsx:34");
    expect(prompt).toContain('tone (enum): "dark" → "light"');
    expect(prompt).toContain("Never edit the component's own file");
  });

  it("routes a spread value to its data file and a default to a new attribute", () => {
    const prompt = buildEditPrompt({
      prompt: "",
      propChanges: [
        {
          component,
          control: "text",
          from: "Our Mission",
          origin: {
            exportName: "aboutHero",
            file: "src/content/about.ts",
            kind: "spread",
          },
          prop: "eyebrowTail",
          to: "Our Story",
        },
        {
          component,
          control: "boolean",
          from: null,
          origin: { kind: "default" },
          prop: "dark",
          to: "true",
        },
      ],
    });
    expect(prompt).toContain("`aboutHero` in src/content/about.ts");
    expect(prompt).toContain("Add the prop to this call site only");
  });

  it("describes make-property, detach and create-component", () => {
    const prompt = buildEditPrompt({
      componentActions: [
        {
          action: "make-property",
          component,
          element,
          source: null,
          value: "About",
        },
        { action: "detach", component, element, source: null },
        { action: "create-component", element, source: null },
      ],
      prompt: "",
    });
    expect(prompt).toContain("Make the current value the prop's default");
    expect(prompt).toContain("It is used on 2 pages: /about, /security.");
    expect(prompt).toContain("Replace only this call site");
    expect(prompt).toContain("Create a component");
  });
});
