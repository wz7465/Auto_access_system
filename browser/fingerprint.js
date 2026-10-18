// browser/fingerprint.js

async function applyFingerprintSpoof(page) {
  // Canvas 指纹加噪
  await page.addInitScript(() => {
    const toDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const ctx = this.getContext('2d');
      if (ctx) {
        ctx.globalAlpha = 0.99;
        ctx.fillStyle = 'rgba(10,10,10,0.01)';
        ctx.fillRect(0, 0, this.width, this.height);
      }
      return toDataURL.apply(this, args);
    };
  });

  // WebGL vendor / renderer 伪造
  await page.addInitScript(() => {
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (param) {
      if (param === 37445) return 'Intel Inc.'; // UNMASKED_VENDOR_WEBGL
      if (param === 37446) return 'Intel(R) UHD Graphics 620'; // UNMASKED_RENDERER_WEBGL
      return getParameter.call(this, param);
    };
  });

  // 伪造 navigator.hardwareConcurrency
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 4
    });
  });

  // 伪造 navigator.deviceMemory
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => 8
    });
  });
}

module.exports = {
  applyFingerprintSpoof
};
