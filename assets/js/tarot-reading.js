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

  /* ── 文本兜底 ──────────────────────────────────────────────
     任何缺失的字段都不得以 undefined / null / NaN 的形式出现在
     用户可见的文案里：牌库缺字段、旧记录缺字段、AI 通道回传空值时，
     一律换成可读的兜底文本，而不是把字面量漏给用户。 */
  function T(v, fb) {
    var fallback = (fb === undefined || fb === null) ? '' : String(fb);
    if (v === undefined || v === null) return fallback;
    var s = String(v);
    if (s === 'undefined' || s === 'null' || s === 'NaN') return fallback;
    return s;
  }
  function FIRST(arr, fb) {
    if (!arr || !arr.length) return (fb === undefined || fb === null) ? '' : String(fb);
    return T(arr[0], fb);
  }
  /* 安全取数组元素：索引越界（含负数）时返回兜底，不会拿到 undefined */
  function AT(arr, idx, fb) {
    if (!arr || !arr.length) return (fb === undefined || fb === null) ? '' : String(fb);
    var i = idx % arr.length;
    if (i < 0) i += arr.length;
    return T(arr[i], fb);
  }

  /* 会话条目 → 原始牌数据 */
  function data(e) { return D.byId(e && e.id) || {}; }
  function kwOf(e) {
    var c = data(e);
    var arr = e.reversed ? (c.kr || []) : (c.ku || []);
    return T(arr[0], '');
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
      x: '这一次，你在「' + T(session.spreadCn, '这次牌阵') + '」里抽出了 ' + m.n + ' 张牌：' +
        m.ups + ' 张正位、' + m.revs + ' 张逆位；其中 ' + m.majors + ' 张大牌，' + m.minors + ' 张小牌。' +
        (session.deckMode === 22
          ? '你只用了大阿尔卡那，这是一次把问题拉回主线本身的抽法。'
          : '你用的是完整牌库，四组花色都在场，细节会更具体。')
    });
    b1.push({
      t: 'p',
      x: '最该先被读的是落在「' + T(first.positionCn, '这个位置') + '」的《' + T(first.cn, '这张牌') + '》' + ori(first) + '。' +
        T(pick(first, data(first).up || '', data(first).rev || ''), '')
    });
    if (m.n > 1) {
      b1.push({
        t: 'p',
        x: '而收在「' + T(last.positionCn, '那个位置') + '」的《' + T(last.cn, '那张牌') + '》' + ori(last) + '，' +
          T(pick(last, data(last).up || '', data(last).rev || ''), '')
      });
    }

    var facts = [];
    if (m.minors) {
      facts.push('花色分布：火（权杖）' + m.suits.wands + ' · 水（圣杯）' + m.suits.cups +
        ' · 风（宝剑）' + m.suits.swords + ' · 土（星币）' + m.suits.pentacles);
    }
    if (m.dominant) {
      facts.push(T(SUITS[m.dominant] && SUITS[m.dominant].cn, '这一组') + '出现最多（' + m.dominantCount + ' 次），元素是' +
        T(SUITS[m.dominant] && SUITS[m.dominant].el, '—') + '——' + T(DOMINANT[m.dominant], '这股力量反复出现。'));
    }
    if (m.absent.length && m.minors) {
      facts.push(m.absent.map(function (k) { return T(SUITS[k] && SUITS[k].cn, '这一组'); }).join(' / ') + ' 完全没有出现——' +
        T(ABSENT[m.absent[0]], '这一组暂时没有出现。'));
    }
    if (m.majors >= 3 && m.minors > 0) {
      facts.push('大牌 ' + m.majors + ' 张，占到 ' + Math.round(m.majors / m.n * 100) +
        '%——这不是一件小事，是一段正在推进的周期。');
    }
    facts.push(revLine(m));

    /* 整体主题 / 核心矛盾：只从牌面结构推导，不写成确定结论 */
    var themeKw = T(kwOf(core), '') || T(core.cn, '') || '这件事';
    var themeLine = '这次牌面反复回到「' + themeKw + '」这个题目：' +
      '从「' + T(first.positionCn, '这个位置') + '」的《' + T(first.cn, '这张牌') + '》' + ori(first) +
      (m.n > 1 ? '，到「' + T(last.positionCn, '那个位置') + '」的《' + T(last.cn, '那张牌') + '》' + ori(last) : '') +
      '，说的是同一个处境的不同阶段。';
    var tension = [];
    if (m.revs && m.ups) {
      tension.push('一边是 ' + m.ups + ' 张正位往外推，一边是 ' + m.revs + ' 张逆位往里收：想靠近和想停一停，可能同时在场。');
    }
    if (m.dominant && m.absent.length) {
      tension.push(SUITS[m.dominant].cn + '偏重、' + m.absent.map(function (k) { return SUITS[k].cn; }).join(' / ') +
        '缺席：有力气的地方和缺少支撑的地方，也许不在同一处。');
    }
    if (m.majors && m.minors) {
      tension.push('大牌说的是阶段，小牌说的是日常，两者对同一件事的尺度并不一样。');
    }
    if (!tension.length) {
      tension.push('目前没有明显的对冲，更像是同一个侧面被几张牌重复提起。');
    }
    b1.push({ t: 'li2', k: '整体主题', v: themeLine });
    b1.push({ t: 'li2', k: '核心矛盾', v: tension.join(' ') + '这是牌面结构上的张力，不代表现实里一定发生了什么。' });
    b1.push({ t: 'ul', items: facts });
    b1.push({
      t: 'note',
      x: '以上每一条都能在这 ' + m.n + ' 张牌的真实字段里对上：花色、正逆位、牌位、翻牌顺序。下面是逐张的展开。'
    });
    chapters.push({ key: 'overview', no: 'I', title: '整体能量', en: 'OVERVIEW', blocks: b1 });

    /* ── II 单牌解析 ─────────────────────────────────────── */
    var b2 = [];
    cards.forEach(function (e, idx) {
      var c = D.byId(e.id) || {};
      var slotNo = T(e.slot, '');
      b2.push({
        t: 'h',
        x: (slotNo ? String(slotNo).padStart(2, '0') + ' · ' : '') +
          T(e.positionCn, '这个位置') + '　《' + T(e.cn, '这张牌') + '》' +
          (c.en ? ' ' + T(c.en, '') : '') + '　' + ori(e)
      });
      b2.push({
        t: 'chips',
        items: (e.reversed ? (c.kr || []) : (c.ku || [])).map(function (k) { return { x: T(k, ''), tone: 'gold' }; })
          .concat([{ x: T(e.positionCn, '这个位置'), tone: 'plain' }, { x: ori(e), tone: e.reversed ? 'rev' : 'up' }])
      });
      b2.push({ t: 'p', x: T(pick(e, c.up || '', c.rev || ''), '') });
      /* 牌位说明缺失时整句省略，不留下空引号「“”」 */
      var posDesc = T(e.positionDesc, '');
      b2.push({
        t: 'p',
        x: '放在「' + T(e.positionCn, '这个位置') + '」这个牌位上' +
          (posDesc ? '——“' + posDesc + '”' : '') + stanceOf(e)
      });
      if (e.reversed && c.rev) {
        b2.push({ t: 'p', x: '逆位时它说的是：' + T(c.rev, '') });
      }
      b2.push({
        t: 'kv',
        items: [
          { k: '爱情', v: T(c.love, '—') },
          { k: '友情 · 亲情', v: T(c.kin, '—') },
          { k: '情绪内在', v: T(c.mood, '—') },
          { k: '现实建议', v: T(c.act, '—') },
          { k: '象征物', v: T(c.sym, '—') }
        ]
      });
      if (idx < cards.length - 1) b2.push({ t: 'rule' });
    });
    chapters.push({ key: 'cards', no: 'II', title: '单牌解析', en: 'THE CARDS', blocks: b2 });

    /* ── III 牌间联系 ───────────────────────────────────── */
    var b3 = [];
    if (m.n === 1) {
      b3.push({ t: 'p', x: '单牌阵没有牌与牌之间的关系可讲。这一张就是全部——《' + T(first.cn, '这张牌') + '》' + ori(first) + '。' });
      b3.push({ t: 'p', x: T(pick(first, first.up, first.rev), '') });
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
          k: '「' + T(A.positionCn, '前一处') + '」→「' + T(B.positionCn, '后一处') + '」',
          v: '《' + T(A.cn, '这张牌') + '》' + ori(A) + ' 接 《' + T(B.cn, '那张牌') + '》' + ori(B) + '。' +
            (relNew ? rel + ' ' : '') +
            '重心落在《' + T(B.cn, '那张牌') + '》的「' + (T(kwOf(B), '') || T(FIRST(data(B).ku, '这一面'), '这一面')) + '」。' +
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
          x: '大牌落在 ' + m.majorCards.map(function (c) { return '「' + T(c.positionCn, '这个位置') + '」'; }).join('') +
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
      var who = '你连接的对象是「' + T(L.subjectName, '这位') + '」';
      if (L.workName) who += '，来自《' + T(L.workName, '') + '》';
      if (L.relation) who += '，你们的关系是「' + T(L.relation, '') + '」';
      b4.push({ t: 'p', x: who + '。' });
      if (L.background && String(L.background).trim()) {
        b4.push({ t: 'quote', x: '你自己写下的背景：「' + T(L.background, '') + '」' });
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
        return '「' + T(e.positionCn, '这个位置') + '」《' + T(e.cn, '这张牌') + '》' + ori(e) + '：' +
          (T(line, '') || T(c.act, '') || T(c.up, ''));
      })
    });

    if (m.revs) {
      var revPos = m.reversedCards.map(function (c) { return '「' + T(c.positionCn, '这个位置') + '」'; }).join('');
      var extra = '';
      if (m.suits.swords >= 1) extra = '其中宝剑在场，这些位置多半和「没说出口的话」有关。';
      else if (m.suits.cups >= 1) extra = '其中圣杯在场，卡住的地方多半在感受，不在事实。';
      b4.push({ t: 'p', x: '张力集中在 ' + revPos + ' 这几格。' + extra });
    } else {
      b4.push({ t: 'p', x: '整副牌都是正位，关系里没有明显的暗流——更可能的风险是过于平稳，谁都不去动那块真正想动的部分。' });
    }
    if (L.relation && /恋|爱|暧昧|伴侣|前任|暗恋/.test(L.relation)) {
      b4.push({ t: 'p', x: '以「' + T(L.relation, '') + '」这个前提来看，' + (m.suits.cups ? '水元素在场，说明这段关系里感受是主线。' : '水元素不在场，说明这段关系现在更多由现实或理智在维持。') });
    } else if (L.relation && /家|亲|父母|兄弟|姐妹/.test(L.relation)) {
      b4.push({ t: 'p', x: '以「' + T(L.relation, '') + '」这个前提来看，' + T((D.byId(first.id) || {}).kin, '这段关系里的距离多半在日常相处里。') });
    }
    b4.push({ t: 'note', x: '牌面不预测另一个人的行为，也不替任何人做决定。它只描述此刻的能量结构。' });
    chapters.push({ key: 'relation', no: 'IV', title: '关系脉络', en: 'THE THREAD', blocks: b4 });

    /* ── V 深层讯息 ─────────────────────────────────────── */
    var b5 = [];
    b5.push({
      t: 'p',
      x: '如果这张牌阵只允许留下一句话，那就是《' + T(core.cn, '这张牌') + '》' + ori(core) + '：' +
        T(pick(core, data(core).up || '', data(core).rev || ''), '')
    });
    if (m.reversedCards.length) {
      b5.push({ t: 'p', x: '逆位不是坏牌，是还没落地的那部分：' });
      b5.push({
        t: 'ul',
        items: m.reversedCards.slice(0, 4).map(function (e) {
          var c = D.byId(e.id) || {};
          return '《' + T(e.cn, '这张牌') + '》逆位（' + T(e.positionCn, '这个位置') + '）——' + T(c.rev, '');
        })
      });
    }
    var coreC = D.byId(core.id) || {};
    b5.push({ t: 'p', x: '现实里能被执行的那一步：' + T(coreC.act, '把眼前那一件小事先做完，再决定要不要说出口。') });
    /* 认知偏差 / 被忽略的问题：一律用可能性措辞，不写成定论 */
    var bias = [];
    if (m.dominant === 'swords') bias.push('也许你正在用「想清楚」替代「说出口」：分析越完整，越难开口。');
    else if (m.dominant === 'cups') bias.push('也许你把感受当成了事实：这边有波动，就以为那边也一样。');
    else if (m.dominant === 'wands') bias.push('也许你把「还没行动」读成了「不想行动」：节奏被当成了态度。');
    else if (m.dominant === 'pentacles') bias.push('也许你只承认看得见的进展，忽略了自己其实已经撑了一段时间。');
    else bias.push('也许你把一次沉默当成了一个结论，而牌面并没有给出这么确定的东西。');
    if (m.revs >= 2) bias.push('逆位偏多时，人容易把「推迟」解释成「拒绝」——这两件事未必相同。');
    b5.push({ t: 'li2', k: '可能的认知偏差', v: bias.join(' ') });

    var missed = [];
    if (m.absent.length) {
      missed.push('缺席的是' + m.absent.map(function (k) { return T(SUITS[k] && SUITS[k].cn, '这一组'); }).join(' / ') +
        '：' + T(ABSENT[m.absent[0]], '这一组暂时没有出现。') + '这部分也许正是你没算进去的。');
    }
    if (m.reversedCards.length) {
      missed.push('「' + T(m.reversedCards[0].positionCn, '这个位置') + '」的《' + T(m.reversedCards[0].cn, '这张牌') +
        '》逆位，问的未必是对方，而是你还没承认的那一层犹豫。');
    }
    if (!missed.length) {
      missed.push('牌面里最安静的位置是「' + T(first.positionCn, '这个位置') + '」：它常常是已经发生、却没被算进判断里的那件事。');
    }
    b5.push({ t: 'li2', k: '容易被忽略的', v: missed.join(' ') });
    b5.push({
      t: 'quote',
      x: '“当「' + FIRST(coreC.ku, '那件事') + '」真的发生时，你会先放下什么？”'
    });
    b5.push({ t: 'note', x: '这是象征性的内在提示，不是诊断，也不是预言；以上都只是可能，不是对你或对方的判定。' });
    chapters.push({ key: 'deep', no: 'V', title: '深层讯息', en: 'THE UNDERTOW', blocks: b5 });

    /* ── VI TA 想对你说 ─────────────────────────────────── */
    var b6 = [];
    var other = cards.filter(function (e) {
      return /对方|对象|TA|他者|映象|另一端/.test(e.positionCn + '');
    })[0];
    if (!other) other = m.minorCards.filter(function (e) { return e.suit === 'cups'; })[0];
    if (!other) other = last;
    var oc = D.byId(other.id) || {};
    var fc = D.byId(first.id) || {};
    var lc = D.byId(last.id) || {};

    /* 同一张牌只算一次锚点，避免单牌阵里重复列举 */
    var anchors = [];
    [other, first, last].forEach(function (e) {
      if (e && !anchors.some(function (a) { return a.id === e.id && a.positionCn === e.positionCn; })) anchors.push(e);
    });
    var anchorLabel = ['说话的底色', '事情开始的地方', '还悬着的那头', '另一个侧面'];
    var anchorTxt = anchors.map(function (e, i) {
      return '「' + T(e.positionCn, '这个位置') + '」的《' + T(e.cn, '这张牌') + '》' + ori(e) +
        '（' + T(anchorLabel[i], anchorLabel[3]) + '）';
    }).join('、');

    /* 有角色档案就贴合说话习惯；没有就不虚构身份 */
    var profileTxt = '';
    try {
      if (window.DA_ARCHIVE && DA_ARCHIVE.summary && (L.profileId || hasSubject)) {
        profileTxt = String(DA_ARCHIVE.summary(L.profileId || '') || '').replace(/\s+/g, ' ').slice(0, 80);
      }
    } catch (e) { profileTxt = ''; }

    var sceneBits = [];
    if (L.question) sceneBits.push('你问的是「' + T(L.question, '') + '」');
    if (L.relation) sceneBits.push('你们之间是「' + T(L.relation, '') + '」');
    if (L.background) sceneBits.push('你写下的「' + T(String(L.background).slice(0, 38), '') + '」');
    var scene = sceneBits.length ? '分寸按' + sceneBits.join('、') + '来拿。' : '';

    b6.push({
      t: 'p',
      x: '这一段是替' + (hasSubject ? '「' + T(L.subjectName, '那位') + '」' : '「关系里的另一端」') +
        '拟的语气，不是对方真的说过的话。它从这些牌里借意象：' + anchorTxt + '。' +
        (profileTxt ? '说话方式参照角色档案：' + profileTxt + '。' : '') + scene +
        '这一章只做拟声，不替任何人确认心意，也不预告以后会怎样。'
    });

    /* 用牌面与背景做确定性种子：换一组牌 / 换一个对象，句式就不同 */
    var seedStr = (other.id || '') + '|' + (L.subjectName || '') + '|' + (L.relation || '') + '|' + (L.question || '');
    var seed = 0;
    for (var si = 0; si < seedStr.length; si++) seed = (seed * 31 + seedStr.charCodeAt(si)) >>> 0;
    var OPEN = [
      '有句话我搁了一阵子，',
      '我不太会把这种事说圆，',
      '如果只留一句实话，',
      '你大概也察觉到了一点，',
      '先别急着替我补完，'
    ];
    var CLOSE = [
      '我没有要你现在回答什么，只是不想让它一直停在没说出口的地方。',
      '这不算承诺，也不是暗示；只是今晚，我愿意把它放在这里。',
      '你不必当真到明天，但我也没有打算把它收回去。',
      '如果这算靠近一点，那就先到这儿，剩下的不急着写完。'
    ];
    /* 索引一律走 AT()：seed 是无符号 32 位，算术右移（>>）会得到负数，
       取模后变成负索引，数组越界返回 undefined——这正是台词最后一句显示
       “undefined”的根因。改成无符号右移 + 安全取用。 */
    var open = AT(OPEN, seed, OPEN[0]);
    var close = AT(CLOSE, seed >>> 3, CLOSE[0]);
    var clean = function (s) { return T(s, '').replace(/[。！？；;]+$/g, ''); };
    /* 台词用牌的关键词与牌位说话，不直接复述牌意解释，避免像在念牌书 */
    var kw = T(kwOf(other), '') || clean(FIRST(oc.ku, '说不清'));
    var feel = other.reversed
      ? '我这边是「' + kw + '」，只是它还没翻到正面来'
      : '我这边更接近「' + kw + '」，没什么好修饰的';
    var arc = (m.n > 1)
      ? '《' + T(first.cn, '这一张') + '》落在「' + T(first.positionCn, '这个位置') + '」，《' +
        T(last.cn, '这一张') + '》落在「' + T(last.positionCn, '那个位置') + '」，中间这一段我不替它下结论'
      : '这一张《' + T(first.cn, '牌面') + '》就摆在那儿，我不替它补情节';
    var step = clean(T(oc.act, '') || T(fc.act, '') || T(lc.act, '') || '我也还在找能说出口的版本');
    var revHint = other.reversed
      ? '「' + T(other.positionCn, '这一格') + '」这一格尤其往里收，话到嘴边会慢半拍。'
      : '';
    var relHint = L.relation ? '你说我们是「' + T(L.relation, '这种关系') + '」，我不急着替它换名字。' : '';

    b6.push({
      t: 'quote6',
      x: '“' + open + feel + '。”<br>' +
        '“关于我们，' + arc + '。' + relHint + revHint + '”<br>' +
        '“要说一句能落地的——' + step + '。”<br>' +
        '“' + close + '”'
    });
    b6.push({
      t: 'note',
      x: '这是从牌意、牌位与正逆位出发写的一段拟声，用来听见另一种可能；' +
        '它不代表对方的真实想法，也不构成任何关于未来的判断。'
    });
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
    lines.push('解读结果 · ' + T(session.spreadCn, '这次牌阵') + ' · ' + (session.deckMode === 22 ? '大阿尔卡那' : '完整 78 张'));
    if (L.subjectName) {
      lines.push('连接对象：' + T(L.subjectName, '未命名对象') + (L.relation ? '（' + T(L.relation, '') + '）' : ''));
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
