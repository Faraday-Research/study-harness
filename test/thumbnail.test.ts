import { beforeEach, describe, expect, it } from "vitest";
import { createHarness } from "../src/index.js";
import { registerProvider } from "../src/providers/registry.js";
import { checkThumbnail, extractSvg } from "../src/thumbnail.js";
import type { ProviderRequest, ProviderResponse, StopReason } from "../src/types.js";

// A scripted fake model.
let script: { text: string; stopReason?: StopReason }[] = [];
let requests: ProviderRequest[] = [];
registerProvider("thumbmock", (model) => ({
  name: "thumbmock",
  model: model ?? "default",
  async generate(req): Promise<ProviderResponse> {
    requests.push({ ...req, messages: [...req.messages] });
    const step = script.shift() ?? { text: "" };
    return {
      message: { role: "assistant", text: step.text, toolCalls: [] },
      stopReason: step.stopReason ?? "end_turn",
      usage: { inputTokens: 10, outputTokens: 5 },
    };
  },
}));

const GLOW =
  '<defs><radialGradient id="glow" cx="160" cy="120" r="150" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0C817B"/></radialGradient>' +
  '<radialGradient id="core" cx="160" cy="120" r="85" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#22A89F"/></radialGradient></defs>' +
  '<rect width="320" height="240" fill="url(#glow)"/><rect width="320" height="240" fill="url(#core)"/>';
const svg = (body = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" width="320" height="240" role="img" aria-label="x">${GLOW}${body}</svg>`;
const GOOD = svg('<circle cx="160" cy="120" r="8" fill="#FFFFFF"/>');

beforeEach(() => {
  script = [];
  requests = [];
});

describe("checkThumbnail", () => {
  it("accepts an SVG that follows the template", () => {
    expect(checkThumbnail(GOOD)).toEqual([]);
  });

  it.each([
    ["script", "<script>alert(1)</script>"],
    ["event handler", '<rect onload="x()" width="1" height="1"/>'],
    ["external image", '<image href="https://example.com/a.png"/>'],
    ["external link", '<a href="https://example.com"><rect width="1" height="1"/></a>'],
    ["external url()", '<rect fill="url(https://example.com/x)" width="1" height="1"/>'],
    ["style", "<style>@import url(x.css);</style>"],
    ["filter", '<filter id="f"/>'],
  ])("refuses an SVG with a %s", (_, body) => {
    expect(checkThumbnail(svg(body)).length).toBeGreaterThan(0);
  });

  it("needs the 320x240 viewBox and both glow gradients", () => {
    expect(checkThumbnail(GOOD.replace("0 0 320 240", "0 0 100 100"))).not.toEqual([]);
    expect(checkThumbnail(GOOD.replace('id="core"', 'id="other"'))).not.toEqual([]);
  });
});

describe("extractSvg", () => {
  it("drops code fences and text around the SVG", () => {
    expect(extractSvg("Here it is:\n```svg\n" + GOOD + "\n```")).toBe(GOOD);
    expect(extractSvg("no svg here")).toBeNull();
  });
});

describe("harness.thumbnail", () => {
  it("returns the SVG and sends the skill with the topic", async () => {
    script = [{ text: "```svg\n" + GOOD + "\n```" }];
    const harness = createHarness({ model: "thumbmock:m" });
    const result = await harness.thumbnail({ topic: "Mitosis", subject: "Biology" });

    expect(result).toMatchObject({ status: "ok", svg: GOOD });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.system).toContain("Thumbnail generator");
    expect(requests[0]!.messages[0]).toMatchObject({ role: "user", content: expect.stringContaining("topic: Mitosis") });
  });

  it("asks for one fix, then succeeds", async () => {
    script = [{ text: svg("<script>x</script>") }, { text: GOOD }];
    const result = await createHarness({ model: "thumbmock:m" }).thumbnail({ topic: "Mitosis" });

    expect(result.status).toBe("ok");
    expect(requests).toHaveLength(2);
    expect(JSON.stringify(requests[1]!.messages.at(-1))).toContain("<script>");
  });

  it("gives up after one failed fix", async () => {
    script = [{ text: "sorry" }, { text: "still no svg" }];
    const result = await createHarness({ model: "thumbmock:m" }).thumbnail({ topic: "Mitosis" });

    expect(result.status).toBe("invalid");
    expect(requests).toHaveLength(2);
  });
});
