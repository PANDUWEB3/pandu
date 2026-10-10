import { expect, test } from '@playwright/test';

test('Get Started opens login choices and Escape closes the dialog', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Get Started|Mulai Sekarang/ }).first().click();
  const dialog = page.getByRole('dialog', { name: /Log in or sign up|Masuk atau daftar/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Continue with Google|Lanjutkan dengan Google/ })).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'MetaMask' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Coinbase Wallet|WalletConnect/ })).toHaveCount(0);
  await expect(await dialog.locator('.pand-wallet-icon').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('overlay closes and wallet connection can return to method choices', async ({ page }) => {
  await page.addInitScript(() => {
    // A provider that remains pending lets the test inspect the connecting state.
    window.ethereum = { request: () => new Promise(() => {}) };
  });
  await page.goto('/');
  await page.getByRole('link', { name: /Get Started|Mulai Sekarang/ }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'MetaMask' }).click();
  await expect(dialog.getByText(/Waiting for MetaMask|Menunggu MetaMask/)).toBeVisible();
  await expect(await dialog.locator('.pand-modal-spinner .pand-wallet-icon').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(dialog.locator('.pand-wallet-icon')).toHaveJSProperty('complete', true);
  await expect(dialog.locator('.pand-wallet-icon')).toHaveCSS('animation-name', 'none');
  await expect(dialog.locator('.pand-modal-spinner').evaluate(element => getComputedStyle(element, '::before').animationName)).resolves.toBe('pand-spin');
  await dialog.getByRole('button', { name: /Back|Kembali/ }).click();
  await expect(dialog.getByRole('button', { name: /Continue with Google|Lanjutkan dengan Google/ })).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(dialog).toHaveCount(0);
});

test('missing wallet shows an install link, and modal supports English dark mobile layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByRole('button', { name: /Switch to dark mode/ }).click();
  await page.getByRole('link', { name: /Get Started/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Log in or sign up' })).toBeVisible();
  await expect(dialog.getByText('For proof signers')).toBeVisible();
  const card = page.locator('.pand-modal-card');
  await expect(card).toHaveCSS('border-top-left-radius', '24px');
  await dialog.getByRole('button', { name: 'MetaMask' }).click();
  await expect(dialog.getByText('MetaMask is not installed in this browser.')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Install MetaMask' })).toHaveAttribute('href', 'https://metamask.io/download/');
});
