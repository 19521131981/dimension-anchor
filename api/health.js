/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR · AI 通道健康探测（Vercel Serverless）
   前端 da-ai.js 以 GET /api/health 探测解读 AI 通道是否可用。
   只暴露 ok/model，不暴露任何密钥与内部信息。
   ══════════════════════════════════════════════════════════════════════ */
'use strict';
const CORE = require('../lib/interpret-core');

const ALLOWED_ORIGINS = [
  'https://dimanchor.xyz',
  'https://dimension-anchor.vercel.app'
];

module.exports = async function (req, res) {
  const origin = (req.headers && req.headers.origin) || '';
  res.setHeader('Access-Control-Allow-Origin',
    ALLOWED_ORIGINS.indexOf(origin) >= 0 ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const hasKey = !!process.env.DEEPSEEK_API_KEY;
  res.status(200).json({
    ok: hasKey,
    model: hasKey ? (process.env.DEEPSEEK_MODEL || CORE.DEFAULT_MODEL) : '',
    error: hasKey ? '' : 'not-configured'
  });
};
