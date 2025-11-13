import { test, expect } from '@playwright/test';

test('homepage has expected elements', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.screenshot({ path: 'screenshot.png' });
  await expect(page.locator('input[placeholder="Ask a research question, e.g., \'What is the impact of LLMs on scientific writing?\'"]')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('button[type="submit"]:has-text("Search")')).toBeVisible();
});
