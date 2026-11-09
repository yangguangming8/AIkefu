const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const store = require('./store');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态托管公共文件和访客客户端
app.use(express.static(path.join(__dirname, 'public')));

// 文件上传支持 (聊天传图/传文件)
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ======================== RESTful API ========================

// 1. 坐席登录接口
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const agent = store.verifyAgent(username, password);
  if (!agent) {
    return res.status(401).json({ code: -1, message: '工号或密码错误' });
  }
  return res.json({
    code: 0,
    message: '登录成功',
    data: {
      id: agent.id,
      username: agent.username,
      name: agent.name,
      avatar: agent.avatar,
      token: 'tok_' + Date.now() + '_' + agent.id
    }
  });
});

// 2. 获取常用话术列表
app.get('/api/canned-messages', (req, res) => {
  res.json({ code: 0, data: store.getCannedMessages() });
});

// 3. 添加常用话术
app.post('/api/canned-messages', (req, res) => {
  const { category, title, content } = req.body;
  if (!category || !title || !content) {
    return res.status(400).json({ code: -1, message: '请完整填写分类、标题和话术内容' });
  }
  const item = store.addCannedMessage(category, title, content);
  res.json({ code: 0, data: item });
});

// 4. 删除常用话术
app.delete('/api/canned-messages/:id', (req, res) => {
  const success = store.deleteCannedMessage(req.params.id);
  res.json({ code: success ? 0 : -1, message: success ? '删除成功' : '话术不存在' });
});

// 5. 文件/图片上传
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ code: -1, message: '没有上传文件' });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({
    code: 0,
    data: {
      url: fileUrl,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    }
  });
});

// 6. 离线留言提交
app.post('/api/offline-msg', (req, res) => {
  const { name, phone, email, content, visitorId } = req.body;
  store.addOfflineMessage({ name, phone, email, content, visitorId });
  // 通知在线坐席有人留言
  broadcastToAgents({
    type: 'new_offline_msg',
    data: { name, phone, email, content, createTime: new Date().toISOString() }
  });
  res.json({ code: 0, message: '留言提交成功，我们会尽快与您联系！' });
});

// 7. 查询离线留言
app.get('/api/offline-msgs', (req, res) => {
  res.json({ code: 0, data: store.data.offlineMessages });
});

// 8. 历史会话查询
app.get('/api/history', (req, res) => {
  res.json({ code: 0, data: store.getHistoryChats() });
});

// 9. 系统综合状态统计
app.get('/api/stats', (req, res) => {
  res.json({
    code: 0,
    data: {
      onlineAgents: agentsMap.size,
      onlineVisitors: visitorsMap.size,
      activeChats: activeSessions.size,
      totalHistory: store.data.chatHistory.length,
      offlineMsgs: store.data.offlineMessages.length
    }
  });
});

// ======================== WebSocket 实时网关 ========================

// 内存中活跃连接池
const agentsMap = new Map();     // agentId -> { ws, info, activeChats: Set<visitorId> }
const visitorsMap = new Map();   // visitorId -> { ws, info, assignedAgentId, tracks: [] }
const activeSessions = new Map(); // visitorId -> { id, visitorId, agentId, startTime, messages: [] }

// 广播给所有坐席
function broadcastToAgents(msgObj) {
  const payload = JSON.stringify(msgObj);
  for (const { ws } of agentsMap.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

// 自动分配空闲坐席算法
function findBestAgent() {
  let selected = null;
  let minChats = Infinity;

  for (const [agentId, agent] of agentsMap.entries()) {
    if (agent.info.status === 'online') {
      const currentLoad = agent.activeChats.size;
      if (currentLoad < agent.info.maxChats && currentLoad < minChats) {
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

  ws.on('message', (messageBuffer) => {
    try {
      const packet = JSON.parse(messageBuffer.toString());
      const { type, data } = packet;

      // ----------------- 客服坐席信令 -----------------
      if (type === 'agent_login') {
        const { username, password } = data;
        const agentRecord = store.verifyAgent(username, password);
        if (!agentRecord) {
          ws.send(JSON.stringify({ type: 'agent_login_result', data: { success: false, message: '工号或密码错误' } }));
          return;
        }

        clientRole = 'agent';
        clientId = agentRecord.id;

        // 更新状态并登入
        agentRecord.status = 'online';
        store.updateAgentStatus(clientId, 'online');

        agentsMap.set(clientId, {
          ws,
          info: agentRecord,
          activeChats: new Set()
        });

        // 恢复已有该坐席的会话
        for (const [vId, session] of activeSessions.entries()) {
          if (session.agentId === clientId) {
            agentsMap.get(clientId).activeChats.add(vId);
          }
        }

        // 回复登录成功，附带当前在线访客列表、活跃对话列表、常用话术
        const visitorList = Array.from(visitorsMap.values()).map(v => v.info);
        const activeList = Array.from(agentsMap.get(clientId).activeChats).map(vId => {
          const sess = activeSessions.get(vId);
          const v = visitorsMap.get(vId);
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
            agent: agentRecord,
            visitors: visitorList,
            activeChats: activeList,
            cannedMessages: store.getCannedMessages()
          }
        }));

        // 广播坐席上线
        broadcastToAgents({
          type: 'agent_online',
          data: { agent: agentRecord }
        });
        console.log(`[客服上线] ${agentRecord.name} (${agentRecord.id}) 登录`);
        return;
      }

      // 坐席状态切换 (在线/忙碌/离开)
      if (type === 'agent_set_status') {
        if (clientRole === 'agent' && agentsMap.has(clientId)) {
          const agentEntry = agentsMap.get(clientId);
          agentEntry.info.status = data.status;
          store.updateAgentStatus(clientId, data.status);
          broadcastToAgents({
            type: 'agent_status_change',
            data: { agentId: clientId, status: data.status }
          });
        }
        return;
      }

      // 坐席主动邀请访客
      if (type === 'agent_invite_visitor') {
        const { visitorId, message } = data;
        const targetVisitor = visitorsMap.get(visitorId);
        if (targetVisitor && targetVisitor.ws.readyState === WebSocket.OPEN) {
          const agentEntry = agentsMap.get(clientId);
          targetVisitor.ws.send(JSON.stringify({
            type: 'chat_invited',
            data: {
              agentId: clientId,
              agentName: agentEntry ? agentEntry.info.name : '在线客服',
              agentAvatar: agentEntry ? agentEntry.info.avatar : '',
              message: message || '您好！请问有什么可以帮助您的吗？'
            }
          }));
        }
        return;
      }

      // 坐席转接访客
      if (type === 'agent_transfer') {
        const { visitorId, targetAgentId } = data;
        const targetAgent = agentsMap.get(targetAgentId);
        const currentAgent = agentsMap.get(clientId);
        const session = activeSessions.get(visitorId);
        const visitor = visitorsMap.get(visitorId);

        if (session && targetAgent) {
          // 从当前坐席移除
          if (currentAgent) currentAgent.activeChats.delete(visitorId);
          // 加入目标坐席
          targetAgent.activeChats.add(visitorId);
          session.agentId = targetAgentId;
          session.agentName = targetAgent.info.name;

          // 通知目标坐席
          targetAgent.ws.send(JSON.stringify({
            type: 'chat_transferred_in',
            data: {
              visitorId,
              visitorInfo: visitor ? visitor.info : {},
              session,
              fromAgentName: currentAgent ? currentAgent.info.name : '其他客服'
            }
          }));

          // 通知访客转接成功
          if (visitor && visitor.ws.readyState === WebSocket.OPEN) {
            visitor.ws.send(JSON.stringify({
              type: 'chat_transferred',
              data: {
                agentId: targetAgentId,
                agentName: targetAgent.info.name
              }
            }));
          }
        }
        return;
      }

      // 坐席结束对话
      if (type === 'agent_end_chat') {
        const { visitorId } = data;
        const session = activeSessions.get(visitorId);
        if (session) {
          store.saveChatHistory(session);
          activeSessions.delete(visitorId);
        }

        const agentEntry = agentsMap.get(clientId);
        if (agentEntry) {
          agentEntry.activeChats.delete(visitorId);
        }

        const visitor = visitorsMap.get(visitorId);
        if (visitor) {
          visitor.assignedAgentId = null;
          if (visitor.ws.readyState === WebSocket.OPEN) {
            visitor.ws.send(JSON.stringify({
              type: 'chat_ended',
              data: { message: '客服已结束本次对话，请对我们的服务做出评价。' }
            }));
          }
        }
        return;
      }

      // ----------------- 访客端信令 -----------------

      // 访客浏览进入网站 (上报轨迹与基本信息)
      if (type === 'visitor_enter') {
        const vInfo = {
          visitorId: data.visitorId || 'v_' + Math.random().toString(36).substring(2, 9),
          name: data.name || '访客 ' + Math.random().toString(36).substring(2, 6).toUpperCase(),
          ip: req.socket.remoteAddress || '127.0.0.1',
          city: data.city || '本地局域网',
          referrer: data.referrer || '直接访问',
          searchWord: data.searchWord || '无',
          currentPage: data.currentPage || '/',
          pageTitle: data.pageTitle || '首页',
          userAgent: data.userAgent || req.headers['user-agent'] || '未知设备',
          enterTime: new Date().toLocaleTimeString(),
          trackCount: 1
        };

        clientRole = 'visitor';
        clientId = vInfo.visitorId;

        const visitorObj = {
          ws,
          info: vInfo,
          assignedAgentId: null,
          tracks: [{ page: vInfo.currentPage, title: vInfo.pageTitle, time: new Date().toLocaleTimeString() }]
        };
        visitorsMap.set(clientId, visitorObj);

        // 回复访客自己的 ID
        ws.send(JSON.stringify({
          type: 'visitor_enter_ack',
          data: { visitorId: clientId, name: vInfo.name }
        }));

        // 广播给所有客服：有新访客浏览
        broadcastToAgents({
          type: 'new_visitor',
          data: vInfo
        });
        return;
      }

      // 访客页面切换轨迹跟踪
      if (type === 'visitor_navigate') {
        const visitor = visitorsMap.get(clientId);
        if (visitor) {
          visitor.info.currentPage = data.pageUrl;
          visitor.info.pageTitle = data.pageTitle;
          visitor.info.trackCount++;
          const trackItem = { page: data.pageUrl, title: data.pageTitle, time: new Date().toLocaleTimeString() };
          visitor.tracks.push(trackItem);

          broadcastToAgents({
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

      // 访客发起呼叫/申请对话
      if (type === 'visitor_call') {
        const visitor = visitorsMap.get(clientId);
        if (!visitor) return;

        // 如果已经有正在进行的会话，复用
        if (activeSessions.has(clientId)) {
          const sess = activeSessions.get(clientId);
          const ag = agentsMap.get(sess.agentId);
          ws.send(JSON.stringify({
            type: 'chat_connected',
            data: {
              agentId: sess.agentId,
              agentName: sess.agentName,
              agentAvatar: ag ? ag.info.avatar : '',
              messages: sess.messages
            }
          }));
          return;
        }

        // 分配空闲坐席
        const bestAgent = findBestAgent();
        if (!bestAgent) {
          // 当前无客服在线
          ws.send(JSON.stringify({
            type: 'no_agent_online',
            data: { message: '当前所有客服均在忙或不在线，请您点击留言，我们会尽快联系您。' }
          }));
          return;
        }

        // 分配成功
        visitor.assignedAgentId = bestAgent.info.id;
        bestAgent.activeChats.add(clientId);

        const newSession = {
          id: 'chat_' + Date.now(),
          visitorId: clientId,
          visitorName: visitor.info.name,
          agentId: bestAgent.info.id,
          agentName: bestAgent.info.name,
          startTime: new Date().toISOString(),
          messages: [],
          tracks: visitor.tracks
        };
        activeSessions.set(clientId, newSession);

        // 通知坐席
        bestAgent.ws.send(JSON.stringify({
          type: 'new_chat',
          data: {
            visitorId: clientId,
            visitorInfo: visitor.info,
            tracks: visitor.tracks,
            session: newSession
          }
        }));

        // 通知访客
        ws.send(JSON.stringify({
          type: 'chat_connected',
          data: {
            agentId: bestAgent.info.id,
            agentName: bestAgent.info.name,
            agentAvatar: bestAgent.info.avatar,
            messages: []
          }
        }));
        return;
      }

      // 访客打字预知 (实时传输输入框中尚未按发送键的文字)
      if (type === 'visitor_typing_preview') {
        const session = activeSessions.get(clientId);
        if (session && session.agentId) {
          const agent = agentsMap.get(session.agentId);
          if (agent && agent.ws.readyState === WebSocket.OPEN) {
            agent.ws.send(JSON.stringify({
              type: 'visitor_typing_preview',
              data: {
                visitorId: clientId,
                text: data.text || ''
              }
            }));
          }
        }
        return;
      }

      // ----------------- 通用即时消息投递 (双向) -----------------
      if (type === 'send_message') {
        const { to, text, msgType = 'text', fileInfo } = data;
        const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
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

        if (clientRole === 'visitor') {
          // 访客发给坐席
          const session = activeSessions.get(clientId);
          if (session) {
            session.messages.push(messagePayload);
            const agent = agentsMap.get(session.agentId);
            if (agent && agent.ws.readyState === WebSocket.OPEN) {
              agent.ws.send(JSON.stringify({
                type: 'chat_message',
                data: messagePayload
              }));
            }
          }
          // 回发给访客确认
          ws.send(JSON.stringify({ type: 'message_ack', data: messagePayload }));
        } else if (clientRole === 'agent') {
          // 坐席发给访客
          const visitor = visitorsMap.get(to);
          const session = activeSessions.get(to);
          if (session) {
            session.messages.push(messagePayload);
          }
          if (visitor && visitor.ws.readyState === WebSocket.OPEN) {
            visitor.ws.send(JSON.stringify({
              type: 'chat_message',
              data: messagePayload
            }));
          }
          // 回发给坐席确认
          ws.send(JSON.stringify({ type: 'message_ack', data: messagePayload }));
        }
      }

    } catch (e) {
      console.error('WebSocket 消息解析异常:', e);
    }
  });

  ws.on('close', () => {
    if (clientRole === 'agent' && clientId) {
      const ag = agentsMap.get(clientId);
      if (ag) {
        store.updateAgentStatus(clientId, 'offline');
        agentsMap.delete(clientId);
        broadcastToAgents({
          type: 'agent_offline',
          data: { agentId: clientId }
        });
        console.log(`[客服离线] 坐席 ${clientId} 断开`);
      }
    } else if (clientRole === 'visitor' && clientId) {
      const v = visitorsMap.get(clientId);
      if (v) {
        // 如果有会话在进行，通知坐席访客已离开
        if (v.assignedAgentId) {
          const agent = agentsMap.get(v.assignedAgentId);
          if (agent && agent.ws.readyState === WebSocket.OPEN) {
            agent.ws.send(JSON.stringify({
              type: 'visitor_left',
              data: { visitorId: clientId, name: v.info.name }
            }));
          }
        }
        visitorsMap.delete(clientId);
        broadcastToAgents({
          type: 'visitor_left_all',
          data: { visitorId: clientId }
        });
        console.log(`[访客离开] 访客 ${clientId} 离开网站`);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` 爱邦客 (iBangKF) 客服系统服务端已启动！`);
  console.log(` 访问地址: http://127.0.0.1:${PORT}`);
  console.log(` 访客端演示页面: http://127.0.0.1:${PORT}/demo.html`);
  console.log(` 访客嵌入JS脚本: http://127.0.0.1:${PORT}/widget.js`);
  console.log(`=======================================================`);
});
