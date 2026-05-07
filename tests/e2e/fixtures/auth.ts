import { test as base, expect } from '@playwright/test';

const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

// Authenticated page fixture — signs in via the UI before each test and
// suppresses the onboarding modal so the main UI is immediately visible.
export const test = base.extend({
  page: async ({ browser }, use) => {
    if (!email || !password) {
      base.skip(
        true,
        'No credentials — set TEST_USER_EMAIL and TEST_USER_PASSWORD to enable'
      );
    }

    const context = await browser.newContext();

    // Suppress onboarding modal for all pages in this context
    await context.addInitScript(() => {
      localStorage.setItem('hasSeenOnboarding', 'true');
    });

    const page = await context.newPage();

    // Sign in via the login form
    await page.goto('/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
      timeout: 15000,
    });

    await use(page);
    await context.close();
  },
});

export { expect };
