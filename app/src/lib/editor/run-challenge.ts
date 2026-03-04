import { transform } from "sucrase";
import type { ChallengeData } from "@/types/course";

export interface TestResult {
  label: string;
  passed: boolean;
  expected: string;
  actual: string;
}

export interface RunResult {
  results: TestResult[];
  allPassed: boolean;
}

const CDN = "https://esm.sh";
const TIMEOUT_MS = 10_000;
const MSG_TYPE = "__challenge__";

/** Rewrites bare npm specifiers to esm.sh CDN URLs so any package resolves natively. */
function rewriteImports(code: string): string {
  return code.replace(
    /from\s*['"]([^'"./][^'"]*)['"]/g,
    (_, pkg) => `from '${CDN}/${pkg}'`,
  );
}

/** Strips TypeScript type annotations. Falls back to raw code on parse error. */
function stripTypes(code: string): string {
  try {
    return transform(code, { transforms: ["typescript"], disableESTransforms: true }).code;
  } catch {
    return code;
  }
}

/** Builds the async test runner injected after user code inside the iframe. */
function buildTestRunner(testCases: ChallengeData["testCases"], fnName: string): string {
  const cases = testCases.map((tc) => {
    const rawInput = JSON.stringify(tc.input);
    const expectedDisplay = JSON.stringify(
      tc.validator ? `validator: ${tc.validator}` : tc.expectedOutput,
    );
    const passExpr = tc.validator
      ? `(function(output){return(${tc.validator})})(__actual)`
      : `__actual===${JSON.stringify(tc.expectedOutput.trim())}`;

    return `
  try {
    const __raw = ${rawInput};
    const __args = __raw === '' ? [] : __raw.split(',').map(s => {
      s = s.trim();
      if ((s.startsWith('"')&&s.endsWith('"'))||(s.startsWith("'")&&s.endsWith("'"))) return s.slice(1,-1);
      const n = Number(s);
      return (!isNaN(n) && s !== '') ? n : s;
    });
    const __actual = String(
      await Promise.resolve(typeof ${fnName} === 'function' ? ${fnName}.apply(null, __args) : undefined)
    ).trim();
    results.push({
      label: ${JSON.stringify(tc.label)},
      passed: !!(${passExpr}),
      expected: ${expectedDisplay},
      actual: __actual,
    });
  } catch(e) {
    results.push({
      label: ${JSON.stringify(tc.label)},
      passed: false,
      expected: ${expectedDisplay},
      actual: e instanceof Error ? e.message : String(e),
    });
  }`;
  }).join("\n");

  return `(async () => {
  const results = [];
  ${cases}
  window.parent.postMessage({ type: '${MSG_TYPE}', results }, '*');
})();`;
}

// Error handler script injected before the module — catches syntax/parse errors
// that would otherwise silently hang until the 10s timeout.
const ERROR_HANDLER = `<script>
window.onerror = function(msg, _src, _line, _col, err) {
  window.parent.postMessage({ type: '${MSG_TYPE}', error: err ? err.message : msg }, '*');
  return true;
};
window.addEventListener('unhandledrejection', function(ev) {
  window.parent.postMessage({
    type: '${MSG_TYPE}',
    error: ev.reason instanceof Error ? ev.reason.message : String(ev.reason)
  }, '*');
});
</script>`;

/**
 * Runs a JSON challenge without the iframe. Parses the user's JSON and runs
 * validators against the parsed value. Validators receive `output` (raw string)
 * and `parsed` (the JS value).
 */
function runJsonChallenge(code: string, challenge: ChallengeData): RunResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(code);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid JSON";
    return {
      results: challenge.testCases.map((tc) => ({
        label: tc.label,
        passed: false,
        expected: tc.validator ? `validator: ${tc.validator}` : tc.expectedOutput,
        actual: msg,
      })),
      allPassed: false,
    };
  }

  const results: TestResult[] = challenge.testCases.map((tc) => {
    const expectedDisplay = tc.validator ? `validator: ${tc.validator}` : tc.expectedOutput;
    try {
      let passed: boolean;
      if (tc.validator) {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        passed = !!new Function("output", "parsed", `return (${tc.validator})`)(code, parsed);
      } else {
        passed = JSON.stringify(parsed) === tc.expectedOutput.trim();
      }
      return { label: tc.label, passed, expected: expectedDisplay, actual: JSON.stringify(parsed) };
    } catch (e) {
      return {
        label: tc.label,
        passed: false,
        expected: expectedDisplay,
        actual: e instanceof Error ? e.message : "Error",
      };
    }
  });

  return { results, allPassed: results.every((r) => r.passed) };
}

const RUST_DELIM = "__TEST_DELIM__";

/** Parses a comma-separated input string into Rust argument literals. */
function toRustArgs(raw: string): string {
  if (raw.trim() === "") return "";
  return raw.split(",").map((s) => {
    s = s.trim();
    // Already quoted — keep as Rust string literal
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s;
    // Numeric
    const n = Number(s);
    if (!isNaN(n) && s !== "") return s;
    // Bare string — wrap in quotes
    return `"${s}"`;
  }).join(", ");
}

/**
 * Builds a Rust program that runs all test cases and prints results separated by a delimiter.
 */
function buildRustProgram(code: string, challenge: ChallengeData): string {
  const fnName = code.match(/fn\s+(\w+)/)?.[1] ?? "solution";

  const calls = challenge.testCases.map((tc) => {
    const args = toRustArgs(tc.input);
    return `    __print_val(${fnName}(${args}));\n    println!("${RUST_DELIM}");`;
  }).join("\n");

  return `${code}

fn __print_val<T: std::fmt::Debug>(val: T) {
    let s = format!("{:?}", val);
    let inner = if s.starts_with("Ok(") && s.ends_with(')') {
        &s[3..s.len()-1]
    } else if s.starts_with("Err(") && s.ends_with(')') {
        &s[4..s.len()-1]
    } else if s.starts_with("Some(") && s.ends_with(')') {
        &s[5..s.len()-1]
    } else if s == "None" {
        "None"
    } else {
        &s
    };
    if inner.len() >= 2 && inner.starts_with('"') && inner.ends_with('"') {
        println!("{}", &inner[1..inner.len()-1]);
    } else {
        println!("{}", inner);
    }
}

fn main() {
${calls}
}`;
}

/**
 * Runs a Rust challenge via the Rust Playground API (proxied through /api/challenges/run-rust).
 */
async function runRustChallenge(code: string, challenge: ChallengeData): Promise<RunResult> {
  const program = buildRustProgram(code, challenge);

  let stdout: string;
  let stderr: string;
  try {
    const res = await fetch("/api/challenges/run-rust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: program }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: "Server error" }));
      throw new Error(errData.error ?? `HTTP ${res.status}`);
    }
    const data = await res.json();
    stdout = (data.stdout ?? "") as string;
    stderr = (data.stderr ?? "") as string;

    if (!data.success) {
      // Compilation error — show stderr to user
      const errMsg = stderr.split("\n").filter((l: string) => l.startsWith("error")).join("\n") || stderr;
      return {
        results: challenge.testCases.map((tc) => ({
          label: tc.label,
          passed: false,
          expected: tc.expectedOutput,
          actual: errMsg.slice(0, 500),
        })),
        allPassed: false,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to run Rust code";
    return {
      results: challenge.testCases.map((tc) => ({
        label: tc.label,
        passed: false,
        expected: tc.expectedOutput,
        actual: msg,
      })),
      allPassed: false,
    };
  }

  // Parse outputs separated by delimiter
  const outputs = stdout.split(RUST_DELIM).map((s) => s.trim()).filter(Boolean);

  const results: TestResult[] = challenge.testCases.map((tc, i) => {
    const actual = outputs[i] ?? "";
    const expected = tc.expectedOutput.trim();
    let passed: boolean;
    if (tc.validator) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        passed = !!new Function("output", `return (${tc.validator})`)(actual);
      } catch {
        passed = false;
      }
    } else {
      passed = actual === expected;
    }
    return {
      label: tc.label,
      passed,
      expected: tc.validator ? `validator: ${tc.validator}` : expected,
      actual,
    };
  });

  return { results, allPassed: results.every((r) => r.passed) };
}

/**
 * Executes a coding challenge against its test cases.
 *
 * TypeScript/Rust challenges run in a sandboxed iframe with native ES module support:
 *   1. sucrase strips TypeScript type annotations
 *   2. bare npm imports rewritten to esm.sh CDN URLs — any package, no allowlist
 *   3. test runner injected as <script type="module"> with a global error handler
 *   4. results (or errors) posted back via postMessage
 *
 * JSON challenges are validated synchronously — JSON.parse + validator expression.
 */
export function runChallenge(code: string, challenge: ChallengeData): Promise<RunResult> {
  if (typeof document === "undefined") {
    return Promise.resolve({ results: [], allPassed: false });
  }

  if (challenge.language === "json") {
    return Promise.resolve(runJsonChallenge(code, challenge));
  }

  if (challenge.language === "rust") {
    return runRustChallenge(code, challenge);
  }

  return new Promise((resolve) => {
    const fnName = challenge.starterCode.match(/function\s+(\w+)/)?.[1] ?? "solution";
    const script = rewriteImports(stripTypes(code)) + "\n" + buildTestRunner(challenge.testCases, fnName);

    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.style.cssText = "display:none;position:absolute;width:0;height:0;";

    const timeoutId = setTimeout(() => {
      cleanup();
      resolve({
        results: challenge.testCases.map((tc) => ({
          label: tc.label,
          passed: false,
          expected: tc.expectedOutput,
          actual: "Timed out — possible infinite loop",
        })),
        allPassed: false,
      });
    }, TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
      iframe.remove();
    }

    function onMessage(ev: MessageEvent) {
      if (ev.source !== iframe.contentWindow) return;
      if (ev.data?.type !== MSG_TYPE) return;
      cleanup();

      // Syntax/runtime error caught by the iframe's global error handler
      if (ev.data.error) {
        resolve({
          results: challenge.testCases.map((tc) => ({
            label: tc.label,
            passed: false,
            expected: tc.validator ? `validator: ${tc.validator}` : tc.expectedOutput,
            actual: ev.data.error as string,
          })),
          allPassed: false,
        });
        return;
      }

      const results = ev.data.results as TestResult[];
      resolve({ results, allPassed: results.every((r) => r.passed) });
    }

    window.addEventListener("message", onMessage);
    document.body.appendChild(iframe);

    iframe.srcdoc = [
      "<!doctype html><html><body>",
      ERROR_HANDLER,
      `<script type="module">\n${script}\n</script>`,
      "</body></html>",
    ].join("");
  });
}
