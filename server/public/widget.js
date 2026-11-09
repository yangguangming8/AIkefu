(function() {
  // 防止重复加载
  if (window.__IBANGKF_LOADED__) return;
  window.__IBANGKF_LOADED__ = true;

  // 获取服务端 Host 地址 (根据 script 标签的 src 自动解析)
  const scripts = document.getElementsByTagName('script');
  let serverHost = 'http://127.0.0.1:8080';
  for (let s of scripts) {
    if (s.src && s.src.indexOf('widget.js') !== -1) {
      const url = new URL(s.src);
      serverHost = `${url.protocol}//${url.host}`;
      break;
    }
  }

  // 注入样式
  const style = document.createElement('style');
  style.innerHTML = `
    .ibangkf-btn-wrap {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    .ibangkf-bubble-btn {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
      box-shadow: 0 4px 16px rgba(24, 144, 255, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.25s ease;
      color: white;
      border: none;
      outline: none;
    }
    .ibangkf-bubble-btn:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 20px rgba(24, 144, 255, 0.55);
    }
    .ibangkf-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      background: #ff4d4f;
      color: #fff;
      font-size: 11px;
      font-weight: bold;
      min-width: 18px;
      height: 18px;
      border-radius: 9px;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
      border: 2px solid #fff;
    }
    .ibangkf-iframe-wrap {
      position: fixed;
      right: 24px;
      bottom: 96px;
      width: 380px;
      height: 600px;
      max-height: calc(100vh - 120px);
      z-index: 999999;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
      border-radius: 12px;
      overflow: hidden;
      display: none;
      transition: all 0.3s ease;
      border: 1px solid rgba(0,0,0,0.08);
    }
    .ibangkf-iframe-wrap iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    .ibangkf-invite-modal {
      position: fixed;
      right: 24px;
      bottom: 100px;
      width: 320px;
      background: #ffffff;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.18);
      z-index: 999998;
      display: none;
      padding: 16px;
      border-top: 4px solid #1890ff;
    }
    .ibangkf-invite-header {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    }
    .ibangkf-invite-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #e6f7ff;
      margin-right: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #1890ff;
      font-weight: bold;
    }
    .ibangkf-invite-title {
      font-size: 14px;
      font-weight: 600;
      color: #333;
    }
    .ibangkf-invite-body {
      font-size: 13px;
      color: #666;
      line-height: 1.5;
      margin-bottom: 14px;
    }
    .ibangkf-invite-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .ibangkf-btn-sm {
      padding: 5px 12px;
      font-size: 12px;
      border-radius: 4px;
      cursor: pointer;
      border: 1px solid #d9d9d9;
      background: #fff;
    }
    .ibangkf-btn-primary {
      background: #1890ff;
      color: #fff;
      border-color: #1890ff;
    }
  `;
  document.head.appendChild(style);

  // 构建 DOM 节点
  const wrap = document.createElement('div');
  wrap.className = 'ibangkf-btn-wrap';
  wrap.innerHTML = `
    <button class="ibangkf-bubble-btn" id="ibangkfToggleBtn" title="点击联系在线客服">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      <div class="ibangkf-badge" id="ibangkfBadge">1</div>
    </button>
  `;
  document.body.appendChild(wrap);

  // 邀请弹窗
  const inviteBox = document.createElement('div');
  inviteBox.className = 'ibangkf-invite-modal';
  inviteBox.id = 'ibangkfInviteBox';
  inviteBox.innerHTML = `
    <div class="ibangkf-invite-header">
      <div class="ibangkf-invite-avatar" id="ibangkfInviteAvatar">客</div>
      <div class="ibangkf-invite-title" id="ibangkfInviteName">在线客服</div>
    </div>
    <div class="ibangkf-invite-body" id="ibangkfInviteText">
      您好！我是值班客服，看您正在浏览本站，请问有什么可以帮您吗？
    </div>
    <div class="ibangkf-invite-actions">
      <button class="ibangkf-btn-sm" id="ibangkfInviteClose">稍后再说</button>
      <button class="ibangkf-btn-sm ibangkf-btn-primary" id="ibangkfInviteAccept">立即咨询</button>
    </div>
  `;
  document.body.appendChild(inviteBox);

  // 聊天 iframe 容器
  const iframeWrap = document.createElement('div');
  iframeWrap.className = 'ibangkf-iframe-wrap';
  iframeWrap.id = 'ibangkfIframeWrap';
  
  // 传给 iframe 当前页面参数
  const params = new URLSearchParams({
    referrer: document.referrer || '',
    currentPage: window.location.href,
    pageTitle: document.title || '当前网页',
    serverHost: serverHost
  });
  
  iframeWrap.innerHTML = `<iframe id="ibangkfIframe" src="${serverHost}/widget.html?${params.toString()}"></iframe>`;
  document.body.appendChild(iframeWrap);

  let isOpen = false;
  const toggleBtn = document.getElementById('ibangkfToggleBtn');
  const badge = document.getElementById('ibangkfBadge');

  function openChat() {
    isOpen = true;
    iframeWrap.style.display = 'block';
    inviteBox.style.display = 'none';
    badge.style.display = 'none';
  }

  function closeChat() {
    isOpen = false;
    iframeWrap.style.display = 'none';
  }

  toggleBtn.onclick = function() {
    if (isOpen) {
      closeChat();
    } else {
      openChat();
    }
  };

  document.getElementById('ibangkfInviteClose').onclick = function() {
    inviteBox.style.display = 'none';
  };
  document.getElementById('ibangkfInviteAccept').onclick = function() {
    openChat();
  };

  // 监听来自 iframe 的消息通信 (例如客服发来主动邀请、或访客点击最小化)
  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;
    const { action, payload } = e.data;
    if (action === 'MINIMIZE') {
      closeChat();
    } else if (action === 'SHOW_INVITE') {
      if (!isOpen) {
        document.getElementById('ibangkfInviteName').innerText = payload.agentName || '在线客服';
        document.getElementById('ibangkfInviteText').innerText = payload.message || '您好！请问有什么可以帮助您的吗？';
        inviteBox.style.display = 'block';
      }
    } else if (action === 'NEW_MESSAGE_ALERT') {
      if (!isOpen) {
        badge.style.display = 'flex';
      }
    }
  });

  // 监听浏览器 URL 变化，通知 iframe 轨迹
  window.addEventListener('popstate', reportNavigation);
  function reportNavigation() {
    const iframe = document.getElementById('ibangkfIframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        action: 'PAGE_NAVIGATED',
        payload: {
          url: window.location.href,
          title: document.title
        }
      }, '*');
    }
  }
})();
