import { DEFAULTS, normalize, PORTFOLIOS, STRATEGIES } from './data.js';
import { deductionSavings, incomeTax } from './tax.js';
export { DEFAULTS, normalize, PORTFOLIOS, STRATEGIES };
export const TARGET_AGE = 72;
const EPS = 1e-7;

export function projectedTFSALimit(year, inflation) {
  return Math.round(7000 * (1 + inflation / 100) ** year / 500) * 500;
}
export function projectedRRSPLimit(year, inflation) {
  return year === 0 ? 33810 : 35390 * (1 + inflation / 100) ** (year - 1);
}

// Schedules are independent of investment returns: no performance-driven room creation,
// no invented refunds on the employer's own contribution, no money silently discarded.
export function contributionPlan(input, strategy) {
  const s = normalize(input), years = TARGET_AGE - s.age;
  let tfsaRoom = s.tfsaRoom, rrspRoom = s.rrspRoom, pending = 0;
  let previousEarned = s.salary, previousDPSP = 0;
  const plan = [];
  for (let y = 0; y < years; y++) {
    const age = s.age + y, index = (1 + s.inflation / 100) ** y;
    const working = age < s.stopAge;
    const salary = working ? s.salary * (1 + s.salaryGrowth / 100) ** y : 0;
    const own = working ? s.budget * (1 + s.budgetGrowth / 100) ** y : 0;
    if (y > 0) {
      tfsaRoom += projectedTFSALimit(y, s.inflation);
      rrspRoom += Math.max(0, Math.min(previousEarned * .18, projectedRRSPLimit(y, s.inflation)) - s.pensionAdjustment * index - previousDPSP);
    }
    const openingTFSA = tfsaRoom, openingRRSP = rrspRoom;
    const deposits = [0, 0, 0, 0]; // Sun Life deferred, WS deferred, WS TFSA, uninvested cash
    let employeeRRSP = 0, employer = 0, matchedEmployee = 0;
    const putTFSA = amount => {
      const n = Math.max(0, Math.min(amount, tfsaRoom));
      tfsaRoom -= n; deposits[2] += n; return amount - n;
    };
    const putRRSP = (amount, account) => {
      // No new deduction is modelled without employment income. Refunds then go to TFSA/cash.
      const n = salary > 0 && age <= 71 ? Math.max(0, Math.min(amount, rrspRoom)) : 0;
      rrspRoom -= n; deposits[account] += n; employeeRRSP += n; return amount - n;
    };
    const allocate = (amount, destination) => {
      if (destination === 'tfsa') {
        amount = putTFSA(amount); amount = putRRSP(amount, 1);
      } else {
        amount = putRRSP(amount, destination === 'sun' ? 0 : 1); amount = putTFSA(amount);
      }
      deposits[3] += Math.max(0, amount);
    };
    if (strategy.matched && working && age < s.matchEndAge && salary > 0 && s.matchRate > 0) {
      const ratio = s.matchRate / 100;
      // Employer RRSP dollars consume current room; DPSP dollars instead create next year's PA.
      const roomPerEmployeeDollar = s.matchType === 'rrsp' ? 1 + ratio : 1;
      matchedEmployee = Math.max(0, Math.min(own, salary * s.matchCap / 100, rrspRoom / roomPerEmployeeDollar));
      employer = matchedEmployee * ratio;
      deposits[0] += matchedEmployee + employer;
      rrspRoom -= matchedEmployee + (s.matchType === 'rrsp' ? employer : 0);
      employeeRRSP += matchedEmployee;
    }
    allocate(own - matchedEmployee, strategy.destination);
    const reinvestedRefund = pending;
    const refundTarget = s.refundDestination === 'tfsa' || salary === 0 ? 'tfsa' : strategy.destination === 'sun' ? 'sun' : 'ws';
    allocate(reinvestedRefund, refundTarget);
    // Employer RRSP benefit M and deduction M offset: T(S+M-(C+M)) = T(S-C).
    // No second refund is credited for the match. CPP/EI assumed unchanged by the match.
    pending = deductionSavings(salary, employeeRRSP, index);
    previousEarned = salary + (s.matchType === 'rrsp' ? employer : 0);
    previousDPSP = s.matchType === 'dpsp' ? employer : 0;
    plan.push({ age, year: 2026 + y, index, salary, own, deposits, employeeRRSP, employer,
      matchedEmployee, reinvestedRefund, refund: pending, tfsaRoom: Math.max(0, tfsaRoom), rrspRoom: Math.max(0, rrspRoom),
      openingTFSA, openingRRSP, overflow: deposits[3], transfer: s.transfer === 'annual' || (s.transfer === 'leaving' && age >= s.stopAge) });
  }
  return plan;
}

export function displayValue(balances, refund, s, year) {
  const deferred = balances[0] + balances[1];
  const value = deferred * (s.afterTax ? 1 - s.retirementTax / 100 : 1) + balances[2] + balances[3] + refund;
  return value / (s.real ? (1 + s.inflation / 100) ** year : 1);
}

export function runPath(input, plan, factors = null, { noFees = false, detailed = true } = {}) {
  const s = normalize(input);
  const balances = [s.initialSun, s.initialWS, s.initialTFSA, 0];
  const wsFee = (s.etfFee + s.platformFee * 1.13) / 100;
  const feeFactors = noFees ? [1, 1, 1] : [(1 - s.sunFee / 100) ** (1 / 12), (1 - wsFee) ** (1 / 12), (1 - wsFee) ** (1 / 12)];
  const smoothFactor = (1 + s.growth / 100) ** (1 / 12);
  const mix = PORTFOLIOS.find(p => p.id === s.portfolio).equity;
  const shockFactor = 1 + (mix * s.stockShock + (1 - mix) * s.bondShock) / 100;
  let fees = 0, percentageFees = 0, adminFees = 0, transferFees = 0;
  const values = [displayValue(balances, 0, s, 0)];
  const rows = [];
  for (let y = 0; y < plan.length; y++) {
    const p = plan[y];
    if (p.transfer && balances[0] > EPS) {
      const cost = noFees ? 0 : Math.min(s.transferFee, balances[0]);
      balances[1] += balances[0] - cost; balances[0] = 0;
      fees += cost; transferFees += cost;
    }
    if (s.shock && p.age === s.shockAge) for (let i = 0; i < 3; i++) balances[i] *= shockFactor;
    for (let m = 0; m < 12; m++) {
      const growth = factors ? factors[y * 12 + m] : smoothFactor;
      for (let a = 0; a < 3; a++) {
        balances[a] *= growth;
        const fee = balances[a] * (1 - feeFactors[a]);
        balances[a] -= fee; fees += fee; percentageFees += fee;
        // End-of-month saving, not the more optimistic beginning-of-year convention.
        balances[a] += p.deposits[a] / 12;
      }
      const admin = noFees ? 0 : Math.min(balances[0], s.sunAdmin * p.index / 12);
      balances[0] -= admin; fees += admin; adminFees += admin;
      balances[3] += p.deposits[3] / 12;
    }
    const value = displayValue(balances, p.refund, s, y + 1);
    values.push(value);
    if (detailed) rows.push({ ...p, endAge: p.age + 1, sun: balances[0], ws: balances[1], tfsa: balances[2], cash: balances[3],
      value, gross: balances.reduce((a, b) => a + b, 0) + p.refund, fees });
  }
  return { values, rows, balances: [...balances], pendingRefund: plan.at(-1)?.refund || 0,
    fees, percentageFees, adminFees, transferFees, final: values.at(-1) };
}

export function randomNormal(seed) {
  let state = seed >>> 0, spare = null;
  const uniform = () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  return () => {
    if (spare !== null) { const value = spare; spare = null; return value; }
    const radius = Math.sqrt(-2 * Math.log(Math.max(1e-15, uniform())));
    const theta = 2 * Math.PI * uniform();
    spare = radius * Math.sin(theta);
    return radius * Math.cos(theta);
  };
}
export function quantile(sorted, p) {
  const position = (sorted.length - 1) * p, a = Math.floor(position), b = Math.ceil(position);
  return sorted[a] + (sorted[b] - sorted[a]) * (position - a);
}

export function calculate(input, { paths = 2000 } = {}) {
  const s = normalize(input), years = TARGET_AGE - s.age;
  const plans = STRATEGIES.map(st => contributionPlan(s, st));
  const results = STRATEGIES.map((st, i) => {
    const steady = runPath(s, plans[i]);
    const feeFree = runPath(s, plans[i], null, { noFees: true, detailed: false });
    return { ...st, ...steady, feeDrag: feeFree.final - steady.final,
      totals: plans[i].reduce((t, p) => ({ own: t.own + p.own, employer: t.employer + p.employer,
        refund: t.refund + p.refund, reinvested: t.reinvested + p.reinvestedRefund, overflow: t.overflow + p.overflow }), { own: 0, employer: 0, refund: 0, reinvested: 0, overflow: 0 }) };
  });
  const samples = STRATEGIES.map(() => Array.from({ length: years + 1 }, () => []));
  const normal = randomNormal(s.seed);
  const logMean = Math.log1p(s.growth / 100) / 12;
  const volatility = s.volatility / 100 / Math.sqrt(12);
  const factors = new Float64Array(years * 12);
  const pairedWins = Array(STRATEGIES.length).fill(0);
  for (let k = 0; k < paths; k++) {
    for (let m = 0; m < factors.length; m++) factors[m] = Math.exp(logMean + volatility * normal());
    let baseline = 0;
    for (let i = 0; i < results.length; i++) {
      const path = runPath(s, plans[i], factors, { detailed: false });
      for (let y = 0; y <= years; y++) samples[i][y].push(path.values[y]);
      if (i === 0) baseline = path.final;
      if (path.final > baseline + EPS) pairedWins[i]++;
    }
  }
  results.forEach((r, i) => {
    r.band = samples[i].map(values => {
      values.sort((a, b) => a - b);
      return { low: quantile(values, .1), median: quantile(values, .5), high: quantile(values, .9) };
    });
    r.aboveTFSA = pairedWins[i] / paths;
    const first = plans[i][0];
    r.firstTax = { before: incomeTax(first.salary), after: incomeTax(first.salary, first.employeeRRSP) };
  });
  return { settings: s, years, paths, results };
}

export function matchFeeCrossover(s) {
  const ratio = s.matchRate / 100;
  const sun = s.sunFee / 100, ws = (s.etfFee + s.platformFee * 1.13) / 100;
  if (ratio <= 0) return 0;
  if (sun <= ws) return Infinity;
  return Math.log1p(ratio) / Math.log((1 - ws) / (1 - sun));
}
