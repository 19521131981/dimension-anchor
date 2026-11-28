/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR · 解读生成接口（Vercel Serverless）
   与本地后端 server.js 共用 lib/interpret-core.js：同一提示词、同一输出检测。
   环境变量（Vercel 控制台配置，绝不写入代码与 Git）：
     DEEPSEEK_API_KEY —— DeepSeek API Key
     DEEPSEEK_MODEL   —— 可选，默认 deepseek-chat
   CORS：仅允许本站域名。
   ══════════════════════════════════════════════════════════════════════ */
'use strict';
const CORE = require('../lib/interpret-core');

const ALLOWED_ORIGINS = [
  'https://dimanchor.xyz',
  'https://dimension-anchor.vercel.app'
];

function cors(req, res) {
  const origin = (req.headers && req.headers.origin) || '';
  res.setHeader('Access-Control-Allow-Origin',
    ALLOWED_ORIGINS.indexOf(origin) >= 0 ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

module.exports = async function (req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Method Not Allowed' }); return; }

  const KEY = process.env.DEEPSEEK_API_KEY;
  if (!KEY) {
    res.status(200).json({ ok: false, error: 'AI 通道未配置（缺少服务端密钥）' });
    return;
  }

  let ctx = null;
  try {
    ctx = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}');
  } catch (e) {
    res.status(200).json({ ok: false, error: '请求体解析失败' });
    return;
  }

  const callModel = CORE.callModelWith({
    key: KEY,
    model: process.env.DEEPSEEK_MODEL || CORE.DEFAULT_MODEL
  });

  try {
    const prompt = CORE.interpretPrompt(ctx);
    const r = await callModel([prompt.system, prompt.user],
      { temperature: 0.92, maxTokens: 4096 });

    const parsed = CORE.parseJSON(r.text);
    if (!parsed || !Array.isArray(parsed.chapters)) {
      res.status(200).json({ ok: false, error: '输出结构无法解析，已保留本地推演', model: r.model });
      return;
    }
    const chapters = CORE.normalizeChapters(parsed.chapters);
    let audit = CORE.auditChapters(chapters, ctx);
    let usage = r.usage, model = r.model, chaptersOut = chapters;
    /* 带反馈的一次重试：拒因反馈给模型重新生成；仍不合格才回落本地 */
    if (audit.reject && audit.reject.length) {
      console.log('[da-audit] reject:', JSON.stringify(audit.reject));
      const fb = '【上一稿被拒，原因：' + audit.reject.join('；') +
        '。请严格按输出要求重新生成——尤其注意 quote6 必须在 100–150 字，逐张牌每张 40–60 字。】';
      const r2 = await callModel([
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
        { role: 'assistant', content: r.text },
        { role: 'user', content: fb }
      ], { temperature: 0.92, maxTokens: 4096 });
      usage = r2.usage || usage; model = r2.model || model;
      const ch2 = CORE.normalizeChapters(CORE.parseJSON(r2.text));
      const a2 = CORE.auditChapters(ch2, ctx);
      if (!a2.reject.length) { chaptersOut = ch2; audit = a2; }
      else {
        console.log('[da-audit] retry-reject:', JSON.stringify(a2.reject));
        res.status(200).json({ ok: false, error: '输出未通过确定性校验（' + a2.reject[0] + '），已保留本地推演', model: model, usage: usage });
        return;
      }
    }
    if (audit.warns && audit.warns.length) {
      console.log('[da-audit] warns:', JSON.stringify(audit.warns));
    }
    res.status(200).json({
      ok: true, model: model, usage: usage,
      chapters: chaptersOut,
      auditWarns: audit.warns || []
    });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e && e.message || e).slice(0, 200) });
  }
};
