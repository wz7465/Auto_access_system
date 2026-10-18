// index.js（浏览器池版本）

const {
  randomWait,
  simulateHumanMouse,
  simulateHumanScroll,
  simulateRandomClick
} = require('./browser/humanBehavior');
const { applyBasicAntiDetect } = require('./browser/antiDetect');
const { applyFingerprintSpoof } = require('./browser/fingerprint');
const { newContext } = require('./browser/browserPool');

const axios = require('axios');
const moment = require('moment-timezone');
const cron = require('node-cron');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const session = require('express-session');
const path = require('path');
const https = require('https');
const fs = require('fs');

const app = express();
const port = process.env.SERVER_PORT || process.env.PORT || 3000;

// 中间件配置
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// 默认密码配置
const USERNAME = process.env.ADMIN_USERNAME || 'admin';
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Telegram配置
const TG_CHAT_ID = process.env.TG_CHAT_ID || '';
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || '';

// 数据文件路径
const DATA_DIR = path.join(__dirname, 'data');
const URLS_FILE = path.join(DATA_DIR, 'urls.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');
const TELEGRAM_CONFIG_FILE = path.join(DATA_DIR, 'telegram-config.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 存储URL和日志的数据结构
let urls = [];
let scheduledUrls = [];
let accessLogs = [];

// 旧版2分钟模式type为'24h'，统一迁移为'24h_2m'
function normalizeType(type) {
  return type === '24h' ? '24h_2m' : type;
}

function loadTelegramConfig() {
  try {
    if (fs.existsSync(TELEGRAM_CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(TELEGRAM_CONFIG_FILE, 'utf8'));
      global.TG_CHAT_ID = config.chatId || '';
      global.TG_BOT_TOKEN = config.botToken || '';
      global.TG_PUSH_ENABLED = config.pushEnabled !== false;
      console.log('Telegram配置已加载');
    } else {
      global.TG_CHAT_ID = TG_CHAT_ID;
      global.TG_BOT_TOKEN = TG_BOT_TOKEN;
      global.TG_PUSH_ENABLED = true;
      console.log('使用环境变量作为Telegram配置默认值');
    }
  } catch (error) {
    console.error('加载Telegram配置失败:', error.message);
    global.TG_CHAT_ID = TG_CHAT_ID;
    global.TG_BOT_TOKEN = TG_BOT_TOKEN;
    global.TG_PUSH_ENABLED = true;
    console.log('使用环境变量作为Telegram配置默认值（出错后）');
  }
}

function saveTelegramConfig() {
  try {
    const config = {
      chatId: global.TG_CHAT_ID || '',
      botToken: global.TG_BOT_TOKEN || '',
      pushEnabled: global.TG_PUSH_ENABLED !== false,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(TELEGRAM_CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('保存Telegram配置失败:', error.message);
  }
}

function loadData() {
  try {
    loadTelegramConfig();

    if (fs.existsSync(URLS_FILE)) {
      const urlData = JSON.parse(fs.readFileSync(URLS_FILE, 'utf8'));
      urls = (urlData.urls || []).map(u => ({ ...u, type: normalizeType(u.type) }));
      scheduledUrls = (urlData.scheduledUrls || []).map(u => ({ ...u, type: normalizeType(u.type) }));
      console.log(`加载了 ${urls.length} 个24小时URL和 ${scheduledUrls.length} 个定时URL`);
    } else {
      urls = [
        { id: 1, url: 'https://www.baidu.com', name: '百度', type: '24h_2m', active: true },
        { id: 2, url: 'https://www.yahoo.com', name: '雅虎', type: '24h_2m', active: true }
      ];
      scheduledUrls = [
        { id: 3, url: 'https://www.google.com', name: '谷歌', type: 'scheduled', active: true }
      ];
      saveUrlsData();
    }

    if (fs.existsSync(LOGS_FILE)) {
      const logData = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
      accessLogs = (logData.logs || []).map(l => ({ ...l, type: normalizeType(l.type) }));
      console.log(`加载了 ${accessLogs.length} 条访问日志`);
    }
  } catch (error) {
    console.error('加载数据失败:', error.message);
    urls = [
      { id: 1, url: 'https://www.baidu.com', name: '百度', type: '24h_2m', active: true },
      { id: 2, url: 'https://www.yahoo.com', name: '雅虎', type: '24h_2m', active: true }
    ];
    scheduledUrls = [
      { id: 3, url: 'https://www.google.com', name: '谷歌', type: 'scheduled', active: true }
    ];
    accessLogs = [];
  }
}

function saveUrlsData() {
  try {
    const data = {
      urls: urls,
      scheduledUrls: scheduledUrls,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(URLS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {}
}

function saveLogsData() {
  try {
    const data = {
      logs: accessLogs,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(LOGS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {}
}

function cleanupOldLogs() {
  try {
    const cutoffTime = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const originalLength = accessLogs.length;

    accessLogs = accessLogs.filter(log => {
      const logTime = new Date(log.timestamp);
      return logTime > cutoffTime;
    });

    if (originalLength !== accessLogs.length) {
      saveLogsData();
    }
  } catch (error) {}
}

loadData();

function logAccess(url, status, type, error = null) {
  const log = {
    id: Date.now(),
    url: url,
    status: status,
    type: type,
    timestamp: moment().tz('Asia/Hong_Kong').format('YYYY-MM-DD HH:mm:ss'),
    error: error
  };
  accessLogs.unshift(log);

  if (accessLogs.length > 1000) {
    accessLogs = accessLogs.slice(0, 1000);
  }
}

setInterval(() => {
  if (accessLogs.length > 0) {
    saveLogsData();
  }
}, 5 * 60 * 1000);

cron.schedule('0 2 * * *', () => {
  cleanupOldLogs();
});

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

async function sendTelegramMessage(message) {
  const currentChatId = global.TG_CHAT_ID || TG_CHAT_ID;
  const currentBotToken = global.TG_BOT_TOKEN || TG_BOT_TOKEN;
  const currentEnabled = currentChatId && currentBotToken;
  const pushEnabled = global.TG_PUSH_ENABLED !== false;

  if (!currentEnabled) {
    console.log('Telegram未配置，跳过消息发送');
    return;
  }

  if (!pushEnabled) {
    console.log('Telegram推送已暂停，跳过消息发送');
    return;
  }

  try {
    const telegramUrl = `https://api.telegram.org/bot${currentBotToken}/sendMessage`;
    await axios.post(telegramUrl, {
      chat_id: currentChatId,
      text: message,
      parse_mode: 'HTML'
    }, { httpsAgent });
  } catch (error) {}
}

// 最新真实浏览器UA池
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.8059.39 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.8059.40 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.8059.39 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.4258.62',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:157.0) Gecko/20100101 Firefox/157.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Safari/605.1.15',
  'Mozilla/5.0 (iPad; CPU OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function visitWebsite(url, type) {
  let context;
  let page;

  try {
    context = await newContext();
    await context.setExtraHTTPHeaders({
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Upgrade-Insecure-Requests': '1'
    });

    page = await context.newPage();

    await applyBasicAntiDetect(page);
    await applyFingerprintSpoof(page);

    await page.setUserAgent(getRandomUserAgent());

    await simulateHumanMouse(page);
    await simulateHumanScroll(page);

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    await randomWait();
    await simulateRandomClick(page);

    logAccess(url, 200, type);
  } catch (error) {
    console.error('[网页访问失败]', url);
    console.error('错误名称:', error.name);
    console.error('错误代码:', error.code);
    console.error('错误信息:', error.message);

    const errorStatus = error.status || error.code || 'ERROR';
    logAccess(url, errorStatus, type, error.message);

    const currentChatId = global.TG_CHAT_ID || TG_CHAT_ID;
    const currentBotToken = global.TG_BOT_TOKEN || TG_BOT_TOKEN;
    const currentEnabled = currentChatId && currentBotToken;

    if (currentEnabled) {
      const errorMessage = `📣 <b>自动访问系统通知</b>\n\n` +
        `🔗 <b>URL:</b> ${url}\n` +
        `📊 <b>访问模式:</b> ${getModeLabel(type)}\n` +
        `❌ <b>错误状态:</b> ${errorStatus}\n` +
        `💬 <b>错误信息:</b> ${error.message}\n` +
        `⏰ <b>时间:</b> ${moment().tz('Asia/Hong_Kong').format('YYYY-MM-DD HH:mm:ss')}`;
      await sendTelegramMessage(errorMessage);
    }
  } finally {
    if (context) {
      await context.close();
    }
  }
}

const MODE_LABELS = {
  '24h_2m': '24小时访问(每2分钟)',
  '24h_5m': '24小时访问(每5分钟)',
  '24h_10m': '24小时访问(每10分钟)',
  '24h_30m': '24小时访问(每30分钟)',
  '24h_1h': '24小时访问(每1小时)',
  'scheduled': '定时访问(每2分钟,1:00-6:00暂停)'
};

function is24hType(type) {
  return type === '24h' || type.startsWith('24h_');
}

function getModeLabel(type) {
  return MODE_LABELS[type] || type;
}

const MODE_CRONS = {
  '24h_2m': '*/2 * * * *',
  '24h_5m': '*/5 * * * *',
  '24h_10m': '*/10 * * * *',
  '24h_30m': '*/30 * * * *',
  '24h_1h': '0 * * * *'
};

Object.entries(MODE_CRONS).forEach(([type, expr]) => {
  cron.schedule(expr, () => {
    urls.filter(u => u.active && u.type === type).forEach((urlObj) => {
      visitWebsite(urlObj.url, urlObj.type).catch(() => {});
    });
  });
});

let visitIntervalId = null;
let scheduledVisitsRunning = false;

function stopScheduledVisits() {
  if (visitIntervalId !== null) {
    clearInterval(visitIntervalId);
    visitIntervalId = null;
  }
  scheduledVisitsRunning = false;
}

function startScheduledVisits() {
  if (scheduledVisitsRunning) return;

  scheduledVisitsRunning = true;

  visitIntervalId = setInterval(() => {
    const currentHour = moment().tz('Asia/Hong_Kong').hour();

    if (currentHour >= 1 && currentHour < 6) {
      stopScheduledVisits();
      return;
    }

    scheduledUrls
      .filter(urlObj => urlObj.active)
      .forEach(urlObj => {
        visitWebsite(urlObj.url, 'scheduled').catch(() => {});
      });
  }, 2 * 60 * 1000);
}

function checkAndSetTimer() {
  const currentHour = moment().tz('Asia/Hong_Kong').hour();

  if (currentHour >= 1 && currentHour < 6) {
    stopScheduledVisits();
  } else {
    startScheduledVisits();
  }
}

checkAndSetTimer();
setInterval(checkAndSetTimer, 60 * 1000);

function requireAuth(req, res, next) {
  if (req.session.authenticated) {
    next();
  } else {
    res.status(401).json({ error: '未授权访问' });
  }
}

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (username === USERNAME && password === PASSWORD) {
    req.session.authenticated = true;
    res.json({ success: true, message: '登录成功' });
  } else {
    res.status(401).json({ error: '用户名或密码错误' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true, message: '登出成功' });
});

app.get('/api/urls', requireAuth, (req, res) => {
  res.json({
    urls: urls,
    scheduledUrls: scheduledUrls
  });
});

app.post('/api/urls', requireAuth, (req, res) => {
  const { url, name, type } = req.body;

  if (!url || !name || !type) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  const newUrl = {
    id: Math.floor(Date.now() + Math.random() * 1000),
    url: url,
    name: name,
    type: type,
    active: true
  };

  if (is24hType(type)) {
    urls.push(newUrl);
  } else if (type === 'scheduled') {
    scheduledUrls.push(newUrl);
  }

  saveUrlsData();

  res.json({ success: true, url: newUrl });
});

app.post('/api/urls/batch', requireAuth, (req, res) => {
  const { urls: urlList } = req.body;

  if (!urlList || !Array.isArray(urlList) || urlList.length === 0) {
    return res.status(400).json({ error: '缺少有效的URL数据' });
  }

  const addedUrls = [];
  const errors = [];

  for (const urlData of urlList) {
    const { url, name, type, active = true } = urlData;

    if (!url || !name || !type) {
      errors.push(`URL数据不完整: ${JSON.stringify(urlData)}`);
      continue;
    }

    const newUrl = {
      id: Math.floor(Date.now() + Math.random() * 1000),
      url: url,
      name: name,
      type: type,
      active: active
    };

    if (is24hType(type)) {
      urls.push(newUrl);
    } else if (type === 'scheduled') {
      scheduledUrls.push(newUrl);
    }

    addedUrls.push(newUrl);
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: '部分URL添加失败',
      errors: errors,
      added: addedUrls
    });
  }

  saveUrlsData();

  res.json({
    success: true,
    message: `成功批量添加 ${addedUrls.length} 个URL`,
    urls: addedUrls
  });
});

app.delete('/api/urls/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);

  const beforeCount = urls.length + scheduledUrls.length;
  urls = urls.filter(u => u.id !== id);
  scheduledUrls = scheduledUrls.filter(u => u.id !== id);

  if (urls.length + scheduledUrls.length === beforeCount) {
    return res.status(404).json({ error: 'URL不存在' });
  }

  saveUrlsData();

  res.json({ success: true });
});

app.put('/api/urls/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const { active } = req.body;

  let url = urls.find(u => u.id === id);
  if (url) {
    url.active = active;
  } else {
    url = scheduledUrls.find(u => u.id === id);
    if (url) {
      url.active = active;
    }
  }

  if (url) {
    saveUrlsData();
    res.json({ success: true, url: url });
  } else {
    res.status(404).json({ error: 'URL不存在' });
  }
});

app.put('/api/urls/:id/edit', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const { url: newUrl, name, type } = req.body;

  if (!newUrl || !name || !type) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  let url = urls.find(u => u.id === id);

  if (url) {
    if (url.type !== type) {
      urls = urls.filter(u => u.id !== id);
      if (is24hType(type)) {
        urls.push({ ...url, url: newUrl, name, type });
      } else {
        scheduledUrls.push({ ...url, url: newUrl, name, type });
      }
    } else {
      url.url = newUrl;
      url.name = name;
    }
  } else {
    url = scheduledUrls.find(u => u.id === id);

    if (url) {
      if (url.type !== type) {
        scheduledUrls = scheduledUrls.filter(u => u.id !== id);
        if (is24hType(type)) {
          urls.push({ ...url, url: newUrl, name, type });
        } else {
          scheduledUrls.push({ ...url, url: newUrl, name, type });
        }
      } else {
        url.url = newUrl;
        url.name = name;
      }
    }
  }

  if (url) {
    saveUrlsData();
    res.json({ success: true, url: url });
  } else {
    res.status(404).json({ error: 'URL不存在' });
  }
});

app.get('/api/logs', requireAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const start = (page - 1) * limit;
  const end = start + limit;

  res.json({
    logs: accessLogs.slice(start, end),
    total: accessLogs.length,
    page: page,
    limit: limit
  });
});

app.delete('/api/logs', requireAuth, (req, res) => {
  accessLogs = [];
  saveLogsData();
  res.json({ success: true, message: '日志已清空' });
});

app.get('/api/telegram/status', requireAuth, (req, res) => {
  const currentChatId = global.TG_CHAT_ID || TG_CHAT_ID;
  const currentBotToken = global.TG_BOT_TOKEN || TG_BOT_TOKEN;
  const currentEnabled = currentChatId && currentBotToken;
  const pushEnabled = global.TG_PUSH_ENABLED !== false;

  res.json({
    enabled: currentEnabled,
    pushEnabled: pushEnabled,
    hasChatId: !!currentChatId,
    hasBotToken: !!currentBotToken
  });
});

app.post('/api/telegram/config', requireAuth, (req, res) => {
  const { chatId, botToken } = req.body;

  if (!chatId || !botToken) {
    return res.status(400).json({ error: 'Chat ID和Bot Token都必须提供' });
  }

  global.TG_CHAT_ID = chatId;
  global.TG_BOT_TOKEN = botToken;

  saveTelegramConfig();

  const testMessage = `✅ <b>Telegram配置成功</b>\n\n` +
    `🎯 这是一条测试消息，确认配置已生效\n` +
    `⏰ 配置时间: ${moment().tz('Asia/Hong_Kong').format('YYYY-MM-DD HH:mm:ss')}`;

  sendTelegramMessage(testMessage).then(() => {
    res.json({
      success: true,
      message: 'Telegram配置已更新并发送测试消息',
      enabled: true
    });
  }).catch(error => {
    res.status(500).json({
      error: '配置更新失败: ' + error.message,
      enabled: false
    });
  });
});

app.post('/api/telegram/clear', requireAuth, (req, res) => {
  global.TG_CHAT_ID = '';
  global.TG_BOT_TOKEN = '';

  saveTelegramConfig();

  res.json({
    success: true,
    message: 'Telegram配置已清除',
    enabled: false
  });
});

app.post('/api/telegram/enable', requireAuth, (req, res) => {
  global.TG_PUSH_ENABLED = true;

  saveTelegramConfig();

  res.json({
    success: true,
    message: 'Telegram推送已启用',
    pushEnabled: true
  });
});

app.post('/api/telegram/disable', requireAuth, (req, res) => {
  global.TG_PUSH_ENABLED = false;

  saveTelegramConfig();

  res.json({
    success: true,
    message: 'Telegram推送已暂停',
    pushEnabled: false
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

process.on('SIGINT', () => {
  saveUrlsData();
  saveLogsData();
  saveTelegramConfig();
  process.exit(0);
});

process.on('SIGTERM', () => {
  saveUrlsData();
  saveLogsData();
  saveTelegramConfig();
  process.exit(0);
});

app.listen(port, () => {
  console.log(`服务器运行在端口: ${port}`);
  console.log(`前端页面: http://localhost:${port}`);
  console.log(`数据存储位置: ${DATA_DIR}`);
  console.log(`username/password: ${USERNAME}/${PASSWORD}`);

  const currentChatId = global.TG_CHAT_ID || TG_CHAT_ID;
  const currentBotToken = global.TG_BOT_TOKEN || TG_BOT_TOKEN;
  const currentEnabled = currentChatId && currentBotToken;

  if (currentEnabled) {
    console.log(`✅ Telegram提醒已启用 (Chat ID: ${currentChatId})`);
  } else {
    console.log(`❌ Telegram提醒未启用 (需要设置 TG_CHAT_ID 和 TG_BOT_TOKEN 环境变量)`);
  }
});
