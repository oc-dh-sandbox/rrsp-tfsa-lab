import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bracketTax, FEDERAL, ONTARIO, payroll, healthPremium, incomeTax, deductionSavings } from '../tax.js';
const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('published federal bracket thresholds and rates', () => {
  near(bracketTax(58523, FEDERAL), 8193.22);
  near(bracketTax(117045, FEDERAL), 20190.23);
  near(bracketTax(181440, FEDERAL), 36932.93);
  near(bracketTax(258482, FEDERAL), 59275.11);
  near(bracketTax(258582, FEDERAL) - bracketTax(258482, FEDERAL), 33);
});
test('published Ontario brackets before credits', () => {
  near(bracketTax(53891, ONTARIO), 2721.4955);
  near(bracketTax(107785, ONTARIO), 7652.7965);
  near(bracketTax(220100, ONTARIO) - bracketTax(220000, ONTARIO), 13.16);
});
test('2026 CPP, CPP2, EI maxima and enhanced deductions', () => {
  const p = payroll(100000);
  near(p.baseCPP, 3519.45); near(p.enhancedCPP, 1127); near(p.totalCPP, 4646.45); near(p.ei, 1123.07);
  near(payroll(3500).baseCPP, 0); near(payroll(50000).enhancedCPP, 465);
  near(payroll(80000).enhancedCPP, 927);
});
test('Ontario health-premium piecewise boundaries, not a flat marginal rate', () => {
  for (const [income, premium] of [[0,0],[20000,0],[22500,150],[25000,300],[36000,300],[37000,360],[38500,450],[48000,450],[48300,525],[48600,600],[72000,600],[72300,675],[72600,750],[200000,750],[200300,825],[200600,900],[1e6,900]]) near(healthPremium(income), premium);
});
test('independent 100k employee golden calculation with CPP/EI credits', () => {
  const t = incomeTax(100000);
  near(t.taxable, 98873);
  near(t.federal, 13301.5972);
  near(t.ontarioBase, 5946.95674);
  near(t.surtax, 25.791348);
  near(t.total, 20024.345288);
});
test('4k deduction straddles Ontario surtax threshold; no flat-rate approximation', () => {
  const t = incomeTax(100000, 4000);
  near(t.taxable, 94873); near(t.federal, 12481.5972); near(t.surtax, 0);
  near(t.total, 18812.55394);
  near(deductionSavings(100000,4000), 1211.791348);
  near(deductionSavings(100000,7000), 2101.291348);
  near(incomeTax(100000).totalCPP, t.totalCPP);
});
test('federal basic amount phases from maximum to minimum', () => {
  near(incomeTax(181440, 0, {employment:false}).basicFederal, 16452);
  near(incomeTax((181440+258482)/2, 0, {employment:false}).basicFederal, (16452+14829)/2);
  near(incomeTax(258482, 0, {employment:false}).basicFederal, 14829);
  near(incomeTax(300000).basicFederal, 14829);
});
test('taxes are nonnegative and marginal deduction savings respect actual tax paid', () => {
  for (let gross = 0; gross <= 500000; gross += 5000) {
    assert.ok(incomeTax(gross).total >= 0);
    assert.ok(deductionSavings(gross, gross + 1e6) <= incomeTax(gross).total + 1e-6);
    assert.ok(incomeTax(gross, 5000).total <= incomeTax(gross).total);
  }
  near(incomeTax(0).total, 0); near(deductionSavings(10000,5000), 0);
});
test('future normalized tax assumption scales consistently', () => {
  near(deductionSavings(200000,8000,2), 2 * deductionSavings(100000,4000));
});
