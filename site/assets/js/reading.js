/* ══════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 塔罗观测站 · 抽牌流程
   连接仪式 → 牌阵 → 洗牌 → 切牌 → 扇形抽牌 → 手动翻牌 → 就位
   所有随机都走 DA_ENGINE（crypto + Fisher-Yates），动画只负责表现。
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var D = window.DA_TAROT;
  var ART = window.DA_ART;
  var SP = window.DA_SPREADS;
  var E = window.DA_ENGINE;
  var S = window.DA_SOUND;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var view = $('#view');
  var toastEl = $('#toast');
  var stepsEl = $('#steps');

  var faceCache = {};
  function faceOf(card) {
    if (!faceCache[card.i]) faceCache[card.i] = ART.face(card);
    return faceCache[card.i];
  }
  /* 牌背：按花色取对应的 AI 生成牌背（大阿尔卡那为默认） */
  function backOf(suit) {
    if (window.DA_BACKS) return DA_BACKS.img(suit);
    return window.DA_CARD ? DA_CARD.backArt() : '';
  }

  /* ══ 状态 ══════════════════════════════════════════════════ */
  var state = {
    step: 'ritual',
    mode: 'dream',        // dream | heal
    link: null,
    deckMode: 78,
    spreadKey: 'three',
    session: null,
    fanDeck: [],
    guideUsed: [],
    guideCard: null,
    traits: [],
    feedback: [],
    autoTimer: null,
    autoRunning: false
  };

  /* ══ 小工具 ════════════════════════════════════════════════ */
  function toast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.remove('is-on'); }, ms || 3000);
  }

  function setStep(step) {
    state.step = step;
    document.body.setAttribute('data-step', step);
    var order = ['ritual', 'spread', 'shuffle', 'draw', 'flip'];
    var idx = order.indexOf(step);
    if (step === 'board') idx = 5;
    Array.prototype.forEach.call(stepsEl.children, function (li, i) {
      li.classList.toggle('is-done', i < idx);
      li.classList.toggle('is-on', i === idx);
    });
    try {
      var u = new URL(location.href);
      u.searchParams.set('step', step);
      history.replaceState(null, '', u.pathname + u.search);
    } catch (e) {}

    /* 卡牌视觉：新渲染出来的牌一律补上统一金环 */
    paintCards();
  }

  function paintCards() {
    if (!window.DA_CARD) return;
    requestAnimationFrame(function () { DA_CARD.decorateAll(view); });
    setTimeout(function () { DA_CARD.decorateAll(view); }, 140);
  }

  function go(step) {
    S.page();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (step === 'ritual') return renderRitual();
    if (step === 'spread') return renderSpread();
    if (step === 'shuffle') return renderShuffle();
    if (step === 'draw') return renderDraw();
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function saveLink(o) {
    state.link = o;
    try { localStorage.setItem('DA_LINK_SESSION', JSON.stringify(o)); } catch (e) {}
  }

  /* ══════════════════════════════════════════════════════════
     1 · 连接仪式
     ══════════════════════════════════════════════════════════ */
  var RELATIONS = [
    { k: 'love', t: '爱情', d: '心动、亲密、无法说出口的那部分' },
    { k: 'friend', t: '友情', d: '并肩、默契、不必解释的关系' },
    { k: 'family', t: '亲情', d: '血缘或像家人一样的存在' },
    { k: 'other', t: '其他', d: '师徒、对手、同事，或还说不清的牵连' },
    { k: 'unsure', t: '暂不确定', d: '先不下定义，让牌来说' }
  ];

  function renderRitual() {
    setStep('ritual');
    if (state.mode === 'heal') return renderHeal();
    renderRitualChoose();
  }

  /* 情绪疗愈入口：先说出情绪 */
  function renderHeal() {
    var MOODS = ['焦虑', '疲惫', '空', '委屈', '生气', '舍不得', '害怕失去', '说不清'];
    view.innerHTML = [
      '<div class="pane">',
      '<div class="hd">',
      '<p class="hd__kicker">Emotional Healing</p>',
      '<h1 class="hd__title">先说说，现在是什么感觉</h1>',
      '<p class="hd__desc">不用组织语言。选一个最接近的词，再写一两句。牌会接着你的话往下说。</p>',
      '<div class="hd__rule"></div>',
      '</div>',
      '<div class="field">',
      '<span class="field__label">此刻最接近的情绪</span>',
      '<div class="chips" id="moodChips">',
      MOODS.map(function (m) {
        return '<button type="button" class="chip" data-m="' + m + '">' + m + '</button>';
      }).join(''),
      '</div>',
      '</div>',
      '<div class="field">',
      '<label class="field__label" for="moodText">发生了什么（可以不写）</label>',
      '<textarea id="moodText" placeholder="比如：明明已经说好了，但这两天他又突然不说话了。我不知道该不该问。"></textarea>',
      '<p class="field__hint">这段描述只会留在你本机，用来作为这次探索的背景。</p>',
      '</div>',
      '<div class="actions">',
      '<button class="btn btn--ghost" id="healBack">返回</button>',
      '<button class="btn btn--primary" id="healNext">继续，选牌阵</button>',
      '</div>',
      '</div>'
    ].join('');

    var picked = '';
    Array.prototype.forEach.call(view.querySelectorAll('#moodChips .chip'), function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(view.querySelectorAll('#moodChips .chip'), function (x) {
          x.classList.remove('is-on');
        });
        b.classList.add('is-on');
        picked = b.dataset.m;
        S.hover();
      });
    });

    $('#healBack').addEventListener('click', function () { location.href = window.DA_LINK ? DA_LINK.fix('observatory.html') : 'observatory.html'; });
    $('#healNext').addEventListener('click', function () {
      var txt = $('#moodText').value.trim();
      saveLink({
        mode: 'heal',
        subjectName: '此刻的自己',
        relation: '自我',
        relationKey: 'self',
        background: (picked ? '情绪：' + picked + '。' : '') + (txt || '未填写具体情境'),
        mood: picked,
        savedAt: Date.now()
      });
      go('spread');
    });
  }

  function renderRitualChoose() {
    view.innerHTML = [
      '<div class="pane">',
      '<div class="hd">',
      '<p class="hd__kicker">Connection Ritual</p>',
      '<h1 class="hd__title">先决定，你想连接谁</h1>',
      '<p class="hd__desc">连接仪式不是点名，而是把注意力放到一个方向上。' +
        '你可以已经知道那个人是谁，也可以只有一个模糊的轮廓——两种都可以开始。</p>',
      '<div class="hd__rule"></div>',
      '</div>',

      '<div class="paths">',
      '<button class="path" type="button" data-path="known">',
      '<span class="path__t">我已经知道想连接的对象</span>',
      '<span class="path__d">填写角色名、作品、关系类型与这次连接的背景。' +
        '也可以只写一句"最近在想一个很久没联系的人"。</span>',
      '<span class="path__go">走这条路 →</span>',
      '</button>',
      '<button class="path" type="button" data-path="unknown">',
      '<span class="path__t">我暂时不知道具体是谁</span>',
      '<span class="path__d">先抽一张连接引导牌，它会给出一些特征。' +
        '你来说像不像，我们一轮轮收窄，最后确认一个临时的轮廓。</span>',
      '<span class="path__go">开始探索 →</span>',
      '</button>',
      '</div>',

      '<p class="note">',
      '<b>关于这套仪式：</b>塔罗观测站是一个幻想互动与象征性探索的空间。' +
      '牌面与星座只用来帮你把感受说清楚，它不构成对任何真实人物的身份验证，' +
      '也不声称能确认某种超自然对象。本次连接默认是一次临时会话，' +
      '是否长期保存由你决定。',
      '</p>',

      '<div class="actions">',
      '<a class="btn btn--ghost" href="observatory.html">回到观测站</a>',
      '</div>',
      '</div>'
    ].join('');

    Array.prototype.forEach.call(view.querySelectorAll('.path'), function (b) {
      b.addEventListener('click', function () {
        S.hover();
        if (b.dataset.path === 'known') renderKnown();
        else renderGuide();
      });
    });
  }

  /* ---- 已知对象 ---- */
  function renderKnown() {
    view.innerHTML = [
      '<div class="pane">',
      '<div class="hd">',
      '<p class="hd__kicker">Known Subject</p>',
      '<h1 class="hd__title">你在想的那个人</h1>',
      '<p class="hd__desc">除了关系类型，其他都可以留空。留空也是一种信息。</p>',
      '<div class="hd__rule"></div>',
      '</div>',

      '<div class="field">',
      '<label class="field__label" for="kName">角色名称</label>',
      '<input type="text" id="kName" placeholder="可以是一个名字，也可以是一个称呼">',
      '</div>',

      '<div class="field">',
      '<label class="field__label" for="kWork">作品名称（选填）</label>',
      '<input type="text" id="kWork" placeholder="来自哪本书、哪部剧、哪段真实生活">',
      '</div>',

      '<div class="field">',
      '<span class="field__label">关系类型</span>',
      '<div class="chips" id="kRel">',
      RELATIONS.map(function (r) {
        return '<button type="button" class="chip' + (r.k === 'unsure' ? ' is-on' : '') +
          '" data-k="' + r.k + '" data-t="' + r.t + '">' + r.t + '</button>';
      }).join(''),
      '</div>',
      '</div>',

      '<div class="field">',
      '<label class="field__label" for="kCtx">本次连接的背景（选填）</label>',
      '<textarea id="kCtx" placeholder="最近发生了什么？你为什么想问这件事？一句话也行。"></textarea>',
      '<p class="field__hint">这段会作为解读的情境前提，不会发送给任何外部服务。</p>',
      '</div>',

      '<div class="actions actions--split">',
      '<button class="btn btn--ghost" id="kBack">换一条路</button>',
      '<div class="actions__right">',
      '<button class="btn btn--ghost" id="kSkip">跳过，用临时背景</button>',
      '<button class="btn btn--primary" id="kNext">确认连接</button>',
      '</div>',
      '</div>',
      '</div>'
    ].join('');

    var rel = { k: 'unsure', t: '暂不确定' };
    Array.prototype.forEach.call(view.querySelectorAll('#kRel .chip'), function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(view.querySelectorAll('#kRel .chip'), function (x) {
          x.classList.remove('is-on');
        });
        b.classList.add('is-on');
        rel = { k: b.dataset.k, t: b.dataset.t };
        S.hover();
      });
    });

    function build() {
      var name = $('#kName').value.trim();
      return {
        mode: 'known',
        subjectName: name || '未命名的对象',
        workName: $('#kWork').value.trim(),
        relation: rel.t,
        relationKey: rel.k,
        background: $('#kCtx').value.trim(),
        savedAt: Date.now()
      };
    }

    $('#kBack').addEventListener('click', function () { go('ritual'); });
    $('#kSkip').addEventListener('click', function () {
      saveLink({
        mode: 'known',
        subjectName: '临时连接',
        workName: '',
        relation: '暂不确定',
        relationKey: 'unsure',
        background: '使用临时连接背景，未填写具体对象。',
        savedAt: Date.now()
      });
      renderConfirm();
    });
    $('#kNext').addEventListener('click', function () {
      var o = build();
      if (!o.background) o.background = '未填写具体背景，以当下的注意力作为连接点。';
      saveLink(o);
      renderConfirm();
    });
  }

  /* ---- 未知对象：引导牌 ---- */
  function drawGuide() {
    var pool = E.buildDeck(22).filter(function (c) {
      return state.guideUsed.indexOf(c.i) === -1;
    });
    if (!pool.length) {
      state.guideUsed = [];
      pool = E.buildDeck(22);
    }
    E.shuffle(pool);
    var card = pool[E.randInt(pool.length)];
    state.guideUsed.push(card.i);
    return card;
  }

  var SUIT_ELEM = {
    wands: '身上有一点火——先动起来，再想为什么。热度是真的，只是退得也快。',
    cups: '身上有水——感受力很强，容易被氛围带走。记住的往往是语气，不是内容。',
    swords: '身上有风——想得比感受多。话不多，但一开口很准，有时准得有点疼。',
    pentacles: '身上有土——慢热、务实，看重能摸到、能重复、能一直放在那里的东西。',
    major: '不像一个具体的人，更像一个反复出现的原型。你每次描述他/她，都会用到同一个词。'
  };

  function traitsOf(card) {
    return [
      SUIT_ELEM[card.s] || SUIT_ELEM.major,
      '核心词是「' + card.ku.slice(0, 2).join('」与「') + '」。一想到这个人，先浮起来的就是这两个词。',
      '他/她出现的方式有点像「' + card.cn + '」这张牌：' + card.sym,
      '相处时你大概会有这种感觉：' + card.mood
    ];
  }

  function renderGuide() {
    var card = state.guideCard || drawGuide();
    state.guideCard = card;
    state.traits = traitsOf(card);
    S.draw();

    view.innerHTML = [
      '<div class="pane">',
      '<div class="hd">',
      '<p class="hd__kicker">Guiding Card</p>',
      '<h1 class="hd__title">连接引导牌</h1>',
      '<p class="hd__desc">这张牌不是那个人，只是我们用来对齐方向的第一句话。</p>',
      '<div class="hd__rule"></div>',
      '</div>',

      '<div class="guide">',
      '<div class="guide__card" aria-hidden="true">' + faceOf(card) + '</div>',
      '<div class="guide__body">',
      '<p class="guide__name">' + esc(card.cn) + '</p>',
      '<p class="guide__meta">' + esc(card.en) + ' · 大阿尔卡那 ' + esc(card.pip) + '</p>',
      '<ul class="guide__list">',
      state.traits.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join(''),
      '</ul>',
      '</div>',
      '</div>',

      '<p class="note">这些描述是象征性的联想，不是对任何人的判定。它只是帮你说出"像不像"。</p>',

      '<div class="actions">',
      '<button class="btn btn--ghost" id="gBack">换一条路</button>',
      '<button class="btn btn--ghost" id="gAgain">再抽一张</button>',
      '<button class="btn btn--primary" id="gNext">说说像不像</button>',
      '</div>',
      '</div>'
    ].join('');

    $('#gBack').addEventListener('click', function () { go('ritual'); });
    $('#gAgain').addEventListener('click', function () {
      state.guideCard = null;
      renderGuide();
    });
    $('#gNext').addEventListener('click', function () { renderFeedback(); });
  }

  /* ---- 反馈 ---- */
  function renderFeedback() {
    var round = state.feedback.length + 1;
    view.innerHTML = [
      '<div class="pane">',
      '<div class="hd">',
      '<p class="hd__kicker">Round ' + round + '</p>',
      '<h1 class="hd__title">这些描述，像不像</h1>',
      '<p class="hd__desc">没有标准答案。你的直觉比准确更重要。</p>',
      '<div class="hd__rule"></div>',
      '</div>',

      '<div class="guide" style="grid-template-columns:1fr">',
      '<ul class="guide__list" style="margin:0">',
      state.traits.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join(''),
      '</ul>',
      '</div>',

      '<div class="rcs rcs--2" style="margin-top:24px">',
      '<button class="rc" type="button" data-fb="fit">',
      '<span class="rc__t"><i></i>比较符合</span>',
      '<span class="rc__d">大概就是这种感觉。可以往下确认了。</span>',
      '</button>',
      '<button class="rc" type="button" data-fb="partial">',
      '<span class="rc__t"><i></i>部分符合</span>',
      '<span class="rc__d">有几点对上了，但还差一点。再抽一张收窄。</span>',
      '</button>',
      '<button class="rc" type="button" data-fb="no">',
      '<span class="rc__t"><i></i>不太符合</span>',
      '<span class="rc__d">方向不对。换一个角度，或者试试星座特征。</span>',
      '</button>',
      '<button class="rc" type="button" data-fb="free">',
      '<span class="rc__t"><i></i>我自己描述</span>',
      '<span class="rc__d">跳过引导，直接告诉我那个人是什么样的。</span>',
      '</button>',
      '</div>',

      '<div class="actions">',
      '<button class="btn btn--ghost" id="fBack">重新抽引导牌</button>',
      '</div>',
      '</div>'
    ].join('');

    $('#fBack').addEventListener('click', function () {
      state.guideCard = null;
      renderGuide();
    });

    Array.prototype.forEach.call(view.querySelectorAll('[data-fb]'), function (b) {
      b.addEventListener('click', function () {
        S.hover();
        var v = b.dataset.fb;
        state.feedback.push(v);
        if (v === 'fit') {
          state.guideConfirmed = true;
          renderUnknownConfirm();
        } else if (v === 'partial') {
          if (state.feedback.length >= 3) { renderZodiac(); return; }
          state.guideCard = null;
          renderGuide();
        } else if (v === 'no') {
          renderZodiac();
        } else {
          renderFree();
        }
      });
    });
  }

  /* ---- 星座特征匹配 ---- */
  var ZODIAC = {
    '白羊': '直来直往，先做后说。不太擅长解释自己，但答应过的事会做到。',
    '金牛': '节奏慢，但一旦认定就很难移动。喜欢具体的东西：食物、气味、同一首歌。',
    '双子': '同时开着好几个频道。聊得来，但很难真的停下来。',
    '巨蟹': '把在意藏在照顾里。不说想你，只问你吃饭了没有。',
    '狮子': '需要被看见。给你最好的，也希望你说出来。',
    '处女': '用细节表达感情。会记住你随口说过的一句话。',
    '天秤': '总在权衡。不是不在乎，是太怕选错。',
    '天蝎': '要么全给，要么不给。最不能忍的是被敷衍。',
    '射手': '往前跑的时候最自在。留下是选择，不是义务。',
    '摩羯': '把感情放进计划里。不说漂亮话，但会一直在。',
    '水瓶': '亲近又疏离。最珍贵的是那种不解释也懂的时刻。',
    '双鱼': '共情到会替对方难过。界线这件事，一直在学。'
  };

  var ZODIAC_BY_SUIT = {
    wands: ['白羊', '狮子', '射手'],
    cups: ['巨蟹', '天蝎', '双鱼'],
    swords: ['双子', '天秤', '水瓶'],
    pentacles: ['金牛', '处女', '摩羯'],
    major: ['天蝎', '双鱼', '狮子']
  };

  function renderZodiac() {
    var card = state.guideCard || { s: 'major' };
    var pool = ZODIAC_BY_SUIT[card.s] || ZODIAC_BY_SUIT.major;
    var picked = null;

    view.innerHTML = [
      '<div class="pane">',
      '<div class="hd">',
      '<p class="hd__kicker">Zodiac Resonance</p>',
      '<h1 class="hd__title">换个角度：星座特征</h1>',
      '<p class="hd__desc">引导牌给出的方向不太对，那就换一组性格坐标试试。' +
        '选一个最接近的，或者直接跳过。</p>',
      '<div class="hd__rule"></div>',
      '</div>',

      '<div class="rcs rcs--2" id="zList">',
      pool.map(function (z) {
        return '<button class="rc" type="button" data-z="' + z + '">' +
          '<span class="rc__t"><i></i>' + z + '</span>' +
          '<span class="rc__d">' + ZODIAC[z] + '</span></button>';
      }).join(''),
      '</div>',

      '<div class="actions">',
      '<button class="btn btn--ghost" id="zSkip">都不像，我自己描述</button>' +
      '<button class="btn btn--primary" id="zNext">用这个方向继续</button>',
      '</div>',
      '</div>'
    ].join('');

    Array.prototype.forEach.call(view.querySelectorAll('#zList .rc'), function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(view.querySelectorAll('#zList .rc'), function (x) {
          x.classList.remove('is-on');
        });
        b.classList.add('is-on');
        picked = b.dataset.z;
        S.hover();
      });
    });

    $('#zSkip').addEventListener('click', renderFree);
    $('#zNext').addEventListener('click', function () {
      if (!picked) { toast('先选一个方向，或者点"我自己描述"。'); return; }
      state.zodiac = picked;
      state.traits = state.traits.concat(['星座方向：' + picked + '。' + ZODIAC[picked]]);
      renderUnknownConfirm();
    });
  }

  /* ---- 自由描述 ---- */
  function renderFree() {
    view.innerHTML = [
      '<div class="pane">',
      '<div class="hd">',
      '<p class="hd__kicker">Free Description</p>',
      '<h1 class="hd__title">那你说，他/她是什么样的人</h1>',
      '<p class="hd__desc">不用管牌了。想到什么写什么，越具体越好。这段话会成为这次连接的背景。</p>',
      '<div class="hd__rule"></div>',
      '</div>',

      '<div class="field">',
      '<label class="field__label" for="freeText">你想到的那个对象</label>',
      '<textarea id="freeText" style="min-height:132px" placeholder="比如：总是很冷静，说话很慢，从来不说软话，但会在我生病的时候突然出现。"></textarea>',
      '</div>',

      '<div class="field">',
      '<span class="field__label">关系类型</span>',
      '<div class="chips" id="fRel">',
      RELATIONS.map(function (r) {
        return '<button type="button" class="chip' + (r.k === 'unsure' ? ' is-on' : '') +
          '" data-k="' + r.k + '" data-t="' + r.t + '">' + r.t + '</button>';
      }).join(''),
      '</div>',
      '</div>',

      '<div class="actions">',
      '<button class="btn btn--ghost" id="frBack">回到引导牌</button>',
      '<button class="btn btn--primary" id="frNext">用这段描述连接</button>',
      '</div>',
      '</div>'
    ].join('');

    var rel = { k: 'unsure', t: '暂不确定' };
    Array.prototype.forEach.call(view.querySelectorAll('#fRel .chip'), function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(view.querySelectorAll('#fRel .chip'), function (x) {
          x.classList.remove('is-on');
        });
        b.classList.add('is-on');
        rel = { k: b.dataset.k, t: b.dataset.t };
      });
    });

    $('#frBack').addEventListener('click', function () { renderGuide(); });
    $('#frNext').addEventListener('click', function () {
      var t = $('#freeText').value.trim();
      if (t.length < 4) { toast('再写一点点，哪怕只有一句。'); return; }
      state.freeText = t;
      state.relation = rel;
      renderUnknownConfirm();
    });
  }

  /* ---- 未知对象确认 ---- */
  function renderUnknownConfirm() {
    var rel = state.relation || { k: 'unsure', t: '暂不确定' };
    var summary = state.freeText
      ? state.freeText
      : state.traits.slice(0, 3).join(' ');

    view.innerHTML = [
      '<div class="pane">',
      '<div class="hd">',
      '<p class="hd__kicker">Confirm Connection</p>',
      '<h1 class="hd__title">这是我们要连接的那个轮廓吗</h1>',
      '<p class="hd__desc">它不是一个人的档案，只是这次探索的出发点。你可以随时回来改。</p>',
      '<div class="hd__rule"></div>',
      '</div>',

      '<div class="slots">',
      '<div class="slots__row"><span class="slots__n">1</span><em>连接对象</em>' +
        '<span>未确认具体身份的对象（由你的描述收窄）</span></div>',
      '<div class="slots__row"><span class="slots__n">2</span><em>关系类型</em>' +
        '<span>' + esc(rel.t) + '</span></div>',
      '<div class="slots__row"><span class="slots__n">3</span><em>连接摘要</em>' +
        '<span>' + esc(summary) + '</span></div>',
      '</div>',

      '<p class="note"><b>说明：</b>这是一次基于你设定的幻想互动与象征性探索。' +
        '牌面和星座只用来帮你把感受说清楚，不构成对任何真实人物的身份验证。</p>',

      '<div class="actions actions--split">',
      '<button class="btn btn--ghost" id="uBack">返回修改</button>',
      '<div class="actions__right">',
      '<button class="btn btn--primary" id="uOk">确认，进入日常梦占</button>',
      '</div>',
      '</div>',
      '</div>'
    ].join('');

    $('#uBack').addEventListener('click', function () { renderFeedback(); });
    $('#uOk').addEventListener('click', function () {
      saveLink({
        mode: 'unknown',
        subjectName: '未确认的对象',
        workName: '',
        relation: rel.t,
        relationKey: rel.k,
        background: summary,
        traits: state.traits,
        zodiac: state.zodiac || null,
        feedback: state.feedback,
        guideCard: state.guideCard ? state.guideCard.i : null,
        savedAt: Date.now()
      });
      renderConfirm();
    });
  }

  /* ---- 连接完成页 ---- */
  function renderConfirm() {
    var L = state.link || {};
    var rel = L.relation || '暂不确定';
    var theme = L.mode === 'unknown' ? '未确认对象的探索' :
      (L.mode === 'heal' ? '情绪疗愈' : '已知对象的连接');

    view.innerHTML = [
      '<div class="pane">',
      '<div class="hd">',
      '<p class="hd__kicker">Connection Established</p>',
      '<h1 class="hd__title">连接已建立</h1>',
      '<p class="hd__desc">现在可以往下走了。牌阵会决定我们从哪个角度切入。</p>',
      '<div class="hd__rule"></div>',
      '</div>',

      '<div class="slots">',
      '<div class="slots__row"><span class="slots__n">✦</span><em>连接主题</em>' +
        '<span>' + esc(theme) + '</span></div>',
      '<div class="slots__row"><span class="slots__n">1</span><em>连接对象</em>' +
        '<span>' + esc(L.subjectName || '临时连接') +
        (L.workName ? ' · 来自《' + esc(L.workName) + '》' : '') + '</span></div>',
      '<div class="slots__row"><span class="slots__n">2</span><em>关系类型</em>' +
        '<span>' + esc(rel) + '</span></div>',
      '<div class="slots__row"><span class="slots__n">3</span><em>连接摘要</em>' +
        '<span>' + esc(L.background || '未填写具体背景，以当下的注意力作为连接点。') + '</span></div>',
      '</div>',

      '<div class="actions actions--split">',
      '<button class="btn btn--ghost" id="cBack">返回修改信息</button>',
      '<div class="actions__right">',
      '<button class="btn btn--primary" id="cNext">继续，选牌阵</button>',
      '</div>',
      '</div>',
      '</div>'
    ].join('');

    $('#cBack').addEventListener('click', function () {
      if ((state.link || {}).mode === 'unknown') renderUnknownConfirm();
      else if ((state.link || {}).mode === 'heal') renderHeal();
      else renderKnown();
    });

    $('#cNext').addEventListener('click', function () { go('spread'); });
  }

  /* ══════════════════════════════════════════════════════════
     2 · 牌阵与牌组
     ══════════════════════════════════════════════════════════ */
  function renderSpread() {
    setStep('spread');
    if (!state.link) {
      try { state.link = JSON.parse(localStorage.getItem('DA_LINK_SESSION') || 'null'); } catch (e) {}
    }

    var cards = SP.all.map(function (s) {
      var prev = s.slots.map(function (sl) {
        return '<span class="' + (sl.rot ? 'is-rot' : '') + '" style="left:' +
          (sl.x / s.w * 100) + '%;top:' + (sl.y / s.h * 100) + '%"></span>';
      }).join('');
      var pctX = s.w / s.h;
      return '<button class="spread-card' + (s.key === state.spreadKey ? ' is-on' : '') +
        '" type="button" data-k="' + s.key + '">' +
        '<span class="spread-prev" style="aspect-ratio:' + pctX.toFixed(2) + ';height:auto">' + prev + '</span>' +
        '<span class="spread-card__t">' + s.cn + '<em>' + s.count + ' 张</em></span>' +
        '<span class="spread-card__d">' + s.hint + '</span>' +
        '</button>';
    }).join('');

    view.innerHTML = [
      '<div class="pane pane--wide">',
      '<div class="hd">',
      '<p class="hd__kicker">Spread &amp; Deck</p>',
      '<h1 class="hd__title">选一个牌阵</h1>',
      '<p class="hd__desc">牌阵决定我们从哪些角度看同一件事。' +
        '十张牌有两种完全不同的读法，可以都试试。</p>',
      '<div class="hd__rule"></div>',
      '</div>',

      '<div class="field">',
      '<span class="field__label">牌组</span>',
      '<div class="chips" id="deckChips">',
      '<button type="button" class="chip' + (state.deckMode === 78 ? ' is-on' : '') +
        '" data-d="78">完整 78 张</button>',
      '<button type="button" class="chip' + (state.deckMode === 22 ? ' is-on' : '') +
        '" data-d="22">仅 22 张大阿尔卡那</button>',
      '</div>',
      '</div>',

      '<div class="spreads" id="spreadGrid">' + cards + '</div>',

      '<div id="slotDetail"></div>',

      '<div class="actions actions--split">',
      '<button class="btn btn--ghost" id="sBack">返回连接</button>',
      '<div class="actions__right">',
      '<button class="btn btn--primary" id="sNext">进入洗牌仪式</button>',
      '</div>',
      '</div>',
      '</div>'
    ].join('');

    Array.prototype.forEach.call(view.querySelectorAll('#deckChips .chip'), function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(view.querySelectorAll('#deckChips .chip'), function (x) {
          x.classList.remove('is-on');
        });
        b.classList.add('is-on');
        state.deckMode = Number(b.dataset.d);
        S.hover();
      });
    });

    function paintSlots() {
      var s = SP.byKey(state.spreadKey);
      $('#slotDetail').innerHTML = '<div class="slots">' + s.slots.map(function (sl) {
        return '<div class="slots__row"><span class="slots__n">' + sl.n + '</span>' +
          '<em>' + sl.cn + '</em><span>' + sl.d + '</span></div>';
      }).join('') + '</div>';
    }
    paintSlots();

    Array.prototype.forEach.call(view.querySelectorAll('.spread-card'), function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(view.querySelectorAll('.spread-card'), function (x) {
          x.classList.remove('is-on');
        });
        b.classList.add('is-on');
        state.spreadKey = b.dataset.k;
        paintSlots();
        S.hover();
      });
    });

    $('#sBack').addEventListener('click', function () { go('ritual'); });
    $('#sNext').addEventListener('click', function () { go('shuffle'); });
  }

  /* ══════════════════════════════════════════════════════════
     3 · 洗牌与切牌
     ══════════════════════════════════════════════════════════ */
  function renderShuffle() {
    setStep('shuffle');
    var spread = SP.byKey(state.spreadKey);
    var deck = E.buildDeck(state.deckMode);
    state.workingDeck = deck;
    state.cutDone = false;

    view.innerHTML = [
      '<div class="pane">',
      '<div class="hd">',
      '<p class="hd__kicker">Shuffle</p>',
      '<h1 class="hd__title">洗牌</h1>',
      '<p class="hd__desc">' + state.deckMode + ' 张牌会在这里被真正打乱。' +
        '不是动画——数组顺序每次都会不一样。</p>',
      '<div class="hd__rule"></div>',
      '</div>',

      '<div class="deckstage" id="deckStage">',
      '<div class="deckpile" id="deckPile">' +
        '<div class="deckpile__card"></div>'.repeat(7) +
      '</div>',
      '</div>',
      '<p class="pile-count" id="pileCount">' + state.deckMode + ' 张 · 尚未洗牌</p>',

      '<div class="actions">',
      '<button class="btn btn--primary" id="doShuffle">开始洗牌</button>',
      '<button class="btn btn--ghost" id="doCut" disabled>切牌</button>',
      '<button class="btn btn--ghost" id="skipCut" disabled>跳过切牌</button>',
      '</div>',

      '<div id="cutArea"></div>',
      '</div>'
    ].join('');

    var stage = $('#deckStage');
    var pile = $('#deckPile');
    var doShuffle = $('#doShuffle');
    var doCut = $('#doCut');
    var skipCut = $('#skipCut');

    doShuffle.addEventListener('click', function () {
      doShuffle.disabled = true;
      stage.classList.add('is-shuffling');
      S.shuffle();

      // 真实洗牌：立刻改变数组顺序
      E.shuffle(state.workingDeck);

      setTimeout(function () {
        stage.classList.remove('is-shuffling');
        $('#pileCount').textContent = state.deckMode + ' 张 · 已洗牌（顺序已改变）';
        doCut.disabled = false;
        skipCut.disabled = false;
        doShuffle.textContent = '再洗一次';
        doShuffle.disabled = false;
        S.page();
      }, 1500);
    });

    doCut.addEventListener('click', function () {
      doCut.disabled = true;
      skipCut.disabled = true;
      S.cut();

      var r = E.cut(state.workingDeck);
      state.workingDeck = r.deck;
      state.cutAt = r.at;
      state.cutDone = true;

      $('#cutArea').innerHTML = [
        '<div class="cutstage" id="cutStage">',
        '<div class="cutpile cutpile--a"></div>',
        '<div class="cutpile cutpile--b"></div>',
        '</div>',
        '<p class="pile-count">在从上往下第 <strong>' + r.at + '</strong> 张处切开，' +
        '下面是新的顶部。本次切牌已记录。</p>'
      ].join('');

      requestAnimationFrame(function () {
        setTimeout(function () {
          var cs = $('#cutStage');
          if (cs) cs.classList.add('is-merged');
          setTimeout(function () { $('#cutArea').insertAdjacentHTML('beforeend', finishBtns()); bindFinish(); }, 760);
        }, 420);
      });
    });

    skipCut.addEventListener('click', function () {
      state.cutDone = false;
      state.cutAt = null;
      $('#cutArea').innerHTML = '<p class="pile-count">已跳过切牌。牌堆顺序保持不变。</p>' + finishBtns();
      bindFinish();
    });

    function finishBtns() {
      return '<div class="actions"><button class="btn btn--primary" id="toDraw">进入扇形抽牌</button></div>';
    }
    function bindFinish() {
      var b = $('#toDraw');
      if (b) b.addEventListener('click', function () { go('draw'); });
    }
  }

  /* ══════════════════════════════════════════════════════════
     4 · 扇形抽牌 + 手动翻牌
     ══════════════════════════════════════════════════════════ */
  /* ══ 舞台常量与小组件 ══════════════════════════════════════ */
  var MOON_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M15.4 3.6a8.4 8.4 0 1 0 5 13.4 6.9 6.9 0 1 1-5-13.4z" fill="currentColor" opacity=".92"/>' +
    '<circle cx="17.4" cy="6.2" r="1" fill="currentColor"/></svg>';

  var SOUND_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M4 9.5h3.2L12 5.6v12.8L7.2 14.5H4z" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/>' +
    '<path d="M15.6 9.2a4 4 0 0 1 0 5.6" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>';

  var BACK_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M14 6l-6 6 6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var REFRESH_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M19 12a7 7 0 1 1-2.4-5.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
    '<path d="M19.4 4.6v4.2h-4.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var SCENE_STEPS = [
    { k: 'ritual', t: '连接仪式' },
    { k: 'spread', t: '牌阵选择' },
    { k: 'shuffle', t: '洗牌切牌' },
    { k: 'draw', t: '抽牌之旅' },
    { k: 'flip', t: '翻开解读' }
  ];

  function stepsHTML(cur) {
    var order = ['ritual', 'spread', 'shuffle', 'draw', 'flip'];
    var ci = order.indexOf(cur);
    return SCENE_STEPS.map(function (st, i) {
      var cls = i === ci ? ' is-on' : (i < ci ? ' is-done' : '');
      return '<li class="sstep' + cls + '" data-s="' + st.k + '">' +
        '<span class="sstep__i"><span>' + (i + 1) + '</span></span>' +
        '<span class="sstep__l">' + st.t + '</span></li>';
    }).join('');
  }

  function renderDraw() {
    setStep('draw');
    var spread = SP.byKey(state.spreadKey);

    if (!state.workingDeck || !state.workingDeck.length) {
      state.workingDeck = E.buildDeck(state.deckMode);
      E.shuffle(state.workingDeck);
    }

    if (!state.session) {
      state.session = E.createSession({
        deckMode: state.deckMode,
        spread: spread,
        doCut: !!state.cutDone,
        cutAt: state.cutAt
      });
      state.fanDeck = state.workingDeck.slice();
    }

    view.innerHTML = [
      '<div class="scene">',
      '<div class="scene__bg" aria-hidden="true"></div>',
      '<div class="scene__veil" aria-hidden="true"></div>',
      '<div class="scene__floor" aria-hidden="true"></div>',

      '<div class="sbar">',
      '<div class="sbrand">',
      '<span class="sbrand__moon" aria-hidden="true">' + MOON_SVG + '</span>',
      '<span class="sbrand__t"><span>DIMENSION</span><span>ANCHOR</span></span>',
      '</div>',
      '<div class="stitle">',
      '<h1 class="stitle__h">塔罗观测站</h1>',
      '<p class="stitle__p">与星轨相遇，探索心灵的另一种可能</p>',
      '</div>',
      '<div class="sacts">',
      '<button class="spill" id="soundBtn2" type="button" aria-pressed="false">' + SOUND_SVG +
      '<span class="spill__label">音效</span></button>',
      '<a class="spill" href="observatory.html">',
      '<span class="spill__avatar" aria-hidden="true">◐</span>',
      '<span class="spill__label">我的观测档案</span></a>',
      '</div>',
      '</div>',

      '<div class="sbar2">',
      '<a class="sback" href="index.html">' + BACK_SVG + '<span>返回星轨大厅</span></a>',
      '<ol class="ssteps" id="ssteps">' + stepsHTML('draw') + '</ol>',
      '<span></span>',
      '</div>',

      '<p class="shint" id="statusBar"></p>',

      '<div class="swrap" id="swrap">',
      '<div class="boardwrap" id="boardWrap" hidden><div class="board" id="board"></div></div>',
      '<div class="fanwrap" id="fanWrap">',
      '<div class="fan" id="fan"><div class="fan__track" id="fanTrack"></div></div>',
      '<p class="fan__hint" id="fanHint">点击牌背抽牌</p>',
      '</div>',
      '</div>',

      '<div class="stray" id="stray" hidden>',
      '<span class="stray__lb" id="strayLb">已选 0 / 0</span>',
      '<div class="stray__list" id="strayList"></div>',
      '<button class="stray__undo" type="button" id="undoPick">撤销</button>',
      '</div>',

      '<div class="scta" id="drawActions"></div>',

      '<div class="sfoot">',
      '<div class="sspread">',
      '<span class="sspread__star" aria-hidden="true">✦</span>',
      '<span>当前牌阵：<b>' + esc(spread.cn) + '</b></span>',
      '<button type="button" class="sdetail" id="spreadDetail">查看详情 ›</button>',
      '</div>',
      '<button class="sreshuffle" type="button" id="reshuffle">' + REFRESH_SVG + '<span>重新洗牌</span></button>',
      '</div>',

      '<aside class="dside" id="dside" aria-label="牌阵提示">',
      '<h3 class="dside__t">牌阵提示</h3>',
      '<p class="dside__d">' + esc(spread.hint) + '</p>',
      '<ol class="dside__list">' + spread.slots.map(function (sl) {
        return '<li><b>' + sl.n + '</b><span>' + esc(sl.cn) + '：' + esc(sl.d) + '</span></li>';
      }).join('') + '</ol>',
      '</aside>',

      '</div>'
    ].join('');

    var boardWrap = $('#boardWrap');
    var boardEl = $('#board');
    var fan = $('#fan');
    var track = $('#fanTrack');

    var sb2 = $('#soundBtn2');
    if (sb2) {
      sb2.setAttribute('aria-pressed', muted ? 'true' : 'false');
      sb2.addEventListener('click', function () { soundBtn.click(); });
    }

    /* ---- 画板尺寸 ---- */
    function fitBoard() {
      var W = (boardWrap.clientWidth || window.innerWidth) - 46;
      var H = (boardWrap.clientHeight || window.innerHeight * 0.6) - 34;
      var s = Math.min(1, W / spread.w, H / spread.h);
      s = Math.max(0.14, s);
      boardEl.style.width = spread.w + 'px';
      boardEl.style.height = spread.h + 'px';
      boardEl.style.setProperty('--bs', s.toFixed(4));
    }

    /* ---- 铺牌位 ---- */
    var slotEls = {};
    var cw = spread.cw;
    var ch = Math.round(cw * 1.5);

    spread.slots.forEach(function (sl) {
      var d = document.createElement('div');
      d.className = 'slot';
      d.style.left = sl.x + 'px';
      d.style.top = sl.y + 'px';
      d.style.width = cw + 'px';
      d.style.height = ch + 'px';
      d.style.setProperty('--rot', (sl.rot || 0) + 'deg');
      d.dataset.slot = sl.n;
      d.innerHTML = '<span class="slot__no">' + sl.n + ' ' + sl.cn + '</span>' +
        '<span class="slot__ghost" data-n="' + sl.n + '"></span>' +
        '<div class="pc"><div class="pc__inner">' +
        '<div class="pc__back"></div>' +
        '<div class="pc__face"></div>' +
        '</div><span class="pc__tag"></span></div>';
      boardEl.appendChild(d);
      slotEls[sl.n] = d;
    });

    fitBoard();
    window.addEventListener('resize', fitBoard);

    /* ---- 扇形 ---- */
    var FAN_W = 86, FAN_H = 129;
    var dragging = false, dragStart = 0, dragScroll = 0, downX = 0, downY = 0, downT = 0;

    function layoutFan() {
      var n = state.fanDeck.length;
      if (!n) { $('#fanHint').textContent = '牌已抽完'; return; }

      var boxW = fan.clientWidth || 320;
      var isNarrow = boxW < 700;
      // 步距保持在一个「看得见牌背」的范围内：牌多时可横向滚动，而不是压成一条带子
      var ideal = (boxW - FAN_W - 40) / Math.max(1, n - 1);
      var stepPx;
      if (n > 30) {
        stepPx = isNarrow ? 30 : 46;            // 牌多时保持牌背可辨识，横向滑动查看
      } else {
        stepPx = isNarrow ? Math.max(22, Math.min(34, ideal)) : Math.max(26, Math.min(52, ideal));
      }
      var totalW = stepPx * (n - 1) + FAN_W;
      var needScroll = totalW > boxW;

      fan.classList.toggle('is-scroll', needScroll);
      track.style.width = totalW + 'px';

      // 增量同步：不重建 DOM，避免抽牌瞬间点击丢失
      var keep = {};
      state.fanDeck.forEach(function (c) { keep[c.i] = 1; });
      Array.prototype.slice.call(track.children).forEach(function (el) {
        if (!keep[el.dataset.i]) el.remove();
      });

      var byId = {};
      Array.prototype.forEach.call(track.children, function (el) { byId[el.dataset.i] = el; });

      var half = (totalW - FAN_W) / 2;

      state.fanDeck.forEach(function (card, i) {
        var b = byId[card.i];
        if (!b) {
          b = document.createElement('button');
          b.type = 'button';
          b.className = 'fan__card';
          b.dataset.i = card.i;
          b.setAttribute('aria-label', '抽这张牌');
          if (window.DA_BACKS) {
            b.style.backgroundImage = DA_BACKS.css(card.s);
            b.style.backgroundSize = '100% 100%';
            b.dataset.suit = card.s || 'major';
          }
          if (window.DA_CARD) DA_CARD.decorate(b, { dense: true });
          track.appendChild(b);
        }
        b.setAttribute('aria-label', '抽第 ' + (i + 1) + ' 张牌');
        var x = i * stepPx - half;
        var t = half ? x / half : 0;
        var y = Math.pow(Math.abs(t), 2.1) * (n > 40 ? 34 : 26);
        var a = t * (n > 40 ? 28 : 24);
        b.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + a + 'deg)';
        b.style.zIndex = String(10 + i);
      });

      if (needScroll && !layoutFan._inited) {
        layoutFan._inited = true;
        requestAnimationFrame(function () { fan.scrollLeft = (totalW - boxW) / 2; });
      }
    }

    function bindFan() {
      track.addEventListener('pointerdown', function (e) {
        var c = e.target.closest('.fan__card');
        if (!c) return;
        downX = e.clientX; downY = e.clientY; downT = Date.now();
        dragScroll = fan.scrollLeft;
      });

      track.addEventListener('pointerup', function (e) {
        var c = e.target.closest('.fan__card');
        if (!c) return;
        var moved = Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY);
        if (moved > 10) return;
        if (Date.now() - downT > 700) return;
        takeCard(c.dataset.i, c);
      });

      track.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var c = e.target.closest('.fan__card');
        if (!c) return;
        e.preventDefault();
        takeCard(c.dataset.i, c);
      });
    }

    /* ---- 抽一张 ---- */
    function takeCard(id, node) {
      var card = D.byId(id);
      if (!card) return;

      var entry = E.place(state.session, card, E.orientation() === 'rev');
      if (!entry) return;

      // 从扇形移除
      state.fanDeck = state.fanDeck.filter(function (c) { return c.i !== id; });
      if (node) node.classList.add('is-taken');

      S.draw();

      // 落位
      var slot = slotEls[entry.slot];
      var pc = slot.querySelector('.pc');
      var face = pc.querySelector('.pc__face');
      if (!face.dataset.filled) {
        face.innerHTML = faceOf(card);
        face.dataset.filled = '1';
      }
      // 未翻开的牌位用该牌所属花色的牌背
      var back = pc.querySelector('.pc__back');
      if (back && !back.dataset.filled) {
        back.innerHTML = backOf(card.s);
        back.dataset.filled = '1';
      }
      setTimeout(function () {
        pc.classList.add('is-in');
        var g = slot.querySelector('.slot__ghost');
        if (g) g.style.opacity = '.14';
      }, 60);

      if (!state.pickLog) state.pickLog = [];
      state.pickLog.push({ slot: entry.slot, id: id, fanIndex: state.fanDeck.length });
      setTimeout(layoutFan, 180);
      paintStatus();
      renderTray();
    }

    /* ---- 状态条 ---- */
    function paintStatus() {
      var placedN = state.session.cards.filter(function (c) { return c.placed; }).length;
      var need = state.session.cards.length;
      var bar = $('#statusBar');
      var acts = $('#drawActions');

      if (placedN < need) {
        bar.innerHTML = '<span>请从下方星轨中选择一张牌，开启你的探索</span>' +
          '<span class="statusbar__pill">已就位 ' + placedN + ' / ' + need + '</span>';
        $('#fanHint').textContent = '还剩 ' + state.fanDeck.length + ' 张可选';
        acts.innerHTML = '';
        setStep('draw');
      } else {
        bar.innerHTML = '<span>✦ 星轨已就位，' + need + ' 张牌都在它的位置上</span>' +
          '<span class="statusbar__pill">' + placedN + ' / ' + need + '</span>';
        $('#fanHint').textContent = '牌已全部就位';
        acts.innerHTML = '<button class="btn btn--primary" id="toFlip">选好了，开始翻牌 ✦</button>';
        $('#toFlip').addEventListener('click', function () { enterFlip(); });
        setStep('flip');
        S.complete();
      }
    }

    /* ---- 已选托盘 ---- */
    function renderTray() {
      var tray = $('#stray');
      if (!tray) return;
      var log = state.pickLog || [];
      var need = state.session.cards.length;
      tray.hidden = !log.length;
      if (!log.length) return;

      $('#strayLb').textContent = '已选 ' + log.length + ' / ' + need;
      $('#strayList').innerHTML = log.map(function (p) {
        return '<span class="stray__item" title="第 ' + p.slot + ' 张 · 点击可撤销"></span>';
      }).join('');
      Array.prototype.forEach.call(tray.querySelectorAll('.stray__item'), function (el, i) {
        el.addEventListener('click', function () { undoPick(i); });
      });
    }

    function undoPick(index) {
      var log = state.pickLog || [];
      if (!log.length) return;
      var i = (index == null || index < 0 || index >= log.length) ? log.length - 1 : index;
      var pick = log[i];
      var entry = state.session.cards.filter(function (c) { return c.slot === pick.slot; })[0];
      if (!entry || !entry.placed) return;
      if (entry.revealed) { toast('这张已经翻开过了，不能再撤回。'); return; }

      // 数据回滚：牌位清空
      entry.id = null; entry.cn = ''; entry.en = ''; entry.suit = '';
      entry.roman = ''; entry.reversed = false; entry.placed = false;
      entry.revealed = false; entry.revealOrder = 0;

      // 牌回到扇形
      var card = D.byId(pick.id);
      if (card) state.fanDeck.splice(Math.min(pick.fanIndex, state.fanDeck.length), 0, card);

      // 画板牌位复位
      var slot = slotEls[pick.slot];
      if (slot) {
        var pc = slot.querySelector('.pc');
        pc.classList.remove('is-in', 'is-flipped');
        var face = pc.querySelector('.pc__face');
        face.innerHTML = ''; face.dataset.filled = '';
        var bk = pc.querySelector('.pc__back');
        if (bk) { bk.innerHTML = ''; bk.dataset.filled = ''; }
        pc.querySelector('.pc__tag').textContent = '';
        var g = slot.querySelector('.slot__ghost');
        if (g) g.style.opacity = '';
      }

      log.splice(i, 1);
      layoutFan();
      renderTray();
      paintStatus();
      S.page();
    }

    var undoBtn = $('#undoPick');
    if (undoBtn) undoBtn.addEventListener('click', function () { undoPick(); });

    /* ---- 进入翻牌 ---- */
    function enterFlip() {
      S.page();
      var bar = $('#statusBar');
      var fanWrap = $('#fanWrap');
      if (fanWrap) fanWrap.hidden = true;
      var tray = $('#stray');
      if (tray) tray.hidden = true;
      boardWrap.hidden = false;
      fitBoard();
      var st = $('#ssteps');
      if (st) st.innerHTML = stepsHTML('flip');
      bar.innerHTML = '<span>逐张点击翻开 · 也可以一次揭示剩余</span>' +
        '<span class="statusbar__pill" id="flipCount">已翻 0 / ' + state.session.cards.length + '</span>';
      $('#drawActions').innerHTML =
        '<button class="btn btn--ghost" id="revealRest" style="display:none">揭示剩余星轨</button>' +
        '<button class="btn btn--ghost" id="pauseAuto" style="display:none">暂停</button>' +
        '<button class="btn btn--primary" id="toBoard" style="display:none">查看完整牌阵</button>';

      state.session.cards.forEach(function (entry) {
        var slot = slotEls[entry.slot];
        var pc = slot.querySelector('.pc');
        pc.addEventListener('click', function () { flipOne(entry, pc); });
        pc.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipOne(entry, pc); }
        });
        pc.setAttribute('tabindex', '0');
        pc.setAttribute('role', 'button');
        pc.setAttribute('aria-label', entry.positionCn + '：点击翻开');
      });

      $('#revealRest').addEventListener('click', startAuto);
      $('#pauseAuto').addEventListener('click', togglePause);
      $('#toBoard').addEventListener('click', function () { renderBoard(slotEls, spread); });
    }

    function flipOne(entry, pc) {
      if (entry.revealed) return;
      E.reveal(state.session, entry);
      S.flip();
      pc.classList.add('is-flipped');

      var card = D.byId(entry.id);
      var tag = pc.querySelector('.pc__tag');
      tag.textContent = (card ? card.cn : entry.cn) + ' · ' + (entry.reversed ? '逆位' : '正位');
      tag.classList.toggle('is-rev', entry.reversed);
      pc.setAttribute('aria-label', (card ? card.cn : '') + ' ' +
        (entry.reversed ? '逆位' : '正位'));

      var cnt = $('#flipCount');
      if (cnt) cnt.textContent = '已翻 ' + state.session.reveals + ' / ' + state.session.cards.length;

      var rest = $('#revealRest');
      if (rest && state.session.reveals >= 1) rest.style.display = '';

      if (state.session.done) {
        allDone();
      }
    }

    function allDone() {
      var rest = $('#revealRest');
      var pause = $('#pauseAuto');
      var toBoard = $('#toBoard');
      if (rest) rest.style.display = 'none';
      if (pause) pause.style.display = 'none';
      if (toBoard) { toBoard.style.display = ''; toBoard.textContent = '查看完整牌阵'; }
      S.complete();
      toast('全部翻开。先看清整个牌阵，再决定要不要读它。');
    }

    /* ---- 自动揭示 ---- */
    function startAuto() {
      if (state.autoRunning) return;
      state.autoRunning = true;
      $('#revealRest').style.display = 'none';
      $('#pauseAuto').style.display = '';

      function stepNext() {
        if (!state.autoRunning) return;
        var next = null;
        for (var i = 0; i < state.session.cards.length; i++) {
          if (!state.session.cards[i].revealed) { next = state.session.cards[i]; break; }
        }
        if (!next) {
          state.autoRunning = false;
          $('#pauseAuto').style.display = 'none';
          return;
        }
        var pc = slotEls[next.slot].querySelector('.pc');
        flipOne(next, pc);
        state.autoTimer = setTimeout(stepNext, 520 + E.randInt(260));
      }
      stepNext();
    }

    function togglePause() {
      if (state.autoRunning) {
        state.autoRunning = false;
        clearTimeout(state.autoTimer);
        $('#pauseAuto').textContent = '继续揭示';
      } else {
        state.autoRunning = true;
        $('#pauseAuto').textContent = '暂停';
        (function stepNext() {
          if (!state.autoRunning) return;
          var next = null;
          for (var i = 0; i < state.session.cards.length; i++) {
            if (!state.session.cards[i].revealed) { next = state.session.cards[i]; break; }
          }
          if (!next) { state.autoRunning = false; return; }
          flipOne(next, slotEls[next.slot].querySelector('.pc'));
          state.autoTimer = setTimeout(stepNext, 520 + E.randInt(260));
        })();
      }
    }

    var reshuffle = $('#reshuffle');
    if (reshuffle) reshuffle.addEventListener('click', function () {
      state.session = null;
      state.fanDeck = [];
      state.cutDone = false;
      state.cutAt = null;
      state.autoRunning = false;
      clearTimeout(state.autoTimer);
      go('shuffle');
    });

    var detail = $('#spreadDetail');
    if (detail) detail.addEventListener('click', function () {
      var d = $('#dside');
      if (!d) return;
      var open = d.classList.toggle('is-open');
      if (window.innerWidth > 1180) d.style.display = 'block';
      detail.textContent = open ? '收起详情 ‹' : '查看详情 ›';
      S.hover();
    });

    window.addEventListener('resize', function () { fitBoard(); });

    bindFan();
    layoutFan();
    paintStatus();
  }

  /* ══════════════════════════════════════════════════════════
     5 · 完整牌阵 · 开始解读
     ══════════════════════════════════════════════════════════ */
  function renderBoard(slotEls, spread) {
    setStep('board');
    var sess = state.session;
    var L = state.link || {};

    var rows = sess.cards.map(function (c) {
      return '<div class="slots__row"><span class="slots__n">' + c.slot + '</span>' +
        '<em>' + esc(c.positionCn) + '</em>' +
        '<span>' + esc(c.cn) + ' · ' + (c.reversed ? '逆位' : '正位') +
        ' · 第 ' + c.revealOrder + ' 张翻开</span></div>';
    }).join('');

    var revs = sess.cards.slice().sort(function (a, b) { return a.revealOrder - b.revealOrder; })
      .map(function (c) {
        return '<span' + (c.reversed ? ' class="is-rev"' : '') + '>' + c.revealOrder + '. ' +
          esc(c.cn) + (c.reversed ? ' 逆' : ' 正') + '</span>';
      }).join('');

    // 取牌阵画板外壳，先清空旧牌位再复用
    var bw = view.querySelector('#boardWrap');
    bw.querySelector('#board').innerHTML = '';
    var boardHTML = bw.outerHTML.replace('class="boardwrap"', 'class="boardwrap boardwrap--flow"');

    view.innerHTML = [
      '<div class="pane pane--wide">',
      '<div class="ready">',
      '<p class="ready__t">牌阵已完整</p>',
      '<p class="ready__d">先看整体，再决定要不要读它。' +
        '这一阶段只呈现牌面——解读会在你点下按钮之后才开始。</p>',
      '</div>',

      boardHTML,

      '<div class="statusbar">',
      '<span>' + esc(sess.spreadCn) + ' · ' + sess.cards.length + ' 张 · ' +
        (sess.deckMode === 22 ? '大阿尔卡那' : '完整 78 张') + '</span>',
      '<span class="statusbar__pill">' + (sess.cut ? '已切牌' : '未切牌') + '</span>',
      '<span class="statusbar__pill">' + esc(L.subjectName || '临时连接') + '</span>',
      '</div>',

      '<div class="reveal-list">' + revs + '</div>',

      '<div class="slots">' + rows + '</div>',

      '<div class="actions">',
      '<a class="btn btn--ghost" href="observatory.html">回到观测站</a>',
      '<button class="btn btn--primary" id="startRead">开始解读</button>',
      '</div>',
      '</div>'
    ].join('');

    // 重新挂载牌面
    var nb = view.querySelector('#board');
    var wrap = view.querySelector('#boardWrap');
    var s2 = Math.min(1, wrap.clientWidth / spread.w);
    nb.style.width = spread.w + 'px';
    nb.style.height = spread.h + 'px';
    nb.style.transform = 'translateX(-50%) scale(' + s2 + ')';
    wrap.style.height = (spread.h * s2) + 'px';

    spread.slots.forEach(function (sl) {
      var entry = sess.cards.filter(function (c) { return c.slot === sl.n; })[0];
      if (!entry) return;
      var cw = spread.cw, ch = Math.round(cw * 1.5);
      var d = document.createElement('div');
      d.className = 'slot';
      d.style.left = sl.x + 'px';
      d.style.top = sl.y + 'px';
      d.style.width = cw + 'px';
      d.style.height = ch + 'px';
      d.style.setProperty('--rot', (sl.rot || 0) + 'deg');
      var card = D.byId(entry.id);
      d.innerHTML = '<span class="slot__no">' + sl.n + ' ' + sl.cn + '</span>' +
        '<div class="pc is-in is-flipped"><div class="pc__inner">' +
        '<div class="pc__back">' + backOf(entry.suit || (card && card.s)) + '</div>' +
        '<div class="pc__face">' + (card ? faceOf(card) : '') + '</div>' +
        '</div><span class="pc__tag' + (entry.reversed ? ' is-rev' : '') + '">' +
        esc(entry.cn) + ' · ' + (entry.reversed ? '逆位' : '正位') + '</span></div>';
      nb.appendChild(d);
    });

    paintCards();

    window.addEventListener('resize', function () {
      var s3 = Math.min(1, wrap.clientWidth / spread.w);
      nb.style.transform = 'translateX(-50%) scale(' + s3 + ')';
      wrap.style.height = (spread.h * s3) + 'px';
    });

    // 存档，供"继续上次探索"使用
    try {
      var rec = JSON.parse(JSON.stringify(sess));
      rec.spreadCn = sess.spreadCn;
      rec.dateCn = new Date().toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
      rec.link = L;
      localStorage.setItem('DA_LAST_READING', JSON.stringify(rec));
    } catch (e) {}

    $('#startRead').addEventListener('click', function () {
      S.complete();
      location.href = window.DA_LINK ? DA_LINK.fix('interpretation.html') : 'interpretation.html';
    });
  }

  /* ══ 音效开关 ═══════════════════════════════════════════════ */
  var soundBtn = $('#soundBtn');
  var muted = false;
  try { muted = localStorage.getItem('DA_TAROT_MUTE') === '1'; } catch (e) {}
  soundBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
  S.setMuted(muted);

  soundBtn.addEventListener('click', function () {
    muted = !muted;
    soundBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    S.setMuted(muted);
    try { localStorage.setItem('DA_TAROT_MUTE', muted ? '1' : '0'); } catch (e) {}
  });

  ['pointerdown', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, function once() {
      S.unlock();
      window.removeEventListener(ev, once);
    }, { passive: true });
  });

  $('#backBtn').addEventListener('click', function () { S.page(); });

  /* ══ 启动 ═══════════════════════════════════════════════════ */
  (function boot() {
    var q = new URLSearchParams(location.search);
    var step = q.get('step') || 'ritual';
    if (q.get('mode') === 'heal') state.mode = 'heal';

    try {
      var saved = JSON.parse(localStorage.getItem('DA_LINK_SESSION') || 'null');
      if (saved) state.link = saved;
    } catch (e) {}

    if (step === 'spread') { renderSpread(); return; }
    if (step === 'shuffle' && state.link) { renderShuffle(); return; }
    renderRitual();
  })();

})();
