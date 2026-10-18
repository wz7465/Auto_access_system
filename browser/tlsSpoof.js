// browser/tlsSpoof.js

function getSpoofedUserAgent() {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/124.0.0.0 Safari/537.36';
}

function getExtraHeaders() {
  return {
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Upgrade-Insecure-Requests': '1'
  };
}

module.exports = {
  getSpoofedUserAgent,
  getExtraHeaders
};
