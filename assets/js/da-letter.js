/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 星际通讯局 · Letter Generation Engine（前端侧）
   ----------------------------------------------------------------------
   Letter Request Controller / Context Builder / Character Profile
   Resolver / Response Validator / Letter Storage Bridge。

   AI 调用走 DA_AI.letter() → 服务端 /api/letter（Key 不在前端）。
   存储复用 DA_STORE：信件落 DA2_LETTERS，收藏写进全局 favs 库。
   没有后端或生成失败 → 抛错给 UI 显示 LetterErrorState，
   绝不本地拼句子伪造 AI 信件。
   ══════════════════════════════════════════════════════════════════════ */

window.DA_LETTER = (function () {
  'use strict';

  /* ── 常量：关系 / 主题 / 情绪 / 长度 ─────────────────────── */
  var RELATIONS = [
    { k: 'first',    cn: '初识与相遇' },
    { k: 'friend',   cn: '朋友与陪伴' },
    { k: 'crush',    cn: '暧昧与心动' },
    { k: 'lover',    cn: '恋人关系' },
    { k: 'reunion',  cn: '久别重逢' },
    { k: 'daily',    cn: '日常相处' },
    { k: 'anniv',    cn: '特别的纪念日' },
    { k: 'custom',   cn: '自定义关系' }
  ];

  var THEMES = [
    { k: 'today',    cn: 'TA 今天想对你说的话' },
    { k: 'routine',  cn: '一封来自 TA 的日常来信' },
    { k: 'miss',     cn: '想念与思念' },
    { k: 'comfort',  cn: '安慰与陪伴' },
    { k: 'unsaid',   cn: '未曾说出口的心事' },
    { k: 'meet',     cn: '如果此刻我们能够相见' },
    { k: 'anniv',    cn: '特别纪念日' },
    { k: 'future',   cn: '未来想与你一起完成的事情' },
    { k: 'custom',   cn: '自定义主题' }
  ];

  var MOODS = [
    { k: 'gentle',   cn: '温柔治愈' },
    { k: 'restrain', cn: '克制而深情' },
    { k: 'playful',  cn: '俏皮日常' },
    { k: 'honest',   cn: '真诚坦率' },
    { k: 'nostalgic',cn: '怀念与思念' },
    { k: 'profound', cn: '深沉细腻' },
    { k: 'custom',   cn: '自定义' }
  ];

  var LENGTHS = [
    { k: 'short',    cn: '短笺 · 100–200 字' },
    { k: 'standard', cn: '标准信件 · 300–600 字' },
    { k: 'deep',     cn: '深度长信 · 600–1000 字' }
  ];

  var DAILY_THEMES = ['今夜的月色', '风里的一句话', '星星的便签', '寄往清晨的信',
                      '午夜的一分钟', '云的背面', '潮汐与灯', '未命名的温柔'];

  /* ── 书信牌阵：六牌位，按长度取子集（与服务端 LETTER_SPREAD 同一份定义）── */
  var SPREAD = {
    key: 'letter',
    cn: '书信牌阵',
    slots: [
      { n: 1, cn: '落笔的此刻',   en: 'The Moment',              d: '写信人此刻在做什么、处于什么状态' },
      { n: 2, cn: '你此刻的样子', en: 'You',                     d: '收信人在写信人眼里的样子' },
      { n: 3, cn: '我们之间',     en: 'Between Us',              d: '关系此刻的真实状态' },
      { n: 4, cn: '没说出口的',   en: 'Unsaid',                  d: '张力、隐瞒、尚未承认的部分' },
      { n: 5, cn: '想让你知道的', en: 'What I Need You to Know', d: '这封信真正要说的那一句' },
      { n: 6, cn: '信末的余温',   en: 'The Last Warmth',         d: '收尾姿态，留给对方的东西' }
    ],
    byLength: { short: [1, 3, 5], standard: [1, 2, 3, 4, 5], deep: [1, 2, 3, 4, 5, 6] }
  };

  function slotsFor(length) {
    var ns = SPREAD.byLength[length] || SPREAD.byLength.standard;
    var out = [];
    ns.forEach(function (n) {
      SPREAD.slots.forEach(function (s) { if (s.n === n) out.push(s); });
    });
    return out;
  }

  function rnd(n) {
    if (window.crypto && window.crypto.getRandomValues) {
      var a = new Uint32Array(1);
      window.crypto.getRandomValues(a);
      return a[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  /* 真实抽牌：78 张 Fisher-Yates 洗牌，正逆位各半；不重复、不预知 */
  function drawCards(length) {
    var D = window.DA_TAROT;
    if (!D || !D.all || !D.all.length) return [];
    var pool = D.all.slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = rnd(i + 1), t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return slotsFor(length).map(function (s, k) {
      return { slot: s.n, id: pool[k].i, orient: rnd(2) ? 'reversed' : 'upright' };
    });
  }

  /* 抽牌结果 → 展示 / 提示词用事实（牌面由本地牌表补全） */
  function cardView(cards) {
    var D = window.DA_TAROT;
    var slots = slotsFor('deep');
    return (cards || []).map(function (x, i) {
      var c = D && D.byId(x.id);
      var rev = /^(rev|reversed|逆)/i.test(String(x.orient || ''));
      var slot = null;
      slots.forEach(function (s) { if (s.n === Number(x.slot)) slot = s; });
      slot = slot || slots[i] || SPREAD.slots[i];
      return {
        slot: slot.n, pos: slot.cn, posDesc: slot.d,
        id: x.id, cn: (c && c.cn) || '', en: (c && c.en) || '',
        orient: rev ? '逆位' : '正位', reversed: rev,
        kw: (c && (rev ? c.kr : c.ku)) || [],
        meaning: (c && (rev ? c.rev : c.up)) || '',
        love: (c && c.love) || '', sym: (c && c.sym) || ''
      };
    });
  }

  function cnOf(list, k) {
    for (var i = 0; i < list.length; i++) if (list[i].k === k) return list[i].cn;
    return '';
  }

  var state = { busy: false };

  /* ── Character Profile Resolver ──────────────────────────── */
  function resolveCharacter(form) {
    var S = window.DA_STORE;
    var out = { profile: '', charId: '', charName: '', profileRel: '' };
    if (!S) return out;
    if (form.profileId) {
      var p = S.profiles.get(form.profileId);
      if (p) {
        out.profile = S.profiles.summary(p.id);
        out.charId = p.id;
        out.charName = p.name || '';
        out.profileRel = p.relation || '';
      }
    }
    if (!out.profile && form.charName) {
      out.charId = '';
      out.charName = String(form.charName || '').slice(0, 40);
      out.profile = '';
    }
    return out;
  }

  /* ── Context Builder：优先级见规格 5.2 ───────────────────── */
  function buildPayload(form, kind) {
    form = form || {};
    var c = resolveCharacter(form);
    return {
      kind: kind || 'letter',
      profile: c.profile,                       /* 3 · 已保存档案 */
      profileRel: c.profileRel,
      charId: c.charId,
      charName: c.charName,
      charDesc: String(form.charDesc || '').slice(0, 300),   /* 1 · 用户明确设定 */
      relation: form.relationCn || cnOf(RELATIONS, form.relation), /* 2 · 本次关系 */
      background: String(form.background || '').slice(0, 500),
      theme: form.themeCn || cnOf(THEMES, form.theme) || (kind === 'daily' ? DAILY_THEMES[dayIdx()] : ''),
      mood: form.moodCn || cnOf(MOODS, form.mood),
      note: String(form.note || '').slice(0, 400),
      length: form.length || 'standard'
    };
  }

  function dayIdx() {
    var d = new Date();
    return Math.floor((d.getTime() - Date.UTC(d.getFullYear(), 0, 0)) / 86400000);
  }
  function dayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  /* ── Response Validator（客户端兜底校验；与服务端同一套规则）── */
  var BANNED = ['牌面', '牌阵', '抽到', '抽出了', '正位', '逆位', '塔罗',
    '这张牌', '牌意', '象征意义', '作为 AI', '作为AI', '根据设定', '梦向'];

  function validateLetter(l, length) {
    if (!l || typeof l !== 'object') return '返回不是有效信件';
    var body = String(l.body || '').trim();
    if (!body) return '信件正文为空';
    if (!String(l.title || '').trim()) return '信件缺少标题';
    if (!String(l.signature || '').trim()) return '信件缺少署名';
    var min = { short: 75, standard: 220, deep: 450 }[length || 'standard'] || 220;
    if (body.length < min) return '正文明显短于所选长度（' + body.length + ' 字）';
    for (var i = 0; i < BANNED.length; i++) {
      if ((body + ' ' + String(l.greeting || '')).indexOf(BANNED[i]) >= 0) return '正文出现了不该外露的词：' + BANNED[i];
    }
    return null;
  }

  /* ── 提示词引擎（云端模式使用；与 server.js 保持同一文案）── */
  var CHARTER = '这是「梦女向」角色信件：写信人（梦角）是用户所代入关系里的那个角色本人，收信人（梦女）就是读者本人——「你」。\n' +
    '你要以梦角的第一人称，写一封只属于你们两个人的私信：语气、称呼、世界观与用词必须是这个人会用的，不能是通用温柔人格。\n' +
    '信件是文学创作，不是现实角色发来的真实回应；但正文里绝不能出现「作为 AI」「根据设定」「梦向」这类元叙述。';
  var RULES = '\n写作规则：\n' +
    '1. 你就是这个角色在写信，不是旁白、不是客服、不是情感博主。禁止通用安慰话术、心理科普、「希望这封信能帮到你」这类话。\n' +
    '2. 开场直接进入角色此刻的具体情境（时间、地点、正在做的事），不要「亲爱的朋友」这类通用称呼；用角色会用的方式称呼「你」。\n' +
    '3. 至少两处只属于你们两个人的具体细节：物件、动作、未说完的话、身体感受。可以写角色自己的日常与观察，但不得虚构用户没提供过的重大事件或设定。\n' +
    '4. 情感要具体、有重量，可以有克制的占有、担心、调侃或沉默；不要反复说「我想你」「我爱你」，不要把「我永远陪着你」当落点。\n' +
    '5. 不同角色必须读起来是不同的人：句式长短、用词、称呼、是否直白，全部由角色性格决定。\n' +
    '6. 有自然推进：当下的场景 → 一句话把你们连起来 → 没说完的心事 → 一个具体的落点 → 符合角色的收尾（署名用角色自己的名字或称呼）。\n' +
    '7. 中文写作；只输出 JSON，不要 Markdown 代码块，不要解释。\n' +
    '8. 你会收到一份「内核」。它是这封信的骨架，不是素材库：\n' +
    '   · 每一张牌至少要落成一个具体细节或一次转折；落不进去的牌就是没读，不是可选项。\n' +
    '   · 牌位顺序就是信的推进顺序：开场场景 → 你 → 我们之间 → 没说出口的 → 落点 → 收尾。\n' +
    '   · 核心张力必须落在具体的一件事、一个动作，或一句没说完的话上，不许抽象成「我们之间有些误会」。\n' +
    '   · 「没说出口的」要有克制的停顿：可以绕开、可以只写一半、可以突然转去写别的。\n' +
    '9. 正文里绝不出现：牌名、「牌面」「抽到」「正位 / 逆位」「象征」「塔罗」这些词，也不许把内核条目直接抄成句子。\n' +
    '10. 长度是硬指标：短笺 100–200 字，标准 300–600 字，深度长信 600–1000 字，不含称呼与署名；不足下限要补具体场景，不用形容词凑数。\n' +
    '11. 正文结尾不要再写一遍署名或日期——署名只放 signature 字段，最后一句落在画面或动作上。';
  var SCHEMA = '\n输出结构（严格遵守）：\n' +
    '{"title":"信件标题（12 字内）","greeting":"开头称呼（一行）","body":"信件正文（段落之间用两个换行分隔）","signature":"角色署名（一行）","mood":"情绪标签（2–6 字）","letterType":"信件主题"}\n' +
    '注意：JSON 字符串里不能出现真实换行，段落分隔必须写成转义的 \\n\\n。\n\n' +
    '正文结构指导（自然融入行文，不要机械分段，不要标注序号）：\n' +
    '① 以角色此刻的具体场景开场；② 出现只属于你们的细节；③ 说出平时没说出口的那句话；④ 一个具体的落点（不要空泛承诺）；⑤ 按角色性格收尾。';
  var LEN_CN = {
    short: '短笺：正文约 100–200 字',
    standard: '标准信件：正文约 300–600 字',
    deep: '深度长信：正文约 600–1000 字'
  };

  /* ── 第一段：牌面底稿师（云端模式使用；与 server.js 同一文案）── */
  var KERNEL_SYSTEM = '你是 DIMENSION ANCHOR 星际通讯局的「牌面底稿师」。\n' +
    '你的产出不会被用户看到：它是给信件作者的结构化底稿，不是成品文字。\n' +
    '你只做两件事：把真实牌面读成一个可写的内核；把内核拆成这封信必须经过的节点。\n\n' +
    '硬性规则：\n' +
    '1. 牌名、正逆位、牌位由系统给出。绝不改动、不新增、不省略、不调整顺序。\n' +
    '2. 逆位不作凶兆。逆位读作：被按住、延迟、尚未承认、说不出口的部分。\n' +
    '3. 只给「可写的具体物象」——物件、动作、身体感受、空间里的声音与光；禁止抽象名词堆砌。\n' +
    '4. 不写成品句子，不写抒情散文，不替信件作者落笔；每一句都必须是「给人照着写」的提示。\n' +
    '5. 每张牌必须回答三件事：在信里承担什么功能 / 提供什么具体细节 / 让叙事往哪转。\n' +
    '6. 找出这组牌的核心张力（两个相反的力量），并指出「最该说却最难说出口的那一句」的语义。\n' +
    '7. 不给建议、不做心理诊断、不承诺结果、不解释塔罗体系。\n' +
    '8. 中文写作；只输出 JSON，不要 Markdown 代码块，不要任何解释。\n\n' +
    '输出结构（严格遵守）：\n' +
    '{"spine":"这封信真正在说什么（25–45 字，一句判断）",' +
    '"tension":{"a":"一股力量","b":"相反的力量","where":"张力落在哪件具体的事上"},' +
    '"cards":[{"slot":1,"pos":"落笔的此刻","card":"牌名","orient":"正位或逆位","fn":"在信里承担什么功能","detail":"可写进信的具体物象","turn":"它把叙事推向哪里"}],' +
    '"unsaid":"最该说却最难说出口的那一句（说明语义，不写成台词）",' +
    '"lexicon":["3–6 个具体物件 / 动作 / 感官"],' +
    '"arc":["开场落在哪个场景","中段在哪一句转折","结尾停在什么动作或画面上"],' +
    '"avoid":["这封信不该出现的表达，2–3 条"]}';

  function kernelPromptFor(p, facts) {
    var L = [];
    L.push('【这封信】性质：' + (p.kind === 'daily' ? '今日星际来信（更轻、更短）' : '正式信件') +
      '｜主题：' + (p.theme || '未指定') + '｜长度档：' + (p.length || 'standard'));
    if (p.profile) L.push('【写信人】角色档案（其性格与语言习惯决定语气）：' + p.profile);
    else if (p.charName) L.push('【写信人】' + p.charName + '（用户临时设定：' + (p.charDesc || '无更多设定') + '）');
    else L.push('【写信人】未指定角色：星辰——夜里值班、替人看星星的那一个。');
    L.push('【关系】' + (p.relation || '未指定') + (p.background ? '；背景：' + p.background : '') +
      (p.profileRel ? '；档案中的关系背景：' + p.profileRel : ''));
    if (p.note) L.push('【用户这次想说的】' + p.note);
    L.push('');
    L.push('【真实抽出的牌（不许改动）】');
    (facts || []).forEach(function (c) {
      L.push(c.slot + '. 牌位「' + c.pos + '」：' + c.cn + ' · ' + c.orient +
        (c.kw && c.kw.length ? ' · 关键词：' + c.kw.join('、') : '') +
        (c.meaning ? '\n   可用牌意：' + c.meaning : ''));
    });
    L.push('');
    L.push('【本次要写的牌位顺序】' + (facts || []).map(function (c) { return c.slot + ' ' + c.pos; }).join(' → '));
    L.push('请按输出结构给出内核 JSON。');
    return { system: KERNEL_SYSTEM, user: L.join('\n') };
  }

  function kernelBlock(kernel) {
    if (!kernel) return '';
    var t = kernel.tension || {}, L = [];
    if (kernel.spine) L.push('这封信在说：' + kernel.spine);
    if (t.a || t.b) L.push('核心张力：' + (t.a || '') + ' ↔ ' + (t.b || '') + (t.where ? '（落在：' + t.where + '）' : ''));
    (kernel.cards || []).forEach(function (c) {
      L.push('· 第' + c.slot + '位「' + c.pos + '」《' + c.card + '》' + (c.orient || '') +
        ' — 功能：' + (c.fn || '') + '；细节：' + (c.detail || '') + '；转折：' + (c.turn || ''));
    });
    if (kernel.unsaid) L.push('最该说却没说出口的：' + kernel.unsaid);
    if ((kernel.lexicon || []).length) L.push('可用物象：' + kernel.lexicon.join('、'));
    if ((kernel.arc || []).length) L.push('推进：' + kernel.arc.join(' → '));
    if ((kernel.avoid || []).length) L.push('避免：' + kernel.avoid.join('；'));
    return L.join('\n');
  }

  function promptFor(p, kernel, facts) {
    var L = [];
    L.push('【收信人与角色】');
    L.push('视角：以角色第一人称写给「你」（用户本人 / 梦女）；不要第三人称叙述，不要写「她」。');
    if (p.profile) L.push('角色档案（严格遵循其性格与语言习惯）：' + p.profile);
    else if (p.charName) L.push('角色名称：' + p.charName + '（用户临时设定：' + (p.charDesc || '无更多设定') + '）');
    else L.push('未指定角色：写一封来自「星辰」的梦向信件——星辰是夜里值班、替人看星星的那一个，写给「你」，署名用星辰、夜风一类意象，不要虚构具体人物经历。');
    L.push('【关系】类型：' + (p.relation || '未指定') + (p.background ? '；背景：' + p.background : ''));
    if (p.profileRel) L.push('档案中已保存的关系背景（可与本次背景互补，冲突时以本次为准）：' + p.profileRel);
    L.push('【信件主题】' + (p.theme || '未指定'));
    L.push('【情绪氛围】' + (p.mood || '由角色性格决定') + '（氛围只作底色，不得覆盖角色原有性格）');
    if (p.note) L.push('【用户这次想对 TA 说的】' + p.note);
    L.push('【正文长度】' + (LEN_CN[p.length] || LEN_CN.standard) + '；长度是硬指标，不为凑字数重复表达。');
    if (p.kind === 'daily') L.push('【性质】今日星际来信：比正式信件更轻、更短，像随信附上的一张星笺。');
    if (facts && facts.length) {
      L.push('');
      L.push('【内核｜这是骨架，不是素材，正文里一个字都不许外露】');
      L.push(kernelBlock(kernel) || '（内核缺失，按牌位顺序自行推进）');
      L.push('牌位顺序：' + facts.map(function (c) { return c.slot + ' ' + c.pos; }).join(' → '));
      L.push('每一张牌至少落成一个具体细节或一次转折；落不进去的牌就是没读。');
    }
    return { system: CHARTER + RULES + SCHEMA, user: L.join('\n') };
  }

  /* 模型时常把换行原样写进 JSON 字符串（body 里尤其常见），
     直接 JSON.parse 会抛「Bad control character」。这里把字符串内部的
     控制字符转义，再兜一层尾逗号清理。 */
  function repairJSON(s) {
    var out = '', inStr = false, esc = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i], code = s.charCodeAt(i);
      if (inStr) {
        if (esc) { esc = false; out += c; continue; }
        if (c === '\\') { esc = true; out += c; continue; }
        if (c === '"') { inStr = false; out += c; continue; }
        if (code < 0x20) {
          out += code === 10 ? '\\n' : code === 13 ? '\\r' : code === 9 ? '\\t'
               : '\\u' + ('000' + code.toString(16)).slice(-4);
          continue;
        }
        out += c; continue;
      }
      if (c === '"') inStr = true;
      out += c;
    }
    return out;
  }

  function parseJSON(text) {
    var s = String(text || '').trim();
    s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    try { return JSON.parse(s); } catch (e1) {}
    var fixed = repairJSON(s);
    try { return JSON.parse(fixed); } catch (e2) {}
    /* 最后一招：去掉对象/数组结尾的尾逗号 */
    try { return JSON.parse(fixed.replace(/,\s*([}\]])/g, '$1')); }
    catch (e3) { throw new Error('返回内容不是有效 JSON'); }
  }

  /* ── Letter Request Controller ───────────────────────────── */
  function generate(form, kind) {
    if (state.busy) return Promise.reject(new Error('正在生成上一封，请稍候'));
    if (navigator.onLine === false) return Promise.reject(new Error('网络已断开，请检查连接后再寄出'));
    var payload = buildPayload(form, kind);
    state.busy = true;
    return window.DA_AI.letter(payload).then(function (j) {
      state.busy = false;
      var err = validateLetter(j.letter, payload.length);
      if (err) throw new Error(err);
      return { letter: j.letter, model: j.model || '', payload: payload, cards: j.cards || [] };
    }).catch(function (e) {
      state.busy = false;
      throw e;
    });
  }

  /* ── Letter Storage Bridge：落 DA2_LETTERS + 全局收藏 ────── */
  function toRecord(r, form, extra) {
    form = form || {};
    extra = extra || {};
    var l = r.letter;
    return {
      id: extra.id || ('lt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
      title: l.title,
      greeting: l.greeting || '',
      body: l.body,
      signature: l.signature || '',
      mood: l.mood || '',
      letterType: l.letterType || '',
      themeKey: form.theme || '',
      relationCn: form.relationCn || cnOf(RELATIONS, form.relation) || '',
      background: String(form.background || ''),
      note: String(form.note || ''),
      length: form.length || 'standard',
      charId: r.payload.charId || '',
      charName: r.payload.charName || (r.payload.profile ? '' : '星辰'),
      direction: 'in',
      status: extra.status || 'unread',
      dateKey: extra.dateKey || '',
      payload: r.payload || null,
      cards: extra.cards || r.cards || null,
      model: r.model || '',
      faved: false,
      edited: false,
      at: Date.now()
    };
  }

  function saveRecord(rec) {
    var S = window.DA_STORE;
    if (!S) throw new Error('本地档案层不可用');
    S.letters.save(rec);
    /* 通知大厅：通讯局有一封未读新信（入口徽标） */
    try {
      var n = parseInt(localStorage.getItem('DA2_MAIL_UNREAD') || '0', 10);
      localStorage.setItem('DA2_MAIL_UNREAD', String(n + 1));
    } catch (e) {}
    return rec;
  }

  function markRead() {
    try { localStorage.setItem('DA2_MAIL_UNREAD', '0'); } catch (e) {}
  }

  return {
    RELATIONS: RELATIONS, THEMES: THEMES, MOODS: MOODS, LENGTHS: LENGTHS,
    DAILY_THEMES: DAILY_THEMES,
    SPREAD: SPREAD, slotsFor: slotsFor, drawCards: drawCards, cardView: cardView,
    cnOf: cnOf, dayKey: dayKey, dayIdx: dayIdx,
    resolveCharacter: resolveCharacter,
    buildPayload: buildPayload,
    validateLetter: validateLetter,
    promptFor: promptFor,
    kernelPromptFor: kernelPromptFor,
    kernelBlock: kernelBlock,
    parseJSON: parseJSON,
    generate: generate,
    toRecord: toRecord,
    saveRecord: saveRecord,
    markRead: markRead,
    state: state
  };
})();
