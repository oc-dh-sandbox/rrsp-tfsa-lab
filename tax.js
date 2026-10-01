// 2026 Ontario employee income-tax estimate. All inputs are annual CAD.
// Sources and deliberate exclusions are documented in METHODOLOGY.md.
export const TAX_YEAR = 2026;
export const FEDERAL = [[58523, .14], [117045, .205], [181440, .26], [258482, .29], [Infinity, .33]];
export const ONTARIO = [[53891, .0505], [107785, .0915], [150000, .1116], [220000, .1216], [Infinity, .1316]];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function bracketTax(income, brackets) {
  let tax = 0, previous = 0;
  for (const [ceiling, rate] of brackets) {
    tax += Math.max(0, Math.min(income, ceiling) - previous) * rate;
    previous = ceiling;
    if (income <= ceiling) break;
  }
  return tax;
}

export function healthPremium(income) {
  if (income <= 20000) return 0;
  if (income <= 36000) return Math.min(300, .06 * (income - 20000));
  if (income <= 48000) return 300 + Math.min(150, .06 * (income - 36000));
  if (income <= 72000) return 450 + Math.min(150, .25 * (income - 48000));
  if (income <= 200000) return 600 + Math.min(150, .25 * (income - 72000));
  return 750 + Math.min(150, .25 * (income - 200000));
}

export function payroll(gross) {
  const pensionable = clamp(gross - 3500, 0, 74600 - 3500);
  const baseCPP = pensionable * .0495;
  const enhancedCPP = pensionable * .01 + clamp(gross - 74600, 0, 85000 - 74600) * .04;
  const ei = clamp(gross, 0, 68900) * .0163;
  return { baseCPP, enhancedCPP, ei, totalCPP: baseCPP + enhancedCPP };
}

export function incomeTax(gross, rrspDeduction = 0, { employment = true } = {}) {
  gross = Math.max(0, gross);
  const p = employment ? payroll(gross) : { baseCPP: 0, enhancedCPP: 0, ei: 0, totalCPP: 0 };
  const taxable = Math.max(0, gross - p.enhancedCPP - Math.max(0, rrspDeduction));
  const basicFederal = 16452 - 1623 * clamp((taxable - 181440) / (258482 - 181440), 0, 1);
  const federalCredits = .14 * (basicFederal + p.baseCPP + p.ei + (employment ? Math.min(gross, 1501) : 0));
  const federal = Math.max(0, bracketTax(taxable, FEDERAL) - federalCredits);
  const ontarioBase = Math.max(0, bracketTax(taxable, ONTARIO) - .0505 * (12989 + p.baseCPP + p.ei));
  const surtax = .20 * Math.max(0, ontarioBase - 5818) + .36 * Math.max(0, ontarioBase - 7446);
  // Ontario tax reduction, single taxpayer, no dependants. Does not reduce health premium.
  const reduction = clamp(600 - (ontarioBase + surtax), 0, ontarioBase + surtax);
  const ontario = ontarioBase + surtax - reduction;
  const health = healthPremium(taxable);
  return { taxable, federal, ontario, ontarioBase, surtax, reduction, health,
    total: federal + ontario + health, basicFederal, ...p };
}

// Future policy is explicitly held constant in real terms, not a forecast of future legislation.
export function deductionSavings(gross, deduction, index = 1) {
  return Math.max(0, (incomeTax(gross / index).total - incomeTax(gross / index, deduction / index).total) * index);
}
