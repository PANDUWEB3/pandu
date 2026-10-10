import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function openMockWorkspace(page: Page, route = '/workspace/batches') {
  const envText = await readFile('.env.local', 'utf8').catch(() => '');
  const supabaseUrl = envText.match(/^VITE_SUPABASE_URL=(.*)$/m)?.[1]?.trim();
  test.skip(!supabaseUrl, 'Workspace E2E requires frontend/.env.local');
  const projectRef = new URL(supabaseUrl!).hostname.split('.')[0];
  const userId = '4ebcdb62-a7e4-45ca-8e21-3156e5b265c8';
  const payload = Buffer.from(JSON.stringify({ sub:userId,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,email:'visual-review@example.test' })).toString('base64url');
  const session = { access_token:`eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.${payload}.mock`,refresh_token:'visual-only',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:userId,aud:'authenticated',role:'authenticated',email:'visual-review@example.test',app_metadata:{provider:'google',providers:['google']},user_metadata:{full_name:'Visual Review'},created_at:new Date().toISOString()} };
  await page.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:`sb-${projectRef}-auth-token`,value:session});
  await page.route(`${supabaseUrl}/rest/v1/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith('/rpc/accept_organization_invites') ? null : path.endsWith('/organization_members') ? [{organization_id:'visual-org',role:'owner',organizations:{id:'visual-org',name:'PANDU Visual Workspace',industry_key:'food'}}] : [];
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(route,{waitUntil:'domcontentloaded'});
  await expect(page.locator('.p-work-content')).toBeVisible({timeout:15000});
}

test('rail hover navigation and command palette support keyboard', async ({ page }) => {
  await openMockWorkspace(page);
  const dataCategory = page.getByRole('link',{name:'DATA PRODUK'});
  await dataCategory.hover();
  await expect(page.getByRole('menuitem',{name:'Batch produk'})).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog',{name:'Pencarian PANDU'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:'Pencarian PANDU'})).toHaveCount(0);
});

test('mobile rail opens category submenus by tap', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await openMockWorkspace(page);
  await page.getByRole('link',{name:'DATA PRODUK'}).click();
  await expect(page.getByRole('menuitem',{name:'Batch produk'})).toBeVisible();
  await page.getByRole('menuitem',{name:'Batch produk'}).click();
  await expect(page).toHaveURL(/\/workspace\/batches$/);
});
