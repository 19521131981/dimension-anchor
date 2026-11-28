/* DIMENSION ANCHOR — 占卜码管理端
   权限完全由云端数据库判定；本地只是渲染与发起请求。 */
(function () {
  'use strict';

  var P = window.DA_PREMIUM;
  var A = window.DA_AUTH;
  var U = window.DA_USERCODE;
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
      disabled: '已停用', SIGN_IN_REQUIRED: '未登录', ADMIN_REQUIRED: '当前账号没有管理权限'
    };
    if (m[r]) return m[r];
    if (r && window.DAErrorText) return window.DAErrorText(String(r));
    return r ? '状态异常，稍后再试。' : '—';
  }

  function showConsole(on) {
    $('console').hidden = !on;
    $('claimCard').hidden = on;
    $('signCard').hidden = on;
    if (on) { loadStats(); loadCodes(); loadRedemptions(); loadGrants(); loadPayCfg(); }
  }

  /* 运营概览：只读聚合，服务端只认管理员；失败不阻塞其它管理功能。 */
  function loadStats() {
    if (!P.adminStats) return;
    P.adminStats().then(function (r) {
      if (!r || !r.ok) { msg($('statsMsg'), P.message({ code: (r && r.reason) || 'SERVER_ERROR' }), 'err'); return; }
      var set = function (id, v) { var el = $(id); if (el) el.textContent = (v == null ? '—' : String(v)); };
      set('stUsers', r.users_cloud);
      set('stPremium', r.users_premium);
      set('stLetters', r.letters_total);
      set('stLettersToday', r.letters_today);
      set('stCodes', r.codes_total);
      set('stRedeem', r.redeem_ok);
      set('stAsk', r.ask_consumed);
      set('stAskToday', r.ask_today);
      msg($('statsMsg'), '数据读取于 ' + fmt(r.generated_at), 'ok');
    }).catch(function (e) { msg($('statsMsg'), P.message(e), 'err'); });
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

  /* ── 专属编码：每日统一发放与收款配置 ───────────────────────── */
  function loadGrants() {
    if (!U || !U.adminStats) return;
    U.adminStats().then(function (rows) {
      rows = Array.isArray(rows) ? rows : [];
      $('grantRows').innerHTML = rows.length ? rows.map(function (g) {
        return '<tr><td>' + esc(g.id) + '</td><td><b>' + esc(g.code_mask) + '</b></td>' +
          '<td>' + esc(g.uses) + '</td><td>' + esc(g.batch || '—') + '</td>' +
          '<td>' + esc(g.claimed) + '</td><td>' + fmt(g.created_at) + '</td>' +
          '<td>' + esc(g.note || '—') + '</td></tr>';
      }).join('') : '<tr><td colspan="7">还没有发放记录。</td></tr>';
    }).catch(function (e) { msg($('grantMsg'), U.message(e), 'err'); });
  }

  function doGrant() {
    if (!U || !U.adminGrant) return;
    var b = $('grantBtn'); b.disabled = true;
    msg($('grantMsg'), '正在发放…');
    U.adminGrant($('grantLines').value, $('grantBatch').value).then(function (r) {
      if (!r || !r.ok) { msg($('grantMsg'), U.message({ code: (r && r.reason) || 'SERVER_ERROR' }), 'err'); return; }
      var tips = [];
      if (r.unknown && r.unknown.length) tips.push('未找到编码：' + r.unknown.join('、'));
      if (r.invalid && r.invalid.length) tips.push('格式不对：' + r.invalid.join('、'));
      if (r.repeated && r.repeated.length) tips.push('请留意重复：' + r.repeated.join('；'));
      msg($('grantMsg'), '已发放 ' + r.granted + ' 条 / 共 ' + r.lines + ' 行。' + tips.join('；'), tips.length ? 'err' : 'ok');
      if (r.granted > 0) { $('grantLines').value = ''; loadGrants(); }
    }).catch(function (e) { msg($('grantMsg'), U.message(e), 'err'); })
      .then(function () { b.disabled = false; });
  }

  function readQr(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { resolve(''); return; }
      if (file.size > 8 * 1024 * 1024) { reject(new Error('图片太大，请换一张小一点的二维码')); return; }
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('图片读取失败')); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('图片读取失败')); };
        img.onload = function () {
          var max = 600, scale = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * scale));
          c.height = Math.max(1, Math.round(img.height * scale));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.82));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  var currentQr = '';
  function showQr(data) {
    $('qrPreview').innerHTML = data
      ? '<img src="' + data + '" alt="收款二维码" style="width:152px;height:152px;object-fit:contain;background:#fff;border:1px solid #CBB08A;border-radius:8px">'
      : '<span style="display:inline-block;padding:10px 12px;font-size:13px;color:#8A6FB0;border:1px dashed #CBB08A;border-radius:8px">当前没有配置二维码，用户端只显示微信号。</span>';
  }
  function loadPayCfg() {
    if (!U || !U.payConfig) return;
    U.payConfig().then(function (c) {
      currentQr = c.qr || '';
      $('payWechat').value = c.wechat || 'liangyefei12345678';
      showQr(currentQr);
    }).catch(function () {});
  }
  function savePayCfg() {
    if (!U || !U.adminSetPayConfig) return;
    var b = $('payCfgBtn'); b.disabled = true;
    msg($('payCfgMsg'), '正在保存…');
    readQr($('qrFile').files && $('qrFile').files[0]).then(function (qr) {
      var next = qr || currentQr;
      if (!next) throw new Error('请选择一张二维码图片');
      return U.adminSetPayConfig(next, $('payWechat').value).then(function (r) {
        if (!r || !r.ok) { msg($('payCfgMsg'), U.message({ code: (r && r.reason) || 'SERVER_ERROR' }), 'err'); return; }
        currentQr = next;
        showQr(next);
        if ($('qrFile')) $('qrFile').value = '';
        msg($('payCfgMsg'), '已保存，用户端弹窗会显示这张二维码。', 'ok');
      });
    }).catch(function (e) {
      msg($('payCfgMsg'), e && e.message ? e.message : U.message(e), 'err');
    }).then(function () { b.disabled = false; });
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
    /* 单例监听：每次登录只保留一个 handler，避免反复点开弹窗累积监听器
       导致 check() 被多次触发、列表重复请求。 */
    var authHandler = null;
    $('signBtn').addEventListener('click', function () {
      A.open();
      if (authHandler) document.removeEventListener('da:authchange', authHandler);
      authHandler = function (ev) {
        if (ev && ev.detail && ev.detail.signedIn) {
          document.removeEventListener('da:authchange', authHandler);
          authHandler = null;
          msg($('signMsg'), '已登录：' + (A.name() || '通行证'), 'ok');
          check();
        }
      };
      document.addEventListener('da:authchange', authHandler);
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

    $('reloadBtn').addEventListener('click', function () { loadStats(); loadCodes(); loadRedemptions(); loadGrants(); });
    if ($('grantBtn')) $('grantBtn').addEventListener('click', doGrant);
    if ($('payCfgBtn')) $('payCfgBtn').addEventListener('click', savePayCfg);

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
