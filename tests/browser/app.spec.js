import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { calculate, DEFAULTS } from '../../model.js';
const ready = page => expect(page.locator('#results')).toHaveAttribute('aria-busy','false');
const dollar = n => new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0}).format(n);
async function openSection(page, text) {
  const summary = page.locator('.control-section summary').filter({hasText:text});
  if (!(await summary.evaluate(n=>n.parentElement.open))) await summary.click();
}

test('default browser results equal tested model; no errors or third-party requests', async ({page}, info) => {
  const errors=[], external=[];
  page.on('pageerror',e=>errors.push(e.message));
  const expectedOrigin = new URL(info.project.use.baseURL || process.env.SITE_URL || 'http://127.0.0.1:4173').origin;
  page.on('request',r=>{if(new URL(r.url()).origin!==expectedOrigin)external.push(r.url());});
  await page.goto('./'); await ready(page);
  const expected=calculate(DEFAULTS,{paths:2});
  await expect(page.locator('.scenario-card')).toHaveCount(5);
  for(const r of expected.results)await expect(page.locator(`.scenario-card[data-focus="${r.id}"] .amount`)).toHaveText(dollar(r.final));
  await expect(page.locator('#tax-panel .metric-big')).toHaveText('$1,212');
  await expect(page.locator('#fee-panel')).toContainText('2.00%');
  await expect(page.locator('#result-basis')).toContainText('today’s purchasing power');
  expect(errors).toEqual([]);expect(external).toEqual([]);
  expect(await page.evaluate(()=>localStorage.length)).toBe(0);
});

test('all risk profiles are interactive and higher volatility widens the displayed range', async ({page})=>{
  await page.goto('./');await ready(page);
  let lowBand;
  for(const id of ['VCIP','VCNS','VBAL','VGRO','VEQT']){
    await page.locator(`[name="portfolio"][value="${id}"]`).check(); await ready(page);
    await expect(page.locator('#risk-summary')).toContainText(`${id}-like exposure`);
    if(id==='VCIP')lowBand=await page.locator('#risk-summary').innerText();
  }
  expect(await page.locator('#risk-summary').innerText()).not.toBe(lowBand);
  await expect(page.locator('#growth')).toHaveValue('6');
  await expect(page.locator('#volatility')).toHaveValue('18');
});

test('fees, tax reserve and nominal/real toggles update without stale output', async ({page})=>{
  await page.goto('./');await ready(page);
  const before=await page.locator('[data-focus="hybrid"].scenario-card .amount').innerText();
  await page.getByRole('button',{name:'Try 0.5%',exact:true}).click(); await ready(page);
  expect(await page.locator('[data-focus="hybrid"].scenario-card .amount').innerText()).not.toBe(before);
  await page.locator('#real').uncheck();await ready(page);
  await expect(page.locator('#result-basis')).toContainText('future nominal dollars');
  await page.locator('#afterTax').uncheck();await ready(page);
  await expect(page.locator('#result-basis')).toContainText('before any future');
  await page.locator('#budget').fill('11000');
  await page.locator('#salary').fill('120000');
  await ready(page);
  const expected=calculate({...DEFAULTS,sunFee:.5,budget:11000,salary:120000,real:false,afterTax:false},{paths:2});
  await expect(page.locator('[data-focus="hybrid"].scenario-card .amount')).toHaveText(dollar(expected.results[2].final));
});

test('selecting a route updates accessible chart, tax details and tables', async({page})=>{
  await page.goto('./');await ready(page);
  await page.locator('.scenario-card[data-focus="rrsp"]').click();
  await expect(page.locator('#tax-panel .metric-big')).toHaveText('$2,101');
  await expect(page.locator('#growth-desc')).toContainText('Wealthsimple RRSP first');
  await expect(page.locator('#comparison-table .selected-row')).toContainText('Wealthsimple RRSP first');
  await expect(page.locator('.scenario-card[data-focus="rrsp"]')).toHaveAttribute('aria-pressed','true');
});

test('room overflow, DPSP, transfer and shock scenarios remain usable', async({page})=>{
  await page.goto('./');await ready(page);
  await openSection(page,'Contribution room');
  await page.locator('#rrspRoom').fill('0');await page.locator('#tfsaRoom').fill('0');await ready(page);
  await expect(page.locator('#warnings')).toContainText('Contribution room runs out');
  await page.locator('#matchType').selectOption('dpsp');await ready(page);
  await openSection(page,'Transfers');
  await page.locator('#transfer').selectOption('annual');await ready(page);
  await expect(page.locator('#warnings')).toContainText('Transfer scenario enabled');
  await openSection(page,'Returns, inflation');
  await page.locator('#shock').check();await ready(page);
  await expect(page.locator('#warnings')).toContainText('Stress test enabled');
  await expect(page.locator('#cards')).not.toContainText('NaN');
  await expect(page.locator('#cards')).not.toContainText('Infinity');
});

test('device saving is opt-in, persists when enabled, and reset clears it',async({page})=>{
  await page.goto('./');await ready(page);
  await page.locator('#budget').fill('9000');await ready(page);
  await page.reload();await ready(page);await expect(page.locator('#budget')).toHaveValue('7000');
  await page.locator('#remember').check();
  await page.locator('#budget').fill('9000');await ready(page);
  await page.reload();await ready(page);await expect(page.locator('#budget')).toHaveValue('9000');
  await page.locator('#reset').click();await ready(page);
  expect(await page.evaluate(()=>localStorage.length)).toBe(0);
  await expect(page.locator('#budget')).toHaveValue('7000');
  await expect(page.locator('#remember')).not.toBeChecked();
});

test('explicit scenario link round-trips; hostile fragments are ignored',async({page,context})=>{
  await page.goto('./');await ready(page);
  await page.locator('#budget').fill('12000');await ready(page);
  await page.locator('#share').click();
  const url=await page.locator('#share-url').inputValue();
  expect(url).toContain('#scenario=');
  expect(new URL(url).search).toBe('');
  const second=await context.newPage();await second.goto(url);await ready(second);
  await expect(second.locator('#budget')).toHaveValue('12000');
  await expect(second.locator('#remember')).not.toBeChecked();
  await second.goto('./#scenario='+encodeURIComponent(JSON.stringify({portfolio:'<img src=x onerror=alert(1)>',salary:-5,age:200})));
  await second.reload();await ready(second);
  await expect(second.locator('#age')).toHaveValue('70');
  await expect(second.locator('#salary')).toHaveValue('0');
  await expect(second.locator('[name="portfolio"][value="VGRO"]')).toBeChecked();
  await expect(second.locator('#load-error')).toBeHidden();
  await second.close();
});

test('CSV is downloadable with assumptions and every strategy/year',async({page})=>{
  await page.goto('./');await ready(page);
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#export-csv').click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('long-view-scenario.csv');
  const csv=await readFile(await download.path(),'utf8');
  expect(csv).toContain('Tax savings reinvested nominal');
  expect(csv).toContain('retirementTax');
  expect(csv).toContain('"Sun Life RRSP first"');
  expect(csv.split('\r\n')).toHaveLength(3+5*36);
});

test('no horizontal page overflow, screenshots and WCAG checks',async({page},info)=>{
  await page.goto('./');await ready(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  const accessibility=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await mkdir('.artifacts/screenshots',{recursive:true});
  await page.screenshot({path:`.artifacts/screenshots/${info.project.name}-home.png`});
  await page.locator('#results').evaluate(n=>n.scrollIntoView({block:'start'}));
  await page.screenshot({path:`.artifacts/screenshots/${info.project.name}-results.png`});
  await page.emulateMedia({media:'print'});
  await expect(page.locator('#growth-chart')).toBeVisible();
});
