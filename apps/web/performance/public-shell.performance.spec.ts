import { expect, test, type Page } from '@playwright/test';

const API_ORIGIN = 'http://127.0.0.1:8787';
const SUPABASE_ORIGIN = 'https://performance-recruitops.supabase.co';

const BUDGETS = {
  lcpMs: 2_500,
  cls: 0.1,
  blockingTimeMs: 300,
  scriptBytes: 900_000,
  stylesheetBytes: 200_000,
  totalStaticBytes: 1_500_000,
} as const;

type PerformanceSnapshot = {
  lcpMs: number;
  cls: number;
  blockingTimeMs: number;
  scriptBytes: number;
  stylesheetBytes: number;
  totalStaticBytes: number;
};

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
      body: JSON.stringify({ code: 'PERFORMANCE_AUTH_REQUIRED' }),
    });
  });
}

async function installPerformanceObservers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type MetricState = {
      lcpMs: number;
      cls: number;
      blockingTimeMs: number;
    };
    type MetricWindow = Window & { __recruitOpsPerformance?: MetricState };
    type LayoutShiftEntry = PerformanceEntry & {
      value: number;
      hadRecentInput: boolean;
    };

    const state: MetricState = {
      lcpMs: 0,
      cls: 0,
      blockingTimeMs: 0,
    };
    (window as MetricWindow).__recruitOpsPerformance = state;

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.lcpMs = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as LayoutShiftEntry[]) {
        if (!entry.hadRecentInput) state.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        state.blockingTimeMs += Math.max(0, entry.duration - 50);
      }
    }).observe({ type: 'longtask', buffered: true });
  });
}

async function readPerformanceSnapshot(page: Page): Promise<PerformanceSnapshot> {
  return page.evaluate(() => {
    type MetricState = {
      lcpMs: number;
      cls: number;
      blockingTimeMs: number;
    };
    type MetricWindow = Window & { __recruitOpsPerformance?: MetricState };

    const metrics = (window as MetricWindow).__recruitOpsPerformance;
    if (!metrics) throw new Error('Performance observers were not initialized.');

    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const sameOriginStatic = resources.filter((entry) => {
      const url = new URL(entry.name);
      return url.origin === window.location.origin && url.pathname.startsWith('/_next/static/');
    });
    const bytes = (entry: PerformanceResourceTiming) => entry.encodedBodySize || entry.transferSize;

    return {
      lcpMs: metrics.lcpMs,
      cls: metrics.cls,
      blockingTimeMs: metrics.blockingTimeMs,
      scriptBytes: sameOriginStatic
        .filter((entry) => entry.initiatorType === 'script' || entry.name.endsWith('.js'))
        .reduce((total, entry) => total + bytes(entry), 0),
      stylesheetBytes: sameOriginStatic
        .filter((entry) => entry.initiatorType === 'link' || entry.name.endsWith('.css'))
        .reduce((total, entry) => total + bytes(entry), 0),
      totalStaticBytes: sameOriginStatic.reduce((total, entry) => total + bytes(entry), 0),
    };
  });
}

test('public shell stays inside synthetic production performance budgets', async ({ page }, testInfo) => {
  await installLoggedOutBoundary(page);
  await installPerformanceObservers(page);

  const response = await page.goto('/', { waitUntil: 'load' });
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.waitForTimeout(500);
  const snapshot = await readPerformanceSnapshot(page);

  await testInfo.attach('performance-snapshot.json', {
    body: Buffer.from(JSON.stringify({ project: testInfo.project.name, budgets: BUDGETS, snapshot }, null, 2)),
    contentType: 'application/json',
  });

  expect(snapshot.lcpMs, 'LCP observer must record a value').toBeGreaterThan(0);
  expect(snapshot.lcpMs).toBeLessThanOrEqual(BUDGETS.lcpMs);
  expect(snapshot.cls).toBeLessThanOrEqual(BUDGETS.cls);
  expect(snapshot.blockingTimeMs).toBeLessThanOrEqual(BUDGETS.blockingTimeMs);
  expect(snapshot.scriptBytes).toBeLessThanOrEqual(BUDGETS.scriptBytes);
  expect(snapshot.stylesheetBytes).toBeLessThanOrEqual(BUDGETS.stylesheetBytes);
  expect(snapshot.totalStaticBytes).toBeLessThanOrEqual(BUDGETS.totalStaticBytes);
});
