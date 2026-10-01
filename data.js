export const VERSION = '1.1.0';
export const REVIEWED = '2026-10-01';
export const PORTFOLIOS = [
  { id: 'VEQT', name: 'All equity', equity: 1, growth: 6, volatility: 18, style: 'Highest equity risk', mer: .22, url: 'https://www.vanguard.ca/en/product/etf/asset-allocation/9692/vanguard-all-equity-etf-portfolio' },
  { id: 'VGRO', name: 'Growth', equity: .8, growth: 5.3, volatility: 14.5, style: 'Higher equity risk', mer: .22, url: 'https://www.vanguard.ca/en/product/etf/asset-allocation/9579/vanguard-growth-etf-portfolio' },
  { id: 'VBAL', name: 'Balanced', equity: .6, growth: 4.6, volatility: 11, style: 'Middle equity risk', mer: .22, url: 'https://www.vanguard.ca/en/product/etf/asset-allocation/9578/vanguard-balanced-etf-portfolio' },
  { id: 'VCNS', name: 'Conservative', equity: .4, growth: 3.9, volatility: 8.5, style: 'Lower equity risk', mer: .22, url: 'https://www.vanguard.ca/en/product/etf/asset-allocation/9577/vanguard-conservative-etf-portfolio' },
  { id: 'VCIP', name: 'Conservative income', equity: .2, growth: 3.2, volatility: 6.5, style: 'Lowest equity risk here', mer: .22, url: 'https://www.vanguard.ca/en/product/etf/asset-allocation/9691/vanguard-conservative-income-etf-portfolio' }
];
export const STRATEGIES = [
  { id: 'tfsa', name: 'Wealthsimple TFSA first', short: 'TFSA first', color: '#17746e', dash: '', matched: false, destination: 'tfsa', description: 'No employer match. Fill the TFSA, then a Wealthsimple RRSP.' },
  { id: 'sun', name: 'Sun Life RRSP first', short: 'Sun Life RRSP', color: '#a36815', dash: '9 3', matched: true, destination: 'sun', description: 'Take the match; put extra RRSP contributions at Sun Life. TFSA is at Wealthsimple.' },
  { id: 'hybrid', name: 'Match + Wealthsimple TFSA', short: 'Match + TFSA', color: '#5551b5', dash: '', matched: true, destination: 'tfsa', description: 'Only the matched payroll contribution goes to Sun Life. Fill the Wealthsimple TFSA next.' },
  { id: 'rrsp', name: 'Wealthsimple RRSP first', short: 'WS RRSP', color: '#bd5168', dash: '3 3', matched: false, destination: 'ws', description: 'No employer match. Fill a low-fee RRSP, then the TFSA, both at Wealthsimple.' },
  { id: 'hybridRRSP', name: 'Match + Wealthsimple RRSP', short: 'Match + WS RRSP', color: '#287ca8', dash: '12 3 2 3', matched: true, destination: 'ws', description: 'Take the match at Sun Life; put further RRSP savings at Wealthsimple, then fill the TFSA.' }
];
export const DEFAULTS = {
  age: 36, stopAge: 65, salary: 100000, budget: 7000, salaryGrowth: 2.1, budgetGrowth: 2.1,
  portfolio: 'VGRO', growth: 5.3, volatility: 14.5, inflation: 2.1,
  sunFee: 2, sunAdmin: 0, etfFee: .22, platformFee: 0,
  matchCap: 4, matchRate: 100, matchEndAge: 65, matchType: 'rrsp',
  refundDestination: 'tfsa', retirementTax: 25,
  tfsaRoom: 7000, rrspRoom: 18000, pensionAdjustment: 0,
  initialTFSA: 0, initialSun: 0, initialWS: 0,
  transfer: 'never', transferFee: 0,
  shock: false, shockAge: 60, stockShock: -40, bondShock: -5,
  real: true, afterTax: true, focus: 'tfsa', seed: 20261001
};
export const BOUNDS = {
  age: [18, 70], stopAge: [18, 71], salary: [0, 500000], budget: [0, 100000],
  salaryGrowth: [-3, 8], budgetGrowth: [-3, 8], growth: [-5, 12], volatility: [0, 35], inflation: [0, 6],
  sunFee: [0, 4], sunAdmin: [0, 1000], etfFee: [0, 2], platformFee: [0, 1],
  matchCap: [0, 15], matchRate: [0, 200], matchEndAge: [18, 71],
  retirementTax: [0, 55], tfsaRoom: [0, 500000], rrspRoom: [0, 1000000], pensionAdjustment: [0, 40000],
  initialTFSA: [0, 2000000], initialSun: [0, 2000000], initialWS: [0, 2000000], transferFee: [0, 1000],
  shockAge: [18, 71], stockShock: [-70, 0], bondShock: [-40, 0], seed: [1, 4294967295]
};
export function normalize(input = {}) {
  const s = { ...DEFAULTS };
  for (const [key, [min, max]] of Object.entries(BOUNDS)) {
    const value = input[key];
    if (value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value))) s[key] = Math.min(max, Math.max(min, Number(value)));
  }
  for (const key of ['age', 'stopAge', 'matchEndAge', 'shockAge', 'seed']) s[key] = Math.round(s[key]);
  s.stopAge = Math.max(s.age, s.stopAge);
  s.shockAge = Math.max(s.age, s.shockAge);
  for (const key of ['real', 'afterTax', 'shock']) if (typeof input[key] === 'boolean') s[key] = input[key];
  const enums = { portfolio: PORTFOLIOS.map(p => p.id), focus: STRATEGIES.map(s => s.id), matchType: ['rrsp', 'dpsp'], refundDestination: ['tfsa', 'rrsp'], transfer: ['never', 'leaving', 'annual'] };
  for (const [key, options] of Object.entries(enums)) if (options.includes(input[key])) s[key] = input[key];
  return s;
}
