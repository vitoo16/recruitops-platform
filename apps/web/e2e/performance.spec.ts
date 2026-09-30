import { expect, test, type Page } from '@playwright/test';

const API_ORIGIN = 'http://127.0.0.1:8787';
const SUPABASE_ORIGIN = 'https://e2e-recruitops.supabase.co';

const NAVIGATION_BUDGET_MS = 8_000;
const TRANSFER_BUDGET_BYTES = 15 * 1024 * 1024;
const RESOURCE_COUNT_BUDGET = 180;
const LONG_TASK_COUNT_BUDGET = 20;

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

test('public shell stays within broad navigation and resource regression budgets', async ({ page }) => {
  await installLoggedOutBoundary(page);

  await page.addInitScript(() => {
    const longTasks: number[] = [];
    Object.defineProperty(window, '__recruitopsLongTasks', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: longTasks,
    });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks.push(entry.duration);
      }
    }).observe({ type: 'longtask', buffered: true });
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('main')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const longTasks = (window as typeof window & { __recruitopsLongTasks?: number[] }).__recruitopsLongTasks ?? [];

    return {
      navigationDurationMs: navigation?.duration ?? 0,
      resourceCount: resources.length,
      transferBytes: resources.reduce((total, resource) => total + resource.transferSize, 0),
      longTaskCount: longTasks.length,
      longestTaskMs: longTasks.length > 0 ? Math.max(...longTasks) : 0,
    };
  });

  expect(metrics.navigationDurationMs).toBeLessThan(NAVIGATION_BUDGET_MS);
  expect(metrics.resourceCount).toBeLessThan(RESOURCE_COUNT_BUDGET);
  expect(metrics.transferBytes).toBeLessThan(TRANSFER_BUDGET_BYTES);
  expect(metrics.longTaskCount).toBeLessThanOrEqual(LONG_TASK_COUNT_BUDGET);

  test.info().annotations.push({
    type: 'performance-baseline',
    description: JSON.stringify(metrics),
  });
});
