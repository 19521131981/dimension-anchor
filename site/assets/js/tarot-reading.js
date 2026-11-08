/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — TAROT READING COMPOSER
   ----------------------------------------------------------------------
   本地规则引擎：只依据本次真实牌阵的字段组合文本。
   输入 = 引擎会话对象（每张牌的真实 id / 牌位 / 正逆位 / 翻牌顺序）
        + 连接仪式里用户真实填写的对象与背景。
   输出 = 六个章节的结构化段落。
   ----------------------------------------------------------------------
   它不调用任何大模型，也不假装调用。
   每一句的主语、牌名、花色、正逆位都能回到数据里核对。
   ══════════════════════════════════════════════════════════════════════ */

window.DA_READING = (function () {
  'use strict';

  var D = window.DA_TAROT;

  /* 每章的导语（只描述这一章在讲什么，不预设结论） */
  var LEADS = {
    overview: '在不确定中寻找方向的星光',
    cards: '每一张牌，都在说同一件事的另一个侧面',
    links: '牌与牌之间，有一条还没被说出口的线',
    relation: '关系不是谁对谁错，是两股力量的夹角',
    deep: '答案通常不在更远的地方，而在更近的一层',
    voice: '有些话没有说出口，但它确实存在'
  };

  var SUITS = {
    wands: { cn: '权杖', el: '火', stance: '它要的是动作，不是更好的计划。' },
    cups: { cn: '圣杯', el: '水', stance: '它指向感受的流动，而不是一个结论。' },
    swords: { cn: '宝剑', el: '风', stance: '它要求一句说清楚的话，或者一次诚实的判断。' },
    pentacles: { cn: '星币', el: '土', stance: '它落在身体、时间与钱这些跑不掉的东西上。' }
  };

  var DOMINANT = {
    wands: '这件事被「行动与意志」推着走，停下来反而更消耗。',
    cups: '这件事的重心在「情感与关系」，逻辑只能排第二。',
    swords: '这件事的关键在「判断与沟通」，想清楚比做更多有用。',
    pentacles: '这件事落在「现实、时间与资源」上，看得见的部分才是真的。'
  };

  var ABSENT = {
    wands: '动力还没有真正点着，或者你在等一个不需要自己先开口的信号。',
    cups: '感受被放在了一边——不是没有，是没有被摆到桌面上。',
    swords: '少了一个把话说清楚、把利弊算明白的环节。',
    pentacles: '还没有落到具体的下一步，一切都停在想法里。'
  };

  /* 元素之间的呼应关系（用于牌间联系） */
  var PAIR = {
    'wands|swords': '火与风互相助燃：想法和执行在这里是同一件事。',
    'wands|cups': '火与水相冲，动力和情绪各拉一边，中间需要一个容器。',
    'wands|pentacles': '火要烧，土要稳；先给它一个能持续的形状。',
    'cups|pentacles': '水与土互相滋养：感受有地方落下，才不至于悬空。',
    'cups|swords': '水被风搅动：情绪正在被分析，但分析不一定是安慰。',
    'swords|pentacles': '风与土僵持，判断和现实互相不买账。'
  };

  function pairLine(sa, sb) {
    if (sa === sb) {
      return sa === 'major'
        ? '两张都是大牌，这一段被更大的周期推着走，个人努力只是配角。'
        : '同一组花色，同一股力量换了位置出现——它们不是两件事，是一件事的两个阶段。';
    }
    if (sa === 'major' || sb === 'major') {
      return '一重大牌接一张小牌：一个在讲「为什么」，一个在讲「怎么做」。';
    }
    var k1 = sa + '|' + sb, k2 = sb + '|' + sa;
    return PAIR[k1] || PAIR[k2] || '两种元素并置，各自成立，需要你手动把它们接起来。';
  }

  /* 会话条目 → 原始牌数据 */
  function data(e) { return D.byId(e && e.id) || {}; }
  function kwOf(e) {
    var c = data(e);
    var arr = e.reversed ? (c.kr || []) : (c.ku || []);
    return arr[0] || '';
  }

  function ori(e) { return e.reversed ? '逆位' : '正位'; }
  function pick(e, up, rev) { return e.reversed ? rev : up; }
  function joinCn(arr) {
    if (!arr.length) return '';
    if (arr.length === 1) return arr[0];
    return arr.slice(0, -1).join('、') + ' 与 ' + arr[arr.length - 1];
  }

  /* ── 统计 ─────────────────────────────────────────────────── */
  function analyze(session, cards) {
    var n = cards.length;
    var m = {
      n: n,
      majors: 0, minors: 0, ups: 0, revs: 0,
      suits: { wands: 0, cups: 0, swords: 0, pentacles: 0 },
      dominant: null, dominantCount: 0, absent: [],
      pips: {}, majorNums: {},
      reversedCards: [], majorCards: [], minorCards: []
    };
    cards.forEach(function (e) {
      if (e.suit === 'major') { m.majors++; m.majorCards.push(e); m.majorNums[e.roman] = (m.majorNums[e.roman] || 0) + 1; }
      else {
        m.minors++; m.minorCards.push(e);
        if (m.suits[e.suit] != null) m.suits[e.suit]++;
        m.pips[e.roman] = (m.pips[e.roman] || 0) + 1;
      }
      if (e.reversed) { m.revs++; m.reversedCards.push(e); } else m.ups++;
    });
    Object.keys(m.suits).forEach(function (k) {
      if (m.suits[k] > m.dominantCount) { m.dominantCount = m.suits[k]; m.dominant = k; }
    });
    if (m.dominantCount < 2) m.dominant = null;
    Object.keys(m.suits).forEach(function (k) { if (!m.suits[k]) m.absent.push(k); });
    m.revRatio = n ? m.revs / n : 0;
    return m;
  }

  function revLine(m) {
    if (!m.revs) return '全部正位，方向是顺的。要留意的不是阻力，而是别把顺利当成理所当然。';
    if (m.revRatio >= 0.5) return '逆位过半，说明这张牌阵里大部分能量是内收的、被推迟的，或者还没准备好被承认。';
    if (m.revRatio >= 0.25) return '逆位不多不少，正好是「有阻力但推得动」的状态。';
    return '逆位很少，方向是顺的，阻力主要来自节奏而不是结构。';
  }

  /* ── 单张的牌位串接句 ─────────────────────────────────────── */
  function stanceOf(e) {
    if (e.suit === 'major') return '大牌落在这一格，说明这一环不是靠技巧能绕过去的，它属于阶段性的功课。';
    return SUITS[e.suit] ? SUITS[e.suit].stance : '';
  }

  /* ══════════════════════════════════════════════════════════
     章节构建
     ══════════════════════════════════════════════════════════ */
  function build(session, link) {
    var L = link || {};
    var cards = (session.cards || []).filter(function (c) { return c.placed; });
    if (!cards.length) return null;

    var m = analyze(session, cards);
    var first = cards[0];
    var last = cards[cards.length - 1];
    var core = m.majorCards[0] || first;
    var deckCn = session.deckMode === 22 ? '大阿尔卡那（22 张）' : '完整 78 张';
    var chapters = [];

    /* ── I 整体解读 ─────────────────────────────────────── */
    var b1 = [];
    b1.push({
      t: 'p',
      x: '这一次，你在「' + session.spreadCn + '」里抽出了 ' + m.n + ' 张牌：' +
        m.ups + ' 张正位、' + m.revs + ' 张逆位；其中 ' + m.majors + ' 张大牌，' + m.minors + ' 张小牌。' +
        (session.deckMode === 22
          ? '你只用了大阿尔卡那，这是一次把问题拉回主线本身的抽法。'
          : '你用的是完整牌库，四组花色都在场，细节会更具体。')
    });
    b1.push({
      t: 'p',
      x: '最该先被读的是落在「' + first.positionCn + '」的《' + first.cn + '》' + ori(first) + '。' +
        pick(first, data(first).up || '', data(first).rev || '')
    });
    if (m.n > 1) {
      b1.push({
        t: 'p',
        x: '而收在「' + last.positionCn + '」的《' + last.cn + '》' + ori(last) + '，' +
          pick(last, data(last).up || '', data(last).rev || '')
      });
    }

    var facts = [];
    if (m.minors) {
      facts.push('花色分布：火（权杖）' + m.suits.wands + ' · 水（圣杯）' + m.suits.cups +
        ' · 风（宝剑）' + m.suits.swords + ' · 土（星币）' + m.suits.pentacles);
    }
    if (m.dominant) {
      facts.push(SUITS[m.dominant].cn + '出现最多（' + m.dominantCount + ' 次），元素是' +
        SUITS[m.dominant].el + '——' + DOMINANT[m.dominant]);
    }
    if (m.absent.length && m.minors) {
      facts.push(m.absent.map(function (k) { return SUITS[k].cn; }).join(' / ') + ' 完全没有出现——' +
        ABSENT[m.absent[0]]);
    }
    if (m.majors >= 3 && m.minors > 0) {
      facts.push('大牌 ' + m.majors + ' 张，占到 ' + Math.round(m.majors / m.n * 100) +
        '%——这不是一件小事，是一段正在推进的周期。');
    }
    facts.push(revLine(m));
    b1.push({ t: 'ul', items: facts });
    b1.push({
      t: 'note',
      x: '以上每一条都能在这 ' + m.n + ' 张牌的真实字段里对上：花色、正逆位、牌位、翻牌顺序。下面是逐张的展开。'
    });
    chapters.push({ key: 'overview', no: 'I', title: '整体解读', en: 'OVERVIEW', blocks: b1 });

    /* ── II 单牌解析 ─────────────────────────────────────── */
    var b2 = [];
    cards.forEach(function (e, idx) {
      var c = D.byId(e.id) || {};
      b2.push({
        t: 'h',
        x: String(e.slot).padStart(2, '0') + ' · ' + e.positionCn + '　《' + e.cn + '》' +
          (c.en ? ' ' + c.en : '') + '　' + ori(e)
      });
      b2.push({
        t: 'chips',
        items: (e.reversed ? (c.kr || []) : (c.ku || [])).map(function (k) { return { x: k, tone: 'gold' }; })
          .concat([{ x: e.positionCn, tone: 'plain' }, { x: ori(e), tone: e.reversed ? 'rev' : 'up' }])
      });
      b2.push({ t: 'p', x: pick(e, c.up || '', c.rev || '') });
      b2.push({
        t: 'p',
        x: '放在「' + e.positionCn + '」这个牌位上——“' + (e.positionDesc || '') + '”' +
          stanceOf(e)
      });
      if (e.reversed && c.rev) {
        b2.push({ t: 'p', x: '逆位时它说的是：' + c.rev });
      }
      b2.push({
        t: 'kv',
        items: [
          { k: '爱情', v: c.love || '—' },
          { k: '友情 · 亲情', v: c.kin || '—' },
          { k: '情绪内在', v: c.mood || '—' },
          { k: '现实建议', v: c.act || '—' },
          { k: '象征物', v: c.sym || '—' }
        ]
      });
      if (idx < cards.length - 1) b2.push({ t: 'rule' });
    });
    chapters.push({ key: 'cards', no: 'II', title: '单牌解析', en: 'THE CARDS', blocks: b2 });

    /* ── III 牌间联系 ───────────────────────────────────── */
    var b3 = [];
    if (m.n === 1) {
      b3.push({ t: 'p', x: '单牌阵没有牌与牌之间的关系可讲。这一张就是全部——《' + first.cn + '》' + ori(first) + '。' });
      b3.push({ t: 'p', x: pick(first, first.up, first.rev) });
    } else {
      b3.push({ t: 'p', x: '按牌位顺序把相邻的两张连起来，再加上重复的数字与花色聚集，就能看出这张牌阵在讲哪几件事。' });
      var pairs = Math.min(cards.length - 1, 5);
      var lastRel = '';
      for (var i = 0; i < pairs; i++) {
        var A = cards[i], B = cards[i + 1];
        var sameOri = (A.reversed === B.reversed);
        var rel = pairLine(data(A).s, data(B).s);
        var relNew = rel !== lastRel;
        lastRel = rel;
        b3.push({
          t: 'li2',
          k: '「' + A.positionCn + '」→「' + B.positionCn + '」',
          v: '《' + A.cn + '》' + ori(A) + ' 接 《' + B.cn + '》' + ori(B) + '。' +
            (relNew ? rel + ' ' : '') +
            '重心落在《' + B.cn + '》的「' + kwOf(B) + '」。' +
            (sameOri ? '两张同为' + ori(A) + '，方向一致。'
                     : '一张向外、一张向内，中间有一段错位。')
        });
      }
      if (cards.length - 1 > pairs) {
        b3.push({ t: 'note', x: '还有 ' + (cards.length - 1 - pairs) + ' 组相邻关系未逐条展开，避免重复。' });
      }

      var rep = Object.keys(m.pips).filter(function (k) { return m.pips[k] >= 2; });
      if (rep.length) {
        var names = rep.map(function (k) {
          return k + '（' + cards.filter(function (c) { return c.roman === k; })
            .map(function (c) { return c.cn; }).join('、') + '）';
        }).join('；');
        b3.push({ t: 'p', x: '同一个数字反复出现：' + names + '。数字在塔罗里是主题的复读——同一个课题被推到你面前不止一次。' });
      }
      var cluster = Object.keys(m.suits).filter(function (k) { return m.suits[k] >= 2; });
      if (cluster.length) {
        b3.push({
          t: 'p',
          x: cluster.map(function (k) {
            return SUITS[k].cn + ' ' + m.suits[k] + ' 张';
          }).join('、') + '——这是这次的底色。' +
            (cluster.length === 1 ? '同一元素密度这么高，说明问题已经窄到只剩一件事。'
                                  : '两条元素线并存，你得同时照顾两边。')
        });
      }
      if (m.majors) {
        b3.push({
          t: 'p',
          x: '大牌落在 ' + m.majorCards.map(function (c) { return '「' + c.positionCn + '」'; }).join('') +
            '，' + (m.majors >= 3 ? '整段叙事的分量集中在这些位置上。' : '只是点了一下，没有接管整个牌阵。')
        });
      }
    }
    b3.push({ t: 'note', x: '牌与牌之间没有必然的因果。这里说的是象征层面的呼应，不是事件层面的推论。' });
    chapters.push({ key: 'links', no: 'III', title: '牌间联系', en: 'BETWEEN THE CARDS', blocks: b3 });

    /* ── IV 关系脉络 ────────────────────────────────────── */
    var b4 = [];
    var hasSubject = !!(L.subjectName && String(L.subjectName).trim());
    if (hasSubject) {
      var who = '你连接的对象是「' + L.subjectName + '」';
      if (L.workName) who += '，来自《' + L.workName + '》';
      if (L.relation) who += '，你们的关系是「' + L.relation + '」';
      b4.push({ t: 'p', x: who + '。' });
      if (L.background && String(L.background).trim()) {
        b4.push({ t: 'quote', x: '你自己写下的背景：「' + L.background + '」' });
      } else {
        b4.push({ t: 'note', x: '你没有写背景，所以下面只从牌面读出关系的形状，不补写任何情节。' });
      }
    } else {
      b4.push({ t: 'p', x: '这次没有建立具体对象档案，所以下面只讲牌面呈现的关系结构，不指向任何具体的人。' });
    }

    var arc = cards.slice(0, 5);
    b4.push({
      t: 'ul',
      items: arc.map(function (e) {
        var c = D.byId(e.id) || {};
        var line = pick(e, c.love || '', c.rev || '');
        return '「' + e.positionCn + '」《' + e.cn + '》' + ori(e) + '：' + (line || c.act || '');
      })
    });

    if (m.revs) {
      var revPos = m.reversedCards.map(function (c) { return '「' + c.positionCn + '」'; }).join('');
      var extra = '';
      if (m.suits.swords >= 1) extra = '其中宝剑在场，这些位置多半和「没说出口的话」有关。';
      else if (m.suits.cups >= 1) extra = '其中圣杯在场，卡住的地方多半在感受，不在事实。';
      b4.push({ t: 'p', x: '张力集中在 ' + revPos + ' 这几格。' + extra });
    } else {
      b4.push({ t: 'p', x: '整副牌都是正位，关系里没有明显的暗流——更可能的风险是过于平稳，谁都不去动那块真正想动的部分。' });
    }
    if (L.relation && /恋|爱|暧昧|伴侣|前任|暗恋/.test(L.relation)) {
      b4.push({ t: 'p', x: '以「' + L.relation + '」这个前提来看，' + (m.suits.cups ? '水元素在场，说明这段关系里感受是主线。' : '水元素不在场，说明这段关系现在更多由现实或理智在维持。') });
    } else if (L.relation && /家|亲|父母|兄弟|姐妹/.test(L.relation)) {
      b4.push({ t: 'p', x: '以「' + L.relation + '」这个前提来看，' + ((D.byId(first.id) || {}).kin || '') });
    }
    b4.push({ t: 'note', x: '牌面不预测另一个人的行为，也不替任何人做决定。它只描述此刻的能量结构。' });
    chapters.push({ key: 'relation', no: 'IV', title: '关系脉络', en: 'THE THREAD', blocks: b4 });

    /* ── V 深层讯息 ─────────────────────────────────────── */
    var b5 = [];
    b5.push({
      t: 'p',
      x: '如果这张牌阵只允许留下一句话，那就是《' + core.cn + '》' + ori(core) + '：' +
        pick(core, data(core).up || '', data(core).rev || '')
    });
    if (m.reversedCards.length) {
      b5.push({ t: 'p', x: '逆位不是坏牌，是还没落地的那部分：' });
      b5.push({
        t: 'ul',
        items: m.reversedCards.slice(0, 4).map(function (e) {
          var c = D.byId(e.id) || {};
          return '《' + e.cn + '》逆位（' + e.positionCn + '）——' + (c.rev || '');
        })
      });
    }
    var coreC = D.byId(core.id) || {};
    b5.push({ t: 'p', x: '现实里能被执行的那一步：' + (coreC.act || '—') });
    b5.push({
      t: 'quote',
      x: '“当「' + ((coreC.ku || ['那件事'])[0]) + '」真的发生时，你会先放下什么？”'
    });
    b5.push({ t: 'note', x: '这是象征性的内在提示，不是诊断，也不是预言。' });
    chapters.push({ key: 'deep', no: 'V', title: '深层讯息', en: 'THE UNDERTOW', blocks: b5 });

    /* ── VI TA 想对你说 ─────────────────────────────────── */
    var b6 = [];
    var other = cards.filter(function (e) {
      return /对方|对象|TA|他者|映象|另一端/.test(e.positionCn + '');
    })[0];
    if (!other) other = m.minorCards.filter(function (e) { return e.suit === 'cups'; })[0];
    if (!other) other = last;
    var oc = D.byId(other.id) || {};

    b6.push({
      t: 'p',
      x: hasSubject
        ? '下面这段话是替「' + L.subjectName + '」拟的语气，从《' + other.cn + '》' + ori(other) +
          '（' + other.positionCn + '）的象征里借来的——不是对方真的说过的话。'
        : '这次没有指定对象，所以这段话是写给「关系里的另一端」的，可以是任何人。它来自《' +
          other.cn + '》' + ori(other) + '。'
    });
    b6.push({
      t: 'quote6',
      x: '“我这边大概是这样的：' + (oc.mood || '说不清，但确实有东西在动。') + '”<br>' +
        '“关于我们：' + (oc.love || '我不想把它说死。') + '”<br>' +
        '“如果要说一句实话——' + (oc.act || '我也还在找那个能说出口的版本。') + '”'
    });
    b6.push({ t: 'note', x: '这段是象征性的拟声，用来让你听见另一种可能，不代表对方的真实想法和立场。' });
    chapters.push({ key: 'voice', no: 'VI', title: 'TA 想对你说', en: 'WHAT THEY MIGHT SAY', blocks: b6 });

    chapters.forEach(function (ch) { ch.lead = LEADS[ch.key] || ''; });

    return {
      meta: m,
      chapters: chapters,
      session: session,
      link: L,
      core: core,
      deckCn: deckCn
    };
  }

  /* ══════════════════════════════════════════════════════════
     追问：本地规则回应（明确标注不是 AI）
     ══════════════════════════════════════════════════════════ */
  function answer(question, ctx) {
    var q = String(question || '').trim();
    var cards = ctx.cards || [];
    if (!q) return null;

    /* 用问题里的字去撞牌面字段，命中越多的牌越相关 */
    var best = null, bestScore = 0;
    cards.forEach(function (e) {
      var c = D.byId(e.id) || {};
      var hay = [c.cn, c.en, (c.ku || []).join(''), (c.kr || []).join(''),
        c.up, c.rev, c.love, c.kin, c.mood, c.act, c.sym, e.positionCn].join('|');
      var score = 0;
      for (var i = 0; i < q.length - 1; i++) {
        var tok = q.substr(i, 2);
        if (/[\s，。？、！？“”]/.test(tok)) continue;
        if (hay.indexOf(tok) >= 0) score++;
      }
      if (score > bestScore) { bestScore = score; best = e; }
    });

    var out = [];
    var hit = bestScore >= 2;
    var target = hit ? best : (ctx.core || cards[0]);
    var tc = data(target);

    out.push({
      t: 'p',
      x: (hit
        ? '你问的和《' + target.cn + '》对得上——'
        : '牌阵里没有一张正面回答这件事，最接近的是《' + target.cn + '》——') +
        '它在「' + target.positionCn + '」，' + ori(target) + '。'
    });
    out.push({ t: 'p', x: pick(target, tc.up || '', tc.rev || '') });

    if (ctx.supp && ctx.supp.id !== target.id) {
      var sc = data(ctx.supp);
      out.push({
        t: 'p',
        x: '补充牌《' + ctx.supp.cn + '》' + ori(ctx.supp) + '补的是另一个角度：' +
          pick(ctx.supp, sc.up || '', sc.rev || '')
      });
    }

    out.push({ t: 'p', x: '落到能做的：' + (tc.act || '—') });
    return out;
  }

  /* ══════════════════════════════════════════════════════════
     纯文本导出（复制用）
     ══════════════════════════════════════════════════════════ */
  function toText(result, session, link) {
    var L = link || {};
    var lines = [];
    lines.push('DIMENSION ANCHOR｜维度锚点 · 塔罗观测站');
    lines.push('解读结果 · ' + session.spreadCn + ' · ' + (session.deckMode === 22 ? '大阿尔卡那' : '完整 78 张'));
    if (L.subjectName) {
      lines.push('连接对象：' + L.subjectName + (L.relation ? '（' + L.relation + '）' : ''));
    }
    lines.push('日期：' + new Date().toLocaleString('zh-CN'));
    lines.push('');
    lines.push('—— 牌阵 ——');
    session.cards.filter(function (c) { return c.placed; }).forEach(function (c) {
      lines.push(c.slot + '. ' + c.positionCn + '：《' + c.cn + '》' + (c.reversed ? '逆位' : '正位'));
    });
    lines.push('');
    result.chapters.forEach(function (ch) {
      lines.push('—— ' + ch.no + ' ' + ch.title + ' ——');
      ch.blocks.forEach(function (b) {
        if (b.t === 'p' || b.t === 'note') lines.push(b.x.replace(/<br>/g, '\n'));
        else if (b.t === 'h') lines.push('· ' + b.x);
        else if (b.t === 'quote' || b.t === 'quote6') lines.push(b.x.replace(/<br>/g, '\n'));
        else if (b.t === 'ul') b.items.forEach(function (i) { lines.push('· ' + i); });
        else if (b.t === 'li2') lines.push('· ' + b.k + '：' + b.v);
        else if (b.t === 'kv') b.items.forEach(function (i) { lines.push('  ' + i.k + '：' + i.v); });
        else if (b.t === 'chips') lines.push('  关键词：' + b.items.map(function (i) { return i.x; }).join(' / '));
      });
      lines.push('');
    });
    lines.push('—— 说明 ——');
    lines.push('本页六章由本地规则引擎依据本次真实牌面字段组合生成，未调用大模型。');
    return lines.join('\n');
  }

  return { build: build, answer: answer, toText: toText, analyze: analyze };
})();
