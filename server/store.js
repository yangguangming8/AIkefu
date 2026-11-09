const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, 'data.json');
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'aikefu_cloud_sec_token_2026_@#!';

// 安全哈希密码工具
function hashPassword(password, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, storedHash, salt) {
  if (!salt) {
    // 兼容老数据明文平滑过渡
    return password === storedHash;
  }
  const calcHash = crypto.pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex');
  return calcHash === storedHash;
}

// 初始默认数据模型
const DEFAULT_DATA = {
  platformConfig: {
    freeTrialDays: 7,
    initialTrialCredits: 50000,
    yearlyPrice: 199,
    creditPackages: [
      { id: 'pkg_10w', name: '10万 Token 积分包', credits: 100000, price: 19 },
      { id: 'pkg_50w', name: '50万 Token 积分包', credits: 500000, price: 79 },
      { id: 'pkg_200w', name: '200万 Token 积分包', credits: 2000000, price: 249 }
    ],
    llmConfig: {
      provider: 'openai_compatible',
      baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1',
      apiKey: process.env.LLM_API_KEY || '',
      model: 'deepseek-chat',
      temperature: 0.3
    }
  },
  tenants: [
    {
      tenantId: 'tenant_default',
      appKey: 'app_demo888',
      companyName: '智邦云端科技 (演示租户)',
      contactName: '张经理',
      phone: '13800138000',
      email: 'admin@zhibang.com',
      passwordHash: hashPassword('admin', 'salt_admin_demo').hash,
      passwordSalt: 'salt_admin_demo',
      createdAt: new Date().toISOString(),
      subscription: {
        status: 'active',
        trialExpiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        hasManualPlan: true,
        manualPlanExpiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
        aiCredits: 50000,
        totalCreditsUsed: 0
      },
      aiConfig: {
        enabled: true,
        mode: 'ai_first',
        botName: '小智 (AI智能客服)',
        botAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=ai_zhibang',
        greeting: '您好！我是智邦云端科技的 AI 智能客服小智，7×24 小时为您服务。请问有什么可以帮您？',
        promptSystem: '你是智邦云端科技的官方专属AI在线客服，负责解答客户关于产品方案、定价收费、售后服务等咨询。请严格根据给定的【企业专属知识库】作答，语气热情、客观、专业。如果知识库中没有明确答案，请礼貌告知并建议客户转接人工客服，切勿编造虚假信息。',
        transferKeywords: ['人工', '转人工', '真人', '找客服', '投诉', '退款', '人工客服'],
        autoTransferOnUnknown: true
      },
      knowledgeBase: [
        {
          id: 'kb_1',
          question: '你们的产品价格和收费标准是怎样的？',
          answer: '我们提供两种接入套餐：1. 人工在线客服版仅需 199元/年，支持全功能客服工作台、多坐席接待与访客打字预知；2. AI 智能托管客服，按 Token 积分计费，积分用完可随时充值加油包。每个新注册用户可免费享受 7 天全功能体验！'
        },
        {
          id: 'kb_2',
          question: '网站如何接入客服系统？难不难？',
          answer: '非常简单！只需将系统为您生成的专属引入代码复制并粘贴到您的网站 HTML 页面中，即可在右下角立刻拥有专属在线客服，零代码开发！'
        }
      ],
      agents: [
        {
          id: '1001',
          username: 'agent01',
          name: '小邦（资深坐席）',
          passwordHash: hashPassword('123456', 'salt_agent01').hash,
          passwordSalt: 'salt_agent01',
          avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=agent01',
          status: 'offline',
          maxChats: 10
        },
        {
          id: '1002',
          username: 'agent02',
          name: '小爱（售后专员）',
          passwordHash: hashPassword('123456', 'salt_agent02').hash,
          passwordSalt: 'salt_agent02',
          avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=agent02',
          status: 'offline',
          maxChats: 10
        }
      ],
      cannedMessages: [
        {
          category: '常用问候',
          items: [{ id: 'c1', title: '标准欢迎语', content: '您好！请问有什么可以帮您的？' }]
        }
      ],
      blacklist: [],          // 黑名单 IP 与访客列表
      ratings: [],            // 满意度评价列表
      tokenDailyUsage: {},
      offlineMessages: [],
      chatHistory: []
    }
  ],
  orders: []
};

class Store {
  constructor() {
    this.hashPassword = hashPassword;
    this.verifyPassword = verifyPassword;
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed.tenants) {
          return this.migrateLegacyData(parsed);
        }
        return Object.assign({}, DEFAULT_DATA, parsed);
      }
    } catch (e) {
      console.error('加载 data.json 失败，使用默认配置:', e);
    }
    this.save(DEFAULT_DATA);
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }

  migrateLegacyData(legacy) {
    const defaultTenant = DEFAULT_DATA.tenants[0];
    if (legacy.agents) defaultTenant.agents = legacy.agents;
    if (legacy.cannedMessages) defaultTenant.cannedMessages = legacy.cannedMessages;
    if (legacy.chatHistory) defaultTenant.chatHistory = legacy.chatHistory;
    if (legacy.offlineMessages) defaultTenant.offlineMessages = legacy.offlineMessages;
    DEFAULT_DATA.tenants = [defaultTenant];
    this.save(DEFAULT_DATA);
    return DEFAULT_DATA;
  }

  save(data = this.data) {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('保存 data.json 失败:', e);
    }
  }

  // ----------------- 安全 Token 颁发与验证 -----------------

  signToken(payload, expiresInSeconds = 7 * 24 * 3600) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const fullPayload = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
    const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(`${header}.${fullPayload}`).digest('base64url');
    return `${header}.${fullPayload}.${signature}`;
  }

  verifyToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payloadB64, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(`${header}.${payloadB64}`).digest('base64url');
    if (signature !== expectedSig) return null;

    try {
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return null; // 过期
      }
      return payload;
    } catch (e) {
      return null;
    }
  }

  // ----------------- 多租户核心管理 -----------------

  getTenantById(tenantId) {
    return this.data.tenants.find(t => t.tenantId === tenantId);
  }

  getTenantByAppKey(appKey) {
    if (!appKey) return this.data.tenants[0];
    return this.data.tenants.find(t => t.appKey === appKey) || this.data.tenants[0];
  }

  getTenantByEmailOrPhone(account) {
    return this.data.tenants.find(t => t.email === account || t.phone === account);
  }

  // 租户注册：密码加盐安全哈希存储
  registerTenant({ companyName, contactName, phone, email, password }) {
    if (this.getTenantByEmailOrPhone(phone) || (email && this.getTenantByEmailOrPhone(email))) {
      throw new Error('该手机号或邮箱已注册过企业账号');
    }

    const tenantId = 't_' + Date.now();
    const appKey = 'app_' + Math.random().toString(36).substring(2, 10);
    const trialDays = this.data.platformConfig.freeTrialDays || 7;
    const initialCredits = this.data.platformConfig.initialTrialCredits || 50000;

    const { hash, salt } = hashPassword(password);

    const newTenant = {
      tenantId,
      appKey,
      companyName,
      contactName,
      phone,
      email,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: new Date().toISOString(),
      subscription: {
        status: 'trial',
        trialExpiresAt: new Date(Date.now() + trialDays * 24 * 3600 * 1000).toISOString(),
        hasManualPlan: true,
        manualPlanExpiresAt: new Date(Date.now() + trialDays * 24 * 3600 * 1000).toISOString(),
        aiCredits: initialCredits,
        totalCreditsUsed: 0
      },
      aiConfig: {
        enabled: true,
        mode: 'ai_first',
        botName: companyName ? `${companyName} AI助理` : '智能客服小助手',
        botAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=' + tenantId,
        greeting: `您好！欢迎访问${companyName}，我是您的专属 AI 客服，请问有什么可以帮助您的？`,
        promptSystem: `你是${companyName}的官方AI在线客服。请严格根据下方给出的【企业知识库】热情、客观、准确地回答客户问题。切勿捏造虚假信息。若知识库无相关信息，请引导客户转接人工客服。`,
        transferKeywords: ['人工', '转人工', '真人', '找客服', '投诉', '退款'],
        autoTransferOnUnknown: true
      },
      knowledgeBase: [
        {
          id: 'kb_' + Date.now() + '_1',
          question: '请问你们的客服工作时间？',
          answer: '我们提供 7×24 小时在线智能应答服务，人工坐席在线时间为周一至周五 9:00 - 18:00。'
        }
      ],
      agents: [
        {
          id: '1001',
          username: 'agent01',
          name: '主班客服',
          passwordHash: hashPassword('123456', 'salt_ag_' + tenantId).hash,
          passwordSalt: 'salt_ag_' + tenantId,
          avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=' + tenantId + '_ag',
          status: 'offline',
          maxChats: 10
        }
      ],
      cannedMessages: [
        {
          category: '常用问候',
          items: [{ id: 'c1', title: '标准欢迎语', content: '您好！请问有什么可以帮您的？' }]
        }
      ],
      blacklist: [],
      ratings: [],
      tokenDailyUsage: {},
      offlineMessages: [],
      chatHistory: []
    };

    this.data.tenants.push(newTenant);
    this.save();
    return newTenant;
  }

  // 验证租户管理员密码
  verifyTenantLogin(account, password) {
    const tenant = this.getTenantByEmailOrPhone(account) || (account === 'admin' ? this.data.tenants[0] : null);
    if (!tenant) return null;

    const ok = verifyPassword(password, tenant.passwordHash || tenant.password, tenant.passwordSalt);
    if (ok) return tenant;
    return null;
  }

  // 验证客服坐席密码
  verifyAgent(tenantId, username, password) {
    const tenant = this.getTenantById(tenantId);
    if (!tenant) return null;
    const agent = tenant.agents.find(a => a.id === username || a.username === username);
    if (!agent) return null;

    const ok = verifyPassword(password, agent.passwordHash || agent.password, agent.passwordSalt);
    if (ok) return agent;
    return null;
  }

  // 计算积分消耗预测：根据近 7 天日均消耗，预估可用天数
  calculateCreditEstimate(tenant) {
    const credits = tenant.subscription.aiCredits || 0;
    const dailyStats = tenant.tokenDailyUsage || {};
    const dates = Object.keys(dailyStats).sort();

    let totalTokensRecent = 0;
    let daysCount = 0;
    const recentDates = dates.slice(-7);
    recentDates.forEach(d => {
      totalTokensRecent += dailyStats[d] || 0;
      daysCount++;
    });

    let avgDaily = daysCount > 0 ? Math.round(totalTokensRecent / daysCount) : 2000;
    if (avgDaily <= 0) avgDaily = 1500;

    const estimatedDays = Math.max(1, Math.round(credits / avgDaily));

    const now = Date.now();
    const trialEnd = new Date(tenant.subscription.trialExpiresAt).getTime();
    const trialRemainingHours = Math.max(0, Math.round((trialEnd - now) / (1000 * 3600)));
    const trialRemainingDays = (trialRemainingHours / 24).toFixed(1);

    return {
      currentCredits: credits,
      avgDailyConsumption: avgDaily,
      estimatedRemainingDays: estimatedDays,
      trialRemainingHours,
      trialRemainingDays,
      isTrialExpired: now > trialEnd && !tenant.subscription.hasManualPlan
    };
  }

  deductTokens(tenantId, tokens) {
    const tenant = this.getTenantById(tenantId);
    if (!tenant) return false;

    if (!tenant.subscription.aiCredits) tenant.subscription.aiCredits = 0;
    tenant.subscription.aiCredits = Math.max(0, tenant.subscription.aiCredits - tokens);
    tenant.subscription.totalCreditsUsed = (tenant.subscription.totalCreditsUsed || 0) + tokens;

    const today = new Date().toISOString().substring(0, 10);
    if (!tenant.tokenDailyUsage) tenant.tokenDailyUsage = {};
    tenant.tokenDailyUsage[today] = (tenant.tokenDailyUsage[today] || 0) + tokens;

    this.save();
    return tenant.subscription.aiCredits;
  }

  addCredits(tenantId, amount) {
    const tenant = this.getTenantById(tenantId);
    if (!tenant) return null;
    tenant.subscription.aiCredits = (tenant.subscription.aiCredits || 0) + amount;
    this.save();
    return tenant.subscription.aiCredits;
  }

  renewManualPlan(tenantId) {
    const tenant = this.getTenantById(tenantId);
    if (!tenant) return null;

    tenant.subscription.status = 'active';
    tenant.subscription.hasManualPlan = true;
    const currentExpire = new Date(tenant.subscription.manualPlanExpiresAt || Date.now()).getTime();
    const baseTime = currentExpire > Date.now() ? currentExpire : Date.now();
    tenant.subscription.manualPlanExpiresAt = new Date(baseTime + 365 * 24 * 3600 * 1000).toISOString();

    this.save();
    return tenant.subscription;
  }

  updateAgentStatus(tenantId, agentId, status) {
    const tenant = this.getTenantById(tenantId);
    if (!tenant) return;
    const agent = tenant.agents.find(a => a.id === agentId);
    if (agent) {
      agent.status = status;
      this.save();
    }
  }

  // ----------------- 黑名单机制 -----------------

  isBlacklisted(tenantId, ip, visitorId) {
    const tenant = this.getTenantById(tenantId);
    if (!tenant || !tenant.blacklist) return false;
    return tenant.blacklist.some(b => (ip && b.ip === ip) || (visitorId && b.visitorId === visitorId));
  }

  addBlacklist(tenantId, { ip, visitorId, reason = '恶意骚扰' }) {
    const tenant = this.getTenantById(tenantId);
    if (!tenant) return false;
    if (!tenant.blacklist) tenant.blacklist = [];
    
    // 避免重复拉黑
    if (!this.isBlacklisted(tenantId, ip, visitorId)) {
      tenant.blacklist.unshift({
        id: 'bl_' + Date.now(),
        ip,
        visitorId,
        reason,
        createdAt: new Date().toISOString()
      });
      this.save();
    }
    return true;
  }

  removeBlacklist(tenantId, blacklistId) {
    const tenant = this.getTenantById(tenantId);
    if (!tenant || !tenant.blacklist) return false;
    const idx = tenant.blacklist.findIndex(b => b.id === blacklistId || b.ip === blacklistId);
    if (idx !== -1) {
      tenant.blacklist.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }

  // ----------------- 满意度评价机制 -----------------

  addRating(tenantId, { visitorId, visitorName, agentId, stars, tags = [], comment = '', chatId }) {
    const tenant = this.getTenantById(tenantId);
    if (!tenant) return null;
    if (!tenant.ratings) tenant.ratings = [];

    const record = {
      id: 'rt_' + Date.now(),
      chatId,
      visitorId,
      visitorName,
      agentId,
      stars: Math.max(1, Math.min(5, parseInt(stars, 10) || 5)),
      tags,
      comment,
      createdAt: new Date().toISOString()
    };
    tenant.ratings.unshift(record);

    // 同步到历史会话记录中
    if (tenant.chatHistory && chatId) {
      const chat = tenant.chatHistory.find(c => c.chatId === chatId);
      if (chat) {
        chat.rating = record;
      }
    }

    this.save();
    return record;
  }

  getRatings(tenantId) {
    const tenant = this.getTenantById(tenantId);
    if (!tenant) return [];
    return tenant.ratings || [];
  }

  // ----------------- 知识库管理 -----------------

  addKnowledgeItem(tenantId, question, answer) {
    const tenant = this.getTenantById(tenantId);
    if (!tenant) return null;
    const item = {
      id: 'kb_' + Date.now(),
      question,
      answer,
      createdAt: new Date().toISOString()
    };
    if (!tenant.knowledgeBase) tenant.knowledgeBase = [];
    tenant.knowledgeBase.unshift(item);
    this.save();
    return item;
  }

  deleteKnowledgeItem(tenantId, kbId) {
    const tenant = this.getTenantById(tenantId);
    if (!tenant || !tenant.knowledgeBase) return false;
    const idx = tenant.knowledgeBase.findIndex(k => k.id === kbId);
    if (idx !== -1) {
      tenant.knowledgeBase.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }

  saveChatHistory(tenantId, session) {
    const tenant = this.getTenantById(tenantId);
    if (!tenant) return;
    if (!tenant.chatHistory) tenant.chatHistory = [];
    tenant.chatHistory.unshift({
      chatId: session.id,
      visitorId: session.visitorId,
      visitorName: session.visitorName,
      agentId: session.agentId,
      agentName: session.agentName,
      isAiHandled: session.isAiHandled || false,
      startTime: session.startTime,
      endTime: new Date().toISOString(),
      messages: session.messages || [],
      tracks: session.tracks || []
    });
    if (tenant.chatHistory.length > 500) tenant.chatHistory.pop();
    this.save();
  }

  addOfflineMessage(tenantId, msg) {
    const tenant = this.getTenantById(tenantId);
    if (!tenant) return;
    if (!tenant.offlineMessages) tenant.offlineMessages = [];
    tenant.offlineMessages.unshift({
      id: 'om_' + Date.now(),
      createTime: new Date().toISOString(),
      ...msg
    });
    if (tenant.offlineMessages.length > 300) tenant.offlineMessages.pop();
    this.save();
  }
}

module.exports = new Store();
