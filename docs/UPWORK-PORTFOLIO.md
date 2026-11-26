# Upwork: ready-to-paste texts

Every number below comes from real runs of this repository (270 test executions, 202 documented test cases, 10 of 10 injected bugs caught, CI green on GitHub Actions).

## 1. Portfolio project: Add project (or edit the existing one)

**Title:** QA Automation: Playwright, TypeScript, API and PostgreSQL

**Project link:** https://github.com/BENOURO/ecommerce-qa-automation

**Skills:** a portfolio project accepts only **5** skills, and "Playwright" and "GitHub Actions" do not exist in Upwork's skill list. Used: Test Automation Framework, TypeScript, CI/CD, SQL, API Testing.

**Description actually published** (Upwork limits it to **600 characters**):

```
QA automation framework that tests an e-commerce shop from the UI through the API down to PostgreSQL and checks that all layers agree. 270 automated tests (Playwright + TypeScript), page objects, auto-cleaned test data, HTML report and GitHub Actions CI. Proof it works: I injected 10 realistic bugs (wrong totals, leaked hashes, duplicate orders...) and the suite caught 10 of 10. It also found 4 real bugs while I built it. 202 documented test cases. The shop is my own demo app, so I can test its real API and database. Code: github.com/BENOURO/ecommerce-qa-automation
```

**Images, in this order** (all in `docs/images/`):
1. `report-passing.png`: the HTML report, 270 passing (cover image)
2. `report-failure-detail.png`: a caught defect, expected versus received
3. `shop-products.png`: the application under test
4. `shop-checkout-validation.png`: checkout validation
5. A screenshot of the green run in your repository's Actions tab (take it yourself)

**Longer description** (too long for the project card; use it in proposals, cover letters or the GitHub profile):

```
I built a complete automated testing framework that tests an e-commerce web shop from the user interface, through its API, down to the PostgreSQL database, and checks that all three layers agree.

THE PROBLEM IT SOLVES
Most automated tests check one layer only. A page can show the right total while the database stores a wrong one. This framework verifies the whole chain: what the customer sees, what the API returns, and what is saved.

WHAT I DELIVERED
- 270 automated test executions (202 documented test cases): 93 browser tests, 116 API tests, 53 database tests, 5 cross-layer journeys and 3 stock tests.
- Coverage of authentication and sessions, product search, filters and sorting, shopping cart, checkout and orders, authorization (401/403), input validation, SQL injection attempts, and database integrity rules (unique, check, not-null and foreign keys).
- Page Object Model, reusable fixtures, generated test data with automatic cleanup, parallel execution, and no sleeps (Playwright auto-waiting and web-first assertions).
- A professional HTML report with totals, durations, failure details, screenshots and traces.
- A GitHub Actions pipeline that starts PostgreSQL, runs the full suite on every push (about 1 minute 15 seconds), and publishes the report.
- A test case document with ID, priority, preconditions, steps and expected result for every case, checked automatically so it cannot drift from the code.

PROOF THAT THE TESTS WORK
- I injected 10 realistic defects (wrong cart total, order charged without quantity, stock not reduced, case-sensitive search, reversed sorting, weak passwords accepted, password hashes leaked, cart overselling, user enumeration on login, duplicate orders on double submit). The suite caught 10 of 10, and I documented which test catches which defect.
- While building it, the tests found 4 real bugs in the application, including a double-click that created two orders and an empty cart that still showed its checkout button.

HOW I WORK
I plan test cases from the specification, automate the highest-risk paths first (money, security, data integrity), investigate failures down to the root cause instead of adding waits, and report honestly what passed, what failed and what I could not verify.

TECH STACK
TypeScript, Playwright, Node.js, PostgreSQL (Docker Compose), Express, GitHub Actions.

The repository has a README, architecture diagram, screenshots, and instructions to run everything with a few commands. The shop under test is my own demo application, which lets me test the real API and database.
```

## 2. Profile overview (replace the Overview text)

```
I help businesses test their web applications, find bugs, and make sure everything works before it reaches users. I also automate the checks that matter, so they run automatically on every release.

I have a software development background (JavaScript, TypeScript, Vue.js, Spring Boot), so I understand an application from both the user's and the developer's side.

FEATURED PROJECT (see my portfolio)
A full Playwright + TypeScript automation framework with PostgreSQL checks and GitHub Actions CI: 270 automated tests across UI, API and database, an HTML report, and 10 injected bugs that the suite catches (10 of 10).

MY SERVICES
- Playwright test automation (TypeScript / JavaScript) with CI pipelines
- API testing with Playwright and Postman: requests, responses, authentication, error handling
- Database validation with SQL (PostgreSQL): data integrity and API-to-database consistency
- Manual website testing: functional testing, user flows, UI/UX issues
- Bug reporting: clear reproduction steps, screenshots, detailed reports
- Regression testing: making sure existing features still work after updates
- Cross-browser testing: checking behavior across different browsers

TOOLS AND TECHNOLOGIES
Playwright, TypeScript, JavaScript, Postman, SQL and PostgreSQL, GitHub Actions, Docker, Git and GitHub, React and Vue.js, Spring Boot, Python.

I focus on clear communication, detailed reporting and reliable results. Whether you need a new feature tested, a bug investigated, an API validated, or your key user flows automated, I can help.

Let's find the problems before your users do.
```

## 3. Profile settings to change

- Profile **Skills** added: TypeScript, PostgreSQL, SQL, CI/CD, API Testing, Docker, Node.js (Upwork has no "Playwright" or "GitHub Actions" skill).
- **Open for work** is a paid feature: it spends Connects (the default budget is 14 Connects per week) when clients invite you. Turn it on only if you want that.
- Optional: a short video introduction, and a skills test or certification related to QA.

## Before you publish

- Do not present the shop as client work. The README says it is your own demo application.
- Be ready to explain the "Known limitations" section of the README if a client asks (for example: tests run in Chromium only).
