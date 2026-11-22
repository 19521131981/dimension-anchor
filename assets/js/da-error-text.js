/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 统一错误文案归一化
   把英文技术错误 / 内部错误码映射成用户能读懂的一句话。
   识别不了的原文原样返回（向后兼容，不吞掉业务文案）。
   暴露：window.DAErrorText(e, fallback) → string
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* 顺序即优先级：越具体越靠前 */
  var RULES = [
    [/DATABASE_|PGRST\s*\d+|failed to parse filter|schema cache|column .* does not exist|relation .* does not exist/i,
      '云服务暂时读不到，稍后再试一次。'],
    [/invalid_client|credential is invalid|invalid_grant|unauthorized|401|403/i,
      '云服务连接暂时失效，稍后再试一次。'],
    [/Failed to fetch|fetch failed|network|ENET|ECONN|ETIMEDOUT|timeout|超时/i,
      '网络没连上，检查一下再试。'],
    [/\b50[0234]\b|LLM_UNAVAILABLE|NO_MODEL|EMPTY_ANSWER|SERVER_NO_RESULT|后端不可达|星空通道/i,
      '星空通道暂时没连上，稍后再试。'],
    [/RATE_LIMITED|too many|rate.?limit|frequen|频繁/i,
      '刚才太频繁了，稍等一会儿再试。'],
    [/CLOUD_UNAVAILABLE/i, '云服务暂时没连上，稍后再试。'],
    [/JSON|SyntaxError|Unexpected token|parse error|解析失败/i,
      '数据读取出了点问题，稍后再试。']
  ];

  function text(e, fallback) {
    var s = (e && e.message) || (typeof e === 'string' ? e : '') || fallback || '';
    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i][0].test(s)) return RULES[i][1];
    }
    return s;
  }
  text.RULES = RULES; /* 便于审计与测试 */

  window.DAErrorText = text;
})();
