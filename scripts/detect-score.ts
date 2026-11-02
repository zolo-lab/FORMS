/**
 * Detection scoreboard: runs field detection on every form of the test bank (tests/detection) and on the real
 * Form 101, and prints what was found, missed or wrong.   pnpm tsx scripts/detect-score.ts [--verbose]
 */
import { readFileSync } from "node:fs";
import { detectFields } from "../src/lib/pdf/detect";
import { describeProblem, scoreDetection } from "../src/lib/pdf/detect-eval";
import type { GuessPage } from "../src/lib/pdf/guess";
import { allForms } from "../tests/detection/forms";
import { pageData } from "../tests/detection/extract";
import { FORM101_EXPECTED, FORM101_NOT_FIELDS, FORM101_REGIONS } from "../tests/detection/form101-expected";

async function main() {
  const verbose = process.argv.includes("--verbose");
  let exp = 0, cor = 0, ext = 0;
  const row = (name: string, pattern: string, s: ReturnType<typeof scoreDetection>) => {
    exp += s.expected; cor += s.correct; ext += s.extras;
    const mark = s.correct === s.expected && s.extras === 0 ? "✓" : "✗";
    console.log(`${mark} ${name.padEnd(18)} ${String(s.correct).padStart(3)}/${String(s.expected).padEnd(3)} נכונים, ${s.extras} מיותרים  ·  ${pattern}`);
    if (verbose || mark === "✗") for (const p of s.problems) console.log(`     - ${describeProblem(p)}`);
  };
  for (const f of await allForms()) {
    const pages = await pageData(f.bytes);
    row(f.name, f.pattern, scoreDetection(detectFields(pages), f.expected, f.notFields));
  }
  const pages101 = JSON.parse(readFileSync("tests/fixtures/form101-pages.json", "utf8")) as GuessPage[];
  const inRegion = (d: { page: number; box: { y: number; height: number } }) => FORM101_REGIONS.some((r) => r.page === d.page && d.box.y + d.box.height / 2 >= r.y1 && d.box.y + d.box.height / 2 <= r.y2);
  row("form101", "טופס 101 האמיתי (חלקים מתויגים)", scoreDetection(detectFields(pages101).filter(inRegion), FORM101_EXPECTED, FORM101_NOT_FIELDS));
  console.log(`\nסה"כ: ${cor}/${exp} שדות נכונים (${Math.round((100 * cor) / exp)}%), ${ext} מיותרים`);
}
main().catch((e) => { console.error(e); process.exit(1); });
