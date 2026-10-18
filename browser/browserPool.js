
const { chromium } = require('playwright');
const { getSpoofedUserAgent } = require('./tlsSpoof');

let browserInstance = null;
let browserPromise = null;

// 获取或启动浏览器
async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  if (browserPromise) {
    return browserPromise;
  }

  browserPromise = chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox'
    ]
  });

  try {
    browserInstance = await browserPromise;

    browserInstance.on('disconnected', () => {
      browserInstance = null;
      browserPromise = null;
    });

    return browserInstance;
  } catch (error) {
    browserInstance = null;
    throw error;
  } finally {
    browserPromise = null;
  }
}

// 创建新的浏览器上下文
async function newContext(userAgent = getSpoofedUserAgent()) {
  const browser = await getBrowser();

  return browser.newContext({
    userAgent,
    viewport: {
      width: 1366,
      height: 768
    },
    timezoneId: 'Asia/Hong_Kong',
    locale: 'zh-CN',
    colorScheme: 'light'
  });
}

// 关闭浏览器
async function closeBrowser() {
  const browser = browserInstance;

  browserInstance = null;
  browserPromise = null;

  if (browser) {
    await browser.close();
  }
}

// 导出函数，供 index.js 调用
module.exports = {
  getBrowser,
  newContext,
  closeBrowser
};
