import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { calculate, DEFAULTS } from '../../model.js';
const ready = async page => {
  await expect(page.locator('#results')).toHaveAttribute('data-calculation-state', 'ready');
  await expect(page.locator('#results')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#load-error')).toBeHidden();
};
const dollar = n => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);
async function openHood(page, section = 'starting') {
  if (!(await page.locator('#hood').isVisible())) await page.locator('.hood-button').click();
  const panel = page.locator(`#${section}`);
  if (!(await panel.evaluate(n => n.open))) await panel.locator(':scope > summary').click();
}
async function closeHood(page) {
  await page.locator('#close-hood').click();
  await expect(page.locator('#hood')).not.toBeVisible();
}
async function deeper(page) {
  if (!(await page.locator('#advanced-view').evaluate(n => n.open))) await page.locator('#advanced-view > summary').click();
}

test('chart is in the first viewport, controls tucked away, exact model results and no uploads', async ({ page }, info) => {
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  const expectedOrigin = new URL(info.project.use.baseURL || process.env.SITE_URL || 'http://127.0.0.1:4173').origin;
  page.on('request', r => { if (new URL(r.url()).origin !== expectedOrigin) external.push(r.url()); });
  await page.goto('./'); await ready(page);
  const expected = calculate(DEFAULTS, { paths: 2 });
  await expect(page.locator('.scenario-card')).toHaveCount(5);
  for (const r of expected.results) await expect(page.locator(`.scenario-card[data-focus="${r.id}"] .amount`)).toHaveText(dollar(r.final));
  await expect(page.locator('#scene-total')).toHaveText(dollar(expected.results[0].final));
  await expect(page.locator('[data-endpoint-label]')).toHaveText('$382k');
  await expect(page.locator('#fee-visual')).toContainText('2.00%');
  await expect(page.locator('#result-basis')).toContainText('today’s purchasing power');
  await expect(page.locator('#hood')).not.toBeVisible();
  await expect(page.locator('input:visible, select:visible')).toHaveCount(0);
  expect(await page.locator('#advanced-view').evaluate(n => n.open)).toBe(false);
  expect(await page.locator('#assumptions').evaluate(n => n.open)).toBe(false);
  const chart = await page.locator('#growth-chart').boundingBox();
  expect(chart.y).toBeGreaterThan(0);
  expect(chart.y + chart.height).toBeLessThan(page.viewportSize().height);
  expect(chart.height).toBeGreaterThan(180);
  expect(errors).toEqual([]); expect(external).toEqual([]);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test('all five walkthrough steps are reversible and change presentation, not assumptions', async ({ page }) => {
  await page.goto('./'); await ready(page);
  const expected = calculate(DEFAULTS, { paths: 2 });
  await expect(page.locator('#previous')).toBeDisabled();
  for (let i = 0; i < expected.results.length; i++) {
    const r = expected.results[i];
    await expect(page.locator('#scene-total')).toHaveText(dollar(r.final));
    await expect(page.locator('#step-position')).toHaveText(`${i + 1} / 5`);
    await expect(page.locator(`#walkthrough [data-focus="${r.id}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#growth-desc')).toContainText(r.name);
    await expect(page.locator(`[data-curve="${r.id}"]`)).toHaveCount(1);
    await expect(page.locator('#plan-visual')).toContainText(dollar(r.rows[0].employer));
    if (i < 4) await page.locator('#next').click();
  }
  await page.locator('#previous').click();
  await expect(page.locator('#step-position')).toHaveText('4 / 5');
  await page.locator('#next').click(); await page.locator('#next').click();
  await expect(page.locator('#step-position')).toHaveText('1 / 5');
  await expect(page.locator('#salary')).toHaveValue('100000');
  await expect(page.locator('#budget')).toHaveValue('7000');
  await expect(page.locator('#sunFee')).toHaveValue('2');
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test('drawer changes fees, cash budget and display basis with a live preview', async ({ page }) => {
  await page.goto('./'); await ready(page);
  await openHood(page, 'fees');
  await page.getByRole('button', { name: 'Try 0.5%', exact: true }).click(); await ready(page);
  await openHood(page, 'display');
  await page.locator('#real').uncheck(); await ready(page);
  await page.locator('#afterTax').uncheck(); await ready(page);
  await openHood(page, 'starting');
  await page.locator('#budget').fill('11000'); await page.locator('#salary').fill('120000'); await ready(page);
  const expected = calculate({ ...DEFAULTS, sunFee: .5, budget: 11000, salary: 120000, real: false, afterTax: false }, { paths: 2 });
  await expect(page.locator('#hood-value')).toHaveText(dollar(expected.results[0].final));
  await page.locator('#back-to-chart').click();
  await expect(page.locator('#hood')).not.toBeVisible();
  await expect(page.locator('#scene-total')).toHaveText(dollar(expected.results[0].final));
  await expect(page.locator('#result-basis')).toContainText('future nominal dollars');
  await expect(page.locator('#result-basis')).toContainText('before any future');
  await expect(page.locator('#chart-caption')).toContainText('before withdrawal tax');
  await expect(page.locator('#scenario-summary')).toContainText('$11,000');
  await page.locator('#next').click();
  await expect(page.locator('#scene-total')).toHaveText(dollar(expected.results[1].final));
});

test('market swings are available on demand with every investment mix', async ({ page }) => {
  await page.goto('./'); await ready(page);
  await expect(page.locator('#range-panel')).not.toBeVisible();
  await expect(page.locator('[data-band="range"]')).toHaveCount(0);
  await page.locator('#range-toggle').click();
  await expect(page.locator('#range-panel')).toBeVisible();
  await expect(page.locator('[data-band="range"]')).toHaveCount(1);
  await openHood(page, 'investment');
  for (const id of ['VCIP', 'VCNS', 'VBAL', 'VGRO', 'VEQT']) {
    await page.locator(`[name="portfolio"][value="${id}"]`).check(); await ready(page);
    await expect(page.locator('#risk-summary')).toContainText(`${id}-like exposure`);
  }
  await expect(page.locator('#growth')).toHaveValue('6');
  await expect(page.locator('#volatility')).toHaveValue('18');
  await closeHood(page);
  const before = await page.locator('#risk-summary').innerText();
  const steady = await page.locator('#scene-total').innerText();
  await page.locator('#resample').click(); await ready(page);
  expect(await page.locator('#risk-summary').innerText()).not.toBe(before);
  await expect(page.locator('#scene-total')).toHaveText(steady);
  await page.locator('#range-toggle').click();
  await expect(page.locator('#range-panel')).not.toBeVisible();
});

test('native drawer traps focus, closes on Escape, restores focus and passes accessibility', async ({ page }, info) => {
  await page.goto('./'); await ready(page);
  await page.locator('.hood-button').click();
  await expect(page.getByRole('dialog', { name: 'Under the hood' })).toBeVisible();
  await expect(page.locator('#close-hood')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#back-to-chart')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#close-hood')).toBeFocused();
  for (let i = 0; i < 18; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('#hood'))).toBe(true);
  }
  await openHood(page, 'matching');
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations).toEqual([]);
  expect(await page.locator('#hood').evaluate(n => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
  await mkdir('.artifacts/screenshots', { recursive: true });
  await page.screenshot({ path: `.artifacts/screenshots/${info.project.name}-hood.png` });
  await page.keyboard.press('Escape');
  await expect(page.locator('#hood')).not.toBeVisible();
  await expect(page.locator('.hood-button')).toBeFocused();
  expect(await page.evaluate(() => document.body.classList.contains('hood-open'))).toBe(false);
});

test('comparison bars use a common scale and link back to the same detailed route', async ({ page }) => {
  await page.goto('./'); await ready(page);
  const r = calculate(DEFAULTS, { paths: 2 });
  const max = Math.max(...r.results.map(s => s.final));
  for (const s of r.results) {
    const width = await page.locator(`.scenario-card[data-focus="${s.id}"] .comparison-track > span`).evaluate(n => parseFloat(n.style.width));
    expect(width).toBeCloseTo(s.final / max * 100, 3);
  }
  await page.locator('.scenario-card[data-focus="rrsp"]').click();
  await expect(page.locator('#scene-total')).toHaveText(dollar(r.results[3].final));
  await expect(page.locator('#growth-desc')).toContainText('Wealthsimple RRSP first');
  await expect(page.locator('#scene-title')).toBeFocused();
  await deeper(page);
  await expect(page.locator('#tax-panel .metric-big')).toHaveText('$2,101');
  await expect(page.locator('#comparison-table .selected-row')).toContainText('Wealthsimple RRSP first');
});

test('room, DPSP, transfer and shock controls retain their accounting and visible context', async ({ page }) => {
  await page.goto('./'); await ready(page);
  await openHood(page, 'room');
  await page.locator('#rrspRoom').fill('0'); await page.locator('#tfsaRoom').fill('0'); await ready(page);
  await openHood(page, 'matching');
  await page.locator('#matchType').selectOption('dpsp'); await ready(page);
  await openHood(page, 'transfers');
  await page.locator('#transfer').selectOption('annual'); await ready(page);
  await openHood(page, 'returns');
  await page.locator('#shock').check(); await ready(page);
  await closeHood(page);
  await expect(page.locator('#scenario-note')).toContainText('uninvested cash');
  await expect(page.locator('#scenario-note')).toContainText('Transfers assume');
  await expect(page.locator('#scenario-note')).toContainText('market fall');
  await expect(page.locator('#cards')).not.toContainText('NaN');
  await deeper(page);
  await expect(page.locator('#warnings')).toContainText('Contribution room runs out');
  await expect(page.locator('#warnings')).toContainText('Transfer scenario enabled');
});

test('saving stays opt-in; old-format saved inputs and selected route survive; reset clears', async ({ page }) => {
  await page.goto('./'); await ready(page);
  await openHood(page);
  await page.locator('#budget').fill('9000'); await ready(page);
  await page.reload(); await ready(page);
  await expect(page.locator('#budget')).toHaveValue('7000');
  // This is the storage format used in the original advanced-first release.
  await page.evaluate(() => localStorage.setItem('long-view-scenario-v1', JSON.stringify({ budget: 9000, sunFee: .7, focus: 'hybrid' })));
  await page.reload(); await ready(page);
  await expect(page.locator('#budget')).toHaveValue('9000');
  await expect(page.locator('#sunFee')).toHaveValue('0.7');
  await expect(page.locator('#step-position')).toHaveText('3 / 5');
  await openHood(page);
  await expect(page.locator('#remember')).toBeChecked();
  await page.locator('#budget').fill('9500'); await ready(page);
  await page.reload(); await ready(page);
  await expect(page.locator('#budget')).toHaveValue('9500');
  await openHood(page);
  await page.locator('#reset').click(); await ready(page);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await expect(page.locator('#budget')).toHaveValue('7000');
  await expect(page.locator('#remember')).not.toBeChecked();
  await closeHood(page);
  await expect(page.locator('#step-position')).toHaveText('1 / 5');
});

test('explicit scenario link round-trips including the step; hostile fragments are bounded', async ({ page, context }) => {
  await page.goto('./'); await ready(page);
  await openHood(page);
  await page.locator('#budget').fill('12000'); await ready(page);
  await closeHood(page);
  await page.locator('#walkthrough [data-focus="hybridRRSP"]').click();
  await page.locator('#share').click();
  const url = await page.locator('#share-url').inputValue();
  expect(url).toContain('#scenario='); expect(new URL(url).search).toBe('');
  const second = await context.newPage(); await second.goto(url); await ready(second);
  await expect(second.locator('#budget')).toHaveValue('12000');
  await expect(second.locator('#remember')).not.toBeChecked();
  await expect(second.locator('#step-position')).toHaveText('5 / 5');
  await second.goto('./#scenario=' + encodeURIComponent(JSON.stringify({ portfolio: '<img src=x onerror=alert(1)>', salary: -5, age: 200 })));
  await second.reload(); await ready(second);
  await expect(second.locator('#age')).toHaveValue('70');
  await expect(second.locator('#salary')).toHaveValue('0');
  await expect(second.locator('[name="portfolio"][value="VGRO"]')).toBeChecked();
  await expect(second.locator('#load-error')).toBeHidden();
  await second.close();
});

test('advanced CSV still downloads complete assumptions and all strategy/year rows', async ({ page }) => {
  await page.goto('./'); await ready(page); await deeper(page);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-csv').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('long-view-scenario.csv');
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv).toContain('Tax savings reinvested nominal');
  expect(csv).toContain('retirementTax');
  expect(csv).toContain('"Sun Life RRSP first"');
  expect(csv.split('\r\n')).toHaveLength(3 + 5 * 36);
});

test('responsive visuals and advanced view pass WCAG; screenshots and print work', async ({ page }, info) => {
  await page.goto('./'); await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations).toEqual([]);
  await mkdir('.artifacts/screenshots', { recursive: true });
  await page.screenshot({ path: `.artifacts/screenshots/${info.project.name}-home.png` });
  await page.locator('#walkthrough [data-focus="hybrid"]').click();
  await page.screenshot({ path: `.artifacts/screenshots/${info.project.name}-split.png` });
  await page.locator('#range-toggle').click();
  await page.screenshot({ path: `.artifacts/screenshots/${info.project.name}-range.png` });
  await deeper(page);
  const advanced = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(advanced.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#growth-chart')).toBeVisible();
  await expect(page.locator('#scene-total')).toBeVisible();
  await expect(page.locator('#hood')).not.toBeVisible();
});
