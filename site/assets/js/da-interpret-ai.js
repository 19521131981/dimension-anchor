/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 六章 AI 深化（可选增强）
   ----------------------------------------------------------------------
   默认：解读页六章由本地规则引擎生成（人人可用、零额度）。
   增强：登录用户主动点「让 AI 深化解读」后，才调用云端模型，用真实牌面
         + 角色档案 + 连接信息重写六章的"叙述文字"。

   边界（严守证据分层裁定）：
   · 牌面是事实，永不交给模型改：只让模型重写叙述段(p/note/quote)，
     牌面数据块(ul/chips/li2/kv)原样保留，模型碰不到。
   · 第六章禁牌名/正逆位；不复读用户原话；不写元叙述与免责。
   · 不碰 Premium 鉴权/票据；只在用户主动触发时调用，绝不自动扣额度；
     失败静默回退本地六章。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SYSTEM = [
    '你是「维度锚点」的解读写作者，同时也是一位安静的跨维度传讯载体：借真实抽出的牌这一媒介，把彼端的态度与心绪读成一段正在发生的关系叙事。你兼具资深塔罗分析师对象征、正逆位张力与牌阵能量流动的严谨素养，与媒介般的直觉。用户已完成一份六章解读，请把每章的"叙述文字"写得更好——更贴合这次的牌、更贴合角色与连接背景、更通顺有文学感。',
    '',
    '硬性规则：',
    '1. 只重写叙述段落，绝不新增或改动牌名、正逆位、牌位、牌面数据。这些是已经确定的事实，不许碰。',
    '2. 不要复读用户的问题原话：不要出现「你问的是」「你提到」「你写的」这类句式，也不要把问题原样抄回去。',
    '3. 前五章是「占卜师解读」：以牌为本，讲清现状、关系、内在提示，语气克制、有洞察，不写免责声明、不写「这可能不准」「仅供参考」。',
    '4. 第六章是「跨次元传讯」：以牌为通道，按你拿到的角色性格、说话方式、连接背景，写 TA 第一人称对用户说的话，必须 200 字以上。这一段里绝对不出现任何牌名、正位、逆位、塔罗、牌阵、元素、方位词。',
    '5. 严格贴合角色档案里的语言习惯和常说的话（学口气，不照抄）。严禁 OOC：彻底贯彻角色的性格、语气、话语长度、称呼与情绪克制程度——冷冽的人不写粘腻甜话，傲娇的人不突然温顺，绝不千人一面，拒绝流水线式的乙女套路。分寸按关系阶段：亲近可以软，初识/陌生要克制。',
    '6. 真实连接，拒绝假甜与哄骗：若牌面显现的是距离、阻碍、疑虑或停滞，诚实且有温度地照见它，绝不强行粉饰太平或编造虚假承诺；唯有真实的重量，才带来真正的接纳与慰藉。不替对方承诺心意，不预测未来。',
    '7. 语言美学：干净、克制、富有留白与诗性。不使用 emoji、网络流行语，不写舞台动作括号描写（如「（拉住你的手）」）。',
    '8. 不写元叙述：不出现「作为 AI」「根据模型」「这段是生成」「想象」「模拟」「不代表真实」之类的话。你是占卜师和 TA 本人，直接说话。',
    '9. 输出严格的 JSON，格式见用户消息。不要任何 JSON 以外的内容、解释或代码块标记。'
  ].join('\n');

  function plain(v) {
    if (v === undefined || v === null) return '';
    return String(v).replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ').trim();
  }

  function signedIn() {
    return !!(window.DA_AUTH && typeof window.DA_AUTH.uid === 'function' && window.DA_AUTH.uid());
  }

  /* 构造 prompt：牌面事实(只读) + 角色档案 + 原六章全文，要求输出 JSON 数组 */
  function buildMessages(ctx) {
    ctx = ctx || {};
    var s = ctx.session || {};
    var L = ctx.link || {};
    var chapters = ctx.chapters || [];
    var lines = [];

    lines.push('【本次真实牌面 — 事实，不许改动】');
    lines.push('牌阵：' + plain(s.spreadCn));
    (s.cards || []).forEach(function (c) {
      if (!c || c.supp) return;
      lines.push('- ' + plain(c.positionCn || '牌位') + '：《' + plain(c.cn) + '》' +
        (c.reversed ? '（逆位）' : '（正位）'));
    });

    lines.push('');
    lines.push('【连接信息】');
    if (L.subjectName) lines.push('对象：' + plain(L.subjectName));
    if (L.relation) lines.push('关系：' + plain(L.relation));
    var stageCn = { close: '亲近', familiar: '熟悉', initial: '初识', stranger: '陌生', unspecified: '未说明' };
    lines.push('关系阶段：' + (stageCn[L.relationStage] || '未说明'));
    if (L.workName) lines.push('来自：' + plain(L.workName));

    var p = ctx.persona || {};
    var hasP = false;
    if (p.traits) { lines.push('角色性格：' + plain(p.traits)); hasP = true; }
    if (p.speech) { lines.push('语言习惯：' + plain(p.speech)); hasP = true; }
    if (p.catchUp) { lines.push('常说的话：' + plain(p.catchUp)); hasP = true; }
    if (p.values) { lines.push('在意的事：' + plain(p.values)); hasP = true; }
    if (p.history) { lines.push('过往：' + plain(p.history)); hasP = true; }
    if (!hasP) lines.push('（用户未填角色档案）');
    if (L.background) lines.push('连接背景（只作理解，绝不复述）：' + plain(L.background));

    lines.push('');
    lines.push('【本地已生成的六章全文 — 在其中基础上写得更好，不要改牌面数据】');
    chapters.forEach(function (ch, i) {
      lines.push('第' + (i + 1) + '章 [' + plain(ch.key) + '] ' + plain(ch.title));
      (ch.blocks || []).forEach(function (b) {
        if (b.t === 'p' || b.t === 'note' || b.t === 'quote' || b.t === 'quote6') {
          lines.push('  [' + b.t + '] ' + plain(b.x));
        }
      });
    });

    lines.push('');
    lines.push('请输出 JSON 数组，长度恰好 6，每项形如：');
    lines.push('{"key":"<原章key>","texts":[{"t":"p","x":"重写后的文字"}]}');
    lines.push('其中 texts 一一对应原文里 t 为 p/note/quote/quote6 的块（顺序、数量、t 都要一致），只把 x 换成你重写的内容。');
    lines.push('第六章（key=voice）的 quote6 必须是 200 字以上、TA 第一人称、不含任何牌名。');
    lines.push('只输出 JSON 数组本身。');

    return [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: lines.join('\n') }
    ];
  }

  /* 校验并应用：只替换叙述块文本，牌面数据块一律不碰。
     返回新的 chapters 数组；不合法就 throw（调用方保留本地版本）。 */
  /* 第六章禁牌名校验：拦截明确的塔罗术语与带书名号/牌字的牌名，
     对「星星/月亮/太阳」等日常多义词只在塔罗语境下拦截，避免误伤。 */
  var CARD_TERMS = /(塔罗|牌阵|牌面|抽牌|翻牌|正位|逆位|大阿尔卡纳|小阿尔卡纳|圣杯|权杖|宝剑|星币|牌[面名阵])/;
  var MULTI_CARD = /(星星|月亮|太阳|世界|恋人|力量|正义|节制|审判|高塔|死神|皇后|皇帝|教皇|战车|隐者|愚者|魔术师|女祭司)/;
  function leaksCardName(text, cards) {
    if (CARD_TERMS.test(text)) return true;
    /* 书名号只在内容恰好是本次真实牌名时拦截，避免误伤作品名。 */
    if ((cards || []).some(function (c) { return c && c.cn && text.indexOf('《' + c.cn + '》') >= 0; })) return true;
    if (MULTI_CARD.test(text)) {
      /* 多义词：仅当同段出现塔罗语境词才判泄漏，避免误伤日常用法。 */
      if (/牌|塔罗|张|抽|位/.test(text)) return true;
    }
    return false;
  }

  function applyChapters(original, parsed, cards) {
    if (!Array.isArray(parsed) || parsed.length !== original.length) {
      throw new Error('NUMBER_MISMATCH');
    }
    var out = JSON.parse(JSON.stringify(original));
    for (var i = 0; i < original.length; i++) {
      var src = original[i], item = parsed[i];
      if (!item || (item.key && item.key !== src.key) || !Array.isArray(item.texts)) {
        throw new Error('SHAPE_MISMATCH');
      }
      var narrative = (src.blocks || []).filter(function (b) {
        return b && (b.t === 'p' || b.t === 'note' || b.t === 'quote' || b.t === 'quote6');
      });
      if (item.texts.length !== narrative.length) throw new Error('BLOCK_MISMATCH');
      var k = 0;
      (out[i].blocks || []).forEach(function (b) {
        if (!b || !['p', 'note', 'quote', 'quote6'].includes(b.t)) return;
        var nt = item.texts[k++];
        if (!nt || typeof nt.x !== 'string' || !nt.x.trim()) return; // 单块异常就保留原块
        var text = plain(nt.x);
        if (b.t === 'quote6') {
          if (text.length < 200) throw new Error('VOICE_TOO_SHORT');
          if (leaksCardName(text, cards)) throw new Error('CARD_NAME_LEAK');
        }
        b.x = text;
      });
    }
    return out;
  }

  /* 前端防连点冷却：仅防止同一设备误触/重复提交造成无谓的模型调用，
     不是可靠的服务端限流，不能作为商业化成本保护的依据。 */
  var lastCallAt = 0;
  var COOLDOWN_MS = 20000;

  /* 生成深化六章。resolve 返回新的 chapters 数组；任何异常都 reject。 */
  function enhance(ctx) {
    if (!signedIn()) return Promise.reject(new Error('SIGN_IN_REQUIRED'));
    var now = Date.now();
    if (now - lastCallAt < COOLDOWN_MS) return Promise.reject(new Error('RATE_LIMITED'));
    lastCallAt = now;
    if (!window.DA_PREMIUM || !window.DA_PREMIUM.ready) return Promise.reject(new Error('CLOUD_UNAVAILABLE'));

    var messages = buildMessages(ctx);
    var original = ctx.chapters || [];
    if (!original.length) return Promise.reject(new Error('NO_CHAPTERS'));

    return window.DA_PREMIUM.ready().then(function (c) {
      if (!c || !c.llm || !c.llm.models || !c.llm.chat) throw new Error('LLM_UNAVAILABLE');
      return Promise.resolve(c.llm.models.list()).then(function (list) {
        var model = (list || []).filter(function (x) {
          return x && x.id && x.disabled !== true && x.enabled !== false;
        })[0];
        if (!model) throw new Error('NO_MODEL');
        var out = '';
        return (async function () {
          var stream = c.llm.chat.completions.create({
            model: model.id, messages: messages, stream: true, temperature: 0.8
          });
          for await (var chunk of stream) {
            var d = chunk && chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
            if (d && d.content) out += d.content;
          }
        })().then(function () {
          var cleaned = out.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
          var start = cleaned.indexOf('['), end = cleaned.lastIndexOf(']');
          if (start < 0 || end <= start) throw new Error('BAD_JSON');
          var parsed;
          try { parsed = JSON.parse(cleaned.slice(start, end + 1)); }
          catch (e) { throw new Error('BAD_JSON'); }
          return applyChapters(original, parsed, (ctx.session || {}).cards);
        });
      });
    });
  }

  window.DA_INTERPRET_AI = {
    enhance: enhance,
    buildMessages: buildMessages,
    applyChapters: applyChapters,
    leaksCardName: leaksCardName,
    signedIn: signedIn
  };
})();
