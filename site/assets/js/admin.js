/* DIMENSION ANCHOR — 占卜码管理端
   权限完全由云端数据库判定；本地只是渲染与发起请求。 */
(function () {
  'use strict';

  var P = window.DA_PREMIUM;
  var A = window.DA_AUTH;
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function msg(el, text, kind) {
    el.textContent = text || '';
    el.className = 'pm-msg' + (kind ? ' is-' + kind : '');
  }
  function fmt(v) {
    if (!v) return '—';
    var d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0');
  }
  function reasonText(r) {
    var m = {
      ok: '兑换成功', invalid: '码不存在', expired: '已过期', used: '次数用尽',
      disabled: '已停用', SIGN_IN_REQUIRED: '未登录'
    };
    return m[r] || r || '—';
  }

  function showConsole(on) {
    $('console').hidden = !on;
    $('claimCard').hidden = on;
    $('signCard').hidden = on;
    if (on) { loadCodes(); loadRedemptions(); }
  }

  function loadCodes() {
    P.adminList().then(function (r) {
      if (!r || !r.ok) { msg($('listMsg'), P.message({ code: (r && r.reason) || 'SERVER_ERROR' }), 'err'); return; }
      var rows = r.codes || [];
      $('codeRows').innerHTML = rows.length ? rows.map(function (c) {
        var expired = c.expires_at && new Date(c.expires_at).getTime() < Date.now();
        var state = c.disabled ? '已停用' : (expired ? '已过期' : (c.used_count >= c.max_uses ? '次数用尽' : '可用'));
        return '<tr class="' + (c.disabled ? 'is-off' : '') + '">' +
          '<td><b>' + esc(c.hint) + '</b></td>' +
          '<td>' + esc(c.batch_id) + (c.label ? '<br>' + esc(c.label) : '') + '</td>' +
          '<td>' + fmt(c.expires_at) + '</td>' +
          '<td>' + esc(c.used_count) + ' / ' + esc(c.max_uses) + '</td>' +
          '<td>' + esc(state) + '</td>' +
          '<td><button class="pm-btn pm-btn--sm" type="button" data-toggle="' + esc(c.id) + '" data-to="' + (c.disabled ? '0' : '1') + '">' +
          (c.disabled ? '启用' : '停用') + '</button></td></tr>';
      }).join('') : '<tr><td colspan="6">还没有生成过占卜码。</td></tr>';
      msg($('listMsg'), '共 ' + rows.length + ' 张。', 'ok');
    }).catch(function (e) { msg($('listMsg'), P.message(e), 'err'); });
  }

  function loadRedemptions() {
    P.adminRedemptions().then(function (r) {
      if (!r || !r.ok) { msg($('redeemMsg'), P.message({ code: (r && r.reason) || 'SERVER_ERROR' }), 'err'); return; }
      var rows = r.rows || [];
      $('redeemRows').innerHTML = rows.length ? rows.map(function (x) {
        return '<tr><td>' + fmt(x.at) + '</td><td>' + esc(x.code_hint) + '</td><td>' +
          esc(x.owner) + '</td><td>' + esc(reasonText(x.result)) + '</td></tr>';
      }).join('') : '<tr><td colspan="4">暂时没有兑换记录。</td></tr>';
      msg($('redeemMsg'), '最近 ' + rows.length + ' 条。', 'ok');
    }).catch(function (e) { msg($('redeemMsg'), P.message(e), 'err'); });
  }

  function check() {
    return P.adminStatus().then(function (isAdmin) {
      if (isAdmin) { showConsole(true); return; }
      $('signCard').hidden = true;
      $('claimCard').hidden = false;
      msg($('claimMsg'), '这个账号还没有管理权限，输入一次性密钥即可认领。');
    }).catch(function (e) {
      $('signCard').hidden = false;
      $('claimCard').hidden = false;
      msg($('claimMsg'), P.message(e), 'err');
    });
  }

  function boot() {
    if (!P || !A) { msg($('signMsg'), '云服务没连上，刷新页面再试。', 'err'); return; }
    A.init().then(function (s) {
      if (s && s.user && s.user.id) {
        msg($('signMsg'), '已登录：' + (A.name() || '通行证'), 'ok');
        check();
      } else {
        msg($('signMsg'), '还没有登录。点下面的按钮，登录后会在这里继续。');
      }
    }).catch(function () {
      msg($('signMsg'), '暂时读不到登录状态，可以点按钮重试。', 'err');
    });
  }

  function bind() {
    $('signBtn').addEventListener('click', function () {
      A.open();
      document.addEventListener('da:authchange', function once(ev) {
        if (ev && ev.detail && ev.detail.signedIn) {
          document.removeEventListener('da:authchange', once);
          msg($('signMsg'), '已登录：' + (A.name() || '通行证'), 'ok');
          check();
        }
      });
    });

    $('claimBtn').addEventListener('click', function () {
      var b = this, m = $('claimMsg');
      b.disabled = true;
      msg(m, '正在向服务端认领…');
      P.adminClaim($('adminSecret').value).then(function (r) {
        if (r && r.ok) { msg(m, '认领成功，管理身份已绑定。', 'ok'); showConsole(true); }
        else { msg(m, P.message({ code: (r && r.reason) || 'INVALID_SECRET' }), 'err'); }
      }).catch(function (e) { msg(m, P.message(e), 'err'); })
        .then(function () { b.disabled = false; });
    });
    $('adminSecret').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('claimBtn').click(); }
    });

    $('genBtn').addEventListener('click', function () {
      var b = this, m = $('genMsg');
      b.disabled = true;
      msg(m, '正在生成…');
      P.adminGenerate({
        count: $('genCount').value, days: $('genDays').value,
        uses: $('genUses').value, label: $('genLabel').value
      }).then(function (r) {
        if (!r || !r.ok) { msg(m, P.message({ code: (r && r.reason) || 'SERVER_ERROR' }), 'err'); return; }
        var list = (r.codes || []).map(function (c) { return c.code; });
        $('genCodes').hidden = false;
        $('genCodes').innerHTML = '<p>批次 <b>' + esc(r.batch_id) + '</b> · ' + esc(list.length) +
          ' 张<br><span style="white-space:nowrap">有效期至 ' + esc(fmt(r.expires_at)) + '</span><br>' +
          '请现在复制保存，关闭页面后不再显示明文：</p>' +
          list.map(function (c) { return '<div><code>' + esc(c) + '</code></div>'; }).join('');
        msg(m, '生成成功。明文只在这里显示一次。', 'ok');
        loadCodes();
      }).catch(function (e) { msg(m, P.message(e), 'err'); })
        .then(function () { b.disabled = false; });
    });

    $('reloadBtn').addEventListener('click', function () { loadCodes(); loadRedemptions(); });

    $('codeRows').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-toggle]') : null;
      if (!b) return;
      var to = b.getAttribute('data-to') === '1';
      b.disabled = true;
      P.adminDisable(b.getAttribute('data-toggle'), to).then(function (r) {
        if (!r || !r.ok) msg($('listMsg'), P.message({ code: (r && r.reason) || 'SERVER_ERROR' }), 'err');
        else loadCodes();
      }).catch(function (e) { msg($('listMsg'), P.message(e), 'err'); });
    });
  }

  bind();
  boot();
})();
