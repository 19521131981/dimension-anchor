/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — THE HIDDEN STAR · 隐藏星际讯息系统
   ----------------------------------------------------------------------
   一颗随机出现在安全区域的小星；点开是一封会展开的信笺；可以收藏，
   收藏会进星轨档案馆。

   状态（全部在本机，不上传）：

     DA2_HIDDEN_VISIT   sessionStorage  本次访问是否已经出现过一条
     DA2_HIDDEN_DAY     localStorage    今天的特别讯息（日期 / 内容 / 是否已收藏）
     DA2_HIDDEN_MARK    localStorage    档案馆还有一个没看过的新收藏
     DA2_HIDDEN_FAVS    localStorage    没有 DA_STORE 时的收藏兜底

   有 window.DA_STORE 时，收藏直接写进它已有的 favs 库里
   （type = 'hidden-star'），不另起一套数据；档案馆面板读同一份数据。

   触发：
     · 进入大厅 30–90 秒随机出现（每天 / 每次访问各最多一条）
     · 点月亮、进入任一空间后，有一次「额外发现」的机会
     · 页面隐藏时倒计时暂停；弹窗打开时不打断
   ══════════════════════════════════════════════════════════════════════ */
window.DA_HIDDEN = (function () {
  'use strict';

  var M = window.DA_MOTION;
  var plate = document.querySelector('.plate');
  var field = document.querySelector('.star-field');
  if (!M || !plate || !field) return { notify: function () {}, showNow: function () {} };

  var K = {
    visit: 'DA2_HIDDEN_VISIT',
    day: 'DA2_HIDDEN_DAY',
    mark: 'DA2_HIDDEN_MARK',
    favs: 'DA2_HIDDEN_FAVS'
  };

  var STAR = '<svg viewBox="0 0 44 44" aria-hidden="true">' +
    '<circle class="hs__aura" cx="22" cy="22" r="13" />' +
    '<circle class="hs__ring" cx="22" cy="22" r="13" />' +
    '<g class="hs__body">' +
      '<path d="M22 9.4c1.1 6.1 2.6 7.6 8.7 8.7-6.1 1.1-7.6 2.6-8.7 8.7-1.1-6.1-2.6-7.6-8.7-8.7 6.1-1.1 7.6-2.6 8.7-8.7Z" ' +
        'fill="#FFFDF4"/>' +
      '<path d="M22 12.6c.7 4.2 1.8 5.3 6 6-4.2.7-5.3 1.8-6 6-.7-4.2-1.8-5.3-6-6 4.2-.7 5.3-1.8 6-6Z" ' +
        'fill="#FFF4DA" opacity=".55"/>' +
      '<circle class="hs__core" cx="22" cy="22" r="1.6" fill="#FFFFFF"/>' +
    '</g></svg>';

  /* ══ 讯息库 ═══════════════════════════════════════════════════════
     三类内容分开存放，方便以后接服务端生成（见验收说明里的扩展点）。
     句子要求：短、自然、像人写的，不像鸡汤。 */
  var LIB = {
    encounter: [
      '今天有没有一件小事，让你忍不住想和某个人分享？',
      '有些故事不需要急着抵达结局，慢慢走，也是一种浪漫。',
      '也许今天值得期待的，不是远方，而是某个平凡的瞬间。',
      '你最近有没有好好吃饭？这句话听起来很普通，但它很重要。',
      '如果今天有点累，就把步子放慢一点。月亮也常常只露出半边。',
      '有些话不必说给谁听，写下来，风会替你收着。',
      '你比自己以为的更有耐心，只是很少为自己用。',
      '今天的星轨偏了一点点，正好把光落在你站的地方。'
    ],
    post: [
      '有一封信正在等待被开启。也许今天适合听听某个人想对你说的话。',
      '星际通讯局收到了一段新的讯号，记得去看看。',
      '抽屉里那封没写完的信，其实只差最后一句。',
      '邮差刚从星轨上回来，说有一封是给你的。'
    ],
    /* 语气模板：只使用档案里的名字，不加任何用户没提供过的事实 */
    dream: [
      '如果今天见到{name}，记得也告诉 TA，你最近做得很棒。别总是只顾着关心别人呀。',
      '{name}大概会这样说：先把今天过完，剩下的事交给明天。',
      '你替{name}记得那么多细节，也分一点给自己。',
      '如果{name}在这里，TA 多半会安静地陪着你，不说话也没关系。'
    ]
  };

  var state = {
    shown: false,
    collected: false,
    open: false,
    msg: null,
    star: null,
    wave: 0,
    lastFocus: null
  };

  /* ── 存储小工具 ───────────────────────────────────────────── */
  function lsGet(k, d) {
    try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }
    catch (e) { return d; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }
  function ssGet(k, d) {
    try { var v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); }
    catch (e) { return d; }
  }
  function ssSet(k, v) {
    try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }

  function today() { return M.dayKey(); }
  function dayRec() { return lsGet(K.day, null); }
  function collectedToday() {
    var r = dayRec();
    return !!(r && r.date === today() && r.collected);
  }
  function shownThisVisit() {
    return ssGet(K.visit, null) === today();
  }

  function favs() {
    if (window.DA_STORE && window.DA_STORE.favs) {
      return window.DA_STORE.favs.list().filter(function (f) { return f && f.type === 'hidden-star'; });
    }
    var a = lsGet(K.favs, []);
    return Array.isArray(a) ? a : [];
  }

  function addFav(rec) {
    if (window.DA_STORE && window.DA_STORE.favs) {
      window.DA_STORE.favs.add({
        type: 'hidden-star',
        refId: rec.id,
        text: rec.text,
        kind: rec.kind,
        kindCn: rec.kindCn,
        at: rec.at,
        profile: rec.profile || '',
        source: rec.source,
        day: rec.day
      });
      return;
    }
    var a = favs();
    a.unshift(rec);
    lsSet(K.favs, a.slice(0, 120));
  }

  function removeFav(item) {
    if (window.DA_STORE && window.DA_STORE.favs && item.id && item.id.indexOf('fv') === 0) {
      window.DA_STORE.favs.remove(item.id);
      return;
    }
    var a = favs().filter(function (f) {
      return (f.id || f.refId) !== (item.id || item.refId);
    });
    lsSet(K.favs, a);
  }

  /* ── 选一条讯息 ───────────────────────────────────────────── */
  function profileWithName() {
    if (!window.DA_STORE || !window.DA_STORE.profiles) return null;
    var list = window.DA_STORE.profiles.list() || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].name && list[i].name !== '未命名角色') return list[i];
    }
    return null;
  }

  function unreadMail() {
    try { return parseInt(localStorage.getItem('DA2_MAIL_UNREAD') || '0', 10) || 0; }
    catch (e) { return 0; }
  }

  function makeMessage() {
    var prof = profileWithName();
    var r = Math.random();

    if (prof && r < 0.38) {
      var tpl = M.pick(LIB.dream);
      var text = tpl.replace(/\{name\}/g, prof.name);
      return {
        kind: 'dream',
        kindCn: '梦角主题讯息',
        text: text,
        note: '语感参考你保存的「' + prof.name + '」档案 · 这是幻想语境里的短笺，不代表真实的跨维度联系。',
        profile: prof.name
      };
    }

    if (unreadMail() > 0 ? r < 0.72 : r < 0.24) {
      return {
        kind: 'post',
        kindCn: '星际通讯局提示',
        text: M.pick(LIB.post),
        note: '',
        profile: ''
      };
    }

    return {
      kind: 'encounter',
      kindCn: '偶遇讯息',
      text: M.pick(LIB.encounter),
      note: '',
      profile: ''
    };
  }

  /* ── 安全区域 ─────────────────────────────────────────────── */
  function hostBox() {
    var r = field.getBoundingClientRect();
    var fixed = getComputedStyle(field).position === 'fixed';
    if (fixed) r = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    return { left: r.left, top: r.top, w: r.width, h: r.height };
  }

  var AVOID_SEL = ['.logo', '.nav', '.avatar', '.card--moon', '.card--theme',
    '.portals', '.foot', '.tabbar', '.motion-switch', '.moon-hit'];

  function avoidRects(box) {
    var out = [];
    AVOID_SEL.forEach(function (sel) {
      Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
        var r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        out.push({
          x1: r.left - box.left, y1: r.top - box.top,
          x2: r.right - box.left, y2: r.bottom - box.top
        });
      });
    });
    return out;
  }

  function isSafe(x, y, box, rects, pad) {
    pad = pad == null ? 26 : pad;
    if (x < 24 || y < 24 || x > box.w - 24 || y > box.h - 24) return false;
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (x > r.x1 - pad && x < r.x2 + pad && y > r.y1 - pad && y < r.y2 + pad) return false;
    }
    return true;
  }

  function bands(box) {
    var wide = box.w > 900;
    if (wide) {
      return [
        [0.02, 0.135, 0.28, 0.56],   /* 左花枝 */
        [0.865, 0.98, 0.28, 0.56],   /* 右花枝 */
        [0.13, 0.26, 0.44, 0.58],    /* 阶梯基座左 */
        [0.74, 0.87, 0.44, 0.58],    /* 阶梯基座右 */
        [0.30, 0.39, 0.40, 0.55],    /* 星盘左侧空白 */
        [0.61, 0.70, 0.40, 0.55]     /* 星盘右侧空白 */
      ];
    }
    /* 手机端整页都可滚动，星星固定在视口里，所以只放在首屏可见的
       宫殿两侧（月盘左右外沿），不落在卡片、页头与任务栏上。 */
    return [
      [0.03, 0.22, 0.11, 0.25],
      [0.78, 0.97, 0.11, 0.25],
      [0.03, 0.24, 0.27, 0.33],
      [0.76, 0.97, 0.27, 0.33]
    ];
  }

  function findSpot() {
    var box = hostBox();
    var rects = avoidRects(box);
    var bs = bands(box);
    var order = bs.slice().sort(function () { return Math.random() - 0.5; });

    for (var i = 0; i < order.length; i++) {
      var b = order[i];
      for (var k = 0; k < 16; k++) {
        var x = box.w * M.rand(b[0], b[1]);
        var y = box.h * M.rand(b[2], b[3]);
        if (isSafe(x, y, box, rects)) return { x: x, y: y };
      }
    }
    /* 兜底：在整屏上扫一遍网格，取第一个真正安全的位置 */
    for (var gy = 0.1; gy < 0.94; gy += 0.06) {
      for (var gx = 0.05; gx < 0.96; gx += 0.05) {
        var x2 = box.w * gx, y2 = box.h * gy;
        if (isSafe(x2, y2, box, rects, 20)) return { x: x2, y: y2 };
      }
    }
    return null;
  }

  /* ── 出现 ─────────────────────────────────────────────────── */
  function busy() {
    if (state.open) return true;
    var gate = document.getElementById('gate');
    return !!(gate && !gate.hidden);
  }

  function show() {
    if (state.shown || collectedToday() || busy()) return false;

    var spot = findSpot();
    if (!spot) return false;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'hidden-star';
    b.setAttribute('aria-label', '一颗可以点开的星');
    b.innerHTML = STAR;
    b.style.left = spot.x.toFixed(1) + 'px';
    b.style.top = spot.y.toFixed(1) + 'px';

    field.appendChild(b);
    state.star = b;
    state.shown = true;
    ssSet(K.visit, today());

    M.emit('hidden:appear', { x: spot.x, y: spot.y });
    requestAnimationFrame(function () { b.classList.add('is-in'); });

    b.addEventListener('click', function (e) {
      e.preventDefault();
      openFromStar(b);
    });
    return true;
  }

  function openFromStar(star) {
    var r = star.getBoundingClientRect();
    var fr = field.getBoundingClientRect();
    var cx = r.left + r.width / 2 - fr.left;
    var cy = r.top + r.height / 2 - fr.top;

    /* 1. 扩散光波 */
    [0, 1].forEach(function (i) {
      var w = document.createElement('span');
      w.className = 'star-wave' + (i ? ' star-wave--2' : '');
      w.style.left = cx + 'px';
      w.style.top = cy + 'px';
      field.appendChild(w);
      window.setTimeout(function () { if (w.parentNode) w.parentNode.removeChild(w); }, 2200);
    });

    /* 2. 细小光线向内收拢 */
    for (var i = 0; i < 3; i++) {
      var ray = document.createElement('span');
      ray.className = 'star-ray';
      ray.style.left = cx + 'px';
      ray.style.top = cy + 'px';
      ray.style.setProperty('--a', (i * 120 + 15) + 'deg');
      ray.style.animationDelay = (i * 90) + 'ms';
      field.appendChild(ray);
      (function (el) {
        window.setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1600);
      })(ray);
    }

    /* 3. 星星自身收束 */
    star.classList.remove('is-in');
    star.style.transform = 'scale(.2)';
    window.setTimeout(function () {
      if (star.parentNode) star.parentNode.removeChild(star);
    }, 620);
    state.star = null;

    window.setTimeout(openLetter, 480);
  }

  /* ── 信笺 ─────────────────────────────────────────────────── */
  var letter, lKind, lDate, lBody, lNote, lSave, lGo;

  function openLetter() {
    if (!letter) return;
    state.msg = makeMessage();
    var msg = state.msg;

    lKind.textContent = msg.kindCn;
    lDate.textContent = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }) + ' · 星轨历';
    lBody.textContent = msg.text;
    lNote.textContent = msg.note || '';
    lGo.hidden = msg.kind !== 'post';
    lSave.textContent = '收藏这颗星';
    lSave.disabled = false;

    state.lastFocus = document.activeElement;
    letter.hidden = false;
    state.open = true;
    document.body.classList.add('is-letter-open');
    requestAnimationFrame(function () {
      letter.classList.add('is-open');
      window.setTimeout(function () { lSave.focus({ preventScroll: true }); }, 720);
    });
  }

  function closeLetter() {
    if (!letter || !state.open) return;
    state.open = false;
    letter.classList.remove('is-open');
    document.body.classList.remove('is-letter-open');
    window.setTimeout(function () {
      letter.hidden = true;
      if (state.lastFocus && state.lastFocus.focus) {
        state.lastFocus.focus({ preventScroll: true });
      }
    }, 520);
  }

  function saveStar() {
    var msg = state.msg;
    if (!msg || state.collected) return;

    var rec = {
      id: 'hs_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: msg.text,
      kind: msg.kind,
      kindCn: msg.kindCn,
      at: Date.now(),
      profile: msg.profile || '',
      source: 'hall/hidden-star',
      day: today()
    };

    addFav(rec);
    state.collected = true;
    lsSet(K.day, { date: today(), id: rec.id, collected: true, at: rec.at });
    lsSet(K.mark, true);

    markArchive(true);
    toast('已收进星轨档案馆');
    lSave.textContent = '已收藏';
    lSave.disabled = true;
    M.emit('hidden:collected', rec);
  }

  /* ── 档案馆入口的小提示 ───────────────────────────────────── */
  function markArchive(on) {
    var p = document.querySelector('.portal[data-space="archive"]');
    if (!p) return;
    var m = p.querySelector('.portal__mark');
    if (!m) {
      m = document.createElement('span');
      m.className = 'portal__mark';
      m.setAttribute('aria-hidden', 'true');
      p.appendChild(m);
    }
    m.classList.toggle('is-on', !!on);
    if (on) p.setAttribute('aria-label', p.getAttribute('aria-label').replace(/（.*?）$/, '') + '（有新的收藏）');
  }

  function syncMark() {
    markArchive(!!lsGet(K.mark, false));
  }

  /* ── 档案馆列表 ───────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmt(ts) {
    try {
      var d = new Date(ts);
      return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    } catch (e) { return ''; }
  }

  function renderShelf() {
    var panel = document.querySelector('#gate .gate__panel');
    if (!panel) return;
    var soon = panel.querySelector('#gateSoon');
    var shelf = panel.querySelector('.gate__shelf');

    if (!shelf) {
      shelf = document.createElement('div');
      shelf.className = 'gate__shelf';
      shelf.setAttribute('role', 'list');
      panel.insertBefore(shelf, soon || null);
    }

    var items = favs();
    if (!items.length) {
      shelf.innerHTML = '<p class="shelf-empty">还没有收藏的星。<br>在大厅里等一等，它会自己亮起来。</p>';
      if (soon) soon.textContent = '星轨档案馆 · 空的';
      return;
    }

    var html = '';
    items.forEach(function (f) {
      var id = f.id || f.refId || '';
      html += '<div class="shelf-item" role="listitem">' +
        '<p class="shelf-item__meta"><span>' + esc(f.kindCn || '隐藏讯息') + '</span>' +
        '<i>·</i><span>' + esc(fmt(f.at)) + '</span>' +
        (f.profile ? '<i>·</i><span>' + esc(f.profile) + '</span>' : '') + '</p>' +
        '<p class="shelf-item__text">' + esc(f.text) + '</p>' +
        '<button type="button" class="shelf-item__del" data-del="' + esc(id) + '">从档案中移除</button>' +
        '</div>';
    });
    shelf.innerHTML = html;
    if (soon) soon.textContent = '共 ' + items.length + ' 颗被收进这里的星';

    Array.prototype.forEach.call(shelf.querySelectorAll('[data-del]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-del');
        var target = null;
        favs().forEach(function (f) {
          if ((f.id || f.refId) === id) target = f;
        });
        if (target) removeFav(target);
        renderShelf();
      });
    });
  }

  function clearShelf() {
    var shelf = document.querySelector('#gate .gate__shelf');
    if (shelf && shelf.parentNode) shelf.parentNode.removeChild(shelf);
  }

  function bindGate() {
    var gate = document.getElementById('gate');
    if (!gate) return;

    /* hall.js 的 openGate 每次被调用（hashchange / popstate 会连着来两次）
       都会把标题与说明重写一遍，所以这里渲染两次：先立刻填，再等一拍补。 */
    function apply() {
      if (gate.hidden) return;
      var h = location.hash.replace(/^#\/?/, '');
      if (h === 'archive') {
        renderShelf();
        lsSet(K.mark, false);
        markArchive(false);
      } else {
        clearShelf();
      }
    }

    if (window.MutationObserver) {
      new MutationObserver(function () {
        apply();
        window.setTimeout(apply, 80);
      }).observe(gate, { attributes: true, attributeFilter: ['hidden'] });
    }
    window.addEventListener('hashchange', function () { window.setTimeout(apply, 90); });
    window.addEventListener('popstate', function () { window.setTimeout(apply, 90); });
  }

  /* ── 轻提示 ───────────────────────────────────────────────── */
  var toastEl, toastTimer = 0;
  function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove('is-on');
    }, 2600);
  }

  /* ── 调度 ─────────────────────────────────────────────────── */
  function forceDelay() {
    var q = (location.search.match(/[?&]star=([^&]+)/) || [])[1];
    if (!q) return null;
    if (q === 'now') return 0;
    var n = parseFloat(q);
    return isNaN(n) ? null : n;
  }

  function tryShow() {
    if (state.shown || collectedToday()) return;
    /* 手机上星星固定在视口里：用户已经滚到下面时先不出现，
       免得它凭空停在一段与它无关的内容上 */
    var scrolled = window.scrollY > 60;
    if (M.state.paused || busy() || scrolled) {
      window.setTimeout(tryShow, 20000);
      return;
    }
    show();
  }

  function start() {
    if (collectedToday() || shownThisVisit()) return;
    var d = forceDelay();
    var wait = d == null ? M.rand(30, 90) : d;
    window.setTimeout(tryShow, wait * 1000);
  }

  /* 互动触发：点月亮 / 进了某个空间之后，多一次发现机会 */
  function notify(kind) {
    if (state.shown || collectedToday()) return;
    if (kind !== 'moon' && kind !== 'portal') return;
    if (Math.random() > 0.55) return;
    window.setTimeout(function () {
      if (!state.shown && !collectedToday() && !M.state.paused && !busy()) show();
    }, M.rand(16000, 32000));
  }

  /* ── 启动 ─────────────────────────────────────────────────── */
  function boot() {
    letter = document.getElementById('starLetter');
    toastEl = document.getElementById('hallToast');
    if (letter) {
      lKind = document.getElementById('letterKind');
      lDate = document.getElementById('letterDate');
      lBody = document.getElementById('letterBody');
      lNote = document.getElementById('letterNote');
      lSave = document.getElementById('letterSave');
      lGo = document.getElementById('letterGo');

      Array.prototype.forEach.call(letter.querySelectorAll('[data-letter-close]'), function (el) {
        el.addEventListener('click', closeLetter);
      });
      lSave.addEventListener('click', saveStar);
      lGo.addEventListener('click', function () { closeLetter(); });

      letter.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); closeLetter(); return; }
        if (e.key !== 'Tab') return;
        var items = letter.querySelectorAll('button:not([disabled]), a[href]');
        if (!items.length) return;
        var first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
    }

    bindGate();
    syncMark();

    M.on('moon', function () { notify('moon'); });
    M.on('portal', function (id) { notify('portal'); });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }

  boot();

  return {
    notify: notify,
    showNow: function () { if (!state.shown && !collectedToday()) show(); },
    openLetter: openLetter,
    save: saveStar,
    close: closeLetter,
    list: favs,
    say: toast,
    state: state
  };
})();
