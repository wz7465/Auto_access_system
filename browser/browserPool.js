async function newContext(userAgent = getSpoofedUserAgent()) {
  const browser = await getBrowser();

  const context = await browser.newContext({
    userAgent,
    viewport: { width: 1366, height: 768 },
    timezoneId: 'Asia/Hong_Kong',
    locale: 'zh-CN',
    colorScheme: 'light'
  });

  return context;
}
