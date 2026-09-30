import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { demoWorkspace } from '../services/demo.ts';

const baseURL = process.env.TEST_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const dataOf = page => page.evaluate(() => JSON.parse(localStorage.getItem('dg_workspace_v2:guest')).data);
const checkIndicator = async page => {
  await expect.poll(() => page.locator('.workspace-tabs:visible').evaluate(root => {
    const selected = root.querySelector('[aria-pressed="true"]').getBoundingClientRect();
    const indicator = root.querySelector('.tab-indicator').getBoundingClientRect();
    return Math.max(Math.abs(selected.left - indicator.left), Math.abs(selected.width - indicator.width));
  })).toBeLessThan(1.5);
};

try {
  for (const width of [390, 1440]) for (const reducedMotion of ['no-preference', 'reduce']) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion, isMobile: width < 768, hasTouch: width < 768 });
    await context.addInitScript(data => localStorage.setItem('dg_workspace_v2:guest', JSON.stringify({ data, dirty: false, baseVersion: 'null' })), demoWorkspace());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseURL);
    await expect(page.getByRole('status')).toHaveText('顯示 3 / 3 筆訂單（目前檔期）');
    const original = await dataOf(page);
    const nav = page.locator('.workspace-tabs:visible');
    const tab = index => nav.getByRole('button').nth(index);
    const duration = await page.locator('#workspace-panel').evaluate(node => parseFloat(getComputedStyle(node).animationDuration));
    assert.ok(reducedMotion === 'reduce' ? duration < 0.001 : duration > 0.1, 'Page motion respects the system setting');
    await checkIndicator(page);
    // Interrupt transitions repeatedly, including keyboard navigation and resizing.
    await nav.evaluate(root => { const buttons = root.querySelectorAll('button'); [2, 0, 1].forEach(index => buttons[index].click()); });
    await expect(tab(1)).toHaveAttribute('aria-pressed', 'true');
    await checkIndicator(page);
    await tab(1).focus(); await page.keyboard.press('ArrowRight');
    await expect(tab(2)).toHaveAttribute('aria-pressed', 'true'); await expect(tab(2)).toBeFocused();
    await checkIndicator(page);
    await page.setViewportSize({ width: width + 50, height: 1000 }); await checkIndicator(page);
    await tab(0).click();
    const edit = page.getByRole('button', { name: width < 768 ? '編輯' : '編輯訂單', exact: true }).first();
    await edit.click();
    const dialog = page.getByRole('dialog', { name: '編輯訂單', exact: true });
    await expect(dialog).toBeVisible();
    const first = dialog.getByRole('button', { name: '關閉編輯訂單', exact: true });
    await expect(first).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: '儲存變更', exact: true })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(first).toBeFocused();
    if (reducedMotion === 'no-preference') {
      await page.evaluate(() => {
        window.exitEvidence = new Promise(resolve => {
          const observer = new MutationObserver(() => {
            const exit = document.querySelector('.motion-presence[data-state="exit"]');
            if (exit) { observer.disconnect(); resolve({ inert: exit.inert, hidden: exit.getAttribute('aria-hidden'), duration: parseFloat(getComputedStyle(exit.querySelector('.dialog-panel')).animationDuration) }); }
          });
          observer.observe(document.body, { subtree: true, attributes: true, childList: true });
        });
      });
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0); await expect(edit).toBeFocused();
    if (reducedMotion === 'no-preference') {
      const evidence = await page.evaluate(() => window.exitEvidence);
      assert.equal(evidence.inert, true); assert.equal(evidence.hidden, 'true'); assert.ok(evidence.duration > 0);
    }
    // Reopening must cancel the old exit timer and preserve the new dialog.
    await edit.click(); await expect(dialog).toBeVisible();
    await dialog.evaluate(async node => { await Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))); });
    await expect(dialog).toBeVisible(); await first.click();
    await expect(page.locator('.dialog-panel')).toHaveCount(0);
    assert.deepEqual(await dataOf(page), original, 'Navigation and dismissed dialogs must not edit workspace data');

    await tab(2).click();
    const progress = page.getByRole('progressbar', { name: '採購完成比例' });
    await expect(progress).toHaveAttribute('aria-valuenow', '0');
    const checkbox = page.getByRole('checkbox', { name: '奶油餅乾禮盒 已購買', exact: true });
    await checkbox.click(); await expect(checkbox).toBeChecked();
    await expect(progress).toHaveAttribute('aria-valuenow', '33');
    await expect.poll(() => page.locator('.purchase-progress-fill').evaluate(node => new DOMMatrix(getComputedStyle(node).transform).a)).toBeCloseTo(1 / 3, 3);
    await page.getByRole('spinbutton').fill('0.20'); await page.getByRole('spinbutton').blur();
    const gross = page.locator('.metric-grid > div').last().locator('.animated-number');
    await expect(gross).toHaveAttribute('aria-label', '$276'); await expect(gross).toHaveText('$276');
    assert.deepEqual((await dataOf(page)).orders, original.orders, 'Motion and procurement updates preserve historical orders');

    await page.getByRole('button', { name: '帳號選單', exact: true }).click();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: '備份資料 (JSON)', exact: true }).click(); await downloaded;
    await expect(page.getByTestId('feedback-notices')).toContainText('備份已下載');
    await page.getByRole('button', { name: '關閉通知', exact: true }).click();
    await expect(page.locator('.feedback-toast')).toHaveCount(0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Polished layout fits viewport');
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${width}px / ${reducedMotion}: sliding tabs, rapid navigation, focus trap/restore, noninteractive exits, reopening, progress, totals, feedback and preserved orders`);
  }
} finally { await browser.close(); }
