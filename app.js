import { VERSION, DEFAULTS, BOUNDS, normalize, PORTFOLIOS, STRATEGIES } from './data.js?v=1.1.0';
import { matchFeeCrossover } from './model.js';

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);
const compact = n => Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}m` : Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(0)}k` : money(n);
const pct = (n, digits = 2) => `${Number(n).toFixed(digits)}%`;
const escape = str => String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const STORAGE = 'long-view-scenario-v1';
const STORIES = [
  { id: 'tfsa', label: 'TFSA', next: 'TFSA', chapter: 'THE STARTING POINT', title: 'Start with a low-fee TFSA.', description: 'Your savings grow at Wealthsimple. No employer match in this route.' },
  { id: 'sun', label: 'Sun Life', next: 'Sun Life', chapter: 'ADD THE EMPLOYER', title: 'What if you take the match?', description: 'Put your RRSP saving at Sun Life, with employer contributions added where eligible.' },
  { id: 'hybrid', label: 'Split + TFSA', next: 'split the saving', chapter: 'A LITTLE OF BOTH', title: 'Take the match. Split the rest.', description: 'Matched dollars go to Sun Life. Extra savings go to a low-fee Wealthsimple TFSA first.' },
  { id: 'rrsp', label: 'WS RRSP', next: 'a low-fee RRSP', chapter: 'TRY THE OTHER ACCOUNT', title: 'A low-fee RRSP instead?', description: 'Use a Wealthsimple RRSP, without the employer match. Reinvest the tax savings too.' },
  { id: 'hybridRRSP', label: 'Split + RRSP', next: 'match + RRSP', chapter: 'THE OTHER WAY TO SPLIT', title: 'Match first. Low-fee RRSP next.', description: 'Capture eligible matching at Sun Life; put extra RRSP contributions at Wealthsimple.' }
];
let settings = { ...DEFAULTS }, result = null, worker = null, job = 0, timer = null, saved = false;
let showRange = false;
let initialWarning = '';
try {
  const item = localStorage.getItem(STORAGE);
  if (item) { settings = normalize(JSON.parse(item)); saved = true; }
} catch { initialWarning = 'Saved settings could not be read. The calculator still works without device storage.'; }
try {
  if (location.hash.startsWith('#scenario=')) {
    if (location.hash.length > 16000) throw new Error('Oversized link');
    settings = normalize(JSON.parse(decodeURIComponent(location.hash.slice(10))));
    // Opening somebody else's link never silently overwrites an opted-in local scenario.
    saved = false;
    initialWarning = 'Opened a shared scenario. Device saving is off; review the assumptions before relying on it.';
  }
} catch { initialWarning = 'This scenario link could not be read. Default or previously saved settings are shown instead.'; }

function field(name, label, { unit = '', help = '', step = 1, slider = false } = {}) {
  const [min, max] = BOUNDS[name];
  return `<div class="field"><label class="field-label" for="${name}">${label}</label><div class="input-shell"><input type="number" id="${name}" name="${name}" min="${min}" max="${max}" step="${step}" value="${settings[name]}" ${help ? `aria-describedby="${name}-help"` : ''}><span class="unit">${unit}</span></div>${slider ? `<input type="range" data-range="${name}" min="${min}" max="${max}" step="${step}" value="${settings[name]}" aria-label="${label} slider">` : ''}${help ? `<small class="field-help" id="${name}-help">${help}</small>` : ''}</div>`;
}
function select(name, label, options, help = '') {
  return `<div class="field"><label class="field-label" for="${name}">${label}</label><select id="${name}" name="${name}" ${help ? `aria-describedby="${name}-help"` : ''}>${options.map(([value, title]) => `<option value="${value}" ${settings[name] === value ? 'selected' : ''}>${title}</option>`).join('')}</select>${help ? `<small class="field-help" id="${name}-help">${help}</small>` : ''}</div>`;
}
function createControls() {
  $('basic-fields').innerHTML = field('salary', 'Annual employment income', { unit: '$', step: 1000 }) + field('budget', 'Your annual saving budget', { unit: '$', step: 500, help: 'Try $7,000 (the 2026 TFSA limit) or $11,000 (4% of pay + $7,000).' }) + `<div class="field-pair">${field('age', 'Age now')}${field('stopAge', 'Stop saving at age', { help: 'Salary also stops. No spending withdrawals before 72.' })}</div>`;
  $('portfolio-picker').innerHTML = PORTFOLIOS.map(p => `<label class="portfolio-option"><input type="radio" name="portfolio" value="${p.id}" ${p.id === settings.portfolio ? 'checked' : ''}><span><strong>${p.id}</strong><small>${p.name}</small></span><span class="allocation">${p.equity * 100}/${Math.round((1 - p.equity) * 100)}<i aria-hidden="true"><span style="width:${p.equity * 100}%"></span></i></span></label>`).join('');
  $('fee-fields').innerHTML = field('sunFee', 'Sun Life total annual percentage cost', { unit: '%', step: .05, slider: true }) + field('etfFee', 'Vanguard ETF MER at Wealthsimple', { unit: '%', step: .01, help: 'Reported MER 0.22%; self-directed platform fee defaults to zero.' }) + field('sunAdmin', 'Separate Sun Life annual account fee', { unit: '$', help: 'Only if not already included above; enter the tax-inclusive amount.' });
  $('match-fields').innerHTML = field('matchCap', 'Your contributions eligible for matching', { unit: '%', step: .5, help: 'Percentage of salary. Default: the first 4% you contribute.' }) + field('matchRate', 'Employer adds this much per dollar', { unit: '%', step: 10, help: '100% = dollar-for-dollar. 50% = 50¢ for every $1 you contribute.' }) + field('matchEndAge', 'Employer matching stops at age', { help: 'Also stops when employment / saving stops, whichever is earlier.' }) + select('matchType', 'Employer contribution goes into', [['rrsp', 'Group RRSP'], ['dpsp', 'DPSP (vested; transferable)']], 'DPSP affects next year’s RRSP room instead of using current room.') + select('refundDestination', 'Reinvest tax savings into', [['tfsa', 'Wealthsimple TFSA first'], ['rrsp', 'RRSP first (then TFSA)']], 'Reinvested in the following year. “RRSP first” follows the route’s RRSP provider.') + field('retirementTax', 'Assumed eventual RRSP withdrawal tax', { unit: '%', step: 1, slider: true, help: 'A lifetime effective-tax reserve, not the marginal rate on a lump sum.' });
  $('room-fields').innerHTML = field('tfsaRoom', 'TFSA room available now', { unit: '$', step: 500 }) + field('rrspRoom', 'RRSP room available now', { unit: '$', step: 500 }) + field('pensionAdjustment', 'Other annual pension adjustment', { unit: '$', step: 500, help: 'Additional to any modeled DPSP match. Increases with inflation.' }) + field('initialTFSA', 'Existing Wealthsimple TFSA', { unit: '$', step: 1000 }) + field('initialSun', 'Existing Sun Life RRSP / vested DPSP', { unit: '$', step: 1000 }) + field('initialWS', 'Existing Wealthsimple RRSP', { unit: '$', step: 1000 });
  $('return-fields').innerHTML = field('growth', 'Assumed gross compound return', { unit: '%', step: .1, slider: true, help: 'Before all fees, including reinvested distributions. Not a forecast.' }) + field('volatility', 'Annual log-return volatility', { unit: '%', step: .5, slider: true, help: 'Higher = wider simulated swings. Zero removes random market variation.' }) + field('inflation', 'Inflation', { unit: '%', step: .1 }) + field('salaryGrowth', 'Annual income growth', { unit: '%', step: .1 }) + field('budgetGrowth', 'Annual personal-budget growth', { unit: '%', step: .1 }) + '<label class="remember"><input type="checkbox" id="shock" name="shock"> Add a one-time market shock</label>' + field('shockAge', 'Age when the shock happens') + `<div class="field-pair">${field('stockShock', 'Equity drawdown', { unit: '%', step: 5 })}${field('bondShock', 'Bond drawdown', { unit: '%', step: 5 })}</div>`;
  $('transfer-fields').innerHTML = select('transfer', 'Move Sun Life balances to Wealthsimple', [['never', 'No transfers (conservative assumption)'], ['leaving', 'When employment / saving stops'], ['annual', 'At each year-start, if permitted']], 'All existing Sun Life balances follow this rule in every route. Annual transfers do not move a new deposit immediately.') + field('transferFee', 'Cost per actual transfer', { unit: '$', help: 'Tax-inclusive charge; no assumed reimbursement.' }) + field('platformFee', 'Extra WS management fee before HST', { unit: '%', step: .1, help: '0 for self-directed. Optional cost sensitivity: 0.5 Core / 0.4 Premium. Added to ETF expenses; tiers do not change automatically.' });
  $('remember').checked = saved;
  syncControls();
}
function syncControls() {
  for (const [key, value] of Object.entries(settings)) {
    const node = $(key);
    if (node) { if (node.type === 'checkbox') node.checked = value; else node.value = value; }
    document.querySelectorAll(`[data-range="${key}"]`).forEach(n => { n.value = value; });
  }
  document.querySelectorAll('[name="portfolio"]').forEach(n => { n.checked = n.value === settings.portfolio; });
}
function persist() {
  if (!saved) return;
  try { localStorage.setItem(STORAGE, JSON.stringify(settings)); }
  catch { $('status').textContent = 'Calculation works, but this browser could not save the scenario.'; }
}
function queue() {
  clearTimeout(timer);
  ++job;
  if (worker) { worker.terminate(); worker = null; }
  settings = normalize(settings);
  persist();
  $('results').setAttribute('aria-busy', 'true');
  $('status').textContent = 'Recalculating 2,000 shared market paths…';
  for (const id of ['export-csv', 'share', 'print']) $(id).disabled = true;
  timer = setTimeout(recalculate, 160);
}
function fail(error) {
  $('load-error').hidden = false;
  $('load-error').textContent = `The calculation could not finish. Try reloading. ${error.message || error}`;
  $('results').setAttribute('aria-busy', 'false');
  $('status').textContent = 'Calculation unavailable. Any earlier results are out of date.';
}
async function recalculate() {
  const id = job;
  if (worker) worker.terminate();
  try {
    if (typeof Worker !== 'undefined') {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (data.id !== job) return;
        if (data.error) fail(data.error); else receive(data.result);
      };
      worker.onerror = event => fail(event.message || 'Browser worker error');
      worker.postMessage({ id, settings });
    } else {
      const { calculate } = await import('./model.js');
      receive(calculate(settings));
    }
  } catch (error) { fail(error); }
}
function receive(data) {
  result = data;
  render();
  $('results').setAttribute('aria-busy', 'false');
  $('status').textContent = `Updated · ${data.paths.toLocaleString()} paired paths · select a route to explore its range and tax details.`;
  $('load-error').hidden = true;
  for (const id of ['export-csv', 'share', 'print']) $(id).disabled = false;
}
function setFocus(id, returnToChart = false) {
  if (!STRATEGIES.some(s => s.id === id)) return;
  settings.focus = id; persist();
  if (result) render();
  const index = STORIES.findIndex(st => st.id === id);
  $('status').textContent = `Step ${index + 1} of ${STORIES.length}. ${STORIES[index].title}`;
  if (returnToChart) {
    $('scene-title').setAttribute('tabindex', '-1');
    $('scene-title').focus({ preventScroll: true });
    $('results').scrollIntoView({ block: 'start' });
  }
}
function openHood(section = 'starting') {
  const panel = $(section);
  if (panel?.matches('.control-section')) panel.open = true;
  if (!$('hood').open) { $('hood').showModal(); document.body.classList.add('hood-open'); }
  requestAnimationFrame(() => panel?.scrollIntoView({ block: 'nearest' }));
}
function statRow(label, value) { return `<div class="stat-row"><span>${label}</span><span>${value}</span></div>`; }
function render() {
  const s = result.settings;
  const focus = result.results.find(r => r.id === settings.focus) || result.results[2];
  const base = result.results[0];
  const mix = PORTFOLIOS.find(p => p.id === s.portfolio);
  const basis = s.real ? 'today’s purchasing power' : 'future nominal dollars';
  const taxBasis = s.afterTax ? `after reserving ${pct(s.retirementTax, 0)} of RRSP / DPSP balances for eventual tax` : 'before any future RRSP / DPSP withdrawal tax';
  $('result-basis').textContent = `CAD in ${basis}, ${taxBasis}.`;
  $('horizon').textContent = `${result.years} years · ${Math.max(0, s.stopAge - s.age)} saving`;
  const warns = [];
  if (initialWarning) warns.push(initialWarning);
  if (result.results.some(r => r.totals.overflow > .5)) warns.push('Contribution room runs out in at least one route. Extra money is kept as visible, uninvested cash at 0%—not overcontributed or quietly dropped. Check the account breakdown.');
  if (s.transfer !== 'never') warns.push('Transfer scenario enabled: confirm the employer permits these transfers without losing matching, and that the money is vested and not locked in.');
  if (s.shock) warns.push(`Stress test enabled: a ${pct(mix.equity * s.stockShock + (1 - mix.equity) * s.bondShock, 0)} additional portfolio drawdown at age ${s.shockAge}, applied to both providers.`);
  if (s.salary < 60000) warns.push('At lower incomes, omitted credits and income-tested benefits can materially change the RRSP advantage. This is not a full tax-return calculator.');
  if (s.budget > s.salary * .8 && s.salary > 0) warns.push('The budget may exceed available take-home pay. Affordability is not enforced; confirm a realistic cash budget.');
  if (focus.firstTax.after.taxable < 50000 && s.salary >= 60000) warns.push('Large deductions bring this route below $50,000 taxable income. LIFT and other income-tested benefits are not included.');
  $('warnings').innerHTML = warns.map(w => `<p class="notice">${escape(w)}</p>`).join('');
  const maxValue = Math.max(1, ...result.results.map(r => r.final));
  $('cards').innerHTML = result.results.map((r, i) => `<button type="button" class="scenario-card" data-focus="${r.id}" style="--color:${r.color}" aria-pressed="${r.id === focus.id}" aria-label="${r.name}, ${money(r.final)} at age 72. View this scenario."><span class="route-number" aria-hidden="true">${i + 1}</span><span class="card-name">${r.name}</span><span class="comparison-track" aria-hidden="true"><span style="width:${r.final / maxValue * 100}%"></span></span><span class="amount">${money(r.final)}</span><span class="route-arrow" aria-hidden="true">↗</span></button>`).join('');
  $('chart-legend').innerHTML = `<span><i class="legend-line" style="--color:${focus.color}" aria-hidden="true"></i>${focus.short}</span>${focus.id === 'tfsa' ? '' : '<span><i class="legend-line reference" aria-hidden="true"></i>TFSA reference</span>'}`;
  renderScene(focus);
  drawChart(focus);
  const tail = focus.band.at(-1);
  const lowReturn = (Math.exp(Math.log1p(s.growth / 100) - 1.2815516 * s.volatility / 100) - 1) * 100;
  const highReturn = (Math.exp(Math.log1p(s.growth / 100) + 1.2815516 * s.volatility / 100) - 1) * 100;
  $('risk-summary').innerHTML = `<div class="risk-stat"><small>Lower · 10th percentile</small><strong>${money(tail.low)}</strong></div><div class="risk-stat"><small>Middle · simulated median</small><strong>${money(tail.median)}</strong></div><div class="risk-stat"><small>Higher · 90th percentile</small><strong>${money(tail.high)}</strong></div><p class="field-note" style="grid-column:1/-1">${mix.id}-like exposure: ${mix.equity * 100}% equities. Its modeled one-year 10–90% gross-return interval is about ${pct(lowReturn, 1)} to ${pct(highReturn, 1)}, before an added shock. These are illustrative percentiles, not limits on what can happen.</p>`;
  renderTables(focus);
  const matched = result.results[2], firstMatch = matched.rows[0];
  const cross = matchFeeCrossover(s);
  const crossText = Number.isFinite(cross) ? `${cross.toFixed(1)} years` : 'no finite crossover at these percentage fees';
  const hybridDiff = matched.final - base.final;
  $('match-story').innerHTML = `<div class="insight-columns"><p>In year one, ${money(firstMatch.matchedEmployee)} of your payroll savings earns <strong>${money(firstMatch.employer)} from the employer</strong>. A ${pct(s.matchRate, 0)} match is a ${pct(s.matchRate, 0)} boost to each eligible dollar—not a ${pct(s.matchCap, 0)} annual investment return. The salary percentage only limits the amount eligible.</p><p>Under these settings, <strong>match + TFSA ends ${money(Math.abs(hybridDiff))} ${hybridDiff >= 0 ? 'above' : 'below'} TFSA-first</strong>, in ${basis}, ${taxBasis}. That does not mean all extra RRSP savings belong at Sun Life. The five routes separate that decision.</p></div><small>Fee-only thought experiment: one matched RRSP deposit versus one unmatched low-fee RRSP deposit, same investments and tax treatment. The initial match is eroded after ${crossText}. This excludes flat fees and transfers, assumes a positive eligible match, and is not the crossover for a lifetime of new contributions.</small>`;
  renderTax(focus);
  const wsFee = s.etfFee + s.platformFee * 1.13;
  const sunDollars = s.sunFee * 1000 + s.sunAdmin, wsDollars = wsFee * 1000;
  const biggest = Math.max(sunDollars, wsDollars, 1);
  $('fee-panel').innerHTML = `<div class="fee-bar-row" style="--color:#a36815"><div class="bar-label"><strong>Sun Life</strong><span>${pct(s.sunFee)}${s.sunAdmin ? ` + ${money(s.sunAdmin)}/yr` : ''}</span></div><div class="fee-bar"><div style="width:${sunDollars / biggest * 100}%"></div></div><small>${money(sunDollars)} per year on a $100,000 balance</small></div><div class="fee-bar-row" style="--color:#17746e"><div class="bar-label"><strong>Wealthsimple + ETF</strong><span>${pct(wsFee)}</span></div><div class="fee-bar"><div style="width:${wsDollars / biggest * 100}%"></div></div><small>${money(wsDollars)} per year on a $100,000 balance</small></div><div class="metric-big">${money(focus.feeDrag)}</div><p class="metric-sub">Age-72 value lost to fees and foregone growth, in ${basis}, for <strong>${focus.name}</strong>${s.afterTax ? ', after the tax reserve' : ', before withdrawal tax'}.</p>${statRow('Lifetime fees actually deducted', `${money(focus.fees)} nominal`)}${statRow('Of those: account + transfer fees', `${money(focus.adminFees + focus.transferFees)} nominal`)}`;
  renderRetirement(focus);
  renderVisuals(focus);
}
function renderScene(focus) {
  const s = result.settings;
  const index = STORIES.findIndex(st => st.id === focus.id), story = STORIES[index];
  $('scene-step').textContent = `${index + 1} OF 5 · ${story.chapter}`;
  $('scene-title').textContent = story.title;
  $('scene-description').textContent = story.description;
  $('scene-total').textContent = money(focus.final);
  $('hood-value').textContent = money(focus.final);
  const difference = focus.final - result.results[0].final;
  $('scene-difference').textContent = index === 0 ? 'Your no-match reference.' : Math.abs(difference) < .5 ? 'About the same as TFSA-first.' : `${money(Math.abs(difference))} ${difference > 0 ? 'more' : 'less'} than TFSA-first.`;
  $('step-position').textContent = `${index + 1} / ${STORIES.length}`;
  $('previous').disabled = index === 0;
  $('next').textContent = index === STORIES.length - 1 ? 'Back to the start ↺' : `Next: ${STORIES[index + 1].next} →`;
  $('walkthrough').querySelectorAll('button').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.focus === focus.id));
  });
  $('scenario-summary').textContent = `Age ${s.age} → 72 · ${money(s.budget)}/yr to start · ${s.portfolio} ↗`;
  $('scenario-summary').setAttribute('aria-label', `Current scenario: age ${s.age}, ${money(s.salary)} income, ${money(s.budget)} starting annual budget, ${s.portfolio}. Review or change assumptions.`);
  $('overview-basis').textContent = `Steady-return illustrations at 72, ${s.real ? 'in today’s dollars' : 'in future dollars'}${s.afterTax ? `, including a ${pct(s.retirementTax, 0)} reserve on deferred balances for eventual withdrawal tax` : ', before any eventual RRSP / DPSP withdrawal tax'}.`;
  const notes = [];
  if (focus.totals.overflow > .5) notes.push('This route includes uninvested cash when registered contribution room runs out.');
  if (s.transfer !== 'never') notes.push('Transfers assume the employer’s plan allows them without losing matching.');
  if (s.shock) notes.push(`An extra market fall at age ${s.shockAge} is included.`);
  if (s.salary < 60000 || focus.firstTax.after.taxable < 50000) notes.push('Low-income credits and benefits are not included in the tax estimate.');
  if (s.salary > 0 && s.budget > s.salary * .8) notes.push('Check affordability: the budget may exceed take-home pay.');
  if (initialWarning) notes.push(initialWarning);
  $('scenario-note').hidden = notes.length === 0;
  $('scenario-note').textContent = notes.join(' ');
  $('range-panel').hidden = !showRange;
  $('range-toggle').setAttribute('aria-pressed', String(showRange));
  $('range-toggle').innerHTML = `${showRange ? 'Hide' : 'Show'} market swings <span aria-hidden="true">∿</span>`;
  $('chart-caption').textContent = `${showRange ? 'Shading: simulated range. ' : 'Illustrative growth. '}${s.real ? 'Today’s dollars' : 'Future dollars'} · ${s.afterTax ? `${pct(s.retirementTax, 0)} RRSP tax reserved` : 'before withdrawal tax'}.`;
}
function renderVisuals(focus) {
  const s = result.settings, first = focus.rows[0];
  const scale = s.real ? (1 + s.inflation / 100) ** result.years : 1;
  const parts = [
    ['TFSA', focus.balances[2] / scale, '#17746e'],
    [s.afterTax ? 'RRSP / DPSP, tax reserved' : 'RRSP / DPSP, before tax', (focus.balances[0] + focus.balances[1]) * (s.afterTax ? 1 - s.retirementTax / 100 : 1) / scale, '#5551b5'],
    ['Cash + pending tax savings', (focus.balances[3] + focus.pendingRefund) / scale, '#68786f']
  ].filter(([, value]) => value > .005);
  const stack = (items, total) => `<div class="allocation-bar" aria-hidden="true">${items.map(([, value, color]) => `<span style="width:${value / Math.max(total, .001) * 100}%;background:${color}"></span>`).join('')}</div>`;
  const key = (items, isCompact = false) => `<div class="allocation-key">${items.map(([name, value, color]) => `<span><i style="background:${color}" aria-hidden="true"></i>${name}<strong>${isCompact ? compact(value) : money(value)}</strong></span>`).join('')}</div>`;
  $('outcome-split').innerHTML = `<small>Inside that total</small>${stack(parts, focus.final)}${key(parts, true)}`;
  const deposits = [['Sun Life RRSP / DPSP', first.deposits[0], '#a36815'], ['Wealthsimple RRSP', first.deposits[1], '#287ca8'], ['Wealthsimple TFSA', first.deposits[2], '#17746e'], ['Uninvested cash', first.deposits[3], '#68786f']].filter(([, value]) => value > .005);
  $('plan-visual').innerHTML = `<div class="cash-sources"><div><span>You save</span><strong>${money(first.own)}</strong></div><div><span>Employer adds</span><strong>${money(first.employer)}</strong></div><div><span>Tax savings</span><strong>${money(first.refund)}</strong><small>Reinvested next year</small></div></div><p class="mini-heading">Where year-one contributions go</p>${deposits.length ? stack(deposits, first.deposits.reduce((a, b) => a + b, 0)) + key(deposits) : '<p class="fine-print">No new contributions in year one.</p>'}`;
  const ws = s.etfFee + s.platformFee * 1.13;
  const sunAmount = s.sunFee * 1000 + s.sunAdmin, wsAmount = ws * 1000;
  const max = Math.max(sunAmount, wsAmount, 1);
  $('fee-visual').innerHTML = `<p class="visual-fee-basis">Annual cost on the same <strong>$100,000</strong> invested</p>${[['Sun Life', sunAmount, '#a36815', `${pct(s.sunFee)}${s.sunAdmin ? ` + ${money(s.sunAdmin)}/yr` : ''}`], ['Wealthsimple + ETF', wsAmount, '#17746e', pct(ws)]].map(([label, amount, color, rate]) => `<div class="visual-fee-row"><span>${label}<small>${rate}</small></span><div class="visual-fee-track" aria-hidden="true"><div style="width:${amount / max * 100}%;background:${color}"></div></div><strong>${money(amount)}</strong></div>`).join('')}`;
}
function drawChart(focus) {
  const s = result.settings, narrow = matchMedia('(max-width: 700px)').matches;
  const width = narrow ? 460 : 900, height = narrow ? 310 : 370;
  const left = 70, right = 23, top = 22, bottom = 42;
  const font = narrow ? 14 : 13;
  $('growth-chart').setAttribute('viewBox', `0 0 ${width} ${height}`);
  const max = Math.max(1, ...result.results.flatMap(r => r.values), ...(showRange ? result.results.flatMap(r => r.band.map(b => b.high)) : []));
  const order = 10 ** Math.floor(Math.log10(max));
  const ceiling = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(n => n >= max / order) * order;
  const tick = ceiling / 4;
  const x = i => left + i / result.years * (width - left - right);
  const y = value => height - bottom - value / ceiling * (height - top - bottom);
  const line = values => values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const band = line(focus.band.map(b => b.high)) + ' ' + focus.band.map((b, i) => `L${x(i).toFixed(2)},${y(b.low).toFixed(2)}`).reverse().join(' ') + ' Z';
  let svg = `<title id="growth-title">Investment value to age 72</title><desc id="growth-desc">${escape(focus.name)}: ${money(focus.final)} at age 72 in the steady-return illustration. ${showRange ? `Shaded simulated 10th–90th percentile range: ${money(focus.band.at(-1).low)} to ${money(focus.band.at(-1).high)}.` : 'Use Show market swings to see the simulated range.'} All figures ${s.real ? 'in today’s dollars' : 'nominal'}${s.afterTax ? ', after an assumed withdrawal-tax reserve' : ', before withdrawal tax'}. Year-by-year data is in Go deeper.</desc>`;
  for (let i = 0; i <= 4; i++) svg += `<line x1="${left}" x2="${width - right}" y1="${y(tick * i)}" y2="${y(tick * i)}" stroke="#dce2d7"/><text x="${left - 9}" y="${y(tick * i) + 4}" text-anchor="end" fill="#586663" font-size="${font}">${compact(tick * i)}</text>`;
  const interval = narrow ? 10 : 5;
  const ticks = [...new Set([s.age, ...Array.from({ length: 11 }, (_, i) => 20 + i * interval).filter(a => a > s.age + 3 && a < 69), 72])];
  for (const age of ticks) svg += `<text x="${x(age - s.age)}" y="${height - 19}" text-anchor="middle" fill="#586663" font-size="${font}">${age}</text>`;
  svg += `<text x="${width / 2}" y="${height - 1}" text-anchor="middle" fill="#586663" font-size="${font - 1}">Age</text>`;
  svg += showRange ? `<path data-band="range" d="${band}" fill="${focus.color}" opacity=".14"/>` : `<path d="${line(focus.values)} L${x(result.years)},${y(0)} L${x(0)},${y(0)} Z" fill="${focus.color}" opacity=".07"/>`;
  if (s.stopAge > s.age && s.stopAge < 72) svg += `<line x1="${x(s.stopAge - s.age)}" x2="${x(s.stopAge - s.age)}" y1="${top}" y2="${height - bottom}" stroke="#8a9f93" stroke-dasharray="4 4"/><text x="${x(s.stopAge - s.age) - 5}" y="${top + 12}" text-anchor="end" fill="#586663" font-size="${font - 1}">Saving stops</text>`;
  if (focus.id !== 'tfsa') svg += `<path data-curve="tfsa" d="${line(result.results[0].values)}" fill="none" stroke="#7a8981" stroke-width="2.4" stroke-dasharray="6 5" stroke-linejoin="round"/>`;
  svg += `<path data-curve="${focus.id}" d="${line(focus.values)}" fill="none" stroke="${focus.color}" stroke-width="3.5" stroke-linejoin="round"/><circle cx="${x(result.years)}" cy="${y(focus.final)}" r="5" fill="${focus.color}" stroke="#fffefa" stroke-width="2"/>`;
  svg += `<text data-endpoint-label="true" x="${x(result.years) - 8}" y="${Math.max(top + 16, y(focus.final) - 14)}" text-anchor="end" fill="#223c3b" font-size="${narrow ? 16 : 17}" font-weight="650">${compact(focus.final)}</text>`;
  $('growth-chart').innerHTML = svg;
}
function renderTax(focus) {
  const first = focus.rows[0], { before, after } = focus.firstTax;
  const percent = first.employeeRRSP ? first.refund / first.employeeRRSP * 100 : 0;
  $('tax-panel').innerHTML = `<p class="metric-sub" style="margin-top:12px">${focus.name}</p><div class="metric-big">${money(first.refund)}</div><p class="metric-sub">First-year tax savings · ${pct(percent, 1)} of employee RRSP contributions</p><div class="stat-list">${statRow('Your RRSP contributions', money(first.employeeRRSP))}${statRow('Employer contribution (not another refund)', money(first.employer))}${statRow('Taxable income before → after', `${money(before.taxable)} → ${money(after.taxable)}`)}${statRow('Federal income tax saved', money(before.federal - after.federal))}${statRow('Ontario tax + surtax saved', money(before.ontario - after.ontario))}${statRow('Health premium saved', money(before.health - after.health))}${statRow('Total income tax before → after', `${money(before.total)} → ${money(after.total)}`)}${statRow('Reinvested over the following year', money(first.refund))}</div>`;
}
function renderTables(focus) {
  const s = result.settings;
  const scale = s.real ? (1 + s.inflation / 100) ** result.years : 1;
  $('comparison-table').innerHTML = `<table><caption>At age 72, steady-return path · ${s.real ? 'today’s dollars' : 'future dollars'} · components are before withdrawal tax; last column follows the tax-reserve toggle.</caption><thead><tr><th>Route</th><th>TFSA</th><th>RRSP / DPSP<br>before tax</th><th>Cash + pending<br>tax savings</th><th>Fees + lost<br>growth</th><th>Comparable<br>total</th></tr></thead><tbody>${result.results.map(r => `<tr class="${r.id === focus.id ? 'selected-row' : ''}"><td><span class="legend-dot" style="--color:${r.color}"></span>${r.name}</td><td>${money(r.balances[2] / scale)}</td><td>${money((r.balances[0] + r.balances[1]) / scale)}</td><td>${money((r.balances[3] + r.pendingRefund) / scale)}</td><td>${money(r.feeDrag)}</td><td><strong>${money(r.final)}</strong></td></tr>`).join('')}</tbody></table>`;
  $('year-table').innerHTML = `<table><caption>Values at each age · same display basis as the cards. Bands belong to ${focus.name}. Rows before age 72 use the same eventual withdrawal-tax assumption.</caption><thead><tr><th>Age</th>${result.results.map(r => `<th>${r.short}</th>`).join('')}<th>Selected 10th</th><th>Selected 90th</th></tr></thead><tbody>${Array.from({ length: result.years + 1 }, (_, i) => `<tr><td>${s.age + i}</td>${result.results.map(r => `<td>${money(r.values[i])}</td>`).join('')}<td>${money(focus.band[i].low)}</td><td>${money(focus.band[i].high)}</td></tr>`).join('')}</tbody></table>`;
}
function renderRetirement(focus) {
  const s = result.settings, scale = s.real ? (1 + s.inflation / 100) ** result.years : 1;
  const deferred = focus.balances[0] + focus.balances[1];
  $('retirement-panel').innerHTML = `<p class="retirement-intro">For <strong>${focus.name}</strong>, the projected tax-deferred pot is <strong>${money(deferred / scale)}</strong> before tax. A ${pct(s.retirementTax, 0)} eventual withdrawal-tax reserve is <strong>${money(deferred * s.retirementTax / 100 / scale)}</strong>. The illustrative first annual RRIF minimum would be <strong>${money(deferred * .054 / scale)}</strong>, taxable as income—not all of the account at once. Amounts are ${s.real ? 'in today’s purchasing power' : 'in future dollars'}.</p><div class="table-scroll" tabindex="0" role="region" aria-label="Withdrawal tax sensitivity"><table><caption>Age-72 total after different assumed eventual withdrawal-tax costs · fixed steady-return balances, not optimized retirement withdrawals.</caption><thead><tr><th>Route</th>${[15, 25, 35, 45].map(t => `<th>${t}% tax</th>`).join('')}</tr></thead><tbody>${result.results.map(r => `<tr class="${r.id === focus.id ? 'selected-row' : ''}"><td>${r.short}</td>${[15, 25, 35, 45].map(t => `<td>${money(((r.balances[0] + r.balances[1]) * (1 - t / 100) + r.balances[2] + r.balances[3] + r.pendingRefund) / scale)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function exportCSV() {
  if (!result) return;
  const rows = [
    ['The Long View', VERSION, 'Educational scenario; not a forecast'],
    ['Settings', JSON.stringify({ ...result.settings, focus: settings.focus })],
    ['Strategy', 'Tax year (illustrative)', 'Age at start', 'Age at end', 'Salary nominal', 'Own budget nominal', 'Employer match nominal', 'Employee RRSP nominal', 'Tax savings earned nominal', 'Tax savings reinvested nominal', 'TFSA deposit nominal', 'Sun Life deferred deposit nominal', 'WS deferred deposit nominal', 'Cash overflow deposit nominal', 'TFSA room left nominal', 'RRSP room left nominal', 'Sun Life deferred balance nominal', 'WS deferred balance nominal', 'TFSA balance nominal', 'Cash balance nominal', 'Pending tax savings nominal', 'Cumulative fees nominal', 'Total in selected display basis', '10th percentile selected basis', 'Median selected basis', '90th percentile selected basis']
  ];
  for (const r of result.results) r.rows.forEach((p, y) => rows.push([r.name, p.year, p.age, p.endAge, p.salary, p.own, p.employer, p.employeeRRSP, p.refund, p.reinvestedRefund, p.deposits[2], p.deposits[0], p.deposits[1], p.deposits[3], p.tfsaRoom, p.rrspRoom, p.sun, p.ws, p.tfsa, p.cash, p.refund, p.fees, p.value, r.band[y + 1].low, r.band[y + 1].median, r.band[y + 1].high].map(v => typeof v === 'number' ? Math.round(v * 100) / 100 : v)));
  const content = '\ufeff' + rows.map(row => row.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'long-view-scenario.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

createControls();
$('walkthrough').innerHTML = STORIES.map((story, i) => `<button type="button" data-focus="${story.id}" aria-pressed="${story.id === settings.focus}"><span class="step-number" aria-hidden="true">${i + 1}</span><span>${story.label}</span></button>`).join('');
$('version').textContent = `v${VERSION}`;
$('fund-source-table').innerHTML = `<table><caption>Vanguard Canada public product pages · checked Oct. 1, 2026</caption><thead><tr><th>Portfolio</th><th>Equities / bonds</th><th>MER</th></tr></thead><tbody>${PORTFOLIOS.map(p => `<tr><td><a href="${p.url}" target="_blank" rel="noopener noreferrer">${p.id} · ${p.name} ↗</a></td><td>${Math.round(p.equity * 100)} / ${Math.round((1 - p.equity) * 100)}</td><td>${pct(p.mer)}</td></tr>`).join('')}</tbody></table>`;
$('scenario').addEventListener('submit', e => e.preventDefault());
$('scenario').addEventListener('input', e => {
  const n = e.target, key = n.dataset.range || n.name;
  if (!key) return;
  if (key === 'portfolio') {
    const p = PORTFOLIOS.find(p => p.id === n.value);
    if (!p) return;
    Object.assign(settings, { portfolio: p.id, growth: p.growth, volatility: p.volatility, etfFee: p.mer });
    syncControls();
  } else {
    settings[key] = n.type === 'checkbox' ? n.checked : key in BOUNDS ? n.value === '' ? DEFAULTS[key] : Number(n.value) : n.value;
    if (n.dataset.range) $(key).value = n.value;
    else document.querySelectorAll(`[data-range="${key}"]`).forEach(r => { r.value = n.value; });
  }
  queue();
});
$('scenario').addEventListener('change', () => { settings = normalize(settings); syncControls(); });
for (const key of ['real', 'afterTax']) $(key).addEventListener('change', e => { settings[key] = e.target.checked; queue(); });
document.addEventListener('click', e => {
  const focus = e.target.closest('[data-focus]');
  if (focus) setFocus(focus.dataset.focus, focus.classList.contains('scenario-card'));
  const hood = e.target.closest('[data-hood]');
  if (hood) openHood(hood.dataset.hood);
  const fee = e.target.closest('[data-fee]');
  if (fee) { settings.sunFee = Number(fee.dataset.fee); syncControls(); queue(); }
});
$('resample').addEventListener('click', () => { settings.seed = settings.seed >= 4294967295 ? 1 : settings.seed + 1; queue(); });
$('range-toggle').addEventListener('click', () => { showRange = !showRange; if (result) render(); });
$('previous').addEventListener('click', () => { const i = STORIES.findIndex(s => s.id === settings.focus); if (i > 0) setFocus(STORIES[i - 1].id, true); });
$('next').addEventListener('click', () => { const i = STORIES.findIndex(s => s.id === settings.focus); setFocus(STORIES[(i + 1) % STORIES.length].id, true); });
for (const id of ['close-hood', 'back-to-chart']) $(id).addEventListener('click', () => $('hood').close());
$('hood').addEventListener('close', () => document.body.classList.remove('hood-open'));
// Native modality makes the page inert; keep Tab cycling in the drawer rather than browser chrome.
$('hood').addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const controls = [...$('hood').querySelectorAll('button, input, select, textarea, a[href], summary, [tabindex]:not([tabindex="-1"])')]
    .filter(n => !n.disabled && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
  const first = controls[0], last = controls.at(-1);
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
$('hood').addEventListener('click', e => {
  const r = $('hood').getBoundingClientRect();
  if (e.target === $('hood') && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) $('hood').close();
});
matchMedia('(max-width: 700px)').addEventListener('change', () => { if (result) drawChart(result.results.find(r => r.id === settings.focus)); });
$('remember').addEventListener('change', e => {
  saved = e.target.checked;
  if (saved) persist(); else { try { localStorage.removeItem(STORAGE); } catch { /* Unavailable storage is non-fatal. */ } }
});
$('reset').addEventListener('click', () => {
  settings = { ...DEFAULTS }; initialWarning = ''; saved = false; showRange = false;
  try { localStorage.removeItem(STORAGE); } catch { /* Non-fatal. */ }
  history.replaceState(null, '', location.pathname);
  $('remember').checked = false; $('share-box').hidden = true;
  syncControls(); queue();
});
$('export-csv').addEventListener('click', exportCSV);
$('share').addEventListener('click', () => {
  const url = `${location.origin}${location.pathname}#scenario=${encodeURIComponent(JSON.stringify(settings))}`;
  $('share-box').hidden = false; $('share-url').value = url; $('share-url').focus(); $('share-url').select();
  $('status').textContent = 'Scenario link created. It contains the financial inputs; copy and share it only intentionally.';
});
$('print').addEventListener('click', () => window.print());
window.addEventListener('error', event => fail(event.error || event.message));
queue();
