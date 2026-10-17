// browser/humanBehavior.js

function randomWait(min = 300, max = 1200) {
  const ms = min + Math.random() * (max - min);
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function simulateHumanMouse(page) {
  const steps = 20 + Math.floor(Math.random() * 20);
  let x = 100 + Math.random() * 200;
  let y = 100 + Math.random() * 200;

  await page.mouse.move(x, y);

  for (let i = 0; i < steps; i++) {
    x += (Math.random() - 0.5) * 50;
    y += (Math.random() - 0.5) * 50;
    await page.mouse.move(x, y, { steps: 5 });
    await randomWait();
  }
}

async function simulateHumanScroll(page) {
  const times = 5 + Math.floor(Math.random() * 10);
  for (let i = 0; i < times; i++) {
    const deltaY = 200 + Math.random() * 400;
    await page.mouse.wheel(0, deltaY);
    await randomWait();
  }
}

async function simulateRandomClick(page) {
  const x = 200 + Math.random() * 400;
  const y = 200 + Math.random() * 300;
  await page.mouse.click(x, y);
}

module.exports = {
  randomWait,
  simulateHumanMouse,
  simulateHumanScroll,
  simulateRandomClick
};
