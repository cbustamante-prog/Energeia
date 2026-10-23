import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Attach to the shared Preview browser; never launch a separate hidden browser.
const origin = 'http://localhost:5173';
const api = 'http://localhost:8000/api';
let browser, page, context, token, household, applianceId;
const errors = [];
const measurements = [];
const email = `audit-${Date.now()}@example.com`;
const password = 'Local audit password 42';
const sizes = [[320,568],[375,667],[390,844],[430,932],[768,1024],[1024,768],[1366,768],[1920,1080]];
async function request(path, options = {}) {
  const response = await fetch(`${api}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {}) }, body: options.body ? JSON.stringify(options.body) : undefined });
  assert.ok(response.ok, `${path}: ${response.status}`);
  return response.status === 204 ? null : response.json();
}
async function field(name, value) { await page.locator(`input[name="${name}"]`).fill(String(value)); }
async function submit(label) { await page.getByRole('button', {name: label, exact: true}).click(); }
async function dimensions(route, theme, size) {
  const info = await page.evaluate(() => ({ viewportHeight: innerHeight, scrollY, documentHeight: document.documentElement.scrollHeight, documentClientHeight: document.documentElement.clientHeight, documentWidth: document.documentElement.scrollWidth, documentClientWidth: document.documentElement.clientWidth, bodyHeight: document.body.scrollHeight, bodyClientHeight: document.body.clientHeight, containers: ['html','body','#root','ion-app','.app-shell','.auth-page'].flatMap(selector => { const el=document.querySelector(selector); if(!el)return []; const css=getComputedStyle(el); return [{selector,overflow:css.overflow,height:css.height,position:css.position,touchAction:css.touchAction}]; }) }));
  measurements.push({route,theme,size,...info});
  assert.ok(info.documentWidth <= info.documentClientWidth, `${route} ${theme} ${size}: overflow ${info.documentWidth}/${info.documentClientWidth}`);
  if (info.documentHeight > info.viewportHeight + 1) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => Math.abs(scrollY + innerHeight - document.documentElement.scrollHeight))).toBeLessThan(2);
    await page.evaluate(() => window.scrollTo(0,0));
  }
}
async function go(route) {
  await page.goto(`${origin}${route}`);
  await page.locator('.app-loading').waitFor({state:'hidden'});
  await page.locator('.loading-status').waitFor({state:'hidden'});
  await page.locator('h1:visible').first().waitFor();
  if (token && ['/overview','/appliances','/history','/insights','/scenarios','/settings'].includes(route)) {
    await page.locator('.view:visible').waitFor();
    await page.locator('.loading-status').waitFor({state:'hidden'});
  }
}
before(async () => {
  const endpoint = process.env.ENERGEIA_BROWSER_CDP || execFileSync('coderabbit-agent-browser',['get','cdp-url'],{encoding:'utf8'}).trim();
  browser = await chromium.connectOverCDP(endpoint);
  context = browser.contexts()[0];
  page = context.pages().find(p=>p.url().startsWith(origin)) || await context.newPage();
  page.setDefaultTimeout(8000);
  await page.emulateMedia({reducedMotion:'reduce'});
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(origin);
  await page.evaluate(() => localStorage.removeItem('energeia_token'));
});
afterEach(async (t) => {
  if (!t.passed) {
    await page.screenshot({path:join(tmpdir(), 'energia-browser-failure.png')});
    console.log('Form diagnostics', await page.locator('ion-modal.show-modal').evaluateAll(els=>els.map(el=>({text:el.textContent,invalid:[...el.querySelectorAll('input')].filter(x=>!x.validity.valid).map(x=>({name:x.name,message:x.validationMessage})),values:[...el.querySelectorAll('input')].filter(x=>x.type==='checkbox').map(x=>({name:x.name,checked:x.checked}))}))));
    console.log('Failure layout', await page.evaluate(()=>({url:location.pathname,scrollY,height:document.documentElement.scrollHeight,overflow:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>document.documentElement.clientWidth+1 && getComputedStyle(e).position!=='fixed').slice(0,12).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right}))})));
  }
});
after(async () => {
  await writeFile(join(tmpdir(), 'energia-browser-measurements.json'), JSON.stringify(measurements,null,2));
  await browser?.close(); // Disconnects CDP; shared browser remains running.
});

test('public routes, real CTA links, themes and document scrolling at all eight sizes', async () => {
  for (const theme of ['light','dark']) {
    await page.evaluate(theme=>localStorage.setItem('energeia_theme',theme),theme);
    for (const size of sizes) {
      await page.setViewportSize({width:size[0],height:size[1]});
      for(const route of ['/','/login','/register','/forgot-password','/reset-password','/not-a-page']) {
        await go(route);
        await dimensions(route,theme,size);
      }
    }
  }
  await go('/');
  await page.getByRole('link',{name:'Get started',exact:true}).click();
  await expect(page).toHaveURL(`${origin}/register`);
  await go('/appliances');
  await expect(page).toHaveURL(/\/login\?next=%2Fappliances$/);
  await go('/login');
  await field('email','unknown@example.com'); await field('password','invalid-password'); await submit('Sign In');
  await expect(page.getByRole('alert')).toContainText("don't match");
});

test('registration, household, appliance, schedule and provider changes persist through the actual local API', async () => {
  await page.setViewportSize({width:390,height:844});
  await go('/register');
  for (const [name,value] of Object.entries({first_name:'Alex',last_name:'Audit',email,password,password_confirmation:password})) await field(name,value);
  await submit('Continue');
  for (const [name,value] of Object.entries({country:'Philippines',region:'Metro Manila',city:'Makati',street_address:'123 Synthetic Test Street'})) await field(name,value);
  await page.locator('input[name="terms_accepted"]').check();
  await submit('Create Account');
  await page.getByRole('heading',{name:'Set up your household'}).waitFor();
  token = await page.evaluate(()=>localStorage.getItem('energeia_token'));
  assert.ok(token);
  await field('household_name','Audit home'); await submit('Set up my household');
  await page.locator('.page-intro').waitFor();
  await page.locator('.loading-status').waitFor({state:'hidden'});
  household = (await request('/households'))[0];
  await page.getByRole('button',{name:'Set rate',exact:true}).click();
  await field('provider_name','Synthetic Utility'); await field('rate_per_kwh',10); await submit('Save electricity rate');
  await page.locator('ion-modal.show-modal').waitFor({state:'hidden'});
  await go('/appliances');
  await submit('Add Device');
  await field('appliance_name','Test fan'); await field('wattage',100); await submit('Add appliance');
  await page.locator('ion-modal.show-modal').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Add schedule',exact:true}).click();
  await expect(page.locator('input[name="days"]')).toHaveCount(7);
  for (const checkbox of await page.locator('input[name="days"]').all()) await checkbox.check();
  await field('hours_per_day',8); await submit('Save schedule');
  await page.locator('ion-modal.show-modal').waitFor({state:'hidden'});
  let appliances = await request(`/households/${household.household_id}/appliances`);
  applianceId = appliances[0].appliance_id;
  assert.equal(appliances[0].average_hours_per_day,8);
  await page.getByRole('button',{name:'Edit Test fan',exact:true}).click();
  await field('quantity',2); await submit('Save changes');
  await page.locator('ion-modal.show-modal').waitFor({state:'hidden'});
  appliances = await request(`/households/${household.household_id}/appliances`);
  assert.equal(appliances[0].quantity,2);
  const dashboard = await request(`/households/${household.household_id}/dashboard`);
  const days = new Date(new Date().getUTCFullYear(),new Date().getUTCMonth()+1,0).getDate();
  assert.equal(dashboard.current_kwh,100*2*8*days/1000);
  await page.reload();
  await expect(page.locator('.appliance-name h3')).toHaveText('Test fan');
});

test('planner previews without a saved plan, saved plan deletion, bills, filtering and schedule toggles', async () => {
  await go('/scenarios');
  await field(`scenario_hours_${applianceId}`,4);
  await submit('Preview changes');
  await expect(page.locator('.scenario-result')).toContainText('Comparison');
  await expect(page.locator('.compare-difference')).toContainText('Potential savings');
  await page.getByRole('button',{name:'Make a plan',exact:true}).first().click();
  await field('scenario_name','Evening routine'); await field(`hours_${applianceId}`,4); await submit('Save my what-if plan');
  await page.locator('ion-modal.show-modal').waitFor({state:'hidden'});
  await expect(page.locator('.scenario-row')).toHaveCount(1);
  await submit('Delete Evening routine');
  await expect(page.locator('.scenario-row')).toHaveCount(0);
  await go('/history');
  await page.getByRole('button',{name:'+ Add actual bill',exact:true}).click();
  await field('actual_bill_amount',150); await submit('Save actual bill');
  await page.locator('ion-modal.show-modal').waitFor({state:'hidden'});
  await expect(page.locator('.bill-table')).toContainText('₱150.00');
  const table = page.locator('.bill-table-wrap');
  await table.evaluate(el=>el.scrollLeft=el.scrollWidth);
  assert.ok(await table.evaluate(el=>el.scrollLeft)>0,'intentional horizontal table scroll');
  await go('/appliances');
  await page.locator('.appliance-search input').fill('not found');
  await expect(page.getByRole('status')).toContainText('No appliances match');
  await page.locator('.appliance-search input').fill('');
  await page.getByRole('switch',{name:'Pause schedule'}).click();
  await expect(page.getByRole('switch',{name:'Activate schedule'})).toBeVisible();
  await page.getByRole('switch',{name:'Activate schedule'}).click();
  await expect(page.getByRole('switch',{name:'Pause schedule'})).toBeVisible();
});

test('all protected pages, both themes and eight viewports: no overflow and full document scroll', async () => {
  // More than five appliances verifies usage is not limited to dashboard top-five records.
  for(let i=0;i<7;i++) {
    const appliance = await request(`/households/${household.household_id}/appliances`,{method:'POST',body:{appliance_name:`Long appliance name ${i} for responsive schedule testing`,category:'Lighting',wattage:20+i,quantity:1}});
    await request(`/appliances/${appliance.appliance_id}/schedules`,{method:'POST',body:{days_of_week:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],hours_per_day:6,is_active:true}});
  }
  for(const theme of ['light','dark']) {
    await page.evaluate(theme=>localStorage.setItem('energeia_theme',theme),theme);
    for(const size of sizes) {
      await page.setViewportSize({width:size[0],height:size[1]});
      for(const route of ['/overview','/appliances','/history','/insights','/scenarios','/settings']) {
        await go(route); await dimensions(route,theme,size);
      }
    }
  }
  await go('/appliances');
  assert.equal(await page.locator('.appliance-consumption').filter({hasText:'No active schedule'}).count(),0);
});

test('wheel, keyboard, touch gestures, drawer focus, modal dismissal and route scroll reset', async () => {
  await page.setViewportSize({width:375,height:667});
  await go('/appliances');
  await page.mouse.move(200,400); await page.mouse.wheel(0,600);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(0);
  await page.mouse.wheel(0,-10000);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
  for(const key of ['PageDown','End','PageUp','Home','ArrowDown','ArrowUp']) await page.keyboard.press(key);
  await page.keyboard.press('End');
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(0);
  await page.keyboard.press('Home');
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:520}]});
  for(const y of [460,400,340,280,220]) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(0);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await cdp.detach();
  await page.evaluate(()=>window.scrollTo(0,0));
  await submit('Open menu');
  await expect(page.locator('.sidebar')).toHaveClass(/sidebar-open/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Open menu'})).toBeFocused();
  await expect(page.locator('.sidebar-scrim')).toHaveCount(0);
  await submit('Add Device');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('ion-modal.show-modal').waitFor({state:'hidden'});
  await page.mouse.wheel(0,600);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Planner',exact:true}).click();
  await expect(page).toHaveURL(`${origin}/scenarios`);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
  await page.goBack(); await expect(page).toHaveURL(`${origin}/appliances`);
  await submit('Add Device');
  await page.goBack();
  await page.locator('ion-modal.show-modal').waitFor({state:'hidden'});
  assert.notEqual(await page.evaluate(()=>getComputedStyle(document.body).overflow),'hidden');
});

test('unavailable OAuth, password reset, expired session and logout have truthful states', async () => {
  await go('/settings');
  await field('current_password','wrong-current-password');
  await field('password','New local audit password 42');
  await field('password_confirmation','New local audit password 42');
  await submit('Update password');
  await expect(page.locator('.global-error')).toContainText('current password is incorrect');
  assert.ok(await page.evaluate(()=>localStorage.getItem('energeia_token')));
  await field('current_password',password);
  await submit('Update password');
  await expect(page).toHaveURL(`${origin}/login`);
  await field('email',email); await field('password','New local audit password 42'); await submit('Sign In');
  await page.locator('.view:visible').waitFor();
  await go('/settings');
  await submit('Sign out of Energeia');
  await expect(page).toHaveURL(`${origin}/login`);
  assert.equal(await page.evaluate(()=>localStorage.getItem('energeia_token')),null);
  await submit('Continue with Google');
  await expect(page.getByRole('alert')).toContainText('configured');
  await submit('Continue with GitHub');
  await expect(page.getByRole('alert')).toContainText('configured');
  await submit('Forgot password?');
  await field('email',email); await submit('Send reset link');
  await expect(page.getByRole('alert')).toContainText('configured');
  token = null;
  await page.evaluate(()=>localStorage.setItem('energeia_token','expired-local-fixture'));
  await go('/settings');
  await expect(page).toHaveURL(/\/login/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('energeia_token')),null);
  assert.deepEqual(errors,[]);
});
