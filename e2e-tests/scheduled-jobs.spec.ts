import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.request.post('/__e2e_sql/reset');
  await page.goto('/');
  await page.waitForSelector('.thread-row');
});

test.describe('Scheduled Jobs (KPT-092)', () => {
  test('scheduled_jobs table exists and is queryable', async ({ page }) => {
    const count = await page.evaluate(async () => {
      const mod = await import('/src/scheduledJobsDb.ts');
      const jobs = await mod.getDueJobs(Date.now());
      return jobs.length;
    });
    expect(count).toBe(0);
  });

  test('createJob writes to DB and getDueJobs retrieves it', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const mod = await import('/src/scheduledJobsDb.ts');

      const job = await mod.createJob({
        accountId: 'test-user-1',
        jobType: 'send',
        payload: JSON.stringify({ to: 'x@y.com', subject: 'Test', body: 'Hello' }),
        fireAt: Date.now() - 1000,
      });

      const due = await mod.getDueJobs(Date.now());
      return { jobId: job.id, dueCount: due.length, firstDueId: due[0]?.id };
    });

    expect(result.jobId).toMatch(/^job-/);
    expect(result.dueCount).toBeGreaterThanOrEqual(1);
    expect(result.firstDueId).toBe(result.jobId);
  });

  test('markFired removes job from due list', async ({ page }) => {
    const dueCount = await page.evaluate(async () => {
      const mod = await import('/src/scheduledJobsDb.ts');

      const job = await mod.createJob({
        accountId: 'test-user-1',
        jobType: 'send',
        payload: '{}',
        fireAt: Date.now() - 1000,
      });

      await mod.markFired(job.id);
      const due = await mod.getDueJobs(Date.now());
      return due.length;
    });

    expect(dueCount).toBe(0);
  });

  test('cancelJob removes job from due list', async ({ page }) => {
    const dueCount = await page.evaluate(async () => {
      const mod = await import('/src/scheduledJobsDb.ts');

      const job = await mod.createJob({
        accountId: 'test-user-1',
        jobType: 'send',
        payload: '{}',
        fireAt: Date.now() - 1000,
      });

      await mod.cancelJob(job.id);
      const due = await mod.getDueJobs(Date.now());
      return due.length;
    });

    expect(dueCount).toBe(0);
  });

  test('markFailed 3x sets status to failed (no longer due)', async ({ page }) => {
    const dueCount = await page.evaluate(async () => {
      const mod = await import('/src/scheduledJobsDb.ts');

      const job = await mod.createJob({
        accountId: 'test-user-1',
        jobType: 'send',
        payload: '{}',
        fireAt: Date.now() - 1000,
      });

      await mod.markFailed(job.id, 'err1');
      await mod.markFailed(job.id, 'err2');
      await mod.markFailed(job.id, 'err3');

      const due = await mod.getDueJobs(Date.now());
      return due.length;
    });

    expect(dueCount).toBe(0);
  });

  test('future jobs are not returned by getDueJobs', async ({ page }) => {
    const dueCount = await page.evaluate(async () => {
      const mod = await import('/src/scheduledJobsDb.ts');

      await mod.createJob({
        accountId: 'test-user-1',
        jobType: 'send',
        payload: '{}',
        fireAt: Date.now() + 60_000,
      });

      const due = await mod.getDueJobs(Date.now());
      return due.length;
    });

    expect(dueCount).toBe(0);
  });
});
