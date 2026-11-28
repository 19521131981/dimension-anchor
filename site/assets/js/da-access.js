/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 深度探索权益（本地可落地版）
   ----------------------------------------------------------------------
   规则（20261128）：
   · 每位访客免费完整体验 2 次（含深度解读），第 3 次起需占卜码。
   · 占卜码见 da-codes.js（只存哈希）；兑换后把对应次数计入本机额度。
   · 一个码只能兑换一次；次数用尽需再兑换。
   · 寄信完全免费；收到一封来信消耗 2 次（consumeBatch/refundBatch/settleBatch）。
   数据只存在本机浏览器 localStorage，不上传、不冒充云端账号权益。
   ══════════════════════════════════════════════════════════════════════ */
window.DA_ACCESS = (function () {
  'use strict';

  var KEY = 'DA_ACCESS';
  var FREE_TIMES = 2;

  function blank() {
    return { freeLeft: FREE_TIMES, paidLeft: 0, used: [], pending: null, batch: null, grants: [], updatedAt: 0 };
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      var s = JSON.parse(raw);
      if (!s || typeof s !== 'object') return blank();
      s.freeLeft = Math.max(0, Number(s.freeLeft) || 0);
      s.paidLeft = Math.max(0, Number(s.paidLeft) || 0);
      s.used = Array.isArray(s.used) ? s.used : [];
      s.pending = (s.pending === 'free' || s.pending === 'paid') ? s.pending : null;
      /* batch：批量扣费明细（如收信一次扣 2 次），{free:n, paid:n} */
      var b = s.batch;
      s.batch = (b && typeof b === 'object' && (b.free || b.paid)) ? { free: b.free || 0, paid: b.paid || 0 } : null;
      /* grants：云端统一下发记录的本机去重表，一条发放只计一次 */
      s.grants = Array.isArray(s.grants) ? s.grants : [];
      return s;
    } catch (e) { return blank(); }
  }
  function save(s) {
    s.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    return s;
  }

  function status() {
    var s = load();
    return {
      freeLeft: s.freeLeft,
      paidLeft: s.paidLeft,
      left: s.freeLeft + s.paidLeft,
      total: s.freeLeft + s.paidLeft,
      active: (s.freeLeft + s.paidLeft) > 0,
      tier: s.paidLeft > 0 ? 'code' : (s.freeLeft > 0 ? 'free' : 'none')
    };
  }

  /* 兑换占卜码：查哈希库，重复码拒绝 */
  function redeem(input) {
    var code = String(input || '').trim().toUpperCase();
    if (!code) return { ok: false, reason: 'EMPTY_CODE' };
    var C = window.DA_CODES;
    if (!C || typeof C.usesOf !== 'function') return { ok: false, reason: 'CLOSED' };
    var uses = C.usesOf(code);
    if (!uses) return { ok: false, reason: 'INVALID' };
    var h = C.hash(code);
    var s = load();
    if (s.used.indexOf(h) >= 0) return { ok: false, reason: 'USED_CODE' };
    s.used.push(h);
    s.paidLeft += uses;
    save(s);
    return { ok: true, uses: uses, left: s.freeLeft + s.paidLeft };
  }

  /* 消耗一次深度权益：先用免费次数，再用兑换次数。
     pending 只登记「本次尚未确认成功」的消耗，供联网失败时精确退回；
     一旦成功必须 settle() 确认，避免以后误退。 */
  function consume() {
    var s = load();
    var kind = null;
    if (s.freeLeft > 0) { s.freeLeft -= 1; kind = 'free'; }
    else if (s.paidLeft > 0) { s.paidLeft -= 1; kind = 'paid'; }
    else return { ok: false, reason: 'NO_QUOTA' };
    s.pending = kind;
    save(s);
    return { ok: true, left: s.freeLeft + s.paidLeft, kind: kind };
  }

  /* 退回本次占用（联网失败时用），退完即清，不会重复退 */
  function refund() {
    var s = load();
    var kind = s.pending;
    if (!kind) return false;
    if (kind === 'free') s.freeLeft += 1;
    else if (kind === 'paid') s.paidLeft += 1;
    s.pending = null;
    save(s);
    return true;
  }

  /* 确认本次消耗成功，清除可退回标记 */
  function settle() {
    var s = load();
    if (!s.pending) return false;
    s.pending = null;
    save(s);
    return true;
  }

  /* 云端统一下发到账：发放记录 id 在本机去重，同一条只加一次 */
  function grant(uses, grantId) {
    var n = Math.max(0, Number(uses) || 0);
    if (!n) return { ok: false, reason: 'EMPTY_GRANT', left: status().left };
    var s = load();
    s.grants = Array.isArray(s.grants) ? s.grants : [];
    var id = (grantId === null || grantId === undefined) ? '' : String(grantId);
    if (id && s.grants.indexOf(id) >= 0) return { ok: false, reason: 'ALREADY', left: s.freeLeft + s.paidLeft };
    s.paidLeft += n;
    if (id) s.grants.push(id);
    save(s);
    return { ok: true, uses: n, left: s.freeLeft + s.paidLeft };
  }

  /* 只读检查：还有没有次数 */
  function canUse() { return status().left > 0; }

  /* ── 批量扣费：一次操作消耗 n 次（如收到一封信消耗 2 次）─────────
     与单次 consume/pending 完全隔离：用独立 batch 字段记录本次扣的
     免费/兑换明细，失败时可按明细原样退回，成功时 settleBatch 确认。
     余额不足则一次都不扣。 */
  function canUseN(n) { return status().left >= Math.max(1, Number(n) || 1); }
  function consumeBatch(n) {
    n = Math.max(1, Number(n) || 1);
    var s = load();
    if (s.freeLeft + s.paidLeft < n) return { ok: false, reason: 'NO_QUOTA' };
    var takeFree = Math.min(s.freeLeft, n);
    var takePaid = n - takeFree;
    s.freeLeft -= takeFree;
    s.paidLeft -= takePaid;
    s.batch = { free: takeFree, paid: takePaid };
    save(s);
    return { ok: true, left: s.freeLeft + s.paidLeft, free: takeFree, paid: takePaid };
  }
  function refundBatch() {
    var s = load();
    var b = s.batch;
    if (!b) return false;
    s.freeLeft += b.free || 0;
    s.paidLeft += b.paid || 0;
    s.batch = null;
    save(s);
    return true;
  }
  function settleBatch() {
    var s = load();
    if (!s.batch) return false;
    s.batch = null;
    save(s);
    return true;
  }

  function message(r) {
    var map = {
      EMPTY_CODE: '请先输入占卜码。',
      INVALID: '这个占卜码不存在，检查一下有没有输错。',
      USED_CODE: '这个占卜码已经兑换过了。',
      CLOSED: '校验库没能加载，请刷新页面再试。',
      NO_QUOTA: '深度次数已经用完，输入占卜码后可以继续。'
    };
    return (r && map[r.reason]) || '出了点问题，再试一次。';
  }

  /* 仅供管理/排障：重置本机权益 */
  function reset() { save(blank()); return status(); }

  return {
    status: status, canUse: canUse, canUseN: canUseN, redeem: redeem, grant: grant,
    consume: consume, refund: refund, settle: settle,
    consumeBatch: consumeBatch, refundBatch: refundBatch, settleBatch: settleBatch,
    message: message, reset: reset, FREE_TIMES: FREE_TIMES
  };
})();
