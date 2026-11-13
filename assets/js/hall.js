/* ══════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — STARTRACK HALL
   交互层逻辑：月相、今日主题、五入口路由、面板开合
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 空间定义 ─────────────────────────────────────────────── */
  var SPACES = {
    tarot:   { cn: '塔罗观测站', en: 'Tarot Observatory', desc: '探索命运的指引', soon: '星盘正在校准 · 空间即将开启' },
    post:    { cn: '星际通讯局', en: 'Stellar Post Office', desc: '聆听来自星辰的信', soon: '邮局已开放 · 今日可寄信', enter: 'post.html', cta: '进入通讯局' },
    cottage: { cn: '我们的小屋', en: 'Our Cottage', desc: '收藏每一段时光', soon: '壁炉刚刚点起 · 空间即将开启', enter: 'cottage.html', cta: '进入小屋' },
    archive: { cn: '星轨档案馆', en: 'Starline Archive', desc: '珍藏所有的记忆', soon: '书架正在整理 · 空间即将开启' },
    daily:   { cn: '每日探索', en: 'Daily Discovery', desc: '开启今日的奇遇', soon: '今日的星象尚未落定 · 稍后再来' }
  };

  /* ── 月相 ─────────────────────────────────────────────────── */
  var SYNODIC = 29.530588853;
  var REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

  function phaseFraction(date) {
    var days = (date.getTime() - REF_NEW_MOON) / 86400000;
    var f = (days / SYNODIC) % 1;
    return f < 0 ? f + 1 : f;
  }

  function phaseName(f) {
    if (f < 0.033 || f >= 0.967) return '新月';
    if (f < 0.216) return '娥眉月';
    if (f < 0.283) return '上弦月';
    if (f < 0.466) return '盈凸月';
    if (f < 0.533) return '满月';
    if (f < 0.716) return '亏凸月';
    if (f < 0.783) return '下弦月';
    return '残月';
  }

  /* 两段圆弧：外弧走亮侧，内弧是明暗界线（椭圆）——移动端图标用 */
  function moonPath(f, r, cx, cy) {
    var c = Math.cos(2 * Math.PI * f);
    var rx = Math.max(Math.abs(c) * r, 0.01);
    var waxing = f < 0.5;
    var outer = waxing ? 1 : 0;
    var inner = c > 0 ? (waxing ? 0 : 1) : (waxing ? 1 : 0);
    return 'M' + cx + ' ' + (cy - r) +
           'A' + r + ' ' + r + ' 0 0 ' + outer + ' ' + cx + ' ' + (cy + r) +
           'A' + rx.toFixed(2) + ' ' + r + ' 0 0 ' + inner + ' ' + cx + ' ' + (cy - r) + 'Z';
  }

  function renderMoon() {
    var now = new Date();
    var f = phaseFraction(now);
    var illum = Math.round(((1 - Math.cos(2 * Math.PI * f)) / 2) * 100);

    var lit = document.getElementById('moonLit');
    if (lit) lit.setAttribute('d', moonPath(f, 34, 50, 50));

    var nameEl = document.getElementById('moonPhase');
    if (nameEl) nameEl.textContent = phaseName(f);

    var pctEl = document.getElementById('moonPercent');
    if (pctEl) pctEl.textContent = illum + '%';

    var detailEl = document.getElementById('moonDetail');
    if (detailEl) {
      detailEl.textContent = illum >= 99 ? '月面照亮 100% · 今夜满月'
                          : illum <= 1  ? '月面全暗 · 星子最亮'
                          : '月面照亮 ' + illum + '%';
    }
  }

  /* ── 今日主题：按当日轮转，真实动态文本 ──────────────────── */
  var THEMES = [
    '在迷雾中找到属于你的光',
    '让月光替你记得愿望',
    '今夜写一封寄往明年的信',
    '把未说的话交给星轨',
    '慢一点，月亮也在圆',
    '在长廊尽头与自己重逢',
    '所有走散的光都会绕回来'
  ];   // 每句 ≤ 12 字，与原图单行排版一致

  function dayIndex(date) {
    var start = Date.UTC(date.getFullYear(), 0, 0);
    return Math.floor((date.getTime() - start) / 86400000);
  }

  function renderTheme() {
    var el = document.getElementById('themeLine');
    if (!el) return;
    var i = dayIndex(new Date()) % THEMES.length;
    el.textContent = THEMES[i];
  }

  /* ── 入口面板（hash 路由） ────────────────────────────────── */
  var gate = document.getElementById('gate');
  var lastFocus = null;

  function openGate(id) {
    var space = SPACES[id];
    if (!space || !gate) return;

    document.getElementById('gateTitle').textContent = space.cn;
    document.getElementById('gateEn').textContent = space.en;
    document.getElementById('gateDesc').textContent = space.desc;
    document.getElementById('gateSoon').textContent = space.soon;
    /* 已建成的空间给出真实入口（星际通讯局 → post.html） */
    var enter = document.getElementById('gateEnter');
    if (enter) {
      if (space.enter) {
        enter.href = window.DA_LINK ? DA_LINK.fix(space.enter) : space.enter;
        enter.textContent = space.cta || ('进入' + space.cn);
        enter.hidden = false;
      } else { enter.hidden = true; }
    }

    if (!gate.hidden) return;
    lastFocus = document.activeElement;
    gate.hidden = false;
    document.body.style.overflow = 'hidden';

    var back = gate.querySelector('.gate__back');
    if (back) back.focus({ preventScroll: true });
  }

  function closeGate(restoreFocus) {
    if (!gate || gate.hidden) return;
    gate.hidden = true;
    document.body.style.overflow = '';
    if (restoreFocus !== false && lastFocus && lastFocus.focus) {
      lastFocus.focus({ preventScroll: true });
    }
  }

  function route() {
    var hash = location.hash.replace(/^#\/?/, '');
    var go = function (page, anchor) {
      var url = window.DA_LINK ? DA_LINK.fix(page) : page;
      location.href = anchor ? url + anchor : url;
    };
    // 塔罗观测站已建成独立页面
    if (hash === 'tarot') { go('observatory.html'); return; }
    // 星轨档案馆已建成独立页面
    if (hash === 'archive') { go('archive.html'); return; }
    // 每日探索 = 观测站里那块真实可用的「今日探索」：
    // 带 #daily 锚点过去，观测站会自动定位到它，不再是「稍后再来」的死路。
    if (hash === 'daily') { go('observatory.html', '#daily'); return; }
    if (hash && SPACES[hash]) openGate(hash);
    else closeGate(false);
  }

  /* ── 绑定 ─────────────────────────────────────────────────── */
  function bind() {
    // 每个入口的点击都必须落到真实路由上（同 hash 重复点击也要有反馈）
    Array.prototype.forEach.call(document.querySelectorAll('[data-space]'), function (a) {
      a.addEventListener('click', function () {
        var id = a.getAttribute('data-space');
        if (location.hash === '#/' + id) route();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (btn) {
      btn.addEventListener('click', function () {
        if (location.hash) {
          // 回到大厅：清除 hash，交给 hashchange
          history.pushState('', document.title, location.pathname + location.search);
          closeGate(true);
        } else {
          closeGate(true);
        }
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !gate.hidden) {
        if (location.hash) {
          history.pushState('', document.title, location.pathname + location.search);
        }
        closeGate(true);
      }
    });

    window.addEventListener('hashchange', route);
    window.addEventListener('popstate', route);

    // 键盘用户：面板内 Tab 循环不逃逸
    if (gate) {
      gate.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab') return;
        var items = gate.querySelectorAll('button, a[href]');
        if (!items.length) return;
        var first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
    }
  }

  /* ── 右上角头像：个人空间 / 通行证入口 ─────────────────────
     未登录 → 打开通行证（手机号 / 邮箱验证码，登录即建号）；
     已登录 → 打开账号面板（可查看账号、退出登录）。
     状态同时反映在头像的金色状态点与 title 上，不做假状态。 */
  function bindAvatar() {
    var btn = document.getElementById('avatarBtn');
    if (!btn) return;
    var dot = document.getElementById('avatarDot');

    function paint() {
      var auth = window.DA_AUTH;
      var on = !!(auth && auth.uid && auth.uid());
      var who = (auth && auth.name) ? auth.name() : '';
      var label = on
        ? ('个人空间 · 已登录 ' + (who || '通行证'))
        : '个人空间 · 通行证（手机号或邮箱登录，换设备也能读到同一份档案）';
      btn.title = label;
      btn.setAttribute('aria-label', label);
      btn.classList.toggle('is-in', on);
      if (dot) dot.hidden = !on;
    }

    btn.addEventListener('click', function () {
      if (window.DA_AUTH && DA_AUTH.open) { DA_AUTH.open(); return; }
      /* 通行证模块没就位时，也不能让按钮毫无反应 */
      location.href = window.DA_LINK ? DA_LINK.fix('cottage.html') : 'cottage.html';
    });

    if (window.DA_AUTH) {
      if (DA_AUTH.onChange) DA_AUTH.onChange(paint);
      if (DA_AUTH.init) { try { DA_AUTH.init().then(paint); } catch (e) { paint(); } }
    }
    paint();
  }

  function boot() {
    renderMoon();
    renderTheme();
    bind();
    bindAvatar();
    route();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
