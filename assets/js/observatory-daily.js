/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 每日探索 DAILY CROSSING
   ----------------------------------------------------------------------
   1. 今日之牌：以本地日期为种子，同一天任何设备打开都是同一张牌
      （纯哈希，不请求网络；第二天自动更换）
   2. 月相：以 2000-01-06 18:14 UTC 的朔月为历元，按 29.530588853 天推算，
      给出月相名、月龄与照亮比例，并画出真实的明暗比例
   3. 连续天数：只记录在本地，不上传任何东西
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var D   = window.DA_TAROT;
  var IMG = window.DA_TAROT_IMG || {};
  var S   = window.DA_SOUND;
  var root = document.getElementById('daily');
  if (!root || !D || !D.all) return;

  var q = function (s) { return root.querySelector(s); };
  var deck = D.all;

  /* ---------- 日期与种子 ---------- */
  var now = new Date();

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function keyOf(dt) {
    return '' + dt.getFullYear() + pad(dt.getMonth() + 1) + pad(dt.getDate());
  }
  var todayKey = keyOf(now);

  // FNV-1a：同一个日期永远得到同一个数
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  var card = deck[hash('DA.CROSS.' + todayKey) % deck.length];
  var rev  = hash('DA.CROSS.DIR.' + todayKey) % 100 < 34;   // 约 34% 逆位
  if (!card) return;

  /* ---------- 月相 ---------- */
  var SYNODIC = 29.530588853;
  var SYN = Date.UTC(2000, 0, 6, 18, 14);
  var ageRaw = (now.getTime() - SYN) / 86400000;
  var age = ((ageRaw % SYNODIC) + SYNODIC) % SYNODIC;
  var f = age / SYNODIC;                       // 0 朔 → .5 望 → 1 朔
  var illum = (1 - Math.cos(2 * Math.PI * f)) / 2;   // 0..1

  var phaseName;
  if (f < 0.02 || f > 0.98)      phaseName = '朔月';
  else if (f < 0.20)             phaseName = '娥眉月';
  else if (f < 0.30)             phaseName = '上弦月';
  else if (f < 0.47)             phaseName = '盈凸月';
  else if (f < 0.53)             phaseName = '满月';
  else if (f < 0.70)             phaseName = '亏凸月';
  else if (f < 0.80)             phaseName = '下弦月';
  else                           phaseName = '残月';

  /* ---------- 日期文案 ---------- */
  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  var dateEl = q('#dailyDate');
  if (dateEl) {
    dateEl.textContent = now.getFullYear() + '.' + pad(now.getMonth() + 1) + '.' +
      pad(now.getDate()) + ' · ' + WEEK[now.getDay()];
  }

  var moonEl = q('#dailyMoonText');
  var phEl = q('#dailyPh');
  if (moonEl) {
    moonEl.textContent = phaseName + ' · 月龄 ' + age.toFixed(1) + ' 天 · 照亮 ' +
      Math.round(illum * 100) + '%';
  }
  if (phEl) {
    // 盈月：暗影向左推出（右侧先亮）；亏月：暗影向右推出（左侧保留）
    var shift = (f < 0.5 ? -1 : 1) * illum * 100;
    phEl.style.setProperty('--phx', shift.toFixed(2));
  }

  /* ---------- 元素 ---------- */
  var dcard   = q('#dcard');
  var dcardBtn= q('#dcardBtn');
  var dImg    = q('#dcardImg');
  var dName   = q('#dailyName');
  var dEn     = q('#dailyEn');
  var dKeys   = q('#dailyKeys');
  var dLine   = q('#dailyLine');
  var dTwo    = q('#dailyTwo');
  var dDo     = q('#dailyDo');
  var dDont   = q('#dailyDont');
  var dMore   = q('#dailyMore');
  var dFullUp = q('#dailyFullUp');
  var dFullDl = q('#dailyFullDl');
  var dHint   = q('#dcardHint');
  var dStreak = q('#dailyStreak');

  var kk   = rev ? card.kr : card.ku;   // 当前方向的关键词
  var kOpp = rev ? card.ku : card.kr;   // 反方向，用作「忌」

  /* ---------- 填充 ---------- */
  function fill() {
    if (dImg) {
      var src = IMG[card.i] || ('assets/media/tarot/' + card.i + '.jpg');
      dImg.src = src;
      dImg.alt = card.cn + '（' + (rev ? '逆位' : '正位') + '）';
    }
    if (dName) {
      dName.textContent = card.cn;
      dName.classList.remove('is-closed');
    }
    if (dEn) dEn.textContent = card.en + (rev ? ' · Reversed' : '');

    if (dKeys) {
      dKeys.innerHTML = '';
      kk.slice(0, 3).forEach(function (k) {
        var li = document.createElement('li');
        li.textContent = k;
        dKeys.appendChild(li);
      });
    }

    if (dLine) {
      dLine.textContent = rev ? card.rev : card.up;
      dLine.classList.remove('is-muted');
    }

    if (dTwo) dTwo.hidden = false;
    if (dDo) dDo.textContent = kk[0] + (kk[1] ? ' · ' + kk[1] : '');
    if (dDont) dDont.textContent = kOpp[0];

    if (dMore) dMore.hidden = false;

    if (dFullUp) dFullUp.textContent = (rev ? card.rev : card.up) + ' ' + card.sym;
    if (dFullDl) {
      var rows = [
        ['爱情与关系', card.love],
        ['友情与亲情', card.kin],
        ['此刻的情绪', card.mood],
        ['今天可以做的', card.act]
      ];
      dFullDl.innerHTML = rows.map(function (r) {
        return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>';
      }).join('');
    }

    if (dHint) dHint.textContent = '今日已开启 · 明天换成另一张';
  }

  /* ---------- 连续天数 ---------- */
  var LOG = 'DA_DAILY_LOG';

  function readLog() {
    try {
      var o = JSON.parse(localStorage.getItem(LOG) || 'null');
      return o && typeof o === 'object' ? o : null;
    } catch (e) { return null; }
  }
  function writeLog(o) {
    try { localStorage.setItem(LOG, JSON.stringify(o)); } catch (e) {}
  }

  var log = readLog();
  var openedToday = !!(log && log.last === todayKey);

  function bumpStreak() {
    var yesterday = keyOf(new Date(now.getTime() - 86400000));
    var prev = readLog();
    var streak = 1;
    if (prev && prev.last === yesterday) streak = (prev.streak || 1) + 1;
    else if (prev && prev.last === todayKey) streak = prev.streak || 1;

    var total = ((prev && prev.total) || 0) + (openedToday ? 0 : 1);
    writeLog({ last: todayKey, streak: streak, total: total, card: card.i, dir: rev ? 'rev' : 'up' });
    return { streak: streak, total: total };
  }

  function paintStreak(s) {
    if (!dStreak) return;
    if (!s) {
      dStreak.innerHTML = '第一次打开今日探索 · 牌只留到今晚';
      return;
    }
    var txt = s.streak > 1
      ? '连续第 <b>' + s.streak + '</b> 天回到观测站'
      : '开始了新的一轮 · 第 <b>1</b> 天';
    dStreak.innerHTML = txt + ' · 累计 <b>' + s.total + '</b> 次';
  }

  /* ---------- 状态 ---------- */
  if (openedToday) {
    // 今天已经翻过：直接正面，不重播翻转
    dcard.classList.add('no-anim');
    fill();
    dcard.classList.add('is-flipped');
    if (rev) dcard.classList.add('is-rev');
    paintStreak(log);
    requestAnimationFrame(function () {
      setTimeout(function () { dcard.classList.remove('no-anim'); }, 60);
    });
  } else if (dStreak) {
    dStreak.innerHTML = log && log.total
      ? '今天还没翻开 · 累计 <b>' + log.total + '</b> 次'
      : '第一次打开今日探索 · 这张牌只留到今晚';
  }

  /* ---------- 翻牌 ---------- */
  if (dcardBtn) {
    dcardBtn.addEventListener('click', function () {
      if (dcard.classList.contains('is-flipped')) return;

      fill();
      dcard.classList.remove('no-anim');
      dcard.classList.add('is-flipped');
      if (rev) dcard.classList.add('is-rev');
      if (S && S.flip) S.flip();

      paintStreak(bumpStreak());
    });
  }

  /* ---------- 细读 ---------- */
  if (dMore) {
    dMore.addEventListener('click', function () {
      var open = root.classList.toggle('is-open');
      dMore.setAttribute('aria-expanded', open ? 'true' : 'false');
      dMore.firstChild.textContent = open ? '收起 ' : '细读这张牌 ';
      if (open && S && S.hover) S.hover();
    });
  }

  /* ---------- 从星轨大厅「每日探索」进来时的落点 ----------
     首页第五个入口现在直接带着 #daily 过来：先定位到这一块，
     再把注意力交给今天这张牌（未翻开就高亮牌背）。
     观测站是异步渲染的，页面高度会随后续内容变化，
     所以滚动后要复查一次，必要时再校正，避免停在半路。 */
  function jumpToDaily() {
    if (location.hash !== '#daily') return;
    var tries = 0;
    var go = function () {
      if (!root) return;
      var r = root.getBoundingClientRect();
      if (!r.height) return;                       /* 还没渲染出来，等下一轮 */
      var target = Math.round(r.top + window.scrollY - (window.innerHeight - r.height) / 2);
      window.scrollTo({ top: Math.max(0, target), behavior: tries === 0 ? 'smooth' : 'auto' });
      tries++;
      if (tries < 5) {
        setTimeout(function () {
          var rr = root.getBoundingClientRect();
          if (rr.top < -4 || rr.top > window.innerHeight) go();
        }, 600);
      }
    };
    setTimeout(go, 320);
  }
  jumpToDaily();
  window.addEventListener('hashchange', jumpToDaily);
})();
