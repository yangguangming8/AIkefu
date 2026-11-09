// ======================== 全局状态与变量 ========================
let currentAgent = null;
let currentServer = 'http://127.0.0.1:8080';
let ws = null;
let soundEnabled = true;

// 数据集
let activeChatsMap = new Map();   // visitorId -> { visitorInfo, messages: [], unread: 0, typingText: '' }
let visitorRadarMap = new Map();  // visitorId -> visitorInfo
let cannedCategories = [];        // 话术库
let currentSelectedVisitorId = null;
let currentLeftTab = 'activeChats'; // 'activeChats' | 'visitorRadar' | 'offlineMsgs' | 'historyChats'

// ======================== Web Audio 纯代码合成提示音 ========================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type = 'message') {
  if (!soundEnabled) return;
  try {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'message') {
      // 叮咚双音提示
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } else if (type === 'visitor') {
      // 访客进入提示音 (轻柔水滴声)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    }
  } catch (e) {
    console.warn('声音播放异常:', e);
  }
}

// ======================== DOM 元素引用 ========================
const loginOverlay = document.getElementById('loginOverlay');
const loginServer = document.getElementById('loginServer');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const btnDoLogin = document.getElementById('btnDoLogin');

const currentAgentName = document.getElementById('currentAgentName');
const agentStatusSelect = document.getElementById('agentStatusSelect');
const btnSoundToggle = document.getElementById('btnSoundToggle');
const soundIcon = document.getElementById('soundIcon');
const soundText = document.getElementById('soundText');
const btnLogout = document.getElementById('btnLogout');

const statVisitorsCount = document.getElementById('statVisitorsCount');
const statActiveChats = document.getElementById('statActiveChats');

const tabContentList = document.getElementById('tabContentList');
const tabActiveChats = document.getElementById('tabActiveChats');
const tabVisitorRadar = document.getElementById('tabVisitorRadar');
const tabOfflineMsgs = document.getElementById('tabOfflineMsgs');
const tabHistoryChats = document.getElementById('tabHistoryChats');
const badgeActiveCount = document.getElementById('badgeActiveCount');
const badgeRadarCount = document.getElementById('badgeRadarCount');

const currentChatVisitorName = document.getElementById('currentChatVisitorName');
const currentChatVisitorTags = document.getElementById('currentChatVisitorTags');
const chatTopActions = document.getElementById('chatTopActions');
const btnTransfer = document.getElementById('btnTransfer');
const btnEndChat = document.getElementById('btnEndChat');
const btnBlockVisitor = document.getElementById('btnBlockVisitor');
const transferModal = document.getElementById('transferModal');
const transferAgentList = document.getElementById('transferAgentList');
const btnCloseTransferModal = document.getElementById('btnCloseTransferModal');

const messagesFlow = document.getElementById('messagesFlow');
const typingPreviewBar = document.getElementById('typingPreviewBar');
const typingPreviewText = document.getElementById('typingPreviewText');
const chatEditorPanel = document.getElementById('chatEditorPanel');
const agentInputBox = document.getElementById('agentInputBox');
const btnAgentSend = document.getElementById('btnAgentSend');
const btnClearScreen = document.getElementById('btnClearScreen');
const clientImageUpload = document.getElementById('clientImageUpload');

// 右侧面板
const tabProfile = document.getElementById('tabProfile');
const tabCanned = document.getElementById('tabCanned');
const panelProfile = document.getElementById('panelProfile');
const panelCanned = document.getElementById('panelCanned');
const cannedAccordion = document.getElementById('cannedAccordion');
const cannedSearch = document.getElementById('cannedSearch');
const btnAddCannedDialog = document.getElementById('btnAddCannedDialog');

const btnTakeover = document.getElementById('btnTakeover');
const btnReleaseToAi = document.getElementById('btnReleaseToAi');
const loginAppKey = document.getElementById('loginAppKey');

// 画像字段
const vpName = document.getElementById('vpName');
const vpIp = document.getElementById('vpIp');
const vpCity = document.getElementById('vpCity');
const vpTime = document.getElementById('vpTime');
const vpReferrer = document.getElementById('vpReferrer');
const vpSearch = document.getElementById('vpSearch');
const vpPage = document.getElementById('vpPage');
const vpAgent = document.getElementById('vpAgent');
const vpTimeline = document.getElementById('vpTimeline');

// ======================== 登录与连接逻辑 ========================

btnDoLogin.onclick = async () => {
  const server = loginServer.value.trim().replace(/\/+$/, '');
  const username = loginUsername.value.trim();
  const password = loginPassword.value.trim();

  if (!username || !password) {
    alert('请输入工号和密码');
    return;
  }

  currentServer = server;

  const appKey = (loginAppKey && loginAppKey.value.trim()) || 'app_demo888';

  try {
    btnDoLogin.innerText = '正在验证并连接...';
    btnDoLogin.disabled = true;

    const res = await fetch(`${currentServer}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, appKey })
    });
    const result = await res.json();

    if (result.code !== 0) {
      alert(result.message || '登录失败');
      btnDoLogin.innerText = '登 录 工 作 台';
      btnDoLogin.disabled = false;
      return;
    }

    currentAgent = result.data;
    initWebSocket(username, password, appKey);

  } catch (e) {
    alert('连接服务器失败: ' + e.message);
    btnDoLogin.innerText = '登 录 工 作 台';
    btnDoLogin.disabled = false;
  }
};

function initWebSocket(username, password, appKey = 'app_demo888') {
  const wsUrl = currentServer.replace(/^http/, 'ws');
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'agent_login',
      data: { username, password, appKey }
    }));
  };

  ws.onmessage = (event) => {
    try {
      const packet = JSON.parse(event.data);
      handleServerPacket(packet);
    } catch (e) {
      console.error(e);
    }
  };

  ws.onclose = () => {
    console.warn('与服务端的连接已断开');
  };
}

function handleServerPacket(packet) {
  const { type, data } = packet;

  // 1. 登录成功
  if (type === 'agent_login_result') {
    if (data.success) {
      loginOverlay.style.display = 'none';
      currentAgentName.innerText = `${data.agent.name} (${data.agent.id})`;
      cannedCategories = data.cannedMessages || [];
      renderCannedMessages();

      // 初始化在线访客列表
      if (data.visitors) {
        data.visitors.forEach(v => visitorRadarMap.set(v.visitorId, v));
      }

      // 初始化活跃会话
      if (data.activeChats) {
        data.activeChats.forEach(c => {
          activeChatsMap.set(c.visitorId, {
            visitorInfo: c.visitorInfo,
            messages: (c.session && c.session.messages) || [],
            unread: 0,
            typingText: ''
          });
        });
      }

      updateStatsUI();
      renderCurrentLeftTab();
    } else {
      alert(data.message || '登录被拒绝');
      btnDoLogin.disabled = false;
      btnDoLogin.innerText = '登 录 工 作 台';
    }
    return;
  }

  // 2. 访客雷达：新访客浏览网站
  if (type === 'new_visitor') {
    visitorRadarMap.set(data.visitorId, data);
    playSound('visitor');
    updateStatsUI();
    if (currentLeftTab === 'visitorRadar') renderVisitorRadarList();
    return;
  }

  // 3. 访客轨迹更新
  if (type === 'visitor_navigation_updated') {
    const v = visitorRadarMap.get(data.visitorId);
    if (v) {
      v.currentPage = data.currentPage;
      v.pageTitle = data.pageTitle;
      v.tracks = data.tracks;
    }
    const chat = activeChatsMap.get(data.visitorId);
    if (chat) {
      chat.visitorInfo.currentPage = data.currentPage;
      chat.visitorInfo.pageTitle = data.pageTitle;
      chat.visitorInfo.tracks = data.tracks;
    }
    if (currentSelectedVisitorId === data.visitorId) {
      renderVisitorProfile(chat ? chat.visitorInfo : v);
    }
    return;
  }

  // 4. 访客发起会话分配到了当前客服 (新会话接入)
  if (type === 'new_chat') {
    activeChatsMap.set(data.visitorId, {
      visitorInfo: data.visitorInfo,
      messages: (data.session && data.session.messages) || [],
      unread: 1,
      typingText: ''
    });
    playSound('message');
    notifyDesktop('新访客接入', `访客 ${data.visitorInfo.name} 正在咨询！`);
    updateStatsUI();

    // 如果还没有选择对话，自动选它
    if (!currentSelectedVisitorId) {
      selectChatVisitor(data.visitorId);
    } else {
      renderActiveChatsList();
    }
    return;
  }

  // 5. 杀手级特性：收到访客实时打字预知
  if (type === 'visitor_typing_preview') {
    const { visitorId, text } = data;
    const chat = activeChatsMap.get(visitorId);
    if (chat) {
      chat.typingText = text;
    }
    if (currentSelectedVisitorId === visitorId) {
      if (text && text.trim().length > 0) {
        typingPreviewText.innerText = text;
        typingPreviewBar.style.display = 'flex';
      } else {
        typingPreviewBar.style.display = 'none';
      }
    }
    return;
  }

  // 6. 收到新聊天消息 (来自访客)
  if (type === 'chat_message') {
    const msg = data;
    const vId = msg.from;
    let chat = activeChatsMap.get(vId);
    if (!chat) {
      // 容错处理
      chat = { visitorInfo: { name: '访客 ' + vId, visitorId: vId }, messages: [], unread: 0, typingText: '' };
      activeChatsMap.set(vId, chat);
    }

    chat.messages.push(msg);
    chat.typingText = ''; // 对方已发送，清除预知打字

    playSound('message');
    notifyDesktop(`收到来自 ${chat.visitorInfo.name} 的消息`, msg.text);

    if (currentSelectedVisitorId === vId) {
      typingPreviewBar.style.display = 'none';
      appendMessageToFlow(msg);
    } else {
      chat.unread = (chat.unread || 0) + 1;
      updateStatsUI();
      if (currentLeftTab === 'activeChats') renderActiveChatsList();
    }
    return;
  }

  // 7. 转接入会话
  if (type === 'chat_transferred_in') {
    activeChatsMap.set(data.visitorId, {
      visitorInfo: data.visitorInfo,
      messages: (data.session && data.session.messages) || [],
      unread: 1,
      typingText: ''
    });
    playSound('message');
    notifyDesktop('会话转接通知', `${data.fromAgentName} 向您转接了访客 ${data.visitorInfo.name}`);
    updateStatsUI();
    renderActiveChatsList();
    return;
  }

  // 8. 访客离开/关闭网页
  if (type === 'visitor_left_all' || type === 'visitor_left') {
    visitorRadarMap.delete(data.visitorId);
    updateStatsUI();
    if (currentLeftTab === 'visitorRadar') renderVisitorRadarList();
    return;
  }
}

// 桌面与托盘通知封装
function notifyDesktop(title, body) {
  if (window.electronAPI) {
    window.electronAPI.flashWindow(true);
    window.electronAPI.showNotification(title, body);
  }
}

// ======================== 左侧标签页与列表渲染 ========================

function renderCurrentLeftTab() {
  if (currentLeftTab === 'activeChats') renderActiveChatsList();
  else if (currentLeftTab === 'visitorRadar') renderVisitorRadarList();
  else if (currentLeftTab === 'offlineMsgs') renderOfflineMsgsList();
  else if (currentLeftTab === 'historyChats') renderHistoryChatsList();
}

// 渲染正在对话列表
function renderActiveChatsList() {
  tabContentList.innerHTML = '';
  if (activeChatsMap.size === 0) {
    tabContentList.innerHTML = '<div style="padding: 30px; text-align: center; color: #94a3b8; font-size: 13px;">暂无进行中的会话</div>';
    return;
  }

  activeChatsMap.forEach((chat, vId) => {
    const item = document.createElement('div');
    item.className = `list-item ${currentSelectedVisitorId === vId ? 'active' : ''}`;
    
    const lastMsg = chat.messages[chat.messages.length - 1];
    const previewText = lastMsg ? (lastMsg.msgType === 'image' ? '[图片]' : lastMsg.text) : '已接入等待沟通';
    const lastTime = lastMsg ? lastMsg.time : (chat.visitorInfo.enterTime || '');

    item.innerHTML = `
      <div class="avatar-placeholder">${chat.visitorInfo.name.substring(0, 1)}</div>
      <div class="item-content">
        <div class="item-header">
          <span class="item-title">${chat.visitorInfo.name}</span>
          <span class="item-time">${lastTime}</span>
        </div>
        <div class="item-preview">
          ${chat.unread > 0 ? `<span class="badge-unread">${chat.unread}</span>` : ''}
          ${previewText}
        </div>
      </div>
    `;

    item.onclick = () => selectChatVisitor(vId);
    tabContentList.appendChild(item);
  });
}

// 渲染全站访客监控雷达
function renderVisitorRadarList() {
  tabContentList.innerHTML = '';
  if (visitorRadarMap.size === 0) {
    tabContentList.innerHTML = '<div style="padding: 30px; text-align: center; color: #94a3b8; font-size: 13px;">当前全站暂无正在浏览的访客</div>';
    return;
  }

  visitorRadarMap.forEach((v, vId) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    const isInChat = activeChatsMap.has(vId);

    item.innerHTML = `
      <div class="avatar-placeholder" style="background: #e2e8f0; color: #475569;">👁️</div>
      <div class="item-content">
        <div class="item-header">
          <span class="item-title">${v.name}</span>
          <span class="item-time">${v.enterTime}</span>
        </div>
        <div class="item-preview">浏览: ${v.pageTitle || v.currentPage}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
          <span class="radar-tag">${v.city || '局域网'} · ${v.referrer ? '来源' : '直接'}</span>
          ${!isInChat ? `<button class="btn-action-sm" style="padding: 2px 8px; font-size: 11px; color: #1890ff;" onclick="event.stopPropagation(); inviteVisitor('${vId}')">主动邀请</button>` : '<span style="font-size: 11px; color: #52c41a;">沟通中</span>'}
        </div>
      </div>
    `;

    item.onclick = () => {
      // 可以在右侧查看该访客画像
      renderVisitorProfile(v);
    };

    tabContentList.appendChild(item);
  });
}

// 渲染离线留言
async function renderOfflineMsgsList() {
  tabContentList.innerHTML = '<div style="padding: 20px; text-align: center; color: #94a3b8;">加载中...</div>';
  try {
    const res = await fetch(`${currentServer}/api/offline-msgs`);
    const data = await res.json();
    tabContentList.innerHTML = '';
    if (!data.data || data.data.length === 0) {
      tabContentList.innerHTML = '<div style="padding: 30px; text-align: center; color: #94a3b8; font-size: 13px;">暂无离线留言记录</div>';
      return;
    }
    data.data.forEach(msg => {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div class="avatar-placeholder" style="background: #fef3c7; color: #d97706;">📝</div>
        <div class="item-content">
          <div class="item-header">
            <span class="item-title">${msg.name} (${msg.phone})</span>
            <span class="item-time">${new Date(msg.createTime).toLocaleTimeString()}</span>
          </div>
          <div class="item-preview" style="white-space: normal; margin-top: 4px; color: #374151;">${msg.content}</div>
          ${msg.email ? `<div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">邮箱: ${msg.email}</div>` : ''}
        </div>
      `;
      tabContentList.appendChild(item);
    });
  } catch (e) {
    tabContentList.innerHTML = '<div style="padding: 20px; color: red;">加载失败</div>';
  }
}

// 渲染历史会话记录
async function renderHistoryChatsList() {
  tabContentList.innerHTML = '<div style="padding: 20px; text-align: center; color: #94a3b8;">加载中...</div>';
  try {
    const res = await fetch(`${currentServer}/api/history`);
    const data = await res.json();
    tabContentList.innerHTML = '';
    if (!data.data || data.data.length === 0) {
      tabContentList.innerHTML = '<div style="padding: 30px; text-align: center; color: #94a3b8; font-size: 13px;">暂无历史会话</div>';
      return;
    }
    data.data.forEach(h => {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div class="avatar-placeholder" style="background: #f1f5f9; color: #64748b;">📜</div>
        <div class="item-content">
          <div class="item-header">
            <span class="item-title">${h.visitorName}</span>
            <span class="item-time">${new Date(h.startTime).toLocaleTimeString()}</span>
          </div>
          <div class="item-preview">接待客服: ${h.agentName} · 消息数: ${h.messages.length}</div>
        </div>
      `;
      item.onclick = () => {
        // 展示历史记录在主窗口
        currentChatVisitorName.innerText = `[历史回放] ${h.visitorName}`;
        currentChatVisitorTags.innerText = `接待客服: ${h.agentName} | 时间: ${new Date(h.startTime).toLocaleString()}`;
        chatTopActions.style.display = 'none';
        chatEditorPanel.style.display = 'none';
        typingPreviewBar.style.display = 'none';
        messagesFlow.innerHTML = '';
        h.messages.forEach(appendMessageToFlow);
      };
      tabContentList.appendChild(item);
    });
  } catch (e) {
    tabContentList.innerHTML = '<div style="padding: 20px; color: red;">加载失败</div>';
  }
}

// 主动邀请访客
window.inviteVisitor = function(visitorId) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'agent_invite_visitor',
      data: {
        visitorId,
        message: '您好！我是值班客服经理，关注到您正在了解我们产品，需要为您解答疑问吗？'
      }
    }));
    alert('已向访客发起弹窗邀请！');
  }
};

// ======================== 对话选择与消息展示 ========================

function selectChatVisitor(visitorId) {
  currentSelectedVisitorId = visitorId;
  const chat = activeChatsMap.get(visitorId);
  if (!chat) return;

  // 清除未读
  chat.unread = 0;
  updateStatsUI();

  // 更新中间顶部状态与 AI 接管控制
  const isAi = chat.session && chat.session.isAiHandled;
  if (btnTakeover && btnReleaseToAi) {
    if (isAi) {
      btnTakeover.style.display = 'inline-block';
      btnReleaseToAi.style.display = 'none';
      currentChatVisitorName.innerHTML = `${chat.visitorInfo.name} <span style="font-size: 11px; background: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 4px; font-weight: normal;">🤖 AI托管中</span>`;
    } else {
      btnTakeover.style.display = 'none';
      btnReleaseToAi.style.display = 'inline-block';
      currentChatVisitorName.innerHTML = `${chat.visitorInfo.name} <span style="font-size: 11px; background: #f0fdf4; color: #16a34a; padding: 2px 6px; border-radius: 4px; font-weight: normal;">👨‍💼 人工接待中</span>`;
    }
  } else {
    currentChatVisitorName.innerText = chat.visitorInfo.name;
  }
  currentChatVisitorTags.innerHTML = `<span>IP: ${chat.visitorInfo.ip || '未知'}</span> <span>城市: ${chat.visitorInfo.city || '本地'}</span> <span>正在浏览: ${chat.visitorInfo.pageTitle || '页面'}</span>`;
  chatTopActions.style.display = 'flex';
  chatEditorPanel.style.display = 'flex';

  // 恢复打字预知
  if (chat.typingText && chat.typingText.trim().length > 0) {
    typingPreviewText.innerText = chat.typingText;
    typingPreviewBar.style.display = 'flex';
  } else {
    typingPreviewBar.style.display = 'none';
  }

  // 渲染历史消息
  messagesFlow.innerHTML = '';
  chat.messages.forEach(appendMessageToFlow);

  // 刷新左侧选中高亮
  if (currentLeftTab === 'activeChats') renderActiveChatsList();

  // 刷新右侧画像
  renderVisitorProfile(chat.visitorInfo);

  agentInputBox.focus();
}

function appendMessageToFlow(msg) {
  const row = document.createElement('div');
  const isAgent = msg.fromRole === 'agent' || msg.from === (currentAgent && currentAgent.id);
  const isAi = msg.isAi || msg.from === 'ai_bot';
  row.className = `msg-bubble-row ${isAgent ? 'agent' : 'visitor'}`;

  const avatar = document.createElement('div');
  avatar.className = 'bubble-avatar';
  if (isAi) {
    avatar.innerText = '🤖';
    avatar.style.background = '#0284c7';
  } else {
    avatar.innerText = isAgent ? '我' : '客';
  }

  const body = document.createElement('div');
  body.className = 'bubble-body';

  const sender = document.createElement('div');
  sender.className = 'bubble-sender';
  const senderName = isAi ? '🤖 AI智能客服' : (isAgent ? currentAgent.name : '访客');
  sender.innerText = `${senderName} ${msg.time || ''} ${msg.tokensUsed ? `(耗费 ${msg.tokensUsed} Token)` : ''}`;

  const bubble = document.createElement('div');
  bubble.className = 'bubble-text';

  if (msg.msgType === 'image') {
    const img = document.createElement('img');
    const imgUrl = msg.fileInfo ? `${currentServer}${msg.fileInfo.url}` : msg.text;
    img.src = imgUrl;
    img.onclick = () => window.open(imgUrl, '_blank');
    bubble.appendChild(img);
  } else {
    bubble.innerText = msg.text;
  }

  body.appendChild(sender);
  body.appendChild(bubble);
  row.appendChild(avatar);
  row.appendChild(body);

  messagesFlow.appendChild(row);
  messagesFlow.scrollTop = messagesFlow.scrollHeight;
}

// 发送客服消息
function sendAgentMessage(customText = null) {
  const text = (customText !== null ? customText : agentInputBox.value).trim();
  if (!text || !currentSelectedVisitorId) return;

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    alert('网络未连接');
    return;
  }

  const payload = {
    to: currentSelectedVisitorId,
    text: text,
    msgType: 'text'
  };

  ws.send(JSON.stringify({
    type: 'send_message',
    data: payload
  }));

  // 本地立即加入会话池
  const chat = activeChatsMap.get(currentSelectedVisitorId);
  const localMsg = {
    id: 'msg_' + Date.now(),
    from: currentAgent.id,
    fromRole: 'agent',
    to: currentSelectedVisitorId,
    text: text,
    msgType: 'text',
    time: new Date().toLocaleTimeString()
  };
  if (chat) chat.messages.push(localMsg);
  appendMessageToFlow(localMsg);

  if (customText === null) {
    agentInputBox.value = '';
    agentInputBox.focus();
  }
}

btnAgentSend.onclick = () => sendAgentMessage();
agentInputBox.onkeydown = (e) => {
  if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
    e.preventDefault();
    sendAgentMessage();
  } else if (e.key === 'Enter' && (e.ctrlKey || e.shiftKey)) {
    // 换行
  }
};

// 清屏
btnClearScreen.onclick = () => {
  if (confirm('确认清屏吗？（仅清理本地工作台显示，不影响服务器归档）')) {
    messagesFlow.innerHTML = '';
  }
};

// 结束会话
btnEndChat.onclick = () => {
  if (!currentSelectedVisitorId) return;
  if (confirm('确定要结束与该访客的对话吗？')) {
    ws.send(JSON.stringify({
      type: 'agent_end_chat',
      data: { visitorId: currentSelectedVisitorId }
    }));
    activeChatsMap.delete(currentSelectedVisitorId);
    currentSelectedVisitorId = null;
    chatTopActions.style.display = 'none';
    chatEditorPanel.style.display = 'none';
    typingPreviewBar.style.display = 'none';
    currentChatVisitorName.innerText = '请在左侧选择访客进行接待';
    currentChatVisitorTags.innerHTML = '';
    messagesFlow.innerHTML = '<div style="text-align: center; color: #94a3b8; margin-top: 150px;">会话已结束并成功归档。</div>';
    updateStatsUI();
    renderActiveChatsList();
  }
};

// 转接：下拉选择当前在线坐席 (替代手输工号)
if (btnTransfer) {
  btnTransfer.onclick = async () => {
    if (!currentSelectedVisitorId) return;
    transferModal.style.display = 'flex';
    transferAgentList.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 20px;">正在获取在线坐席...</div>';

    try {
      const appKey = (currentAgent && currentAgent.appKey) || (loginAppKey && loginAppKey.value.trim()) || 'app_demo888';
      const res = await fetch(`${currentServer}/api/online-agents?appKey=${appKey}`);
      const result = await res.json();
      const agents = (result.data || []).filter(a => a.id !== (currentAgent && currentAgent.id));

      if (agents.length === 0) {
        transferAgentList.innerHTML = '<div style="text-align: center; color: #64748b; padding: 24px;">当前无其他在线坐席可转接</div>';
        return;
      }

      transferAgentList.innerHTML = agents.map(a => `
        <div class="agent-card-item" onclick="executeTransfer('${a.id}', '${a.name}')" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s; background: #fff;" onmouseover="this.style.background='#f0f7ff'; this.style.borderColor='#93c5fd';" onmouseout="this.style.background='#fff'; this.style.borderColor='#e2e8f0';">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 34px; height: 34px; border-radius: 50%; background: #1890ff; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px;">${a.name.substring(0, 1)}</div>
            <div>
              <div style="font-weight: 600; font-size: 13.5px; color: #1e293b;">${a.name} <span style="font-size: 11px; color: #64748b; font-weight: normal;">(工号: ${a.id})</span></div>
              <div style="font-size: 11px; color: #16a34a;">🟢 在线接听中</div>
            </div>
          </div>
          <div style="font-size: 12px; color: #64748b; background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">当前接待: ${a.activeChatsCount || 0}人</div>
        </div>
      `).join('');

    } catch (e) {
      transferAgentList.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 20px;">获取在线客服失败: ' + e.message + '</div>';
    }
  };
}

if (btnCloseTransferModal) {
  btnCloseTransferModal.onclick = () => {
    transferModal.style.display = 'none';
  };
}

window.executeTransfer = function(targetAgentId, targetAgentName) {
  if (!confirm(`确认将当前访客转接给客服【${targetAgentName}】吗？`)) return;

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'agent_transfer',
      data: {
        visitorId: currentSelectedVisitorId,
        targetAgentId
      }
    }));

    activeChatsMap.delete(currentSelectedVisitorId);
    currentSelectedVisitorId = null;
    chatTopActions.style.display = 'none';
    chatEditorPanel.style.display = 'none';
    typingPreviewBar.style.display = 'none';
    currentChatVisitorName.innerText = '请在左侧选择访客进行接待';
    currentChatVisitorTags.innerHTML = '';
    messagesFlow.innerHTML = `<div style="text-align: center; color: #94a3b8; margin-top: 150px;">会话已成功转接给客服【${targetAgentName}】。</div>`;
    updateStatsUI();
    renderActiveChatsList();
    transferModal.style.display = 'none';
  }
};

// 一键拉黑恶意访客
if (btnBlockVisitor) {
  btnBlockVisitor.onclick = () => {
    if (!currentSelectedVisitorId) return;
    const chat = activeChatsMap.get(currentSelectedVisitorId);
    const vName = chat ? chat.visitorInfo.name : currentSelectedVisitorId;

    if (!confirm(`警告：确定要将【${vName}】加入系统黑名单并立即终止会话吗？拉黑后该访客将无法再次接入客服。`, '拉黑访客')) {
      return;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'agent_block_visitor',
        data: {
          visitorId: currentSelectedVisitorId,
          reason: '坐席工作台主动拉黑'
        }
      }));

      activeChatsMap.delete(currentSelectedVisitorId);
      currentSelectedVisitorId = null;
      chatTopActions.style.display = 'none';
      chatEditorPanel.style.display = 'none';
      typingPreviewBar.style.display = 'none';
      currentChatVisitorName.innerText = '请在左侧选择访客进行接待';
      currentChatVisitorTags.innerHTML = '';
      messagesFlow.innerHTML = '<div style="text-align: center; color: #ef4444; margin-top: 150px;">该访客已被成功拉黑并断开连接。</div>';
      updateStatsUI();
      renderActiveChatsList();
    }
  };
}

// 一键接管会话
if (btnTakeover) {
  btnTakeover.onclick = () => {
    if (!currentSelectedVisitorId) return;
    ws.send(JSON.stringify({
      type: 'agent_takeover',
      data: { visitorId: currentSelectedVisitorId }
    }));
    const chat = activeChatsMap.get(currentSelectedVisitorId);
    if (chat) {
      if (!chat.session) chat.session = {};
      chat.session.isAiHandled = false;
    }
    selectChatVisitor(currentSelectedVisitorId);
  };
}

// 交还 AI 托管
if (btnReleaseToAi) {
  btnReleaseToAi.onclick = () => {
    if (!currentSelectedVisitorId) return;
    ws.send(JSON.stringify({
      type: 'agent_release_to_ai',
      data: { visitorId: currentSelectedVisitorId }
    }));
    const chat = activeChatsMap.get(currentSelectedVisitorId);
    if (chat) {
      if (!chat.session) chat.session = {};
      chat.session.isAiHandled = true;
    }
    selectChatVisitor(currentSelectedVisitorId);
  };
}

// 图片上传
clientImageUpload.onchange = async () => {
  const file = clientImageUpload.files[0];
  if (!file || !currentSelectedVisitorId) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${currentServer}/api/upload`, { method: 'POST', body: formData });
    const data = await res.json();
    if (data.code === 0) {
      ws.send(JSON.stringify({
        type: 'send_message',
        data: {
          to: currentSelectedVisitorId,
          text: data.data.url,
          msgType: 'image',
          fileInfo: data.data
        }
      }));
      const chat = activeChatsMap.get(currentSelectedVisitorId);
      const localMsg = {
        id: 'msg_' + Date.now(),
        from: currentAgent.id,
        fromRole: 'agent',
        to: currentSelectedVisitorId,
        text: data.data.url,
        msgType: 'image',
        fileInfo: data.data,
        time: new Date().toLocaleTimeString()
      };
      if (chat) chat.messages.push(localMsg);
      appendMessageToFlow(localMsg);
    }
  } catch (e) {
    alert('上传失败: ' + e.message);
  }
  clientImageUpload.value = '';
};

// 表情快捷插入
document.getElementById('btnInsertEmoji').onclick = () => {
  const emojis = ['😊', '👍', '🙏', '❤️', '🎉', '👋', '🤝', '✨', '💡', '🔥'];
  const em = emojis[Math.floor(Math.random() * emojis.length)];
  agentInputBox.value += em;
  agentInputBox.focus();
};

// ======================== 右侧画像与快捷话术 ========================

function renderVisitorProfile(v) {
  if (!v) return;
  vpName.innerText = v.name || '-';
  vpIp.innerText = v.ip || '127.0.0.1';
  vpCity.innerText = v.city || '本地';
  vpTime.innerText = v.enterTime || '-';
  vpReferrer.innerText = v.referrer || '直接访问';
  vpSearch.innerText = v.searchWord || '无';
  vpPage.innerText = v.currentPage || '-';
  vpAgent.innerText = v.userAgent ? v.userAgent.substring(0, 30) + '...' : '标准浏览器';

  vpTimeline.innerHTML = '';
  if (v.tracks && v.tracks.length > 0) {
    v.tracks.forEach(t => {
      const step = document.createElement('div');
      step.className = 'track-step';
      step.innerHTML = `
        <div class="track-time">${t.time}</div>
        <div class="track-page">${t.title || t.page}</div>
      `;
      vpTimeline.appendChild(step);
    });
  } else {
    vpTimeline.innerHTML = '<div style="font-size: 12px; color: #94a3b8;">暂无轨迹记录</div>';
  }
}

function renderCannedMessages() {
  cannedAccordion.innerHTML = '';
  const filter = (cannedSearch.value || '').trim().toLowerCase();

  cannedCategories.forEach(cat => {
    const items = cat.items.filter(i => !filter || i.title.toLowerCase().includes(filter) || i.content.toLowerCase().includes(filter));
    if (items.length === 0) return;

    const catDiv = document.createElement('div');
    catDiv.className = 'canned-category';

    const header = document.createElement('div');
    header.className = 'canned-cat-header';
    header.innerHTML = `<span>${cat.category}</span> <span>${items.length} 条</span>`;
    catDiv.appendChild(header);

    items.forEach(item => {
      const it = document.createElement('div');
      it.className = 'canned-item';
      it.innerHTML = `
        <div class="canned-item-title">${item.title}</div>
        <div class="canned-item-desc">${item.content}</div>
      `;

      // 单击填入输入框
      it.onclick = () => {
        agentInputBox.value = item.content;
        agentInputBox.focus();
      };

      // 双击直接发送！(AI智客服杀手级快捷操作)
      it.ondblclick = () => {
        sendAgentMessage(item.content);
      };

      catDiv.appendChild(it);
    });

    cannedAccordion.appendChild(catDiv);
  });
}

cannedSearch.oninput = renderCannedMessages;

// 添加常用话术
btnAddCannedDialog.onclick = async () => {
  const category = prompt('请输入话术分类 (如: 常见问候、业务报价):', '常用问候');
  if (!category) return;
  const title = prompt('请输入话术标题 (如: 礼貌道别):');
  if (!title) return;
  const content = prompt('请输入详细话术内容:');
  if (!content) return;

  try {
    const res = await fetch(`${currentServer}/api/canned-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, title, content })
    });
    const result = await res.json();
    if (result.code === 0) {
      alert('添加成功！');
      // 重新加载
      const r = await fetch(`${currentServer}/api/canned-messages`);
      const all = await r.json();
      cannedCategories = all.data;
      renderCannedMessages();
    }
  } catch (e) {
    alert('保存话术失败: ' + e.message);
  }
};

// ======================== 界面事件绑定 ========================

// 左侧 Tab 切换
[tabActiveChats, tabVisitorRadar, tabOfflineMsgs, tabHistoryChats].forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentLeftTab = tab.getAttribute('data-tab');
    renderCurrentLeftTab();
  };
});

// 右侧 Tab 切换
tabProfile.onclick = () => {
  tabProfile.classList.add('active');
  tabCanned.classList.remove('active');
  panelProfile.style.display = 'block';
  panelCanned.style.display = 'none';
};
tabCanned.onclick = () => {
  tabCanned.classList.add('active');
  tabProfile.classList.remove('active');
  panelProfile.style.display = 'none';
  panelCanned.style.display = 'block';
  renderCannedMessages();
};

// 声音开关
btnSoundToggle.onclick = () => {
  soundEnabled = !soundEnabled;
  btnSoundToggle.classList.toggle('active', soundEnabled);
  soundIcon.innerText = soundEnabled ? '🔔' : '🔕';
  soundText.innerText = soundEnabled ? '声音开启' : '声音静音';
};

// 客服坐席状态更改
agentStatusSelect.onchange = () => {
  const status = agentStatusSelect.value;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'agent_set_status',
      data: { status }
    }));
  }
};

// 退出登录
btnLogout.onclick = () => {
  if (confirm('确认注销并退出当前工作台吗？')) {
    if (ws) ws.close();
    location.reload();
  }
};

function updateStatsUI() {
  statVisitorsCount.innerText = visitorRadarMap.size;
  statActiveChats.innerText = activeChatsMap.size;

  let totalUnread = 0;
  activeChatsMap.forEach(c => totalUnread += (c.unread || 0));

  if (totalUnread > 0) {
    badgeActiveCount.innerText = totalUnread;
    badgeActiveCount.style.display = 'inline-block';
  } else {
    badgeActiveCount.style.display = 'none';
  }

  badgeRadarCount.innerText = visitorRadarMap.size;
  badgeRadarCount.style.display = visitorRadarMap.size > 0 ? 'inline-block' : 'none';
}
