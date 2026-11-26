// Turns reports/results.json into a short Markdown summary.
// In GitHub Actions it is shown at the top of the run page; locally it is printed to the terminal.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'reports/results.json';
if (!existsSync(file)) {
  console.log(`No results file at ${file}: the tests did not get as far as writing a report.`);
  process.exit(0);
}

const report = JSON.parse(readFileSync(file, 'utf8'));
const { expected = 0, unexpected = 0, flaky = 0, skipped = 0, duration = 0 } = report.stats ?? {};

const failed = [];
const flakyTests = [];
const walk = (suite, trail) => {
  const path = suite.title && !suite.title.endsWith('.ts') ? [...trail, suite.title] : trail;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const label = `${test.projectName}: ${[...path, spec.title].join(' › ')}`;
      if (test.status === 'unexpected') failed.push(label);
      if (test.status === 'flaky') flakyTests.push(label);
    }
  }
  for (const child of suite.suites ?? []) walk(child, path);
};
report.suites.forEach((suite) => walk(suite, []));

const seconds = (duration / 1000).toFixed(1);
const lines = [
  `## Test results: ${unexpected === 0 ? 'all passed' : `${unexpected} failed`}`,
  '',
  '| Passed | Failed | Flaky | Skipped | Duration |',
  '|---|---|---|---|---|',
  `| ${expected} | ${unexpected} | ${flaky} | ${skipped} | ${seconds} s |`,
  '',
];
if (failed.length > 0) lines.push('### Failed tests', '', ...failed.map((t) => `- ${t}`), '');
if (flakyTests.length > 0) lines.push('### Flaky tests (failed, then passed on retry)', '', ...flakyTests.map((t) => `- ${t}`), '');
lines.push('The full HTML report, with screenshots and traces, is in the **playwright-report** artifact of this run.', '');

const markdown = lines.join('\n');
console.log(markdown);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
