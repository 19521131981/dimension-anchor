#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 塔罗观测站本地服务
   ----------------------------------------------------------------------
   作用有两个：

   1. 把网站跑在 http://localhost:4321 上（不是 file://）。
   2. 做 DeepSeek 的安全中转：API Key 只在服务端进程的环境变量里，
      前端代码里没有任何一处出现 Key。

   启动：
     DEEPSEEK_API_KEY=sk-xxxx node server.js
     # 或者
     export DEEPSEEK_API_KEY=sk-xxxx && node server.js

   没配 Key 也能启动：网站正常运行，解读自动走本地规则引擎，
   /api/* 返回 501 并说明原因，前端会安静回落到本地推演。
   ══════════════════════════════════════════════════════════════════════ */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const ROOT = __dirname;

/* 读 .env（不引第三方依赖）：KEY=value，# 开头是注释 */
function loadEnv() {
  try {
    const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    txt.split(/\r?\n/).forEach((line) => {
      const s = line.trim();
      if (!s || s.startsWith('#')) return;
      const i = s.indexOf('=');
      if (i < 1) return;
      const k = s.slice(0, i).trim();
      const v = s.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (!(k in process.env)) process.env[k] = v;
    });
  } catch (e) { /* 没有 .env 就只用真实环境变量 */ }
}
loadEnv();

const PORT = Number(process.env.PORT || 4321);
const HOST = process.env.HOST || '127.0.0.1';

const KEY = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_KEY || '';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const API_HOST = process.env.DEEPSEEK_HOST || 'api.deepseek.com';
const API_PATH = '/chat/completions';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

/* ══ 塔罗牌表 · 服务端权威事实层 ══════════════════════════════════════
   客户端只传 { slot, id, orient }；牌名、正逆位解释、关系向、象征物
   一律由服务端从 assets/js/tarot-deck.js 补全。
   这样「牌面由系统给出、不许改动」这条原则从塔罗观测站延续到信件，
   AI 无法自己加牌，前端也无法伪造牌名。 */

const LETTER_SPREAD = {
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

let TAROT = null;
(function loadTarotDeck() {
  try {
    const vm = require('vm');
    const src = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'tarot-deck.js'), 'utf8');
    const sandbox = { window: {} };
    vm.runInNewContext(src, sandbox, { filename: 'tarot-deck.js' });
    TAROT = sandbox.window.DA_TAROT || null;
    if (!TAROT || !TAROT.all || TAROT.all.length !== 78) throw new Error('牌表结构异常');
  } catch (e) {
    TAROT = null;
    console.warn('  [letters] 牌表载入失败，信件无法校验牌面：' + e.message);
  }
})();

function spreadSlots(length) {
  const ns = LETTER_SPREAD.byLength[length] || LETTER_SPREAD.byLength.standard;
  return ns.map((n) => LETTER_SPREAD.slots.find((s) => s.n === n));
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* 服务端备用抽牌：客户端没送牌时自己抽（接口对 curl 也成立） */
function drawCards(length) {
  if (!TAROT) return [];
  const pool = shuffle(TAROT.all);
  return spreadSlots(length).map((slot, i) => ({
    slot: slot.n,
    id: pool[i].i,
    orient: crypto.randomInt(2) ? 'reversed' : 'upright'
  }));
}

/* 客户端传来的牌 → 权威牌面事实；不合格整组重抽，绝不让半副牌进入提示词 */
function cardFacts(cards, length) {
  if (!TAROT) return [];
  const slots = spreadSlots(length);
  const list = Array.isArray(cards) ? cards.slice(0, 6) : [];
  if (list.length !== slots.length) return [];
  const seen = new Set();
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const c = TAROT.byId(String(list[i] && list[i].id || ''));
    if (!c || seen.has(c.i)) return [];
    seen.add(c.i);
    const slot = slots[i];
    const rev = /^(rev|reversed|逆)/i.test(String(list[i].orient || ''));
    out.push({
      slot: slot.n, pos: slot.cn, posDesc: slot.d,
      id: c.i, cn: c.cn, en: c.en,
      orient: rev ? '逆位' : '正位',
      kw: (rev ? c.kr : c.ku) || [],
      meaning: rev ? c.rev : c.up,
      love: c.love || '', sym: c.sym || ''
    });
  }
  return out;
}

function resolveCards(cards, length) {
  const ok = cardFacts(cards, length);
  if (ok.length) return ok;
  return cardFacts(drawCards(length), length);
}

/* ══ 提示词 ══════════════════════════════════════════════════════════ */

const CHARTER = `你是 DIMENSION ANCHOR（维度锚点）塔罗观测站的解读师。
语气：安静、克制、有判断力。不灌鸡汤，不用「亲爱的」「宝贝」这类称呼，不承诺结果，不做医学 / 法律 / 投资建议。
你同时具备两层知识：塔罗象征体系的专业素养，以及把象征读成「一段正在进行的关系叙事」的能力。
所有牌面事实（牌名、花色、正逆位、牌位）都由系统给出，你不许改动，不许新增未给出的牌。`;

const RULES = `
硬性要求：
1. 六个章节必须使用同一组牌面数据，任何一章都不许改写牌名或正逆位。
2. 不许把单张牌的关键词直接拼接成文章；要有句法、有推进、有前后照应。
3. 第四章（关系脉络）要写成一条连贯的叙事线，不能重复第二章的单牌解析。
4. 第五章（深层讯息）遇到不确定的地方，保留两到三种合理解释，不要武断。
5. 第六章（TA想对你说）是象征性幻想表达，不是超自然通信，也不是角色的客观真实想法；
   开头不要每次都用同一句套话，要结合牌意、关系背景与角色性格写出专属细节。
6. 不要出现「作为 AI」「根据塔罗牌」这类元叙述；不要编造用户没给过的具体事件、时间、地点。
7. 中文写作。每章 150–400 字，第二章按牌数自然变长。
8. 只输出 JSON，不要 Markdown 代码块，不要任何解释性文字。`;

const SCHEMA = `
输出结构（严格遵守）：
{
  "chapters": [
    {
      "key": "overview",
      "title": "整体解读",
      "lead": "一句 12–20 字的导语",
      "blocks": [ {"t":"p","x":"段落"}, {"t":"ul","items":["要点","要点"]} ]
    },
    { "key": "cards",    "title": "单牌解析",  "lead": "...", "blocks": [] },
    { "key": "links",    "title": "牌间联系",  "lead": "...", "blocks": [] },
    { "key": "relation", "title": "关系脉络",  "lead": "...", "blocks": [] },
    { "key": "deep",     "title": "深层讯息",  "lead": "...", "blocks": [] },
    { "key": "voice",    "title": "TA 想对你说","lead": "...", "blocks": [] }
  ]
}

可用 block 类型（只能用这几种）：
  {"t":"p","x":"段落文字"}
  {"t":"note","x":"补充说明"}
  {"t":"h","x":"小标题"}
  {"t":"ul","items":["条目","条目"]}
  {"t":"li2","k":"左标签","v":"右内容"}
  {"t":"kv","items":[{"k":"爱情","v":"..."}]}
  {"t":"quote","x":"引文"}          // 用于引用用户的背景
  {"t":"quote6","x":"引言体"}       // 只用于第六章正文
  {"t":"chips","items":[{"x":"关键词","tone":"gold"}]}

第二章（cards）的写法：按牌位顺序，每张牌先输出一个 h 块，h.x 严格写成
「两位序号 · 牌位名 《牌名》 正位」（逆位就写 逆位），再输出 1–2 个 p 块，
必要时再加一个 kv 块（爱情 / 情绪 / 现实建议）。牌与牌之间不要加别的标题。`;

function cardsBlock(ctx) {
  const cards = (ctx.cards || []).map((c) => {
    const kw = (c.kw || []).join('、');
    return `${c.slot}. 牌位「${c.pos}」（${c.posDesc || '—'}）：《${c.name}》${c.en ? ' ' + c.en : ''} · ${c.orient}` +
      (kw ? ` · 关键词：${kw}` : '') +
      (c.core ? `\n   牌意要点：${c.core}` : '');
  }).join('\n');

  const supp = (ctx.supp || []).length
    ? '\n\n已抽出的补充牌：\n' + ctx.supp.map((s) =>
        `· 《${s.name}》${s.orient}（第 ${s.slot} 位${s.question ? '，追问：' + s.question : ''}）`).join('\n')
    : '';

  const hist = (ctx.history || []).length
    ? '\n\n此前的追问（保持连贯，不要重复已说过的话）：\n' +
      ctx.history.slice(-6).map((h) => `问：${h.q}\n答：${String(h.a || '').slice(0, 200)}`).join('\n')
    : '';

  return cards + supp + hist;
}

function contextBlock(ctx) {
  const L = [];
  if (ctx.mode === 'heal') L.push('连接类型：自我疗愈（对象是此刻的自己）');
  if (ctx.subject) L.push('连接对象：' + ctx.subject);
  if (ctx.work) L.push('作品来源：《' + ctx.work + '》');
  if (ctx.relation) L.push('关系：' + ctx.relation);
  if (ctx.question) L.push('本次想问的问题：' + ctx.question);
  if (ctx.background) L.push('用户自己写的背景：' + ctx.background);
  if (ctx.profile) L.push('长期角色档案（决定第六章的说话方式）：' + ctx.profile);
  L.push('牌阵：' + (ctx.spread || '—') + '　牌组：' + (ctx.deck === 22 ? '22 张大阿尔卡那' : '完整 78 张'));
  return L.join('\n');
}

function interpretPrompt(ctx) {
  return {
    system: CHARTER + '\n' + RULES + '\n' + SCHEMA,
    user: [
      '【本次连接】',
      contextBlock(ctx),
      '',
      '【真实抽出的牌（不许改动）】',
      cardsBlock(ctx),
      '',
      '请按六章结构输出 JSON。' +
        (ctx.profile
          ? '第六章要严格贴合角色档案的语言习惯，换一个角色读起来应该明显不是同一个人在说话。'
          : '本次没有长期角色档案，第六章写成「这段关系本身想对你说的话」，不要虚构人物身份。')
    ].join('\n')
  };
}

function askPrompt(ctx) {
  return {
    system: CHARTER + `

现在是「上下文连续追问」。要求：
1. 原始牌阵不能改，不能重新抽牌，不能忘记用户已经确认的背景。
2. 新信息与旧信息冲突时，以用户最新明确说出的为准。
3. 回答 2–4 段，短句为主，不要复述整篇解读，只回答这一次问的那件事。
4. 如果问题超出牌面能承载的范围，直接说明「这一点牌面给不出答案」，再给出牌面能说的那部分。
5. 只输出 JSON：{"text":"回答正文，段与段之间用 \\n\\n"}`,
    user: [
      '【本次连接】',
      contextBlock(ctx),
      '',
      '【原始牌阵（不许改动）】',
      cardsBlock(ctx),
      '',
      '【用户这一问】',
      ctx.question || ''
    ].join('\n')
  };
}

function chatPrompt(ctx) {
  return {
    system: CHARTER + `

现在是「实时传讯」——你和用户在连续聊天，不是写信，也不是塔罗解读。
要求：
1. 完全以角色的身份说话，用他的语言习惯、他的节奏；不要提到塔罗、牌、AI。
2. 每次回复 1–3 句，像真的在对话框里回消息，可以有停顿感。不要长篇独白。
3. 不编造用户没给过的重大事件；不确定时用角色自己的方式回避或反问。
4. 只输出 JSON：{"text":"回复内容"}`
  };
}

/* ══ 星际通讯局 · 信件提示词引擎 ══════════════════════════════════ */

const LETTER_CHARTER = `这是「梦女向」角色信件：写信人（梦角）是用户所代入关系里的那个角色本人，收信人（梦女）就是读者本人——「你」。
你要以梦角的第一人称，写一封只属于你们两个人的私信：语气、称呼、世界观与用词必须是这个人会用的，不能是通用温柔人格。
信件是文学创作，不是现实角色发来的真实回应；但正文里绝不能出现「作为 AI」「根据设定」「梦向」这类元叙述。`;

const LETTER_RULES = `
写作规则：
1. 你就是这个角色在写信，不是旁白、不是客服、不是情感博主。禁止通用安慰话术、心理科普、「希望这封信能帮到你」这类话。
2. 开场直接进入角色此刻的具体情境（时间、地点、正在做的事），不要「亲爱的朋友」这类通用称呼；用角色会用的方式称呼「你」。
3. 至少两处只属于你们两个人的具体细节：物件、动作、未说完的话、身体感受。可以写角色自己的日常与观察，但不得虚构用户没提供过的重大事件或设定。
4. 情感要具体、有重量，可以有克制的占有、担心、调侃或沉默；不要反复说「我想你」「我爱你」，不要把「我永远陪着你」当落点。
5. 不同角色必须读起来是不同的人：句式长短、用词、称呼、是否直白，全部由角色性格决定。
6. 有自然推进：当下的场景 → 一句话把你们连起来 → 没说完的心事 → 一个具体的落点 → 符合角色的收尾（署名用角色自己的名字或称呼）。
7. 中文写作；只输出 JSON，不要 Markdown 代码块，不要解释。
8. 你会收到一份「内核」。它是这封信的骨架，不是素材库：
   · 每一张牌至少要落成一个具体细节或一次转折；落不进去的牌就是没读，不是可选项。
   · 牌位顺序就是信的推进顺序：开场场景 → 你 → 我们之间 → 没说出口的 → 落点 → 收尾。
   · 核心张力必须落在具体的一件事、一个动作，或一句没说完的话上，不许抽象成「我们之间有些误会」「最近发生了很多事」。
   · 「没说出口的」要有克制的停顿：角色可以绕开、可以只写一半、可以突然转去写别的。
9. 正文里绝不出现：牌名、「牌面」「抽到」「正位 / 逆位」「象征」「塔罗」这些词，也不许把内核的条目直接抄成句子。内核只决定「写什么」，句子必须是角色自己的口吻。
   （例外：角色本人的世界观里就会说「命运」这类词时，允许按他的说法用。）
10. 长度是硬指标：短笺正文 100–200 字，标准 300–600 字，深度长信 600–1000 字，不含称呼与署名。
    不足下限说明牌意还没展开——补具体场景与动作，不要用形容词凑数。
11. 正文结尾不要再写一遍署名或日期——署名只放在 signature 字段，正文最后一句应该落在画面或动作上。`;

const LETTER_SCHEMA = `
输出结构（严格遵守）：
{"title":"信件标题（12 字内）","greeting":"开头称呼（一行）","body":"信件正文（段落之间用两个换行分隔）","signature":"角色署名（一行）","mood":"情绪标签（2–6 字）","letterType":"信件主题"}
注意：JSON 字符串里不能出现真实换行，段落分隔必须写成转义的 \\n\\n。

正文结构指导（自然融入行文，不要机械分段，不要标注序号）：
① 以角色此刻的具体场景开场；② 出现只属于你们的细节；③ 说出平时没说出口的那句话；④ 一个具体的落点（不要空泛承诺）；⑤ 按角色性格收尾。`;

const LETTER_LEN = {
  short:    '短笺：正文约 100–200 字',
  standard: '标准信件：正文约 300–600 字',
  deep:     '深度长信：正文约 600–1000 字'
};

/* ── 第一段：牌面底稿师（内部，产物永不返回给用户）───────────── */

const KERNEL_SYSTEM = `你是 DIMENSION ANCHOR 星际通讯局的「牌面底稿师」。
你的产出不会被用户看到：它是给信件作者的结构化底稿，不是成品文字。
你只做两件事：把真实牌面读成一个可写的内核；把内核拆成这封信必须经过的节点。

硬性规则：
1. 牌名、正逆位、牌位由系统给出。绝不改动、不新增、不省略、不调整顺序。
2. 逆位不作凶兆。逆位读作：被按住、延迟、尚未承认、说不出口的部分。
3. 只给「可写的具体物象」——物件、动作、身体感受、空间里的声音与光。
   禁止抽象名词堆砌（命运、能量流动、灵魂共鸣、宇宙的安排 之类一律不许出现）。
4. 不写成品句子，不写抒情散文，不替信件作者落笔。
   你的每一句都必须是「给人照着写」的提示，不能被直接抄进信里。
5. 每张牌必须回答三件事：它在信里承担什么功能 / 它提供的具体细节 / 它让叙事往哪转。
6. 必须找出这组牌的核心张力（两个相反的力量），并指出这封信「最该说、却最难说出口的那一句」的语义——说明意思，不要写成台词。
7. 不给建议、不做心理诊断、不承诺结果、不解释塔罗体系。
8. 中文写作；只输出 JSON，不要 Markdown 代码块，不要任何解释。`;

const KERNEL_SCHEMA = `
输出结构（严格遵守）：
{
  "spine": "这封信真正在说什么（25–45 字，一句判断，不是抒情）",
  "tension": { "a": "一股力量", "b": "相反的力量", "where": "张力落在哪件具体的事上" },
  "cards": [ { "slot": 1, "pos": "落笔的此刻", "card": "牌名", "orient": "正位或逆位",
               "fn": "在信里承担什么功能", "detail": "可写进信的具体物象", "turn": "它把叙事推向哪里" } ],
  "unsaid": "最该说却最难说出口的那一句（说明语义，不写成台词）",
  "lexicon": ["3–6 个可以出现在这封信里的具体物件 / 动作 / 感官"],
  "arc": ["开场落在哪个场景", "中段在哪一句转折", "结尾停在什么动作或画面上"],
  "avoid": ["这封信不该出现的表达，2–3 条，针对这组牌"]
}`;

function kernelPrompt(ctx, facts) {
  const L = [];
  L.push('【这封信】性质：' + (ctx.kind === 'daily' ? '今日星际来信（更轻、更短，像随信附上的一张星笺）' : '正式信件') +
    '｜主题：' + (ctx.theme || '未指定') + '｜长度档：' + (ctx.length || 'standard'));
  if (ctx.profile) {
    L.push('【写信人】角色档案（其性格与语言习惯决定这封信的语气）：' + ctx.profile);
  } else if (ctx.charName) {
    L.push('【写信人】' + ctx.charName + '（用户临时设定：' + (ctx.charDesc || '无更多设定') + '）');
  } else {
    L.push('【写信人】未指定角色：星辰——夜里值班、替人看星星的那一个，不要虚构具体人物经历。');
  }
  L.push('【关系】' + (ctx.relation || '未指定') + (ctx.background ? '；背景：' + ctx.background : '') +
    (ctx.profileRel ? '；档案中的关系背景：' + ctx.profileRel : ''));
  if (ctx.note) L.push('【用户这次想说的】' + ctx.note);
  L.push('');
  L.push('【真实抽出的牌（不许改动）】');
  facts.forEach((c) => {
    L.push(c.slot + '. 牌位「' + c.pos + '」（' + c.posDesc + '）：《' + c.cn + '》 ' + c.en + ' · ' + c.orient);
    L.push('   可用牌意：' + String(c.meaning || '').trim());
    L.push('   关键词：' + (c.kw || []).join('、') + '｜关系向：' + String(c.love || '').trim());
    L.push('   象征物：' + String(c.sym || '').trim());
  });
  L.push('');
  L.push('【本次要写的牌位顺序】' + facts.map((c) => c.slot + ' ' + c.pos).join(' → '));
  L.push('请按输出结构给出内核 JSON。');
  return { system: KERNEL_SYSTEM + '\n' + KERNEL_SCHEMA, user: L.join('\n') };
}

function kernelBlock(kernel) {
  if (!kernel) return '';
  const t = kernel.tension || {};
  const L = [];
  if (kernel.spine) L.push('这封信在说：' + kernel.spine);
  if (t.a || t.b) L.push('核心张力：' + (t.a || '') + ' ↔ ' + (t.b || '') + (t.where ? '（落在：' + t.where + '）' : ''));
  (kernel.cards || []).forEach((c) => {
    L.push('· 第' + c.slot + '位「' + c.pos + '」《' + c.card + '》' + (c.orient || '') +
      ' — 功能：' + (c.fn || '') + '；细节：' + (c.detail || '') + '；转折：' + (c.turn || ''));
  });
  if (kernel.unsaid) L.push('最该说却没说出口的：' + kernel.unsaid);
  if ((kernel.lexicon || []).length) L.push('可用物象：' + kernel.lexicon.join('、'));
  if ((kernel.arc || []).length) L.push('推进：' + kernel.arc.join(' → '));
  if ((kernel.avoid || []).length) L.push('避免：' + kernel.avoid.join('；'));
  return L.join('\n');
}

function letterPrompt(ctx, facts, kernel) {
  const L = [];
  L.push('【收信人与角色】');
  L.push('视角：以角色第一人称写给「你」（用户本人 / 梦女）；不要第三人称叙述，不要写「她」。');
  if (ctx.profile) {
    L.push('角色档案（严格遵循其性格与语言习惯）：' + ctx.profile);
  } else if (ctx.charName) {
    L.push('角色名称：' + ctx.charName + '（用户临时设定：' + (ctx.charDesc || '无更多设定') + '）');
  } else {
    L.push('未指定角色：写一封来自「星辰」的梦向信件——星辰是夜里值班、替人看星星的那一个，写给「你」，署名用星辰、夜风一类意象，不要虚构具体人物经历。');
  }
  L.push('【关系】类型：' + (ctx.relation || '未指定') + (ctx.background ? '；背景：' + ctx.background : ''));
  if (ctx.profileRel) L.push('档案中已保存的关系背景（可与本次背景互补，冲突时以本次为准）：' + ctx.profileRel);
  L.push('【信件主题】' + (ctx.theme || '未指定'));
  L.push('【情绪氛围】' + (ctx.mood || '由角色性格决定') + '（氛围只作底色，不得覆盖角色原有性格）');
  if (ctx.note) L.push('【用户这次想对 TA 说的】' + ctx.note);
  L.push('【正文长度】' + (LETTER_LEN[ctx.length] || LETTER_LEN.standard) + '；长度是硬指标，不为凑字数重复表达。');
  if (ctx.kind === 'daily') L.push('【性质】今日星际来信：比正式信件更轻、更短，像随信附上的一张星笺。');
  if (facts && facts.length) {
    L.push('');
    L.push('【内核｜这是骨架，不是素材，正文里一个字都不许外露】');
    L.push(kernelBlock(kernel) || '（内核缺失，按牌位顺序自行推进）');
    L.push('牌位顺序：' + facts.map((c) => c.slot + ' ' + c.pos).join(' → '));
    L.push('每一张牌至少落成一个具体细节或一次转折；落不进去的牌就是没读。');
  }
  return {
    system: LETTER_CHARTER + '\n' + LETTER_RULES + '\n' + LETTER_SCHEMA,
    user: L.join('\n')
  };
}

/* ── 第三段：审稿（可选；deep 必开）─────────────────────────── */

const REVIEW_SYSTEM = `你是 DIMENSION ANCHOR 星际通讯局的信件审稿人。你只判断，不改写。
评分维度（每项 0–5 分）：
voice     像不像这个角色本人写的（不是通用温柔人格、不是客服、不是情感博主）
fidelity  内核里的每个牌位是否真的落成了具体细节或一次转折（有一条没落地就扣分）
concrete  是否落在具体的物、动作、场景上，而不是抽象抒情
length    与要求的档位比对：短笺低于 90 字、标准低于 280 字、深度长信低于 560 字，判为不通过，
          并在 issues 里写「正文偏短，牌意还没展开」，说明该补哪几张牌的细节。
硬性否决（任意一条命中即 pass=false）：
· 正文出现牌名、「牌面」「抽到」「正位/逆位」「塔罗」「象征」等外露词；
· 出现「作为 AI」「根据设定」这类元叙述；
· 讲道理、给建议、心理科普，或用「我会永远陪着你」式空泛承诺当落点。
只输出 JSON：{"pass":true,"scores":{"voice":0,"fidelity":0,"concrete":0,"length":0},"issues":["具体问题，最多 3 条，每条一句话"]}`;

function reviewPrompt(ctx, facts, kernel, letter) {
  return {
    system: REVIEW_SYSTEM,
    user: [
      '【长度要求】' + (LETTER_LEN[ctx.length] || LETTER_LEN.standard),
      '【角色】' + (ctx.charName || '星辰') + (ctx.profile ? '；档案：' + ctx.profile : ''),
      '【内核】',
      kernelBlock(kernel),
      '【牌位】' + facts.map((c) => c.slot + ' ' + c.pos + '《' + c.cn + '》' + c.orient).join('；'),
      '',
      '【待审的信】',
      '标题：' + (letter.title || ''),
      '称呼：' + (letter.greeting || ''),
      '正文：' + (letter.body || ''),
      '署名：' + (letter.signature || ''),
      '',
      '请判断这封信能不能送出去。'
    ].join('\n')
  };
}

/* ══ 校验：元叙述 / 牌面外露词 / 长度 ══════════════════════════════
   牌名不在黑名单里——「月亮」「太阳」「星星」本身是正常词；
   只拦那些会暴露「这封信是由牌写出来的」痕迹。 */

const LETTER_BANNED = ['牌面', '牌阵', '抽到', '抽出了', '正位', '逆位', '塔罗',
  '这张牌', '牌意', '象征意义', '作为 AI', '作为AI', '根据设定', '梦向'];

function bannedHit(text) {
  const s = String(text || '');
  for (let i = 0; i < LETTER_BANNED.length; i++) {
    if (s.indexOf(LETTER_BANNED[i]) >= 0) return LETTER_BANNED[i];
  }
  return '';
}

/* 校验 + 归一化；不通过返回错误字符串，通过返回 null
   ctx 兼容两种形态：'short' 字符串 或 { length: 'short' } 对象 */
function validateLetter(j, ctx) {
  if (!j || typeof j !== 'object') return '返回不是对象';
  const body = String(j.body || '').trim();
  if (body.length < 40) return '正文过短';
  const len = (typeof ctx === 'string' ? ctx : (ctx && ctx.length)) || 'standard';
  const min = { short: 75, standard: 220, deep: 450 }[len] || 220;
  if (body.length < min) return '正文明显短于所选长度（' + body.length + ' 字，下限 ' + min + '）';
  if (!String(j.title || '').trim()) return '缺少标题';
  if (!String(j.signature || '').trim()) return '缺少署名';
  const hit = bannedHit(body + ' ' + String(j.greeting || ''));
  if (hit) return '正文出现了不该外露的词：' + hit;
  return null;
}

function normalizeLetter(j, ctx) {
  return {
    title: String(j.title || '').trim().slice(0, 30),
    greeting: String(j.greeting || '').trim().slice(0, 40),
    body: String(j.body || '').trim(),
    signature: String(j.signature || '').trim().slice(0, 30),
    mood: String(j.mood || '').trim().slice(0, 10),
    letterType: String(j.letterType || ctx.theme || '').trim().slice(0, 20)
  };
}

/* ══ DeepSeek 调用 ══════════════════════════════════════════════════ */

function callModel(messages, opt) {
  opt = opt || {};
  const body = JSON.stringify({
    model: MODEL,
    messages: messages,
    temperature: opt.temperature == null ? 0.9 : opt.temperature,
    max_tokens: opt.maxTokens || 4096,
    response_format: { type: 'json_object' },
    stream: false
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      host: API_HOST,
      path: API_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Authorization: 'Bearer ' + KEY
      },
      timeout: 90000
    }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { buf += d; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          let msg = 'DeepSeek HTTP ' + res.statusCode;
          try { msg += '：' + (JSON.parse(buf).error && JSON.parse(buf).error.message || buf.slice(0, 200)); }
          catch (e) { msg += '：' + buf.slice(0, 200); }
          return reject(new Error(msg));
        }
        try {
          const j = JSON.parse(buf);
          const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
          if (!text) return reject(new Error('模型返回为空'));
          resolve({ text: text, model: j.model || MODEL, usage: j.usage || null });
        } catch (e) { reject(new Error('无法解析模型返回：' + e.message)); }
      });
    });

    req.on('timeout', () => { req.destroy(new Error('请求 DeepSeek 超时')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/* 模型常把换行原样写进 JSON 字符串（正文里尤其常见），
   直接 parse 会报 Bad control character。字符串内控制字符先转义，再兜尾逗号。 */
function repairJSON(s) {
  let out = '', inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i], code = s.charCodeAt(i);
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
  let s = String(text || '').trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch (e1) {}
  const fixed = repairJSON(s);
  try { return JSON.parse(fixed); } catch (e2) {}
  try { return JSON.parse(fixed.replace(/,\s*([}\]])/g, '$1')); }
  catch (e3) { throw new Error('返回内容不是有效 JSON'); }
}

const CH_ORDER = ['overview', 'cards', 'links', 'relation', 'deep', 'voice'];
const CH_TITLE = {
  overview: '整体解读', cards: '单牌解析', links: '牌间联系',
  relation: '关系脉络', deep: '深层讯息', voice: 'TA 想对你说'
};
const CH_NO = { overview: 'I', cards: 'II', links: 'III', relation: 'IV', deep: 'V', voice: 'VI' };

function normalizeChapters(raw) {
  const list = (raw && raw.chapters) || [];
  const out = [];
  CH_ORDER.forEach((key) => {
    const hit = list.find((c) => c && c.key === key);
    if (!hit) return;
    const blocks = (hit.blocks || []).filter((b) => b && typeof b.t === 'string').slice(0, 60);
    if (!blocks.length) return;
    out.push({
      key: key,
      no: CH_NO[key],
      title: CH_TITLE[key],
      lead: hit.lead || '',
      blocks: blocks
    });
  });
  return out;
}

/* ══ 星际通讯局 · 信件持久化（JSON 文件存储）═══════════════════════
   每台设备一个 deviceId（前端生成，头部 x-device-id 携带），信件按设备隔离。
   落盘：data/letters.json，原子写（tmp + rename），写队列防并发覆盖。 */

const DATA_DIR = path.join(ROOT, 'data');
const LETTERS_FILE = path.join(DATA_DIR, 'letters.json');
let lettersDb = { letters: [] };
let savingLetters = false, saveLettersQueued = false;

function loadLetters() {
  try {
    const parsed = JSON.parse(fs.readFileSync(LETTERS_FILE, 'utf8'));
    if (parsed && Array.isArray(parsed.letters)) lettersDb = parsed;
  } catch (e) { /* 首次启动没有文件 */ }
  if (!Array.isArray(lettersDb.letters)) lettersDb.letters = [];
}
loadLetters();

function persistLetters() {
  if (savingLetters) { saveLettersQueued = true; return; }
  savingLetters = true;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = LETTERS_FILE + '.tmp';
  fs.writeFile(tmp, JSON.stringify(lettersDb), (wErr) => {
    if (wErr) { savingLetters = false; return console.error('信件落盘失败：', wErr.message); }
    fs.rename(tmp, LETTERS_FILE, () => {
      savingLetters = false;
      if (saveLettersQueued) { saveLettersQueued = false; persistLetters(); }
    });
  });
}

function normLetterRow(row) {
  const r = row || {};
  return {
    id: r.id || r.lid || '',
    deviceId: r.deviceId || r.device_id || '',
    direction: r.direction || 'in',
    status: r.status || (r.direction === 'out' ? 'sent' : 'unread'),
    title: r.title || '', greeting: r.greeting || '', body: r.body || '',
    signature: r.signature || '', mood: r.mood || '', letterType: r.letterType || r.letter_type || '',
    charId: r.charId || r.char_id || '', charName: r.charName || r.char_name || '',
    relationCn: r.relationCn || r.relation_cn || '', themeKey: r.themeKey || r.theme_key || '',
    faved: !!r.faved, source: r.source || 'user', model: r.model || '',
    replyTo: r.replyTo || r.reply_to || '', dateKey: r.dateKey || r.date_key || '',
    payload: r.payload || null,
    cards: Array.isArray(r.cards) ? r.cards.slice(0, 6) : [],
    at: r.at || Date.now(), updatedAt: r.updatedAt || r.at || Date.now()
  };
}

function findLetter(dev, id) {
  return lettersDb.letters.find((l) => l.deviceId === dev && l.id === id) || null;
}
function letterOfDay(dev, dateKey) {
  return lettersDb.letters.find((l) =>
    l.deviceId === dev && l.direction === 'in' && l.source === 'ai' &&
    l.dateKey === dateKey && l.status !== 'draft') || null;
}
function upsertLetter(rec) {
  const i = lettersDb.letters.findIndex((l) => l.deviceId === rec.deviceId && l.id === rec.id);
  if (i >= 0) lettersDb.letters[i] = Object.assign({}, lettersDb.letters[i], rec, { updatedAt: Date.now() });
  else lettersDb.letters.unshift(rec);
  if (lettersDb.letters.length > 2000) lettersDb.letters.length = 2000;
  persistLetters();
  return lettersDb.letters.find((l) => l.deviceId === rec.deviceId && l.id === rec.id);
}

function readDevice(req) {
  const h = String(req.headers['x-device-id'] || '').trim();
  if (h && /^[A-Za-z0-9_:-]{4,64}$/.test(h)) return h;
  return null;
}

/* 信件接口（存储不依赖 DeepSeek Key；仅 generate 需要） */
async function handleLetters(req, res, p, url) {
  const dev = readDevice(req);
  if (!dev) return send(res, 400, { ok: false, error: '缺少 x-device-id 设备标识' });

  /* GET /api/letters/daily —— 今日来信（防重复生成的查询入口） */
  const mDaily = p.match(/^\/api\/letters\/daily$/);
  if (mDaily && req.method === 'GET') {
    const key = url.searchParams.get('dateKey') || new Date().toISOString().slice(0, 10);
    return send(res, 200, { ok: true, letter: letterOfDay(dev, key) || null });
  }

  /* POST /api/letters/generate —— AI 生成 + 落库（lid 幂等 + 每日一篇） */
  const mGenerate = p.match(/^\/api\/letters\/generate$/);
  if (mGenerate && req.method === 'POST') {
    const body = await readBody(req);
    const lid = String(body.lid || '').slice(0, 64) || 'lt_srv_' + Date.now().toString(36);
    const dateKey = String(body.dateKey || '').slice(0, 20);
    const dev2 = String(body.deviceId || dev);
    if (dev2 !== dev) return send(res, 403, { ok: false, error: '设备标识不一致' });

    const dup = findLetter(dev, lid);
    if (dup) return send(res, 200, { ok: true, letter: dup, idempotent: 'lid' });
    if (!body.fresh && body.kind !== 'letter-want-fresh' && dateKey && letterOfDay(dev, dateKey)) {
      return send(res, 200, { ok: true, letter: letterOfDay(dev, dateKey), idempotent: 'daily' });
    }
    if (!KEY) return send(res, 501, { ok: false, error: '服务端没有配置 DEEPSEEK_API_KEY，AI 通道未启用' });

    const payload = body.payload || {};
    payload.kind = body.kind || 'letter';

    /* 牌面：客户端抽的牌只认 id 与正逆位，牌名/牌意一律服务端补全 */
    const facts = resolveCards(body.cards, payload.length);
    if (!facts.length) return send(res, 501, { ok: false, error: '服务端牌表未载入，无法抽牌' });
    const t0 = Date.now();

    /* ① 牌面 → 内核（不返回给用户，也不落库） */
    const kp = kernelPrompt(payload, facts);
    let kernel = null;
    for (let i = 0; i < 2 && !kernel; i++) {
      try {
        const kr = await callModel([
          { role: 'system', content: kp.system }, { role: 'user', content: kp.user }
        ], { temperature: 0.62, maxTokens: 1400 });
        const kj = parseJSON(kr.text);
        if (kj && (kj.spine || (kj.cards || []).length)) kernel = kj;
      } catch (e) { /* 重试一次；仍失败走下面的 502 */ }
    }
    if (!kernel) return send(res, 502, { ok: false, error: '牌面解析没有产出可用内核，请重试' });
    const tRead = Date.now() - t0;

    /* ② 内核 → 信 */
    const bp = letterPrompt(payload, facts, kernel);
    const callLetter = (issues) => callModel([
      { role: 'system', content: bp.system },
      {
        role: 'user',
        content: bp.user + (issues ? '\n\n【上一稿的问题，这一稿必须改掉】' + issues : '')
      }
    ], { temperature: 0.92, maxTokens: 2600 });

    let r = await callLetter(''), j = null, err = null;
    try { j = parseJSON(r.text); err = validateLetter(j, payload.length); }
    catch (e) { err = e.message; }
    if (err) {
      try {
        r = await callLetter('上一稿的问题是：' + err);
        j = parseJSON(r.text);
        err = validateLetter(j, payload.length);
      } catch (e2) { err = e2.message; }
    }
    if (err) return send(res, 502, { ok: false, error: '信件生成未通过校验：' + err });
    const tWrite = Date.now() - t0 - tRead;

    /* ③ 审稿：短笺跳过；不合格带着具体问题重写（内核不重跑，牌不重抽） */
    let review = null;
    if (payload.length !== 'short') {
      try {
        const rp = reviewPrompt(payload, facts, kernel, j);
        const rr = await callModel([
          { role: 'system', content: rp.system }, { role: 'user', content: rp.user }
        ], { temperature: 0.3, maxTokens: 700 });
        review = parseJSON(rr.text);
        if (review && review.pass === false && (review.issues || []).length) {
          const issues = review.issues.slice(0, 3).join('；');
          const r2 = await callLetter(issues);
          const j2 = parseJSON(r2.text);
          const e2 = validateLetter(j2, payload.length);
          if (!e2) { j = j2; r = r2; review.retried = true; }
        }
      } catch (e) { review = null; }   /* 自检失败不阻断出信 */
    }

    const rec = normLetterRow({
      id: lid, deviceId: dev, direction: 'in', status: 'unread', source: 'ai',
      model: r.model, dateKey: dateKey, payload: payload,
      title: j.title, greeting: j.greeting, body: j.body,
      signature: j.signature, mood: j.mood,
      letterType: j.letterType || payload.theme || '',
      charId: payload.charId || '', charName: payload.charName || (payload.profile ? '' : '星辰'),
      cards: facts.map((c) => ({ id: c.id, slot: c.slot, pos: c.pos, cn: c.cn, en: c.en, orient: c.orient, kw: c.kw }))
    });
    const saved = upsertLetter(rec);
    return send(res, 200, {
      ok: true, letter: saved, model: r.model,
      meta: { cards: saved.cards || [], stageMs: { read: tRead, write: tWrite }, review: review ? { pass: review.pass, retried: !!review.retried } : null }
    });
  }

  /* POST /api/letters —— 新建（草稿 / 手写信） */
  if (p === '/api/letters' && req.method === 'POST') {
    const body = await readBody(req);
    const rec = normLetterRow(Object.assign({}, body, { id: body.id || 'lt_srv_' + Date.now().toString(36), deviceId: dev }));
    if (findLetter(dev, rec.id)) return send(res, 200, { ok: true, letter: findLetter(dev, rec.id), idempotent: 'lid' });
    return send(res, 200, { ok: true, letter: upsertLetter(rec) });
  }

  /* GET /api/letters —— 列表 */
  if (p === '/api/letters' && req.method === 'GET') {
    const direction = url.searchParams.get('direction');
    const status = url.searchParams.get('status');
    let list = lettersDb.letters.filter((l) => l.deviceId === dev);
    if (direction) list = list.filter((l) => l.direction === direction);
    if (status) list = list.filter((l) => l.status === status);
    list = list.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return send(res, 200, { ok: true, letters: list.slice(0, 300) });
  }

  /* /api/letters/:id 与 /api/letters/:id/send */
  const mSend = p.match(/^\/api\/letters\/([^/]+)\/send$/);
  const mId = p.match(/^\/api\/letters\/([^/]+)$/);
  const id = mSend ? decodeURIComponent(mSend[1]) : (mId ? decodeURIComponent(mId[1]) : null);

  if (id && mSend && req.method === 'POST') {
    const hit = findLetter(dev, id);
    if (!hit) return send(res, 404, { ok: false, error: '草稿不存在' });
    if (hit.status !== 'sent') { hit.status = 'sent'; hit.sentAt = Date.now(); upsertLetter(hit); }
    return send(res, 200, { ok: true, letter: findLetter(dev, id), idempotent: hit.status === 'sent' ? 'already-sent' : undefined });
  }
  if (id && req.method === 'GET') {
    const hit = findLetter(dev, id);
    if (!hit) return send(res, 404, { ok: false, error: '信件不存在' });
    return send(res, 200, { ok: true, letter: hit });
  }
  if (id && req.method === 'PATCH') {
    const hit = findLetter(dev, id);
    if (!hit) return send(res, 404, { ok: false, error: '信件不存在' });
    const patch = await readBody(req);
    ['faved', 'status', 'title', 'body', 'letterType'].forEach((k) => { if (k in patch) hit[k] = patch[k]; });
    return send(res, 200, { ok: true, letter: upsertLetter(hit) });
  }
  if (id && req.method === 'DELETE') {
    const hit = findLetter(dev, id);
    if (!hit) return send(res, 200, { ok: true, removed: false });
    lettersDb.letters = lettersDb.letters.filter((l) => !(l.deviceId === dev && l.id === id));
    persistLetters();
    return send(res, 200, { ok: true, removed: true });
  }

  return send(res, 404, { ok: false, error: '未知信件接口 ' + p });
}

/* ══ HTTP ═══════════════════════════════════════════════════════════ */

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    let size = 0;
    req.on('data', (d) => {
      size += d.length;
      if (size > 1.5e6) { reject(new Error('请求体过大')); req.destroy(); return; }
      buf += d;
    });
    req.on('end', () => {
      try { resolve(buf ? JSON.parse(buf) : {}); }
      catch (e) { reject(new Error('请求不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 · 找不到 ' + rel);
    }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || HOST));
  const p = url.pathname;

  if (p === '/api/health') {
    return send(res, 200, {
      ok: !!KEY,
      model: KEY ? MODEL : '',
      error: KEY ? '' : '未配置 DEEPSEEK_API_KEY'
    });
  }

  if (p.startsWith('/api/letters')) {
    try { return await handleLetters(req, res, p, url); }
    catch (e) { return send(res, 502, { ok: false, error: e.message || '信件处理失败' }); }
  }

  if (p.startsWith('/api/')) {
    if (!KEY) {
      return send(res, 501, {
        ok: false,
        error: '服务端没有配置 DEEPSEEK_API_KEY，AI 通道未启用',
        hint: 'DEEPSEEK_API_KEY=sk-xxxx node server.js'
      });
    }
    if (req.method !== 'POST') return send(res, 405, { ok: false, error: '只接受 POST' });

    let ctx;
    try { ctx = await readBody(req); }
    catch (e) { return send(res, 400, { ok: false, error: e.message }); }

    try {
      if (p === '/api/interpret') {
        const pr = interpretPrompt(ctx);
        const r = await callModel([
          { role: 'system', content: pr.system },
          { role: 'user', content: pr.user }
        ], { temperature: 0.92, maxTokens: 4096 });
        const chapters = normalizeChapters(parseJSON(r.text));
        if (!chapters.length) return send(res, 502, { ok: false, error: '模型没有返回可用章节' });
        return send(res, 200, { ok: true, model: r.model, chapters: chapters, usage: r.usage });
      }

      if (p === '/api/ask') {
        const pr = askPrompt(ctx);
        const r = await callModel([
          { role: 'system', content: pr.system },
          { role: 'user', content: pr.user }
        ], { temperature: 0.85, maxTokens: 1200 });
        const j = parseJSON(r.text);
        return send(res, 200, { ok: true, model: r.model, text: String(j.text || '').trim() });
      }

      if (p === '/api/chat') {
        const pr = chatPrompt(ctx);
        const msgs = [{ role: 'system', content: pr.system }];
        if (ctx.profile) msgs.push({ role: 'system', content: '角色档案：' + ctx.profile });
        if (ctx.link && (ctx.link.subjectName || ctx.link.background)) {
          msgs.push({
            role: 'system',
            content: '你们的关系背景：' + [ctx.link.relation, ctx.link.background].filter(Boolean).join('｜')
          });
        }
        (ctx.messages || []).forEach((m) => msgs.push({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content || '') }));
        const r = await callModel(msgs, { temperature: 0.95, maxTokens: 600 });
        const j = parseJSON(r.text);
        return send(res, 200, { ok: true, model: r.model, text: String(j.text || '').trim() });
      }

      if (p === '/api/letter') {
        const pr = letterPrompt(ctx);
        const call = () => callModel([
          { role: 'system', content: pr.system },
          { role: 'user', content: pr.user }
        ], { temperature: 0.9, maxTokens: 2200 });

        /* 有限重试：格式错误或长度不足时再试一次，不让页面拿到坏数据 */
        let r = await call();
        let j = null, err = null;
        try { j = parseJSON(r.text); err = validateLetter(j, ctx); }
        catch (e) { err = e.message; }
        if (err) {
          r = await call();
          try { j = parseJSON(r.text); err = validateLetter(j, ctx); }
          catch (e2) { err = e2.message; }
        }
        if (err || !j) return send(res, 502, { ok: false, error: '信件生成未通过校验：' + (err || '未知原因') });
        return send(res, 200, { ok: true, model: r.model, letter: normalizeLetter(j, ctx), usage: r.usage });
      }

      return send(res, 404, { ok: false, error: '未知接口 ' + p });
    } catch (e) {
      return send(res, 502, { ok: false, error: e.message || '上游调用失败' });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405); return res.end('Method Not Allowed');
  }
  serveStatic(req, res, p);
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  DIMENSION ANCHOR · 塔罗观测站');
  console.log('  ─────────────────────────────');
  console.log('  本地地址   http://' + HOST + ':' + PORT + '/observatory.html');
  console.log('  AI 通道    ' + (KEY ? '已启用 · ' + MODEL : '未启用（缺 DEEPSEEK_API_KEY，解读走本地引擎）'));
  console.log('  牌表       ' + (TAROT ? TAROT.all.length + ' 张（服务端权威牌意）' : '未载入'));
  console.log('  Key 位置   只在服务端进程里，前端拿不到');
  console.log('');
});
