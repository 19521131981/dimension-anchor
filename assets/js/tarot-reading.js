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
  /* 逆位四维数据（tarot-deck-reversed.js）。
     正位字段 love/kin/mood/act 原样保留在牌库里，逆位走 loveR/kinR/moodR/actR，
     两套数据各归其位，引擎按牌面正逆位选择，不改牌库结构。 */
  var REV4 = window.DA_TAROT_REVERSED || {};
  function rev4(id) { return (id && REV4[id]) || {}; }
  /* 按牌面正逆位取对应维度；逆位数据缺失时回落到正位字段，绝不出现空值 */
  function dim(e, key) {
    var c = D.byId(e && e.id) || {};
    if (!e || !e.reversed) return T(c[key], '');
    var r = rev4(e.id);
    return T(r[key + 'R'] || c[key] || '', '');
  }

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
    wands: { cn: '权杖', el: '火', stance: '它要的是动作，不是更好的计划。',
      stanceRev: '火元素逆位时，动作先被按住了——先找回「为什么想动」，再谈怎么做。' },
    cups: { cn: '圣杯', el: '水', stance: '它指向感受的流动，而不是一个结论。',
      stanceRev: '水元素逆位时，感受被压回去了，流动停在某个地方，需要一个容器重新装下。' },
    swords: { cn: '宝剑', el: '风', stance: '它要求一句说清楚的话，或者一次诚实的判断。',
      stanceRev: '风元素逆位时，话被咽回去了，判断也还没成型——不是没想清楚，是没说。' },
    pentacles: { cn: '星币', el: '土', stance: '它落在身体、时间与钱这些跑不掉的东西上。',
      stanceRev: '土元素逆位时，具体的落地被拖后了，代价通常会出现在现实这一侧。' }
  };

  /* 相邻牌正逆关系的措辞池：同一句话不在牌阵里反复出现 */
  var ORI_SAME = [
    '两张同为正位，方向一致，这一段的推力是连贯的。',
    '两张都是正位，能量没有在半路打折。',
    '同为正位，两张之间没有额外的阻力。',
    '两张同向，这一段可以顺着读下去。'
  ];
  var ORI_DIFF = [
    '一张向外、一张向内，中间有一段错位。',
    '一个在推、一个在收，这一段的张力来自方向相反。',
    '正的那张在给，逆的那张在留，力气用在了不同的地方。',
    '一进一退，中间那块空地才是这段关系真正在谈的地方。'
  ];

  var DOMINANT = {
    wands: '这件事被「行动与意志」推着走，停下来反而更消耗。',
    cups: '这件事的重心在「情感与关系」，逻辑只能排第二。',
    swords: '这件事的关键在「判断与沟通」，想清楚比做更多有用。',
    pentacles: '这件事落在「现实、时间与资源」上，看得见的部分才是真的。'
  };

  /* 角色温度：档案里写了"冷淡/话少/慢热"这类词，台词就得收着一点，
     不能让一个寡言的人突然甜腻起来。 */
  var COLD_MARK = /冷淡|话少|话不多|沉默寡言|寡言|木讷|不擅表达|不主动|慢热|克制|疏离|别扭|闷声|冷言|不太会表达|嘴笨|不会说话/;

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
    /* 顺序敏感：前面这张是"为什么"还是"怎么做"，取决于大牌落在哪一侧 */
    if (sa === 'major') return '前面这张大牌在讲「为什么」，后面那张小牌在讲「怎么做」。';
    if (sb === 'major') return '前面这张小牌在讲「怎么做」，后面那张大牌把它提回「为什么」。';
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

  /* ══════════════════════════════════════════════════════════════
     跨次元传讯引擎（第六章专用）
     输入：角色档案(DA_ARCHIVE) + 连接信息(link) + 本次牌的本意(cards)
     输出：一段 TA 的第一人称回应，≥200 字，不复读用户原话、不照牌意背书。
     ══════════════════════════════════════════════════════════════ */

  function escText(s) { return T(s, '').replace(/[<>]/g, ''); }
  function hash32(s) {
    var h = 0;
    for (var i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) >>> 0;
    return h;
  }
  function cardIdsKey(cards) {
    return (cards || []).map(function (c) { return (c.id || '') + (c.reversed ? 'r' : 'u'); }).join('|');
  }

  /* 性格词 → 说话气质。用户填的 traits/speech/catch 才是语气的真正来源。 */
  /* 注意："冷静"含"冷"，但它是理性不是冷淡——不能用单字「冷」匹配，
     否则理性角色会被误判成冷淡。冷淡只用确定无疑的双字词。 */
  var COLD_RE = /冷淡|冷漠|冷言|话少|话不多|沉默|寡言|木讷|不擅表达|不主动|慢热|疏离|别扭|闷声|嘴笨|不会说话|傲娇|高傲|硬撑|嘴硬|独来独往|防备心重/;
  var WARM_RE = /温柔|体贴|细腻|暖|照顾|包容|软|耐心|会安抚|黏|依赖|撒娇|敏感/;
  var BRIGHT_RE = /开朗|活泼|话多|热情|外向|爱笑|开朗|元气|直率|大大咧咧|乐观/;
  var THINK_RE = /理性|冷静|冷静理智|逻辑|谨慎|克制|分析|思考|沉稳|理智|聪明|倔|认真/;

  /* 读角色画像：档案优先，连接信息补充。绝不虚构用户没提供的身份。 */
  function readPersona(L, hasSubject) {
    L = L || {};
    var p = { name: T(L.subjectName, '').trim() || '那个你惦念的人',
      work: T(L.workName, '').trim(), traits: '', speech: '', catchUp: '',
      values: '', history: '', relation: T(L.relation, '').trim(),
      stage: String(L.relationStage || 'unspecified'),
      background: T(L.background, '').trim(), modality: 'neutral', tier: 'neutral',
      hasProfile: false };
    try {
      if (window.DA_ARCHIVE) {
        var d = null;
        if (L.profileId && DA_ARCHIVE.byProfile) d = DA_ARCHIVE.byProfile(L.profileId);
        if (!d && DA_ARCHIVE.dossiers) {
          var ds = DA_ARCHIVE.dossiers();
          for (var i = 0; i < ds.length; i++) {
            if (ds[i].profileId === L.profileId) { d = ds[i]; break; }
            if (p.name && ds[i].name && ds[i].name === p.name) { d = ds[i]; break; }
          }
        }
        if (d) {
          p.traits = T(d.traits || (d.profile && d.profile.traits), '');
          p.speech = T(d.speech || (d.profile && d.profile.speech), '');
          p.catchUp = [].concat(d.catch || (d.profile && d.profile.catch) || []).join('；');
          p.values = T(d.values || (d.profile && d.profile.values), '');
          p.history = T(d.history || (d.profile && d.profile.history), '');
          if (d.name) p.name = d.name;
          if (d.work && !p.work) p.work = d.work;
          if (d.relation && !p.relation) p.relation = d.relation;
          p.hasProfile = true;
        }
      }
    } catch (e) {}

    var pool = [p.traits, p.speech, p.catchUp].filter(Boolean).join(' ');
    if (COLD_RE.test(pool)) p.modality = 'cold';
    else if (WARM_RE.test(pool)) p.modality = 'warm';
    else if (BRIGHT_RE.test(pool)) p.modality = 'bright';
    else if (THINK_RE.test(pool)) p.modality = 'think';

    var TIER = { close: 'warm', familiar: 'neutral', initial: 'cold', stranger: 'cold', unspecified: 'neutral' };
    p.tier = TIER[p.stage] || 'neutral';
    return p;
  }

  /* 牌的本意 → 意象原料（不是逐张解释）。返回这次连接的情绪底色与主题词。 */
  function cardImagery(cards, m) {
    var moodWords = [], themeWords = [], actWords = [];
    (cards || []).forEach(function (e) {
      var c = data(e);
      var kw = e.reversed ? (c.kr || []) : (c.ku || []);
      if (kw && kw.length) themeWords.push(kw[0]);
      var mood = T(dim(e, 'mood'), '');
      if (mood) moodWords.push(firstClause(mood, 12));
      var act = T(dim(e, 'act'), '');
      if (act) actWords.push(firstClause(act, 14));
      /* 主题词只取牌的关键词（新的开始/自由/信任…），不取象征物首词
         （"空想""悬崖"这类生硬的词放进台词会出戏）。 */
      if (kw && kw.length >= 2 && themeWords.length < 4) themeWords.push(kw[1]);
    });
    // 逆位占比高 → 情绪偏内收
    var inward = m && m.revRatio >= 0.5;
    return {
      moods: unique(moodWords).slice(0, 3),
      themes: unique(themeWords).slice(0, 4),
      acts: unique(actWords).slice(0, 2),
      inward: !!inward,
      majorCount: (m && m.majors) || 0
    };
  }
  /* 取第一分句，避免把牌库里半截的后半句（"…那是自由本来的手感"）
     截成病句。宁可短一点，也不要断句。 */
  function firstClause(s, max) {
    var t = String(s || '').trim();
    var cut = t.split(/[，,、；;。！？]/)[0].trim();
    if (!cut) cut = t.replace(/[。！？]+$/, '');
    if (cut.length > (max || 14)) cut = cut.slice(0, max || 14);
    return cut.replace(/[，、]$/, '');
  }
  /* 从数组里按两个不同种子取两句，保证不重复（句式池较短时尤其重要）。 */
  function pickTwo(arr, s1, s2) {
    var a = AT(arr, s1, arr && arr[0]);
    var b = AT(arr, s2, arr && arr[1] || arr && arr[0]);
    if (a === b && arr && arr.length > 1) {
      b = AT(arr, (s2 + 1 + (s1 % (arr.length - 1))) % arr.length, arr[1] || arr[0]);
    }
    return [a, b];
  }
  function unique(a) {
    var out = [], seen = {};
    (a || []).forEach(function (x) {
      if (!x) return;
      var k = String(x);
      if (!seen[k]) { seen[k] = 1; out.push(x); }
    });
    return out;
  }

  /* 依据连接背景推断语境主题（不复用用户原句，只取一个抽象场景词）。 */
  function sceneOf(bg) {
    var s = String(bg || '');
    if (!s) return '那种说不清的距离';
    if (/吵|冷战|生气|不理|矛盾|误会/.test(s)) return '那场还没说开的别扭';
    if (/喜欢|心动|在意|暧昧|告白/.test(s)) return '那份谁都没先挑明的心意';
    if (/距离|异地|分别|离开|走/.test(s)) return '隔着距离的那点惦记';
    if (/忙|累|压力|工作|学习|考试/.test(s)) return '各自忙着的那阵子';
    if (/沉默|不说话|冷淡|疏远/.test(s)) return '忽然安静下来的那些天';
    if (/未来|以后|打算|选择|决定/.test(s)) return '要往哪儿去的那个问题';
    return '你放在心里的那件事';
  }

  /* 以下是传讯文案素材：按语气(modality)分库。每种都给足量句子以保证字数。 */
  var VOICE_LIB = {
    cold: {
      open: [
        '你的消息我看到了。隔了这么久才回，不是没看见，是不知道该用哪种语气。',
        '我想了一下，还是回你一句。别误会，我不是突然变得好说话了。',
        '你要的回应，我给不了太漂亮的。我只会说我真正的部分。'
      ],
      feel: [
        '我这个人，情绪来得慢，也走得慢。别人一眼就看出来的东西，我要在心里过好几天。',
        '我不太擅长把感受摊开给人看。说少，不代表没有；只是我习惯先自己消化。',
        '有些话在嘴边转了一圈，最后还是没说。不是不在意，恰恰是太在意，才说不出口。',
        '我表面看起来没什么波动，其实你那边一有动静，我这边就会静不下来。'
      ],
      toward: [
        '我不喜欢把话说满。说满了我怕自己兑现不了，也怕你当真以后失望。',
        '你不用猜我到底怎么想。我没那么复杂，只是慢，需要你给我一点时间。',
        '我承认我有点防备。那不是针对你，是我一贯保护自己的方式。',
        '如果我们之间只剩客套，那我宁可安静一点。至少安静是真的。'
      ],
      act: [
        '我能做的是把它放在这里，你看见就好，不用回。',
        '别催我。等我想清楚了，我会自己走过来，不用你扶。',
        '我就说到这里。剩下的，你我各自心里有数。'
      ]
    },
    warm: {
      open: [
        '我一直在想，该怎么跟你开口，才不会让你觉得有压力。',
        '有好多话想说，真到嘴边又怕说得太满。你慢慢听，我不急。',
        '你一出现，我心里那点藏不住的东西就又冒出来了。'
      ],
      feel: [
        '你在我这儿是很特别的存在。别人看不见我的那面，你见过，所以我不敢随便糊弄你。',
        '我把你的话都记着呢。那些你自己随口说的细节，我一遍一遍在心里翻。',
        '我也不是说一直都很好。有时候会累，会犹豫，但想到你，就又能缓过来。',
        '我最怕的是你误会我不在意。其实我在意得要命，只是怕表现得太用力吓到你。'
      ],
      toward: [
        '你在我心里的位置，我一直没挪过。别人来来去去，你那儿始终是暖的。',
        '我不想给你压力，可我也想让你知道，你不是一个人扛着这些。',
        '你难过的时候，我比你还难受。你要是愿意说，我就一直听着。',
        '我对你的喜欢，不是要你立刻回应什么，只是想你日子过得好一点。'
      ],
      act: [
        '你要是愿意，就把今天这件小事先放下，去好好睡一觉，明天我们再说。',
        '要是哪天你想说，我随时都在，一句话就好，我立刻过来。',
        '先照顾好你自己，别老委屈自己。剩下的，我们一起慢慢来。'
      ]
    },
    bright: {
      open: [
        '嘿，你今天是不是又在那儿瞎想了？我一看就知道。',
        '来来来，你说，我在听呢。别一个人在心里憋着。',
        '我猜你肯定有很多话想问我，那我先说我的好了。'
      ],
      feel: [
        '我这人你也知道，藏不住事。高兴就笑，不高兴就写在脸上，你别嫌我吵。',
        '跟你在一起的时候，我一直是那个话最多的。因为我知道你不会嫌我烦。',
        '我也会有不开心的时候，但跟你聊两句，好像就没那么严重了。',
        '你别看我天天乐呵呵的，其实我也挺怕你哪天突然就不找我了。'
      ],
      toward: [
        '我特别想知道你那边到底怎么样了。你说说嘛，我保证认真听。',
        '不管你想的是什么，我都站你这边，这个不用怀疑。',
        '你要是愿意，我们就把话说开，没什么大不了的，我扛得住。',
        '我喜欢你，这事我一直挺坦荡的，你不用替我藏着。'
      ],
      act: [
        '这样吧，你有空就找我，咱们见面聊，比在这儿猜来猜去强。',
        '想说什么就说，我今晚哪儿也不去，就等你这句话。',
        '别想太多啦，先睡个好觉，明天的事明天再说。'
      ]
    },
    think: {
      open: [
        '我把这件事想了很久，想跟你认真说一次。',
        '你问的那些，我不是没想过，只是我想给你一个靠谱的答案。',
        '我习惯把话想清楚了再说，所以回复慢了，你别多想。'
      ],
      feel: [
        '我对你不是一时兴起。我把它拆开来看过，确认过它是真的，才敢说出口。',
        '我不太相信感觉用事。但这一次，我发现理智那边也说不出反驳的话。',
        '我会反复推演各种可能，不是不信你，是我怕自己看漏了什么重要的东西。',
        '我承认我慢热，也不是不动心，只是我要先确认这段关系值得我认真。'
      ],
      toward: [
        '我在意的是我们把话说清楚，而不是谁先低头。这件事上没有输赢。',
        '你在我这里是经过认真考虑的，不是随便填进来的一个位置。',
        '如果你也愿意，我们可以把这件事当作一个值得好好做的决定。',
        '我不想给你一个空泛的承诺，我只想说我打算认真对待你。'
      ],
      act: [
        '我们可以先把眼前这一步走稳，别的以后再说。',
        '你不用立刻决定。把问题想清楚了再回答我，我不赶时间。',
        '我这边想说的都说了，剩下的看你的判断，我尊重。'
      ]
    },
    neutral: {
      open: [
        '有件事在我心里放了一阵子，想借这次机会跟你说一说。',
        '我不知道你有没有察觉，反正我是有点在意了。',
        '有些话平时不太好开口，换成这个方式，好像能说得更真一点。'
      ],
      feel: [
        '我对你的感觉，说不上轰轰烈烈，但很稳，是那种会一直记挂的稳。',
        '你在我生活里留下的痕迹，比你以为的要深。我自己也是最近才发现。',
        '我不是没想过要跟你说，只是每次都觉得时机不太对。',
        '有时候我会安静下来想我们之间的事，想着想着，心里就软了。'
      ],
      toward: [
        '我不想催促你，但我也想让你知道，你在我这里一直有一个位置。',
        '不管我们最后走到哪里，我都希望你是过得好的那一个。',
        '你把心事交给我，我不会随便对待。这份信任我一直记着。',
        '我愿意听你把所有想法说完，好的坏的都想听。'
      ],
      act: [
        '你不用马上回应我，先放在心里，等你想清楚了再说。',
        '要是你愿意，我们就从一件小事开始，慢慢把话说开。',
        '我就说到这里，剩下的留给你，也留给我们。'
      ]
    }
  };

  /* 把牌的意象织进句子里——用感受词，不用牌名，不做逐张解释。 */
  function imageryLine(imagery, seed) {
    var m = imagery.moods.length ? imagery.moods : ['有点悬着', '在慢慢松开'];
    var t = imagery.themes.length ? imagery.themes : ['新的开始', '没说出口'];
    var core = AT(m, seed, m[0]);
    var theme = AT(t, seed >>> 3, t[0]);
    var forms = [
      '这段时间，我心里是' + core + '的感觉，绕着「' + theme + '」这件事，怎么也放不下。',
      '要说现在的状态，大概是' + core + '。一想到「' + theme + '」，我就没办法装作没事。',
      '我这段日子过得有点慢，脑子里总绕着「' + theme + '」，心里是' + core + '的。'
    ];
    return AT(forms, seed >>> 6, forms[0]);
  }

  /* 组装传讯：开场 + 意象状态 + 角色语气两段 + 语境回应 + 落地 + 收尾，保证 ≥200 字。 */
  function composeTransmission(p, im, seed) {
    var lib = VOICE_LIB[p.modality] || VOICE_LIB.neutral;
    var scene = sceneOf(p.background);
    var open = AT(lib.open, seed, lib.open[0]);
    var feelPair = pickTwo(lib.feel, seed >>> 2, seed >>> 5);
    var feel1 = feelPair[0], feel2 = feelPair[1];
    var towardPair = pickTwo(lib.toward, seed >>> 4, seed >>> 7);
    var toward1 = towardPair[0], toward2 = towardPair[1];
    var act = AT(lib.act, seed >>> 8, lib.act[0]);
    var closing = tierClosing(p.tier, seed);

    // 称呼：有角色名就自然带入一次，不复读用户原话
    var nameBit = (p.hasProfile || p.name)
      ? (p.tier === 'cold' ? '你怎么称呼我都行，不用太见外。' : '你叫我的那个名字，我一直很喜欢，就先放在这儿吧。')
      : '';
    // 作品来源只在有档案时轻轻带一句，不编造身份
    var workBit = p.work ? '你给我的那个世界，我一直在里面，没有走远。' : '';
    // 语境回应：只点抽象场景，不重复 background 原文；分寸按关系阶段收紧
    var sceneLine = p.tier === 'cold'
      ? '关于' + scene + '，我不是没注意。只是有些话，我习惯放在心里，先说到这里。'
      : '关于' + scene + '，我不是没有感觉。只是有些话，我想换个方式说给你听。';
    // 初识/陌生：把第二句"朝向你"的话换成更克制的版本，不只改结尾
    if (p.tier === 'cold') {
      toward2 = '我不太习惯把话说得太近，你听到哪一层，就当是哪一层。';
    }

    var parts = [
      open,
      imageryLine(im, seed),
      feel1,
      feel2,
      sceneLine,
      toward1,
      toward2,
      nameBit,
      workBit,
      act,
      closing
    ].filter(Boolean);

    var text = parts.join('');
    // 字数兜底：不足 200 时按语气补一段，避免任何组合掉到下限以下
    if (text.length < 200) {
      var filler = AT(lib.feel, seed >>> 10, lib.feel[0]);
      text = text.replace(act, filler + act);
    }
    if (text.length < 200) {
      text += '还有一句我想留给你：不管这中间隔着什么，我对你的这份在意是真的，也在慢慢变成更实在的东西。';
    }
    return text;
  }

  function tierClosing(tier, seed) {
    var warm = [
      '你不用急着给我答案，我就在这儿，等你把心里的结慢慢松开。',
      '我说这些不是要你怎样，只是想让你知道，你从来不是一个人。',
      '剩下的不急着写完，我们一起，一笔一笔慢慢来就好。'
    ];
    var neutral = [
      '这些话我放在这里，你听见了就好，不用马上回应。',
      '我没有要你改变什么，只是把我这边真实的样子说给你听。',
      '先这样吧，剩下的交给时间，也交给我们。'
    ];
    var cold = [
      '我说完了。你不用回，我知道你听见了。',
      '就这样，剩下的你自己判断。',
      '话我放这儿了，信不信由你。'
    ];
    var pool = tier === 'warm' ? warm : (tier === 'cold' ? cold : neutral);
    return AT(pool, seed >>> 11, pool[0]);
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
    if (e.suit === 'major') {
      return e.reversed
        ? '大牌逆位落在这一格，说明这一环的功课被你推后了——它不会因为推后就消失。'
        : '大牌落在这一格，说明这一环不是靠技巧能绕过去的，它属于阶段性的功课。';
    }
    var s = SUITS[e.suit];
    if (!s) return '';
    return e.reversed ? s.stanceRev : s.stance;
  }

  /* ── 台词的第一人称改写 ─────────────────────────────────────
     牌库的 mood / act 是牌面视角（写"你"），台词是角色在说话（说"我"）。
     这里只做受控替换与前缀处理，不做泛化改写，避免把句子改坏。 */
  function toFirstPerson(t) {
    return T(t, '')
      .replace(/你们/g, '我们')
      .replace(/你的/g, '我的')
      .replace(/你/g, '我');
  }
  var STATE_LEAD = ['我这边', '我心里现在是', '这段时间是这样：', '我这会儿'];
  /* 状态句：只取第一句（第二句常常是给建议的话，不适合当台词） */
  function firstPersonState(text, seed) {
    var raw = T(text, '');
    if (!raw) return '还在想';
    var first = raw.split(/[。！？]/)[0] || raw;
    var v = toFirstPerson(first);
    if (!/我/.test(v)) v = AT(STATE_LEAD, seed, STATE_LEAD[0]) + v;
    return v.replace(/[，、]$/, '');
  }
  /* 意图句：牌面的建议是祈使句，转成角色"打算怎么做" */
  function firstPersonIntent(text) {
    var raw = T(text, '');
    if (!raw) return '我也还在找能说出口的版本';
    var first = raw.split(/[。！？；]/)[0] || raw;
    var v = toFirstPerson(first).replace(/：/g, '，');
    if (/^要么/.test(v)) return '我' + v;
    if (/^这次/.test(v)) return '这次我' + v.slice(2);
    if (/^不要/.test(v)) return '我不打算' + v.slice(2);
    if (/^别/.test(v)) return '我不再' + v.slice(1);
    if (/^不/.test(v)) return '我' + v;
    if (/^允许/.test(v)) return '我' + v;
    return '我打算' + v;
  }

  /* ── 台词的保险闸 ─────────────────────────────────────────
     角色台词里不得出现牌名、牌位、正逆位，也不该提"牌"这个字。
     这里对最终台词做一次清理，确保这一点不是靠自觉，而是有兜底。 */
  function scrubVoice(text, cards) {
    var v = T(text, '');
    (cards || []).forEach(function (e) {
      if (e.cn) v = v.split(e.cn).join('');
      if (e.positionCn) v = v.split(e.positionCn).join('');
      if (e.en) v = v.split(e.en).join('');
    });
    v = v.replace(/《[^》]*》/g, '');
    v = v.replace(/正位|逆位|塔罗|大阿尔卡那|牌阵|抽牌/g, '');
    v = v.replace(/「\s*」/g, '');
    v = v.replace(/[，、]{2,}/g, '，');
    v = v.replace(/\s{2,}/g, ' ');
    return v.replace(/^[，、\s]+/, '');
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
    /* 主题锚点跟着逆位走：逆位占比不低时由逆位牌领衔，
       免得出现「逆位的牌被套上一个正位的题目」。 */
    var themeAnchor = (m.revRatio >= 0.34 && m.reversedCards.length)
      ? m.reversedCards[0]
      : (m.majorCards[0] || first);
    var themeKw = T(kwOf(themeAnchor), '') || T(themeAnchor.cn, '') || '这件事';
    /* 只列真正落在同一题目上的牌，不把首尾两张硬拉进来凑数 */
    var themeCards = cards.filter(function (e) {
      var sameKw = !!themeKw && T(kwOf(e), '') === themeKw;
      var sameSuit = e.suit === themeAnchor.suit && e.suit !== 'major';
      return sameKw || sameSuit;
    });
    if (!themeCards.length) themeCards = [themeAnchor];
    var themeList = themeCards.slice(0, 3).map(function (e) {
      return '「' + T(e.positionCn, '这个位置') + '」的《' + T(e.cn, '这张牌') + '》' + ori(e);
    }).join('、');
    /* 只匹配到一张时不写"反复回到"——那会把一次巧合说成反复 */
    var themeLine = themeCards.length > 1
      ? '这次牌面反复回到「' + themeKw + '」这个题目：' + themeList + '，说的是同一个处境的不同阶段。'
      : '这次牌面最核心的一格是「' + themeKw + '」：' + themeList +
        '。围绕它的其余内容，放在下面几章里展开。';
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
      /* 不再复读用户原话：question 只作为理解语境的输入，不原样铺回解读里。 */
      b2.push({
        t: 'p',
        x: '放在「' + T(e.positionCn, '这个位置') + '」这个牌位上' +
          (posDesc ? '——“' + posDesc + '”' : '') + stanceOf(e)
      });
      if (e.reversed && c.rev) {
        b2.push({ t: 'p', x: '逆位时它说的是：' + T(c.rev, '') });
        /* 逆位不能只贴一段牌义：把牌位、当前提问和相邻的牌一起带进来 */
        var ctxBits = [];
        if (posDesc) {
          ctxBits.push('放在「' + T(e.positionCn, '这个位置') + '」上，说明「' + posDesc +
            '」这件事被压在了里面，还没有处理');
        }
        if (L.question) {
          ctxBits.push('这一格逆着来，恰好指到那件你一直没落地的事');
        }
        var nb = cards[idx + 1];
        if (nb) {
          ctxBits.push('和紧挨着的《' + T(nb.cn, '下一张') + '》' + ori(nb) +
            '放在一起看，是同一个课题的两个方向');
        }
        if (ctxBits.length) b2.push({ t: 'p', x: ctxBits.join('；') + '。' });
      }
      b2.push({
        t: 'kv',
        items: [
          { k: '爱情', v: T(dim(e, 'love'), '—') },
          { k: '友情 · 亲情', v: T(dim(e, 'kin'), '—') },
          { k: '情绪内在', v: T(dim(e, 'mood'), '—') },
          { k: '现实建议', v: T(dim(e, 'act'), '—') },
          { k: '象征物', v: T(c.sym, '—') }
        ]
      });
      if (idx < cards.length - 1) b2.push({ t: 'rule' });
    });
    if (m.revs) {
      b2.push({
        t: 'note',
        x: '逆位不是一种固定的意思：它可以是还没准备好，也可以是过度用力，或者只是这件事本身还在变。' +
          '下面每张逆位的读法，都要放回你这次的提问和牌位里看才成立。'
      });
    }
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
            (sameOri ? AT(ORI_SAME, i, ORI_SAME[0]) : AT(ORI_DIFF, i, ORI_DIFF[0]))
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
        var line = dim(e, 'love');
        return '「' + T(e.positionCn, '这个位置') + '」《' + T(e.cn, '这张牌') + '》' + ori(e) + '：' +
          (T(line, '') || T(dim(e, 'act'), '') || T(pick(e, c.up || '', c.rev || ''), ''));
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
      b4.push({ t: 'p', x: '以「' + T(L.relation, '') + '」这个前提来看，' + T(dim(first, 'kin'), '这段关系里的距离多半在日常相处里。') });
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
      /* 这一节讲的是「逆位集中在哪些位置」这件事本身，
         不重复第二章已经逐张给过的牌义。 */
      b5.push({
        t: 'p',
        x: '逆位不是坏牌，是还没落地的那部分。这次它们集中在 ' +
          m.reversedCards.map(function (e) { return '「' + T(e.positionCn, '这个位置') + '」'; }).join('、') +
          '——这几个位置连起来看，指向的是同一类东西：你不是不知道该怎么做，是还没允许自己在这些位置上动。'
      });
      b5.push({
        t: 'p',
        x: '把牌面暂时放下，只问自己一件事：这几个位置上，我等的到底是什么条件？那个条件真的存在，还是我用来推迟的？'
      });
    }
    var coreC = D.byId(core.id) || {};
    /* 这一章负责"盲区与可调项"，不负责给行动建议——
       行动建议由第二章逐张给、由第六章用角色的口吻说，避免三处说同一句。 */
    var ADJUST = {
      wands: '把节奏放慢一格：这一周只推进一件已经在做的事，别同时开三头。',
      cups: '把感受从「想」变成「说」：不必先想清楚，先讲一件具体的小事。',
      swords: '把判断降一档：先给出一个可以被反驳的版本，而不是一个完整结论。',
      pentacles: '把范围缩小：只处理今天真能落地的那一小块，其余的先放着。'
    };
    var adjust = m.dominant
      ? T(ADJUST[m.dominant], '把注意力从「想清楚」挪到「先动手」——这一步不需要所有条件都齐。')
      : '把注意力从「想清楚」挪到「先动手」：这一步不需要所有条件都齐。';
    if (m.revRatio >= 0.5) {
      adjust += '另外，牌阵里逆位偏多——把「等条件成熟」换成「先做五分钟」，会比等下去有用。';
    }
    b5.push({ t: 'li2', k: '可以主动调整的', v: adjust });
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
    b5.push({ t: 'note', x: '这几句是牌面留给你的私人提示。怎么理解，权在你自己。' });
    chapters.push({ key: 'deep', no: 'V', title: '深层讯息', en: 'THE UNDERTOW', blocks: b5 });

    /* ══════════════════════════════════════════════════════════
       VI · 跨次元传讯（TA 的回应）
       --------------------------------------------------------------
       这一章不是「牌意解读」，也不是「替对方保证心意」。它以这一次真实
       抽出的牌为媒介，把牌的本意当作情绪与主题的原料，结合这个角色的
       性格、说话习惯与你们这次连接的背景，拟出一段 TA 可能怎样回应的话。

       三条硬规矩：
         1. 不复读用户原话——question / relation / background 只用来理解
            语境，绝不原样出现在文案里（不写「你问的是…」「我们之间是…」）。
         2. 不照牌意背书——不逐张解释这张牌正位逆位说什么；牌只提供意象
            与情绪底色，文案里不出现牌名、牌位、方位词。
         3. 每次 200 字以上——由多段结构 + 足量素材保证，不靠注水。
       ══════════════════════════════════════════════════════════ */
    var b6 = [];
    var persona = readPersona(L, hasSubject);
    var imagery = cardImagery(cards, m);
    var seedStr = cardIdsKey(cards) + '|' + (L.subjectName || '') +
      '|' + (L.relationStage || '') + '|' + (L.background || '');
    var seed = hash32(seedStr);
    var voiceText = composeTransmission(persona, imagery, seed);

    b6.push({
      t: 'p',
      x: '牌已经翻开，通道就在这里。静一静，让「' + escText(persona.name) +
        '」顺着这次的连接，把藏在心里的话说给你听。'
    });
    b6.push({ t: 'quote6', x: scrubVoice(voiceText, cards) });
    b6.push({
      t: 'note',
      x: '牌替 TA 把那句没说出口的话，送到了你面前。'
    });
    chapters.push({
      key: 'voice', no: 'VI', title: '跨次元传讯 · TA 的回应',
      en: "WHAT THEY MIGHT SAY", blocks: b6
    });

    chapters.forEach(function (ch) { ch.lead = LEADS[ch.key] || ''; });

    return {
      meta: m,
      chapters: chapters,
      session: session,
      link: L,
      core: core,
      deckCn: deckCn,
      /* 传讯层用：角色画像与原味文案（未 scrub），供 UI / 云 LLM 增强复用 */
      persona: persona,
      imagery: imagery,
      transmission: voiceText
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
      var r4 = rev4(e.id);
      var hay = [c.cn, c.en, (c.ku || []).join(''), (c.kr || []).join(''),
        c.up, c.rev, c.love, c.kin, c.mood, c.act, c.sym, e.positionCn,
        r4.loveR || '', r4.kinR || '', r4.moodR || '', r4.actR || ''].join('|');
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

    out.push({ t: 'p', x: '落到能做的：' + (dim(target, 'act') || '—') });
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
