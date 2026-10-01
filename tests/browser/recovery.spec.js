import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { calculate, DEFAULTS } from '../../model.js';

const dollar = n => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);
const fullDefault = calculate(DEFAULTS);
async function ready(page) {
  await expect(page.locator('#results')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#load-error')).toBeHidden();
  await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('.scenario-card')).toHaveCount(5);
}
async function matches(page, expected) {
  for (const r of expected.results) await expect(page.locator(`.scenario-card[data-focus="${r.id}"] .amount`)).toHaveText(dollar(r.final));
  await expect(page.locator('#status')).toContainText('2,000 paired paths');
  const band = expected.results[0].band.at(-1);
  await expect(page.locator('#risk-summary .risk-stat strong')).toHaveText([band.low, band.median, band.high].map(dollar));
}

// This reproduces the misleading banner, not the unknown native source of the owner's event.
test('unrelated opaque window errors do not invalidate a completed calculation', async ({ page }) => {
  await page.goto('./'); await ready(page);
  const before = await page.locator('#scene-total').innerText();
  await page.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' })));
  await expect(page.locator('#load-error')).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: 'Unrelated browser script', filename: 'https://unrelated.example/injected.js' })));
  await expect(page.locator('#load-error')).toBeHidden();
  await expect(page.locator('#scene-total')).toHaveText(before);
  await expect(page.locator('#share')).toBeEnabled();
  await page.locator('#next').click();
  await expect(page.locator('#step-position')).toHaveText('2 / 5');
  await page.locator('.hood-button').click();
  await page.locator('#budget').fill('11000'); await ready(page);
  const expected = calculate({ ...DEFAULTS, budget: 11000 }, { paths: 2 });
  await expect(page.locator('#hood-value')).toHaveText(dollar(expected.results[1].final));
});

for (const mode of ['unsupported', 'constructor', 'post', 'error', 'messageerror']) {
  test(`${mode} worker failure recovers all 2,000 paths locally, including subsequent edits`, async ({ page }) => {
    await page.addInitScript(mode => {
      window.__workerAttempts = 0;
      if (mode === 'unsupported') { window.Worker = undefined; return; }
      window.Worker = class {
        constructor() { ++window.__workerAttempts; if (mode === 'constructor') throw new Error('Worker blocked'); }
        postMessage() {
          if (mode === 'post') throw new Error('Cannot send to worker');
          setTimeout(() => this[mode === 'error' ? 'onerror' : 'onmessageerror']?.({ message: 'Script error.', preventDefault() {} }), 0);
        }
        terminate() {}
      };
    }, mode);
    await page.goto('./'); await ready(page);
    await matches(page, fullDefault);
    await expect(page.locator('#calculation-progress')).toBeHidden();
    await page.locator('.hood-button').click();
    await page.locator('#budget').fill('11000'); await ready(page);
    const expected = calculate({ ...DEFAULTS, budget: 11000 });
    await matches(page, expected);
    await expect(page.locator('#hood-value')).toHaveText(dollar(expected.results[0].final));
    expect(await page.evaluate(() => window.__workerAttempts)).toBe(mode === 'unsupported' ? 0 : 1);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  });
}

test('a real module worker startup exception recovers through the native error event', async ({ page, context }) => {
  let intercepted = 0;
  await context.route(/\/worker\.js(?:\?|$)/, route => {
    intercepted++;
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: 'throw new Error("Injected worker startup exception");' });
  });
  await page.goto('./'); await ready(page);
  expect(intercepted).toBe(1);
  await matches(page, fullDefault);
  await expect(page.locator('#share')).toBeEnabled();
});

test('an opaque event during pending work cannot mark old results current; worker crash still recovers', async ({ page }) => {
  await page.addInitScript(() => {
    window.Worker = class {
      postMessage() {
        const error = this.onerror;
        window.__crashWorker = () => error({ message: 'Script error.', preventDefault() {} });
      }
      terminate() {}
    };
  });
  await page.goto('./');
  await expect.poll(() => page.evaluate(() => typeof window.__crashWorker)).toBe('function');
  await page.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' })));
  await expect(page.locator('#results')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#calculation-progress')).toBeVisible();
  await expect(page.locator('#load-error')).toBeHidden();
  await expect(page.locator('#share')).toBeDisabled();
  await page.evaluate(() => window.__crashWorker()); await ready(page);
  await matches(page, fullDefault);
  await page.evaluate(() => window.__crashWorker()); // Already-settled callbacks are also harmless.
  await expect(page.locator('#load-error')).toBeHidden();
  await expect(page.locator('#share')).toBeEnabled();
});

test('a genuine model failure hides stale results and retry preserves inputs, storage and route', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class {
      constructor(...args) {
        if (!window.__failCalculation) return new NativeWorker(...args);
        window.__failCalculation = false;
      }
      postMessage({ id }) { setTimeout(() => this.onmessage?.({ data: { id, error: 'Injected model failure' } }), 0); }
      terminate() {}
    };
  });
  await page.goto('./'); await ready(page);
  await page.locator('#walkthrough [data-focus="hybrid"]').click();
  await page.locator('.hood-button').click();
  await page.locator('#remember').check();
  await page.evaluate(() => { window.__failCalculation = true; });
  await page.locator('#budget').fill('11000');
  await expect(page.locator('#results')).toHaveAttribute('data-calculation-state', 'failed');
  await expect(page.locator('#hood-value')).toHaveText('Unavailable');
  await expect(page.locator('#budget')).toHaveValue('11000');
  await page.locator('#close-hood').click();
  await expect(page.locator('#load-error')).toBeVisible();
  await expect(page.locator('#load-error')).not.toContainText('Injected');
  await expect(page.locator('#growth-chart')).not.toBeVisible();
  await expect(page.locator('#scene-total')).not.toBeVisible();
  for (const id of ['share', 'print', 'export-csv']) await expect(page.locator(`#${id}`)).toBeDisabled();
  const saved = await page.evaluate(() => localStorage.getItem('long-view-scenario-v1'));
  expect(JSON.parse(saved)).toMatchObject({ budget: 11000, focus: 'hybrid' });
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations).toEqual([]);
  await page.locator('#retry-calculation').click(); await ready(page);
  const expected = calculate({ ...DEFAULTS, budget: 11000 }, { paths: 2 });
  await expect(page.locator('#scene-total')).toHaveText(dollar(expected.results[2].final));
  await expect(page.locator('#step-position')).toHaveText('3 / 5');
  await expect(page.locator('#share')).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('long-view-scenario-v1'))).toBe(saved);
});

test('real rendering errors remain visible and cannot leave a partially updated chart usable', async ({ page }) => {
  await page.goto('./'); await ready(page);
  await page.evaluate(() => {
    const node = document.getElementById('fee-visual');
    Object.defineProperty(node, 'innerHTML', { configurable: true, set() {
      delete node.innerHTML;
      throw new Error('Injected rendering failure');
    } });
  });
  await page.locator('#next').click();
  await expect(page.locator('#load-error')).toBeVisible();
  await expect(page.locator('#results')).not.toBeVisible();
  await expect(page.locator('#share')).toBeDisabled();
  await expect(page.locator('#retry-calculation')).toBeFocused();
  await page.locator('#retry-calculation').click(); await ready(page);
  await expect(page.locator('#step-position')).toHaveText('2 / 5');
  await expect(page.locator('#scene-total')).toHaveText(dollar(fullDefault.results[1].final));
});
