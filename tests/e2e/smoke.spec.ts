import { test, expect } from '@playwright/test';

test.describe('Y-OS E2E Smoke Tests', () => {
  test('should load application UI root successfully', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(400);
  });

  test('should query API liveness probe', async ({ request }) => {
    const response = await request.get('/api/healthz', {
      headers: {
        'Authorization': 'Bearer dev-token'
      }
    });
    expect(response.status()).toBeLessThan(500);
  });
});
