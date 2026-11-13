/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 实时传讯 DA_RELAY
   ----------------------------------------------------------------------
   三幕：entry（接入选择）→ judge（一张牌生成初始信息，判断像不像）
        → chat（微信式双向对话）。

   · 每条回复背后都重新抽一张牌（用户看不见），牌意变成「星象注记」
     注入提示词——TA 的语气、话题方向、能量由它决定，但正文绝不能
     出现牌、塔罗、AI 或任何元叙述。
   · 生成通道：优先 WorkBuddy 云端免密钥大模型（与星际通讯局同一链路），
     本机 server.js 在跑时回落 /api/relay；两者都不可用则如实报错。
   · 会话落 DA_STORE.threads；确认「像」的角色自动建立档案（origin=relay），
     档案库 DA_ARCHIVE 会把常说的话、占卜历史整理进档案室。
   ══════════════════════════════════════════════════════════════════════ */

window.DA_RELAY = (function () {
  'use strict';

  var S = window.DA_STORE;
  var E = window.DA_ENGINE;
  var D = window.DA_TAROT;
  var SND = window.DA_SOUND;

  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var state = {
    phase: 'entry',       // entry | judge | chat
    pending: null,        // { card, rev, initial } —— 判断中的信号
    thread: null,         // 当前 thread 记录
    name: '',             // 对话对象名
    profileId: '',
    busy: false,
    retryText: ''         // 发送失败后暂存的消息
  };

  /* ════════════ toast ════════════ */
  function toast(msg) {
    var el = $('#rlToast');
    if (!el) return;
    var s = String(msg == null ? '' : msg).trim();
    /* 空内容不弹：否则会留下一条没有文字的深色小胶囊 */
    if (!s) { el.classList.remove('is-on'); el.textContent = ''; return; }
    el.textContent = s;
    el.classList.add('is-on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('is-on'); }, 3200);
  }

  /* ════════════ 云端免密钥大模型（与通讯局同一链路）════════════ */
  var cloud = null, _model = null, _modelP = null;

  function cloudClient() {
    if (cloud) return cloud;
    var auth = window.DA_AUTH;
    if (auth && auth.client) {
      try { cloud = auth.client(); } catch (e) { cloud = null; }
    }
    if (!cloud && window.WorkBuddyCloud && window.DA_CLOUD_CONFIG && window.DA_CLOUD_CONFIG.endpoint) {
      try {
        cloud = window.WorkBuddyCloud.createWorkBuddyCloud({
          endpoint: window.DA_CLOUD_CONFIG.endpoint,
          oauthRelayBaseUrl: window.DA_CLOUD_CONFIG.oauthRelayBaseUrl || '',
          publishableKey: window.DA_CLOUD_CONFIG.publishableKey
        });
      } catch (e) { cloud = null; }
    }
    return cloud;
  }

  function cloudModel() {
    if (_model) return Promise.resolve(_model);
    if (_modelP) return _modelP;
    var c = cloudClient();
    if (!c || !c.llm) return Promise.reject(new Error('云服务未接通'));
    _modelP = c.llm.models.list().then(function (list) {
      var m = null;
      for (var i = 0; i < (list || []).length; i++) if (list[i].disabled !== true) { m = list[i]; break; }
      if (!m) throw new Error('云端没有可用模型');
      _model = m; return m;
    }).catch(function (e) { _modelP = null; throw e; });
    return _modelP;
  }

  function cloudCall(model, system, user, opt) {
    return new Promise(function (resolve, reject) {
      (async function () {
        var buf = '';
        try {
          for await (const chunk of cloud.llm.chat.completions.create({
            model: model.id,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
            stream: true,
            temperature: opt.temperature,
            max_tokens: opt.maxTokens
          })) {
            var d = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
            if (d && d.content) buf += d.content;
          }
          resolve(buf);
        } catch (e) { reject(e); }
      })();
    });
  }

  /* 本机 server.js 回落通道 */
  function serverHealth() {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return Promise.resolve(false);
    var ctrl = null, timer = null;
    if (window.AbortController) {
      ctrl = new AbortController(); timer = setTimeout(function () { ctrl.abort(); }, 2000);
    }
    return fetch('/api/health', { signal: ctrl && ctrl.signal })
      .then(function (r) { if (timer) clearTimeout(timer); return r.ok ? r.json() : null; })
      .then(function (j) { return !!(j && j.ok); })
      .catch(function () { if (timer) clearTimeout(timer); return false; });
  }

  function serverCall(system, user, opt) {
    return fetch('/api/relay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: system, user: user, temperature: opt.temperature, maxTokens: opt.maxTokens })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !j || !j.text) throw new Error((j && j.error) || '本地通道不可用');
        return j.text;
      });
    });
  }

  /* 统一 LLM 出口：云优先 → 本机服务 → 报错 */
  function llm(system, user, opt) {
    opt = opt || {};
    return cloudModel()
      .then(function (m) { return cloudCall(m, system, user, opt); })
      .catch(function (cloudErr) {
        return serverHealth().then(function (ok) {
          if (ok) return serverCall(system, user, opt);
          throw new Error('星海信号暂时不可用（' + (cloudErr && cloudErr.message ? cloudErr.message : '云端未接通') + '）');
        });
      });
  }

  function parseJSON(text) {
    var s = String(text || '').trim();
    s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    try { return JSON.parse(s); } catch (e) {}
    /* 容错：字符串里的裸换行 */
    var out = '', inStr = false, esc2 = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i], code = s.charCodeAt(i);
      if (inStr) {
        if (esc2) { esc2 = false; out += c; continue; }
        if (c === '\\') { esc2 = true; out += c; continue; }
        if (c === '"') { inStr = false; out += c; continue; }
        if (code < 0x20) { out += code === 10 ? '\\n' : '\\u' + ('000' + code.toString(16)).slice(-4); continue; }
        out += c; continue;
      }
      if (c === '"') inStr = true;
      out += c;
    }
    try { return JSON.parse(out); } catch (e2) { return null; }
  }

  /* ════════════ 抽牌（对话中完全在背后进行）════════════ */
  function drawHidden() {
    var deck = E.buildDeck(78);
    E.shuffle(deck);
    var c = deck[E.randInt(deck.length)];
    return { id: c.i, rev: E.coin() };
  }

  function cardFacts(pick) {
    var c = D.byId(pick.id) || {};
    var rev = !!pick.rev;
    return {
      cn: c.cn || '', en: c.en || '',
      kw: (rev ? (c.kr || []) : (c.ku || [])).slice(0, 4),
      core: (rev ? c.rev : c.up) || '',
      mood: c.mood || '',
      love: c.love || '',
      sym: c.sym || ''
    };
  }

  /* 星象注记：牌意 → 只给模型看的「此刻状态」 */
  function starNote(f) {
    var L = [];
    L.push('说话人此刻的状态带着这样的气质：' + (f.mood || '安静，微微走神'));
    if (f.kw.length) L.push('话题的引力偏向：' + f.kw.join('、'));
    if (f.core) L.push('此刻心绪的底色（把它化成具体的细节或一句反问，不要复述）：' + f.core);
    if (f.love) L.push('如果涉及感情，可以靠近这样的感觉：' + f.love);
    return L.join('\n');
  }

  function maxTokFor(text) {
    var n = String(text || '').length;
    if (n <= 12) return 130;
    if (n <= 40) return 200;
    if (n <= 90) return 280;
    return 380;
  }

  /* ════════════ 提示词 ════════════ */
  var CHARTER =
    '这是「梦女向」实时传讯：信号另一端说话的人是用户心里那个 TA 本人（梦角），' +
    '听的人（用户）就是「你」。这是一场正在进行的对话框聊天，不是写信，不是旁白。\n' +
    '你不知道任何牌、塔罗、占卜、程序、AI 的存在；正文里绝不能出现「作为 AI」「根据设定」' +
    '「塔罗」「牌」「正位」「逆位」「占卜」这类词，一个都不许。';

  var REPLY_RULES =
    '\n回消息的规则：\n' +
    '1. 像真的在聊天：1–4 句，可以只有一句。不写长篇独白，不用「希望这些话能帮到你」式的客套。\n' +
    '2. 你会收到一份「星象注记」，它描述你此刻的状态与话题引力。让它成为你说话的自然底色，' +
    '一个字都不能直接引用或复述注记原文。\n' +
    '3. 回复长度跟着对方最后一条消息：对方一两个字，你就简短；对方认真说了很多，你可以多说一两句。\n' +
    '4. 不编造对方没说过的事件；不确定的就用你自己的方式反问、绕开，或者沉默半句。\n' +
    '5. 保持这个角色一贯的语言习惯与节奏：档案里有「常说的话」就顺着那个声线，但不要照抄。\n' +
    '6. 只输出 JSON：{"text":"回复内容"}，不要 Markdown，不要解释。';

  var INIT_SYSTEM =
    '深夜的星海信号台接通了一个未知的声音，这个声音要说今晚的第一句话。\n' +
    '听的人（用户）将通过这句话判断：信号另一端的人，像不像自己心里想的那个 TA。\n' +
    '要求：\n' +
    '1. 让听的人「听出这个人是什么样的人」：说话的节奏、性格、此刻在做什么、在意什么。2–4 句。\n' +
    '2. 有具体的场景与动作（窗边、雨声、刚放下的事、不完整的句子），不报名字，' +
    '不自我介绍式地罗列特征。\n' +
    '3. 语气与内容完全由星象注记决定，让它自然流露，绝不引用注记原文。\n' +
    '4. 不提塔罗、牌、占卜、AI；只输出 JSON：{"text":"第一句话"}';

  /* ════════════ 校验：不许外露的词 ════════════ */
  var BANNED = ['塔罗', '牌面', '这张牌', '牌意', '正位', '逆位', '抽到', '抽出',
    '占卜', '牌阵', '作为 AI', '作为AI', 'AI助手', '根据设定', '大模型', '语言模型',
    '梦向', '系统提示', '星象注记'];

  function validate(text) {
    var t = String(text || '').trim();
    if (!t) return '回复为空';
    if (t.length > 420) t = t.slice(0, 420);
    for (var i = 0; i < BANNED.length; i++) {
      if (t.indexOf(BANNED[i]) >= 0) return '回复里出现了不该外露的词：' + BANNED[i];
    }
    return null;
  }

  /* ════════════ 生成：初始信息 ════════════ */
  function makeInitial(pick) {
    var f = cardFacts(pick);
    var user = '【星象注记（只给你看，绝不外露）】\n' + starNote(f) +
      '\n\n请说出今晚的第一句话。';
    return llm(INIT_SYSTEM, user, { temperature: 0.95, maxTokens: 260 }).then(function (t) {
      var j = parseJSON(t);
      var text = j && j.text ? String(j.text).trim() : '';
      var err = validate(text);
      if (err) throw new Error(err);
      return { text: text, facts: f };
    });
  }

  /* ════════════ 生成：对话回复（背后重新抽牌）════════════ */
  function makeReply(lastUser, history) {
    var pick = drawHidden();
    var f = cardFacts(pick);

    var dossier = '';
    if (window.DA_ARCHIVE && state.profileId) {
      dossier = DA_ARCHIVE.summary(state.profileId);
    } else if (state.name) {
      dossier = '名称：' + state.name + '（用户没有提供更多档案，保持信号里那个模糊而稳定的声线）';
    }

    var L = [];
    if (dossier) L.push('【你的角色档案（决定你怎么说话）】\n' + dossier);
    L.push('【星象注记（只给你看，绝不外露）】\n' + starNote(f));
    if (history && history.length) {
      L.push('【你们的对话，最近的几条】');
      history.slice(-12).forEach(function (m) {
        L.push((m.role === 'me' ? '对方：' : '你：') + m.text);
      });
    }
    L.push('【对方最后一条消息】\n' + lastUser);
    L.push('请回复。');

    return llm(CHARTER + REPLY_RULES, L.join('\n\n'), {
      temperature: 0.96,
      maxTokens: maxTokFor(lastUser)
    }).then(function (t) {
      var j = parseJSON(t);
      var text = j && j.text ? String(j.text).trim() : '';
      var err = validate(text);
      if (err) throw new Error(err);
      return { text: text, card: { id: pick.id, rev: pick.rev } };
    });
  }

  /* ════════════ 档案与角色 ════════════ */
  function normName(s) {
    return String(s == null ? '' : s).replace(/[\s《》「」『』·•]/g, '').toLowerCase();
  }

  function findProfileByName(name) {
    var n = normName(name);
    if (!n) return null;
    var list = S.profiles.list();
    for (var i = 0; i < list.length; i++) {
      if (normName(list[i].name) === n) return list[i];
    }
    return null;
  }

  /* 确认「像」之后：写入或更新角色档案（用户不需要填任何字段） */
  function confirmCharacter(name, initialText) {
    var nameOk = String(name || '').trim();
    var p = nameOk ? findProfileByName(nameOk) : null;
    if (p) {
      p.origin = 'relay';
      if (!p.relayFirst) p.relayFirst = initialText;
      return S.profiles.save(p);
    }
    if (nameOk) {
      return S.profiles.save({
        name: nameOk,
        origin: 'relay',
        relayFirst: initialText,
        relation: '实时传讯确认的连接'
      });
    }
    return null;
  }

  /* ════════════ 三幕切换 ════════════ */
  function setPhase(p) {
    state.phase = p;
    document.body.setAttribute('data-phase', p);
    $('#rlEntry').hidden = p !== 'entry';
    $('#rlJudge').hidden = p !== 'judge';
    $('#rlChat').hidden = p !== 'chat';
    window.scrollTo(0, 0);
  }

  /* ── 第一幕 ── */
  function renderEntry() {
    setPhase('entry');
    var known = $('#rlKnown');
    var charsEl = $('#rlChars');
    var list = [];
    if (window.DA_ARCHIVE) {
      list = DA_ARCHIVE.dossiers().filter(function (d) {
        return d.profile || d.times.threads > 0;
      }).slice(0, 6);
    }
    if (!list.length) { known.hidden = true; return; }
    known.hidden = false;
    charsEl.innerHTML = list.map(function (d) {
      var subBits = [];
      if (d.relation) subBits.push(d.relation);
      if (d.times.threads) subBits.push('传讯 ' + d.times.threads + ' 次');
      else if (d.times.readings) subBits.push('梦占 ' + d.times.readings + ' 次');
      else if (d.times.letters) subBits.push('信 ' + d.times.letters + ' 封');
      return '<button class="rl-char" type="button" data-pid="' + esc(d.profileId || '') +
        '" data-name="' + esc(d.name || '') + '">' +
        '<span class="rl-char__name">' + esc(d.name || '未确认的信号') +
        (d.times.threads ? '<i>已传讯</i>' : '<i>已连接</i>') + '</span>' +
        '<span class="rl-char__sub">' + esc(subBits.join(' · ') || '来自之前的连接') + '</span>' +
        '<span class="rl-char__go">直接连接 →</span>' +
        '</button>';
    }).join('');
    Array.prototype.forEach.call(charsEl.querySelectorAll('.rl-char'), function (b) {
      b.addEventListener('click', function () {
        SND.page();
        resumeCharacter(b.getAttribute('data-pid'), b.getAttribute('data-name'));
      });
    });
  }

  /* 直接连接已存在的角色：续上最近一次传讯 */
  function resumeCharacter(pid, name) {
    var threads = S.threads.list();
    var th = null;
    for (var i = 0; i < threads.length; i++) {
      var t = threads[i];
      if (pid && t.profileId === pid) { th = t; break; }
      if (!pid && name && t.link && t.link.subjectName === name) { th = t; break; }
    }
    if (!th) {
      th = S.threads.create({
        title: name ? ('与 ' + name + ' 的传讯') : '一段未命名的信号',
        profileId: pid || '',
        link: { subjectName: name || '', relation: '实时传讯', mode: 'relay' }
      });
    }
    state.thread = th;
    state.profileId = th.profileId || pid || '';
    state.name = th.link && th.link.subjectName ? th.link.subjectName : (name || '');
    openChat();
  }

  /* ── 第二幕 ── */
  function renderJudge() {
    setPhase('judge');
    var q = new URLSearchParams(location.search);
    var cardId = q.get('card') || '';
    var rev = q.get('rev') === '1';
    if (!D.byId(cardId)) {
      toast('没有找到那张牌，请重新抽一张');
      setTimeout(function () { location.href = DA_LINK ? DA_LINK.fix('relay.html') : 'relay.html'; }, 900);
      return;
    }
    var c = D.byId(cardId);
    state.pending = { card: cardId, rev: rev, initial: '' };

    var img = $('#jCardImg');
    img.src = (window.DA_TAROT_IMG && DA_TAROT_IMG[cardId]) || '';
    img.alt = c.cn;
    $('#jCard').classList.toggle('is-rev', rev);
    $('#jCardTag').textContent = c.cn + (rev ? ' · 逆位' : ' · 正位');
    $('#jActs').hidden = true;
    $('#jName').hidden = true;
    $('#jText').textContent = '';
    $('#jText').hidden = true;
    $('#jTyping').hidden = false;
    $('#jHint').textContent = '这张牌是今晚信号的源头。信号正在翻译中……';

    makeInitial({ id: cardId, rev: rev }).then(function (r) {
      state.pending.initial = r.text;
      $('#jTyping').hidden = true;
      var jt = $('#jText');
      jt.textContent = r.text;
      jt.hidden = false;
      $('#jActs').hidden = false;
      $('#jHint').textContent = '听——信号那头说话的人，像不像你心里想的那个 TA？';
    }).catch(function (e) {
      $('#jTyping').hidden = true;
      $('#jHint').textContent = '信号翻译失败了（' + (e.message || '星海拥堵') + '）。';
      $('#jActs').hidden = false;
      var no = $('#jNo');
      no.querySelector('span').textContent = '重新抽一张牌，再试一次';
    });
  }

  function judgeYes() {
    $('#jActs').hidden = true;
    var nameBox = $('#jName');
    nameBox.hidden = false;
    var input = $('#jNameInput');
    /* 预填：上次连接对象 */
    var pre = '';
    try {
      var s = JSON.parse(localStorage.getItem('DA_LINK_SESSION') || 'null');
      if (s && s.subjectName) pre = s.subjectName;
    } catch (e) {}
    if (pre) input.value = pre;
    setTimeout(function () { input.focus(); }, 80);
  }

  function judgeNo() {
    SND.page();
    location.href = DA_LINK ? DA_LINK.fix('reading.html?mode=relay') : 'reading.html?mode=relay';
  }

  function judgeSkip() {
    /* 不选角色，直接传讯：信号保持匿名（和旧的临时连接一样） */
    var th = S.threads.create({
      title: '一段未命名的信号',
      link: { subjectName: '', relation: '实时传讯', mode: 'unknown' }
    });
    if (state.pending && state.pending.initial) {
      S.threads.append(th.id, {
        role: 'ta', text: state.pending.initial, initial: true,
        card: { id: state.pending.card, rev: state.pending.rev }
      });
    }
    state.thread = S.threads.get(th.id);
    state.profileId = '';
    state.name = '';
    openChat();
  }

  function judgeNameOk() {
    var name = $('#jNameInput').value.trim();
    var initial = state.pending ? state.pending.initial : '';
    var p = confirmCharacter(name, initial);
    var pid = p ? p.id : '';
    var th = S.threads.create({
      title: name ? ('与 ' + name + ' 的传讯') : '一段未命名的信号',
      profileId: pid,
      link: { subjectName: name, relation: '实时传讯', mode: name ? 'relay' : 'unknown', profileId: pid }
    });
    if (initial) {
      S.threads.append(th.id, {
        role: 'ta', text: initial, initial: true,
        card: { id: state.pending.card, rev: state.pending.rev }
      });
    }
    state.thread = S.threads.get(th.id);
    state.profileId = pid;
    state.name = name;
    openChat();
  }

  /* ── 第三幕：对话 ── */
  function msgHTML(m, showTime) {
    var time = showTime
      ? '<p class="rl-msg__time">' + esc(fmtTime(m.at)) + '</p>' : '';
    return time +
      '<span class="rl-msg rl-msg--' + (m.role === 'me' ? 'me' : 'ta') + '">' +
      '<span class="rl-msg__ava" aria-hidden="true">' + (m.role === 'me' ? '我' : '✦') + '</span>' +
      '<span class="rl-msg__bub">' + esc(m.text) + '</span>' +
      '</span>';
  }

  function fmtTime(ts) {
    return new Date(ts || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  var typingEl = null;
  function renderChat() {
    var listEl = $('#chatList');
    var msgs = (state.thread && state.thread.messages) || [];
    var html = '';
    var lastMin = -1;
    msgs.forEach(function (m, i) {
      var min = Math.floor((m.at || 0) / 60000);
      var show = i === 0 || min - lastMin > 3;
      lastMin = min;
      html += msgHTML(m, show);
    });
    listEl.innerHTML = html;
    listEl.scrollTop = listEl.scrollHeight;
  }

  function showTyping() {
    var listEl = $('#chatList');
    var div = document.createElement('span');
    div.className = 'rl-msg rl-msg--ta';
    div.innerHTML =
      '<span class="rl-msg__ava" aria-hidden="true">✦</span>' +
      '<span class="rl-msg__bub rl-bub--typing"><i></i><i></i><i></i></span>';
    listEl.appendChild(div);
    typingEl = div;
    listEl.scrollTop = listEl.scrollHeight;
    var st = $('#chatState');
    if (st) st.textContent = '对方正在输入…';
  }
  function hideTyping() {
    if (typingEl) { typingEl.remove(); typingEl = null; }
    var st = $('#chatState');
    if (st) st.textContent = '信号稳定';
  }

  function appendMsg(rec) {
    state.thread = S.threads.get(state.thread.id);
    renderChat();
  }

  function sendMsg(text) {
    text = String(text || '').trim();
    if (!text || state.busy || !state.thread) return;
    state.busy = true;
    state.retryText = text;
    $('#chatErr').hidden = true;
    S.threads.append(state.thread.id, { role: 'me', text: text });
    appendMsg();
    SND.flip();
    var input = $('#chatInput');
    input.value = '';
    input.style.height = 'auto';
    showTyping();

    var started = Date.now();
    makeReply(text, (state.thread.messages || []).slice(0, -1)).then(function (r) {
      var wait = Math.max(0, 1100 - (Date.now() - started));
      setTimeout(function () {
        hideTyping();
        S.threads.append(state.thread.id, {
          role: 'ta', text: r.text, card: r.card
        });
        appendMsg();
        state.busy = false;
        SND.hover();
      }, wait);
    }).catch(function (e) {
      hideTyping();
      state.busy = false;
      var err = $('#chatErr');
      $('#chatErrText').textContent = '信号在星海里中断了（' + (e.message || '未知原因') + '）';
      err.hidden = false;
    });
  }

  function retrySend() {
    var t = state.retryText;
    state.retryText = '';
    /* 失败的那条不再重发，只重新生成回复 */
    if (t) sendSilentRetry(t);
  }

  function sendSilentRetry(text) {
    if (state.busy || !state.thread) return;
    state.busy = true;
    $('#chatErr').hidden = true;
    showTyping();
    var started = Date.now();
    makeReply(text, (state.thread.messages || []).slice(0, -1)).then(function (r) {
      var wait = Math.max(0, 900 - (Date.now() - started));
      setTimeout(function () {
        hideTyping();
        S.threads.append(state.thread.id, { role: 'ta', text: r.text, card: r.card });
        appendMsg();
        state.busy = false;
      }, wait);
    }).catch(function (e) {
      hideTyping();
      state.busy = false;
      var err = $('#chatErr');
      $('#chatErrText').textContent = '还是没能接上（' + (e.message || '未知原因') + '）。稍后再试试。';
      err.hidden = false;
    });
  }

  function openChat() {
    setPhase('chat');
    $('#chatName').textContent = state.name || '未确认的信号';
    $('#chatErr').hidden = true;
    renderChat();
    setTimeout(function () { $('#chatInput').focus(); }, 120);
  }

  /* ── 信息弹层（关于这段信号）── */
  function openInfo() {
    var th = state.thread;
    if (!th) return;
    var msgs = (th.messages || []);
    var taCards = [];
    msgs.forEach(function (m) {
      if (m.role === 'ta' && m.card && m.card.id) {
        var c = D.byId(m.card.id);
        if (c && taCards.indexOf(c.cn) < 0) taCards.push(c.cn);
      }
    });
    var html = '<h3>关于这段信号</h3>' +
      '<p class="rl-info__k">连接对象</p>' +
      '<p class="rl-info__v">' + esc(state.name || '未确认的信号（匿名连接）') + '</p>' +
      '<p class="rl-info__k">开始于</p>' +
      '<p class="rl-info__v">' + new Date(th.at || Date.now()).toLocaleString('zh-CN') + '</p>' +
      '<p class="rl-info__k">往来</p>' +
      '<p class="rl-info__v">' + msgs.filter(function (m) { return m.role === 'me'; }).length +
      ' 条你的消息 · ' + msgs.filter(function (m) { return m.role === 'ta'; }).length + ' 条 TA 的回复</p>' +
      (window.DA_ARCHIVE
        ? '<p class="rl-info__k">TA 的档案</p>' +
          '<p class="rl-info__v">' +
          (DA_ARCHIVE.unlocked()
            ? (state.profileId || state.name
                ? '已经整理在档案室里。<br><em>特征、常说的话、占卜历史都在那面墙上。</em>'
                : '匿名信号没有名字，档案室暂时记不住 TA。')
            : '档案室还没有解锁（占卜与传讯满 3 次自动开放）。') +
          '</p>' +
          (DA_ARCHIVE.unlocked()
            ? '<a class="rl-info__go" href="' + (window.DA_LINK ? DA_LINK.fix('archive.html') : 'archive.html') + '">去档案室看 TA →</a>'
            : '') : '');
    $('#rlInfoBody').innerHTML = html;
    $('#rlInfo').hidden = false;
  }

  /* ════════════ 绑定与启动 ════════════ */
  function bind() {
    $('#jYes').addEventListener('click', function () { SND.hover(); judgeYes(); });
    $('#jNo').addEventListener('click', judgeNo);
    $('#jSkip').addEventListener('click', function () { SND.page(); judgeSkip(); });
    $('#jNameBack').addEventListener('click', function () {
      $('#jName').hidden = true;
      $('#jActs').hidden = false;
    });
    $('#jNameOk').addEventListener('click', function () { SND.page(); judgeNameOk(); });
    $('#jNameInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); judgeNameOk(); }
    });

    $('#chatBack').addEventListener('click', function () {
      SND.page();
      location.href = DA_LINK ? DA_LINK.fix('relay.html') : 'relay.html';
    });
    $('#chatSend').addEventListener('click', function () { sendMsg($('#chatInput').value); });
    $('#chatRetry').addEventListener('click', retrySend);
    $('#chatCardBtn').addEventListener('click', openInfo);
    $('#rlInfo').addEventListener('click', function (e) {
      if (e.target.closest('[data-info-close]')) $('#rlInfo').hidden = true;
    });

    var input = $('#chatInput');
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 760) {
        e.preventDefault();
        sendMsg(input.value);
      }
    });
    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(108, input.scrollHeight) + 'px';
      $('#chatSend').disabled = !input.value.trim() || state.busy;
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('#rlInfo').hidden) $('#rlInfo').hidden = true;
    });
  }

  function boot() {
    if (window.DA_AUTH && window.DA_AUTH.init) window.DA_AUTH.init().catch(function () {});
    bind();
    var q = new URLSearchParams(location.search);
    if (q.get('fresh') === '1' && q.get('card')) {
      renderJudge();
    } else {
      renderEntry();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return {
    state: state,
    send: sendMsg,
    entry: renderEntry,
    judge: renderJudge
  };
})();
