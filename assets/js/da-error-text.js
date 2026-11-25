/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 统一错误文案归一化
   把英文技术错误 / 内部错误码映射成用户能读懂的一句话。
   识别不了的：若是中文业务文案则原样保留；若像数据库/SDK/HTTP 原始
   报文（英文技术串、堆栈、JSON 片段），一律兜底为统一中文提示，
   绝不把原始异常直接显示给用户。开发诊断信息仍保留在调用方内部。
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

  var GENERIC = '出了点问题，稍后再试一次。';

  /* 判断一段文案是否像「不该给用户看的原始技术报文」。 */
  function looksTechnical(s) {
    if (!s) return false;
    /* 含中文的短句基本是业务文案，原样保留。 */
    if (/[\u4e00-\u9fa5]/.test(s)) return false;
    /* 堆栈帧、Error 类名、JSON/数组片段。 */
    if (/^\s*(at\s+\S+\s+\(|[A-Za-z_$][\w$]*Error\b|[\[{])/.test(s)) return true;
    /* 两个及以上英文技术词（业务中文文案不会这样）。 */
    var words = s.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) || [];
    if (words.length >= 2) return true;
    /* 单个典型技术词。 */
    if (/\b(postgrest|supabase|fetch|timeout|syntaxerror|referenceerror|typeerror|unauthorized|forbidden|internal|endpoint|payload|token|jwt|rpc|uuid|constraint|violation|duplicate|null|undefined|http|https|sql|error|failed|denied|expired)\b/i.test(s)) return true;
    /* HTTP 状态码 / 十六进制错误码 / 带符号的错误串。 */
    if (/\b[45]\d{2}\b|0x[0-9a-f]+|::|[=<>]/.test(s)) return true;
    return false;
  }

  function text(e, fallback) {
    var s = (e && e.message) || (typeof e === 'string' ? e : '') || fallback || '';
    if (!s) return fallback || GENERIC;
    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i][0].test(s)) return RULES[i][1];
    }
    if (looksTechnical(s)) return GENERIC;
    return s; /* 中文业务文案原样保留 */
  }
  text.RULES = RULES; /* 便于审计与测试 */
  text.GENERIC = GENERIC;
  text.looksTechnical = looksTechnical;

  window.DAErrorText = text;
})();
