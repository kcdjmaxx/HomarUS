// Built-in tool: git — safe git operations with guardrails
import { exec } from "node:child_process";
import type { ToolDefinition, ToolContext, ToolResult } from "../types.js";

type GitAction =
  | "status" | "diff" | "log" | "show" | "branch" | "branches"
  | "add" | "commit" | "checkout" | "pull" | "push" | "fetch"
  | "stash" | "stash_pop" | "merge" | "rebase"
  | "blame" | "tag" | "tags" | "remote" | "init" | "clone";

interface GitParams {
  action: GitAction;
  args?: string;
  message?: string;
  path?: string;
}

// Actions that modify state — require confirmation context
const WRITE_ACTIONS = new Set<string>([
  "add", "commit", "checkout", "pull", "push", "fetch",
  "stash", "stash_pop", "merge", "rebase", "tag", "init", "clone",
]);

// Dangerous patterns that are always blocked
const BLOCKED_PATTERNS = [
  /--force\b/,
  /push\s+--force/,
  /reset\s+--hard/,
  /clean\s+-f/,
  /branch\s+-D/,
  /--no-verify/,
];

function buildCommand(action: GitAction, args?: string, message?: string): string {
  switch (action) {
    case "status": return `git status${args ? " " + args : ""}`;
    case "diff": return `git diff${args ? " " + args : ""}`;
    case "log": return `git log --oneline -20${args ? " " + args : ""}`;
    case "show": return `git show${args ? " " + args : " HEAD"}`;
    case "branch": return `git branch${args ? " " + args : ""}`;
    case "branches": return "git branch -a";
    case "add": return `git add ${args ?? "."}`;
    case "commit": {
      if (!message) return "echo 'Error: commit requires a message'";
      return `git commit -m ${JSON.stringify(message)}`;
    }
    case "checkout": return `git checkout ${args ?? ""}`;
    case "pull": return `git pull${args ? " " + args : ""}`;
    case "push": return `git push${args ? " " + args : ""}`;
    case "fetch": return `git fetch${args ? " " + args : " --all"}`;
    case "stash": return `git stash${args ? " " + args : ""}`;
    case "stash_pop": return "git stash pop";
    case "merge": return `git merge ${args ?? ""}`;
    case "rebase": return `git rebase ${args ?? ""}`;
    case "blame": return `git blame ${args ?? ""}`;
    case "tag": return `git tag ${args ?? ""}`;
    case "tags": return "git tag -l";
    case "remote": return `git remote ${args ?? "-v"}`;
    case "init": return "git init";
    case "clone": return `git clone ${args ?? ""}`;
    default: return `git ${action}${args ? " " + args : ""}`;
  }
}

export const gitTool: ToolDefinition = {
  name: "git",
  description: `Git operations with safety guardrails. Blocks force-push, hard reset, and destructive commands. Actions: status, diff, log, show, branch, branches, add, commit (requires message), checkout, pull, push, fetch, stash, stash_pop, merge, rebase, blame, tag, tags, remote, init, clone.`,
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "The git action to perform",
        enum: [
          "status", "diff", "log", "show", "branch", "branches",
          "add", "commit", "checkout", "pull", "push", "fetch",
          "stash", "stash_pop", "merge", "rebase",
          "blame", "tag", "tags", "remote", "init", "clone",
        ],
      },
      args: { type: "string", description: "Additional arguments (e.g. file paths, branch names, flags)" },
      message: { type: "string", description: "Commit message (required for commit action)" },
      path: { type: "string", description: "Working directory for the git command" },
    },
    required: ["action"],
  },
  source: "builtin",

  async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
    const { action, args, message, path } = params as GitParams;

    if (context.sandbox && WRITE_ACTIONS.has(action)) {
      return { output: "", error: `git ${action} is not available in sandbox mode` };
    }

    const command = buildCommand(action, args, message);

    // Safety check — block dangerous patterns
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        return { output: "", error: `Blocked: "${command}" matches dangerous pattern. Use bash tool directly if you really need this.` };
      }
    }

    const cwd = path ? path : context.workingDir;

    return new Promise((resolve) => {
      exec(command, {
        cwd,
        timeout: 60_000,
        maxBuffer: 5 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      }, (error, stdout, stderr) => {
        let output = stdout;
        if (stderr) {
          // Git uses stderr for progress info — include it
          output += (output ? "\n" : "") + stderr;
        }

        if (output.length > 50_000) {
          output = output.slice(0, 50_000) + "\n... (truncated)";
        }

        if (error) {
          resolve({ output, error: `git ${action} failed (exit ${error.code}): ${error.message}` });
        } else {
          resolve({ output });
        }
      });
    });
  },
};
