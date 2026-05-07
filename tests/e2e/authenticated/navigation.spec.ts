import { test, expect } from '../fixtures/auth';

test.describe('Authenticated navigation', () => {
  test('/ redirects to /avatar/new', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/avatar\/new/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/avatar\/new/);
  });

  test('/avatar/new loads without redirecting to login', async ({ page }) => {
    await page.goto('/avatar/new');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('/script loads without redirecting to login', async ({ page }) => {
    await page.goto('/script');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('/sandbox loads without redirecting to login', async ({ page }) => {
    await page.goto('/sandbox');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('/video-maker loads without redirecting to login', async ({ page }) => {
    await page.goto('/video-maker');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('/settings loads without redirecting to login', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('authenticated user visiting /login is redirected away', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
      timeout: 10000,
    });
    await expect(page).not.toHaveURL(/\/login/);
  });
});

test.describe('Avatar page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/avatar/new');
  });

  test('avatar prompt textarea is visible', async ({ page }) => {
    await expect(
      page.locator('textarea[placeholder*="Professional woman"]')
    ).toBeVisible({ timeout: 10000 });
  });

  test('Generate Avatar button is present', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /Generate Avatar/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('voice preset options are rendered', async ({ page }) => {
    await expect(page.locator('[name="voice"]').first()).toBeVisible({
      timeout: 10000,
    });
  });

  test('prompt chips populate the textarea', async ({ page }) => {
    const chip = page.getByText('Professional corporate headshot');
    await expect(chip).toBeVisible({ timeout: 10000 });
    await chip.click();
    const textarea = page.locator(
      'textarea[placeholder*="Professional woman"]'
    );
    await expect(textarea).toHaveValue('Professional corporate headshot');
  });
});

test.describe('Settings page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
  });

  test('shows logged-in user email', async ({ page }) => {
    await expect(page.getByText(process.env.TEST_USER_EMAIL!)).toBeVisible({
      timeout: 10000,
    });
  });

  test('provider selection section is visible', async ({ page }) => {
    await expect(page.getByText(/gemini|vertex/i).first()).toBeVisible({
      timeout: 10000,
    });
  });
});

test.describe('Script page', () => {
  test('loads and renders UI', async ({ page }) => {
    await page.goto('/script');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('Sandbox page', () => {
  test('loads and renders UI', async ({ page }) => {
    await page.goto('/sandbox');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
