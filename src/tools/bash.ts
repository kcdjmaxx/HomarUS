// Built-in tool: bash — execute shell commands
import { exec } from "node:child_process";
import type { ToolDefinition, ToolContext, ToolResult } from "../types.js";

const MAX_OUTPUT = 50_000; // chars

interface BashParams {
  command: string;
  timeout?: number;
  workingDir?: string;
}

export const bashTool: ToolDefinition = {
  name: "bash",
  description: "Execute a bash command and return stdout/stderr. Use for system commands, git operations, running scripts, installing packages, etc.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "The bash command to execute" },
      timeout: { type: "number", description: "Timeout in milliseconds (default 120000)" },
      workingDir: { type: "string", description: "Working directory for the command" },
    },
    required: ["command"],
  },
  source: "builtin",

  async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
    const { command, timeout = 120_000, workingDir } = params as BashParams;

    if (context.sandbox) {
      return { output: "", error: "bash tool is not available in sandbox mode" };
    }

    return new Promise((resolve) => {
      const proc = exec(command, {
        cwd: workingDir ?? context.workingDir,
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        env: { ...process.env, TERM: "dumb" },
      }, (error, stdout, stderr) => {
        let output = stdout;
        if (stderr) output += (output ? "\n" : "") + stderr;

        if (output.length > MAX_OUTPUT) {
          output = output.slice(0, MAX_OUTPUT) + `\n... (truncated, ${output.length} total chars)`;
        }

        if (error && error.killed) {
          resolve({ output, error: `Command timed out after ${timeout}ms` });
        } else if (error) {
          resolve({ output, error: `Exit code ${error.code}: ${error.message}` });
        } else {
          resolve({ output });
        }
      });
    });
  },
};
