import { expect, test } from '@playwright/test';

test('public how and audience pages use localized routes and legacy hashes redirect', async ({ page }) => {
  await page.goto('/#how-it-works');
  await expect(page).toHaveURL(/\/cara-kerja$/);
  await expect(page.getByRole('heading', { name: /Dari lantai gudang|From the warehouse floor/ })).toBeVisible();
  await expect(page.locator('#how-it-works ol > li')).toHaveCount(5);
  await page.goto('/#who-its-for');
  await expect(page).toHaveURL(/\/untuk-siapa$/);
  await expect(page.getByRole('heading', { name: /Dirancang untuk setiap pihak/ })).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/who-its-for$/);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/how-it-works');
});

test('localized routes are public and login presents only Google and MetaMask', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'English' }).click();
  await page.goto('/how-it-works');
  await expect(page.getByRole('heading', { name: /From the warehouse floor/ })).toBeVisible();
  await page.goto('/login');
  const dialog = page.getByRole('dialog', { name: 'Log in or sign up' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.pand-modal-option')).toHaveCount(2);
  await expect(dialog.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'MetaMask' })).toBeVisible();
  await expect(page).toHaveTitle(/Log in \| PANDU/);
});

test('proof lookup stays public and unauthenticated workspace opens the shared login page', async ({ page }) => {
  await page.goto('/verify');
  await expect(page.getByRole('heading', { name: 'Cek keaslian bukti PANDU' })).toBeVisible();
  await expect(page.getByLabel('Tautan atau nomor bukti')).toBeVisible();
  await expect(page).toHaveURL(/\/verify$/);
  await page.goto('/workspace');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('dialog')).toBeVisible();
});

