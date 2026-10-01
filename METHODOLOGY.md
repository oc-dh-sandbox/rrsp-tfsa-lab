# Model contract and research notes — v1.0.0

Sources checked **2026-10-01**. CAD throughout. This file describes the actual implementation, not an idealized retirement plan. The in-browser educational disclaimer and limitations are part of the product.

## 1. Comparable personal cash commitments

The annual input `budget` is personal cash contributed **before subsequently receiving contribution-related tax relief**. It is not a gross-pay contribution calculated from a desired net payroll deduction. Each strategy gets this same budget, multiplied by its chosen annual growth factor. Employer money and prior-year tax savings are additional investable money, not additional personal spending. No borrowing is assumed.

Each year the engine:

1. Adds newly generated contribution room (except in year one, where available room is entered directly).
2. Allocates eligible payroll contributions and employer matching first for matched routes. Default: employee contributes up to 4% of salary, employer contributes $1 per eligible dollar. A budget or RRSP-room shortage reduces the match.
3. Allocates the remaining budget to the route's preferred account, then the other registered account.
4. Reinvests the previous year's estimated tax savings into the selected destination, then the alternate registered account. These deposits do not earn an additional employer match. After employment ends, they go to TFSA/cash, not an RRSP deduction against no salary.
5. Keeps any remaining money as explicit, zero-interest cash. No taxable-investment growth/tax model is implied.
6. Calculates income-tax savings on **employee** RRSP contributions, including that year's reinvested refund if it went into an RRSP. This becomes the next year's reinvestment, not another immediate recursive gross-up.

Deposits are spread across month-ends. Actual payroll tax relief can arrive earlier than this conservative full-following-year convention. Pending tax savings count as a receivable in year-end chart values, but earn no return until deposited. They are shown in the breakdown/CSV, not hidden in an investment account.

### Employer RRSP versus DPSP

For a group RRSP, an employer contribution `M` is a taxable employment benefit and ordinarily has an offsetting RRSP deduction. With salary `S` and employee contribution `C`, net income after both is `S + M - (C + M) = S - C`. The model therefore computes `tax(S) - tax(S-C)`, **not** `tax(S) - tax(S-C-M)`. Employer RRSP contributions consume current deduction room and count toward next year's modeled earned income.

For a DPSP, employer money does not consume this year's RRSP room and creates next year's pension adjustment instead. The employee payroll RRSP contribution still needs current room. DPSP balances are assumed vested and transferable; they are grouped with deferred assets for growth and eventual withdrawal-tax sensitivity. This is not a model of a locked-in RPP, LIRA, LIF, unvested contributions, or forfeiture on job change.

CPP/EI are calculated from salary, not extra employer benefits. At the default $100,000 salary both annual maxima are already reached; at lower incomes this simplification can matter. Verify payroll treatment and withdrawal restrictions with the employer.

## 2. Room, dates, and policy projection

Default year-one TFSA available room is $7,000 and RRSP available room is $18,000. These are placeholders; actual available room must come from an assessment and current records. They already include the current year—no second allocation is added. Historical unused TFSA room is not inferred from age, residency or account balances. Existing balances are identical across strategies and do not consume new room again.

Subsequent RRSP room is the lesser of 18% of **prior-year** modeled earned income and the projected annual cap, less a pension adjustment, floored at zero. Existing unused room remains intact. The cap is $33,810 in 2026, the published $35,390 in 2027, then grows at assumed inflation. The optional other pension adjustment also grows with inflation; a modeled prior-year DPSP employer contribution is an additional adjustment. The basic calculation omits past-service adjustments, reversals, other earned income and changes in pension design.

Future TFSA room is projected by growing the $7,000 2026 baseline at inflation and rounding to the nearest $500. This is a transparent simplifying projection, not an announcement of future limits. No TFSA withdrawals occur, so withdrawal-room restoration is not needed.

The age-36/year-2026 row represents one year from age 36 to 37. After 36 yearly periods, the snapshot is at the start of age 72. Exact birthdays and partial years are not modeled. Contributions/earned salary stop at the entered stop age (default 65). Final tax savings still arrive in the following year. There is no consumption drawdown before age 72. RRSP-to-RRIF conversion by the end of the age-71 year is treated as tax-neutral; the endpoint precedes the first age-72 minimum withdrawal. A displayed own-age 5.40% withdrawal illustration is not subtracted from that snapshot and is not an optimized drawdown strategy.

## 3. 2026 federal and Ontario tax estimate

`tax.js` includes:

- Federal brackets: $58,523 / $117,045 / $181,440 / $258,482; rates 14 / 20.5 / 26 / 29 / 33%.
- Federal basic personal amount $16,452, linearly reduced to $14,829 across the fourth bracket; Canada employment amount $1,501.
- Ontario brackets: $53,891 / $107,785 / $150,000 / $220,000; rates 5.05 / 9.15 / 11.16 / 12.16 / 13.16%.
- Ontario basic personal amount $12,989; surtaxes of 20% of basic provincial tax above $5,818 and an additional 36% above $7,446, after modeled basic credits.
- Basic Ontario tax reduction for an individual without dependants, using $300; health premium's exact piecewise ramps and $900 cap.
- Base CPP contribution credit at 4.95% of pensionable salary above $3,500 up to YMPE $74,600. First enhanced CPP deduction 1%; CPP2 deduction 4% on earnings from $74,600 to $85,000.
- EI at 1.63%, maximum insurable earnings $68,900.
- RRSP tax savings use the difference of full calculations across brackets, credit phaseouts, surtaxes and premium ramps, not a single marginal percentage.

Independent first-year employee reference at $100,000:

| Item | No RRSP deduction | $4,000 employee deduction |
|---|---:|---:|
| Enhanced CPP deduction | $1,127.00 | $1,127.00 |
| Taxable income | $98,873.00 | $94,873.00 |
| Federal tax | $13,301.597200 | $12,481.597200 |
| Ontario basic tax after credits | $5,946.956740 | $5,580.956740 |
| Ontario surtax | $25.791348 | $0 |
| Health premium | $750 | $750 |
| Total income tax | $20,024.345288 | $18,812.553940 |

Difference = **$1,211.791348**. A $7,000 employee deduction saves **$2,101.291348**. A $4,000 employer match does not generate another $1,211.79 refund. Small differences from a tax return can arise from line-level rounding.

The estimator assumes a basic Ontario employee. LIFT, Canada Workers Benefit, family credits/benefits, dependants, disability credits, union dues, donations, dividends, capital gains, other deductions and alternative minimum tax are not modeled. All employee contributions are evaluated as current deductions; unused RRSP **deduction claims** are not optimized or carried forward for a later tax rate (unused contribution **room** does carry). Low-income and unusually large-deduction scenarios therefore require extra caution.

Future taxes use 2026 rules in purchasing-power terms: salary and deduction are divided by cumulative inflation, the 2026 calculation is applied, and savings are multiplied back. This indexes all thresholds and credits, **including Ontario thresholds/health-premium amounts that are currently frozen**. It intentionally avoids pretending today's laws can be known decades into the future. Salary and personal-budget growth can differ from inflation.

### Withdrawal taxes

The main comparable total is `TFSA + cash + pending tax savings + deferred assets × (1 − chosen effective withdrawal-tax rate)`, with optional inflation discounting. The default 25% reserve is an editable assumption about eventual withdrawals, not a computed retirement tax rate or a liquidation at age 72. The UI also offers pre-tax totals and 15/25/35/45% sensitivity.

CPP/OAS income, OAS recovery tax, GIS, pension splitting, senior credits, other pension income, estates, spousal ages and retirement consumption are excluded. The actual retirement-tax burden depends on those facts and the withdrawal schedule. A full retirement income plan is outside this accumulation tool.

## 4. Investments, markets and fees

All non-cash accounts follow the same constant stock/bond exposure. The Sun Life side is an allocation proxy, not a claim that Vanguard ETFs are available in the plan or that another fund will track them exactly. Target-date funds have changing allocation and are not reproduced here.

| Proxy | Equities / bonds | Illustrative nominal compound return before fees | Annual log-return volatility |
|---|---:|---:|---:|
| VEQT | 100 / 0 | 6.0% | 18.0% |
| VGRO | 80 / 20 | 5.3% | 14.5% |
| VBAL | 60 / 40 | 4.6% | 11.0% |
| VCNS | 40 / 60 | 3.9% | 8.5% |
| VCIP | 20 / 80 | 3.2% | 6.5% |

**Return/volatility figures are deliberately editable educational assumptions**, not Vanguard forecasts, official risk labels, historic backtests or calibrated probabilities. Published recent fund standard deviations are not substituted for long-horizon uncertainty.

Steady growth factor per month is `(1+g)^(1/12)`. For stochastic paths, monthly gross growth is `exp(log(1+g)/12 + sigma/sqrt(12) × Z)`, with independent standard-normal draws. Thus the compound-return input is not the annual arithmetic mean: the latter is `(1+g) × exp(sigma²/2) − 1`. All five routes use the **same** sequence for each path. A seeded generator makes results repeatable; reseeding changes only uncertainty, not steady totals.

2,000 paths are summarized with pointwise 10th/50th/90th percentiles. The pointwise band does not enclose 80% of entire paths, is not a confidence bound and excludes neither severe crashes nor worse outcomes. Monthly independent lognormal returns do not model fat tails, persistent regimes, uncertain long-run expected returns, correlation changes or stochastic inflation. Higher expected returns are not guaranteed by accepting more risk.

An optional extra shock multiplies all invested balances once at the **start** of the chosen age, before new deposits. Its multiplier is `1 + equityWeight × equityShock + bondWeight × bondShock`. Subsequent normal growth continues. Cash is unaffected.

Monthly percentage-fee retention is `(1−annualFee)^(1/12)`. Fees reduce all invested assets, including employer deposits and gains. Sun Life's input is an **all-in percentage assumption**, plus an optional separately charged tax-inclusive account fee. The account fee grows with inflation, is deducted monthly while money is held at Sun Life, and cannot drive balances negative.

Wealthsimple defaults to **self-directed** Canadian-dollar purchases of Canadian-listed ETFs. The product-page MER assumption is 0.22%; no additional commission/platform management fee is entered. Optional platform sensitivity adds `fee × 1.13` for Ontario HST, plus the ETF cost. No managed-tier transitions, promotional rebates, USD trades, spreads, tracking error, foreign withholding differences or fund alpha are simulated. Managed Wealthsimple portfolios are not equivalent to holding the selected Vanguard ETF.

Conditional transfers happen at the start of each year or when employment ends. New contributions remain at Sun Life until the next eligible transfer. Each actual positive-balance transfer pays the entered fixed fee, deducted from the deferred assets; no reimbursement or contribution-room use is assumed. Employer restrictions/vesting/match suspensions must be verified separately.

Fee drag is the terminal difference versus the same schedule/path with percentage, account and transfer fees removed. It includes lost compounding and follows the selected after-tax/real-dollar view. The total of fees actually deducted is separately reported in **nominal** dollars.

A single-deposit percentage-fee-only match crossover is `ln(1+matchRatio) / ln((1−WSfee)/(1−SunFee))`, when Sun Life is dearer. Default: about 38.51 years for a 100% match and 2% vs 0.22% costs. This is **not** the crossover for continuing contributions; it excludes flat fees, transfer options and account-tax differences.

## 5. Source provenance

Public pages were fetched and read; no logged-in employer plan or private financial data was accessed. Sun Life's own public web endpoints refused automated retrieval; no access control was bypassed. Public employer disclosures provide a specific, bounded example rather than invented plan-wide fees.

- [CRA 2026 rates](https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html).
- [CRA 2026 T4127 formulas](https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html), with published [other amounts CSV](https://www.canada.ca/content/dam/cra-arc/formspubs/pub/t4127-jan/thrrtsmnts-01-26e.csv), [CPP base CSV](https://www.canada.ca/content/dam/cra-arc/formspubs/pub/t4127-jan/cpp-qpp-br-01-26e.csv), and [EI CSV](https://www.canada.ca/content/dam/cra-arc/formspubs/pub/t4127-jan/ei-01-26e.csv).
- [Ontario health premium](https://www.ontario.ca/page/health-premium).
- [CRA RRSP, DPSP, TFSA limits, YMPE/YAMPE](https://www.canada.ca/en/revenue-agency/services/tax/registered-plans-administrators/pspa/mp-rrsp-dpsp-tfsa-limits-ympe.html).
- [CRA RRIF overview](https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/registered-retirement-income-fund-rrif.html).
- [Wealthsimple pricing](https://www.wealthsimple.com/en-ca/pricing): $0 stock/ETF commissions, managed 0.5% Core / 0.4% Premium / 0.2–0.4% Generation; these are platform fees, not inclusive portfolio MER quotes.
- Vanguard [VEQT](https://www.vanguard.ca/en/product/etf/asset-allocation/9692/vanguard-all-equity-etf-portfolio), [VGRO](https://www.vanguard.ca/en/product/etf/asset-allocation/9579/vanguard-growth-etf-portfolio), [VBAL](https://www.vanguard.ca/en/product/etf/asset-allocation/9578/vanguard-balanced-etf-portfolio), [VCNS](https://www.vanguard.ca/en/product/etf/asset-allocation/9577/vanguard-conservative-etf-portfolio), [VCIP](https://www.vanguard.ca/en/product/etf/asset-allocation/9691/vanguard-conservative-income-etf-portfolio). All displayed 0.17% management fee, 0.22% MER and 0.22% FER; TER 0.00%. Use the fund's total cost, not just management fee. MER is backward-looking and can change.
- [McGill voluntary savings plans](https://www.mcgill.ca/hr/pensions/vsp): public Sun Life **group RRSP** table, fund management fees as of Dec. 31, 2025: target-date families 0.26–0.30%, target-risk profiles 0.29%, TDAM short-term 0.31%, PH&N bond 0.32%, TDAM low-volatility Canadian equity 0.36%, TDAM US market index 0.20%, TDAM international index 0.21%; separate $66/year record keeping, $25 pre-termination transfer/withdrawal and $75 on termination/retirement. These are **not** the separate McGill TFSA or pension-plan fee schedules. Tax/operating-expense inclusion cannot be inferred solely from the FMF label.

The McGill example demonstrates why a blanket 2% Sun Life assumption is unsafe. It does not establish what another employer offers or prove the availability of a low-cost option for a particular employee. Obtain the actual lineup and all-in fee disclosure.
