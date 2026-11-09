(function() {
  // 防止重复加载
  if (window.__AIKEFU_LOADED__) return;
  window.__AIKEFU_LOADED__ = true;

  // 获取服务端 Host 地址与专属租户 appKey
  const scripts = document.getElementsByTagName('script');
  let serverHost = 'http://127.0.0.1:8080';
  let appKey = 'app_demo888';
  for (let s of scripts) {
    if (s.src && s.src.indexOf('widget.js') !== -1) {
      try {
        const url = new URL(s.src, window.location.href);
        if (url.protocol.startsWith('http') && url.host) {
          serverHost = `${url.protocol}//${url.host}`;
        }
        if (url.searchParams.get('appKey')) {
          appKey = url.searchParams.get('appKey');
        }
      } catch (e) {}
      break;
    }
  }

  function init() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    // 注入样式
    const style = document.createElement('style');
    style.innerHTML = `
      .aikefu-btn-wrap {
        position: fixed;
        right: 28px;
        bottom: 28px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .aikefu-bubble-btn {
        width: 62px;
        height: 62px;
        border-radius: 50%;
        background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
        box-shadow: 0 6px 20px rgba(24, 144, 255, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.25s ease;
        color: white;
        border: none;
        outline: none;
        position: relative;
        animation: aikefu-pulse 2.5s infinite;
      }
      @keyframes aikefu-pulse {
        0% { box-shadow: 0 0 0 0 rgba(24, 144, 255, 0.6); }
        70% { box-shadow: 0 0 0 16px rgba(24, 144, 255, 0); }
        100% { box-shadow: 0 0 0 0 rgba(24, 144, 255, 0); }
      }
      .aikefu-bubble-btn:hover {
        transform: scale(1.08);
      }
      .aikefu-bubble-label {
        background: #ffffff;
        color: #1e293b;
        font-size: 13.5px;
        font-weight: 600;
        padding: 8px 14px;
        border-radius: 20px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        border: 1px solid #e2e8f0;
        transition: all 0.2s;
        white-space: nowrap;
      }
      .aikefu-bubble-label:hover {
        background: #f0f7ff;
        color: #1890ff;
      }
      .aikefu-badge {
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
      .aikefu-iframe-wrap {
        position: fixed;
        right: 28px;
        bottom: 104px;
        width: 390px;
        height: 610px;
        max-height: calc(100vh - 130px);
        z-index: 999999;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18);
        border-radius: 12px;
        overflow: hidden;
        display: none;
        transition: all 0.3s ease;
        border: 1px solid rgba(0,0,0,0.08);
        background: #ffffff;
      }
      .aikefu-iframe-wrap iframe {
        width: 100%;
        height: 100%;
        border: none;
      }
      .aikefu-invite-modal {
        position: fixed;
        right: 28px;
        bottom: 104px;
        width: 320px;
        background: #ffffff;
        border-radius: 10px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.18);
        z-index: 999998;
        display: none;
        padding: 18px;
        border-top: 4px solid #1890ff;
      }
      .aikefu-invite-header {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
      }
      .aikefu-invite-avatar {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: #e6f7ff;
        margin-right: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #1890ff;
        font-weight: bold;
      }
      .aikefu-invite-title {
        font-size: 14.5px;
        font-weight: 600;
        color: #1e293b;
      }
      .aikefu-invite-body {
        font-size: 13px;
        color: #475569;
        line-height: 1.5;
        margin-bottom: 14px;
      }
      .aikefu-invite-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      .aikefu-btn-sm {
        padding: 6px 14px;
        font-size: 12px;
        border-radius: 4px;
        cursor: pointer;
        border: 1px solid #d9d9d9;
        background: #fff;
      }
      .aikefu-btn-primary {
        background: #1890ff;
        color: #fff;
        border-color: #1890ff;
        font-weight: 500;
      }
    `;
    document.head.appendChild(style);

    // 构建 DOM 节点
    const wrap = document.createElement('div');
    wrap.className = 'aikefu-btn-wrap';
    wrap.innerHTML = `
      <div class="aikefu-bubble-label" id="aikefuLabelBtn">
        <span>💬 咨询客服</span>
      </div>
      <button class="aikefu-bubble-btn" id="aikefuToggleBtn" title="点击联系在线客服">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <div class="aikefu-badge" id="aikefuBadge">1</div>
      </button>
    `;
    document.body.appendChild(wrap);

    // 邀请弹窗
    const inviteBox = document.createElement('div');
    inviteBox.className = 'aikefu-invite-modal';
    inviteBox.id = 'aikefuInviteBox';
    inviteBox.innerHTML = `
      <div class="aikefu-invite-header">
        <div class="aikefu-invite-avatar" id="aikefuInviteAvatar">客</div>
        <div class="aikefu-invite-title" id="aikefuInviteName">在线客服</div>
      </div>
      <div class="aikefu-invite-body" id="aikefuInviteText">
        您好！我是值班客服，看您正在浏览本站，请问有什么可以帮您吗？
      </div>
      <div class="aikefu-invite-actions">
        <button class="aikefu-btn-sm" id="aikefuInviteClose">稍后再说</button>
        <button class="aikefu-btn-sm aikefu-btn-primary" id="aikefuInviteAccept">立即咨询</button>
      </div>
    `;
    document.body.appendChild(inviteBox);

    // 聊天 iframe 容器
    const iframeWrap = document.createElement('div');
    iframeWrap.className = 'aikefu-iframe-wrap';
    iframeWrap.id = 'aikefuIframeWrap';
    
    // 传给 iframe 当前页面参数与租户 appKey
    const params = new URLSearchParams({
      referrer: document.referrer || '',
      currentPage: window.location.href,
      pageTitle: document.title || '当前网页',
      serverHost: serverHost,
      appKey: appKey
    });
    
    // 如果当前通过 file:/// 打开，iframe 地址通过 http://127.0.0.1:8080/widget.html 访问
    const iframeSrc = (window.location.protocol === 'file:' ? 'http://127.0.0.1:8080' : serverHost) + `/widget.html?${params.toString()}`;
    iframeWrap.innerHTML = `<iframe id="aikefuIframe" src="${iframeSrc}"></iframe>`;
    document.body.appendChild(iframeWrap);

    let isOpen = false;
    const toggleBtn = document.getElementById('aikefuToggleBtn');
    const labelBtn = document.getElementById('aikefuLabelBtn');
    const badge = document.getElementById('aikefuBadge');

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
      if (isOpen) closeChat(); else openChat();
    };
    labelBtn.onclick = function() {
      if (isOpen) closeChat(); else openChat();
    };

    document.getElementById('aikefuInviteClose').onclick = function() {
      inviteBox.style.display = 'none';
    };
    document.getElementById('aikefuInviteAccept').onclick = function() {
      openChat();
    };

    // 监听来自 iframe 的消息通信
    window.addEventListener('message', function(e) {
      if (!e.data || typeof e.data !== 'object') return;
      const { action, payload } = e.data;
      if (action === 'MINIMIZE') {
        closeChat();
      } else if (action === 'SHOW_INVITE') {
        if (!isOpen) {
          document.getElementById('aikefuInviteName').innerText = payload.agentName || '在线客服';
          document.getElementById('aikefuInviteText').innerText = payload.message || '您好！请问有什么可以帮助您的吗？';
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
      const iframe = document.getElementById('aikefuIframe');
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
  }

  init();
})();
