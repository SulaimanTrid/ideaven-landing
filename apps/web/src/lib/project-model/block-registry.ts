"use client";

import { createBlock, getBlockDef, STATEMENT_DEFS, EXPRESSION_DEFS, type BlockDef, type BlockInputSpec } from "./blocks";
import { genId } from "./ops";
import type { ProjectModelBlock } from "@/types/project";

/**
 * The block registry (2.0 Phase 2): built-in vocabulary plus blocks declared
 * by the user's installed extensions. Extension block types are namespaced
 * `ext:<slug>:<type>` so they can never collide with built-ins or each
 * other. This is a view over the same IR — a registry block edits and saves
 * exactly like a built-in; codegen/preview currently skip unknown types with
 * an honest comment (runtime providers for extensions are a later phase).
 */

const extensionDefs = new Map<string, BlockDef>();
/** Extension display name per namespaced type, for palette grouping. */
const extensionNames = new Map<string, string>();

function namespaceType(slug: string, type: string): string {
  return `ext:${slug}:${type}`;
}

/** Register blocks from one installed extension's manifest. Idempotent per slug. */
export function registerExtensionBlocks(
  slug: string,
  name: string,
  blocks: {
    type: string;
    kind: string;
    category?: string;
    label?: string;
    inputs?: { key: string; kind: string; label?: string }[];
    slots?: string[];
    container?: boolean;
  }[],
): void {
  for (const raw of blocks) {
    if (!raw.type || (raw.kind !== "statement" && raw.kind !== "expression")) continue;
    const type = namespaceType(slug, raw.type);
    const category = normalizeCategory(raw.category);
    const def: BlockDef = {
      type,
      kind: raw.kind,
      label: raw.label && raw.label.trim() !== "" ? raw.label : raw.type,
      category,
      inputs: (raw.inputs ?? []).map((input) => ({
        key: input.key,
        kind: normalizeInputKind(input.kind),
        label: input.label ?? input.key,
      })) as BlockInputSpec[],
      slots: (raw.slots ?? []).map((key) => ({ key, label: key })),
      container: raw.container ?? false,
    };
    extensionDefs.set(type, def);
    extensionNames.set(type, name);
  }
}

export function forgetExtensionBlocks(slug: string): void {
  const prefix = `ext:${slug}:`;
  for (const type of [...extensionDefs.keys()]) {
    if (type.startsWith(prefix)) {
      extensionDefs.delete(type);
      extensionNames.delete(type);
    }
  }
}

export function isExtensionBlock(type: string): boolean {
  return type.startsWith("ext:");
}

export function extensionNameFor(type: string): string | undefined {
  return extensionNames.get(type);
}

/** Built-ins first, then extension blocks. */
export function getAnyBlockDef(type: string): BlockDef | undefined {
  return getBlockDef(type) ?? extensionDefs.get(type);
}

export function allStatementDefs(): BlockDef[] {
  return [...STATEMENT_DEFS, ...[...extensionDefs.values()].filter((d) => d.kind === "statement")];
}

export function allExpressionDefs(): BlockDef[] {
  return [...EXPRESSION_DEFS, ...[...extensionDefs.values()].filter((d) => d.kind === "expression")];
}

function normalizeCategory(raw: string | undefined): BlockDef["category"] {
  const allowed: BlockDef["category"][] = [
    "ui",
    "variables",
    "control",
    "navigation",
    "text",
    "logic",
    "audio",
    "storage",
    "connectivity",
    "sensors",
    "media",
  ];
  return allowed.includes(raw as BlockDef["category"]) ? (raw as BlockDef["category"]) : "ui";
}

function normalizeInputKind(raw: string | undefined): BlockInputSpec["kind"] {
  const allowed: BlockInputSpec["kind"][] = ["component", "property", "screen", "variable", "text", "number", "boolean"];
  return allowed.includes(raw as BlockInputSpec["kind"]) ? (raw as BlockInputSpec["kind"]) : "text";
}

/** Create a block from any registry type (built-in or extension), with optional preset inputs. */
export function createRegistryBlock(
  type: string,
  preset?: { inputs?: Record<string, string | number | boolean> },
): ProjectModelBlock | undefined {
  const def = getAnyBlockDef(type);
  if (!def) return undefined;
  if (!isExtensionBlock(type)) return createBlock(type, preset);
  const block: ProjectModelBlock = { id: genId("b"), kind: def.kind, type };
  const inputs = def.inputs ?? [];
  if (inputs.length > 0) {
    block.inputs = {};
    for (const input of inputs) {
      const presetValue = preset?.inputs?.[input.key];
      block.inputs[input.key] = presetValue !== undefined
        ? presetValue
        : input.kind === "number"
          ? 0
          : input.kind === "boolean"
            ? false
            : "";
    }
  }
  if (def.slots) block.slots = Object.fromEntries(def.slots.map((s) => [s.key, undefined]));
  if (def.container) block.children = [];
  return block;
}
