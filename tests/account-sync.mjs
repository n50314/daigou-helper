import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const project = 'demo-daigou-sync';
const root = `http://127.0.0.1:8088/v1/projects/${project}/databases/(default)/documents/users/`;
const encode = value => value === null ? { nullValue: null } : Array.isArray(value) ? { arrayValue: { values: value.map(encode) } } :
  typeof value === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k,v]) => [k, encode(v)])) } } :
  typeof value === 'boolean' ? { booleanValue: value } : typeof value === 'number' ? { doubleValue: value } : { stringValue: value };
async function create(email) {
  const res = await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email, password: 'test-password-123', returnSecureToken: true }) });
  const result = await res.json(); assert.ok(res.ok, JSON.stringify(result)); return result;
}
async function read(uid) { return fetch(root + uid, { headers: {Authorization:'Bearer owner'} }).then(r => r.json()); }
async function seed(uid, name) {
  const item = { productId: name, productName: name, quantity: 1, unitPrice: 100, originalUnitPrice: 100, totalPrice: 100, spec: '' };
  const data = { batches: [{id:'batch',name,exchangeRate:1,isActive:true}], products:[{id:name,batchId:'batch',name,originalPrice:100,productType:'normal'}],
    orders:[{id:name,batchId:'batch',customerName:name,items:[item],status:'unpaid',shippingMethod:'宅配',createdAt:'2026-09-23T00:00:00Z',totalAmount:100}],
    activeBatchId:'batch',memberGroups:[],productTypes:[{id:'normal',label:'一般商品',color:'slate',requiresMember:false,requiresSpecs:false}],lastUpdated:1 };
  const res = await fetch(root + uid, {method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({fields:encode(data).mapValue.fields})});
  assert.ok(res.ok); return data;
}
const suffix=Date.now();
const a=await create(`a-${suffix}@test.local`), b=await create(`b-${suffix}@test.local`), c=await create(`c-${suffix}@test.local`);
await seed(a.localId,'A茶葉'); await seed(b.localId,'B保養品');
const originalA=await read(a.localId),originalB=await read(b.localId);
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const context=await browser.newContext();
  await context.addInitScript(()=>{localStorage.setItem('dg_orders','[{"customerName":"舊帳號資料"}]');localStorage.setItem('dg_batches','[]');localStorage.setItem('dg_products','[]');});
  const page=await context.newPage();const errors=[];const dialogs=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{dialogs.push(d.message());d.accept();});
  await page.goto('http://127.0.0.1:4174');
  await expect(page.getByText('本機訪客資料（登入後會切換為該帳號的雲端資料）')).toBeVisible();
  await expect(page.getByText('舊帳號資料',{exact:true})).toHaveCount(0);
  const login = (p,email) => p.evaluate(async email=>{const m=await import('/tests/emulator-login.ts');await m.login(email);},email);
  await login(page,a.email);await expect(page.getByText(`目前帳號：${a.email}`,{exact:true})).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('顯示 1 / 1 筆訂單（目前檔期）');
  assert.equal((await read(a.localId)).updateTime,originalA.updateTime,'Login must not write');
  await page.getByPlaceholder('輸入姓名').fill('A專屬未送出草稿');
  await page.locator('select').filter({has:page.locator('option[value="A茶葉"]')}).first().selectOption('A茶葉');
  await page.getByRole('button',{name:'加入清單',exact:true}).click();
  await login(page,b.email);await expect(page.getByText(`目前帳號：${b.email}`,{exact:true})).toBeVisible();
  await expect(page.getByText('B保養品',{exact:true}).first()).toBeVisible();
  await expect(page.getByText('A茶葉',{exact:true})).toHaveCount(0);
  assert.equal((await read(b.localId)).updateTime,originalB.updateTime,'Account switch must not write');
  await expect(page.getByPlaceholder('輸入姓名')).toHaveValue('');
  await login(page,a.email);
  await expect(page.getByPlaceholder('輸入姓名')).toHaveValue('A專屬未送出草稿');
  await expect(page.getByText('清單是空的',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'採購彙整表',exact:true}).click();
  await page.getByRole('checkbox',{name:'A茶葉 已購買'}).click();
  await expect.poll(async()=>JSON.stringify((await read(a.localId)).fields.purchaseChecks)).toContain('A茶葉_default');
  const context2=await browser.newContext();const page2=await context2.newPage();await page2.goto('http://127.0.0.1:4174');
  await expect(page2.getByRole('heading',{name:'代購小幫手',exact:true})).toBeVisible();
  await login(page2,a.email);await page2.getByRole('button',{name:'採購彙整表',exact:true}).click();
  await expect(page2.getByRole('checkbox',{name:'A茶葉 已購買'})).toBeChecked();
  await page2.getByRole('spinbutton').fill('0.35');
  await page2.getByRole('spinbutton').blur();
  await expect(page.getByRole('spinbutton')).toHaveValue('0.35');
  // An open edit form must not overwrite a newer version from the other device.
  await page.getByRole('button',{name:'訂單管理',exact:true}).click();
  await page.getByRole('button',{name:'編輯訂單',exact:true}).click();
  await page.getByLabel('編輯客戶姓名').fill('過期編輯名稱');
  await page2.getByRole('button',{name:'訂單管理',exact:true}).click();
  await page2.getByRole('combobox',{name:'A茶葉 訂單狀態',exact:true}).selectOption('paid');
  await expect.poll(async()=>(await read(a.localId)).fields.orders.arrayValue.values[0].mapValue.fields.status.stringValue).toBe('paid');
  await expect(page.getByRole('combobox',{name:'A茶葉 訂單狀態',exact:true})).toHaveValue('paid');
  await page.getByRole('button',{name:'儲存變更',exact:true}).click();
  await expect.poll(()=>dialogs.some(message=>message.includes('已停止覆蓋'))).toBe(true);assert.ok(!JSON.stringify((await read(a.localId)).fields.orders).includes('過期編輯名稱'));
  await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.getByRole('button',{name:'商品與檔期設定',exact:true}).click();
  await page.getByRole('button',{name:'編輯商品 A茶葉',exact:true}).click();
  await page.getByLabel('編輯商品名稱').fill('過期商品名稱');
  await page2.getByRole('button',{name:'商品與檔期設定',exact:true}).click();
  await page2.getByRole('button',{name:'編輯商品 A茶葉',exact:true}).click();
  await page2.getByLabel('編輯商品原價').fill('120');
  await page2.getByRole('button',{name:'儲存商品',exact:true}).click();
  await expect.poll(async()=>JSON.stringify((await read(a.localId)).fields.products)).toContain('120');
  await expect.poll(()=>page.evaluate(uid=>JSON.stringify(JSON.parse(localStorage.getItem('dg_workspace_v2:user:'+uid)).data.products),a.localId)).toContain('120');
  await page.getByRole('button',{name:'儲存商品',exact:true}).click();
  assert.ok(!JSON.stringify((await read(a.localId)).fields.products).includes('過期商品名稱'));
  await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.getByRole('button',{name:'採購彙整表',exact:true}).click();
  const oldResult=await page.evaluate(async uid=>(await import('/tests/emulator-login.ts')).oldClientWrite(uid),a.localId);
  assert.equal(oldResult,'permission-denied','Old tabs must not overwrite even after schema migration');
  const cross=await fetch(root+a.localId,{headers:{Authorization:'Bearer '+b.idToken}});assert.equal(cross.status,403);
  const malformed=await read(a.localId);malformed.fields.orders={stringValue:'invalid'};malformed.fields.revision={stringValue:'malformed-revision'};
  const badWrite=await fetch(root+a.localId,{method:'PATCH',headers:{Authorization:'Bearer '+a.idToken,'Content-Type':'application/json'},body:JSON.stringify({fields:malformed.fields})});assert.equal(badWrite.status,403,'Malformed workspace must be rejected by rules');
  // Cancel a pending edit by switching account before debounce; it must never enter B.
  await page.getByRole('checkbox',{name:'A茶葉 已購買'}).click();await login(page,b.email);
  await page.getByRole('button',{name:'採購彙整表',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'B保養品 已購買'})).not.toBeChecked();
  assert.equal((await read(b.localId)).updateTime,originalB.updateTime);
  await login(page,c.email);await expect(page.getByRole('status')).toHaveText('顯示 0 / 0 筆訂單（目前檔期）');
  assert.equal((await read(c.localId)).error.code,404,'Empty account should remain nonexistent until edited');
  await page.getByRole('button',{name:'商品與檔期設定',exact:true}).click();
  await page.getByLabel('新檔期名稱',{exact:true}).fill('新帳號檔期');
  await page.getByRole('button',{name:'建立檔期',exact:true}).click();
  await expect.poll(async()=>JSON.stringify((await read(c.localId)).fields?.batches)).toContain('新帳號檔期');
  await page.evaluate(async()=>(await import('/tests/emulator-login.ts')).logout());
  await expect(page.getByText('本機訪客資料（登入後會切換為該帳號的雲端資料）')).toBeVisible();
  await expect(page.getByText('新帳號檔期',{exact:true})).toHaveCount(0);
  assert.deepEqual(errors,[]);
  await context2.close();await context.close();
  console.log('PASS Firebase Auth + Firestore emulators: account/draft isolation, no login writes, shared-account sync, stale order/product forms, old-client/cross-account/malformed rejection, new-account save');
} finally {await browser.close();}
