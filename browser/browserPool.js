// browser/browserPool.js

const { chromium } = require('playwright');
const { getSpoofedUserAgent } = require('./tlsSpoof');

let browserInstance = null;

async function getBrowser() {
  if (browserInstance) return browserInstance;

  browserInstance = await chromium.launch({
    headless: true, // Render 必须 headless
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox'
    ]
  });

  return browserInstance;
}

async function newContext() {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: getSpoofedUserAgent(),
    viewport: { width: 1366, height: 768 },
    timezoneId: 'Asia/Hong_Kong',
    locale: 'zh-CN',
    colorScheme: 'light'
  });
  return context;
}

async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

module.exports = {
  getBrowser,
  newContext,
  closeBrowser
};
