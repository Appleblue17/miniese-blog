/**
 * @vitest-environment jsdom
 *
 * @file Unit tests for WikiPreview component.
 *
 * Tests hover behavior, API fetching, caching, and mobile handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { WikiPreview } from "./WikiPreview";

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock window.matchMedia for hover detection
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query === "(hover: hover)",
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

// Global cache reference — we need to clear it between tests
// The cache is defined in the module via `globalCache` in WikiPreview.tsx
// We can access it by re-importing or just mock the module
// For isolation, we use a unique wiki name per test

beforeEach(() => {
  mockFetch.mockReset();
  // Default: return a valid wiki entry
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      entry: {
        name: "DFS",
        definition: "深度优先搜索（Depth-First Search）是一种图遍历算法。",
        blocks: {
          definition: "深度优先搜索（Depth-First Search）是一种图遍历算法。",
          human: "",
          ai: "",
          ref: "",
        },
      },
    }),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// Helper to create a DOM element with data-wiki-name
function createWikiLink(wikiName: string, text: string, container: HTMLElement): HTMLElement {
  const link = document.createElement("a");
  link.setAttribute("href", `/zh/wiki/${wikiName}`);
  link.setAttribute("data-wiki-name", wikiName);
  link.textContent = text;
  container.appendChild(link);
  return link;
}

describe("WikiPreview", () => {
  it("renders without crashing", () => {
    const { container } = render(<WikiPreview lang="zh" />);
    // Should render nothing visible initially
    expect(container.innerHTML).toBe("");
  });

  it("shows preview card after hovering on a wiki link", async () => {
    vi.useFakeTimers();

    const { container } = render(<WikiPreview lang="zh" />);

    // Add a wiki link to the DOM
    const wrapper = document.createElement("div");
    document.body.appendChild(wrapper);
    const link = createWikiLink("DFS", "DFS", wrapper);

    // Simulate mouseenter on the link
    act(() => {
      link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    // Fast forward 300ms
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Wait for fetch
    await act(async () => {
      await Promise.resolve();
    });

    // Check that the preview card is displayed
    const card = document.querySelector('[role="tooltip"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("深度优先搜索");

    // Check "view full entry" link
    const viewLink = card?.querySelector("a");
    expect(viewLink?.getAttribute("href")).toBe("/zh/wiki/DFS");

    document.body.removeChild(wrapper);
  });

  it("does not show preview when hover is less than 300ms", async () => {
    vi.useFakeTimers();

    render(<WikiPreview lang="zh" />);

    const wrapper = document.createElement("div");
    document.body.appendChild(wrapper);
    const link = createWikiLink("BFS", "BFS", wrapper);

    // Hover over the link
    act(() => {
      link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    // Move away after 100ms (before the 300ms threshold)
    act(() => {
      vi.advanceTimersByTime(100);
    });

    act(() => {
      link.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });

    // Advance past 300ms total
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Card should NOT be visible
    const card = document.querySelector('[role="tooltip"]');
    expect(card).toBeNull();

    document.body.removeChild(wrapper);
  });

  it("caches fetched definitions to avoid duplicate requests", async () => {
    vi.useFakeTimers();

    // Use a unique name to avoid cross-test cache pollution
    const uniqueName = "CacheTest_" + Date.now();

    // Mock fetch for this unique name
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes(uniqueName)) {
        return {
          ok: true,
          json: async () => ({
            entry: {
              name: uniqueName,
              definition: "Cached definition",
              blocks: { definition: "Cached definition", human: "", ai: "", ref: "" },
            },
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });

    render(<WikiPreview lang="zh" />);

    const wrapper = document.createElement("div");
    document.body.appendChild(wrapper);
    const link = createWikiLink(uniqueName, uniqueName, wrapper);

    // First hover should trigger a fetch
    act(() => {
      link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Move away
    act(() => {
      link.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });

    // Hover again — should use cache, not fetch
    act(() => {
      link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Should NOT have made a second fetch request (cached)
    expect(mockFetch).toHaveBeenCalledTimes(1);

    document.body.removeChild(wrapper);
  });

  it("shows card position below the link", async () => {
    vi.useFakeTimers();

    render(<WikiPreview lang="zh" />);

    const wrapper = document.createElement("div");
    document.body.appendChild(wrapper);
    const link = createWikiLink("DFS", "DFS", wrapper);

    // Mock getBoundingClientRect
    link.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 120,
      left: 50,
      right: 200,
      width: 150,
      height: 20,
      x: 50,
      y: 100,
      toJSON: () => ({}),
    }));

    act(() => {
      link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const card = document.querySelector('[role="tooltip"]') as HTMLElement;
    expect(card).not.toBeNull();
    // Card should be positioned below the link (top = bottom + 8)
    expect(card.style.top).toBe("128px");

    document.body.removeChild(wrapper);
  });

  it("handles fetch failure gracefully", async () => {
    vi.useFakeTimers();

    // Mock fetch to return failure
    mockFetch.mockResolvedValueOnce({
      ok: false,
    });

    render(<WikiPreview lang="zh" />);

    const wrapper = document.createElement("div");
    document.body.appendChild(wrapper);
    const link = createWikiLink("UnknownTerm", "Unknown", wrapper);

    act(() => {
      link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Card should NOT be shown when fetch fails
    const card = document.querySelector('[role="tooltip"]');
    expect(card).toBeNull();

    document.body.removeChild(wrapper);
  });

  it("does not render on mobile (no hover support)", () => {
    // Override matchMedia to indicate no hover support
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query !== "(hover: hover)", // hover not supported
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    const { container } = render(<WikiPreview lang="zh" />);

    // Component should render nothing on mobile
    expect(container.innerHTML).toBe("");
  });
});
