/**
 * OVH AI Endpoints Model Test Suite
 *
 * Run with: npm test
 *
 * This test suite validates all OVH AI models for:
 * - Basic connectivity
 * - Long context generation
 * - Reasoning capabilities
 * - Code generation
 * - JSON structured output
 * - Tool calling
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface TestResult {
  name: string;
  model: string;
  prompt: string;
  status: "PASS" | "FAIL" | "TIMEOUT";
  durationMs: number;
  outputLength?: number;
  error?: string;
  timestamp: string;
}

interface TestRun {
  date: string;
  totalTests: number;
  passed: number;
  failed: number;
  timeouts: number;
  results: TestResult[];
}

const MODELS = {
  fast: "ovhai/Mistral-7B-Instruct-v0.3",
  balanced: "ovhai/Mistral-Small-3.2-24B-Instruct-2506",
  large: "ovhai/Meta-Llama-3_3-70B-Instruct",
  reasoning: "ovhai/gpt-oss-120b",
  fastReasoning: "ovhai/gpt-oss-20b",
  coder: "ovhai/Qwen3-Coder-30B-A3B-Instruct",
  vision: "ovhai/Qwen2.5-VL-72B-Instruct",
};

const TESTS = [
  {
    name: "Basic connectivity",
    model: MODELS.fast,
    prompt: "Say exactly: 'OVH AI test'",
    timeout: 30,
  },
  {
    name: "Long context generation",
    model: MODELS.reasoning,
    prompt:
      "Write a detailed 5-paragraph story about space exploration. Each paragraph at least 100 words.",
    timeout: 90,
  },
  {
    name: "Step-by-step reasoning",
    model: MODELS.reasoning,
    prompt:
      "Solve step by step: If a train travels 120 km in 2 hours, how far will it travel in 5 hours at the same speed?",
    timeout: 60,
  },
  {
    name: "JSON structured output",
    model: MODELS.fastReasoning,
    prompt:
      "Return ONLY a JSON object with fields: name (string), age (number), active (boolean). No markdown.",
    timeout: 45,
  },
  {
    name: "Code generation",
    model: MODELS.fastReasoning,
    prompt: "Write a Python function to calculate factorial. Include docstring.",
    timeout: 60,
  },
  {
    name: "Math calculation",
    model: MODELS.reasoning,
    prompt: "Calculate: (15 * 4) + (60 / 5) - (3^3). Show each step.",
    timeout: 45,
  },
  {
    name: "List generation (50 items)",
    model: MODELS.fast,
    prompt: "List 50 US cities, numbered 1-50, one per line.",
    timeout: 60,
  },
  {
    name: "Creative writing",
    model: MODELS.balanced,
    prompt: "Write a 200-word sci-fi micro-story about AI.",
    timeout: 60,
  },
  {
    name: "Summarization",
    model: MODELS.large,
    prompt:
      "Summarize in 2 sentences: The quick brown fox jumps over the lazy dog. This pangram contains every letter of the alphabet and is used for testing fonts and keyboards.",
    timeout: 45,
  },
  {
    name: "Tool calling - bash",
    model: MODELS.reasoning,
    prompt: "Use the bash tool to run 'echo TEST_SUCCESS' and report the output.",
    timeout: 45,
  },
];

function runTest(test: (typeof TESTS)[0]): TestResult {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const cmd = `pi -ne -e . --no-session --model ${test.model} -p "${test.prompt.replace(/"/g, '\\"')}" 2>&1`;
    const output = execSync(cmd, {
      timeout: test.timeout * 1000,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    const duration = Date.now() - startTime;

    // Check for common failure indicators
    if (
      output.includes("Connection error") ||
      output.includes("timeout") ||
      output.includes("Error:") ||
      output.trim().length === 0
    ) {
      return {
        name: test.name,
        model: test.model,
        prompt: test.prompt,
        status: "FAIL",
        durationMs: duration,
        error: output.trim() || "Empty response",
        timestamp,
      };
    }

    return {
      name: test.name,
      model: test.model,
      prompt: test.prompt,
      status: "PASS",
      durationMs: duration,
      outputLength: output.length,
      timestamp,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error as Error & { code?: string };

    if (err.message?.includes("timeout") || err.code === "ETIMEDOUT") {
      return {
        name: test.name,
        model: test.model,
        prompt: test.prompt,
        status: "TIMEOUT",
        durationMs: duration,
        error: `Timeout after ${test.timeout}s`,
        timestamp,
      };
    }

    return {
      name: test.name,
      model: test.model,
      prompt: test.prompt,
      status: "FAIL",
      durationMs: duration,
      error: err.message || "Unknown error",
      timestamp,
    };
  }
}

function generateReport(run: TestRun): string {
  const lines = [
    "# OVH AI Endpoints Test Results",
    "",
    `**Date:** ${run.date}`,
    `**Total Tests:** ${run.totalTests}`,
    `**Passed:** ${run.passed} ✅`,
    `**Failed:** ${run.failed} ❌`,
    `**Timeouts:** ${run.timeouts} ⏱️`,
    "",
    "## Summary",
    "",
    "| Test | Model | Status | Duration |",
    "|------|-------|--------|----------|",
  ];

  for (const result of run.results) {
    const icon = result.status === "PASS" ? "✅" : result.status === "FAIL" ? "❌" : "⏱️";
    const duration = `${(result.durationMs / 1000).toFixed(1)}s`;
    lines.push(
      `| ${result.name} | ${result.model.split("/").pop()} | ${icon} ${result.status} | ${duration} |`,
    );
  }

  lines.push("", "## Details", "");

  for (const result of run.results) {
    lines.push(
      `### ${result.name}`,
      "",
      `- **Model:** ${result.model}`,
      `- **Status:** ${result.status}`,
      `- **Duration:** ${(result.durationMs / 1000).toFixed(1)}s`,
    );

    if (result.outputLength) {
      lines.push(`- **Output Length:** ${result.outputLength} chars`);
    }

    if (result.error && result.status !== "PASS") {
      lines.push(`- **Error:** ${result.error}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

function main() {
  console.log("🧪 OVH AI Endpoints Test Suite\n");
  console.log(`Running ${TESTS.length} tests...\n`);

  const results: TestResult[] = [];

  for (let i = 0; i < TESTS.length; i++) {
    const test = TESTS[i];
    console.log(`[${i + 1}/${TESTS.length}] ${test.name}...`);

    const result = runTest(test);
    results.push(result);

    const icon = result.status === "PASS" ? "✅" : result.status === "FAIL" ? "❌" : "⏱️";
    console.log(`  ${icon} ${result.status} (${(result.durationMs / 1000).toFixed(1)}s)`);

    if (result.error && result.status !== "PASS") {
      console.log(`  Error: ${result.error.substring(0, 100)}...`);
    }

    // Small delay between tests to avoid rate limiting
    if (i < TESTS.length - 1) {
      execSync("sleep 1");
    }
  }

  const run: TestRun = {
    date: new Date().toISOString(),
    totalTests: results.length,
    passed: results.filter((r) => r.status === "PASS").length,
    failed: results.filter((r) => r.status === "FAIL").length,
    timeouts: results.filter((r) => r.status === "TIMEOUT").length,
    results,
  };

  // Ensure test-results directory exists
  const resultsDir = join(process.cwd(), "test-results");
  if (!existsSync(resultsDir)) {
    mkdirSync(resultsDir, { recursive: true });
  }

  // Save JSON results
  const jsonPath = join(resultsDir, `ovhai-test-${Date.now()}.json`);
  writeFileSync(jsonPath, JSON.stringify(run, null, 2));
  console.log(`\n💾 JSON results saved to: ${jsonPath}`);

  // Save Markdown report
  const reportPath = join(resultsDir, `ovhai-test-${Date.now()}.md`);
  writeFileSync(reportPath, generateReport(run));
  console.log(`📝 Markdown report saved to: ${reportPath}`);

  // Print summary
  console.log(`\n${"=".repeat(50)}`);
  console.log("Test Summary");
  console.log("=".repeat(50));
  console.log(`Total:  ${run.totalTests}`);
  console.log(`Passed: ${run.passed} ✅`);
  console.log(`Failed: ${run.failed} ❌`);
  console.log(`Timeouts: ${run.timeouts} ⏱️`);
  console.log("=".repeat(50));

  // Exit with error code if any tests failed
  process.exit(run.failed > 0 || run.timeouts > 0 ? 1 : 0);
}

// Only run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export type { TestResult, TestRun };
export { generateReport, MODELS, runTest, TESTS };
