// browser/antiDetect.js

async function applyBasicAntiDetect(page) {
  // webdriver 标志修补
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false
    });
  });

  // 你可以在这里继续扩展更多补丁（navigator.plugins、languages 等）
}

module.exports = {
  applyBasicAntiDetect
};
