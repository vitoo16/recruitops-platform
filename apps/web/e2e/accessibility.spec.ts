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

async function expectNoWcagAAViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(results.violations).toEqual([]);
}

test('public shell has no automated WCAG A/AA violations in VI and EN', async ({ page }) => {
  await installLoggedOutBoundary(page);
  await page.goto('/');

  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoWcagAAViolations(page);

  const languageButton = page.getByRole('button', { name: /ngôn ngữ|language/i });
  await languageButton.click();
  await expect(languageButton).toContainText('VI');
  await expectNoWcagAAViolations(page);
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
