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

// 加载数据函数
function loadData() {
  try {
    // 加载Telegram配置
    loadTelegramConfig();
    
    // 加载URLs数据
    if (fs.existsSync(URLS_FILE)) {
      const urlData = JSON.parse(fs.readFileSync(URLS_FILE, 'utf8'));
      urls = urlData.urls || [];
      scheduledUrls = urlData.scheduledUrls || [];
      console.log(`加载了 ${urls.length} 个24小时URL和 ${scheduledUrls.length} 个定时URL`);
    } else {
      // 创建默认数据
      urls = [
        { id: 1, url: 'https://www.baidu.com', name: '百度', type: '24h', active: true },
        { id: 2, url: 'https://www.yahoo.com', name: '雅虎', type: '24h', active: true }
      ];
      scheduledUrls = [
        { id: 3, url: 'https://www.google.com', name: '谷歌', type: 'scheduled', active: true }
      ];
      saveUrlsData();
    }
    
    // 加载日志数据
    if (fs.existsSync(LOGS_FILE)) {
      const logData = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
      accessLogs = logData.logs || [];
      console.log(`加载了 ${accessLogs.length} 条访问日志`);
    }
  } catch (error) {
    console.error('加载数据失败:', error.message);
    // 使用默认数据
    urls = [
      { id: 1, url: 'https://www.baidu.com', name: '百度', type: '24h', active: true },
      { id: 2, url: 'https://www.yahoo.com', name: '雅虎', type: '24h', active: true }
    ];
    scheduledUrls = [
      { id: 3, url: 'https://www.google.com', name: '谷歌', type: 'scheduled', active: true }
    ];
    accessLogs = [];
  }
}

// 保存Telegram配置
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

// 加载Telegram配置
function loadTelegramConfig() {
  try {
    if (fs.existsSync(TELEGRAM_CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(TELEGRAM_CONFIG_FILE, 'utf8'));
      global.TG_CHAT_ID = config.chatId || '';
      global.TG_BOT_TOKEN = config.botToken || '';
      global.TG_PUSH_ENABLED = config.pushEnabled !== false;
      console.log('Telegram配置已加载');
    } else {
      // 如果没有配置文件，使用环境变量作为默认值
      global.TG_CHAT_ID = TG_CHAT_ID;
      global.TG_BOT_TOKEN = TG_BOT_TOKEN;
      global.TG_PUSH_ENABLED = true; // 默认启用推送
      console.log('使用环境变量作为Telegram配置默认值');
    }
  } catch (error) {
    console.error('加载Telegram配置失败:', error.message);
    // 出错时使用环境变量作为默认值
    global.TG_CHAT_ID = TG_CHAT_ID;
    global.TG_BOT_TOKEN = TG_BOT_TOKEN;
    global.TG_PUSH_ENABLED = true; // 默认启用推送
    console.log('使用环境变量作为Telegram配置默认值（出错后）');
  }
}

// 保存URLs数据
function saveUrlsData() {
  try {
    const data = {
      urls: urls,
      scheduledUrls: scheduledUrls,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(URLS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    // 静默处理错误
  }
}

// 保存日志数据
function saveLogsData() {
  try {
    const data = {
      logs: accessLogs,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(LOGS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    // 静默处理错误
  }
}

// 清理过期日志数据（72小时前的数据）
function cleanupOldLogs() {
  try {
    const cutoffTime = new Date(Date.now() - 72 * 60 * 60 * 1000); // 72小时前
    const originalLength = accessLogs.length;
    
    accessLogs = accessLogs.filter(log => {
      const logTime = new Date(log.timestamp);
      return logTime > cutoffTime;
    });
    
    if (originalLength !== accessLogs.length) {
      saveLogsData(); // 保存清理后的日志
    }
  } catch (error) {
    // 静默处理错误
  }
}

// 启动时加载数据
loadData();

// 访问日志记录函数
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
  
  // 只保留最近1000条日志
  if (accessLogs.length > 1000) {
    accessLogs = accessLogs.slice(0, 1000);
  }
  
  // 保存日志到文件（但不要每次都保存，改为定时保存）
  // saveLogsData();
}

// 定时保存日志数据（每5分钟保存一次）
setInterval(() => {
  if (accessLogs.length > 0) {
    saveLogsData();
  }
}, 5 * 60 * 1000);

// 定时清理过期日志（每天凌晨2点执行）
cron.schedule('0 2 * * *', () => {
  cleanupOldLogs();
});

// 忽略SSL证书验证
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// 发送Telegram消息
async function sendTelegramMessage(message) {
  // 动态检查配置状态
  const currentChatId = global.TG_CHAT_ID || TG_CHAT_ID;
  const currentBotToken = global.TG_BOT_TOKEN || TG_BOT_TOKEN;
  const currentEnabled = currentChatId && currentBotToken;
  const pushEnabled = global.TG_PUSH_ENABLED !== false; // 默认启用
  
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
    });
    // console.log('Telegram消息发送成功');
  } catch (error) {
    // console.error('发送Telegram消息失败:', error.message);
  }
}

// 访问网站函数
// 最新真实浏览器UA池（截至2026年10月最新稳定版），每次访问随机轮换
const USER_AGENTS = [
  // Chrome 155.0.8059.39 / .40 (Windows / macOS)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.8059.39 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.8059.40 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.8059.39 Safari/537.36',
  // Edge 154.0.4258.62 (Windows)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.4258.62',
  // Firefox 157.0.1 (Windows / macOS) — Firefox UA 只保留主次版本号
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:157.0) Gecko/20100101 Firefox/157.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0',
  // Safari 26.6 (macOS / iPad) — macOS Safari 固定报告 10_15_7
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Safari/605.1.15',
  'Mozilla/5.0 (iPad; CPU OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function visitWebsite(url, type) {
  try {
    const response = await axios.get(url, { 
      httpsAgent,
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0'
      }
    });
    logAccess(url, response.status, type);
  } catch (error) {
    let errorStatus;
    if (error.response) {
      errorStatus = error.response.status;
    } else {
      errorStatus = error.code;
    }
    
    // 记录错误日志
    logAccess(url, errorStatus, type, error.message);
    
     // 发送Telegram错误提醒
     // 动态检查配置状态
     const currentChatId = global.TG_CHAT_ID || TG_CHAT_ID;
     const currentBotToken = global.TG_BOT_TOKEN || TG_BOT_TOKEN;
     const currentEnabled = currentChatId && currentBotToken;
     
     if (currentEnabled) {
       const errorMessage = `📣 <b>自动访问系统通知</b>\n\n` +
         `🔗 <b>URL:</b> ${url}\n` +
         `📊 <b>访问模式:</b> ${type === '24h' ? '24小时访问' : '定时访问'}\n` +
         `❌ <b>错误状态:</b> ${errorStatus}\n` +
         `💬 <b>错误信息:</b> ${error.message}\n` +
         `⏰ <b>时间:</b> ${moment().tz('Asia/Hong_Kong').format('YYYY-MM-DD HH:mm:ss')}`;
       
       await sendTelegramMessage(errorMessage);
     }
  }
}

// 24小时不间断访问
cron.schedule('*/2 * * * *', () => {
  urls.filter(u => u.active).forEach((urlObj) => {
    visitWebsite(urlObj.url, '24h');
  });
});

// 定时访问（01:00-06:00暂停）
function checkAndSetTimer() {
  const currentMoment = moment().tz('Asia/Hong_Kong');
  if (currentMoment.hours() >= 1 && currentMoment.hours() < 6) {
    clearInterval(visitIntervalId);
    const nextVisitTime = currentMoment.add(0, 'day').hours(6).minutes(0).seconds(0);
    const nextVisitInterval = nextVisitTime.diff(currentMoment);
    setTimeout(() => {
      startScheduledVisits();
    }, nextVisitInterval);
  } else {
    startScheduledVisits();
  }
}

let visitIntervalId;
function startScheduledVisits() {
  clearInterval(visitIntervalId);
  visitIntervalId = setInterval(() => {
    scheduledUrls.filter(u => u.active).forEach((urlObj) => {
      visitWebsite(urlObj.url, 'scheduled');
    });
  }, 2 * 60 * 1000); // 每2分钟执行一次
}

// 启动定时访问
checkAndSetTimer();
setInterval(checkAndSetTimer, 2 * 60 * 1000);

// 身份验证中间件
function requireAuth(req, res, next) {
  if (req.session.authenticated) {
    next();
  } else {
    res.status(401).json({ error: '未授权访问' });
  }
}

// 登录API
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (username === USERNAME && password === PASSWORD) {
    req.session.authenticated = true;
    res.json({ success: true, message: '登录成功' });
  } else {
    res.status(401).json({ error: '用户名或密码错误' });
  }
});

// 登出API
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true, message: '登出成功' });
});

// 获取URL列表
app.get('/api/urls', requireAuth, (req, res) => {
  res.json({
    urls: urls,
    scheduledUrls: scheduledUrls
  });
});

// 添加URL
app.post('/api/urls', requireAuth, (req, res) => {
  const { url, name, type } = req.body;
  
  if (!url || !name || !type) {
    return res.status(400).json({ error: '缺少必要参数' });
  }
  
  const newUrl = {
    id: Math.floor(Date.now() + Math.random() * 1000), // 确保ID唯一且为整数
    url: url,
    name: name,
    type: type,
    active: true
  };
  
  if (type === '24h') {
    urls.push(newUrl);
  } else if (type === 'scheduled') {
    scheduledUrls.push(newUrl);
  }
  
  // 保存数据到文件
  saveUrlsData();
  
  res.json({ success: true, url: newUrl });
});

// 批量添加URL
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
      id: Math.floor(Date.now() + Math.random() * 1000), // 确保ID唯一且为整数
      url: url,
      name: name,
      type: type,
      active: active
    };
    
    if (type === '24h') {
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
  
  // 保存数据到文件
  saveUrlsData();
  
  res.json({ 
    success: true, 
    message: `成功批量添加 ${addedUrls.length} 个URL`,
    urls: addedUrls 
  });
});

// 删除URL
app.delete('/api/urls/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  
  urls = urls.filter(u => u.id !== id);
  scheduledUrls = scheduledUrls.filter(u => u.id !== id);
  
  // 保存数据到文件
  saveUrlsData();
  
  res.json({ success: true });
});

// 更新URL状态
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
    // 保存数据到文件
    saveUrlsData();
    res.json({ success: true, url: url });
  } else {
    res.status(404).json({ error: 'URL不存在' });
  }
});

// 编辑URL
app.put('/api/urls/:id/edit', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const { url: newUrl, name, type } = req.body;
  
  if (!newUrl || !name || !type) {
    return res.status(400).json({ error: '缺少必要参数' });
  }
  
  let url = urls.find(u => u.id === id);
  let wasInUrls = true;
  
  if (url) {
    // 如果类型改变了，需要从原数组移除并添加到新数组
    if (url.type !== type) {
      urls = urls.filter(u => u.id !== id);
      if (type === '24h') {
        urls.push({ ...url, url: newUrl, name, type });
      } else {
        scheduledUrls.push({ ...url, url: newUrl, name, type });
      }
    } else {
      // 类型没变，直接更新
      url.url = newUrl;
      url.name = name;
    }
  } else {
    url = scheduledUrls.find(u => u.id === id);
    wasInUrls = false;
    
    if (url) {
      // 如果类型改变了，需要从原数组移除并添加到新数组
      if (url.type !== type) {
        scheduledUrls = scheduledUrls.filter(u => u.id !== id);
        if (type === '24h') {
          urls.push({ ...url, url: newUrl, name, type });
        } else {
          scheduledUrls.push({ ...url, url: newUrl, name, type });
        }
      } else {
        // 类型没变，直接更新
        url.url = newUrl;
        url.name = name;
      }
    }
  }
  
  if (url) {
    // 保存数据到文件
    saveUrlsData();
    res.json({ success: true, url: url });
  } else {
    res.status(404).json({ error: 'URL不存在' });
  }
});

// 获取访问日志
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

// 清空日志
app.delete('/api/logs', requireAuth, (req, res) => {
  accessLogs = [];
  // 保存数据到文件
  saveLogsData();
  res.json({ success: true, message: '日志已清空' });
});

// 获取Telegram配置状态
app.get('/api/telegram/status', requireAuth, (req, res) => {
  // 动态检查配置状态
  const currentChatId = global.TG_CHAT_ID || TG_CHAT_ID;
  const currentBotToken = global.TG_BOT_TOKEN || TG_BOT_TOKEN;
  const currentEnabled = currentChatId && currentBotToken;
  const pushEnabled = global.TG_PUSH_ENABLED !== false; // 默认启用
  
  res.json({
    enabled: currentEnabled,
    pushEnabled: pushEnabled,
    hasChatId: !!currentChatId,
    hasBotToken: !!currentBotToken
  });
});

// 设置Telegram配置
app.post('/api/telegram/config', requireAuth, (req, res) => {
  const { chatId, botToken } = req.body;
  
  if (!chatId || !botToken) {
    return res.status(400).json({ error: 'Chat ID和Bot Token都必须提供' });
  }
  
  // 更新全局变量
  global.TG_CHAT_ID = chatId;
  global.TG_BOT_TOKEN = botToken;
  
  // 保存配置到文件
  saveTelegramConfig();
  
  // 发送测试消息验证配置
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

// 清除Telegram配置
app.post('/api/telegram/clear', requireAuth, (req, res) => {
  global.TG_CHAT_ID = '';
  global.TG_BOT_TOKEN = '';
  
  // 保存配置到文件
  saveTelegramConfig();
  
  res.json({ 
    success: true, 
    message: 'Telegram配置已清除',
    enabled: false
  });
});

// 启用Telegram推送
app.post('/api/telegram/enable', requireAuth, (req, res) => {
  global.TG_PUSH_ENABLED = true;
  
  // 保存配置到文件
  saveTelegramConfig();
  
  res.json({ 
    success: true, 
    message: 'Telegram推送已启用',
    pushEnabled: true
  });
});

// 暂停Telegram推送
app.post('/api/telegram/disable', requireAuth, (req, res) => {
  global.TG_PUSH_ENABLED = false;
  
  // 保存配置到文件
  saveTelegramConfig();
  
  res.json({ 
    success: true, 
    message: 'Telegram推送已暂停',
    pushEnabled: false
  });
});

// 前端页面路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 程序关闭时保存数据
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

// 启动服务器
app.listen(port, () => {
  console.log(`服务器运行在端口: ${port}`);
  console.log(`前端页面: http://localhost:${port}`);
  console.log(`数据存储位置: ${DATA_DIR}`);
  console.log(`username/password: ${USERNAME}/${PASSWORD}`);
  
  // 动态检查Telegram配置状态（配置文件已通过loadData()加载）
  const currentChatId = global.TG_CHAT_ID || TG_CHAT_ID;
  const currentBotToken = global.TG_BOT_TOKEN || TG_BOT_TOKEN;
  const currentEnabled = currentChatId && currentBotToken;
  
  if (currentEnabled) {
    console.log(`✅ Telegram提醒已启用 (Chat ID: ${currentChatId})`);
  } else {
    console.log(`❌ Telegram提醒未启用 (需要设置 TG_CHAT_ID 和 TG_BOT_TOKEN 环境变量)`);
  }
});
