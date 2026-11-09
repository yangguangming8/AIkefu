const store = require('./store');

class AIService {
  constructor() {
    this.defaultModel = 'deepseek-chat';
  }

  // 1. 检查访客输入是否触发转人工关键词
  checkTransferIntent(text, tenant) {
    if (!text) return false;
    const keywords = (tenant.aiConfig && tenant.aiConfig.transferKeywords) || ['人工', '转人工', '真人', '找客服', '投诉'];
    const cleanText = text.trim().toLowerCase();
    for (const kw of keywords) {
      if (cleanText.includes(kw.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  // 2. 专属知识库轻量级检索与匹配 (RAG Matcher)
  matchKnowledgeBase(query, knowledgeBase = []) {
    if (!query || !knowledgeBase || knowledgeBase.length === 0) return [];
    
    const queryLower = query.toLowerCase();
    const scored = [];

    for (const item of knowledgeBase) {
      const q = (item.question || '').toLowerCase();
      const a = (item.answer || '').toLowerCase();

      let score = 0;
      // 完全包含或高度重合
      if (queryLower.includes(q) || q.includes(queryLower)) {
        score += 80;
      }

      // 字符/词汇交叉重合度打分
      const queryWords = queryLower.split(/[\s,，?？!！。]+/);
      for (const w of queryWords) {
        if (w.length >= 2) {
          if (q.includes(w)) score += 20;
          if (a.includes(w)) score += 10;
        }
      }

      if (score > 0) {
        scored.push({ item, score });
      }
    }

    // 按得分从高到低排序，取 Top 3
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 3).map(s => s.item);
  }

  // 3. AI 回答主入口 (双核驱动：大模型 API + 知识库意图引擎)
  async generateReply({ tenantId, query, conversationHistory = [] }) {
    const tenant = store.getTenantById(tenantId);
    if (!tenant) {
      return { text: '系统异常，未找到租户信息', tokensUsed: 0 };
    }

    // 检查积分余额
    const currentCredits = tenant.subscription.aiCredits || 0;
    if (currentCredits <= 0) {
      return {
        text: '当前 AI 智能客服积分已耗尽，正在为您呼叫人工在线客服...',
        tokensUsed: 0,
        creditsExhausted: true,
        shouldTransferToHuman: true
      };
    }

    // 检查是否主动要求转人工
    if (this.checkTransferIntent(query, tenant)) {
      return {
        text: '好的，正在为您转接在线人工客服坐席，请稍候片刻...',
        tokensUsed: 10,
        shouldTransferToHuman: true
      };
    }

    // 检索企业专属知识库
    const matchedKB = this.matchKnowledgeBase(query, tenant.knowledgeBase || []);

    const llmConfig = store.data.platformConfig.llmConfig || {};
    const apiKey = llmConfig.apiKey;
    const baseUrl = (llmConfig.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '');

    // 如果配置了大模型 API Key，发起大模型标准接口请求
    if (apiKey && apiKey.startsWith('sk-')) {
      try {
        const result = await this.callExternalLLM({
          apiKey,
          baseUrl,
          model: llmConfig.model || this.defaultModel,
          tenant,
          query,
          matchedKB,
          conversationHistory
        });

        // 扣除积分
        store.deductTokens(tenantId, result.tokensUsed);
        return result;

      } catch (err) {
        console.warn('[AI Service] 外网大模型调用失败，自动降级至知识库智能应答:', err.message);
      }
    }

    // 兜底引擎：基于知识库与人设的智能组装应答 (无 Key 或离线时 100% 可用)
    const fallbackResult = this.generateFallbackKnowledgeReply(tenant, query, matchedKB);
    store.deductTokens(tenantId, fallbackResult.tokensUsed);
    return fallbackResult;
  }

  // 调用兼容 OpenAI 规范的大模型 API
  async callExternalLLM({ apiKey, baseUrl, model, tenant, query, matchedKB, conversationHistory }) {
    const systemPrompt = tenant.aiConfig.promptSystem || '你是本公司的专业客服。请根据给定的知识库回答客户问题。';
    
    // 组装知识库上下文
    let kbContext = '';
    if (matchedKB.length > 0) {
      kbContext = '\n\n【企业专属知识库参考】：\n' + matchedKB.map((k, i) => `${i + 1}. 问：${k.question}\n   答：${k.answer}`).join('\n');
    }

    const messages = [
      { role: 'system', content: systemPrompt + kbContext }
    ];

    // 装配最近 4 条历史对话
    const recent = conversationHistory.slice(-4);
    for (const h of recent) {
      messages.push({
        role: h.fromRole === 'agent' || h.isAi ? 'assistant' : 'user',
        content: h.text
      });
    }
    messages.push({ role: 'user', content: query });

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 600
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LLM API 返回错误 (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const replyText = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '抱歉，暂时未能生成答案。';
    const tokensUsed = (data.usage && data.usage.total_tokens) || Math.round(replyText.length * 1.8 + query.length * 1.5 + 150);

    return {
      text: replyText,
      tokensUsed,
      source: 'llm_api',
      matchedCount: matchedKB.length
    };
  }

  // 知识库智能回复生成 (离线/无 Key 时高精准运作)
  generateFallbackKnowledgeReply(tenant, query, matchedKB) {
    let reply = '';
    let tokensUsed = 0;

    if (matchedKB.length > 0) {
      const top = matchedKB[0];
      reply = `${top.answer}`;
      if (matchedKB.length > 1) {
        reply += `\n\n您可能还想了解：\n👉 ${matchedKB[1].question}`;
      }
      tokensUsed = Math.round((query.length + reply.length) * 1.6 + 60);
    } else {
      // 知识库未命中
      if (tenant.aiConfig.autoTransferOnUnknown) {
        reply = `您好！针对您咨询的“${query}”，我已记录。知识库中暂未收录完全一致的解答，我正在为您转接在线人工客服经理...`;
        return {
          text: reply,
          tokensUsed: 60,
          shouldTransferToHuman: true
        };
      } else {
        reply = `您好！感谢您的咨询。关于您提到的问题，建议您留下联系电话或联系我们的人工客服，我们将为您提供更详细的解答！`;
        tokensUsed = 50;
      }
    }

    return {
      text: reply,
      tokensUsed,
      source: 'knowledge_base',
      matchedCount: matchedKB.length
    };
  }
}

module.exports = new AIService();
