/**
 * @file
 * This module provides a rehype plugin for converting Notesaw block syntax nodes
 * into styled HTML elements with icons and labels.
 *
 * This is a simplified version of the original Notesaw transformer, with all
 * VS Code extension-specific logic (line mapping, partial rendering, cursor sync)
 * removed. It only handles the block → styled HTML transformation.
 */
import { visit } from "unist-util-visit";

import type { Element } from "hast";

/**
 * Generates a deterministic hash from a string, used for assigning colors.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Creates a rehype plugin that transforms Notesaw block elements in the HAST.
 *
 * The plugin:
 * 1. Finds elements with class names ending in `-block-mdast` or `-inline-block-mdast`
 * 2. Restructures them into styled containers with icons and labels
 * 3. Assigns deterministic colors based on block label name
 */
export function noteTransformPlugin() {
  return function transformer(tree: Element) {
    if (!tree || !tree.children?.length) return;

    visit(tree, "element", (node: Element) => {
      const classNames = node.properties?.["class"]?.toString() ?? "";
      const classList = classNames.split(" ");

      for (const className of classList) {
        if (className.endsWith("-inline-block-mdast")) {
          transformInlineBlock(node, className);
          break;
        } else if (className.endsWith("-block-mdast")) {
          transformBlock(node, className);
          break;
        } else if (className.includes("box")) {
          node.tagName = "span";
          break;
        }
      }
    });
  };
}

/**
 * Icon mapping from block label to Feather icon name.
 */
const iconMap: Record<string, string> = {
  axiom: "check-circle",
  theorem: "bookmark",
  proof: "edit-3",
  lemma: "layers",
  law: "tool",
  proposition: "file-text",
  corollary: "corner-right-down",
  def: "compass",
  definition: "compass",
  tip: "info",
  note: "bookmark",
  mark: "bookmark",
  remark: "bell",
  reminder: "bell",
  key: "key",
  example: "list",
  problem: "help-circle",
  solution: "check",
  notice: "alert-circle",
  alert: "alert-triangle",
  warning: "alert-triangle",
  caution: "alert-octagon",
  variables: "list",
  algorithm: "cpu",
  code: "code",
  important: "star",
  remember: "star",
  summary: "star",
  method: "tool",
  extend: "zap",
  extension: "zap",
  discuss: "message-square",
  question: "help-circle",
  exercise: "edit-2",
  reference: "book",
  link: "link",
};

/**
 * Transforms an inline block element (class ending with `-inline-block-mdast`).
 *
 * Output structure:
 * ```html
 * <div class="inline-block-container {label}-inline-block-container" style="border-left-color: {hsl};">
 *   <svg class="block-icon">...</svg>
 *   <span class="block-label">{Label}</span>
 *   ...original children...
 * </div>
 * ```
 */
function transformInlineBlock(node: Element, className: string) {
  const blockLabel = className.slice(0, -19);
  const blockLabelCap = blockLabel.charAt(0).toUpperCase() + blockLabel.slice(1);

  const labelHash = hashString(blockLabel);
  const hslColor = `hsl(${labelHash % 360}, 80%, 70%)`;

  node.properties = {
    class: "inline-block-container " + blockLabel + "-inline-block-container",
    style: `border-left-color: ${hslColor};`,
  };

  const icon = iconMap[blockLabel] || "chevron-right";
  const iconNode: Element = {
    type: "element",
    tagName: "svg",
    properties: {
      class: "block-icon",
      style: `stroke: ${hslColor}; fill: transparent`,
    },
    children: [
      {
        type: "element",
        tagName: "use",
        properties: {
          href: "#" + icon,
        },
        children: [],
      },
    ],
  };
  const labelNode: Element = {
    type: "element",
    tagName: "span",
    properties: {
      class: "block-label",
      style: `color: ${hslColor};`,
    },
    children: [
      {
        type: "text",
        value: blockLabelCap,
      },
    ],
  };
  node.children = [iconNode, labelNode, ...node.children];
}

/**
 * Transforms a block element (class ending with `-block-mdast`).
 *
 * Output structure:
 * ```html
 * <div class="block-container {label}-block-container" style="border-left-color: {hsl};">
 *   <div class="block-title">
 *     <svg class="block-icon">...</svg>
 *     <span class="block-label">{Label}</span>
 *     <div class="block-title-content">...</div>
 *   </div>
 *   <div class="block-body">
 *     ...original non-title children...
 *   </div>
 * </div>
 * ```
 */
function transformBlock(node: Element, className: string) {
  const blockLabel = className.slice(0, -12);
  const blockLabelCap = blockLabel.charAt(0).toUpperCase() + blockLabel.slice(1);

  const labelHash = hashString(blockLabel);
  const hslColor = `hsl(${labelHash % 360}, 80%, 70%)`;

  node.properties = {
    class: "block-container " + blockLabel + "-block-container",
    style: `border-left-color: ${hslColor};`,
  };

  const titleNode: Element = {
    type: "element",
    tagName: "div",
    properties: {
      class: "block-title",
    },
    children: [] as Element[],
  };

  const bodyNode: Element = {
    type: "element",
    tagName: "div",
    properties: {
      class: "block-body",
    },
    children: [] as Element[],
  };

  const icon = iconMap[blockLabel] || "chevron-right";
  const iconNode: Element = {
    type: "element",
    tagName: "svg",
    properties: {
      class: "block-icon",
      style: `stroke: ${hslColor}; fill: transparent`,
    },
    children: [
      {
        type: "element",
        tagName: "use",
        properties: {
          href: "#" + icon,
        },
        children: [],
      },
    ],
  };
  const labelNode: Element = {
    type: "element",
    tagName: "span",
    properties: {
      class: "block-label",
      style: `color: ${hslColor};`,
    },
    children: [
      {
        type: "text",
        value: blockLabelCap,
      },
    ],
  };
  titleNode.children.push(iconNode);
  titleNode.children.push(labelNode);

  for (const child of node.children as Element[]) {
    const childClass = child.properties?.["class"]?.toString() ?? "";
    if (childClass.includes("block-title")) {
      titleNode.children.push(child);
    } else {
      bodyNode.children.push(child);
    }
  }

  node.children = [titleNode, bodyNode];
}
