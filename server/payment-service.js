const store = require('./store');

class PaymentService {
  constructor() {
    this.payeePaypalEmail = '181827969@qq.com';
    this.exchangeRate = 7.2; // 1 USD = 7.2 CNY
  }

  // 1. 创建订单
  createOrder({ tenantId, orderType, packageId, payMethod }) {
    const tenant = store.getTenantById(tenantId);
    if (!tenant) throw new Error('租户不存在');

    let title = '';
    let amountCNY = 0;
    let credits = 0;

    if (orderType === 'manual_plan') {
      title = '人工客服标准版 (1年)';
      amountCNY = store.data.platformConfig.yearlyPrice || 199;
    } else if (orderType === 'ai_credits') {
      const pkg = store.data.platformConfig.creditPackages.find(p => p.id === packageId) || store.data.platformConfig.creditPackages[1];
      title = `AI 智能客服 ${pkg.name}`;
      amountCNY = pkg.price;
      credits = pkg.credits;
    } else {
      throw new Error('未知的订单类型');
    }

    const orderId = 'ORD_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6).toUpperCase();
    const amountUSD = (amountCNY / this.exchangeRate).toFixed(2);

    const order = {
      orderId,
      tenantId,
      companyName: tenant.companyName,
      title,
      orderType,
      packageId: packageId || null,
      credits,
      amountCNY,
      amountUSD: parseFloat(amountUSD),
      payMethod, // 'wechat' | 'paypal'
      status: 'pending', // 'pending' | 'paid' | 'cancelled'
      payeePaypalEmail: this.payeePaypalEmail,
      createdAt: new Date().toISOString(),
      paidAt: null
    };

    if (!store.data.orders) store.data.orders = [];
    store.data.orders.unshift(order);
    store.save();

    return order;
  }

  // 2. 查询订单
  getOrder(orderId) {
    if (!store.data.orders) return null;
    return store.data.orders.find(o => o.orderId === orderId);
  }

  // 3. 租户历史订单
  getTenantOrders(tenantId) {
    if (!store.data.orders) return [];
    return store.data.orders.filter(o => o.tenantId === tenantId);
  }

  // 4. 支付成功履约处理 (支持真实回调或确认)
  completeOrder(orderId, payDetails = {}) {
    const order = this.getOrder(orderId);
    if (!order) throw new Error('订单不存在');
    if (order.status === 'paid') return order; // 防止重复支付

    order.status = 'paid';
    order.paidAt = new Date().toISOString();
    order.payDetails = payDetails;

    const tenant = store.getTenantById(order.tenantId);
    if (!tenant) throw new Error('关联租户未找到');

    // 履约：开通 199 元年费或充值积分
    if (order.orderType === 'manual_plan') {
      store.renewManualPlan(order.tenantId);
    } else if (order.orderType === 'ai_credits') {
      store.addCredits(order.tenantId, order.credits);
    }

    store.save();
    return order;
  }

  // 5. 生成 PayPal 标准结账链接
  generatePaypalCheckoutUrl(order) {
    // PayPal 标准支付表单/URL (收款人: 181827969@qq.com)
    const params = new URLSearchParams({
      cmd: '_xclick',
      business: this.payeePaypalEmail,
      item_name: `AIkefu SaaS - ${order.title}`,
      amount: order.amountUSD.toString(),
      currency_code: 'USD',
      invoice: order.orderId,
      custom: order.tenantId,
      return: `http://127.0.0.1:8080/console/index.html?paidOrder=${order.orderId}`,
      cancel_return: `http://127.0.0.1:8080/console/index.html?cancelOrder=${order.orderId}`
    });
    return `https://www.paypal.com/cgi-bin/webscr?${params.toString()}`;
  }

  // 6. 生成微信扫码支付信息
  generateWechatPayData(order) {
    // 微信支付 Native 扫码 URL 规则 (weixin://wxpay/bizpayurl 或商户生成的 code_url)
    const codeUrl = `weixin://wxpay/bizpayurl?pr=${order.orderId.toLowerCase()}`;
    return {
      orderId: order.orderId,
      amountCNY: order.amountCNY,
      codeUrl: codeUrl
    };
  }
}

module.exports = new PaymentService();
