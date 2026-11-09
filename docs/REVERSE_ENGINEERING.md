# iBangKF (爱邦客) 在线客服系统逆向分析与复刻工程报告

本项目参考开源逆向工程理念（REA - Reverse Engineer Anything），对 **iBangKF（爱邦客在线客服系统）** 官方 Windows 安装包及网络交互进行了深入的二进制逆向与协议提取，并基于现代技术栈对其全套**服务端（Server）**、**Windows 客服坐席客户端（Desktop Client）**以及**网站访客端（Visitor Widget SDK）**进行了 1:1 深度复刻与架构升级。

---

## 一、官方客户端二进制逆向分析 (Delphi / PE Analysis)

### 1.1 安装包解构
- **安装包文件**：`ibangkf-setup.exe` (体积约 1.25 MB)
- **打包技术**：Nullsoft Scriptable Install System (NSIS)
- **解包产物**：
  - `ibangkf.exe` (主程序，约 3.6 MB)
  - `FindProcDLL.dll` / `KillProcDLL.dll` (NSIS 进程守护插件)
  - `modern-header.bmp` / `inst.gif` (安装界面资源)

### 1.2 主程序分析
- **编译器/框架**：Delphi / C++ Builder 原生 Win32 可执行文件，使用 Indy Sockets (`TIdSocketHandle`) 处理底层长连接。
- **通信架构**：采用了 **Socket 长连接（推送实时事件） + HTTP/PHP 接口（消息、话术、登录）** 的混合模式。

### 1.3 提取的关键协议指令（Protocol Packet Commands）
通过对二进制文件的特征码和字符串分析，提取出官方系统的核心状态机与协议指令：

| 指令代码 | 功能定义 | 复刻设计 |
| :--- | :--- | :--- |
| `UP_LOGIN` / `DOWN_LOGIN` | 客服坐席认证与登录回应 | WebSocket 坐席身份认证与 Token 鉴权 |
| `DOWN_VISITOR_ADD` | 新访客进入网站实时通知 | 访客连接时广播全站在线访客事件 |
| `DOWN_VISITOR_ALL` | 获取全站实时访客监控列表 | 获取正在浏览网站的所有访客及其来源信息 |
| `DOWN_VISITOR_CALL` | 访客点击客服发起呼叫/接入请求 | 访客发起会话，排队分配路由 |
| `DOWN_VISITOR_PREMSG` | **访客输入实时预知（杀手级功能）** | 访客在输入框打字时实时同步给坐席（未按发送即可预览） |
| `DOWN_VISITOR_MSG` | 访客正式发送消息 | 双向文本/图片/富文本即时交付 |
| `DOWN_VISITOR_CHANGE_PAGE`| 访客浏览页面切换追踪 | 页面 URL、浏览时长与轨迹实时上报 |
| `DOWN_VISITOR_SEARCHWORD` | 访客搜索引擎关键词提取 | 解析 `Referer` 中的 `wd=`, `q=` 等搜索词 |
| `DOWN_VISITOR_TRANSFER` | 坐席之间转接访客会话 | 坐席席位流转与跨会话交接 |
| `DOWN_VISITOR_ENDCHAT` | 结束会话 | 会话归档与满意度评价触发 |
| `DOWN_FAQ_CHANGED` | 快捷话术/常见问答同步 | 个人常用话术与公共话术库同步 |

---

## 二、现代化复刻架构升级

原版爱邦客基于传统的 Win32 Delphi + PHP 架构，存在跨平台困难、UI 样式老旧（Windows XP/7 风格）、部署繁琐（需要搭建 PHP+Apache+MySQL 环境）等缺陷。

本次复刻工程采用全新现代全栈架构升级实现：

```
                      ┌──────────────────────────────────────────────┐
                      │              爱邦客服务端 (Server)            │
                      │  - Node.js + Express + WebSocket (ws)        │
                      │  - 访客追踪 / 会话路由 / 消息持久化 / 话术库  │
                      │  - 纯内置存储，零外部依赖，极速一键拉起      │
                      └──────────────┬───────────────────────────────┘
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
┌─────────────────────────────┐             ┌───────────────────────────────────┐
│     访客端 (Visitor Widget)  │             │   Windows 客服坐席端 (Desktop)    │
│  - 任意网站一行代码引入      │             │  - 现代 Electron 独立桌面客户端   │
│  - 悬浮挂件 / 弹窗聊天      │             │  - 系统托盘 / 声音提醒 / 闪烁提示 │
│  - 访问轨迹 / 输入实时预知   │             │  - 实时访客监控 / 轨迹与画像展示  │
│  - 满意度评价 / 离线留言    │             │  - 访客打字预知 / 分类常用话术库  │
└─────────────────────────────┘             └───────────────────────────────────┘
```
