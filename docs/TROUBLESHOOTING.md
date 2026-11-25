# Troubleshooting

## Random 10-second timeouts when many UI tests run in parallel (Windows)

**Symptom:** with 4 or more workers, UI tests fail with `page.goto` or `apiRequestContext.post` timeouts of about
10 s, 20 s or 30 s. Re-running passes. Serial runs (`--workers=1`) are clean.

**What was measured** (with `LOG_REQUESTS=true`, which prints one line per request and reports event-loop stalls):

- The shop's Node process stops responding for almost exactly 10 s at random moments; several requests are
  then delayed by that amount at once. A CPU profile taken during a stall shows the process idle, not busy,
  so it is not slow application code.
- A separate Node process running at the same time did not stall, so it is not a whole-machine freeze.
- It happens the same with `tsx` and with the server compiled to plain JavaScript, and from Git Bash and PowerShell.
- 4 workers: many failures. 2 workers: 1 failure in 141 test runs. 1 worker: 0 failures.

The root cause is not identified. Test and application bugs were ruled out as the cause of these timeouts.
(A real race in the login page, where the submit handler was attached after a network call, was found and
fixed separately.)

**Current mitigation:** `workers: 2` in `playwright.config.ts`. On CI (Linux) `retries: 2` reports any
remaining flakiness explicitly as "flaky" in the HTML report.

**To investigate further:** run `set LOG_REQUESTS=true` and start the app with `npm run app`, then look for
`EVENT LOOP STALL` lines in the output while the tests run with `REUSE_SERVER=true npx playwright test`.

## `--repeat-each` makes the "isolated" stock tests fail

The tests in `tests/isolated/` measure exact stock numbers, so they must never run at the same time as each
other. Normally there is one copy of each test and they run one after another. With `--repeat-each=2` and
several workers, Playwright runs the repeated copies in parallel, and they disturb each other's stock.

To repeat the suite for a stability check, repeat the parallel projects and the isolated one separately:

```
npx playwright test --project=ui --project=api --project=database --repeat-each=3
npx playwright test --project=isolated --no-deps --repeat-each=3 --workers=1
```
