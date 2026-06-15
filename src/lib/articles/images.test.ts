/**
 * @file images.test.ts — Unit tests for image utilities.
 *
 * Tests:
 * - extractImageReferences: extracts filenames from Markdown and HTML
 * - validateImageReferences: validates against filesystem
 */

import { describe, it, expect } from "vitest";
import { extractImageReferences } from "./images";

describe("extractImageReferences", () => {
  it("extracts Markdown image syntax", () => {
    const content = `![alt text](image.png)`;
    const result = extractImageReferences(content);
    expect(result).toEqual(["image.png"]);
  });

  it("extracts multiple Markdown images", () => {
    const content = `
# Hello

![Image 1](photo.jpg)
Some text
![Image 2](diagram.webp)
    `;
    const result = extractImageReferences(content);
    expect(result).toContain("photo.jpg");
    expect(result).toContain("diagram.webp");
    expect(result).toHaveLength(2);
  });

  it("extracts HTML img tag src", () => {
    const content = `<img src="photo.png" alt="Photo" />`;
    const result = extractImageReferences(content);
    expect(result).toEqual(["photo.png"]);
  });

  it("extracts HTML img with various attributes", () => {
    const content = `<img class="preview" src="diagram.svg" width="400" height="300" />`;
    const result = extractImageReferences(content);
    expect(result).toEqual(["diagram.svg"]);
  });

  it("strips query parameters from URLs", () => {
    const content = `![alt](image.png?w=800&h=600)`;
    const result = extractImageReferences(content);
    expect(result).toEqual(["image.png"]);
  });

  it("strips URL fragments", () => {
    const content = `![alt](image.png#fragment)`;
    const result = extractImageReferences(content);
    expect(result).toEqual(["image.png"]);
  });

  it("strips query params and fragments from HTML src", () => {
    const content = `<img src="photo.jpg?v=2#preview" />`;
    const result = extractImageReferences(content);
    expect(result).toEqual(["photo.jpg"]);
  });

  it("handles absolute URLs with paths", () => {
    const content = `![alt](/api/images/abc123/photo.png)`;
    const result = extractImageReferences(content);
    expect(result).toEqual(["photo.png"]);
  });

  it("handles relative paths with directory prefixes", () => {
    const content = `![alt](./images/photo.png)`;
    const result = extractImageReferences(content);
    expect(result).toEqual(["photo.png"]);
  });

  it("handles nested directory paths", () => {
    const content = `![alt](../../images/subdir/photo.png)`;
    const result = extractImageReferences(content);
    expect(result).toEqual(["photo.png"]);
  });

  it("ignores non-image extensions", () => {
    const content = `![alt](document.pdf)`;
    const result = extractImageReferences(content);
    expect(result).toHaveLength(0);
  });

  it("ignores regular links", () => {
    const content = `[link text](page.html)`;
    const result = extractImageReferences(content);
    expect(result).toHaveLength(0);
  });

  it("returns empty array for content with no images", () => {
    const content = `# Just text\n\nNo images here.`;
    const result = extractImageReferences(content);
    expect(result).toHaveLength(0);
  });

  it("handles empty content", () => {
    const result = extractImageReferences("");
    expect(result).toHaveLength(0);
  });

  it("handles mixed Markdown and HTML images", () => {
    const content = `
![MD image](photo.png)
<img src="diagram.svg" />
    `;
    const result = extractImageReferences(content);
    expect(result).toContain("photo.png");
    expect(result).toContain("diagram.svg");
    expect(result).toHaveLength(2);
  });

  it("handles AVIF images", () => {
    const content = `![alt](image.avif)`;
    const result = extractImageReferences(content);
    expect(result).toEqual(["image.avif"]);
  });

  it("handles uppercase extensions", () => {
    const content = `![alt](IMAGE.JPG)`;
    const result = extractImageReferences(content);
    expect(result).toEqual(["IMAGE.JPG"]);
  });

  it("handles GIF images", () => {
    const content = `![loading](animation.gif)`;
    const result = extractImageReferences(content);
    expect(result).toEqual(["animation.gif"]);
  });

  it("handles inline Markdown images within text", () => {
    const content = `Here is an inline image: ![icon](icon.svg) at the end.`;
    const result = extractImageReferences(content);
    expect(result).toEqual(["icon.svg"]);
  });
});
