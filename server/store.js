const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

// 初始默认数据模型 (多租户 SaaS + AI 知识库架构)
const DEFAULT_DATA = {
  // 平台系统配置
  platformConfig: {
    freeTrialDays: 7,            // 免费试用 7 天
    initialTrialCredits: 50000,  // 初始赠送 50,000 Token 体验积分
    yearlyPrice: 199,            // 人工客服标准版 199 元/年
    creditPackages: [
      { id: 'pkg_10w', name: '10万 Token 积分包', credits: 100000, price: 19 },
      { id: 'pkg_50w', name: '50万 Token 积分包', credits: 500000, price: 79 },
      { id: 'pkg_200w', name: '200万 Token 积分包', credits: 2000000, price: 249 }
    ],
    // 默认大模型配置 (支持 DeepSeek / 通义千问 / OpenAI 兼容接口)
    llmConfig: {
      provider: 'openai_compatible',
      baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1',
      apiKey: process.env.LLM_API_KEY || '',
      model: 'deepseek-chat',
      temperature: 0.3
    }
  },

  // 多租户企业集合
  tenants: [
    {
      tenantId: 'tenant_default',
      appKey: 'app_demo888',
      companyName: '智邦云端科技 (演示租户)',
      contactName: '张经理',
      phone: '13800138000',
      email: 'admin@zhibang.com',
      password: 'admin', // 演示租户密码
      createdAt: new Date().toISOString(),

      // 订阅与计费状态
      subscription: {
        status: 'active', // 'trial', 'active', 'expired'
        trialExpiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        hasManualPlan: true, // 已购买 199 元人工版年费
        manualPlanExpiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
        aiCredits: 50000,     // 剩余积分 (Token)
        totalCreditsUsed: 3600
      },

      // 专属 AI 客服人设配置
      aiConfig: {
        enabled: true,
        mode: 'ai_first', // 'ai_first' (优先AI), 'hybrid' (离线/忙碌时托管), 'manual_only'
        botName: '小智 (AI智能客服)',
        botAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=ai_zhibang',
        greeting: '您好！我是智邦云端科技的 AI 智能客服小智，7×24 小时为您服务。请问有什么可以帮您？',
        promptSystem: '你是智邦云端科技的官方专属AI智能客服，负责解答客户关于产品方案、定价收费、售后服务等咨询。请严格根据给定的【企业专属知识库】作答，语气热情、客观、专业。如果知识库中没有明确答案，请礼貌告知并建议客户转接人工客服，切勿编造虚假信息。',
        transferKeywords: ['人工', '转人工', '真人', '找客服', '投诉', '退款', '人工客服'],
        autoTransferOnUnknown: true // 遇到无法回答的问题时自动尝试转人工
      },

      // 专属知识库 (FAQ 问答对与企业业务手册)
      knowledgeBase: [
        {
          id: 'kb_1',
          question: '你们的产品价格和收费标准是怎样的？',
          answer: '我们提供两种接入套餐：1. 人工在线客服版仅需 199元/年，支持全功能客服工作台、多坐席接待与访客打字预知；2. AI 智能托管客服，按 Token 积分计费，积分用完可随时充值加油包。每个新注册用户可免费享受 7 天全功能体验！'
        },
        {
          id: 'kb_2',
          question: '网站如何接入客服系统？难不难？',
          answer: '非常简单！只需将系统为您生成的专属 <script src="http://127.0.0.1:8080/widget.js?appKey=app_demo888"></script> 代码复制并粘贴到您的网站 HTML 页面中，即可在右下角立刻拥有专属在线客服，零代码开发！'
        },
        {
          id: 'kb_3',
          question: '客服系统支持手机端和 Windows 客户端吗？',
          answer: '完全支持！我们提供专属的 Windows 原生独立客服工作台，支持系统托盘、新消息声音与闪烁提醒、全站访客实时雷达与打字实时预知。同时也支持任意浏览器随时随地登录接待。'
        },
        {
          id: 'kb_4',
          question: 'AI 托管客服是什么意思？下班后能用吗？',
          answer: 'AI 托管客服支持 7×24 小时不间断在线值守。当您的坐席下班或离开时，AI 会严格依照您上传的企业知识库自动解答访客的所有咨询。坐席上线后也可随时一键接管会话！'
        }
      ],

      // 租户下的坐席工号
      agents: [
        {
          id: '1001',
          username: 'agent01',
          name: '小邦（资深坐席）',
          password: '123456',
          avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=agent01',
          status: 'offline',
          maxChats: 10
        },
        {
          id: '1002',
          username: 'agent02',
          name: '小爱（售后专员）',
          password: '123456',
          avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=agent02',
          status: 'offline',
          maxChats: 10
        }
      ],

      // 常用快捷话术
      cannedMessages: [
        {
          category: '常用问候',
          items: [
            { id: 'c1', title: '标准欢迎语', content: '您好！欢迎访问我们网站，请问有什么可以帮您的？' },
            { id: 'c2', title: '节日问候', content: '您好，祝您工作愉快！请问今天想咨询哪方面的内容？' }
          ]
        },
        {
          category: '结束语',
          items: [
            { id: 'c9', title: '标准道别', content: '感谢您的咨询，如果您还有其他问题，随时联系我们，祝您生活愉快！' }
          ]
        }
      ],

      // 消耗统计与历史
      tokenDailyUsage: {
        // "2026-11-08": 1800
      },
      offlineMessages: [],
      chatHistory: []
    }
  ]
};

class Store {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        // 如果旧数据没有 tenants，执行自动迁移
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

  // ----------------- 多租户核心管理 -----------------

  getTenantById(tenantId) {
    return this.data.tenants.find(t => t.tenantId === tenantId);
  }

  getTenantByAppKey(appKey) {
    if (!appKey) return this.data.tenants[0]; // 默认兜底
    return this.data.tenants.find(t => t.appKey === appKey) || this.data.tenants[0];
  }

  getTenantByEmailOrPhone(account) {
    return this.data.tenants.find(t => t.email === account || t.phone === account);
  }

  // 租户注册：开通 7 天试用与赠送体验积分
  registerTenant({ companyName, contactName, phone, email, password }) {
    if (this.getTenantByEmailOrPhone(phone) || (email && this.getTenantByEmailOrPhone(email))) {
      throw new Error('该手机号或邮箱已注册过企业账号');
    }

    const tenantId = 't_' + Date.now();
    const appKey = 'app_' + Math.random().toString(36).substring(2, 10);
    const trialDays = this.data.platformConfig.freeTrialDays || 7;
    const initialCredits = this.data.platformConfig.initialTrialCredits || 50000;

    const newTenant = {
      tenantId,
      appKey,
      companyName,
      contactName,
      phone,
      email,
      password,
      createdAt: new Date().toISOString(),
      subscription: {
        status: 'trial',
        trialExpiresAt: new Date(Date.now() + trialDays * 24 * 3600 * 1000).toISOString(),
        hasManualPlan: true, // 试用期默认包含人工功能
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
          password: '123456',
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
      tokenDailyUsage: {},
      offlineMessages: [],
      chatHistory: []
    };

    this.data.tenants.push(newTenant);
    this.save();
    return newTenant;
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

    // 计算日均消耗 (若尚无业务数据，默认按冷启动每天 2000 token 评估)
    let avgDaily = daysCount > 0 ? Math.round(totalTokensRecent / daysCount) : 2000;
    if (avgDaily <= 0) avgDaily = 1500;

    const estimatedDays = Math.max(1, Math.round(credits / avgDaily));

    // 计算试用期剩余时间
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

  // 扣除租户 AI Token 积分并记录消耗
  deductTokens(tenantId, tokens) {
    const tenant = this.getTenantById(tenantId);
    if (!tenant) return false;

    if (!tenant.subscription.aiCredits) tenant.subscription.aiCredits = 0;
    tenant.subscription.aiCredits = Math.max(0, tenant.subscription.aiCredits - tokens);
    tenant.subscription.totalCreditsUsed = (tenant.subscription.totalCreditsUsed || 0) + tokens;

    // 记录今日消耗
    const today = new Date().toISOString().substring(0, 10);
    if (!tenant.tokenDailyUsage) tenant.tokenDailyUsage = {};
    tenant.tokenDailyUsage[today] = (tenant.tokenDailyUsage[today] || 0) + tokens;

    this.save();
    return tenant.subscription.aiCredits;
  }

  // 充值购买积分包
  addCredits(tenantId, amount) {
    const tenant = this.getTenantById(tenantId);
    if (!tenant) return null;
    tenant.subscription.aiCredits = (tenant.subscription.aiCredits || 0) + amount;
    this.save();
    return tenant.subscription.aiCredits;
  }

  // 开通/续费 199 元人工客服年费套餐
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

  // ----------------- 坐席与消息管理 (按租户) -----------------

  getAgent(tenantId, idOrUsername) {
    const tenant = this.getTenantById(tenantId);
    if (!tenant) return null;
    return tenant.agents.find(a => a.id === idOrUsername || a.username === idOrUsername);
  }

  verifyAgent(tenantId, username, password) {
    const agent = this.getAgent(tenantId, username);
    if (agent && agent.password === password) {
      return agent;
    }
    return null;
  }

  updateAgentStatus(tenantId, agentId, status) {
    const agent = this.getAgent(tenantId, agentId);
    if (agent) {
      agent.status = status;
      this.save();
    }
  }

  // ----------------- 知识库与话术管理 -----------------

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
