/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 跨次元传讯 · 角色语气增强（可选）
   ----------------------------------------------------------------------
   默认：解读页第六章由本地引擎生成（人人可用、零额度、≥200 字）。
   增强：登录用户主动点「让 TA 说得更像本人」后，才调用云端模型，
         用完整的角色档案（性格/语言习惯/常说的话/价值观/往来）重写这段传讯。

   边界：
   · 不碰 Premium 鉴权与票据（那是 da-premium.ask 的事）。
   · 不新增任何服务端凭据；用的是 SDK 自带的登录会话（publishableKey）。
   · 只在用户主动触发时调用，绝不自动扣额度；失败静默回退本地文案。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SYSTEM = [
    '你是一位「跨次元传讯」的写作者。用户把塔罗牌当作媒介，想听见他心里那个特定角色（可能是虚构人物）此刻会怎样回应他。',
    '你的任务：以那个角色的第一人称，写一段「TA 可能对用户说的话」，严格贴合角色的性格、说话方式和态度。',
    '',
    '硬性要求：',
    '1. 字数必须 200 字以上。这是底线，不足 200 字视为失败。',
    '2. 只写角色自己会说的话，第一人称「我」，直接对着用户说。不要旁白、不要解释、不要分析。',
    '3. 绝不重复用户原话：不要出现「你问的是」「你写的是」「你提到」，也不要把用户的提问或背景原样复述回去。你只理解语境，不复述。',
    '4. 绝不照牌意背书：不要出现任何牌名、正位、逆位、塔罗、牌阵、元素、方位词，也不要解释某张牌象征什么。牌只是你揣摩语气的线索。',
    '5. 严格贴合角色：角色档案里的「语言习惯」「常说的话」是语气的准绳——用他的句式、用词、节奏，但不要照抄例句。冷淡的人就收着说，温柔的人就软一点，理性的人就把话讲清楚。',
    '6. 分寸由「关系阶段」决定：亲近可以软，初识/陌生要克制，不越界、不替对方承诺心意、不预测未来。',
    '7. 只输出传讯正文，不要标题、不要引号包裹、不要任何前后说明。',
    '8. 绝对不要在末尾或任何地方加免责声明、旁白、注释，也不要说"这是一段想象""仅供参考""不代表真实想法"之类的话。你就是 TA 本人，在直接对用户说话，这段话是完整而真实的。'
  ].join('\n');

  function plain(v) {
    if (v === undefined || v === null) return '';
    return String(v).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }

  /* 构造传给模型的资料：角色档案全文 + 牌的本意(作为语气线索) + 连接信息 */
  function buildMessages(ctx) {
    ctx = ctx || {};
    var lines = [];
    var p = ctx.persona || {};

    lines.push('【你要扮演的角色】');
    var hasInfo = false;
    if (p.name) { lines.push('名字：' + plain(p.name)); hasInfo = true; }
    if (p.work) lines.push('来自：' + plain(p.work));
    if (p.relation) { lines.push('和用户的关系：' + plain(p.relation)); hasInfo = true; }
    if (p.traits) { lines.push('性格：' + plain(p.traits)); hasInfo = true; }
    if (p.speech) { lines.push('语言习惯（语气准绳）：' + plain(p.speech)); hasInfo = true; }
    if (p.catchUp) { lines.push('常说的话（学他的口气，不要照抄）：' + plain(p.catchUp)); hasInfo = true; }
    if (p.values) { lines.push('在意的事：' + plain(p.values)); hasInfo = true; }
    if (p.history) { lines.push('你们之间的过往：' + plain(p.history)); hasInfo = true; }
    if (!hasInfo) lines.push('（用户没有填写角色档案，请用一个温和而诚实、不越界的口吻）');

    var stageCn = { close: '亲近', familiar: '熟悉', initial: '初识', stranger: '陌生', unspecified: '未说明' };
    lines.push('');
    lines.push('关系阶段（决定分寸）：' + (stageCn[p.stage] || '未说明'));

    if (ctx.scene) lines.push('这次连接的处境（只作理解，绝不复述）：' + plain(ctx.scene));

    var im = ctx.imagery || {};
    lines.push('');
    lines.push('【这次牌面给出的情绪线索 — 只作揣摩语气，绝不写进正文】');
    if (im.themes && im.themes.length) lines.push('意象：' + im.themes.map(plain).join('、'));
    if (im.moods && im.moods.length) lines.push('情绪底色：' + im.moods.map(plain).join('、'));
    if (im.inward) lines.push('整体偏内收、慢热、还在酝酿');

    lines.push('');
    lines.push('现在，以这个角色的口吻，写一段 200 字以上、对着用户说的回应。只输出正文。');

    return [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: lines.join('\n') }
    ];
  }

  function signedIn() {
    return !!(window.DA_AUTH && typeof window.DA_AUTH.uid === 'function' && window.DA_AUTH.uid());
  }

  /* 生成增强传讯。返回 Promise<string>。
     未登录 / 无模型 / 生成失败 / 字数不足 → reject（调用方保留本地版本）。 */
  function enhance(ctx) {
    if (!signedIn()) return Promise.reject(new Error('SIGN_IN_REQUIRED'));
    if (!window.DA_PREMIUM || !window.DA_PREMIUM.client) return Promise.reject(new Error('CLOUD_UNAVAILABLE'));

    var messages = buildMessages(ctx);
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
            model: model.id, messages: messages, stream: true, temperature: 0.9
          });
          for await (var chunk of stream) {
            var d = chunk && chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
            if (d && d.content) out += d.content;
          }
        })().then(function () {
          var text = plain(out).replace(/^["'「]|["'」]$/g, '');
          /* 模型有时会自作主张在末尾补一句免责声明，这里剥掉，
             让 TA 的话保持完整、沉浸，不被旁白打断。 */
          text = text.replace(/(（|\(|【)?\s*(注|备注|说明)[：:]?.{0,80}$/g, '');
          text = text.replace(/[\s\S]{0,40}(以上|这段话|本段).{0,20}(想象|模拟|虚构|不代表真实|仅供娱乐|并非真实)[^\n。！？]*[。！？]?\s*$/g, '');
          text = text.replace(/[\s\S]{0,40}(仅供参考|仅供娱乐|不代表.{0,12}真实想法)[^\n。！？]*[。！？]?\s*$/g, '');
          text = text.replace(/\s+$/, '');
          if (text.length < 200) throw new Error('TOO_SHORT');
          return text;
        });
      });
    });
  }

  window.DA_TRANSMISSION = {
    enhance: enhance,
    buildMessages: buildMessages, // 便于审计 prompt
    signedIn: signedIn
  };
})();
