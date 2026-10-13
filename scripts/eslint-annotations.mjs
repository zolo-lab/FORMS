// Runs ESLint (json) and prints GitHub annotations so failures are readable without Actions logs.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

try {
  execSync("pnpm exec eslint . -f json -o eslint-report.json", { stdio: "inherit" });
} catch {
  /* non-zero exit just means there are findings; read the report */
}
const report = JSON.parse(readFileSync("eslint-report.json", "utf8"));
let errors = 0;
for (const f of report) {
  for (const m of f.messages) {
    const level = m.severity === 2 ? "error" : "warning";
    if (m.severity === 2) errors++;
    const file = f.filePath.replace(process.cwd() + "/", "");
    console.log(`::${level} file=${file},line=${m.line}::${m.ruleId ?? ""} ${m.message}`);
  }
}
process.exit(errors ? 1 : 0);
