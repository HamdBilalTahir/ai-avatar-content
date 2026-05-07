import { chromium, FullConfig } from '@playwright/test';
import path from 'path';

export const STORAGE_STATE = path.join(__dirname, '.auth/user.json');

export default async function globalSetup(config: FullConfig) {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    console.warn(
      '\n[global-setup] TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping auth setup.\n' +
        '  Authenticated tests will be skipped.\n'
    );
    return;
  }

  const { baseURL } = config.projects[0].use;
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${baseURL}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait until we land on an authenticated page
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 15000,
  });

  await page.context().storageState({ path: STORAGE_STATE });
  await browser.close();

  console.log(`\n[global-setup] Auth state saved for ${email}\n`);
}
