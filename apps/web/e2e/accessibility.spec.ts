import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const API_ORIGIN = 'http://127.0.0.1:8787';
const SUPABASE_ORIGIN = 'https://e2e-recruitops.supabase.co';

async function installLoggedOutBoundary(page: Page): Promise<void> {
  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/auth/v1/user')) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'not authenticated' }),
      });
      return;
    }
    await route.fulfill({ status: 404, body: '' });
  });

  await page.route(`${API_ORIGIN}/**`, async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'E2E_AUTH_REQUIRED' }),
    });
  });
}

function seriousViolations(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) {
  return violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''));
}

test('public shell has no serious or critical WCAG A/AA violations', async ({ page }) => {
  await installLoggedOutBoundary(page);
  await page.goto('/');

  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(seriousViolations(results.violations)).toEqual([]);
});

test('keyboard users can reveal the skip link and move focus to main content', async ({ page }) => {
  await installLoggedOutBoundary(page);
  await page.goto('/');

  await page.keyboard.press('Tab');

  const skipLink = page.locator('a[href="#main-content"]');
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main-content$/);

  const main = page.locator('#main-content');
  await expect(main).toBeFocused();
  await expect(main).toBeVisible();
});
