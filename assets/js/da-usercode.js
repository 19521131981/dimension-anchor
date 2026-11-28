/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 专属编码 / 扫码付款 / 云端统一发放 DA_USERCODE
   ----------------------------------------------------------------------
   用户在通行证下获得一个 6 位专属编码（DA-XXXXXX）。
   付款时备注「编码 + 次数」，管理端每天批量发放；
   用户回到网站点「同步到账」，云端按人核对后计入本机次数。
   不伪造登录态；未登录只读取收款配置，不读取个人到账记录。
   ══════════════════════════════════════════════════════════════════════ */
window.DA_USERCODE = (function () {
  'use strict';

  var cached = '';
  var DEFAULT_WECHAT = 'liangyefei12345678';

  function cfg() { return window.DA_CLOUD_CONFIG || {}; }

  function client() {
    if (window.DA_PREMIUM && typeof window.DA_PREMIUM.client === 'function') {
      var c = window.DA_PREMIUM.client();
      if (c) return c;
    }
    if (window.DA_AUTH && typeof window.DA_AUTH.client === 'function') {
      var a = window.DA_AUTH.client();
      if (a) return a;
    }
    if (window.WorkBuddyCloud && cfg().endpoint && cfg().publishableKey) {
      try {
        return window.WorkBuddyCloud.createWorkBuddyCloud({
          endpoint: cfg().endpoint,
          oauthRelayBaseUrl: cfg().oauthRelayBaseUrl || '',
          publishableKey: cfg().publishableKey
        });
      } catch (e) { return null; }
    }
    return null;
  }

  function fail(code, detail) {
    var e = new Error(code);
    e.code = code;
    if (detail) e.detail = detail;
    return e;
  }

  function ready() {
    var c = client();
    if (!c) return Promise.reject(fail('CLOUD_UNAVAILABLE'));
    if (window.DA_PREMIUM && typeof window.DA_PREMIUM.ready === 'function') {
      return window.DA_PREMIUM.ready().then(function () { return c; });
    }
    if (window.DA_AUTH && typeof window.DA_AUTH.init === 'function') {
      return window.DA_AUTH.init().then(function () { return c; });
    }
    return Promise.resolve(c);
  }

  function rpc(name, args) {
    return ready().then(function (c) {
      return c.database.rpc(name, args || {});
    }).then(function (r) {
      if (r && r.error) {
        var e = fail('SERVER_' + (r.error.code || 'ERROR'), r.error.message);
        throw e;
      }
      return r && r.data;
    });
  }

  function signedIn() {
    return !!(window.DA_AUTH && typeof window.DA_AUTH.uid === 'function' && window.DA_AUTH.uid());
  }

  function ensureSignIn() {
    if (signedIn()) return Promise.resolve(true);
    if (!window.DA_AUTH || typeof window.DA_AUTH.open !== 'function') {
      return Promise.reject(fail('SIGN_IN_REQUIRED'));
    }
    window.DA_AUTH.open();
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        document.removeEventListener('da:authchange', onChange);
        reject(fail('SIGN_IN_REQUIRED'));
      }, 300000);
      function onChange(ev) {
        if (done) return;
        if (ev && ev.detail && ev.detail.signedIn && signedIn()) {
          done = true;
          clearTimeout(timer);
          document.removeEventListener('da:authchange', onChange);
          resolve(true);
        }
      }
      document.addEventListener('da:authchange', onChange);
    });
  }

  /* 读取当前账号的 6 位编码；不存在则由服务端生成 */
  function myCode() {
    return rpc('da_my_code').then(function (code) {
      if (code) cached = String(code).toUpperCase();
      return cached;
    });
  }

  function ensureCode() { return ensureSignIn().then(myCode); }

  function pretty(code) {
    var c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length === 8 && c.slice(0, 2) === 'DA') c = c.slice(2);
    c = c.slice(0, 6);
    return c ? ('DA-' + c) : '';
  }

  function note(code, uses) {
    var n = Math.max(1, Number(uses) || 9);
    var c = pretty(code);
    return (c || 'DA-XXXXXX') + ' + ' + n + '次';
  }

  function payConfig() {
    return rpc('da_pay_config_get').then(function (d) {
      return {
        wechat: (d && d.wechat) || DEFAULT_WECHAT,
        qr: (d && d.qr) || ''
      };
    }).catch(function () {
      return { wechat: DEFAULT_WECHAT, qr: '' };
    });
  }

  function grants() {
    return rpc('da_my_grants').then(function (d) { return Array.isArray(d) ? d : []; });
  }

  function claim(id) {
    return rpc('da_claim_grant', { p_id: Number(id) }).then(function (n) { return Math.max(0, Number(n) || 0); });
  }

  /* 领取全部尚未领取的发放记录，写入本机权益。
     同一条发放记录本机只记一次；清掉本机数据后可凭同一账号重新对齐。 */
  function claimAll() {
    if (!signedIn()) return Promise.resolve({ added: 0, count: 0, reason: 'SIGN_IN_REQUIRED' });
    return grants().then(function (list) {
      if (!list.length) return { added: 0, count: 0 };
      var added = 0;
      var chain = Promise.resolve();
      list.forEach(function (g) {
        chain = chain.then(function () {
          return claim(g.id).then(function (n) {
            if (!n || !window.DA_ACCESS || typeof window.DA_ACCESS.grant !== 'function') return;
            var r = window.DA_ACCESS.grant(n, g.id);
            if (r && r.ok) added += n;
          });
        });
      });
      return chain.then(function () { return { added: added, count: list.length }; });
    });
  }

  function adminGrant(lines, batch) {
    return rpc('da_admin_code_grants', { p_lines: String(lines || ''), p_batch: String(batch || '') });
  }
  function adminStats() { return rpc('da_admin_grant_stats'); }
  function adminSetPayConfig(qr, wechat) {
    return rpc('da_admin_pay_config_set', {
      p_qr: String(qr || ''),
      p_wechat: String(wechat || '')
    });
  }

  function message(e) {
    var c = (e && e.code) || '';
    var map = {
      SIGN_IN_REQUIRED: '请先点亮星际通行证，专属编码和到账都绑定账号。',
      CLOUD_UNAVAILABLE: '云端暂时没连上，稍后再试。',
      ADMIN_REQUIRED: '当前账号没有管理权限。'
    };
    if (map[c]) return map[c];
    if (/^SERVER_/.test(c)) return '云端暂时没有回应，稍后再试。';
    return '出了点问题，再试一次。';
  }

  return {
    client: client, ready: ready, signedIn: signedIn, ensureSignIn: ensureSignIn,
    myCode: myCode, ensureCode: ensureCode, code: function () { return cached; },
    pretty: pretty, note: note, payConfig: payConfig,
    grants: grants, claim: claim, claimAll: claimAll,
    adminGrant: adminGrant, adminStats: adminStats, adminSetPayConfig: adminSetPayConfig,
    message: message
  };
})();
