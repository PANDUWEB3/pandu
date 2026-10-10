import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('capture landing, information, login, and workspace across locale, theme, and viewport', async ({ browser }) => {
  test.setTimeout(180_000);
  const output = path.resolve('output/playwright');
  await mkdir(output, { recursive: true });
  const envText = await readFile('.env.local', 'utf8').catch(() => '');
  const supabaseUrl = envText.match(/^VITE_SUPABASE_URL=(.*)$/m)?.[1]?.trim();
  const projectRef = supabaseUrl ? new URL(supabaseUrl).hostname.split('.')[0] : '';
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    for (const lang of ['id', 'en'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
        await page.addInitScript(({ locale, colorMode }) => { localStorage.setItem('pandu-lang', locale); localStorage.setItem('pandu-theme', colorMode); }, { locale: lang, colorMode: theme });
        const routes = [
          ['landing', '/'],
          ['how', lang === 'en' ? '/how-it-works' : '/cara-kerja'],
          ['who', lang === 'en' ? '/who-its-for' : '/untuk-siapa'],
          ['login', '/login'],
          ['workspace', '/workspace'],
        ] as const;
        for (const [name, route] of routes) {
          if (name === 'workspace' && projectRef) {
            const userId = '4ebcdb62-a7e4-45ca-8e21-3156e5b265c8';
            const payload = Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, email: 'visual-review@example.test' })).toString('base64url');
            const mockSession = { access_token: `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.${payload}.mock`, refresh_token: 'visual-only', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'visual-review@example.test', app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: { full_name: 'Visual Review' }, created_at: new Date().toISOString() } };
            await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${projectRef}-auth-token`, session: mockSession });
            await page.route(`${supabaseUrl}/rest/v1/**`, async route => { const url = new URL(route.request().url()); const payload = url.pathname.endsWith('/rpc/accept_organization_invites') ? null : url.pathname.endsWith('/organization_members') ? [{ organization_id: 'visual-org', role: 'owner', organizations: { id: 'visual-org', name: 'PANDU Visual Workspace', industry_key: 'food' } }] : []; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) }); });
          }
          await page.goto(route, { waitUntil: 'domcontentloaded' });
          if (name === 'workspace') await page.locator('.p-work-content').waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
          await page.evaluate(async () => { const height = document.documentElement.scrollHeight; const step = Math.max(360, Math.floor(window.innerHeight * 0.7)); for (let top = 0; top < height; top += step) { window.scrollTo({ top, behavior: 'instant' }); await new Promise(resolve => window.setTimeout(resolve, 220)); } window.scrollTo({ top: height, behavior: 'instant' }); });
          await page.waitForTimeout(900);
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
          await page.waitForTimeout(350);
          await expect(page.locator('body')).not.toBeEmpty();
          await page.screenshot({ path: path.join(output, `${name}-${theme}-${lang}-${viewport.name}.png`), fullPage: true, animations: 'disabled' });
        }
        await page.close();
      }
    }
  }
});
