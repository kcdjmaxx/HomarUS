// Built-in tool: lsp — Language Server Protocol operations for code intelligence
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import type { ToolDefinition, ToolContext, ToolResult } from "../types.js";

type LspOperation =
  | "definition" | "references" | "hover" | "symbols"
  | "workspace_symbols" | "implementations" | "diagnostics";

interface LspParams {
  operation: LspOperation;
  file: string;
  line?: number;
  character?: number;
  query?: string;
}

// Simple grep-based code intelligence fallback
// Real LSP integration would use a language server process, but this provides
// useful results without requiring a running server

function findDefinition(filePath: string, line: number, character: number, workingDir: string): string {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  if (line < 1 || line > lines.length) return "Line out of range";

  const targetLine = lines[line - 1];
  // Extract the word at the cursor position
  const word = extractWord(targetLine, character - 1);
  if (!word) return "No symbol at cursor";

  // Search for definition patterns
  const ext = extname(filePath);
  const defPatterns = getDefinitionPatterns(word, ext);

  const results: string[] = [];
  results.push(`Symbol: ${word}`);

  // Search current file first
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of defPatterns) {
      if (pattern.test(lines[i]) && i !== line - 1) {
        results.push(`${filePath}:${i + 1}: ${lines[i].trim()}`);
      }
    }
  }

  return results.length > 1 ? results.join("\n") : `No definition found for "${word}"`;
}

function findReferences(filePath: string, line: number, character: number, workingDir: string): string {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  if (line < 1 || line > lines.length) return "Line out of range";

  const targetLine = lines[line - 1];
  const word = extractWord(targetLine, character - 1);
  if (!word) return "No symbol at cursor";

  const results: string[] = [`References to "${word}":`];
  const wordRegex = new RegExp(`\\b${escapeRegex(word)}\\b`, "g");

  for (let i = 0; i < lines.length; i++) {
    if (wordRegex.test(lines[i])) {
      results.push(`  ${filePath}:${i + 1}: ${lines[i].trim()}`);
      wordRegex.lastIndex = 0;
    }
  }

  return results.length > 1 ? results.join("\n") : `No references found for "${word}"`;
}

function getHover(filePath: string, line: number, character: number): string {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  if (line < 1 || line > lines.length) return "Line out of range";

  const targetLine = lines[line - 1];
  const word = extractWord(targetLine, character - 1);
  if (!word) return "No symbol at cursor";

  // Look for JSDoc/comment above definitions
  const ext = extname(filePath);
  const defPatterns = getDefinitionPatterns(word, ext);

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of defPatterns) {
      if (pattern.test(lines[i])) {
        // Collect comments above definition
        const comments: string[] = [];
        let j = i - 1;
        while (j >= 0 && (lines[j].trim().startsWith("//") || lines[j].trim().startsWith("*") || lines[j].trim().startsWith("/*"))) {
          comments.unshift(lines[j].trim());
          j--;
        }
        const defLine = lines[i].trim();
        if (comments.length > 0) {
          return `${word}\n\n${comments.join("\n")}\n\n${defLine}`;
        }
        return `${word}\n\n${defLine}`;
      }
    }
  }

  return `${word} (no type/doc info available)`;
}

function getDocumentSymbols(filePath: string): string {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const ext = extname(filePath);
  const symbols: string[] = [];

  const patterns = [
    // TypeScript/JavaScript
    { regex: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/, kind: "class" },
    { regex: /^(?:export\s+)?interface\s+(\w+)/, kind: "interface" },
    { regex: /^(?:export\s+)?type\s+(\w+)/, kind: "type" },
    { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/, kind: "function" },
    { regex: /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/, kind: "function" },
    { regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)/, kind: "variable" },
    { regex: /^\s+(?:async\s+)?(\w+)\s*\(/, kind: "method" },
    // Python
    { regex: /^class\s+(\w+)/, kind: "class" },
    { regex: /^def\s+(\w+)/, kind: "function" },
    { regex: /^\s+def\s+(\w+)/, kind: "method" },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { regex, kind } of patterns) {
      const match = line.match(regex);
      if (match) {
        symbols.push(`  ${kind.padEnd(10)} ${match[1].padEnd(30)} line ${i + 1}`);
        break;
      }
    }
  }

  return symbols.length > 0
    ? `Symbols in ${filePath}:\n${symbols.join("\n")}`
    : "No symbols found";
}

function getDiagnostics(filePath: string): string {
  // Basic syntax checks — not a full linter, but catches obvious issues
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const issues: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Unmatched brackets (simple heuristic)
    const opens = (line.match(/[({[]/g) || []).length;
    const closes = (line.match(/[)}\]]/g) || []).length;
    if (Math.abs(opens - closes) > 2) {
      issues.push(`  line ${i + 1}: possible unmatched brackets`);
    }
    // TODO/FIXME markers
    if (/\b(TODO|FIXME|HACK|XXX)\b/.test(line)) {
      issues.push(`  line ${i + 1}: ${line.trim()}`);
    }
  }

  return issues.length > 0
    ? `Diagnostics for ${filePath}:\n${issues.join("\n")}`
    : "No issues found";
}

function extractWord(line: string, pos: number): string | null {
  if (pos < 0 || pos >= line.length) return null;
  const wordChars = /[\w$]/;
  let start = pos;
  let end = pos;
  while (start > 0 && wordChars.test(line[start - 1])) start--;
  while (end < line.length - 1 && wordChars.test(line[end + 1])) end++;
  const word = line.slice(start, end + 1);
  return word.length > 0 ? word : null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getDefinitionPatterns(word: string, ext: string): RegExp[] {
  const escaped = escapeRegex(word);
  return [
    new RegExp(`(?:class|interface|type|enum)\\s+${escaped}\\b`),
    new RegExp(`(?:function|const|let|var)\\s+${escaped}\\b`),
    new RegExp(`(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s+${escaped}\\b`),
    new RegExp(`^\\s+(?:async\\s+)?${escaped}\\s*\\(`),
    new RegExp(`def\\s+${escaped}\\b`), // Python
  ];
}

export const lspTool: ToolDefinition = {
  name: "lsp",
  description: "Code intelligence: find definitions, references, hover info, document symbols, and diagnostics. Works via pattern matching (no running language server required).",
  parameters: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description: "The LSP operation to perform",
        enum: ["definition", "references", "hover", "symbols", "workspace_symbols", "diagnostics"],
      },
      file: { type: "string", description: "File path to operate on" },
      line: { type: "number", description: "Line number (1-based) — required for definition, references, hover" },
      character: { type: "number", description: "Character offset (1-based) — required for definition, references, hover" },
      query: { type: "string", description: "Symbol name to search for (for workspace_symbols)" },
    },
    required: ["operation", "file"],
  },
  source: "builtin",

  async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
    const { operation, file, line, character, query } = params as LspParams;
    const absPath = resolve(context.workingDir, file);

    if (!existsSync(absPath)) {
      return { output: "", error: `File not found: ${absPath}` };
    }

    switch (operation) {
      case "definition":
        if (!line || !character) return { output: "", error: "line and character required for definition" };
        return { output: findDefinition(absPath, line, character, context.workingDir) };

      case "references":
        if (!line || !character) return { output: "", error: "line and character required for references" };
        return { output: findReferences(absPath, line, character, context.workingDir) };

      case "hover":
        if (!line || !character) return { output: "", error: "line and character required for hover" };
        return { output: getHover(absPath, line, character) };

      case "symbols":
        return { output: getDocumentSymbols(absPath) };

      case "workspace_symbols":
        if (!query) return { output: "", error: "query required for workspace_symbols" };
        // Simple grep-based workspace symbol search
        return { output: `Searching for "${query}" — use grep tool for cross-file search` };

      case "diagnostics":
        return { output: getDiagnostics(absPath) };

      default:
        return { output: "", error: `Unknown operation: ${operation}` };
    }
  },
};
