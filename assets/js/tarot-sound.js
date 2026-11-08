/* DIMENSION ANCHOR TAROT — 音效
   全部由 WebAudio 实时合成，不依赖任何外部音频文件。
   浏览器策略：AudioContext 只在用户第一次真实操作后创建，绝不自动播放。 */

window.DA_SOUND = (function () {

  var ctx = null;
  var master = null;
  var ambientGain = null;
  var ambientNodes = null;
  var muted = false;
  var volume = 0.6;
  var unlocked = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
    return ctx;
  }

  /* 用户第一次交互时调用：解锁音频并启动环境音 */
  function unlock() {
    if (unlocked) return;
    var c = ensure();
    if (!c) return;
    unlocked = true;
    if (c.state === 'suspended') c.resume();
    startAmbient();
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05);
  }

  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.08);
  }

  /* ---------- 环境音：两层缓慢起伏的 pad + 极轻的星尘噪声 ---------- */
  function startAmbient() {
    var c = ctx;
    if (!c || ambientNodes) return;

    ambientGain = c.createGain();
    ambientGain.gain.value = 0;
    ambientGain.connect(master);
    ambientGain.gain.setTargetAtTime(1, c.currentTime, 2.5);

    var nodes = [];

    // pad：两个略微失谐的正弦
    [110, 164.81, 220].forEach(function (f, k) {
      var o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      var g = c.createGain();
      g.gain.value = [0.055, 0.035, 0.022][k];
      var lfo = c.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.03 + k * 0.017;
      var lg = c.createGain();
      lg.gain.value = g.gain.value * 0.55;
      lfo.connect(lg); lg.connect(g.gain);
      o.connect(g); g.connect(ambientGain);
      o.start(); lfo.start();
      nodes.push(o, lfo, g, lg);
    });

    // 星尘：循环滤波噪声
    var len = c.sampleRate * 4;
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
    var src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    var lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.4;
    var ng = c.createGain(); ng.gain.value = 0.16;
    src.connect(lp); lp.connect(ng); ng.connect(ambientGain);
    src.start();
    nodes.push(src, lp, ng);

    ambientNodes = nodes;
  }

  function stopAmbient() {
    if (!ctx || !ambientNodes) return;
    ambientGain.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
    var ns = ambientNodes;
    setTimeout(function () {
      ns.forEach(function (n) { try { n.stop && n.stop(); } catch (e) {} });
    }, 1600);
    ambientNodes = null;
  }

  /* ---------- 工具 ---------- */
  function noiseBurst(dur, filterType, freq, gain, decay) {
    var c = ensure(); if (!c || muted) return;
    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
    var s = c.createBufferSource(); s.buffer = buf;
    var f = c.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = 0.8;
    var g = c.createGain();
    var t = c.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (decay || dur));
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  function tone(freq, dur, gain, type, glideTo) {
    var c = ensure(); if (!c || muted) return;
    var o = c.createOscillator();
    o.type = type || 'sine';
    var t = c.currentTime;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    var g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /* ---------- 具体音效 ---------- */
  var api = {};

  api.shuffle = function () {
    // 一连串短促的纸牌摩擦
    var n = 0;
    var timer = setInterval(function () {
      noiseBurst(0.09, 'bandpass', 1800 + Math.random() * 2600, 0.09, 0.11);
      if (++n > 13) clearInterval(timer);
    }, 78);
  };

  api.cut = function () {
    noiseBurst(0.16, 'lowpass', 1200, 0.13, 0.18);
    setTimeout(function () { tone(146.83, 0.5, 0.07, 'sine', 110); }, 60);
  };

  api.draw = function () {
    tone(880, 0.26, 0.055, 'sine', 1320);
    noiseBurst(0.05, 'highpass', 4200, 0.035, 0.06);
  };

  api.flip = function () {
    // 水晶音：基音 + 五度 + 八度泛音
    [1046.5, 1568, 2093].forEach(function (f, i) {
      setTimeout(function () { tone(f, 0.9 - i * 0.18, 0.045 - i * 0.011, 'sine'); }, i * 42);
    });
    noiseBurst(0.04, 'highpass', 6000, 0.03, 0.05);
  };

  api.page = function () {
    noiseBurst(0.28, 'bandpass', 900, 0.06, 0.3);
    tone(392, 0.4, 0.03, 'sine', 587);
  };

  api.complete = function () {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      setTimeout(function () { tone(f, 1.3, 0.05, 'sine'); }, i * 130);
    });
  };

  api.hover = function () {
    tone(1760, 0.12, 0.016, 'sine');
  };

  api.unlock = unlock;
  api.setVolume = setVolume;
  api.setMuted = setMuted;
  api.isMuted = function () { return muted; };
  api.volume = function () { return volume; };
  api.stopAmbient = stopAmbient;

  return api;
})();
