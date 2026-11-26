# Upwork portfolio entry (ready to paste)

Add it at: Upwork profile > Portfolio > Add project. Attach the images from `docs/images/` (see the list at the end).
Every number below comes from real runs of this repository.

## Project title

E-Commerce QA Automation Framework: Playwright, TypeScript, API and PostgreSQL testing with CI

## Project link

https://github.com/BENOURO/ecommerce-qa-automation

## Skills to tag

Playwright, TypeScript, Test Automation, QA Testing, API Testing, PostgreSQL, SQL, GitHub Actions, CI/CD, Quality Assurance, Test Automation Framework, Node.js

## Description (fits Upwork's 5,000-character limit)

I built a complete automated testing framework that tests an e-commerce web shop from the user interface, through its API, down to the PostgreSQL database, and checks that all three layers agree.

THE PROBLEM IT SOLVES
Most automated tests check one layer only. A page can show the right total while the database stores a wrong one. This framework verifies the whole chain: what the customer sees, what the API returns, and what is saved.

WHAT I DELIVERED
- 270 automated test executions (202 documented test cases): 93 browser tests, 116 API tests, 53 database tests, 5 cross-layer journeys and 3 stock tests.
- Coverage of authentication and sessions, product search, filters and sorting, shopping cart, checkout and orders, authorization (401/403), input validation, SQL injection attempts, and database integrity rules (unique, check, not-null and foreign keys).
- Page Object Model, reusable fixtures, generated test data with automatic cleanup, parallel execution, and no sleeps (Playwright auto-waiting and web-first assertions).
- A professional HTML report with totals, durations, failure details, screenshots and traces.
- A GitHub Actions pipeline that starts PostgreSQL, runs the full suite on every push (about 1 minute 15 seconds in CI), and publishes the report.
- A test case document with ID, priority, preconditions, steps and expected result for every case, checked automatically so it cannot drift from the code.

PROOF THAT THE TESTS WORK
- I injected 10 realistic defects (wrong cart total, order charged without quantity, stock not reduced, case-sensitive search, reversed sorting, weak passwords accepted, password hashes leaked, cart overselling, user enumeration on login, duplicate orders on double submit). The suite caught 10 of 10, and I documented which test catches which defect.
- While building it, the tests found 4 real bugs in the application, including a double-click that created two orders and an empty cart that still showed its checkout button.

HOW I WORK
- I read the specification, plan the test cases, then automate the highest-risk paths first (money, security, data integrity).
- I investigate failures down to the root cause instead of adding waits or retries, and I report honestly what passed, what failed and what I could not verify.

TECH STACK
TypeScript, Playwright, Node.js, PostgreSQL (Docker Compose), Express, GitHub Actions.

The repository includes a README, architecture diagram, screenshots, and instructions to run everything with a few commands.

## Short version (for the project card or a proposal)

Full QA automation framework (Playwright + TypeScript + PostgreSQL + GitHub Actions): 270 automated tests across UI, API and database, cross-layer checks, an HTML report, CI, and 10 injected bugs that the suite catches (10 of 10). Repository: https://github.com/BENOURO/ecommerce-qa-automation

## Suggested profile overview paragraph

I am a QA automation engineer focused on Playwright and TypeScript. I test web applications from the browser to the API to the database, so a wrong total or a leaked field is caught wherever it hides. My portfolio project (link above) shows a full framework with CI, reports and documented test cases.

## Images to attach, in this order

1. `docs/images/report-passing.png`: the HTML report, all passing
2. `docs/images/report-failure-detail.png`: a caught defect, expected versus received
3. `docs/images/shop-products.png`: the application under test
4. `docs/images/shop-checkout-validation.png`: the checkout validation
5. A screenshot of the green GitHub Actions run (take it from your repository's Actions tab)

## Before you publish

- Do not claim client work. The shop is your own demo application, and the README says so.
- If a client asks, be ready to explain the "Known limitations" section of the README.
