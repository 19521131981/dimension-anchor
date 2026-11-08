/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — AI 接入层（第二阶段）
   ----------------------------------------------------------------------
   前端永远拿不到 API Key。所有请求打到同源的 /api/*，由 server.js
   在服务端带着 DEEPSEEK_API_KEY 转发给模型。

   没有后端 / 没有 Key / 请求失败 → 一律安静回落到本地规则引擎
   （DA_READING），页面照常可用，只是来源标签写「本地推演」。

   注意：用 file:// 直接打开页面时没有同源后端，会自动走本地引擎。
   ══════════════════════════════════════════════════════════════════════ */

window.DA_AI = (function () {
  'use strict';

  var state = {
    checked: false,
    ok: false,
    model: '',
    source: 'local',   /* local | ai */
    lastError: ''
  };

  var TIMEOUT = 45000;

  function base() {
    /* 同源；file:// 协议下协议是 'file:', 没有 host，直接判不可用 */
    return (location.protocol === 'http:' || location.protocol === 'https:') ? '' : null;
  }

  function fetchJSON(url, opt) {
    opt = opt || {};
    var ctrl = null, timer = null;
    var init = {
      method: opt.method || 'GET',
      headers: { 'Content-Type': 'application/json' }
    };
    if (opt.body) init.body = JSON.stringify(opt.body);
    if (window.AbortController) {
      ctrl = new AbortController();
      init.signal = ctrl.signal;
      timer = setTimeout(function () { ctrl.abort(); }, opt.timeout || TIMEOUT);
    }
    return fetch(url, init).then(function (r) {
      if (timer) clearTimeout(timer);
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var err = new Error(j && j.error ? j.error : ('HTTP ' + r.status));
          err.payload = j;
          throw err;
        }
        return j;
      });
    }).catch(function (e) {
      if (timer) clearTimeout(timer);
      throw e;
    });
  }

  /* ── 探活：只探一次 ───────────────────────────────────── */
  var probing = null;
  function probe() {
    if (state.checked) return Promise.resolve(state);
    if (probing) return probing;

    var b = base();
    if (b === null) {
      state.checked = true;
      state.ok = false;
      state.lastError = 'file 协议下没有同源后端';
      return Promise.resolve(state);
    }

    probing = fetchJSON(b + '/api/health', { timeout: 2500 })
      .then(function (j) {
        state.checked = true;
        state.ok = !!j.ok;
        state.model = j.model || '';
        if (!j.ok && j.error) state.lastError = j.error;
        return state;
      })
      .catch(function (e) {
        state.checked = true;
        state.ok = false;
        state.lastError = (e && e.message) || '后端不可达';
        return state;
      })
      .then(function (s) { probing = null; return s; });

    return probing;
  }

  /* ── 牌面压缩：只发解读真正需要的字段 ─────────────────── */
  function packCards(session) {
    var D = window.DA_TAROT;
    return (session.cards || []).filter(function (c) { return c.placed; }).map(function (c) {
      var d = D.byId(c.id) || {};
      return {
        slot: c.slot,
        pos: c.positionCn || '',
        posDesc: c.positionDesc || '',
        name: c.cn || d.cn || '',
        en: d.en || '',
        orient: c.reversed ? '逆位' : '正位',
        kw: (c.reversed ? (d.kr || []) : (d.ku || [])).slice(0, 5),
        core: (c.reversed ? (d.rev || '') : (d.up || '')).slice(0, 220),
        supp: !!c.supp
      };
    });
  }

  function packContext(o) {
    o = o || {};
    var link = o.link || {};
    var profile = o.profileId && window.DA_STORE
      ? window.DA_STORE.profiles.summary(o.profileId)
      : (o.profile || '');
    return {
      question: link.question || o.question || '',
      subject: link.subjectName || '',
      work: link.workName || '',
      relation: link.relation || '',
      background: link.background || '',
      mode: link.mode || 'known',
      profile: profile || '',
      spread: (o.session && o.session.spreadCn) || '',
      deck: (o.session && o.session.deckMode) || 78,
      cards: o.session ? packCards(o.session) : (o.cards || []),
      supp: o.supp || [],
      history: o.history || []
    };
  }

  /* ── 六章解读 ─────────────────────────────────────────── */
  function interpret(o) {
    var b = base();
    if (b === null) return Promise.reject(new Error('没有同源后端'));

    return probe().then(function (s) {
      if (!s.ok) throw new Error(s.lastError || '后端未启用');
      return fetchJSON(b + '/api/interpret', {
        method: 'POST',
        body: packContext(o),
        timeout: 90000
      });
    }).then(function (j) {
      if (!j || !j.chapters || !j.chapters.length) throw new Error('返回内容为空');
      state.source = 'ai';
      state.model = j.model || state.model;
      return j;
    });
  }

  /* ── 追问 ─────────────────────────────────────────────── */
  function ask(o, question) {
    var b = base();
    if (b === null) return Promise.reject(new Error('没有同源后端'));

    return probe().then(function (s) {
      if (!s.ok) throw new Error(s.lastError || '后端未启用');
      var ctx = packContext(o);
      ctx.question = question;
      return fetchJSON(b + '/api/ask', {
        method: 'POST',
        body: ctx,
        timeout: 60000
      });
    }).then(function (j) {
      if (!j || !j.text) throw new Error('返回内容为空');
      state.source = 'ai';
      return j;
    });
  }

  /* ── 传讯 ─────────────────────────────────────────────── */
  function chat(o, messages) {
    var b = base();
    if (b === null) return Promise.reject(new Error('没有同源后端'));

    return probe().then(function (s) {
      if (!s.ok) throw new Error(s.lastError || '后端未启用');
      return fetchJSON(b + '/api/chat', {
        method: 'POST',
        body: {
          profile: window.DA_STORE ? window.DA_STORE.profiles.summary(o.profileId) : (o.profile || ''),
          link: o.link || {},
          messages: (messages || []).slice(-24).map(function (m) {
            return { role: m.role === 'me' ? 'user' : 'assistant', content: m.text };
          })
        },
        timeout: 60000
      });
    }).then(function (j) {
      if (!j || !j.text) throw new Error('返回内容为空');
      return j;
    });
  }

  /* ── 星际通讯局 · 信件生成（复用同一服务层与探活） ────── */
  function letter(payload) {
    var b = base();
    if (b === null) return Promise.reject(new Error('没有同源后端'));

    return probe().then(function (s) {
      if (!s.ok) throw new Error(s.lastError || '后端未启用');
      return fetchJSON(b + '/api/letter', {
        method: 'POST',
        body: payload || {},
        timeout: 100000
      });
    }).then(function (j) {
      if (!j || !j.ok || !j.letter) throw new Error((j && j.error) || '返回内容为空');
      state.source = 'ai';
      state.model = j.model || state.model;
      return j;
    });
  }

  /* ── 给用户看的「会发出去什么」清单 ───────────────────── */
  function disclosure(o) {
    var link = (o && o.link) || {};
    var rows = [
      { k: '你的问题', v: link.question || '（未填写）' },
      { k: '牌阵数据', v: (o && o.session ? packCards(o.session).length : 0) + ' 张牌的牌名 / 正逆位 / 牌位' },
      { k: '连接对象', v: link.subjectName || '（未填写）' },
      { k: '关系与背景', v: [link.relation, link.background].filter(Boolean).join('｜') || '（未填写）' },
      { k: '角色档案', v: (o && o.profileId && window.DA_STORE
          ? window.DA_STORE.profiles.summary(o.profileId) : '（未使用）') }
    ];
    return rows;
  }

  function statusText() {
    if (!state.checked) return '正在确认 AI 通道';
    if (!state.ok) return '本地推演';
    return 'DeepSeek' + (state.model ? ' · ' + state.model : '');
  }

  return {
    probe: probe,
    interpret: interpret,
    ask: ask,
    chat: chat,
    letter: letter,
    packCards: packCards,
    packContext: packContext,
    disclosure: disclosure,
    statusText: statusText,
    state: state,
    available: function () { return !!state.ok; }
  };
})();
