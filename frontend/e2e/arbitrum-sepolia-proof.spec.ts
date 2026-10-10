import { expect, test } from '@playwright/test';
import { Wallet } from 'ethers';

const required = ['E2E_APP_URL', 'E2E_STORAGE_STATE', 'E2E_WALLET_PRIVATE_KEY', 'E2E_PROOF_PUBLIC_ID', 'E2E_VERIFY_URL'];
const configured = required.every((key) => Boolean(process.env[key]));

test('Arbitrum Sepolia v2: wallet anchors, public Verify confirms, then revoke is visible', async ({ page }) => {
  test.skip(!configured, `Set ${required.join(', ')} after deploying v2 and preparing a QA proof.`);
  const wallet = new Wallet(process.env.E2E_WALLET_PRIVATE_KEY!);

  await page.exposeFunction('__panduTestSign', async (method: string, params: unknown[]) => {
    if (method === 'personal_sign') return wallet.signMessage(String(params[0]));
    if (method === 'eth_signTypedData_v4') {
      const data = JSON.parse(String(params[1]));
      const { EIP712Domain: _domain, ...types } = data.types;
      return wallet.signTypedData(data.domain, types, data.message);
    }
    throw new Error(`Unsupported test wallet method: ${method}`);
  });
  await page.addInitScript(({ address }) => {
    const request = async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
      if (method === 'eth_chainId') return '0x66eee'; // Arbitrum Sepolia, 421614
      // @ts-expect-error test bridge is installed with exposeFunction
      return window.__panduTestSign(method, params);
    };
    // @ts-expect-error inject the test-only wallet provider
    window.ethereum = { request, on() {}, removeListener() {} };
  }, { address: wallet.address });
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/workspace/proofs');
  const proofRow = page.locator('tr').filter({ hasText: process.env.E2E_PROOF_PUBLIC_ID! });
  await expect(proofRow).toBeVisible();
  const anchorButton = proofRow.getByRole('button', { name: /anchor|rekam/i });
  await expect(anchorButton).toBeVisible();
  await anchorButton.click();
  await expect(proofRow).toContainText(/confirmed/i, { timeout: 120_000 });

  await page.goto(process.env.E2E_VERIFY_URL!);
  await expect(page.getByText(/Terverifikasi|Verified/)).toBeVisible({ timeout: 60_000 });

  await page.goto('/workspace/proofs');
  const anchoredRow = page.locator('tr').filter({ hasText: process.env.E2E_PROOF_PUBLIC_ID! });
  await anchoredRow.getByRole('button', { name: /cabut|revoke/i }).click();
  await expect(anchoredRow).toContainText(/revoked|revoked/i, { timeout: 120_000 });

  await page.goto(process.env.E2E_VERIFY_URL!);
  await expect(page.getByText(/Dicabut|Revoked/)).toBeVisible({ timeout: 60_000 });
});
