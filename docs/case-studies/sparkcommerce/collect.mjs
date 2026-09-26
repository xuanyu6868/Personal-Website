// SparkCommerce AI 页面数据采集脚本
// 用法: cd /tmp/spark-collect && node collect.mjs
// 依赖: playwright-core (安装在运行目录), 本地 Chromium 缓存
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BASE = 'http://localhost:3000';
const API = 'http://localhost:3001';
const OUT = '/Users/xuanyumacbook/Personal-Website/docs/case-studies/sparkcommerce';
const SHOTS = join(OUT, 'screenshots');
const DATA = join(OUT, 'api-data');
mkdirSync(SHOTS, { recursive: true });
mkdirSync(DATA, { recursive: true });

// 找到缓存的 Chromium headless shell
const pwCache = join(homedir(), 'Library/Caches/ms-playwright');
const shellDir = readdirSync(pwCache)
  .filter((d) => d.startsWith('chromium_headless_shell-'))
  .sort()
  .pop();
const executablePath = join(
  pwCache,
  shellDir,
  'chrome-headless-shell-mac-arm64/chrome-headless-shell',
);

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const pageData = {};

async function snap(name, { fullPage = true, settle = 2500 } = {}) {
  await page.waitForTimeout(settle);
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage });
  const info = await page.evaluate(() => {
    const text = (el) => (el?.innerText || '').trim();
    return {
      title: document.title,
      headings: [...document.querySelectorAll('h1, h2, h3')].map((h) => ({
        tag: h.tagName.toLowerCase(),
        text: text(h).slice(0, 120),
      })),
      buttons: [...document.querySelectorAll('button')]
        .map((b) => text(b))
        .filter(Boolean)
        .slice(0, 40),
      bodyTextSample: text(document.body).slice(0, 3000),
    };
  });
  pageData[name] = info;
  console.log(`captured: ${name}`);
}

async function clickText(selector, re) {
  const el = page.locator(selector, { hasText: re }).first();
  if (await el.count()) {
    await el.click({ timeout: 5000 }).catch(() => {});
    return true;
  }
  return false;
}

// 1. 落地页 / 首页
await page.goto(BASE, { waitUntil: 'networkidle' });
await snap('01-home-landing');

// 2. 注册测试账号(走 API,拿到 token 后注入)
const testUser = {
  email: `audit_${Date.now()}@example.com`,
  password: 'AuditPass123!',
  name: 'Audit Bot',
};
const reg = await page.request.post(`${API}/api/auth/register`, { data: testUser });
const regBody = await reg.json().catch(() => ({}));
writeFileSync(join(DATA, 'auth-register-sample.json'), JSON.stringify({
  status: reg.status(),
  body: { ...regBody, token: regBody.token ? '<redacted>' : undefined },
}, null, 2));
if (regBody.token) {
  await page.evaluate((t) => localStorage.setItem('spark_token', t), regBody.token);
  await page.reload({ waitUntil: 'networkidle' });
}

// 3. 工作室(创作页)
if (await clickText('button, a', /开始创作|进入工作室|Studio/i)) {
  await snap('02-studio');
}

// 4. 社区
if (await clickText('button, a, nav *', /社区|Community/i)) {
  await snap('03-community');
}

// 5. 定价
if (await clickText('button, a, nav *', /定价|Pricing/i)) {
  await snap('04-pricing');
}

// 6. 个人中心(已登录)
if (await clickText('button, a, nav *', /我的|个人中心|Profile/i)) {
  await snap('05-profile');
}

// 7. 登录页(先登出再截)
await page.evaluate(() => localStorage.removeItem('spark_token'));
await page.reload({ waitUntil: 'networkidle' });
if (await clickText('button, a, nav *', /登录|登入|Login|Sign in/i)) {
  await snap('06-auth');
}

// 8. 公开 API 数据采集
const endpoints = [
  ['health', '/api/health'],
  ['pricing-plans', '/api/pricing/plans'],
  ['community-images', '/api/community/images'],
  ['community-inspiration', '/api/community/inspiration'],
  ['community-leaderboard', '/api/community/leaderboard'],
  ['image-styles', '/api/images/styles'],
];
for (const [name, path] of endpoints) {
  try {
    const res = await page.request.get(`${API}${path}`);
    const body = await res.json().catch(() => null);
    writeFileSync(join(DATA, `${name}.json`), JSON.stringify({ status: res.status(), body }, null, 2));
    console.log(`api: ${name} -> ${res.status()}`);
  } catch (e) {
    writeFileSync(join(DATA, `${name}.json`), JSON.stringify({ error: String(e) }, null, 2));
  }
}

writeFileSync(join(DATA, 'page-content.json'), JSON.stringify(pageData, null, 2));
await browser.close();
console.log('done');
