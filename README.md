# 自动访问系统

一个基于Node.js的自动化网站访问系统，支持24小时访问和定时访问模式。

## 功能特性
自动化网站访问系统，支持24小时访问和定时访问模式
- 🔐 用户认证系统
- 🌐 支持单个和批量添加URL
- ⏰ 两种访问模式：24小时访问(每2分钟访问一次)和定时访问（1:00-6:00暂停，其他时间每2分钟访问一次）
- 📊 实时访问日志和统计
- 🔔 Telegram错误提醒（可选）
- 🌐 模拟真实浏览器访问
- 📱 响应式Web界面

## 安装和运行

1. 安装依赖：
```bash
npm install
```

2. 启动服务器：
```bash
npm start
```

3. 访问系统：
   - 地址：http://localhost:3000
   - 默认用户名：admin
   - 默认密码：admin123

## 环境变量配置

### 基础配置
- `SERVER_PORT`: 服务器端口（默认：3000）
- `ADMIN_USERNAME`: 管理员用户名（默认：admin）
- `ADMIN_PASSWORD`: 管理员密码（默认：admin123）

### Telegram提醒配置

要启用Telegram错误提醒，需要同时设置以下两个环境变量：

#### 1. 获取Bot Token
1. 在Telegram中搜索 `@BotFather`
2. 发送 `/newbot` 命令
3. 按提示设置机器人名称
4. 创建成功后，BotFather会发送给你一个token

#### 2. 获取Chat ID
1. 将机器人添加到群组或私聊
2. 在群组中发送一条消息
3. 访问：`https://api.telegram.org/bot<BOT_TOKEN>/getUpdates`
4. 在返回的JSON中找到 `chat.id` 字段

#### 3. 设置环境变量
```bash
# Linux/Mac
export TG_BOT_TOKEN="your_bot_token_here"
export TG_CHAT_ID="your_chat_id_here"

# Windows
set TG_BOT_TOKEN=your_bot_token_here
set TG_CHAT_ID=your_chat_id_here

# 或者在 .env 文件中设置
TG_BOT_TOKEN=your_bot_token_here
TG_CHAT_ID=your_chat_id_here
```

#### 4. 重启服务器
设置环境变量后，重启服务器即可生效。

## 使用说明

### 添加URL
- **单个添加**：输入URL、选择访问模式、添加备注
- **批量添加**：每行一个URL，格式：`URL|备注(可选)`

### 访问模式
- **24小时访问**：每2分钟访问一次，全天不间断
- **定时访问**：每2分钟访问一次，但凌晨1:00-6:00暂停

### 错误提醒
当URL访问出错时，如果配置了Telegram，系统会自动发送包含以下信息的提醒：
- 🚨 错误类型标识
- 🔗 出错的URL
- 📊 访问模式
- ❌ 错误状态码
- 💬 详细错误信息
- ⏰ 发生时间

## API接口

### 添加URL

#### 单个添加
```http
POST /api/urls
Content-Type: application/json

{
  "url": "https://example.com",
  "name": "示例网站",
  "type": "24h"
}
```

**参数说明：**
- `url`: 要访问的网站地址（必需）
- `name`: 网站名称或备注（必需）
- `type`: 访问模式，可选值：`"24h"`（24小时访问）或 `"scheduled"`（定时访问）

#### 批量添加
```http
POST /api/urls/batch
Content-Type: application/json

{
  "urls": [
    {
      "url": "https://example1.com",
      "name": "网站1",
      "type": "24h"
    },
    {
      "url": "https://example2.com",
      "name": "网站2",
      "type": "scheduled"
    }
  ]
}
```

### 删除URL

```http
DELETE /api/urls/:id
```

**参数说明：**
- `id`: 要删除的URL的ID（路径参数）

## 注意事项

1. 确保目标网站允许自动化访问
2. 建议设置合理的访问间隔，避免对目标服务器造成压力
3. Telegram提醒需要网络能够访问Telegram API
4. 系统会自动保存访问日志，定期清理72小时前的数据
5. 所有API请求（除登录外）都需要先进行身份认证
6. 批量添加URL时，系统会自动生成唯一的整数ID
7. 系统访问网站时会自动带上真实的浏览器User-Agent，提高访问成功率
