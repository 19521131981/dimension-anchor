/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 星际通讯局 · 信件数据层 DA_MAIL
   ----------------------------------------------------------------------
   统一三种运行模式，页面只认这一层接口：

     server  同源 node server.js（http://127.0.0.1:4321）
             —— /api/letters/* 真实持久化 + DeepSeek 生成
     cloud   WorkBuddy 云服务（发布站点）
             —— 云数据库 letters 表 + 免密钥大模型
     local   file:// 双击打开或离线
             —— 仅本机暂存（localStorage），AI 不可用，页面如实标注

   信件记录（camelCase，页面使用）：
     { id, direction:'in'|'out', status:'unread'|'read'|'draft'|'sent',
       title, greeting, body, signature, mood, letterType,
       charId, charName, relationCn, themeKey, faved, source:'ai'|'user',
       model, replyTo, dateKey, at, updatedAt, payload }
   持久层键名 lid = id（客户端生成，唯一约束承担幂等）。
   ══════════════════════════════════════════════════════════════════════ */

window.DA_MAIL = (function () {
  'use strict';

  var S = window.DA_STORE, LT = window.DA_LETTER;
  var state = { mode: '', checked: false, device: '', cloudReady: false };

  function uid() {
    try {
      var v = localStorage.getItem('DA2_DEVICE_ID');
      if (!v) { v = 'dv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); localStorage.setItem('DA2_DEVICE_ID', v); }
      return v;
    } catch (e) { return 'dv_ephemeral'; }
  }
  function lid() { return 'lt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /* ── 记录 ↔ 持久层 映射 ─────────────────────────────────── */
  function toRec(r) {
    return {
      id: r.lid || r.id, direction: r.direction || 'in',
      status: r.status || (r.direction === 'out' ? 'sent' : 'unread'),
      title: r.title || '', greeting: r.greeting || '', body: r.body || '',
      signature: r.signature || '', mood: r.mood || '', letterType: r.letterType || r.letter_type || '',
      charId: r.charId || r.char_id || '', charName: r.charName || r.char_name || '',
      relationCn: r.relationCn || r.relation_cn || '', themeKey: r.themeKey || r.theme_key || '',
      faved: !!r.faved, source: r.source || 'ai', model: r.model || '',
      replyTo: r.replyTo || '', dateKey: r.dateKey || r.date_key || '',
      payload: r.payload || null,
      cards: r.cards || (r.payload && r.payload.cards) || null,
      at: r.at || (r.created_at ? Date.parse(r.created_at) : Date.now()),
      updatedAt: r.updatedAt || (r.updated_at ? Date.parse(r.updated_at) : Date.now())
    };
  }
  function toRow(rec, dev) {
    return {
      lid: rec.id, device_id: dev, direction: rec.direction || 'in', status: rec.status || 'unread',
      title: rec.title || '', greeting: rec.greeting || '', body: rec.body || '',
      signature: rec.signature || '', mood: rec.mood || '', letter_type: rec.letterType || '',
      char_id: rec.charId || '', char_name: rec.charName || '', relation_cn: rec.relationCn || '',
      theme_key: rec.themeKey || '', faved: !!rec.faved, source: rec.source || 'user',
      model: rec.model || '', reply_to: rec.replyTo || '', date_key: rec.dateKey || '',
      payload: rec.payload || null
    };
  }

  /* ── 探活 ─────────────────────────────────────────────────── */
  function probeServer() {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return Promise.resolve(false);
    var ctrl = null, timer = null;
    if (window.AbortController) {
      ctrl = new AbortController(); timer = setTimeout(function () { ctrl.abort(); }, 2500);
    }
    return fetch('/api/letters?probe=1', { headers: { 'x-device-id': state.device }, signal: ctrl && ctrl.signal })
      .then(function (r) {
        if (timer) clearTimeout(timer);
        if (!r.ok) return false;
        return r.json().then(function (j) { return !!(j && j.ok); }).catch(function () { return false; });
      })
      .catch(function () { if (timer) clearTimeout(timer); return false; });
  }

  function init() {
    if (state.checked) return Promise.resolve(state);
    state.device = uid();
    return probeServer().then(function (ok) {
      var shared = (window.DA_AUTH && window.DA_AUTH.client) ? window.DA_AUTH.client() : null;
      if (!shared && window.WorkBuddyCloud && window.DA_CLOUD_CONFIG && window.DA_CLOUD_CONFIG.endpoint) {
        try {
          shared = window.WorkBuddyCloud.createWorkBuddyCloud({
            endpoint: window.DA_CLOUD_CONFIG.endpoint,
            oauthRelayBaseUrl: window.DA_CLOUD_CONFIG.oauthRelayBaseUrl || '',
            publishableKey: window.DA_CLOUD_CONFIG.publishableKey
          });
        } catch (e) { shared = null; }
      }
      if (shared) state.cloud = shared;

      /* 通行证与数据源解耦：任何模式下都初始化登录态，否则用户看不到入口 */
      var auth = window.DA_AUTH;
      var authReady = (auth && auth.init) ? auth.init().catch(function () {}) : Promise.resolve(null);
      state.serverOk = !!ok;

      /* 登录 / 退出时切换档案归属：登录 → 账号云端档案；退出 → 回到本机 / 本服务 */
      if (auth && auth.onChange) {
        auth.onChange(function () {
          if (preferCloud()) {
            state.mode = 'cloud';
            claimLegacy();     /* 把本设备登录前写的信并入账号，历史不断档 */
          } else if (state.mode === 'cloud' && state.serverOk) state.mode = 'server';
        });
      }

      if (ok) {
        state.mode = 'server';
        state.checked = true;
        return authReady.then(function () {
          if (preferCloud()) state.mode = 'cloud';   /* 已登录 → 走账号档案 */
          else if (state.cloud) cloudModel().catch(function () {});
          notifyAuth();
          return state;
        });
      }
      if (shared) {
        state.mode = 'cloud'; state.checked = true;
        cloudModel().catch(function () {});
        return authReady.then(function () { notifyAuth(); return state; });
      }
      state.mode = 'local'; state.checked = true;
      return authReady.then(function () { notifyAuth(); return state; });
    });
  }

  /* 已登录 + 有云客户端 + 不是本机调试 → 用账号档案（跨设备同一份） */
  function preferCloud() {
    var au = window.DA_AUTH;
    if (!state.cloud || !au || !au.uid || !au.uid()) return false;
    return !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  }

  /* 认领：把本设备登录前写下的信（user_id 为空）归到当前账号，
     否则旧信在账号档案里既改不了也删不掉，等于被锁死 */
  function claimLegacy() {
    var au = window.DA_AUTH;
    var u = (au && au.uid) ? au.uid() : '';
    if (!state.cloud || !u) return Promise.resolve(0);
    return state.cloud.database.from('letters')
      .update({ user_id: u })
      .eq('device_id', state.device).is('user_id', null).select()
      .then(function (r) { return ((r && r.data) || []).length; })
      .catch(function () { return 0; });
  }

  /* 登录态变化 → 通知页面重新取数据 */
  var authSubs = [];
  function notifyAuth() {
    authSubs.forEach(function (fn) { try { fn(); } catch (e) {} });
  }
  function onAuth(fn) {
    authSubs.push(fn);
    if (window.DA_AUTH && window.DA_AUTH.onChange) {
      window.DA_AUTH.onChange(function () { try { fn(); } catch (e) {} });
    }
  }

  /* 云端行的归属过滤：登录按 user_id，未登录按设备；返回构造器 */
  function scoped(q) {
    var au = window.DA_AUTH;
    var u = (au && au.uid) ? au.uid() : '';
    return u ? q.eq('user_id', u) : q.eq('device_id', state.device);
  }

  /* ══ 云端实现 ══════════════════════════════════════════════ */
  var _model = null, _modelP = null;
  function cloudModel() {
    if (_model) return Promise.resolve(_model);
    if (_modelP) return _modelP;
    _modelP = state.cloud.llm.models.list().then(function (list) {
      if (!list || !list.length) throw new Error('云端模型目录为空，暂时无法生成信件');
      var m = null;
      for (var i = 0; i < list.length; i++) if (list[i].disabled !== true) { m = list[i]; break; }
      if (!m) throw new Error('云端没有可用模型');
      _model = m; return m;
    }).catch(function (e) { _modelP = null; throw e; });
    return _modelP;
  }
  function unwrap(res, op) {
    if (res && res.error) {
      var e = new Error((res.error.message || (op + ' 失败')) + (res.error.code ? '（' + res.error.code + '）' : ''));
      e.code = res.error.code; throw e;
    }
    return res;
  }
  function cloudList(opts) {
    opts = opts || {};
    function base() {
      var q = state.cloud.database.from('letters').select('*');
      if (opts.direction) q = q.eq('direction', opts.direction);
      if (opts.status) q = q.eq('status', opts.status);
      if (opts.dateKey) q = q.eq('date_key', opts.dateKey);
      return q;
    }
    var au = window.DA_AUTH, signed = !!(au && au.uid && au.uid());
    var main = scoped(base()).order('updated_at', { ascending: false }).limit(opts.limit || 300)
      .then(function (r) { return unwrap(r, '读取信件').data || []; });

    /* 登录后同时带上本设备登录前写下的信（user_id 为空），保证历史不断档 */
    if (!signed) return main.then(function (rows) { return rows.map(toRec); });
    var legacy = state.cloud.database.from('letters').select('*')
      .eq('device_id', state.device).order('updated_at', { ascending: false }).limit(opts.limit || 300)
      .then(function (r) { return unwrap(r, '读取信件').data || []; })
      .catch(function () { return []; });

    return Promise.all([main, legacy]).then(function (both) {
      var seen = {}, out = [];
      both[0].concat(both[1]).forEach(function (row) {
        var key = row.lid || row.id;
        if (seen[key]) return;
        seen[key] = 1; out.push(row);
      });
      return out.map(toRec);
    });
  }
  function cloudGetByLid(l) {
    return scoped(state.cloud.database.from('letters').select('*').eq('lid', l)).maybeSingle()
      .then(function (r) { return unwrap(r, '读取信件').data; })
      .then(function (row) { return row ? toRec(row) : null; });
  }
  function cloudInsert(rec) {
    return state.cloud.database.from('letters')
      .insert(toRow(rec, state.device), { ignoreDuplicates: true, onConflict: 'lid' }).select()
      .then(function (r) { return unwrap(r, '保存信件'); })
      .then(function (r) {
        if (r.data && r.data.length) return toRec(r.data[0]);
        return cloudGetByLid(rec.id);   /* 冲突 = 幂等命中，返回已存记录 */
      });
  }
  function cloudPatch(l, patch) {
    var row = {};
    if ('faved' in patch) row.faved = !!patch.faved;
    if ('status' in patch) row.status = patch.status;
    if ('title' in patch) row.title = patch.title;
    if ('body' in patch) row.body = patch.body;
    if ('letterType' in patch) row.letter_type = patch.letterType;
    row.updated_at = new Date().toISOString();
    return scoped(state.cloud.database.from('letters').update(row).eq('lid', l)).select()
      .then(function (r) { return unwrap(r, '更新信件'); })
      .then(function (r) {
        if (r.data && r.data.length) return toRec(r.data[0]);
        /* 登录前在这台设备留下的信（user_id 为空）：顺手认领给当前账号，
           否则旧信在账号档案里只能看不能改 */
        var au = window.DA_AUTH, me = (au && au.uid) ? au.uid() : '';
        if (!me) throw new Error('这封信不存在或不属于你');
        var claim = Object.assign({}, row, { user_id: me });
        return state.cloud.database.from('letters').update(claim)
          .eq('lid', l).eq('device_id', state.device).is('user_id', null).select()
          .then(function (r2) { return unwrap(r2, '更新信件'); })
          .then(function (r2) {
            if (!r2.data || !r2.data.length) throw new Error('这封信不存在或不属于你');
            return toRec(r2.data[0]);
          });
      });
  }
  function cloudDelete(l) {
    return scoped(state.cloud.database.from('letters').delete().eq('lid', l)).select()
      .then(function (r) { return unwrap(r, '删除信件'); })
      .then(function (r) {
        if ((r.data || []).length) return true;
        return state.cloud.database.from('letters').delete()
          .eq('lid', l).eq('device_id', state.device).is('user_id', null).select()
          .then(function (r2) { return unwrap(r2, '删除信件'); })
          .then(function (r2) { return (r2.data || []).length > 0; });
      });
  }
  /* 云端生成：抽牌 → 内核（不外传）→ 成信 → 落库（stream 收集完整 JSON） */
  function cloudGenerate(form, opts) {
    opts = opts || {};
    var payload = LT.buildPayload(form, opts.kind || 'letter');
    var cards = (opts.cards && opts.cards.length) ? opts.cards : LT.drawCards(payload.length);
    var facts = LT.cardView(cards);
    if (!facts.length) return Promise.reject(new Error('本地牌表未载入，无法抽牌'));
    var recCards = facts.map(function (c) {
      return { id: c.id, slot: c.slot, pos: c.pos, cn: c.cn, en: c.en, orient: c.orient, kw: c.kw };
    });

    return cloudModel().then(function (m) {
      function call(system, user, temperature, maxTokens) {
        return new Promise(function (resolve, reject) {
          (async function () {
            var buf = '';
            try {
              for await (const chunk of state.cloud.llm.chat.completions.create({
                model: m.id,
                messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
                stream: true, temperature: temperature, max_tokens: maxTokens
              })) {
                var d = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
                if (d && d.content) buf += d.content;
              }
              resolve(buf);
            } catch (e) { reject(e); }
          })();
        });
      }

      /* ① 内核（失败重试一次，仍失败则拒绝——不拿没读牌的稿子冒充） */
      var kp = LT.kernelPromptFor(payload, facts);
      function readKernel(n) {
        return call(kp.system, kp.user, 0.62, 1400).then(function (t) {
          var k = LT.parseJSON(t);
          if (!k || (!k.spine && !(k.cards || []).length)) throw new Error('内核为空');
          return k;
        }).catch(function (e) {
          if (n > 0) return readKernel(n - 1);
          throw new Error('牌面解析失败：' + (e.message || '未知原因'));
        });
      }

      return readKernel(1).then(function (kernel) {
        var bp = LT.promptFor(payload, kernel, facts);
        function write(n, issues) {
          return call(bp.system, bp.user + (issues ? '\n\n【上一稿的问题，这一稿必须改掉】' + issues : ''), 0.92, 2600)
            .then(function (t) {
              var j;
              try { j = LT.parseJSON(t); }
              catch (pe) {
                /* JSON 坏掉也要走重试，不能把解析异常直接甩给用户 */
                if (n > 0) return write(n - 1, '上一次返回的不是有效 JSON，请只输出一个 JSON 对象，正文换行写成 \\n');
                throw new Error('信件生成未通过校验：返回内容不是有效 JSON');
              }
              var err = LT.validateLetter(j, payload.length);
              if (err) {
                if (n > 0) return write(n - 1, '上一稿的问题是：' + err);
                throw new Error('信件生成未通过校验：' + err);
              }
              return j;
            });
        }
        return write(1).then(function (j) {
          var packed = Object.assign({}, payload, { cards: recCards });
          var rec = LT.toRecord(
            { letter: j, model: _model ? (_model.name || _model.id) : 'cloud-llm', payload: packed, cards: recCards },
            form, { kind: opts.kind, id: opts.lid, dateKey: opts.dateKey, status: 'unread', cards: recCards }
          );
          return cloudInsert(rec);
        });
      });
    });
  }

  /* ══ 服务端实现（node server.js）═══════════════════════════ */
  function api(method, url, body) {
    var init = { method: method, headers: { 'Content-Type': 'application/json', 'x-device-id': state.device } };
    if (body) init.body = JSON.stringify(body);
    var ctrl = null, timer = null;
    if (window.AbortController) {
      ctrl = new AbortController(); timer = setTimeout(function () { ctrl.abort(); }, url.indexOf('generate') > 0 ? 100000 : 15000);
    }
    if (ctrl) init.signal = ctrl.signal;
    return fetch(url, init).then(function (r) {
      if (timer) clearTimeout(timer);
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error((j && j.error) || ('HTTP ' + r.status)); e.payload = j; throw e; }
        return j;
      });
    }).catch(function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  /* ══ 本机暂存实现（file:// / 离线）═════════════════════════ */
  function localAll() { return (S ? S.letters.list() : []).map(toRec); }
  function localSave(rec) {
    if (!S) throw new Error('本机档案层不可用');
    S.letters.save({
      id: rec.id, direction: rec.direction, status: rec.status, title: rec.title, greeting: rec.greeting,
      body: rec.body, signature: rec.signature, mood: rec.mood, letterType: rec.letterType,
      charId: rec.charId, charName: rec.charName, relationCn: rec.relationCn, themeKey: rec.themeKey,
      faved: !!rec.faved, source: rec.source || 'user', model: rec.model || '', replyTo: rec.replyTo || '',
      dateKey: rec.dateKey || '', payload: rec.payload || null, at: rec.at || Date.now()
    });
    return rec;
  }

  /* ══ 对外 API ══════════════════════════════════════════════ */
  function list(opts) {
    return init().then(function (st) {
      if (st.mode === 'cloud') return cloudList(opts);
      if (st.mode === 'server') {
        var q = [];
        if (opts && opts.direction) q.push('direction=' + encodeURIComponent(opts.direction));
        if (opts && opts.status) q.push('status=' + encodeURIComponent(opts.status));
        return api('GET', '/api/letters' + (q.length ? '?' + q.join('&') : '')).then(function (j) {
          return (j.letters || []).map(toRec);
        });
      }
      var all = localAll().filter(function (l) {
        if (opts && opts.direction && l.direction !== opts.direction) return false;
        if (opts && opts.status && l.status !== opts.status) return false;
        return true;
      });
      all.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
      return all;
    });
  }

  function get(id) {
    return init().then(function (st) {
      if (st.mode === 'cloud') return cloudGetByLid(id);
      if (st.mode === 'server') return api('GET', '/api/letters/' + encodeURIComponent(id)).then(function (j) { return j.letter ? toRec(j.letter) : null; });
      var hit = localAll().filter(function (l) { return l.id === id; })[0];
      return hit || null;
    });
  }

  /* 新建草稿 / 手写信（direction='out'） */
  function createOutgoing(form) {
    var rec = {
      id: lid(), direction: 'out', status: 'draft',
      title: form.title || '', body: form.body || '',
      charId: form.charId || '', charName: form.charName || '',
      letterType: '手写信', source: 'user', replyTo: form.replyTo || '',
      payload: form.payload || null, at: Date.now(), updatedAt: Date.now()
    };
    return init().then(function (st) {
      if (st.mode === 'cloud') return cloudInsert(rec);
      if (st.mode === 'server') return api('POST', '/api/letters', rec).then(function (j) { return toRec(j.letter); });
      return localSave(rec);
    });
  }

  function patch(id, p) {
    return init().then(function (st) {
      if (st.mode === 'cloud') return cloudPatch(id, p);
      if (st.mode === 'server') return api('PATCH', '/api/letters/' + encodeURIComponent(id), p).then(function (j) { return toRec(j.letter); });
      if (S) S.letters.patch(id, p);
      return get(id);
    });
  }

  /* 草稿 → 已寄出（真实落库；重复调用幂等返回同一封） */
  function sendLetter(id) {
    return init().then(function (st) {
      if (st.mode === 'cloud') return cloudPatch(id, { status: 'sent' });
      if (st.mode === 'server') return api('POST', '/api/letters/' + encodeURIComponent(id) + '/send', {}).then(function (j) { return toRec(j.letter); });
      var hit = null;
      localAll().forEach(function (l) { if (l.id === id) hit = l; });
      if (!hit) throw new Error('草稿不存在');
      if (hit.status === 'sent') return hit;
      return localSave(Object.assign(hit, { status: 'sent', updatedAt: Date.now() }));
    });
  }

  function setFaved(id, on) {
    return patch(id, { faved: !!on }).then(function (rec) {
      if (S) {
        if (on) S.favs.add({ type: 'letter', refId: id, source: 'post/incoming', title: rec.title, snippet: String(rec.body || '').slice(0, 60), at: Date.now() });
        else S.favs.remove && S.favs.list().forEach(function (f) { if (f.refId === id && f.type === 'letter') S.favs.remove(f.id); });
      }
      return rec;
    });
  }

  function markRead(id) {
    return get(id).then(function (rec) {
      if (rec && rec.status === 'unread') return patch(id, { status: 'read' });
      return rec;
    });
  }

  function remove(id) {
    return init().then(function (st) {
      if (st.mode === 'cloud') return cloudDelete(id);
      if (st.mode === 'server') return api('DELETE', '/api/letters/' + encodeURIComponent(id)).then(function () { return true; });
      if (S) { S.letters.setFaved(id, false); S.letters.remove(id); }
      return true;
    });
  }

  /* AI 生成一封来信（server 模式由服务端生成；cloud 模式本地组装提示词） */
  function generateIncoming(form, opts) {
    opts = opts || {};
    opts.lid = opts.lid || lid();
    opts.dateKey = opts.kind === 'daily' ? LT.dayKey() : '';
    return init().then(function (st) {
      if (st.mode === 'server') {
        var payload = LT.buildPayload(form, opts.kind || 'letter');
        var cards = (opts.cards && opts.cards.length) ? opts.cards : LT.drawCards(payload.length);
        var body = {
          deviceId: st.device, lid: opts.lid, dateKey: opts.dateKey,
          fresh: !!opts.fresh, kind: opts.kind || 'letter',
          payload: payload, cards: cards
        };
        return api('POST', '/api/letters/generate', body).then(function (j) { return toRec(j.letter); });
      }
      if (st.mode === 'cloud') return cloudGenerate(form, opts);
      throw new Error('当前是本机暂存模式（file:// 或离线），AI 通道不可用。请用 node server.js 启动本地服务，或访问线上站点。');
    });
  }

  /* 今日来信是否已存在（防刷新重复生成） */
  function getDaily(fresh) {
    return init().then(function (st) {
      var key = LT.dayKey();
      if (st.mode === 'cloud') {
        return cloudList({ direction: 'in', dateKey: key }).then(function (rows) {
          return rows.filter(function (r) { return r.dateKey === key && r.source === 'ai' && r.direction === 'in'; })[0] || null;
        });
      }
      if (st.mode === 'server') {
        return api('GET', '/api/letters/daily?dateKey=' + encodeURIComponent(key)).then(function (j) {
          return j.letter ? toRec(j.letter) : null;
        });
      }
      var ptr = null;
      try { ptr = JSON.parse(localStorage.getItem('DA2_DAILY_LETTER') || 'null'); } catch (e) {}
      if (ptr && ptr.date === key) {
        var hit = null; localAll().forEach(function (l) { if (l.id === ptr.id) hit = l; });
        return hit || null;
      }
      return null;
    });
  }

  function setDailyPointer(rec) {
    try { localStorage.setItem('DA2_DAILY_LETTER', JSON.stringify({ date: LT.dayKey(), id: rec.id })); } catch (e) {}
  }

  function stats() {
    return list({}).then(function (all) {
      var s = { incoming: 0, outgoing: 0, drafts: 0, unread: 0, faved: 0 };
      all.forEach(function (l) {
        if (l.direction === 'out') { if (l.status === 'draft') s.drafts++; else s.outgoing++; }
        else s.incoming++;
        if (l.direction === 'in' && l.status === 'unread') s.unread++;
        if (l.faved) s.faved++;
      });
      return s;
    });
  }

  function modeLabel() {
    var u = window.DA_AUTH && window.DA_AUTH.uid && window.DA_AUTH.uid();
    if (state.mode === 'server') return u ? '本地服务 · 已登录' : '本地服务 · 信件已持久保存';
    if (state.mode === 'cloud') {
      return u ? '云端档案 · 已登录 · 跨设备同步' : '云端档案 · 未登录（只在本设备可读）';
    }
    return '本机暂存 · AI 通道不可用';
  }

  return {
    init: init, list: list, get: get, createOutgoing: createOutgoing,
    patch: patch, sendLetter: sendLetter, setFaved: setFaved, markRead: markRead,
    remove: remove, generateIncoming: generateIncoming, getDaily: getDaily,
    setDailyPointer: setDailyPointer, stats: stats,
    modeLabel: modeLabel, onAuth: onAuth,
    state: state
  };
})();
