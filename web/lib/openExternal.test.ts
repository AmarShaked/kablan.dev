import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isExternalHref } from "./openExternal.ts";
import { api } from "../api.ts";

vi.mock("../api.ts");
// The interceptor only installs inside the desktop shell (a plain browser opens links natively),
// so these tests run as if Kablan were the Tauri app.
vi.mock("./version.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./version.ts")>();
  return { ...actual, isTauri: true };
});

describe("isExternalHref", () => {
  it("accepts web and mail links", () => {
    for (const href of ["http://x.dev", "https://x.dev/a?b=1", "HTTPS://X.DEV", "mailto:a@b.dev"]) {
      expect(isExternalHref(href)).toBe(true);
    }
  });

  it("rejects in-app and non-web schemes", () => {
    for (const href of ["#frag", "/settings", "./rel", "file:///etc/passwd", "javascript:alert(1)", ""]) {
      expect(isExternalHref(href)).toBe(false);
    }
  });
});

describe("installExternalLinkHandler", () => {
  let cleanup = () => {};

  beforeEach(async () => {
    vi.mocked(api.openUrl).mockReset().mockResolvedValue({ ok: true });
    const { installExternalLinkHandler } = await import("./openExternal.ts");
    cleanup = installExternalLinkHandler();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  /** Anchor + a real left click, the way a user reaches a link in the transcript. Returns whether
   * the interceptor claimed the click. The trailing listener (registered after the interceptor, so
   * it runs after it) reads that verdict and then swallows the navigation jsdom can't perform. */
  const clickLink = (href: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = "link";
    document.body.appendChild(a);
    let claimed = false;
    const last = (e: Event) => {
      claimed = e.defaultPrevented;
      e.preventDefault();
    };
    document.addEventListener("click", last);
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    document.removeEventListener("click", last);
    return claimed;
  };

  it("sends an external link to the OS browser and cancels the dead in-webview navigation", () => {
    expect(clickLink("https://kablan.dev/docs")).toBe(true);
    expect(api.openUrl).toHaveBeenCalledWith("https://kablan.dev/docs");
  });

  it("leaves in-app and non-web links to the webview", () => {
    for (const href of ["#top", "file:///etc/passwd"]) {
      expect(clickLink(href)).toBe(false);
    }
    expect(api.openUrl).not.toHaveBeenCalled();
  });

  it("stops intercepting once cleaned up", () => {
    cleanup();
    expect(clickLink("https://kablan.dev")).toBe(false);
    expect(api.openUrl).not.toHaveBeenCalled();
  });
});
