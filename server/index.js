const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const store = require('./store');
const aiService = require('./ai-service');
const paymentService = require('./payment-service');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态托管前端资源
app.use(express.static(path.join(__dirname, 'public')));

// ======================== 文件上传安全加固 (白名单 + 扩展名净化) ========================
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 严禁 HTML/SVG/脚本/可执行文件，防止同源 XSS 攻击
const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx', '.txt', '.zip', '.rar']);
const DANGEROUS_MIMES = new Set(['text/html', 'image/svg+xml', 'application/javascript', 'application/x-msdownload', 'text/javascript', 'application/x-sh']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    let ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) ext = '.dat';
    cb(null, `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  if (!ALLOWED_EXTS.has(ext) || DANGEROUS_MIMES.has(mime)) {
    return cb(new Error('不允许上传此文件类型！仅允许上传图片(JPG/PNG/GIF/WEBP)、文档(PDF/DOC/DOCX/TXT)及压缩包。'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 限制最大 20MB
  fileFilter
});

// ======================== JWT 安全鉴权中间件 ========================
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || req.headers['x-token'];
  const token = authHeader ? (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader) : req.query.token;

  if (!token) {
    return res.status(401).json({ code: 401, message: '请先登录' });
  }

  const payload = store.verifyToken(token);
  if (!payload) {
    return res.status(401).json({ code: 401, message: 'Token 无效或登录凭证已过期，请重新登录' });
  }

  req.user = payload;
  next();
}

// ======================== SaaS 租户管理平台 RESTful API ========================

// 1. 租户注册：开通 7 天全功能试用 + 赠送 50,000 体验积分
app.post('/api/saas/register', (req, res) => {
  const { companyName, contactName, phone, email, password } = req.body;
  if (!companyName || !phone || !password) {
    return res.status(400).json({ code: -1, message: '请完整填写企业名称、手机号及登录密码' });
  }

  try {
    const tenant = store.registerTenant({ companyName, contactName, phone, email, password });
    const estimates = store.calculateCreditEstimate(tenant);
    const token = store.signToken({ tenantId: tenant.tenantId, role: 'tenant_admin' });
    return res.json({
      code: 0,
      message: '企业注册成功！已自动为您开通7天全功能免费试用及体验积分',
      data: {
        tenantId: tenant.tenantId,
        appKey: tenant.appKey,
        companyName: tenant.companyName,
        subscription: tenant.subscription,
        estimates,
        token
      }
    });
  } catch (err) {
    return res.status(400).json({ code: -1, message: err.message });
  }
});

// 2. 租户企业管理员登录 (签发真实 JWT Token)
app.post('/api/saas/login', (req, res) => {
  const { account, password } = req.body;
  const tenant = store.getTenantByEmailOrPhone(account) || (account === 'admin' ? store.data.tenants[0] : null);

  if (!tenant) {
    return res.status(401).json({ code: -1, message: '企业账号不存在' });
  }

  const isPasswordValid = store.verifyPassword(password, tenant.passwordHash, tenant.passwordSalt);
  if (!isPasswordValid) {
    return res.status(401).json({ code: -1, message: '账号或密码错误' });
  }

  const token = store.signToken({ tenantId: tenant.tenantId, role: 'tenant_admin' });
  const estimates = store.calculateCreditEstimate(tenant);

  return res.json({
    code: 0,
    message: '登录成功',
    data: {
      tenantId: tenant.tenantId,
      appKey: tenant.appKey,
      companyName: tenant.companyName,
      contactName: tenant.contactName,
      phone: tenant.phone,
      email: tenant.email,
      subscription: tenant.subscription,
      estimates,
      token
    }
  });
});

// 3. 租户控制台获取企业信息与积分预估
app.get('/api/saas/profile', (req, res) => {
  const tenantId = req.query.tenantId || (req.headers['x-tenant-id']);
  const tenant = store.getTenantById(tenantId) || store.data.tenants[0];

  const estimates = store.calculateCreditEstimate(tenant);
  res.json({
    code: 0,
    data: {
      tenantId: tenant.tenantId,
      appKey: tenant.appKey,
      companyName: tenant.companyName,
      contactName: tenant.contactName,
      phone: tenant.phone,
      email: tenant.email,
      subscription: tenant.subscription,
      aiConfig: tenant.aiConfig,
      estimates,
      knowledgeCount: (tenant.knowledgeBase || []).length,
      agentCount: (tenant.agents || []).length
    }
  });
});

// 4. 更新 AI 客服人设与托管规则
app.post('/api/saas/ai-config', (req, res) => {
  const tenantId = req.query.tenantId || req.body.tenantId;
  const tenant = store.getTenantById(tenantId) || store.data.tenants[0];

  const { enabled, mode, botName, greeting, promptSystem, transferKeywords, autoTransferOnUnknown } = req.body;
  if (!tenant.aiConfig) tenant.aiConfig = {};

  if (typeof enabled !== 'undefined') tenant.aiConfig.enabled = enabled;
  if (mode) tenant.aiConfig.mode = mode;
  if (botName) tenant.aiConfig.botName = botName;
  if (greeting) tenant.aiConfig.greeting = greeting;
  if (promptSystem) tenant.aiConfig.promptSystem = promptSystem;
  if (transferKeywords) tenant.aiConfig.transferKeywords = Array.isArray(transferKeywords) ? transferKeywords : transferKeywords.split(/[,，\s]+/);
  if (typeof autoTransferOnUnknown !== 'undefined') tenant.aiConfig.autoTransferOnUnknown = autoTransferOnUnknown;

  store.save();
  res.json({ code: 0, message: 'AI 客服设置更新成功', data: tenant.aiConfig });
});

// 5. 专属知识库管理接口 (查询、新增、删除)
app.get('/api/saas/knowledge-base', (req, res) => {
  const tenantId = req.query.tenantId;
  const tenant = store.getTenantById(tenantId) || store.data.tenants[0];
  res.json({ code: 0, data: tenant.knowledgeBase || [] });
});

app.post('/api/saas/knowledge-base', (req, res) => {
  const { tenantId, question, answer } = req.body;
  const targetTenantId = tenantId || store.data.tenants[0].tenantId;
  if (!question || !answer) {
    return res.status(400).json({ code: -1, message: '请填写完整的问题与答案' });
  }
  const item = store.addKnowledgeItem(targetTenantId, question.trim(), answer.trim());
  res.json({ code: 0, message: '知识库问答条目添加成功', data: item });
});

app.delete('/api/saas/knowledge-base/:id', (req, res) => {
  const tenantId = req.query.tenantId || store.data.tenants[0].tenantId;
  const success = store.deleteKnowledgeItem(tenantId, req.params.id);
  res.json({ code: success ? 0 : -1, message: success ? '删除成功' : '条目不存在' });
});

// 6. 199元人工客服年费开通/续费
app.post('/api/saas/subscribe-plan', (req, res) => {
  const { tenantId } = req.body;
  const targetId = tenantId || store.data.tenants[0].tenantId;
  const sub = store.renewManualPlan(targetId);
  res.json({ code: 0, message: '恭喜！已成功开通 199元/年 人工客服标准套餐！', data: sub });
});

// 7. Token 积分包在线充值
app.post('/api/saas/recharge-credits', (req, res) => {
  const { tenantId, packageId, customCredits } = req.body;
  const targetId = tenantId || store.data.tenants[0].tenantId;

  let addAmount = 0;
  if (packageId) {
    const pkg = store.data.platformConfig.creditPackages.find(p => p.id === packageId);
    if (pkg) addAmount = pkg.credits;
  }
  if (!addAmount && customCredits) {
    addAmount = parseInt(customCredits, 10);
  }
  if (addAmount <= 0) addAmount = 100000;

  const newCredits = store.addCredits(targetId, addAmount);
  res.json({
    code: 0,
    message: `成功充值 ${addAmount.toLocaleString()} Token 积分！`,
    data: { aiCredits: newCredits }
  });
});

// 8. 获取平台套餐资费列表
app.get('/api/saas/packages', (req, res) => {
  res.json({
    code: 0,
    data: {
      yearlyPrice: store.data.platformConfig.yearlyPrice,
      creditPackages: store.data.platformConfig.creditPackages,
      paypalPayee: paymentService.payeePaypalEmail
    }
  });
});

// ======================== 微信支付 & PayPal 支付 API ========================

// 1. 创建支付订单 (支持 199 元年费或积分包，支持微信支付 / PayPal)
app.post('/api/payment/create-order', (req, res) => {
  try {
    const { tenantId, orderType, packageId, payMethod } = req.body;
    const targetTenantId = tenantId || store.data.tenants[0].tenantId;
    const order = paymentService.createOrder({
      tenantId: targetTenantId,
      orderType,
      packageId,
      payMethod: payMethod || 'wechat'
    });

    let payData = {};
    if (order.payMethod === 'paypal') {
      payData = {
        payeeEmail: paymentService.payeePaypalEmail,
        checkoutUrl: paymentService.generatePaypalCheckoutUrl(order)
      };
    } else {
      payData = paymentService.generateWechatPayData(order);
    }

    res.json({
      code: 0,
      message: '订单创建成功',
      data: {
        order,
        payData
      }
    });
  } catch (err) {
    res.status(400).json({ code: -1, message: err.message });
  }
});

// 2. 轮询订单支付状态
app.get('/api/payment/order/:orderId', (req, res) => {
  const order = paymentService.getOrder(req.params.orderId);
  if (!order) return res.status(404).json({ code: -1, message: '订单未找到' });
  res.json({ code: 0, data: order });
});

// 3. 支付完成履约确认 (买家付款成功后触发确认入账)
app.post('/api/payment/confirm-paid', (req, res) => {
  try {
    const { orderId, payDetails } = req.body;
    const updatedOrder = paymentService.completeOrder(orderId, payDetails);
    res.json({
      code: 0,
      message: '支付成功！套餐/积分已自动为您激活入账',
      data: updatedOrder
    });
  } catch (err) {
    res.status(400).json({ code: -1, message: err.message });
  }
});

// 4. 获取当前租户的全部历史支付账单
app.get('/api/payment/tenant-orders', (req, res) => {
  const tenantId = req.query.tenantId || store.data.tenants[0].tenantId;
  const orders = paymentService.getTenantOrders(tenantId);
  res.json({ code: 0, data: orders });
});

// 5. PayPal IPN / Webhook 回调
app.post('/api/payment/notify/paypal', (req, res) => {
  const { invoice, payment_status, txn_id } = req.body;
  if (invoice && (payment_status === 'Completed' || payment_status === 'Processed')) {
    paymentService.completeOrder(invoice, { source: 'paypal_ipn', txn_id });
  }
  res.status(200).send('OK');
});

// 6. 微信支付结果通知回调
app.post('/api/payment/notify/wechat', (req, res) => {
  res.status(200).send('<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>');
});

// ======================== 客服业务 RESTful API ========================

// 坐席登录 (支持指定 appKey/tenantId，返回真正加密 JWT Token)
app.post('/api/login', (req, res) => {
  const { username, password, appKey } = req.body;
  const tenant = store.getTenantByAppKey(appKey);
  const agent = store.verifyAgent(tenant.tenantId, username, password);

  if (!agent) {
    return res.status(401).json({ code: -1, message: '工号或密码错误' });
  }

  const token = store.signToken({
    tenantId: tenant.tenantId,
    agentId: agent.id,
    username: agent.username,
    role: 'agent'
  });

  return res.json({
    code: 0,
    message: '登录成功',
    data: {
      id: agent.id,
      username: agent.username,
      name: agent.name,
      avatar: agent.avatar,
      tenantId: tenant.tenantId,
      companyName: tenant.companyName,
      token
    }
  });
});

// 文件上传 (受白名单与错误捕获保护)
app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ code: -1, message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ code: -1, message: '没有上传文件' });
    }
    return res.json({
      code: 0,
      data: {
        url: `/uploads/${req.file.filename}`,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  });
});

// 获取当前租户在线客服列表 (供转接、状态展示)
app.get('/api/online-agents', (req, res) => {
  const tenant = store.getTenantByAppKey(req.query.appKey);
  const tCtx = getTenantContext(tenant.tenantId);
  const list = [];
  for (const [id, agent] of tCtx.agentsMap.entries()) {
    if (agent.info.status === 'online') {
      list.push({
        id: agent.info.id,
        name: agent.info.name,
        avatar: agent.info.avatar,
        status: agent.info.status,
        activeChatsCount: agent.activeChats.size,
        maxChats: agent.info.maxChats || 10
      });
    }
  }
  res.json({ code: 0, data: list });
});

// 黑名单管理：获取黑名单列表
app.get('/api/blacklist', (req, res) => {
  const tenant = store.getTenantByAppKey(req.query.appKey);
  res.json({ code: 0, data: tenant.blacklist || [] });
});

// 黑名单管理：添加黑名单
app.post('/api/blacklist', (req, res) => {
  const { appKey, ip, visitorId, reason } = req.body;
  const tenant = store.getTenantByAppKey(appKey);
  if (!ip && !visitorId) {
    return res.status(400).json({ code: -1, message: '必须提供 IP 或访客 ID' });
  }

  store.addBlacklist(tenant.tenantId, { ip, visitorId, reason });

  // 如果该访客正在连接中，立刻主动断开并提示被拉黑
  const tCtx = getTenantContext(tenant.tenantId);
  for (const [vId, v] of tCtx.visitorsMap.entries()) {
    if (vId === visitorId || (ip && v.info.ip === ip)) {
      if (v.ws.readyState === WebSocket.OPEN) {
        v.ws.send(JSON.stringify({
          type: 'visitor_blocked',
          data: { message: '您的访问已被管理员加入黑名单，已限制接入客服系统。' }
        }));
        v.ws.close();
      }
      tCtx.visitorsMap.delete(vId);
      tCtx.activeSessions.delete(vId);
    }
  }

  res.json({ code: 0, message: '已成功将该访客加入黑名单！' });
});

// 黑名单管理：移除黑名单
app.delete('/api/blacklist/:id', (req, res) => {
  const tenant = store.getTenantByAppKey(req.query.appKey);
  const success = store.removeBlacklist(tenant.tenantId, req.params.id);
  res.json({ code: success ? 0 : -1, message: success ? '已成功移出黑名单' : '未找到该黑名单记录' });
});

// 满意度评价上报
app.post('/api/rate-chat', (req, res) => {
  const { appKey, chatId, visitorId, visitorName, agentId, stars, tags, comment } = req.body;
  const tenant = store.getTenantByAppKey(appKey);

  const rating = store.addRating(tenant.tenantId, {
    chatId,
    visitorId,
    visitorName,
    agentId,
    stars: parseInt(stars, 10) || 5,
    tags: Array.isArray(tags) ? tags : [],
    comment: comment || ''
  });

  // 广播给坐席工作台更新满意度
  broadcastToTenantAgents(tenant.tenantId, {
    type: 'new_rating',
    data: rating
  });

  res.json({ code: 0, message: '感谢您的评价与支持！', data: rating });
});

// 获取满意度评价历史列表
app.get('/api/ratings', (req, res) => {
  const tenant = store.getTenantByAppKey(req.query.appKey);
  const ratings = store.getRatings(tenant.tenantId);
  res.json({ code: 0, data: ratings });
});

// 离线留言提交
app.post('/api/offline-msg', (req, res) => {
  const { name, phone, email, content, visitorId, appKey } = req.body;
  const tenant = store.getTenantByAppKey(appKey);
  store.addOfflineMessage(tenant.tenantId, { name, phone, email, content, visitorId });
  broadcastToTenantAgents(tenant.tenantId, {
    type: 'new_offline_msg',
    data: { name, phone, email, content, createTime: new Date().toISOString() }
  });
  res.json({ code: 0, message: '留言提交成功，我们会尽快与您联系！' });
});

// 获取离线留言
app.get('/api/offline-msgs', (req, res) => {
  const tenant = store.getTenantByAppKey(req.query.appKey);
  res.json({ code: 0, data: tenant.offlineMessages || [] });
});

// 历史会话记录
app.get('/api/history', (req, res) => {
  const tenant = store.getTenantByAppKey(req.query.appKey);
  res.json({ code: 0, data: (tenant.chatHistory || []).slice(0, 50) });
});

// 常用快捷话术
app.get('/api/canned-messages', (req, res) => {
  const tenant = store.getTenantByAppKey(req.query.appKey);
  res.json({ code: 0, data: tenant.cannedMessages || [] });
});

// 系统综合监控
app.get('/api/stats', (req, res) => {
  const tenant = store.getTenantByAppKey(req.query.appKey);
  const tCtx = getTenantContext(tenant.tenantId);
  const ratings = store.getRatings(tenant.tenantId);
  const avgStars = ratings.length ? (ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length).toFixed(1) : '5.0';

  res.json({
    code: 0,
    data: {
      companyName: tenant.companyName,
      onlineAgents: tCtx.agentsMap.size,
      onlineVisitors: tCtx.visitorsMap.size,
      activeChats: tCtx.activeSessions.size,
      aiCredits: tenant.subscription.aiCredits,
      totalHistory: (tenant.chatHistory || []).length,
      offlineMsgs: (tenant.offlineMessages || []).length,
      ratingCount: ratings.length,
      averageRating: avgStars
    }
  });
});

// ======================== WebSocket 实时网关 (多租户 + AI 混合调度 + 心跳保活) ========================

// 多租户隔离上下文管理
const tenantsContextMap = new Map(); // tenantId -> { agentsMap, visitorsMap, activeSessions }

function getTenantContext(tenantId) {
  if (!tenantsContextMap.has(tenantId)) {
    tenantsContextMap.set(tenantId, {
      agentsMap: new Map(),     // agentId -> { ws, info, activeChats: Set<visitorId> }
      visitorsMap: new Map(),   // visitorId -> { ws, info, assignedAgentId, isAiHandled: bool, tracks: [], lastActiveTime: number }
      activeSessions: new Map() // visitorId -> { id, visitorId, agentId, isAiHandled, messages: [], lastActiveTime: number }
    });
  }
  return tenantsContextMap.get(tenantId);
}

function broadcastToTenantAgents(tenantId, msgObj) {
  const tCtx = getTenantContext(tenantId);
  const payload = JSON.stringify(msgObj);
  for (const { ws } of tCtx.agentsMap.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

// 自动分配空闲人工坐席算法
function findBestOnlineAgent(tenantId) {
  const tCtx = getTenantContext(tenantId);
  let selected = null;
  let minChats = Infinity;

  for (const [agentId, agent] of tCtx.agentsMap.entries()) {
    if (agent.info.status === 'online') {
      const currentLoad = agent.activeChats.size;
      const maxLimit = agent.info.maxChats || 10;
      if (currentLoad < maxLimit && currentLoad < minChats) {
        minChats = currentLoad;
        selected = agent;
      }
    }
  }
  return selected;
}

wss.on('connection', (ws, req) => {
  let clientRole = null; // 'agent' 或 'visitor'
  let clientId = null;
  let currentTenantId = null;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', async (messageBuffer) => {
    try {
      const packet = JSON.parse(messageBuffer.toString());
      const { type, data } = packet;

      // ----------------- 客服坐席登录与操作 -----------------
      if (type === 'agent_login') {
        const { username, password, appKey } = data;
        const tenant = store.getTenantByAppKey(appKey);
        const agentRecord = store.verifyAgent(tenant.tenantId, username, password);

        if (!agentRecord) {
          ws.send(JSON.stringify({ type: 'agent_login_result', data: { success: false, message: '工号或密码错误' } }));
          return;
        }

        clientRole = 'agent';
        clientId = agentRecord.id;
        currentTenantId = tenant.tenantId;

        agentRecord.status = 'online';
        store.updateAgentStatus(currentTenantId, clientId, 'online');

        const tCtx = getTenantContext(currentTenantId);
        tCtx.agentsMap.set(clientId, {
          ws,
          info: agentRecord,
          activeChats: new Set()
        });

        // 关联该坐席正在进行中的会话
        for (const [vId, session] of tCtx.activeSessions.entries()) {
          if (session.agentId === clientId) {
            tCtx.agentsMap.get(clientId).activeChats.add(vId);
          }
        }

        const visitorList = Array.from(tCtx.visitorsMap.values()).map(v => v.info);
        const activeList = Array.from(tCtx.agentsMap.get(clientId).activeChats).map(vId => {
          const sess = tCtx.activeSessions.get(vId);
          const v = tCtx.visitorsMap.get(vId);
          return {
            visitorId: vId,
            visitorInfo: v ? v.info : { name: '访客 ' + vId },
            session: sess
          };
        });

        ws.send(JSON.stringify({
          type: 'agent_login_result',
          data: {
            success: true,
            tenantId: tenant.tenantId,
            companyName: tenant.companyName,
            agent: agentRecord,
            visitors: visitorList,
            activeChats: activeList,
            cannedMessages: tenant.cannedMessages || []
          }
        }));

        broadcastToTenantAgents(currentTenantId, {
          type: 'agent_online',
          data: { agent: agentRecord }
        });
        console.log(`[客服上线] [${tenant.companyName}] ${agentRecord.name} (${agentRecord.id}) 登录`);
        return;
      }

      // 坐席状态切换
      if (type === 'agent_set_status') {
        if (clientRole === 'agent' && currentTenantId) {
          const tCtx = getTenantContext(currentTenantId);
          const agentEntry = tCtx.agentsMap.get(clientId);
          if (agentEntry) {
            agentEntry.info.status = data.status;
            store.updateAgentStatus(currentTenantId, clientId, data.status);
            broadcastToTenantAgents(currentTenantId, {
              type: 'agent_status_change',
              data: { agentId: clientId, status: data.status }
            });
          }
        }
        return;
      }

      // 坐席主动拉黑访客
      if (type === 'agent_block_visitor') {
        const { visitorId, reason } = data;
        if (!currentTenantId) return;
        const tCtx = getTenantContext(currentTenantId);
        const visitor = tCtx.visitorsMap.get(visitorId);
        const ip = visitor ? visitor.info.ip : '';

        store.addBlacklist(currentTenantId, { ip, visitorId, reason: reason || '坐席主动拉黑' });

        if (visitor && visitor.ws.readyState === WebSocket.OPEN) {
          visitor.ws.send(JSON.stringify({
            type: 'visitor_blocked',
            data: { message: '您的访问已被客服列入黑名单，会话已终止。' }
          }));
          visitor.ws.close();
        }

        tCtx.visitorsMap.delete(visitorId);
        tCtx.activeSessions.delete(visitorId);

        const agentEntry = tCtx.agentsMap.get(clientId);
        if (agentEntry) agentEntry.activeChats.delete(visitorId);

        ws.send(JSON.stringify({
          type: 'block_visitor_success',
          data: { visitorId, message: '该访客已被成功拉黑并断开！' }
        }));

        broadcastToTenantAgents(currentTenantId, {
          type: 'visitor_left_all',
          data: { visitorId }
        });
        return;
      }

      // 坐席转接访客 (转给其他在线人工坐席)
      if (type === 'agent_transfer') {
        const { visitorId, targetAgentId } = data;
        const tCtx = getTenantContext(currentTenantId);
        const session = tCtx.activeSessions.get(visitorId);
        const visitor = tCtx.visitorsMap.get(visitorId);
        const targetAgent = tCtx.agentsMap.get(targetAgentId);
        const fromAgent = tCtx.agentsMap.get(clientId);

        if (!session || !visitor) {
          ws.send(JSON.stringify({ type: 'transfer_result', data: { success: false, message: '会话不存在或访客已离开' } }));
          return;
        }

        if (!targetAgent || targetAgent.info.status !== 'online') {
          ws.send(JSON.stringify({ type: 'transfer_result', data: { success: false, message: '目标客服不在线，转接失败' } }));
          return;
        }

        // 迁移会话关系
        if (fromAgent) fromAgent.activeChats.delete(visitorId);
        targetAgent.activeChats.add(visitorId);

        session.agentId = targetAgent.info.id;
        session.agentName = targetAgent.info.name;
        session.isAiHandled = false;
        visitor.assignedAgentId = targetAgent.info.id;
        visitor.isAiHandled = false;

        const tipMsg = {
          id: 'msg_tf_' + Date.now(),
          from: 'system',
          fromRole: 'system',
          to: visitorId,
          text: `客服【${fromAgent ? fromAgent.info.name : '客服'}】已将为您转接至【${targetAgent.info.name}】为您服务。`,
          time: new Date().toLocaleTimeString()
        };
        session.messages.push(tipMsg);

        // 通知新坐席
        targetAgent.ws.send(JSON.stringify({
          type: 'chat_transferred_in',
          data: {
            visitorId,
            visitorInfo: visitor.info,
            session,
            fromAgentName: fromAgent ? fromAgent.info.name : '客服'
          }
        }));

        // 通知访客
        if (visitor.ws.readyState === WebSocket.OPEN) {
          visitor.ws.send(JSON.stringify({
            type: 'chat_connected',
            data: {
              agentId: targetAgent.info.id,
              agentName: targetAgent.info.name,
              agentAvatar: targetAgent.info.avatar,
              isAi: false,
              message: tipMsg.text
            }
          }));
        }

        // 回复原坐席
        ws.send(JSON.stringify({
          type: 'transfer_result',
          data: { success: true, visitorId, message: `已成功将访客转接给【${targetAgent.info.name}】` }
        }));
        return;
      }

      // 核心人机协同：坐席【一键接管会话】
      if (type === 'agent_takeover') {
        const { visitorId } = data;
        const tCtx = getTenantContext(currentTenantId);
        const session = tCtx.activeSessions.get(visitorId);
        const visitor = tCtx.visitorsMap.get(visitorId);
        const agentEntry = tCtx.agentsMap.get(clientId);

        if (session && visitor && agentEntry) {
          session.isAiHandled = false;
          session.agentId = clientId;
          session.agentName = agentEntry.info.name;
          visitor.assignedAgentId = clientId;
          visitor.isAiHandled = false;
          agentEntry.activeChats.add(visitorId);

          if (visitor.ws.readyState === WebSocket.OPEN) {
            visitor.ws.send(JSON.stringify({
              type: 'chat_connected',
              data: {
                agentId: clientId,
                agentName: agentEntry.info.name,
                agentAvatar: agentEntry.info.avatar,
                isAi: false,
                message: `人工客服【${agentEntry.info.name}】已为您接管服务！`
              }
            }));
          }

          ws.send(JSON.stringify({
            type: 'takeover_success',
            data: { visitorId, session }
          }));
        }
        return;
      }

      // 核心人机协同：坐席【交还 AI 托管】
      if (type === 'agent_release_to_ai') {
        const { visitorId } = data;
        const tCtx = getTenantContext(currentTenantId);
        const session = tCtx.activeSessions.get(visitorId);
        const visitor = tCtx.visitorsMap.get(visitorId);
        const agentEntry = tCtx.agentsMap.get(clientId);

        if (session && visitor) {
          session.isAiHandled = true;
          session.agentId = 'ai_bot';
          visitor.assignedAgentId = 'ai_bot';
          visitor.isAiHandled = true;
          if (agentEntry) agentEntry.activeChats.delete(visitorId);

          if (visitor.ws.readyState === WebSocket.OPEN) {
            const tenant = store.getTenantById(currentTenantId);
            visitor.ws.send(JSON.stringify({
              type: 'chat_connected',
              data: {
                agentId: 'ai_bot',
                agentName: tenant.aiConfig.botName || 'AI智能客服',
                agentAvatar: tenant.aiConfig.botAvatar,
                isAi: true,
                message: `已切换为 AI 智能客服托管解答。`
              }
            }));
          }
        }
        return;
      }

      // 坐席结束对话 (附带满意度评分提示)
      if (type === 'agent_end_chat') {
        const { visitorId } = data;
        const tCtx = getTenantContext(currentTenantId);
        const session = tCtx.activeSessions.get(visitorId);
        if (session) {
          store.saveChatHistory(currentTenantId, session);
          tCtx.activeSessions.delete(visitorId);
        }
        const agentEntry = tCtx.agentsMap.get(clientId);
        if (agentEntry) agentEntry.activeChats.delete(visitorId);

        const visitor = tCtx.visitorsMap.get(visitorId);
        if (visitor) {
          visitor.assignedAgentId = null;
          if (visitor.ws.readyState === WebSocket.OPEN) {
            visitor.ws.send(JSON.stringify({
              type: 'chat_ended',
              data: {
                chatId: session ? session.id : '',
                agentId: clientId,
                showRatingPrompt: true,
                message: '客服已结束本次对话，请您为本次服务做出评价，感谢您的支持！'
              }
            }));
          }
        }
        return;
      }

      // ----------------- 访客端接入与 AI 智能托管 -----------------

      // 访客浏览网站进入
      if (type === 'visitor_enter') {
        const tenant = store.getTenantByAppKey(data.appKey);
        currentTenantId = tenant.tenantId;
        clientRole = 'visitor';

        const visitorId = data.visitorId || 'v_' + Math.random().toString(36).substring(2, 9);
        clientId = visitorId;

        // 黑名单安全检测
        if (store.isBlacklisted(currentTenantId, clientIp, visitorId)) {
          ws.send(JSON.stringify({
            type: 'visitor_blocked',
            data: { message: '您的访问已被管理员列入黑名单，已限制连接。' }
          }));
          ws.close();
          return;
        }

        const vInfo = {
          visitorId,
          name: data.name || '访客 ' + Math.random().toString(36).substring(2, 6).toUpperCase(),
          ip: clientIp,
          city: data.city || '本地访问',
          referrer: data.referrer || '直接访问',
          searchWord: data.searchWord || '无',
          currentPage: data.currentPage || '/',
          pageTitle: data.pageTitle || '官方网站',
          userAgent: data.userAgent || req.headers['user-agent'] || '浏览器',
          enterTime: new Date().toLocaleTimeString(),
          appKey: tenant.appKey,
          companyName: tenant.companyName,
          trackCount: 1
        };

        const tCtx = getTenantContext(currentTenantId);
        const visitorObj = {
          ws,
          info: vInfo,
          assignedAgentId: null,
          isAiHandled: false,
          lastActiveTime: Date.now(),
          tracks: [{ page: vInfo.currentPage, title: vInfo.pageTitle, time: new Date().toLocaleTimeString() }]
        };
        tCtx.visitorsMap.set(clientId, visitorObj);

        ws.send(JSON.stringify({
          type: 'visitor_enter_ack',
          data: {
            visitorId: clientId,
            name: vInfo.name,
            companyName: tenant.companyName,
            aiConfig: tenant.aiConfig
          }
        }));

        broadcastToTenantAgents(currentTenantId, {
          type: 'new_visitor',
          data: vInfo
        });
        return;
      }

      // 访客页面切换轨迹跟踪 (支持单页 SPA)
      if (type === 'visitor_navigate') {
        if (!currentTenantId) return;
        const tCtx = getTenantContext(currentTenantId);
        const visitor = tCtx.visitorsMap.get(clientId);
        if (visitor) {
          visitor.lastActiveTime = Date.now();
          visitor.info.currentPage = data.pageUrl;
          visitor.info.pageTitle = data.pageTitle;
          visitor.info.trackCount++;
          const trackItem = { page: data.pageUrl, title: data.pageTitle, time: new Date().toLocaleTimeString() };
          visitor.tracks.push(trackItem);

          broadcastToTenantAgents(currentTenantId, {
            type: 'visitor_navigation_updated',
            data: {
              visitorId: clientId,
              currentPage: data.pageUrl,
              pageTitle: data.pageTitle,
              tracks: visitor.tracks
            }
          });
        }
        return;
      }

      // 访客呼叫客服 / 发起对话
      if (type === 'visitor_call') {
        if (!currentTenantId) return;
        const tenant = store.getTenantById(currentTenantId);
        const tCtx = getTenantContext(currentTenantId);
        const visitor = tCtx.visitorsMap.get(clientId);
        if (!visitor) return;

        visitor.lastActiveTime = Date.now();

        // 若已有进行中的对话则直接恢复
        if (tCtx.activeSessions.has(clientId)) {
          const sess = tCtx.activeSessions.get(clientId);
          ws.send(JSON.stringify({
            type: 'chat_connected',
            data: {
              chatId: sess.id,
              agentId: sess.agentId,
              agentName: sess.agentName,
              isAi: sess.isAiHandled,
              messages: sess.messages
            }
          }));
          return;
        }

        // 智能决策：AI 托管还是分配人工？
        const aiEnabled = tenant.aiConfig && tenant.aiConfig.enabled && (tenant.subscription.aiCredits > 0);
        const isAiFirst = tenant.aiConfig && tenant.aiConfig.mode === 'ai_first';
        const bestAgent = findBestOnlineAgent(currentTenantId);

        let willUseAi = false;
        if (aiEnabled) {
          if (isAiFirst) {
            willUseAi = true; // AI 优先模式
          } else if (!bestAgent) {
            willUseAi = true; // 混合模式下无人工坐席在线，AI 自动接管
          }
        }

        if (willUseAi) {
          // AI 托管接入
          visitor.assignedAgentId = 'ai_bot';
          visitor.isAiHandled = true;

          const aiGreeting = tenant.aiConfig.greeting || '您好！我是 AI 智能客服，请问有什么可以帮助您的？';
          const session = {
            id: 'chat_' + Date.now(),
            visitorId: clientId,
            visitorName: visitor.info.name,
            agentId: 'ai_bot',
            agentName: tenant.aiConfig.botName || 'AI智能客服',
            isAiHandled: true,
            startTime: new Date().toISOString(),
            lastActiveTime: Date.now(),
            messages: [
              {
                id: 'msg_' + Date.now(),
                from: 'ai_bot',
                fromRole: 'agent',
                isAi: true,
                to: clientId,
                text: aiGreeting,
                time: new Date().toLocaleTimeString()
              }
            ],
            tracks: visitor.tracks
          };
          tCtx.activeSessions.set(clientId, session);

          ws.send(JSON.stringify({
            type: 'chat_connected',
            data: {
              chatId: session.id,
              agentId: 'ai_bot',
              agentName: tenant.aiConfig.botName || 'AI智能客服',
              agentAvatar: tenant.aiConfig.botAvatar,
              isAi: true,
              messages: session.messages
            }
          }));

          // 广播给坐席工作台：AI 正在接待，坐席可实时围观或随时接管
          broadcastToTenantAgents(currentTenantId, {
            type: 'new_chat',
            data: {
              visitorId: clientId,
              visitorInfo: visitor.info,
              tracks: visitor.tracks,
              session
            }
          });
          return;

        } else if (bestAgent) {
          // 分配给人工客服
          visitor.assignedAgentId = bestAgent.info.id;
          visitor.isAiHandled = false;
          bestAgent.activeChats.add(clientId);

          const newSession = {
            id: 'chat_' + Date.now(),
            visitorId: clientId,
            visitorName: visitor.info.name,
            agentId: bestAgent.info.id,
            agentName: bestAgent.info.name,
            isAiHandled: false,
            startTime: new Date().toISOString(),
            lastActiveTime: Date.now(),
            messages: [],
            tracks: visitor.tracks
          };
          tCtx.activeSessions.set(clientId, newSession);

          bestAgent.ws.send(JSON.stringify({
            type: 'new_chat',
            data: {
              visitorId: clientId,
              visitorInfo: visitor.info,
              tracks: visitor.tracks,
              session: newSession
            }
          }));

          ws.send(JSON.stringify({
            type: 'chat_connected',
            data: {
              chatId: newSession.id,
              agentId: bestAgent.info.id,
              agentName: bestAgent.info.name,
              agentAvatar: bestAgent.info.avatar,
              isAi: false,
              messages: []
            }
          }));
          return;

        } else {
          // 人工全离线且 AI 未开通或积分耗尽
          ws.send(JSON.stringify({
            type: 'no_agent_online',
            data: { message: '当前所有客服均不在线，请您留下联系方式，我们上线后将第一时间答复您。' }
          }));
          return;
        }
      }

      // 访客打字预知
      if (type === 'visitor_typing_preview') {
        if (!currentTenantId) return;
        const tCtx = getTenantContext(currentTenantId);
        const session = tCtx.activeSessions.get(clientId);
        if (session && session.agentId && session.agentId !== 'ai_bot') {
          const agent = tCtx.agentsMap.get(session.agentId);
          if (agent && agent.ws.readyState === WebSocket.OPEN) {
            agent.ws.send(JSON.stringify({
              type: 'visitor_typing_preview',
              data: { visitorId: clientId, text: data.text || '' }
            }));
          }
        }
        return;
      }

      // ----------------- 即时消息投递 (双向与 AI 生成) -----------------
      if (type === 'send_message') {
        const { to, text, msgType = 'text', fileInfo } = data;
        const msgId = 'msg_' + Date.now();
        const timeStr = new Date().toLocaleTimeString();

        const messagePayload = {
          id: msgId,
          from: clientId,
          fromRole: clientRole,
          to,
          text,
          msgType,
          fileInfo,
          time: timeStr
        };

        const tCtx = getTenantContext(currentTenantId);

        if (clientRole === 'visitor') {
          // 访客发送消息
          const session = tCtx.activeSessions.get(clientId);
          if (session) {
            session.messages.push(messagePayload);
            session.lastActiveTime = Date.now();
          }
          ws.send(JSON.stringify({ type: 'message_ack', data: messagePayload }));

          // 如果当前是人工客服接待：转推给坐席
          if (session && !session.isAiHandled && session.agentId !== 'ai_bot') {
            const agent = tCtx.agentsMap.get(session.agentId);
            if (agent && agent.ws.readyState === WebSocket.OPEN) {
              agent.ws.send(JSON.stringify({
                type: 'chat_message',
                data: messagePayload
              }));
            }
          }
          // 如果当前是 AI 智能客服托管接待！
          else if (session && session.isAiHandled) {
            // 同步推送给坐席工作台围观
            broadcastToTenantAgents(currentTenantId, {
              type: 'chat_message',
              data: messagePayload
            });

            // 触发 AI 引擎生成精准回复
            const aiResp = await aiService.generateReply({
              tenantId: currentTenantId,
              query: text,
              conversationHistory: session.messages
            });

            // 如果 AI 判定需要转接人工
            if (aiResp.shouldTransferToHuman) {
              const bestAgent = findBestOnlineAgent(currentTenantId);
              if (bestAgent) {
                // 转接成功
                session.isAiHandled = false;
                session.agentId = bestAgent.info.id;
                session.agentName = bestAgent.info.name;
                const visitor = tCtx.visitorsMap.get(clientId);
                if (visitor) {
                  visitor.assignedAgentId = bestAgent.info.id;
                  visitor.isAiHandled = false;
                }
                bestAgent.activeChats.add(clientId);

                // 发送转接提示
                const transferMsg = {
                  id: 'msg_tf_' + Date.now(),
                  from: 'system',
                  fromRole: 'system',
                  to: clientId,
                  text: `已为您转接至人工客服【${bestAgent.info.name}】！`,
                  time: new Date().toLocaleTimeString()
                };
                session.messages.push(transferMsg);
                ws.send(JSON.stringify({ type: 'chat_message', data: transferMsg }));

                bestAgent.ws.send(JSON.stringify({
                  type: 'chat_transferred_in',
                  data: {
                    visitorId: clientId,
                    visitorInfo: visitor.info,
                    session,
                    fromAgentName: 'AI智能客服'
                  }
                }));
                return;
              }
            }

            // 发送 AI 的解答
            const aiReplyPayload = {
              id: 'msg_ai_' + Date.now(),
              from: 'ai_bot',
              fromRole: 'agent',
              isAi: true,
              to: clientId,
              text: aiResp.text,
              tokensUsed: aiResp.tokensUsed,
              time: new Date().toLocaleTimeString()
            };
            session.messages.push(aiReplyPayload);
            session.lastActiveTime = Date.now();

            // 回复访客
            ws.send(JSON.stringify({
              type: 'chat_message',
              data: aiReplyPayload
            }));

            // 同步给坐席观察
            broadcastToTenantAgents(currentTenantId, {
              type: 'chat_message',
              data: aiReplyPayload
            });
          }

        } else if (clientRole === 'agent') {
          // 坐席发给访客
          const session = tCtx.activeSessions.get(to);
          if (session) {
            session.messages.push(messagePayload);
            session.lastActiveTime = Date.now();
          }
          const visitor = tCtx.visitorsMap.get(to);
          if (visitor && visitor.ws.readyState === WebSocket.OPEN) {
            visitor.ws.send(JSON.stringify({
              type: 'chat_message',
              data: messagePayload
            }));
          }
          ws.send(JSON.stringify({ type: 'message_ack', data: messagePayload }));
        }
      }

    } catch (e) {
      console.error('WebSocket 处理异常:', e);
    }
  });

  ws.on('close', () => {
    if (!currentTenantId) return;
    const tCtx = getTenantContext(currentTenantId);

    if (clientRole === 'agent' && clientId) {
      store.updateAgentStatus(currentTenantId, clientId, 'offline');
      tCtx.agentsMap.delete(clientId);
      broadcastToTenantAgents(currentTenantId, {
        type: 'agent_offline',
        data: { agentId: clientId }
      });
      console.log(`[客服离线] 坐席 ${clientId} 断开`);
    } else if (clientRole === 'visitor' && clientId) {
      const v = tCtx.visitorsMap.get(clientId);
      if (v && v.assignedAgentId && v.assignedAgentId !== 'ai_bot') {
        const agent = tCtx.agentsMap.get(v.assignedAgentId);
        if (agent && agent.ws.readyState === WebSocket.OPEN) {
          agent.ws.send(JSON.stringify({
            type: 'visitor_left',
            data: { visitorId: clientId, name: v.info.name }
          }));
        }
      }
      tCtx.visitorsMap.delete(clientId);
      broadcastToTenantAgents(currentTenantId, {
        type: 'visitor_left_all',
        data: { visitorId: clientId }
      });
      console.log(`[访客离开] 访客 ${clientId} 离开`);
    }
  });
});

// ======================== 定时任务：心跳探测与僵尸会话回收 ========================

// 1. 每 30 秒执行 WebSocket 心跳保活探测
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// 2. 每 60 秒检查并清理超过 15 分钟无交互的离线会话，避免内存泄漏并归档历史
const sessionCleanerInterval = setInterval(() => {
  const now = Date.now();
  const EXPIRE_TIMEOUT = 15 * 60 * 1000; // 15分钟

  for (const [tenantId, tCtx] of tenantsContextMap.entries()) {
    for (const [vId, session] of tCtx.activeSessions.entries()) {
      const isVisitorOnline = tCtx.visitorsMap.has(vId);
      const lastActive = session.lastActiveTime || 0;

      if (!isVisitorOnline && (now - lastActive > EXPIRE_TIMEOUT)) {
        // 自动将会话归档存盘
        store.saveChatHistory(tenantId, session);
        tCtx.activeSessions.delete(vId);
        console.log(`[会话自动回收] 租户 ${tenantId} 访客 ${vId} 超时未活跃，已归档释放`);
      }
    }
  }
}, 60000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
  clearInterval(sessionCleanerInterval);
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` AI智客服 (AIkefu) SaaS 多租户 AI 智能客服云平台已就绪！`);
  console.log(` 平台服务端地址:  http://127.0.0.1:${PORT}`);
  console.log(` SaaS企业管理后台: http://127.0.0.1:${PORT}/console/`);
  console.log(` 访客端演示页面:  http://127.0.0.1:${PORT}/demo.html`);
  console.log(` 客服坐席工作台:  http://127.0.0.1:${PORT}/agent/index.html`);
  console.log(`=======================================================`);
});
