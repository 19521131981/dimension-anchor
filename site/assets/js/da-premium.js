/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 深度探索权益 DA_PREMIUM
   ----------------------------------------------------------------------
   付费状态只以云数据库为准。前端不保存、不缓存、不推断 Premium。
   · 兑换：da_redeem_code（服务端哈希比对 + 行锁 + 有效期/次数/禁用校验）
   · 追问：每次先调 da_ask_authorize 取得一次性票据，再调用模型通道，
           最后 da_ask_consume 核销票据。Free 身份在数据库里就会被拒绝。
   · 管理端：管理员身份来自 da_admins（一次性密钥认领），所有管理操作
           都在 SECURITY DEFINER 函数内再次校验，前端隐藏按钮不算权限。
   ══════════════════════════════════════════════════════════════════════ */

window.DA_PREMIUM = (function () {
  'use strict';

  var cfg = window.DA_CLOUD_CONFIG || {};
  var cloud = null;

  function client() {
    if (cloud) return cloud;
    if (window.DA_AUTH && typeof window.DA_AUTH.client === 'function') {
      cloud = window.DA_AUTH.client();
      if (cloud) return cloud;
    }
    if (window.WorkBuddyCloud && cfg.endpoint && cfg.publishableKey) {
      try {
        cloud = window.WorkBuddyCloud.createWorkBuddyCloud({
          endpoint: cfg.endpoint,
          oauthRelayBaseUrl: cfg.oauthRelayBaseUrl || '',
          publishableKey: cfg.publishableKey
        });
      } catch (e) { cloud = null; }
    }
    return cloud;
  }

  function ready() {
    var c = client();
    if (!c) return Promise.reject(err('CLOUD_UNAVAILABLE'));
    if (window.DA_AUTH && typeof window.DA_AUTH.init === 'function') {
      return window.DA_AUTH.init().then(function () { return c; });
    }
    return Promise.resolve(c);
  }

  function err(code, detail) {
    var e = new Error(code);
    e.code = code;
    if (detail) e.detail = detail;
    return e;
  }

  function rpc(name, args) {
    return ready().then(function (c) {
      return c.database.rpc(name, args || {});
    }).then(function (r) {
      if (r && r.error) {
        var e = err('SERVER_' + (r.error.code || 'ERROR'), r.error.message);
        throw e;
      }
      return r && r.data;
    });
  }

  function signedIn() {
    return !!(window.DA_AUTH && window.DA_AUTH.uid && window.DA_AUTH.uid());
  }

  /* 打开通行证，等用户真正登录成功后再继续（不伪造会话） */
  function ensureSignIn() {
    return ready().then(function () {
      if (signedIn()) return true;
      if (window.DA_AUTH && window.DA_AUTH.open) window.DA_AUTH.open();
      return new Promise(function (resolve, reject) {
        var done = false;
        var timer = setTimeout(function () {
          if (done) return;
          done = true;
          document.removeEventListener('da:authchange', onChange);
          reject(err('SIGN_IN_REQUIRED'));
        }, 300000);
        function onChange(ev) {
          if (done) return;
          if (ev && ev.detail && ev.detail.signedIn && signedIn()) {
            done = true;
            clearTimeout(timer);
            document.removeEventListener('da:authchange', onChange);
            resolve(true);
          }
        }
        document.addEventListener('da:authchange', onChange);
      });
    });
  }

  /* ── 权限查询：每次都重新问数据库 ───────────────────────────── */
  function status() {
    return rpc('da_premium_status').then(function (d) {
      if (!d) return { tier: 'free', active: false };
      return d;
    });
  }

  /* ── 兑换占卜码 ─────────────────────────────────────────────── */
  function redeem(code) {
    var c = String(code || '').trim();
    if (!c) return Promise.reject(err('EMPTY_CODE'));
    return ensureSignIn()
      .then(function () { return rpc('da_redeem_code', { p_code: c }); })
      .then(function (d) {
        if (!d) throw err('SERVER_NO_RESULT');
        return d;
      });
  }

  /* ── 把解读上下文组装成模型消息 ─────────────────────────────── */
  var SYSTEM = [
    '你是「塔罗观测站」的深度解读者，正在陪用户继续探索一次已经完成的占卜。',
    '',
    '硬性规则：',
    '1. 只能使用下面给出的牌面、牌位、正逆位、人物档案、六章解读和对话历史。',
    '   绝对不许重新抽牌、替换牌名、改写正逆位，也不许假装出现了新的牌。',
    '2. 推测只能写成可能性。不许把猜测写成事实，不许做确定的未来预测，',
    '   不许断言对方的真实想法或给出医疗、法律、财务结论。',
    '3. 用户若标记「部分符合 / 不符合」并补充真实事件，以用户补充的信息为准，',
    '   重新组织分析，不要坚持原来的结论，也不要说「牌不会错」。',
    '4. 回答要针对这一问，不要复述六章原文，不要六段套话，不要每次用同一句开场。',
    '5. 不出现「作为 AI」「根据塔罗牌显示」「模型」「接口」等元叙述；',
    '   不编造用户没说过的具体时间、地点、事件。',
    '6. 中文写作，语气克制、有文学感但清楚易懂，250–450 字，可分 2–3 段。'
  ].join('\n');

  function plain(v) { return String(v == null ? '' : v).slice(0, 4000); }

  function buildMessages(ctx) {
    ctx = ctx || {};
    var lines = [];

    lines.push('【本次占卜】');
    lines.push('原始问题：' + plain(ctx.question || '（用户没有填写，按牌面与关系背景继续）'));
    if (ctx.spreadCn) lines.push('牌阵：' + plain(ctx.spreadCn));
    if (ctx.relation) lines.push('关系：' + plain(ctx.relation));
    if (ctx.background) lines.push('关系背景：' + plain(ctx.background));
    if (ctx.profile) lines.push('人物档案：' + plain(ctx.profile));

    lines.push('');
    lines.push('【全部牌面 · 顺序与正逆位不可更改】');
    (ctx.cards || []).forEach(function (c, i) {
      lines.push((i + 1) + '. 第 ' + plain(c.slot) + ' 位「' + plain(c.positionCn) + '」：' +
        plain(c.cn) + '（' + plain(c.en) + '）· ' + plain(c.orientation) +
        (c.keywords ? ' · 关键词：' + plain(c.keywords) : ''));
    });
    if (ctx.supp && ctx.supp.length) {
      lines.push('补充牌：' + ctx.supp.map(function (s) {
        return plain(s.cn) + '·' + plain(s.orientation);
      }).join('；'));
    }

    lines.push('');
    lines.push('【已有的六章解读 · 仅供你理解上下文，不要照抄】');
    (ctx.chapters || []).forEach(function (ch) {
      lines.push('◆ ' + plain(ch.no) + ' ' + plain(ch.title) + '\n' + plain(ch.text));
    });

    lines.push('');
    lines.push('【历史对话】');
    var hist = (ctx.history || []).slice(-8);
    if (!hist.length) lines.push('（这是第一次追问）');
    hist.forEach(function (h) {
      lines.push('用户：' + plain(h.q));
      lines.push('回应：' + plain(h.a));
    });

    if (ctx.chapterTitle) {
      lines.push('');
      lines.push('【本次追问所针对的章节】' + plain(ctx.chapterTitle));
    }
    if (ctx.feedback) {
      lines.push('【用户对上一次分析的校准】' + plain(ctx.feedback) +
        '。请依据这条反馈重新分析，不要维护原结论。');
    }
    lines.push('');
    lines.push('【用户现在这一问】' + plain(ctx.ask));

    return [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: lines.join('\n') }
    ];
  }

  /* ── 模型通道（免密钥，SDK 自动带会话） ─────────────────────── */
  function callLLM(messages) {
    return ready().then(function (c) {
      if (!c.llm || !c.llm.chat || !c.llm.models) throw err('LLM_UNAVAILABLE');
      return Promise.resolve(c.llm.models.list()).then(function (list) {
        var m = (list || []).filter(function (x) {
          return x && x.disabled !== true && x.enabled !== false && x.id;
        })[0];
        if (!m) throw err('NO_MODEL');
        var out = '';
        return (async function () {
          var stream = c.llm.chat.completions.create({
            model: m.id,
            messages: messages,
            stream: true,
            temperature: 0.85
          });
          for await (var chunk of stream) {
            var d = chunk && chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
            if (d && d.content) out += d.content;
          }
          if (!out.trim()) throw err('EMPTY_ANSWER');
          return out.trim();
        })();
      });
    });
  }

  /* ── Premium 追问：服务端鉴权 → 模型 → 票据核销 ───────────── */
  function ask(ctx) {
    return ensureSignIn().then(function () {
      return rpc('da_ask_authorize', {
        p_reading_id: String((ctx && ctx.readingId) || ''),
        p_chapter: String((ctx && ctx.chapterTitle) || ''),
        p_question: String((ctx && ctx.ask) || ''),
        p_feedback: String((ctx && ctx.feedback) || '')
      });
    }).then(function (a) {
      if (!a || a.ok !== true) {
        throw err((a && a.reason) || 'PREMIUM_REQUIRED');
      }
      return callLLM(buildMessages(ctx)).then(function (text) {
        return rpc('da_ask_consume', { p_ticket: a.ticket }).then(function () {
          return { text: text, model: '深度探索' };
        });
      });
    });
  }

  /* ── 管理端 ─────────────────────────────────────────────────── */
  function adminStatus() {
    return rpc('da_is_admin').then(function (v) { return v === true; });
  }
  function adminClaim(secret) {
    return ensureSignIn().then(function () {
      return rpc('da_admin_claim', { p_secret: String(secret || '').trim() });
    });
  }
  function adminGenerate(o) {
    o = o || {};
    return rpc('da_admin_generate_codes', {
      p_count: Number(o.count) || 1,
      p_days: Number(o.days) || 30,
      p_uses: Number(o.uses) || 1,
      p_label: String(o.label || '')
    });
  }
  function adminList() { return rpc('da_admin_list_codes'); }
  function adminDisable(id, disabled) {
    return rpc('da_admin_disable_code', { p_id: Number(id), p_disabled: !!disabled });
  }
  function adminRedemptions() { return rpc('da_admin_redemptions'); }

  /* 错误码 → 用户读得懂的一句话 */
  function message(e) {
    var c = (e && e.code) || '';
    var map = {
      SIGN_IN_REQUIRED: '请先点亮星际通行证，权益要绑定到你的账号。',
      PREMIUM_REQUIRED: '深度探索需要有效的占卜码，请先解锁。',
      CLOUD_UNAVAILABLE: '云服务暂时没连上，稍后再试。',
      LLM_UNAVAILABLE: '星空通道暂时没连上，稍后再试。',
      NO_MODEL: '暂时没有可用的解读通道，稍后再试。',
      EMPTY_ANSWER: '这次没有收到回应，再问一次试试。',
      EMPTY_CODE: '请先输入占卜码。',
      INVALID: '这个占卜码不存在，检查一下有没有输错。',
      expired: '这个占卜码已经过期了。',
      used: '这个占卜码的可用次数已经用完。',
      disabled: '这个占卜码已被停用。',
      ADMIN_REQUIRED: '当前账号没有管理权限。',
      INVALID_SECRET: '管理员密钥不正确或已被使用。',
      RATE_LIMITED: '问得太快了，稍等一会儿再继续。',
      SERVER_NO_RESULT: '服务端没有返回结果，稍后再试。'
    };
    if (map[c]) return map[c];
    if (/^SERVER_/.test(c)) return '服务端暂时没有回应，稍后再试。';
    return (e && e.message) || '出了点问题，再试一次。';
  }

  return {
    client: client, ready: ready, status: status, signedIn: signedIn,
    ensureSignIn: ensureSignIn, redeem: redeem, ask: ask,
    buildMessages: buildMessages, message: message,
    adminStatus: adminStatus, adminClaim: adminClaim,
    adminGenerate: adminGenerate, adminList: adminList,
    adminDisable: adminDisable, adminRedemptions: adminRedemptions
  };
})();
