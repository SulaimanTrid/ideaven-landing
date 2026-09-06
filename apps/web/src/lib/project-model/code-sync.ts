import type * as ts from "typescript";
import type {
  ProjectModelBlock,
  ProjectModelHandler,
  ProjectModelScreen,
} from "@/types/project";
import { genId } from "./ops";

/**
 * Code → Model synchronization for the supported visual subset.
 *
 * The edited source is parsed with the real TypeScript compiler frontend
 * (never regex), checked against the exact language the deterministic code
 * generator emits, and — only when the whole screen matches — converted back
 * into block handlers. Anything outside the subset is reported with line and
 * column so the UI can keep the code safe as custom code. This module never
 * throws on user input and never invents blocks it cannot prove.
 */

export interface SyncDiagnostic {
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning" | "info";
}

export type CodeSyncStatus =
  /** whole screen matches the subset; `handlers` is the converted program */
  | "visual"
  /** parses, but contains constructs the visual editor cannot represent */
  | "mixed"
  /** custom code kept verbatim; no conversion attempted beyond parsing */
  | "code-only"
  /** syntax errors; conversion refused */
  | "invalid";

export interface CodeSyncResult {
  status: CodeSyncStatus;
  diagnostics: SyncDiagnostic[];
  /** Present only when status === "visual". Fresh IDs, ready to commit. */
  handlers?: ProjectModelHandler[];
  unsupported?: { line: number; column: number; snippet: string }[];
}

const RUNTIME_IMPORT = "@ideaven/runtime";

type TSModule = typeof import("typescript");

/** Public entry — async because the parser loads on demand. */
export async function syncScreenCode(
  screen: ProjectModelScreen,
  code: string,
): Promise<CodeSyncResult> {
  void screen;
  const tsMod: TSModule = await import("typescript");
  const sourceFile = tsMod.createSourceFile("screen.ts", code, (tsMod.ScriptTarget as typeof ts.ScriptTarget).ES2020, true);

  const diagnostics: SyncDiagnostic[] = [];
  const unsupported: { line: number; column: number; snippet: string }[] = [];

  // Parse diagnostics from the real frontend, with real line/column.
  const parseDiags: readonly ts.Diagnostic[] =
    (sourceFile as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
  for (const diag of parseDiags) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(diag.start ?? 0);
    diagnostics.push({
      line: line + 1,
      column: character + 1,
      message: tsMod.flattenDiagnosticMessageText(diag.messageText, "\n"),
      severity: "error",
    });
  }
  if (parseDiags.length > 0) {
    return { status: "invalid", diagnostics, unsupported };
  }

  const apiName = findApiParameter(tsMod, sourceFile);
  if (apiName === null) {
    unsupported.push(marker(sourceFile, code, sourceFile.getStart()));
    return { status: "code-only", diagnostics, unsupported };
  }

  // Walk top-level statements; collect handler bindings and unsupported nodes.
  const handlers: ProjectModelHandler[] = [];
  for (const statement of sourceFile.statements) {
    collectFromStatement(tsMod, sourceFile, statement, apiName, handlers, unsupported, code);
  }

  if (unsupported.length > 0) {
    return {
      status: handlers.length > 0 ? "mixed" : "code-only",
      diagnostics,
      handlers: handlers.length > 0 ? handlers : undefined,
      unsupported,
    };
  }

  if (handlers.length === 0) {
    // A file with no handlers at all still matches the subset (empty logic).
    return { status: "visual", diagnostics, handlers: [] };
  }
  return { status: "visual", diagnostics, handlers };
}

// ---- extraction -----------------------------------------------------------------

function findApiParameter(tsMod: TSModule, sourceFile: ts.SourceFile): string | null {
  for (const statement of sourceFile.statements) {
    if (tsMod.isFunctionDeclaration(statement) && statement.body) {
      for (const parameter of statement.parameters) {
        if (tsMod.isIdentifier(parameter.name)) return parameter.name.text;
      }
    }
  }
  return null;
}

function collectFromStatement(
  tsMod: TSModule,
  sf: ts.SourceFile,
  statement: ts.Statement,
  apiName: string,
  handlers: ProjectModelHandler[],
  unsupported: { line: number; column: number; snippet: string }[],
  code: string,
) {
  // import statements: only the runtime import is expected.
  if (tsMod.isImportDeclaration(statement)) {
    const module = tsMod.isStringLiteral(statement.moduleSpecifier)
      ? statement.moduleSpecifier.text
      : "";
    if (module !== RUNTIME_IMPORT) {
      unsupported.push(marker(sf, code, statement.getStart(sf)));
    }
    return;
  }

  if (tsMod.isFunctionDeclaration(statement)) {
    if (statement.body) {
      for (const inner of statement.body.statements) {
        collectStatement(tsMod, sf, inner, apiName, handlers, unsupported, code);
      }
    }
    return;
  }

  // Allow handlers at top level too (generated shape keeps them in the fn).
  collectStatement(tsMod, sf, statement, apiName, handlers, unsupported, code);
}

function collectStatement(
  tsMod: TSModule,
  sf: ts.SourceFile,
  statement: ts.Statement,
  apiName: string,
  handlers: ProjectModelHandler[],
  unsupported: { line: number; column: number; snippet: string }[],
  code: string,
) {
  if (tsMod.isExpressionStatement(statement) && tsMod.isCallExpression(statement.expression)) {
    const call = statement.expression;
    const method = methodNameOf(tsMod, call.expression);
    if (method === "onComponent" && call.arguments.length === 3) {
      const componentId = stringArg(tsMod, call.arguments[0]);
      const event = stringArg(tsMod, call.arguments[1]);
      const body = arrowBodyStatements(tsMod, call.arguments[2]);
      if (componentId !== null && event !== null && body !== null) {
        handlers.push({
          id: genId("h"),
          componentId,
          event,
          body: body.map((s) => convertStatement(tsMod, sf, s, apiName, unsupported, code)),
        });
        return;
      }
    }
    if (method === "onScreen" && call.arguments.length === 2) {
      const event = stringArg(tsMod, call.arguments[0]);
      const body = arrowBodyStatements(tsMod, call.arguments[1]);
      if (event !== null && body !== null) {
        handlers.push({
          id: genId("h"),
          componentId: null,
          event,
          body: body.map((s) => convertStatement(tsMod, sf, s, apiName, unsupported, code)),
        });
        return;
      }
    }
  }
  unsupported.push(marker(sf, code, statement.getStart(sf)));
}

function convertStatement(
  tsMod: TSModule,
  sf: ts.SourceFile,
  statement: ts.Statement,
  apiName: string,
  unsupported: { line: number; column: number; snippet: string }[],
  code: string,
): ProjectModelBlock {
  if (tsMod.isExpressionStatement(statement) && tsMod.isCallExpression(statement.expression)) {
    const call = statement.expression;
    const method = methodNameOf(tsMod, call.expression);
    if (method === "setProperty" && call.arguments.length === 3) {
      const componentId = stringArg(tsMod, call.arguments[0]);
      const property = stringArg(tsMod, call.arguments[1]);
      const value = convertExpression(tsMod, sf, call.arguments[2] as ts.Expression, apiName, unsupported, code);
      if (componentId !== null && property !== null && value !== null) {
        return makeBlock("statement", "set-property", {
          inputs: { componentId, property },
          slots: { value },
        });
      }
    }
    if (method === "setVariable" && call.arguments.length === 2) {
      const name = stringArg(tsMod, call.arguments[0]);
      const value = convertExpression(tsMod, sf, call.arguments[1] as ts.Expression, apiName, unsupported, code);
      if (name !== null && value !== null) {
        return makeBlock("statement", "set-variable", { inputs: { name }, slots: { value } });
      }
    }
    if (method === "show" && call.arguments.length === 1) {
      const message = convertExpression(tsMod, sf, call.arguments[0] as ts.Expression, apiName, unsupported, code);
      if (message !== null) {
        return makeBlock("statement", "show-message", { slots: { message } });
      }
    }
    if (method === "navigate" && call.arguments.length === 1) {
      const screenId = stringArg(tsMod, call.arguments[0]);
      if (screenId !== null) {
        return makeBlock("statement", "navigate", { inputs: { screenId } });
      }
    }
  }

  if (tsMod.isIfStatement(statement)) {
    const condition = convertExpression(tsMod, sf, statement.expression, apiName, unsupported, code);
    if (condition !== null && tsMod.isBlock(statement.thenStatement)) {
      const children: ProjectModelBlock[] = [];
      for (const inner of statement.thenStatement.statements) {
        children.push(convertStatement(tsMod, sf, inner, apiName, unsupported, code));
      }
      const ifBlock = makeBlock("statement", "if", { slots: { condition }, children });
      if (statement.elseStatement && tsMod.isBlock(statement.elseStatement)) {
        ifBlock.elseChildren = [];
        for (const inner of statement.elseStatement.statements) {
          ifBlock.elseChildren.push(convertStatement(tsMod, sf, inner, apiName, unsupported, code));
        }
      }
      return ifBlock;
    }
  }

  unsupported.push(marker(sf, code, statement.getStart(sf)));
  return makeBlock("statement", "unsupported", {});
}

function convertExpression(
  tsMod: TSModule,
  sf: ts.SourceFile,
  node: ts.Expression,
  apiName: string,
  unsupported: { line: number; column: number; snippet: string }[],
  code: string,
): ProjectModelBlock | null {
  void apiName;
  if (tsMod.isStringLiteral(node) || tsMod.isNoSubstitutionTemplateLiteral(node)) {
    return makeBlock("expression", "text", { inputs: { value: node.text } });
  }
  if (tsMod.isNumericLiteral(node)) {
    return makeBlock("expression", "number", { inputs: { value: Number(node.text) } });
  }
  if (node.kind === tsMod.SyntaxKind.TrueKeyword || node.kind === tsMod.SyntaxKind.FalseKeyword) {
    return makeBlock("expression", "text", {
      inputs: { value: node.kind === tsMod.SyntaxKind.TrueKeyword ? "true" : "false" },
    });
  }
  if (tsMod.isCallExpression(node)) {
    const method = methodNameOf(tsMod, node.expression);
    if (method === "getProperty" && node.arguments.length === 2) {
      const componentId = stringArg(tsMod, node.arguments[0]);
      const property = stringArg(tsMod, node.arguments[1]);
      if (componentId !== null && property !== null) {
        return makeBlock("expression", "get-property", { inputs: { componentId, property } });
      }
    }
    if (method === "getVariable" && node.arguments.length === 1) {
      const name = stringArg(tsMod, node.arguments[0]);
      if (name !== null) {
        return makeBlock("expression", "get-variable", { inputs: { name } });
      }
    }
    if (method === "join" && node.arguments.length === 2) {
      const a = convertExpression(tsMod, sf, node.arguments[0] as ts.Expression, apiName, unsupported, code);
      const b = convertExpression(tsMod, sf, node.arguments[1] as ts.Expression, apiName, unsupported, code);
      if (a !== null && b !== null) {
        return makeBlock("expression", "join", { slots: { a, b } });
      }
    }
    if (method === "equals" && node.arguments.length === 2) {
      const a = convertExpression(tsMod, sf, node.arguments[0] as ts.Expression, apiName, unsupported, code);
      const b = convertExpression(tsMod, sf, node.arguments[1] as ts.Expression, apiName, unsupported, code);
      if (a !== null && b !== null) {
        return makeBlock("expression", "equals", { slots: { a, b } });
      }
    }
  }
  unsupported.push(marker(sf, code, node.getStart(sf)));
  return null;
}

// ---- helpers ----------------------------------------------------------------------

function makeBlock(
  kind: "statement" | "expression",
  type: string,
  parts: {
    inputs?: Record<string, string | number | boolean>;
    slots?: Record<string, ProjectModelBlock | undefined>;
    children?: ProjectModelBlock[];
  },
): ProjectModelBlock {
  const result: ProjectModelBlock = { id: genId("b"), kind, type };
  if (parts.inputs) result.inputs = parts.inputs;
  if (parts.slots) result.slots = parts.slots;
  if (parts.children) result.children = parts.children;
  return result;
}

function methodNameOf(tsMod: TSModule, node: ts.Expression): string | null {
  if (tsMod.isPropertyAccessExpression(node) && tsMod.isIdentifier(node.expression)) {
    return node.name.text;
  }
  return null;
}

function stringArg(tsMod: TSModule, node: ts.Expression | undefined): string | null {
  if (node && tsMod.isStringLiteral(node)) return node.text;
  return null;
}

function arrowBodyStatements(
  tsMod: TSModule,
  node: ts.Expression | undefined,
): readonly ts.Statement[] | null {
  if (!node) return null;
  if (tsMod.isArrowFunction(node)) {
    if (node.body && tsMod.isBlock(node.body)) return node.body.statements;
    // Expression-bodied arrows are outside the generated subset.
    return null;
  }
  return null;
}

function marker(
  sf: ts.SourceFile,
  code: string,
  position: number,
): { line: number; column: number; snippet: string } {
  const { line, character } = sf.getLineAndCharacterOfPosition(Math.min(position, code.length));
  const lineText = code.split("\n")[line] ?? "";
  return {
    line: line + 1,
    column: character + 1,
    snippet: lineText.trim().slice(0, 80),
  };
}
