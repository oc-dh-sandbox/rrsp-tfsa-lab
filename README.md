# The Long View — Ontario RRSP / TFSA contribution lab

A static, browser-only educational comparison of employer-matched Sun Life group saving and low-cost Wealthsimple investing. No accounts, API keys, analytics, runtime packages, external scripts or uploaded financial inputs.

**Site:** https://oc-dh-sandbox.github.io/rrsp-tfsa-lab/

## What it compares

All five routes receive the **same personal cash budget**, starting balances, constant investment exposure and paired random market returns:

1. Wealthsimple TFSA first (no match; overflow to WS RRSP).
2. Sun Life RRSP first (matched contributions plus extra RRSP saving; overflow to WS TFSA).
3. Sun Life match + Wealthsimple TFSA (then WS RRSP).
4. Wealthsimple RRSP first (no match; overflow to WS TFSA).
5. Sun Life match + Wealthsimple RRSP (then WS TFSA).

Reinvested RRSP income-tax savings arrive the following year. Contribution-room constraints, a DPSP alternative, account/transfer fees, conditional registered transfers, inflation, withdrawal-tax sensitivity and 2,000 seeded market paths are explicit. Overflow beyond both registered accounts remains in visible zero-return cash.

Age 36, $100,000 salary, 4% dollar-for-dollar eligible payroll matching and a 2% Sun Life **hypothetical high-fee setting** are illustrative defaults, not a verified individual's plan. The endpoint is the start of age 72, before that year's RRIF minimum. Salary and new personal saving stop at 65 by default; spending withdrawals are not modeled.

See [METHODOLOGY.md](METHODOLOGY.md) for accounting conventions, limitations, source provenance and independent tax fixtures. The on-site sources explain why Sun Life employer-group fees must not be inferred from retail fund MERs. Public McGill fund fees are examples from **another employer**, not available-plan promises.

## Run and test

```sh
npm ci --ignore-scripts
npm start                       # http://127.0.0.1:4173
npm test                        # finance/model unit tests
npm run test:browser             # requires Playwright's matching browser installations
```

Full reproducible validation, including Chromium desktop, Chromium phone and WebKit phone:

```sh
docker build -t long-view-ci .
docker run --rm --ipc=host long-view-ci
```

Before pushing a release, commit the intended files and run on the **clean exact commit**:

```sh
bash scripts/ci-local.sh
```

This archives `HEAD`, not an arbitrary worktree, and uses a digest-pinned Playwright container and lockfile. It tests tax fixtures, contribution conservation and room, refund timing, Monte Carlo determinism, common random paths, fee counterfactuals, transfers, input bounds, local-only persistence, link sharing, CSV export, responsive layout and automated WCAG checks. Screenshots and the verified commit identifier stay in ignored `.artifacts/`.

For post-publication browser checks of the actual site, set `SITE_URL` to the Pages root (with trailing `/`) when invoking the browser tests in the container. Verify runtime file SHA-256 identities separately. Local browser and automated accessibility tests do not establish physical-device acceptance or the accuracy of a person's actual employer plan.

## Files / publication

Runtime files: `index.html`, `styles.css`, `app.js`, `worker.js`, `model.js`, `tax.js`, `data.js`, `icon.svg`, `.nojekyll`. No build step; relative asset paths work under a GitHub Pages project subdirectory. Pages serves the root of `main`. GitHub Actions runs the same full container suite independently.

Editing inputs is ephemeral unless the visitor opts into local storage. A generated sharing link contains the scenario in its URL **fragment**, not a query; the hosting request does not include the fragment, but anyone given the link can read it. CSV export contains the selected assumptions. Normal hosting access logs still exist. Reset clears this application's saved scenario only.

## Scope

Educational illustrations, not personal investment, tax or legal advice. No financial-provider affiliation. Markets can perform outside simulated ranges. Nothing here establishes which funds, costs, transfer rights, pension rules or tax credits apply to a specific person. Confirm those facts and current contribution room before acting.
