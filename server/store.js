const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

// 初始默认数据
const DEFAULT_DATA = {
  agents: [
    {
      id: '1001',
      username: 'agent01',
      name: '小邦（资深客服）',
      password: '123456',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=agent01',
      status: 'offline', // online, busy, away, offline
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
    },
    {
      id: 'admin',
      username: 'admin',
      name: '客服主管 (Admin)',
      password: 'admin888',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=admin',
      status: 'offline',
      maxChats: 20
    }
  ],
  cannedMessages: [
    {
      category: '常用问候',
      items: [
        { id: 'c1', title: '标准欢迎语', content: '您好！欢迎访问我们网站，请问有什么可以帮您的？' },
        { id: 'c2', title: '节日问候', content: '您好，祝您工作愉快！请问今天想咨询哪方面的内容？' },
        { id: 'c3', title: '主动咨询', content: '看您关注这个页面很久了，需要我为您做个简短介绍吗？' }
      ]
    },
    {
      category: '业务与价格',
      items: [
        { id: 'c4', title: '产品报价', content: '我们的企业版支持多坐席接入与自定义配置，当前可享受限时折扣活动。' },
        { id: 'c5', title: '试用开通', content: '您可以留下您的称呼和联系电话，我稍后为您开通免费试用账号。' },
        { id: 'c6', title: '部署咨询', content: '我们支持公有云部署与私有化独立部署，数据完全自主可控。' }
      ]
    },
    {
      category: '礼貌等待与转接',
      items: [
        { id: 'c7', title: '稍等片刻', content: '请您稍候，我正在为您核查相关资料，大约需要1分钟。' },
        { id: 'c8', title: '技术转接', content: '针对您咨询的高级技术问题，我正在为您转接高级技术工程师，请稍候。' }
      ]
    },
    {
      category: '结束语',
      items: [
        { id: 'c9', title: '标准道别', content: '感谢您的咨询，如果您还有其他问题，随时联系我们，祝您生活愉快！' },
        { id: 'c10', title: '满意度邀请', content: '本次服务即将结束，若您对我的解答满意，请在窗口右上角为我点个好评，谢谢！' }
      ]
    }
  ],
  offlineMessages: [],
  blacklist: [],
  chatHistory: [] // 历史会话及消息记录
};

class Store {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        return Object.assign({}, DEFAULT_DATA, JSON.parse(raw));
      }
    } catch (e) {
      console.error('加载 data.json 失败，使用默认配置:', e);
    }
    this.save(DEFAULT_DATA);
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }

  save(data = this.data) {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('保存 data.json 失败:', e);
    }
  }

  getAgent(idOrUsername) {
    return this.data.agents.find(a => a.id === idOrUsername || a.username === idOrUsername);
  }

  verifyAgent(username, password) {
    const agent = this.getAgent(username);
    if (agent && agent.password === password) {
      return agent;
    }
    return null;
  }

  updateAgentStatus(agentId, status) {
    const agent = this.getAgent(agentId);
    if (agent) {
      agent.status = status;
      this.save();
    }
  }

  getCannedMessages() {
    return this.data.cannedMessages;
  }

  addCannedMessage(category, title, content) {
    let cat = this.data.cannedMessages.find(c => c.category === category);
    if (!cat) {
      cat = { category, items: [] };
      this.data.cannedMessages.push(cat);
    }
    const id = 'c_' + Date.now();
    cat.items.push({ id, title, content });
    this.save();
    return { id, title, content };
  }

  deleteCannedMessage(id) {
    for (const cat of this.data.cannedMessages) {
      const idx = cat.items.findIndex(i => i.id === id);
      if (idx !== -1) {
        cat.items.splice(idx, 1);
        this.save();
        return true;
      }
    }
    return false;
  }

  addOfflineMessage(msg) {
    this.data.offlineMessages.unshift({
      id: 'om_' + Date.now(),
      createTime: new Date().toISOString(),
      ...msg
    });
    // 保留最新 500 条
    if (this.data.offlineMessages.length > 500) {
      this.data.offlineMessages.pop();
    }
    this.save();
  }

  saveChatHistory(session) {
    this.data.chatHistory.unshift({
      chatId: session.id,
      visitorId: session.visitorId,
      visitorName: session.visitorName,
      agentId: session.agentId,
      agentName: session.agentName,
      startTime: session.startTime,
      endTime: new Date().toISOString(),
      messages: session.messages || [],
      tracks: session.tracks || []
    });
    // 保留最近 1000 场对话
    if (this.data.chatHistory.length > 1000) {
      this.data.chatHistory.pop();
    }
    this.save();
  }

  getHistoryChats(limit = 50) {
    return this.data.chatHistory.slice(0, limit);
  }
}

module.exports = new Store();
