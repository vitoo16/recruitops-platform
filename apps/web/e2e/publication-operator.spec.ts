import { expect, test, type Page, type Route } from '@playwright/test';

const API_ORIGIN = 'http://127.0.0.1:8787';
const APP_ORIGIN = 'http://127.0.0.1:3100';
const SUPABASE_ORIGIN = 'https://e2e-recruitops.supabase.co';
const SUPABASE_STORAGE_KEY = 'sb-e2e-recruitops-auth-token';

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const jobId = '11111111-1111-4111-8111-111111111111';
const postId = '22222222-2222-4222-8222-222222222222';
const variantId = '33333333-3333-4333-8333-333333333333';
const destinationId = '44444444-4444-4444-8444-444444444444';
const socialAccountId = '55555555-5555-4555-8555-555555555555';
const failedPublicationId = '66666666-6666-4666-8666-666666666666';

type Role = 'RECRUITER' | 'VIEWER';

type PublicationStatus = {
  id: string;
  postVariantId: string;
  socialAccountId: string | null;
  state:
    | 'PENDING'
    | 'SCHEDULED'
    | 'PUBLISHING'
    | 'PROCESSING'
    | 'PUBLISHED'
    | 'RETRY_WAITING'
    | 'FAILED'
    | 'CANCELLED';
  destination: {
    id: string;
    platform: 'FACEBOOK';
    type: 'PAGE';
    name: string;
  };
  scheduledAt: string | null;
  publishedAt: string | null;
  nextRetryAt: string | null;
  retryCount: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  updatedAt: string;
  canRetry: boolean;
  retryBlockReason: 'MANUAL_REVIEW_REQUIRED' | null;
};

type MockState = {
  statuses: PublicationStatus[];
  publishBodies: Record<string, unknown>[];
  scheduleBodies: Record<string, unknown>[];
  retryIds: string[];
};

const destination = {
  id: destinationId,
  platform: 'FACEBOOK' as const,
  type: 'PAGE' as const,
  name: 'RecruitOps Careers',
  socialAccountId,
};

function base64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function accessToken(): string {
  return [
    base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
    base64Url(
      JSON.stringify({
        aud: 'authenticated',
        exp: 4_102_444_800,
        role: 'authenticated',
        sub: userId,
      }),
    ),
    base64Url('e2e-signature'),
  ].join('.');
}

function sessionFixture() {
  const timestamp = '2026-09-29T08:00:00.000Z';
  return {
    access_token: accessToken(),
    refresh_token: 'e2e-refresh-token',
    expires_in: 2_147_483_647,
    expires_at: 4_102_444_800,
    token_type: 'bearer',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'recruiter@e2e.local',
      email_confirmed_at: timestamp,
      phone: '',
      confirmed_at: timestamp,
      last_sign_in_at: timestamp,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [],
      created_at: timestamp,
      updated_at: timestamp,
      is_anonymous: false,
    },
  };
}

async function seedSession(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, session }) => {
      window.localStorage.setItem(key, JSON.stringify(session));
    },
    { key: SUPABASE_STORAGE_KEY, session: sessionFixture() },
  );

  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/auth/v1/user')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(sessionFixture().user),
      });
      return;
    }
    if (pathname.endsWith('/auth/v1/token')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(sessionFixture()),
      });
      return;
    }
    await route.fulfill({ status: 404, body: '' });
  });
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': APP_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization,content-type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Content-Type': 'application/json',
  };
}

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    headers: corsHeaders(),
    body: JSON.stringify(body),
  });
}

function statusFixture(): PublicationStatus {
  const now = new Date().toISOString();
  return {
    id: failedPublicationId,
    postVariantId: variantId,
    socialAccountId,
    state: 'FAILED',
    destination: {
      id: destinationId,
      platform: 'FACEBOOK',
      type: 'PAGE',
      name: 'RecruitOps Careers',
    },
    scheduledAt: new Date(Date.now() - 60 * 60 * 1_000).toISOString(),
    publishedAt: null,
    nextRetryAt: null,
    retryCount: 5,
    lastErrorCode: 'PROVIDER_TEMPORARY_ERROR',
    lastErrorMessage: 'Provider operation failed with a retry-safe temporary error.',
    updatedAt: now,
    canRetry: true,
    retryBlockReason: null,
  };
}

async function installRecruitOpsApi(page: Page, role: Role): Promise<MockState> {
  const state: MockState = {
    statuses: [statusFixture()],
    publishBodies: [],
    scheduleBodies: [],
    retryIds: [],
  };

  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders(), body: '' });
      return;
    }

    if (request.headers().authorization !== `Bearer ${accessToken()}`) {
      await json(route, { code: 'E2E_AUTH_REQUIRED' }, 401);
      return;
    }

    if (method === 'GET' && pathname === '/auth/me') {
      await json(route, { id: userId, email: 'recruiter@e2e.local', role });
      return;
    }

    if (method === 'GET' && pathname === '/jobs') {
      const timestamp = '2026-09-29T08:00:00.000Z';
      await json(route, {
        items: [
          {
            id: jobId,
            title: 'Senior RecruitOps Engineer',
            companyName: 'RecruitOps E2E',
            description: 'A deterministic E2E fixture for publication operator workflows.',
            location: 'Ho Chi Minh City',
            employmentType: 'FULL_TIME',
            status: 'ACTIVE',
            currency: 'VND',
            salaryMinMinor: null,
            salaryMaxMinor: null,
            sourceRef: null,
            commissionNote: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        page: 1,
        pageSize: 50,
        total: 1,
      });
      return;
    }

    if (method === 'GET' && pathname === '/posts') {
      const timestamp = '2026-09-29T08:00:00.000Z';
      await json(route, {
        items: [
          {
            id: postId,
            jobId,
            title: 'RecruitOps hiring post',
            baseContent: 'Join RecruitOps and help build reliable recruitment operations tooling.',
            language: 'en',
            status: 'READY',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        page: 1,
        pageSize: 100,
        total: 1,
      });
      return;
    }

    if (method === 'GET' && pathname === `/posts/${postId}/media-assets`) {
      await json(route, []);
      return;
    }

    if (method === 'GET' && pathname === `/posts/${postId}/variants`) {
      const timestamp = '2026-09-29T08:00:00.000Z';
      await json(route, [
        {
          id: variantId,
          postId,
          platform: 'FACEBOOK',
          text: 'RecruitOps is hiring. Join our engineering team.',
          hashtags: ['hiring', 'recruitops'],
          metadata: {},
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ]);
      return;
    }

    if (method === 'GET' && pathname === `/posts/variants/${variantId}/media-selection`) {
      await json(route, { variantId, mediaAssetIds: [] });
      return;
    }

    if (method === 'GET' && pathname === `/publications/publish-now/readiness/${variantId}`) {
      await json(route, {
        postVariantId: variantId,
        postId,
        platform: 'FACEBOOK',
        postStatus: 'READY',
        canPublish: true,
        blockingReasons: [],
        destinations: [destination],
      });
      return;
    }

    if (method === 'GET' && pathname === `/publications/status/${variantId}`) {
      await json(route, { items: state.statuses, truncated: false });
      return;
    }

    if (method === 'POST' && pathname === '/publications/publish-now') {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.publishBodies.push(body);
      const publicationId = String(body.publicationId);
      const scheduledAt = new Date().toISOString();
      state.statuses.unshift({
        id: publicationId,
        postVariantId: variantId,
        socialAccountId,
        state: 'PENDING',
        destination: {
          id: destinationId,
          platform: 'FACEBOOK',
          type: 'PAGE',
          name: 'RecruitOps Careers',
        },
        scheduledAt,
        publishedAt: null,
        nextRetryAt: null,
        retryCount: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
        updatedAt: scheduledAt,
        canRetry: false,
        retryBlockReason: null,
      });
      await json(route, {
        acceptance: 'QUEUED',
        publication: {
          id: publicationId,
          postVariantId: variantId,
          destinationId,
          socialAccountId,
          state: 'PENDING',
          scheduledAt,
        },
      });
      return;
    }

    if (method === 'POST' && pathname === '/publications/schedule') {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.scheduleBodies.push(body);
      const publicationId = String(body.publicationId);
      const scheduledAt = String(body.scheduledAt);
      state.statuses.unshift({
        id: publicationId,
        postVariantId: variantId,
        socialAccountId,
        state: 'SCHEDULED',
        destination: {
          id: destinationId,
          platform: 'FACEBOOK',
          type: 'PAGE',
          name: 'RecruitOps Careers',
        },
        scheduledAt,
        publishedAt: null,
        nextRetryAt: null,
        retryCount: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
        updatedAt: new Date().toISOString(),
        canRetry: false,
        retryBlockReason: null,
      });
      await json(route, {
        acceptance: 'SCHEDULED',
        publication: {
          id: publicationId,
          postVariantId: variantId,
          destinationId,
          socialAccountId,
          state: 'SCHEDULED',
          scheduledAt,
        },
      });
      return;
    }

    if (method === 'POST' && pathname === `/publications/${failedPublicationId}/retry`) {
      state.retryIds.push(failedPublicationId);
      const failed = state.statuses.find((item) => item.id === failedPublicationId);
      if (!failed) {
        await json(route, { code: 'PUBLICATION_NOT_FOUND' }, 404);
        return;
      }
      failed.retryCount = 0;
      failed.updatedAt = new Date().toISOString();
      await json(route, { acceptance: 'RETRIED', publication: failed });
      return;
    }

    await json(route, { code: 'E2E_ROUTE_NOT_MOCKED', path: pathname }, 404);
  });

  return state;
}

async function switchToEnglish(page: Page): Promise<void> {
  await page.locator('button').filter({ hasText: 'EN' }).first().click();
  await expect(page.locator('section[aria-labelledby="publish-now-title"]')).toContainText(
    'Publish now',
  );
}

test('recruiter can publish, schedule, inspect persisted calendar, and retry a known failure', async ({
  page,
}) => {
  await seedSession(page);
  const state = await installRecruitOpsApi(page, 'RECRUITER');

  await page.goto('/');
  await switchToEnglish(page);

  const publishPanel = page.locator('section[aria-labelledby="publish-now-title"]');
  await expect(publishPanel.getByLabel('API destination')).toHaveValue(destinationId);
  await publishPanel.getByRole('button', { name: 'Queue publish now' }).click();
  await expect(publishPanel.getByText('Publication queued. Current state: PENDING.')).toBeVisible();
  expect(state.publishBodies).toHaveLength(1);
  expect(state.publishBodies[0]).toMatchObject({ postVariantId: variantId, destinationId });

  const schedulePanel = page.locator('section[aria-labelledby="publication-schedule-title"]');
  const future = await page.evaluate(() => {
    const instant = new Date(Date.now() + 3 * 60 * 60 * 1_000);
    instant.setSeconds(0, 0);
    const pad = (value: number) => String(value).padStart(2, '0');
    return {
      date: `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`,
      time: `${pad(instant.getHours())}:${pad(instant.getMinutes())}`,
    };
  });

  await schedulePanel.getByLabel('Local date').fill(future.date);
  await schedulePanel.getByLabel('Local time').fill(future.time);
  await schedulePanel.getByRole('button', { name: 'Schedule publication' }).click();
  await expect(schedulePanel.getByText(/Publication scheduled for/)).toBeVisible();
  expect(state.scheduleBodies).toHaveLength(1);
  expect(Date.parse(String(state.scheduleBodies[0]?.scheduledAt))).toBeGreaterThan(Date.now());

  const calendar = schedulePanel.locator('[aria-labelledby="publication-calendar-title"]');
  await expect(calendar.getByText('RecruitOps Careers').first()).toBeVisible();

  const statusPanel = page.locator('section[aria-labelledby="publication-status-title"]');
  const failedCard = statusPanel.locator('article').filter({ hasText: 'PROVIDER_TEMPORARY_ERROR' });
  await expect(failedCard).toBeVisible();
  await failedCard.getByRole('button', { name: 'Retry failed publication' }).click();
  await expect(
    statusPanel.getByText('The failed BullMQ job was moved back to the waiting queue.'),
  ).toBeVisible();
  expect(state.retryIds).toEqual([failedPublicationId]);
});

test('viewer can inspect publication operations but cannot publish, schedule, or retry', async ({
  page,
}) => {
  await seedSession(page);
  await installRecruitOpsApi(page, 'VIEWER');

  await page.goto('/');
  await switchToEnglish(page);

  const publishPanel = page.locator('section[aria-labelledby="publish-now-title"]');
  await expect(
    publishPanel.getByText('Your role can review readiness but cannot start a publication.'),
  ).toBeVisible();
  await expect(publishPanel.getByRole('button', { name: 'Queue publish now' })).toBeDisabled();

  const schedulePanel = page.locator('section[aria-labelledby="publication-schedule-title"]');
  await expect(
    schedulePanel.getByText(
      'Your role can inspect the publication calendar but cannot schedule a publication.',
    ),
  ).toBeVisible();
  await expect(schedulePanel.getByRole('button', { name: 'Schedule publication' })).toHaveCount(0);

  const statusPanel = page.locator('section[aria-labelledby="publication-status-title"]');
  await expect(statusPanel.getByText('PROVIDER_TEMPORARY_ERROR')).toBeVisible();
  await expect(statusPanel.getByRole('button', { name: 'Retry failed publication' })).toHaveCount(
    0,
  );
});
