/* DIMENSION ANCHOR TAROT — 抽牌引擎
   真实随机：crypto.getRandomValues + Fisher-Yates。
   动画与音效只是表现层，所有顺序变化都发生在这里的真实数组上。 */

window.DA_ENGINE = (function () {

  var D = window.DA_TAROT;

  /* ---------- 随机源 ---------- */
  function randInt(max) {
    if (max <= 0) return 0;
    if (window.crypto && window.crypto.getRandomValues) {
      var buf = new Uint32Array(1);
      // 拒绝采样，避免取模偏差
      var limit = Math.floor(4294967296 / max) * max;
      var v;
      do { window.crypto.getRandomValues(buf); v = buf[0]; } while (v >= limit);
      return v % max;
    }
    return Math.floor(Math.random() * max);
  }

  function coin() { return randInt(2) === 1; }

  /* ---------- 牌堆 ---------- */
  /**
   * @param {number} mode 22 或 78
   * @returns {Array} 新的牌对象数组（浅拷贝，不影响原始数据）
   */
  function buildDeck(mode) {
    var src = Number(mode) === 22 ? D.major : D.all;
    return src.map(function (c) { return c; });
  }

  /* ---------- 洗牌：Fisher-Yates，真实改变数组顺序 ---------- */
  function shuffle(deck) {
    for (var i = deck.length - 1; i > 0; i--) {
      var j = randInt(i + 1);
      var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    return deck;
  }

  /* ---------- 切牌：在随机位置分成两叠再叠回去，真实改变顺序 ---------- */
  function cut(deck) {
    if (deck.length < 4) return { deck: deck, at: 0 };
    var lo = Math.floor(deck.length * 0.28);
    var hi = Math.floor(deck.length * 0.72);
    var at = lo + randInt(Math.max(1, hi - lo));
    var top = deck.slice(0, at);
    var bottom = deck.slice(at);
    var next = bottom.concat(top);
    return { deck: next, at: at };
  }

  /* ---------- 正逆位 ---------- */
  function orientation() { return coin() ? 'rev' : 'up'; }

  /**
   * 从牌堆顶部依次取 n 张，带正逆位。
   * 因为牌堆已被真实打乱，直接顺序取即等价于随机不重复抽取。
   */
  function take(deck, n, offset) {
    var out = [];
    var start = offset || 0;
    for (var i = 0; i < n; i++) {
      var card = deck[start + i];
      if (!card) break;
      out.push({ card: card, reversed: orientation() === 'rev' });
    }
    return out;
  }

  /* ---------- 一次完整梦占的会话对象 ----------
     牌位先建好，牌面在用户点击时才落到对应的空位上，
     这样"用户选哪张就是哪张"，动画与数据完全一致。 */
  function createSession(opt) {
    var mode = Number(opt.deckMode) === 22 ? 22 : 78;
    var spread = opt.spread;

    var cards = spread.slots.map(function (slot) {
      return {
        order: slot.n,
        slot: slot.n,
        positionCn: slot.cn,
        positionEn: slot.en,
        positionDesc: slot.d,
        id: null,
        cn: '',
        en: '',
        suit: '',
        roman: '',
        reversed: false,
        placed: false,
        revealed: false,
        revealOrder: 0,
        revealedAt: null
      };
    });

    return {
      id: 'rd' + Date.now().toString(36),
      createdAt: Date.now(),
      deckMode: mode,
      spreadKey: spread.key,
      spreadCn: spread.cn,
      spreadEn: spread.en,
      cut: !!opt.doCut,
      cutAt: opt.cutAt != null ? opt.cutAt : null,
      cards: cards,
      reveals: 0,
      done: false
    };
  }

  /* 把一张真实牌落到下一个空位 */
  function place(session, card, reversed) {
    for (var i = 0; i < session.cards.length; i++) {
      var e = session.cards[i];
      if (e.placed) continue;
      e.id = card.i;
      e.cn = card.cn;
      e.en = card.en;
      e.suit = card.s;
      e.roman = card.pip;
      e.reversed = !!reversed;
      e.placed = true;
      return e;
    }
    return null;
  }

  /* ---------- 翻牌记账 ---------- */
  function reveal(session, cardEntry) {
    if (cardEntry.revealed) return;
    cardEntry.revealed = true;
    session.reveals += 1;
    cardEntry.revealOrder = session.reveals;
    cardEntry.revealedAt = Date.now();
    if (session.reveals >= session.cards.length) session.done = true;
  }

  /* ---------- 校验：抽出的牌必须唯一 ---------- */
  function isUnique(cards) {
    var seen = {};
    for (var i = 0; i < cards.length; i++) {
      if (seen[cards[i].id]) return false;
      seen[cards[i].id] = 1;
    }
    return true;
  }

  return {
    randInt: randInt,
    coin: coin,
    buildDeck: buildDeck,
    shuffle: shuffle,
    cut: cut,
    orientation: orientation,
    take: take,
    createSession: createSession,
    place: place,
    reveal: reveal,
    isUnique: isUnique
  };
})();
