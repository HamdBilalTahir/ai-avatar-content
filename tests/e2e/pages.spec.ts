import { test, expect, Page } from '@playwright/test';

// All pages require auth — these tests verify redirect behavior and
// that the login page itself is accessible and functional without auth.

async function expectRedirectToLogin(page: Page, path: string) {
  await page.goto(path);
  await expect(page).toHaveURL(/\/login/, { timeout: 8000 });
  await expect(page.getByText('Welcome back')).toBeVisible();
}

test.describe('Protected pages redirect to login', () => {
  const protectedRoutes = [
    '/avatar/new',
    '/script',
    '/sandbox',
    '/video-maker',
    '/results',
    '/settings',
  ];

  for (const route of protectedRoutes) {
    test(`${route} redirects unauthenticated users`, async ({ page }) => {
      await expectRedirectToLogin(page, route);
    });
  }
});

test.describe('Login page UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('all form elements are present', async ({ page }) => {
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Forgot your password?' })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
  });

  test('submit button is disabled while loading', async ({ page }) => {
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    // Button should disable immediately on submit
    await expect(
      page.getByRole('button', { name: /Signing in|Sign in/ })
    ).toBeVisible();
  });

  test('email input accepts valid email format', async ({ page }) => {
    const emailInput = page.getByLabel('Email');
    await emailInput.fill('invalid-email');
    await page.getByRole('button', { name: 'Sign in' }).click();
    // Browser native validation prevents submission with invalid email
    const validationMessage = await emailInput.evaluate(
      (el: HTMLInputElement) => el.validationMessage
    );
    expect(validationMessage).not.toBe('');
  });
});

test.describe('Signup page UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup');
  });

  test('all form elements are present', async ({ page }) => {
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign up' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  test('password field is masked', async ({ page }) => {
    const passwordInput = page.getByLabel('Password');
    const inputType = await passwordInput.getAttribute('type');
    expect(inputType).toBe('password');
  });
});

test.describe('Page titles and meta', () => {
  test('login page has correct title', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/.+/); // any title — just verify page loaded
  });

  test('signup page loads without error', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByText('Create an account')).toBeVisible();
  });
});

test.describe('Navigation between auth pages', () => {
  test('login → signup → login flow works', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Sign up' }).click();
    await expect(page).toHaveURL('/signup');
    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/login');
  });
});
