import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, normalize, STRATEGIES, PORTFOLIOS, contributionPlan, runPath, calculate, projectedTFSALimit, projectedRRSPLimit, matchFeeCrossover, randomNormal, quantile } from '../model.js';
import { deductionSavings } from '../tax.js';
const route = id => STRATEGIES.find(s => s.id === id);
const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const settings = extra => normalize({ ...DEFAULTS, ...extra });

test('defaults use 36 → 72, same budget and same mix for every route', () => {
  const result = calculate(DEFAULTS, {paths:20});
  assert.equal(result.years,36);
  assert.equal(result.results.length,5);
  for (const r of result.results) near(r.totals.own,result.results[0].totals.own);
  assert.ok(PORTFOLIOS.every(p => p.mer === .22));
  assert.deepEqual(PORTFOLIOS.map(p => p.equity), [1,.8,.6,.4,.2]);
});
test('visual-first release preserves the five published v1.0 financial outcomes', () => {
  const result = calculate(DEFAULTS, {paths:20});
  const previous = [382083.73283634754, 407716.5518836461, 443825.8244263912, 395706.0196663182, 449097.8732297548];
  result.results.forEach((r, i) => near(r.final, previous[i]));
  const otherFocus = calculate({...DEFAULTS, focus:'hybridRRSP'}, {paths:20});
  assert.deepEqual(result.results, otherFocus.results);
});
test('first-year contribution routes and employer match are auditable', () => {
  const expected = { tfsa:[0,0,7000,0], sun:[11000,0,0,0], hybrid:[8000,0,3000,0], rrsp:[0,7000,0,0], hybridRRSP:[8000,3000,0,0] };
  for (const [id, deposits] of Object.entries(expected)) assert.deepEqual(contributionPlan(DEFAULTS,route(id))[0].deposits,deposits);
});
test('refund is on employee contributions, NOT employee plus employer', () => {
  const p = contributionPlan(DEFAULTS,route('hybrid'));
  near(p[0].refund,1211.791348);
  near(p[0].employeeRRSP,4000); near(p[0].employer,4000);
  near(p[1].reinvestedRefund,p[0].refund);
  near(p[0].reinvestedRefund,0);
  assert.ok(p[0].refund < deductionSavings(100000,8000));
});
test('no instant recursive gross-up; RRSP refund creates a new deduction next year only', () => {
  const s = settings({refundDestination:'rrsp',salaryGrowth:0,budgetGrowth:0,inflation:0});
  const p = contributionPlan(s,route('rrsp'));
  near(p[0].employeeRRSP,7000);
  near(p[1].employeeRRSP,7000+p[0].refund);
  near(p[1].refund,deductionSavings(100000,p[1].employeeRRSP));
});
test('partial match ratios and insufficient own budget', () => {
  const p = contributionPlan(settings({budget:2000,matchRate:50}),route('hybrid'))[0];
  near(p.matchedEmployee,2000); near(p.employer,1000); near(p.deposits[0],3000);
});
test('zero matching does not force a hybrid contribution into Sun Life', () => {
  const s = settings({matchRate:0});
  const a = contributionPlan(s,route('hybrid')), b = contributionPlan(s,route('tfsa'));
  assert.deepEqual(a,b);
});
test('group RRSP employer deposits consume current RRSP room', () => {
  const p = contributionPlan(settings({rrspRoom:3000}),route('hybrid'))[0];
  near(p.matchedEmployee,1500); near(p.employer,1500); near(p.rrspRoom,0); near(p.deposits[2],5500);
});
test('DPSP employer deposits use no current RRSP room, but reduce next-year room', () => {
  const s = settings({rrspRoom:3000,matchType:'dpsp',salaryGrowth:0,budgetGrowth:0,inflation:0});
  const p = contributionPlan(s,route('hybrid'));
  near(p[0].matchedEmployee,3000); near(p[0].employer,3000); near(p[0].rrspRoom,0);
  near(p[1].openingRRSP,18000-3000);
});
test('new RRSP room uses PRIOR salary, plus prior employer RRSP taxable benefit', () => {
  const s = settings({salaryGrowth:8,budgetGrowth:0,inflation:0});
  const p = contributionPlan(s,route('hybrid'));
  near(p[1].openingRRSP,p[0].rrspRoom+.18*104000);
  near(p[2].openingRRSP,p[1].rrspRoom+.18*(108000+p[1].employer));
});
test('pension adjustment reduces new room, but cannot erase existing room', () => {
  const p = contributionPlan(settings({pensionAdjustment:40000}),route('rrsp'));
  near(p[1].openingRRSP,p[0].rrspRoom);
});
test('published 2027 RRSP cap and rounded projected TFSA limits', () => {
  near(projectedRRSPLimit(0,2.1),33810);
  near(projectedRRSPLimit(1,2.1),35390);
  near(projectedRRSPLimit(2,2.1),35390*1.021);
  near(projectedTFSALimit(0,2.1),7000);
  near(projectedTFSALimit(1,2.1),7000);
  near(projectedTFSALimit(2,2.1),7500);
});
test('all money is conserved in registered deposits plus visible cash, including refunds', () => {
  for (const strategy of STRATEGIES) {
    const p = contributionPlan(settings({budget:100000,tfsaRoom:0,rrspRoom:0}),strategy);
    for (const year of p) {
      near(year.deposits.reduce((a,b) => a+b,0),year.own+year.employer+year.reinvestedRefund);
      assert.ok(year.tfsaRoom>=0 && year.rrspRoom>=0);
    }
    near(p[0].overflow,100000);
    near(p[0].refund,0); near(p[0].employer,0);
  }
});
test('contributions and matching stop on time; final tax savings still reinvested', () => {
  const p = contributionPlan(settings({stopAge:40,matchEndAge:38,refundDestination:'rrsp'}),route('hybrid'));
  assert.ok(p[1].employer>0); near(p[2].employer,0);
  near(p[4].own,0); near(p[4].salary,0);
  near(p[4].employeeRRSP,0);
  near(p[4].reinvestedRefund,p[3].refund);
  near(p[4].refund,0);
});
test('closed-form month-end annuity, zero taxes and fees', () => {
  const s = settings({age:70,stopAge:71,budget:1200,budgetGrowth:0,inflation:0,growth:12,etfFee:0,sunFee:0,afterTax:false,initialTFSA:5000,tfsaRoom:1e5});
  const p = contributionPlan(s,route('tfsa'));
  const r = runPath(s,p);
  const month = 1.12**(1/12);
  const expected = 5000*1.12**2 + 100*((month**12-1)/(month-1))*1.12;
  near(r.final,expected,1e-7);
});
test('compound fee convention: initial lump sum pays (1-fee) each year', () => {
  const s = settings({budget:0,initialSun:10000,growth:0,inflation:0,sunFee:2,afterTax:false});
  const r=runPath(s,contributionPlan(s,route('tfsa')));
  near(r.balances[0],10000*.98**36,1e-6);
  near(r.fees,10000-r.balances[0],1e-6);
});
test('flat fees cannot make an empty or small account negative', () => {
  const s=settings({budget:0,initialSun:50,sunAdmin:1000});
  const r=runPath(s,contributionPlan(s,route('tfsa')));
  assert.ok(r.balances.every(b=>b>=0)); near(r.balances[0],0);
});
test('after-tax display discounts only deferred money, not the TFSA or cash', () => {
  const s=settings({budget:0,initialSun:10000,initialWS:20000,initialTFSA:30000,growth:0,sunFee:0,etfFee:0,inflation:0,retirementTax:25});
  const r=runPath(s,contributionPlan(s,route('tfsa')));
  near(r.final,52500);
  const gross={...s,afterTax:false};
  near(runPath(gross,contributionPlan(gross,route('tfsa'))).final,60000);
});
test('inflation changes display by the exact endpoint discount factor', () => {
  const s=settings({real:true});
  const p=contributionPlan(s,route('hybrid'));
  near(runPath({...s,real:false},p).final/runPath(s,p).final,1.021**36);
});
test('transfer is tax-neutral, consumes no contribution room, and charges once per transfer', () => {
  const s=settings({budget:0,age:65,stopAge:65,initialSun:10000,transfer:'leaving',transferFee:100,growth:0,etfFee:0,sunFee:2,inflation:0,afterTax:false});
  const p=contributionPlan(s,route('tfsa')),r=runPath(s,p);
  near(r.balances[0],0); near(r.balances[1],9900); near(r.transferFees,100);
  near(p[0].rrspRoom,s.rrspRoom);
});
test('annual transfers keep new payroll deposits at Sun Life until next year', () => {
  const s=settings({age:70,stopAge:71,matchEndAge:71,transfer:'annual',budget:1000,growth:0,etfFee:0,sunFee:0,afterTax:false,inflation:0});
  const p=contributionPlan(s,route('hybrid')),r=runPath(s,p);
  near(r.rows[0].sun,2000); near(r.rows[0].ws,0);
  near(r.rows[1].sun,0); near(r.rows[1].ws,2000);
});
test('fees and foregone growth counterfactual vanishes when all fees are zero', () => {
  const r=calculate(settings({sunFee:0,etfFee:0,sunAdmin:0,transferFee:0,platformFee:0}),{paths:10});
  r.results.forEach(s=>near(s.feeDrag,0));
});
test('a lower Sun Life fee helps matched accounts with fixed deposits', () => {
  const a=settings({sunFee:2}),b=settings({sunFee:.5});
  const p=contributionPlan(a,route('hybrid'));
  assert.ok(runPath(b,p).final>runPath(a,p).final);
});
test('match crossover is one deposit, about 38.5 years, not a claim about all contributions', () => {
  near(matchFeeCrossover(DEFAULTS),38.50756964237);
  assert.equal(matchFeeCrossover(settings({sunFee:0})),Infinity);
});
test('zero volatility collapses all percentile paths to the steady illustration', () => {
  const r=calculate(settings({volatility:0}),{paths:20});
  for(const s of r.results) for(let y=0;y<s.values.length;y++) {
    near(s.band[y].low,s.values[y],1e-5); near(s.band[y].high,s.values[y],1e-5);
  }
});
test('same seed is reproducible; changed seed changes distribution, not deterministic totals', () => {
  const a=calculate(DEFAULTS,{paths:40}),b=calculate(DEFAULTS,{paths:40}),c=calculate(settings({seed:5}),{paths:40});
  assert.deepEqual(a,b);
  near(a.results[0].final,c.results[0].final);
  assert.notEqual(a.results[0].band.at(-1).median,c.results[0].band.at(-1).median);
});
test('paired market draws are identical for identical account/fee/cash-flow scenarios', () => {
  const s=settings({budget:0,initialWS:10000,initialTFSA:5000,initialSun:10000,sunFee:.22});
  const r=calculate(s,{paths:40});
  for(const route of r.results) assert.deepEqual(route.band,r.results[0].band);
});
test('additional shock scales invested opening assets, not new deposits or cash', () => {
  const s=settings({age:70,stopAge:70,budget:0,initialTFSA:10000,growth:0,etfFee:0,inflation:0,portfolio:'VEQT',shock:true,shockAge:70,stockShock:-40});
  const r=runPath(s,contributionPlan(s,route('tfsa')));
  near(r.final,6000);
});
test('seeded normal generator is approximately standard normal', () => {
  const n=randomNormal(12345); let sum=0,squares=0;
  for(let i=0;i<100000;i++){const x=n();sum+=x;squares+=x*x;}
  assert.ok(Math.abs(sum/100000)<.02); assert.ok(Math.abs(squares/100000-1)<.03);
  near(quantile([0,10,20],.25),5);
});
test('hostile or nonsensical shared parameters are bounded and whitelisted', () => {
  const s=normalize({age:100,stopAge:2,salary:-100,portfolio:'<script>',sunFee:Infinity,seed:-1,extra:'no',real:'false'});
  assert.equal(s.age,70); assert.equal(s.stopAge,70); assert.equal(s.salary,0);
  assert.equal(s.portfolio,'VGRO'); assert.equal(s.sunFee,2); assert.equal(s.seed,1);
  assert.equal(s.extra,undefined); assert.equal(s.real,true);
});
test('stress combination remains finite with no negative balances or overcontribution', () => {
  const s=settings({age:18,budget:100000,salary:500000,rrspRoom:0,tfsaRoom:0,sunFee:4,sunAdmin:1000,transfer:'annual',transferFee:1000,shock:true,stockShock:-70,bondShock:-40,volatility:35});
  const r=calculate(s,{paths:10});
  for(const result of r.results){assert.ok(Number.isFinite(result.final));assert.ok(result.balances.every(b=>b>=0));assert.ok(result.band.every(b=>b.low<=b.median&&b.median<=b.high));}
});
