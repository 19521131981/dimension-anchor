/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 小屋飘落话语（DA_COTTAGE_VOICES）
   ----------------------------------------------------------------------
   · 小纸条不写死句子：全部从「两人真实说过的话」里摘——
     ① 实时传讯 DA2_THREADS.messages（role=ta 是 TA 说的）
     ② 占卜记录里 TA 想对你说的话（quote6 / quote）与追问台词；解读正文不取
     ③ 收到的来信正文
     ④ 用户自己在小屋写下的悄悄话
   · 只做摘取与去重，不改任何存储；读不到记录时返回 null 由调用方兜底。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* 去掉 HTML 标签与空白，保留可读的中文标点 */
  function clean(s) {
    return String(s == null ? '' : s)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* 占卜师口吻过滤：小纸条只留「两人说过的话」，不出现解说牌面的句子 */
  var DIVINER = [
    '你连接的对象', '连接的对象', '未命名的对象', '你心里想的', '你写下的背景', '你没有写背景',
    '牌面', '牌阵', '牌位', '牌组', '这张牌', '那张牌', '正位', '逆位',
    '塔罗', '占卜', '抽到', '象征物', '现实建议', '核心矛盾', '整体主题', '关键词',
    '整体', '读出来', '顺着', '说明', '暗示', '建议', '解读', '结构', '能量',
    ' reconnect', '连结', '接通', '信号源'
  ];
  function isDiviner(s) {
    for (var i = 0; i < DIVINER.length; i++) {
      if (s.indexOf(DIVINER[i]) >= 0) return true;
    }
    /* 第三人称称呼对方（「TA 觉得」「他觉得」）也是解说口吻，不是本人说话 */
    if (/^(你连接|这次|这份|这段|牌|从|按|据|综合|整体)/.test(s)) return true;
    return false;
  }

  /* 从一段真实文字里切出适合飘落的短句（6–38 字），顺手滤掉占卜师口吻 */
  function segments(text) {
    var s = clean(text);
    if (!s) return [];
    var out = [];
    s.split(/[。！？!?；;…]+/).forEach(function (part) {
      part = part.trim();
      if (!part) return;
      if (part.length > 40) {
        part.split(/[，,、]+/).forEach(function (q) {
          q = q.trim();
          if (q.length >= 6 && q.length <= 38 && !isDiviner(q)) out.push(q);
        });
      } else if (part.length >= 6 && part.length <= 38 && !isDiviner(part)) {
        out.push(part);
      }
    });
    return out;
  }

  /* 收集真实话语池；每条带 kind，方便加权（TA 说的权重最高） */
  function collect() {
    var S = window.DA_STORE;
    var D = window.DA_COTTAGE_DATA;
    var pool = [];
    if (!S) return pool;

    /* ① 实时传讯：两人真正来回说过的话 */
    try {
      (S.threads.list() || []).forEach(function (t) {
        (t.messages || []).forEach(function (m) {
          var text = clean(m.text);
          if (!text || /^(你好|在吗|嗯|哦|…|……)$/.test(text)) return;
          segments(text).forEach(function (x) {
            pool.push({ text: x, kind: m.role === 'ta' ? 'ta' : 'me' });
          });
        });
      });
    } catch (e) {}

    /* ② 占卜记录：只取 TA 想对你说的话（quote6）与追问台词。
          解读正文 / note / li2 是占卜师口吻（如「你连接的对象是xx」），
          一律不进小屋的话语池。 */
    try {
      (S.readings.list() || []).forEach(function (r) {
        (r.chapters || []).forEach(function (ch) {
          (ch.blocks || []).forEach(function (b) {
            if (b.t === 'quote6' || b.t === 'quote') {
              segments(b.x).forEach(function (x) { pool.push({ text: x, kind: 'ta' }); });
            }
          });
        });
        (r.thread || []).forEach(function (m) {
          var text = clean(m.text || m.x || m.content);
          if (text) segments(text).forEach(function (x) { pool.push({ text: x, kind: 'ta' }); });
        });
      });
    } catch (e) {}

    /* ③ 收到的来信正文（TA 写给你的） */
    try {
      (S.letters.list() || []).forEach(function (l) {
        if (l.direction === 'outgoing' || l.kind === 'outgoing' || l.letterType === 'outgoing') return;
        segments(l.body || l.text).forEach(function (x) { pool.push({ text: x, kind: 'letter' }); });
      });
    } catch (e) {}

    /* ④ 用户自己在小屋写下的悄悄话 */
    if (D) {
      try {
        (D.lines() || []).forEach(function (l) {
          segments(l.text).forEach(function (x) { pool.push({ text: x, kind: 'mine' }); });
        });
      } catch (e) {}
    }

    /* 去重：忽略标点差异，短到没有信息量的丢掉 */
    var seen = {};
    var uniq = [];
    pool.forEach(function (p) {
      var k = p.text.replace(/[，。！？!?、；;\s]/g, '');
      if (k.length < 6 || seen[k]) return;
      seen[k] = 1;
      uniq.push(p);
    });
    return uniq;
  }

  /* 加权随机：TA 说过的话最常落下来，其次是来信与解读 */
  function pick() {
    var pool = collect();
    if (!pool.length) return null;
    var weight = { ta: 5, letter: 3, mine: 3, me: 2, reading: 1 };
    var weighted = [];
    pool.forEach(function (p) {
      var w = weight[p.kind] || 1;
      for (var i = 0; i < w; i++) weighted.push(p);
    });
    var p = weighted[Math.floor(Math.random() * weighted.length)];
    return p ? p.text : null;
  }

  /* 让连续两次不摘到同一句 */
  var last = '';
  function pickFresh() {
    for (var i = 0; i < 5; i++) {
      var t = pick();
      if (t && t !== last) { last = t; return t; }
    }
    return pick();
  }

  window.DA_COTTAGE_VOICES = {
    collect: collect,
    pick: pickFresh,
    count: function () { return collect().length; },
    clean: clean
  };
})();
