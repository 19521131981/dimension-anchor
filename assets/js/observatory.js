/* DIMENSION ANCHOR — 观测站主页交互 */
(function () {
  'use strict';

  var S = window.DA_SOUND;
  var $ = function (s, r) { return (r || document).querySelector(s); };

  /* ---------- 轻提示 ---------- */
  var toastEl = $('#toast');
  var toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 3200);
  }

  /* ---------- 音效面板 ---------- */
  var soundBtn = $('#soundBtn');
  var soundPop = $('#soundPop');
  var muteSwitch = $('#muteSwitch');
  var volRange = $('#volRange');

  function openPop(open) {
    soundPop.classList.toggle('is-open', open);
    soundBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  if (soundBtn) {
    soundBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      unlock();
      openPop(!soundPop.classList.contains('is-open'));
    });
  }

  document.addEventListener('click', function (e) {
    if (!soundPop || !soundPop.classList.contains('is-open')) return;
    if (soundPop.contains(e.target) || soundBtn.contains(e.target)) return;
    openPop(false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') openPop(false);
  });

  if (muteSwitch) {
    muteSwitch.addEventListener('click', function () {
      var on = muteSwitch.getAttribute('aria-checked') !== 'true';
      muteSwitch.setAttribute('aria-checked', on ? 'true' : 'false');
      S.setMuted(!on);
      try { localStorage.setItem('DA_TAROT_MUTE', on ? '0' : '1'); } catch (err) {}
      if (on) S.hover();
    });
  }

  if (volRange) {
    volRange.addEventListener('input', function () {
      var v = Number(volRange.value) / 100;
      S.setVolume(v);
      try { localStorage.setItem('DA_TAROT_VOL', String(v)); } catch (err) {}
    });
  }

  // 恢复上次的音效偏好
  try {
    if (localStorage.getItem('DA_TAROT_MUTE') === '1') {
      muteSwitch.setAttribute('aria-checked', 'false');
      S.setMuted(true);
    }
    var sv = localStorage.getItem('DA_TAROT_VOL');
    if (sv !== null) {
      volRange.value = String(Math.round(Number(sv) * 100));
      S.setVolume(Number(sv));
    }
  } catch (err) {}

  /* ---------- 首次交互解锁音频 ---------- */
  var unlocked = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    S.unlock();
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, unlock, { once: true, passive: true });
  });

  /* ---------- 连接状态 ---------- */
  var linkState = $('#linkState');
  var linkText = $('#linkStateText');
  var startRitual = $('#startRitual');

  function readSession() {
    try {
      var raw = localStorage.getItem('DA_LINK_SESSION');
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.savedAt) return null;
      // 超过 12 小时视为过期，回到未连接
      if (Date.now() - o.savedAt > 12 * 3600 * 1000) return null;
      return o;
    } catch (e) { return null; }
  }

  var sess = readSession();
  if (sess) {
    var who = sess.subjectName || (sess.mode === 'unknown' ? '未确认的对象' : '临时连接');
    var rel = sess.relation || '暂不确定';
    linkState.classList.add('is-live');
    linkText.textContent = '已连接 · ' + who + ' · ' + rel;
    startRitual.setAttribute('href', 'reading.html?step=spread');
    startRitual.lastChild.textContent = '继续这次探索';
  }

  /* ---------- 继续上次探索 ---------- */
  var resumeItem = $('#resumeItem');
  var resumeText = $('#resumeText');
  var last = null;
  try {
    var rawLast = localStorage.getItem('DA_LAST_READING');
    if (rawLast) last = JSON.parse(rawLast);
  } catch (e) {}

  if (last && last.cards && last.cards.length) {
    resumeItem.classList.remove('is-idle');
    resumeItem.setAttribute('href', 'reading.html?step=board&resume=1');
    resumeText.textContent = '继续：' + (last.spreadCn || '上次的牌阵') +
      ' · ' + (last.dateCn || '');
  }

  /* ---------- 未开放入口 ---------- */
  [['#archiveBtn', '我的观测档案'], ['#historyItem', '历史记录'], ['#favItem', '收藏夹'],
   ['#relayMode', '实时传讯']].forEach(function (pair) {
    var el = $(pair[0]);
    if (!el) return;
    el.addEventListener('click', function (e) {
      e.preventDefault();
      toast(pair[1] + '将在第二阶段开放。第一阶段的连接仪式、牌阵与抽牌已经可以完整体验。');
    });
  });

  /* ---------- 页面切换音 ---------- */
  document.querySelectorAll('a.mode, a.minor__item:not(.is-idle), #startRitual').forEach(function (a) {
    a.addEventListener('click', function () { S.page(); });
  });

})();
