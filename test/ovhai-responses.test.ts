/**
 * OVH AI Endpoints /v1/responses API Test Suite
 *
 * Run with: npm run test:responses
 *
 * Validates the OVH provider when OVH_AI_API=openai-responses for:
 * - Basic connectivity
 * - Streaming SSE
 * - Reasoning
 * - Single tool calling
 * - Parallel tool calling
 * - Sequential tool calling (multi-turn replay)
 * - Non-tool multi-turn memory
 *
 * Set OVH_TEST_MODELS to override the default model list, e.g.:
 *   OVH_TEST_MODELS="ovhai/gpt-oss-120b,ovhai/Qwen3.6-27B" npm run test:responses
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";

/**
 * Resolve the `pi` binary to spawn.
 *
 * `npm run` prepends `node_modules/.bin` to PATH, which would resolve `pi`
 * to the local devDependency (@earendil-works/pi-coding-agent) instead of
 * the globally installed pi. Since the package under test is a peer plugin
 * of the *global* pi, always prefer the global binary. Override with
 * OVH_TEST_PI_BIN if needed.
 */
const PI_BIN = process.env.OVH_TEST_PI_BIN ?? "pi";

function globalPiEnv(): NodeJS.ProcessEnv {
  const path = (process.env.PATH ?? "")
    .split(delimiter)
    .filter((p) => !p.includes("node_modules/.bin"))
    .join(delimiter);
  return { ...process.env, PATH: path, OVH_AI_API: "openai-responses" };
}

interface TestResult {
  name: string;
  model: string;
  status: "PASS" | "FAIL" | "TIMEOUT" | "SKIP";
  durationMs: number;
  output?: string;
  error?: string;
  timestamp: string;
}

interface TestRun {
  date: string;
  totalTests: number;
  passed: number;
  failed: number;
  timeouts: number;
  skipped: number;
  results: TestResult[];
}

const MODELS = process.env.OVH_TEST_MODELS?.split(",").map((m) => m.trim()) || [
  "ovhai/gpt-oss-120b",
  "ovhai/Qwen3.6-27B",
];

const OVH_BASE_URL = "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1";

function execPi(
  args: string[],
  options: { timeout?: number; env?: Record<string, string> } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(PI_BIN, ["-ne", "-e", ".", ...args], {
      cwd: process.cwd(),
      env: { ...globalPiEnv(), ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), options.timeout ?? 120_000);
    child.stdout.on("data", (c) => {
      stdout += c.toString();
    });
    child.stderr.on("data", (c) => {
      const s = c.toString();
      stderr += s;
      process.stderr.write(s);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode });
    });
    child.on("exit", () => clearTimeout(timer));
  });
}

interface ToolExecution {
  toolName: string;
  args: Record<string, unknown>;
  result?: string;
}

function rpcPrompts(
  model: string,
  prompts: string[],
  options: { timeout?: number } = {},
): Promise<{
  texts: string[];
  toolExecutions: ToolExecution[];
  raw: string;
  exitCode: number | null;
}> {
  return new Promise((resolve) => {
    const args = ["-ne", "-e", ".", "--no-session", "--mode", "rpc", "--model", model];
    const child = spawn(PI_BIN, args, {
      cwd: process.cwd(),
      env: globalPiEnv(),
    });
    let buf = "";
    let stdinClosed = false;
    const texts: string[] = [];
    const toolExecutions: ToolExecution[] = [];
    const timeoutMs = options.timeout ?? 120_000;
    const timer = setTimeout(() => {
      if (!stdinClosed) {
        stdinClosed = true;
        child.kill("SIGKILL");
      }
    }, timeoutMs);

    child.stdout.on("data", (c) => {
      buf += c.toString();
    });
    child.stderr.on("data", (c) => {
      process.stderr.write(c);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      for (const line of buf.split("\n")) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line);
          if (e.type === "message_update" && e.assistantMessageEvent?.type === "text_end") {
            texts.push(e.assistantMessageEvent.content);
          }
          if (e.type === "tool_execution_start") {
            toolExecutions.push({ toolName: e.toolName, args: e.args ?? {} });
          }
          if (e.type === "tool_execution_end") {
            const exec = toolExecutions.find((t) => t.toolName === e.toolName && !t.result);
            if (exec) {
              exec.result = e.result?.content?.[0]?.text;
            }
          }
        } catch {
          // Ignore non-JSON lines
        }
      }
      resolve({ texts, toolExecutions, raw: buf, exitCode });
    });

    let delay = 500;
    for (const prompt of prompts) {
      setTimeout(() => {
        if (!stdinClosed) {
          child.stdin.write(`${JSON.stringify({ type: "prompt", message: prompt })}
`);
        }
      }, delay);
      delay += 30_000;
    }
    setTimeout(() => {
      if (!stdinClosed) {
        stdinClosed = true;
        child.stdin.end();
      }
    }, delay + 5_000);
  });
}

function streamingTest(model: string): Promise<boolean> {
  return new Promise((resolve) => {
    const token = process.env.OVH_AI_TOKEN;
    if (!token) {
      resolve(false);
      return;
    }
    const curl = spawn("curl", [
      "-sS",
      "-N",
      "-X",
      "POST",
      `${OVH_BASE_URL}/responses`,
      "-H",
      `Authorization: Bearer ${token}`,
      "-H",
      "Content-Type: application/json",
      "-H",
      "Accept: text/event-stream",
      "-d",
      JSON.stringify({
        model: model.replace("ovhai/", ""),
        store: false,
        stream: true,
        input: [{ type: "message", role: "user", content: "Say exactly hi" }],
      }),
    ]);
    let out = "";
    const timer = setTimeout(() => curl.kill("SIGKILL"), 60_000);
    curl.stdout.on("data", (c) => {
      out += c.toString();
    });
    curl.on("close", () => {
      clearTimeout(timer);
      resolve(out.includes("response.created") || out.includes("response.output_text"));
    });
  });
}

async function runScenario(model: string, scenario: string): Promise<TestResult> {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  try {
    let result: TestResult | undefined;

    switch (scenario) {
      case "basic": {
        const { stdout, stderr, exitCode } = await execPi(
          ["--no-session", "--model", model, "-p", "Say exactly: RESPONSES_BASIC_OK"],
          { timeout: 60_000 },
        );
        const ok = exitCode === 0 && stdout.includes("RESPONSES_BASIC_OK");
        result = {
          name: "Basic connectivity",
          model,
          status: ok ? "PASS" : "FAIL",
          durationMs: Date.now() - start,
          output: stdout.trim(),
          error: stderr || undefined,
          timestamp,
        };
        break;
      }

      case "streaming": {
        const ok = await streamingTest(model);
        result = {
          name: "Streaming SSE",
          model,
          status: ok ? "PASS" : "FAIL",
          durationMs: Date.now() - start,
          timestamp,
        };
        break;
      }

      case "reasoning": {
        const { stdout, stderr, exitCode } = await execPi(
          ["--no-session", "--model", model, "-p", "Calculate 7*8+10. Show each step briefly."],
          { timeout: 90_000 },
        );
        const ok = exitCode === 0 && stdout.includes("66");
        result = {
          name: "Reasoning / math",
          model,
          status: ok ? "PASS" : "FAIL",
          durationMs: Date.now() - start,
          output: stdout.trim().slice(0, 200),
          error: stderr || undefined,
          timestamp,
        };
        break;
      }

      case "tool_single": {
        const { stdout, stderr, exitCode } = await execPi(
          [
            "--no-session",
            "--model",
            model,
            "-p",
            "Use the bash tool to run 'echo TOOL_SINGLE_OK' and report the output.",
          ],
          { timeout: 120_000 },
        );
        const ok = exitCode === 0 && stdout.includes("TOOL_SINGLE_OK");
        result = {
          name: "Tool calling - single",
          model,
          status: ok ? "PASS" : "FAIL",
          durationMs: Date.now() - start,
          output: stdout.trim().slice(0, 200),
          error: stderr || undefined,
          timestamp,
        };
        break;
      }

      case "tool_parallel": {
        const { stdout, stderr, exitCode } = await execPi(
          [
            "--no-session",
            "--model",
            model,
            "-p",
            "Use two separate bash tool calls in one response: one to echo ALPHA and one to echo BETA. Report both outputs.",
          ],
          { timeout: 120_000 },
        );
        const ok = exitCode === 0 && stdout.includes("ALPHA") && stdout.includes("BETA");
        result = {
          name: "Tool calling - parallel",
          model,
          status: ok ? "PASS" : "FAIL",
          durationMs: Date.now() - start,
          output: stdout.trim().slice(0, 300),
          error: stderr || undefined,
          timestamp,
        };
        break;
      }

      case "tool_sequential": {
        const { toolExecutions, exitCode } = await rpcPrompts(
          model,
          [
            "First use the bash tool to run 'echo SEQ_FIRST'. Then, in a second separate tool call, use bash to run 'echo SEQ_SECOND:' followed by the exact word from the first tool's output.",
          ],
          { timeout: 180_000 },
        );
        const bashCalls = toolExecutions.filter((t) => t.toolName === "bash");
        const firstCmd = String(bashCalls[0]?.args.command ?? "");
        const secondCmd = String(bashCalls[1]?.args.command ?? "");
        const ok =
          exitCode === 0 &&
          bashCalls.length >= 2 &&
          firstCmd.includes("SEQ_FIRST") &&
          secondCmd.includes("SEQ_SECOND") &&
          secondCmd.includes("SEQ_FIRST");
        result = {
          name: "Tool calling - sequential (multi-turn replay)",
          model,
          status: ok ? "PASS" : "FAIL",
          durationMs: Date.now() - start,
          output: bashCalls
            .map((t, i) => `Call ${i + 1}: ${String(t.args.command)} => ${t.result ?? "?"}`)
            .join("\n"),
          error:
            exitCode === 0
              ? `expected >=2 bash calls with SEQ_FIRST then SEQ_SECOND, got: ${JSON.stringify(
                  bashCalls.map((t) => t.args.command),
                )}`
              : `pi exited with code ${exitCode}`,
          timestamp,
        };
        break;
      }

      case "memory": {
        const { texts, exitCode } = await rpcPrompts(
          model,
          [
            "Remember the word BANANA. Reply with exactly: OK, remembered.",
            "What was the exact word? Reply with one word only.",
          ],
          { timeout: 180_000 },
        );
        const ok = exitCode === 0 && texts.length === 2 && texts[1].trim() === "BANANA";
        result = {
          name: "Multi-turn memory",
          model,
          status: ok ? "PASS" : texts.length < 2 ? "TIMEOUT" : "FAIL",
          durationMs: Date.now() - start,
          output: texts.map((t, i) => `Turn ${i + 1}: ${t}`).join("\n"),
          timestamp,
        };
        break;
      }

      default:
        result = {
          name: scenario,
          model,
          status: "SKIP",
          durationMs: Date.now() - start,
          timestamp,
        };
    }

    return result;
  } catch (error) {
    return {
      name: scenario,
      model,
      status: "FAIL",
      durationMs: Date.now() - start,
      error: (error as Error).message,
      timestamp,
    };
  }
}

function generateReport(run: TestRun): string {
  const lines = [
    "# OVH AI Endpoints /v1/responses Test Results",
    "",
    `**Date:** ${run.date}`,
    `**Models:** ${MODELS.join(", ")}`,
    `**Total Tests:** ${run.totalTests}`,
    `**Passed:** ${run.passed} ✅`,
    `**Failed:** ${run.failed} ❌`,
    `**Timeouts:** ${run.timeouts} ⏱️`,
    `**Skipped:** ${run.skipped} ⏭️`,
    "",
    "## Summary",
    "",
    "| Test | Model | Status | Duration |",
    "|------|-------|--------|----------|",
  ];

  for (const r of run.results) {
    const icon =
      r.status === "PASS" ? "✅" : r.status === "FAIL" ? "❌" : r.status === "TIMEOUT" ? "⏱️" : "⏭️";
    lines.push(
      `| ${r.name} | ${r.model.split("/").pop()} | ${icon} ${r.status} | ${(r.durationMs / 1000).toFixed(1)}s |`,
    );
  }

  lines.push("", "## Details", "");

  for (const r of run.results) {
    lines.push(
      `### ${r.name} (${r.model})`,
      "",
      `- **Status:** ${r.status}`,
      `- **Duration:** ${(r.durationMs / 1000).toFixed(1)}s`,
    );
    if (r.output) {
      lines.push(`- **Output:**\n\n\`\`\`\n${r.output}\n\`\`\``);
    }
    if (r.error) {
      lines.push(`- **Error:** ${r.error}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  console.log("🧪 OVH AI Endpoints /v1/responses Test Suite\n");
  console.log(`Models: ${MODELS.join(", ")}\n`);

  const scenarios = [
    "basic",
    "streaming",
    "reasoning",
    "tool_single",
    "tool_parallel",
    "tool_sequential",
    "memory",
  ];

  const results: TestResult[] = [];

  for (const model of MODELS) {
    for (const scenario of scenarios) {
      const label = `${scenario} (${model})`;
      console.log(`[RUN] ${label}...`);
      const r = await runScenario(model, scenario);
      results.push(r);
      const icon =
        r.status === "PASS"
          ? "✅"
          : r.status === "FAIL"
            ? "❌"
            : r.status === "TIMEOUT"
              ? "⏱️"
              : "⏭️";
      console.log(`      ${icon} ${r.status} (${(r.durationMs / 1000).toFixed(1)}s)`);
      if (r.error && r.status !== "PASS") {
        console.log(`      ${r.error.slice(0, 150)}`);
      }
      // Small delay between tests to avoid rate limits
      await new Promise((res) => setTimeout(res, 1000));
    }
  }

  const run: TestRun = {
    date: new Date().toISOString(),
    totalTests: results.length,
    passed: results.filter((r) => r.status === "PASS").length,
    failed: results.filter((r) => r.status === "FAIL").length,
    timeouts: results.filter((r) => r.status === "TIMEOUT").length,
    skipped: results.filter((r) => r.status === "SKIP").length,
    results,
  };

  const resultsDir = join(process.cwd(), "test-results");
  if (!existsSync(resultsDir)) {
    mkdirSync(resultsDir, { recursive: true });
  }

  const jsonPath = join(resultsDir, `ovhai-responses-${Date.now()}.json`);
  writeFileSync(jsonPath, JSON.stringify(run, null, 2));
  console.log(`\n💾 JSON results: ${jsonPath}`);

  const reportPath = join(resultsDir, `ovhai-responses-${Date.now()}.md`);
  writeFileSync(reportPath, generateReport(run));
  console.log(`📝 Markdown report: ${reportPath}`);

  console.log(`\n${"=".repeat(50)}`);
  console.log("Summary");
  console.log("=".repeat(50));
  console.log(`Total:   ${run.totalTests}`);
  console.log(`Passed:  ${run.passed} ✅`);
  console.log(`Failed:  ${run.failed} ❌`);
  console.log(`Timeouts:${run.timeouts} ⏱️`);
  console.log(`Skipped: ${run.skipped} ⏭️`);
  console.log("=".repeat(50));

  process.exit(run.failed > 0 || run.timeouts > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export type { TestResult, TestRun };
export { generateReport, MODELS, runScenario };
