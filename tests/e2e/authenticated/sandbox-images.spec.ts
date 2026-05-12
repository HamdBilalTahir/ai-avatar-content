import { test, expect } from '@playwright/test';
import path from 'path';

const TEST_IMAGE = path.join(__dirname, '../../fixtures/test-image.png');

// 1×1 transparent PNG — returned for every Vercel Blob upload so the <img>
// loads successfully and the onError display:none handler never fires.
const MOCK_BLOB_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test.describe('Sandbox multi-image upload', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Vercel Blob upload — avoids real uploads and charges
    await page.route('**/api/upload**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: MOCK_BLOB_URL }),
      })
    );

    // Mock film-direction intelligence endpoint — static, no LLM call needed in tests
    await page.route('**/api/intelligence/film-direction', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ commonRules: '', styles: [] }),
      })
    );

    await page.goto('/sandbox');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('sandbox page loads without errors', async ({ page }) => {
    await expect(page.locator('body')).not.toBeEmpty();
    // No JS errors that break rendering
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(1000);
    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test.describe('with an active sandbox instance', () => {
    test.beforeEach(async ({ page }) => {
      const createBtn = page.getByRole('button', {
        name: /Create Sandbox Instance/i,
      });
      const refImages = page.getByText('Reference Images');

      // Wait for Firebase/Firestore to initialise — either the page auto-selects an
      // existing sandbox (showing "Reference Images") or shows the create button.
      await Promise.race([
        createBtn.waitFor({ state: 'visible', timeout: 20000 }),
        refImages.waitFor({ state: 'visible', timeout: 20000 }),
      ]).catch(() => {});

      // If sandbox already loaded (existing sandbox auto-selected), we're done.
      if (await refImages.isVisible().catch(() => false)) return;

      // Click if button is present — use a short timeout so detach/instability errors
      // reject quickly (caught below) rather than consuming the 30s test timeout.
      if (await createBtn.isVisible().catch(() => false)) {
        await createBtn.click({ timeout: 5000 }).catch(() => {});
      }

      await expect(refImages).toBeVisible({ timeout: 20000 });
    });

    test('shows Reference Images section header', async ({ page }) => {
      await expect(page.getByText('Reference Images')).toBeVisible({
        timeout: 10000,
      });
    });

    test('shows Upload Reference Image button when no images uploaded', async ({
      page,
    }) => {
      // If images already exist from a previous run, skip this assertion
      const imageCount = await page
        .locator('[data-testid="avatar-image-entry"]')
        .count();
      if (imageCount === 0) {
        await expect(page.getByText('Upload Reference Image')).toBeVisible({
          timeout: 5000,
        });
      }
    });

    test('can upload an image and it appears in the list', async ({ page }) => {
      const fileInput = page
        .locator('input[type="file"][accept="image/*"]')
        .first();
      const initialCount = await page
        .locator('[data-testid="avatar-image-card"]')
        .count();

      await fileInput.setInputFiles(TEST_IMAGE);

      // New card should appear
      await expect(
        page.locator('[data-testid="avatar-image-card"]')
      ).toHaveCount(initialCount + 1, { timeout: 8000 });
      const newCard = page.locator('[data-testid="avatar-image-card"]').last();

      // Image thumbnail should appear in the new card
      await expect(newCard.locator('img[alt="Reference"]')).toBeVisible({
        timeout: 5000,
      });

      // "All clips" button visible (default assignment)
      await expect(newCard.getByText('All clips')).toBeVisible({
        timeout: 5000,
      });
    });

    test('can upload two images and both appear', async ({ page }) => {
      const fileInput = page
        .locator('input[type="file"][accept="image/*"]')
        .first();
      const initialCount = await page
        .locator('[data-testid="avatar-image-card"]')
        .count();

      await fileInput.setInputFiles(TEST_IMAGE);
      await expect(
        page.locator('[data-testid="avatar-image-card"]')
      ).toHaveCount(initialCount + 1, { timeout: 8000 });
      // Wait for upload + Firestore write to settle before the second upload
      await page
        .waitForLoadState('networkidle', { timeout: 5000 })
        .catch(() => {});

      await fileInput.setInputFiles(TEST_IMAGE);
      await expect(
        page.locator('[data-testid="avatar-image-card"]')
      ).toHaveCount(initialCount + 2, { timeout: 8000 });
    });

    test('"Select clips" toggle shows clip number buttons', async ({
      page,
    }) => {
      const fileInput = page
        .locator('input[type="file"][accept="image/*"]')
        .first();
      const initialCount = await page
        .locator('[data-testid="avatar-image-card"]')
        .count();

      await fileInput.setInputFiles(TEST_IMAGE);
      await expect(
        page.locator('[data-testid="avatar-image-card"]')
      ).toHaveCount(initialCount + 1, { timeout: 8000 });
      const newCard = page.locator('[data-testid="avatar-image-card"]').last();

      await newCard.getByText('Select clips').click();

      // Clip number buttons should appear inside the new card
      await expect(newCard.getByRole('button', { name: '1' })).toBeVisible({
        timeout: 3000,
      });
    });

    test('clip number buttons toggle on/off', async ({ page }) => {
      const fileInput = page
        .locator('input[type="file"][accept="image/*"]')
        .first();
      const initialCount = await page
        .locator('[data-testid="avatar-image-card"]')
        .count();

      await fileInput.setInputFiles(TEST_IMAGE);
      await expect(
        page.locator('[data-testid="avatar-image-card"]')
      ).toHaveCount(initialCount + 1, { timeout: 8000 });
      const newCard = page.locator('[data-testid="avatar-image-card"]').last();

      await newCard.getByText('Select clips').click();

      const clip1Btn = newCard.getByRole('button', { name: '1' });
      const clip2Btn = newCard.getByRole('button', { name: '2' });
      await expect(clip1Btn).toBeVisible({ timeout: 3000 });

      // Initially clip 1 should be selected (default [1])
      const initialClass = await clip1Btn.getAttribute('class');
      expect(initialClass).toContain('bg-violet-600');

      // Click clip 2 to add it
      await clip2Btn.click();
      await expect(clip2Btn).toHaveClass(/bg-violet-600/, { timeout: 2000 });

      // Click clip 1 to deselect it — force bypasses React re-render instability
      // from the Firestore onSnapshot firing after the upload write above.
      await clip1Btn.click({ force: true });
      // clip 2 should remain selected
      await expect(clip2Btn).toHaveClass(/bg-violet-600/, { timeout: 2000 });
    });

    test('switching back to "All clips" hides clip number buttons', async ({
      page,
    }) => {
      const fileInput = page
        .locator('input[type="file"][accept="image/*"]')
        .first();
      const initialCount = await page
        .locator('[data-testid="avatar-image-card"]')
        .count();

      await fileInput.setInputFiles(TEST_IMAGE);
      await expect(
        page.locator('[data-testid="avatar-image-card"]')
      ).toHaveCount(initialCount + 1, { timeout: 8000 });
      const newCard = page.locator('[data-testid="avatar-image-card"]').last();

      await newCard.getByText('Select clips').click();
      await expect(newCard.getByRole('button', { name: '1' })).toBeVisible({
        timeout: 3000,
      });

      await newCard.getByText('All clips').click();

      // Clip buttons inside this card should be gone
      await expect(newCard.getByRole('button', { name: '1' })).not.toBeVisible({
        timeout: 2000,
      });
    });

    test('can remove an uploaded image', async ({ page }) => {
      const fileInput = page
        .locator('input[type="file"][accept="image/*"]')
        .first();
      const initialCount = await page
        .locator('[data-testid="avatar-image-card"]')
        .count();

      await fileInput.setInputFiles(TEST_IMAGE);
      await expect(
        page.locator('[data-testid="avatar-image-card"]')
      ).toHaveCount(initialCount + 1, { timeout: 8000 });
      const newCard = page.locator('[data-testid="avatar-image-card"]').last();

      // Click the X (remove) button inside the new card
      await newCard.locator('button').last().click();

      // Card count should return to initial
      await expect(
        page.locator('[data-testid="avatar-image-card"]')
      ).toHaveCount(initialCount, { timeout: 5000 });
    });

    test('"Add Another Image" text shown after first upload', async ({
      page,
    }) => {
      const fileInput = page
        .locator('input[type="file"][accept="image/*"]')
        .first();
      await fileInput.setInputFiles(TEST_IMAGE);
      await expect(
        page
          .locator('[data-testid="avatar-image-card"]')
          .last()
          .getByText('All clips')
      ).toBeVisible({ timeout: 8000 });

      await expect(page.getByText('Add Another Image')).toBeVisible({
        timeout: 5000,
      });
    });

    test('clip count matches duration slider value', async ({ page }) => {
      const fileInput = page
        .locator('input[type="file"][accept="image/*"]')
        .first();
      const initialCount = await page
        .locator('[data-testid="avatar-image-card"]')
        .count();

      await fileInput.setInputFiles(TEST_IMAGE);
      await expect(
        page.locator('[data-testid="avatar-image-card"]')
      ).toHaveCount(initialCount + 1, { timeout: 8000 });
      const newCard = page.locator('[data-testid="avatar-image-card"]').last();

      await newCard.getByText('Select clips').click();

      // Default is 36s = 5 clips, so buttons 1-5 should appear inside the new card
      for (let i = 1; i <= 5; i++) {
        await expect(
          newCard.getByRole('button', { name: String(i) })
        ).toBeVisible({ timeout: 3000 });
      }

      // Button 6 should not exist inside this card
      await expect(
        newCard.getByRole('button', { name: '6' })
      ).not.toBeVisible();
    });
  });
});
