import { test, expect } from '@playwright/test';

test.describe('Y-OS E2E Smoke Tests', () => {
  test('should load application UI root successfully', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(400);
  });

  test('should query API readiness probe', async ({ request }) => {
    const readyz = await request.get('/readyz');
    expect(readyz.status()).toBe(200);
    const body = await readyz.json();
    expect(body.status).toBe('ready');
  });
});
