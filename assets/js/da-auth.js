/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 星际通行证 DA_AUTH
   ----------------------------------------------------------------------
   验证码登录（无需密码）：sendOtp → verifyOtp → 会话
   · 邮箱分支：sendCode → verifyCode
   · 手机号分支：sendPhoneCode → verifyPhoneCode
   会话由 SDK 持久化；登录后信件归到 user_id，可在任意设备读到同一份历史。

   防「卡在同一段流程里」的四条铁律：
   ① 没有注册步骤。sendOtp 的 isExistingUser 只是内部参数，verifyOtp 一次完成
      注册或登录；界面上不出现「先注册 / 再登录」两段。
   ② 登录成功不刷新页面，改为状态广播（DA_MAIL.onAuth + da:authchange 事件），
      页面就地重取数据；用户不会被弹回起始页再走一遍。
   ③ 已发送的挑战存进 sessionStorage：误关弹窗、刷新、切页回来都直接回到
      「输验证码」，不用重填号码、不用重发一条短信。
   ④ 重发与提交是两个独立动作；输错码只重新提交，并保留已输入的位数。

   规则（与云端一致）：
   · 只在这一层初始化 cloud 客户端，DA_MAIL 复用它，不重复初始化。
   · 不伪造登录态：没有真实 session 就显示未登录。
   · 不把 token / 手机号 / 邮箱写进日志。
   ══════════════════════════════════════════════════════════════════════ */

window.DA_AUTH = (function () {
  'use strict';

  var cfg = window.DA_CLOUD_CONFIG || {};
  var cloud = null, session = null, pending = null, ready = false, inflight = false, _initP = null;
  var subs = [], countdown = 0, cdTimer = null;
  var PENDING_KEY = 'DA2_PENDING_OTP';

  function client() {
    if (cloud) return cloud;
    if (!window.WorkBuddyCloud || !cfg.endpoint || !cfg.publishableKey) return null;
    try {
      cloud = window.WorkBuddyCloud.createWorkBuddyCloud({
        endpoint: cfg.endpoint,
        oauthRelayBaseUrl: cfg.oauthRelayBaseUrl || '',
        publishableKey: cfg.publishableKey
      });
    } catch (e) { cloud = null; }
    return cloud;
  }

  function u0() { return (session && session.user) || {}; }
  function uid() { return u0().id || ''; }
  function email() { return u0().email || ''; }
  function phone() { return u0().phone || u0().phoneNumber || ''; }
  function maskPhone(p) {
    var d = String(p || '').replace(/\D/g, '');
    if (d.length < 7) return d;
    return d.slice(0, 3) + '****' + d.slice(-4);
  }
  function name() {
    var u = u0();
    if (u.name) return u.name;
    if (u.email) return String(u.email).split('@')[0];
    if (u.phone || u.phoneNumber) return maskPhone(u.phone || u.phoneNumber);
    return '';
  }

  /* ── 未完成的挑战：跨刷新保留 ─────────────────────────────── */
  function savePending(p) {
    pending = p;
    try {
      if (p) sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
      else sessionStorage.removeItem(PENDING_KEY);
    } catch (e) {}
  }
  function loadPending() {
    if (pending) return pending;
    try {
      var raw = sessionStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (!p || !p.verificationId || !p.channel) return null;
      if (Date.now() - (p.at || 0) > 30 * 60 * 1000) { savePending(null); return null; }
      pending = p;
      return p;
    } catch (e) { return null; }
  }
  function pendTo(p) { return p ? (p.channel === 'phone' ? p.phone : p.email) : ''; }

  /* ── 倒计时只作用于「重发」 ───────────────────────────────── */
  function startCountdown(sec) {
    countdown = sec; stopTick();
    cdTimer = setInterval(function () {
      countdown--;
      if (countdown <= 0) { stopTick(); countdown = 0; }
      paintResend();
    }, 1000);
    paintResend();
  }
  function stopTick() { if (cdTimer) { clearInterval(cdTimer); cdTimer = null; } }
  function stopCountdown() { stopTick(); countdown = 0; paintResend(); }

  function notify() {
    subs.forEach(function (fn) { try { fn(session); } catch (e) {} });
    try { document.dispatchEvent(new CustomEvent('da:authchange', { detail: { signedIn: !!uid() } })); } catch (e) {}
    paintChip();
  }

  function init() {
    if (ready) return Promise.resolve(session);
    if (_initP) return _initP;          /* 并发调用只查一次会话 */
    var c = client();
    if (!c) { ready = true; paintChip(); return Promise.resolve(null); }
    _initP = c.auth.getSession().then(function (r) {
      session = (r && r.data) || null;
      ready = true;
      try {
        c.auth.onAuthStateChange(function (ev, s) {
          if (ev === 'SIGNED_OUT') session = null;
          else if (s) session = s;
          notify();
        });
      } catch (e) {}
      paintChip();
      notify();
      return session;
    }).catch(function () { ready = true; paintChip(); return null; });
    return _initP;
  }

  /* SDK / 短信网关的英文错误 → 用户能读懂的一句话 */
  function friendly(msg) {
    var s = String(msg || '');
    if (/LimitExceeded|every day exceeds|daily limit/i.test(s)) return '这个号码今天的验证码条数用完了，换个号码，或明天再试';
    if (/too many|rate.?limit|frequen/i.test(s)) return '发得太频繁了，等一分钟再试';
    if (/过期|expired|expire/i.test(s)) return '验证码已过期，点「重发验证码」';
    if (/invalid|incorrect|mismatch|wrong/i.test(s)) return '验证码不正确，再核对一下';
    if (/未打开|not enabled|disabled|not open/i.test(s)) return '这个站点的该登录方式还没开通，可以先用另一种方式进入';
    if (/network|fetch|Failed to fetch|timeout/i.test(s)) return '网络没连上，检查一下再试';
    return s || '出了点问题，再试一次';
  }

  /* ── 发送验证码 ───────────────────────────────────────────── */
  function sendCode(mail) {
    var c = client();
    if (!c) return Promise.reject(new Error('云服务未配置，暂时无法登录'));
    if (inflight) return Promise.reject(new Error('正在发送，请稍候'));
    inflight = true;
    return c.auth.sendOtp({ email: mail }).then(function (r) {
      inflight = false;
      if (r && r.error) throw new Error(r.error.message || '验证码发送失败');
      var d = (r && r.data) || {};
      savePending({
        channel: 'email', email: mail,
        verificationId: d.verificationId, isExistingUser: d.isExistingUser, at: Date.now()
      });
      startCountdown(60);
      return pending;
    }).catch(function (e) { inflight = false; throw e; });
  }

  function verifyCode(token) {
    var c = client();
    if (!c) return Promise.reject(new Error('云服务未配置，暂时无法登录'));
    var p = pending || loadPending();
    if (!p || p.channel !== 'email') return Promise.reject(new Error('请先获取验证码'));
    return finish(c, { email: p.email, verificationId: p.verificationId, isExistingUser: !!p.isExistingUser, token: token });
  }

  /* ── 手机号分支（复用同一 client / pending / session / notify）───── */
  function sendPhoneCode(tel) {
    var c = client();
    if (!c) return Promise.reject(new Error('云服务未配置，暂时无法登录'));
    if (inflight) return Promise.reject(new Error('正在发送，请稍候'));
    inflight = true;
    return c.auth.sendOtp({ phone: tel }).then(function (r) {
      inflight = false;
      if (r && r.error) throw new Error(r.error.message || '验证码发送失败');
      var d = (r && r.data) || {};
      savePending({
        channel: 'phone', phone: tel,
        verificationId: d.verificationId, isExistingUser: d.isExistingUser, at: Date.now()
      });
      startCountdown(60);
      return pending;
    }).catch(function (e) { inflight = false; throw e; });
  }

  function verifyPhoneCode(token) {
    var c = client();
    if (!c) return Promise.reject(new Error('云服务未配置，暂时无法登录'));
    var p = pending || loadPending();
    if (!p || p.channel !== 'phone') return Promise.reject(new Error('请先获取验证码'));
    return finish(c, { phone: p.phone, verificationId: p.verificationId, isExistingUser: !!p.isExistingUser, token: token });
  }

  /* 提交只用保存下来的挑战：绝不在这里重发，也就不会「再走一遍」 */
  function finish(c, args) {
    if (inflight) return Promise.reject(new Error('正在验证，请稍候'));
    var code = String(args.token || '').replace(/\D/g, '');
    if (code.length < 4) return Promise.reject(new Error('验证码看起来不完整'));
    args.token = code;
    inflight = true;
    return c.auth.verifyOtp(args).then(function (r) {
      inflight = false;
      if (r && r.error) {
        var e = new Error(r.error.message || '验证码不正确或已过期');
        e.expired = /过期|expired|expire/i.test(e.message);
        throw e;
      }
      session = (r && r.data) || null;
      savePending(null);
      if (!session) throw new Error('登录没有完成，请再试一次');
      stopCountdown();
      notify();
      return session;
    }).catch(function (e) { inflight = false; throw e; });
  }

  /* 重发：只重发当前通道、当前收件人 */
  function resend() {
    var p = pending || loadPending();
    if (!p) return Promise.reject(new Error('请先填写手机号或邮箱'));
    return p.channel === 'phone' ? sendPhoneCode(p.phone) : sendCode(p.email);
  }

  function signOut() {
    var c = client();
    if (!c) return Promise.resolve();
    return c.auth.signOut().then(function () {
      session = null; savePending(null); stopCountdown(); notify();
    }).catch(function (e) { throw new Error(e.message || '退出失败'); });
  }

  /* ══ 界面：导航胶囊 + 弹窗 ═══════════════════════════════════ */
  var els = null;

  function build() {
    if (els) return els;
    var wrap = document.createElement('div');
    wrap.className = 'dialog auth-dlg';
    wrap.id = 'authDlg';
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="overlay__scrim" data-auth-close></div>' +
      '<div class="dialog__box" role="dialog" aria-modal="true" aria-labelledby="authTitle">' +
      '<button class="dialog__x" type="button" data-auth-close aria-label="关闭">' +
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg></button>' +
      '<p class="dialog__step">STELLAR PASSPORT</p>' +
      '<h2 class="dialog__title" id="authTitle">星际通行证</h2>' +
      '<div id="authBody"></div>' +
      '<div class="dialog__foot" id="authFoot"></div>' +
      '</div>';
    document.body.appendChild(wrap);
    els = {
      dlg: wrap,
      body: wrap.querySelector('#authBody'),
      foot: wrap.querySelector('#authFoot'),
      title: wrap.querySelector('#authTitle')
    };
    wrap.addEventListener('click', function (e) {
      if (e.target.closest('[data-auth-close]')) close();
    });
    wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    return els;
  }

  /* 邮箱 / 手机号切换条（两个入口共用） */
  function tabsHtml(active) {
    return '<div class="auth__tabs">' +
      '<button type="button" class="auth__tab' + (active === 'phone' ? ' is-on' : '') + '" data-auth-tab="phone">手机号</button>' +
      '<button type="button" class="auth__tab' + (active === 'email' ? ' is-on' : '') + '" data-auth-tab="email">邮箱</button>' +
      '</div>';
  }
  function wireTabs(b) {
    var row = b.body.querySelector('.auth__tabs');
    if (!row) return;
    row.addEventListener('click', function (e) {
      var t = e.target.closest('[data-auth-tab]');
      if (!t) return;
      if (t.getAttribute('data-auth-tab') === 'phone') viewPhone(); else viewLogin();
    });
  }

  function viewLogin(err) {
    var b = build();
    b.title.textContent = '星际通行证';
    b.body.innerHTML =
      tabsHtml('email') +
      '<p class="auth__lead">填邮箱收一封验证码，进来的同时账号就建好了——不用设密码，也不用先注册一遍。</p>' +
      '<div class="field"><label>邮箱</label><input id="authMail" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" maxlength="80"></div>' +
      (err ? '<p class="auth__err">' + esc(err) + '</p>' : '') +
      '<p class="hint">登录后信件存进这个账号，换设备也能读到同一份档案。</p>' +
      '<p class="auth__note">不登录也能写信，只是信只留在这台设备的档案里。</p>';
    b.foot.innerHTML =
      '<button class="btn btn--quiet" type="button" data-auth-cancel>以后再说</button>' +
      '<button class="btn btn--plate" type="button" id="authSend">获取验证码</button>';
    b.foot.querySelector('[data-auth-cancel]').onclick = close;
    b.foot.querySelector('#authSend').onclick = function () {
      var mail = (b.body.querySelector('#authMail') || {}).value || '';
      mail = mail.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) { viewLogin('请填写有效的邮箱地址'); return; }
      this.disabled = true; this.textContent = '正在发送…';
      sendCode(mail).then(function () { viewCode(); })
        .catch(function (e) { viewLogin(friendly(e.message)); });
    };
    wireTabs(b);
    var input = b.body.querySelector('#authMail');
    if (input) {
      input.value = email();
      input.focus();
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') b.foot.querySelector('#authSend').click(); });
    }
  }

  function viewPhone(err) {
    var b = build();
    b.title.textContent = '星际通行证';
    b.body.innerHTML =
      tabsHtml('phone') +
      '<p class="auth__lead">填手机号收一条验证码，进来的同时账号就建好了——不用设密码，也不用先注册一遍。</p>' +
      '<div class="field"><label>手机号</label><input id="authPhone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="11 位手机号" maxlength="11"></div>' +
      (err ? '<p class="auth__err">' + esc(err) + '</p>' : '') +
      '<p class="hint">登录后信件存进这个账号，换设备也能读到同一份档案。</p>' +
      '<p class="auth__note">不登录也能写信，只是信只留在这台设备的档案里。</p>';
    b.foot.innerHTML =
      '<button class="btn btn--quiet" type="button" data-auth-cancel>以后再说</button>' +
      '<button class="btn btn--plate" type="button" id="authSendPhone">获取验证码</button>';
    b.foot.querySelector('[data-auth-cancel]').onclick = close;
    b.foot.querySelector('#authSendPhone').onclick = function () {
      var tel = (b.body.querySelector('#authPhone') || {}).value || '';
      tel = String(tel).replace(/\D/g, '');
      if (!/^1\d{10}$/.test(tel)) { viewPhone('请输入正确的 11 位手机号'); return; }
      this.disabled = true; this.textContent = '正在发送…';
      sendPhoneCode(tel).then(function () { viewCode(); })
        .catch(function (e) { viewPhone(friendly(e.message)); });
    };
    wireTabs(b);
    var input = b.body.querySelector('#authPhone');
    if (input) {
      var preset = String(phone()).replace(/\D/g, '');
      if (/^1\d{10}$/.test(preset)) input.value = preset;
      input.focus();
      input.addEventListener('input', function () {
        input.value = input.value.replace(/\D/g, '').slice(0, 11);
      });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') b.foot.querySelector('#authSendPhone').click(); });
    }
  }

  /* 输码页：从保存下来的挑战渲染，所以刷新/重开都回到这里而不是从头开始 */
  function viewCode(err, keepCode) {
    var b = build();
    var p = pending || loadPending();
    if (!p) { viewPhone(); return; }
    var isPhone = p.channel === 'phone';
    var to = isPhone ? maskPhone(p.phone) : p.email;

    b.body.innerHTML =
      '<p class="auth__lead">验证码已发往 <b>' + esc(to) + '</b>，十分钟内有效。</p>' +
      '<div class="field"><label>验证码</label><input id="authCode" inputmode="numeric" autocomplete="one-time-code" placeholder="6 位数字" maxlength="8" value="' + esc(keepCode || '') + '"></div>' +
      (err ? '<p class="auth__err">' + esc(err) + '</p>' : '') +
      '<p class="hint">没收到？<button type="button" id="authResend" class="auth__resend">重发验证码</button>' +
      (isPhone ? '（检查短信拦截或欠费）' : '（检查垃圾邮件）') + '</p>';
    b.foot.innerHTML =
      '<button class="btn btn--quiet" type="button" id="authBack">换个' + (isPhone ? '号码' : '邮箱') + '</button>' +
      '<button class="btn btn--plate" type="button" id="authGo">点亮通行证</button>';

    b.foot.querySelector('#authBack').onclick = function () {
      savePending(null); stopCountdown();
      if (isPhone) viewPhone(); else viewLogin();
    };

    var go = b.foot.querySelector('#authGo');
    go.onclick = function () {
      var code = String((b.body.querySelector('#authCode') || {}).value || '').replace(/\D/g, '');
      if (code.length < 4) { viewCode('验证码看起来不完整', code); return; }
      go.disabled = true; go.textContent = '验证中…';
      (isPhone ? verifyPhoneCode(code) : verifyCode(code)).then(function () {
        /* 就地生效：不 reload，页面通过 da:authchange / onAuth 自己刷新 */
        close();
        toast('通行证已生效 · 信件会存在云端档案里');
      }).catch(function (e) {
        go.disabled = false; go.textContent = '点亮通行证';
        if (e.expired) viewCode('这条验证码过期了，点「重发验证码」即可', '');
        else viewCode(friendly(e.message), code);
      });
    };

    var re = b.body.querySelector('#authResend');
    if (re) {
      re.onclick = function () {
        if (countdown > 0 || re.disabled) return;
        re.disabled = true; re.textContent = '正在重发…';
        resend().then(function () { toast('验证码已重发'); viewCode(); })
          .catch(function (e) { viewCode(friendly(e.message)); });
      };
    }
    paintResend();

    var input = b.body.querySelector('#authCode');
    if (input) {
      input.focus();
      if (input.value) input.setSelectionRange(input.value.length, input.value.length);
      input.addEventListener('input', function () { input.value = input.value.replace(/\D/g, '').slice(0, 8); });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go.click(); });
    }
  }

  function paintResend() {
    var re = document.getElementById('authResend');
    if (!re) return;
    if (countdown > 0) { re.disabled = true; re.textContent = '重发（' + countdown + 's）'; }
    else { re.disabled = false; re.textContent = '重发验证码'; }
  }

  function viewAccount() {
    var b = build();
    var id = email() || maskPhone(phone());
    b.title.textContent = '已登录';
    b.body.innerHTML =
      '<p class="auth__lead">这封信柜属于 <b>' + esc(name() || '你') + '</b>' + (id ? '（' + esc(id) + '）' : '') + '。</p>' +
      '<p class="hint">之后收到的信都会存进这个账号，任何设备登录都能读到。</p>';
    b.foot.innerHTML =
      '<button class="btn btn--quiet" type="button" data-auth-cancel>关闭</button>' +
      '<button class="btn btn--plate" type="button" id="authOut">退出登录</button>';
    b.foot.querySelector('[data-auth-cancel]').onclick = close;
    var out = b.foot.querySelector('#authOut');
    out.onclick = function () {
      out.disabled = true; out.textContent = '正在退出…';
      signOut().then(function () {
        close(); toast('已退出 · 之后收到的信只留在本设备');
      }).catch(function (e) {
        toast(e.message || '退出失败');
        out.disabled = false; out.textContent = '退出登录';
      });
    };
  }

  function open() {
    build().dlg.hidden = false;
    document.body.style.overflow = 'hidden';
    if (uid()) { viewAccount(); return; }
    var p = loadPending();
    if (p) viewCode(); else viewPhone();      /* 有未完成的挑战就直接续上 */
  }
  function close() {
    if (!els) return;
    els.dlg.hidden = true;
    document.body.style.overflow = '';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function toast(msg) {
    /* 各页的提示条位置不同：有 #toast 的用 #toast，星轨大厅用的是 .hall-toast。
       两者的显隐机制一致（.is-on），这里按存在性依次回退。 */
    var t = document.getElementById('toast') || document.querySelector('.hall-toast');
    if (!t) return;
    var s = String(msg == null ? '' : msg).trim();
    if (!s) return;
    t.textContent = s;
    t.hidden = false;
    /* 解读页的 toast 靠 .is-on 淡入，管理端靠 hidden；两边都照顾到 */
    t.classList.add('is-on');
    clearTimeout(t._t);
    t._t = setTimeout(function () {
      t.hidden = true; t.classList.remove('is-on');
    }, 3200);
  }

  /* 导航里的通行证胶囊（自动插入，不改各页 HTML）
     带 data-no-auth-chip 的页面（星轨大厅）不在导航里塞胶囊——
     那一页的账号入口是右上角头像，由页面自己接到 open()。 */
  function paintChip() {
    var nav = document.querySelector('.nav');
    if (!nav) return;
    var chip = nav.querySelector('#navAuth');
    if (!chip) {
      if (nav.hasAttribute('data-no-auth-chip')) return;
      chip = document.createElement('button');
      chip.id = 'navAuth';
      chip.className = 'nav__auth';
      chip.type = 'button';
      chip.addEventListener('click', open);
      var mode = nav.querySelector('.nav__mode');
      if (mode) nav.insertBefore(chip, mode);
      else nav.appendChild(chip);
    }
    chip.classList.toggle('is-in', !!uid());
    chip.innerHTML = uid()
      ? '<i class="dot"></i>' + esc(name() || '通行证')
      : '<i class="dot"></i>通行证';
    chip.title = uid() ? '已登录 · 点击查看' : '手机号 / 邮箱登录，跨设备保存信件';
  }

  return {
    init: init, client: client, open: open, close: close,
    uid: uid, email: email, phone: phone, name: name, maskPhone: maskPhone,
    session: function () { return session; },
    sendCode: sendCode, verifyCode: verifyCode,
    sendPhoneCode: sendPhoneCode, verifyPhoneCode: verifyPhoneCode,
    resend: resend, signOut: signOut,
    onChange: function (fn) { if (typeof fn === 'function') subs.push(fn); },
    refresh: paintChip
  };
})();
