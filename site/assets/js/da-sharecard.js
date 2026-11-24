/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 竖版分享卡（离屏 canvas → PNG）
   依赖：window.DA_STORE（读最新解读）、window.DA_TAROT_IMG（牌面图，可选）
   用法：DA_SHARECARD.make()        取最新一条解读生成并下载
        DA_SHARECARD.make(record)  指定记录
        DA_SHARECARD.toDataURL(record).then(url => …)
   图片均为本站同源资源，canvas 不会被污染，可直接 toDataURL。
   全程在浏览器本地完成，不上传任何内容。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var W = 750, H = 1334;
  var FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
  var SERIF = '"Songti SC","STSong","Noto Serif CJK SC",serif';

  function $(s, r) { return (r || document).querySelector(s); }

  function latestRecord() {
    try {
      var S = window.DA_STORE;
      if (S && S.readings && S.readings.list) return S.readings.list()[0] || null;
    } catch (e) {}
    return null;
  }

  function stripTags(s) {
    return String(s == null ? '' : s)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  function loadImage(src) {
    return new Promise(function (resolve) {
      if (!src) return resolve(null);
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  /* 按像素宽度折行（中文按字、英文按词粗略处理） */
  function wrap(ctx, text, maxW) {
    var out = [], line = '';
    var chars = String(text || '').split('');
    for (var i = 0; i < chars.length; i++) {
      var test = line + chars[i];
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = chars[i];
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
    return out;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function bg(ctx) {
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#241B3E');
    g.addColorStop(0.55, '#1A1430');
    g.addColorStop(1, '#120E24');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 柔光斑
    var g2 = ctx.createRadialGradient(W * 0.8, 120, 10, W * 0.8, 120, 520);
    g2.addColorStop(0, 'rgba(206,180,255,.22)');
    g2.addColorStop(1, 'rgba(206,180,255,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);
    var g3 = ctx.createRadialGradient(W * 0.15, H * 0.72, 10, W * 0.15, H * 0.72, 480);
    g3.addColorStop(0, 'rgba(240,217,168,.14)');
    g3.addColorStop(1, 'rgba(240,217,168,0)');
    ctx.fillStyle = g3;
    ctx.fillRect(0, 0, W, H);
    // 金框
    ctx.strokeStyle = 'rgba(214,182,120,.55)';
    ctx.lineWidth = 2;
    roundRect(ctx, 26, 26, W - 52, H - 52, 18);
    ctx.stroke();
  }

  function header(ctx, rec) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(240,217,168,.9)';
    ctx.font = '600 22px ' + SERIF;
    ctx.fillText('D I M E N S I O N   A N C H O R', W / 2, 84);
    ctx.fillStyle = 'rgba(251,247,255,.96)';
    ctx.font = '600 40px ' + SERIF;
    var title = rec.title || '一次星轨解读';
    var tl = wrap(ctx, title, W - 120);
    ctx.fillText(tl[0] || title, W / 2, 150);
    if (tl[1]) ctx.fillText(tl[1], W / 2, 196);

    // 连接对象
    var L = rec.link || {};
    if (L.subjectName) {
      ctx.fillStyle = 'rgba(233,223,246,.8)';
      ctx.font = '20px ' + FONT;
      var who = '给 ' + L.subjectName + (L.relation ? ' · ' + L.relation : '');
      if (L.workName) who += '  《' + L.workName + '》';
      var wl = wrap(ctx, who, W - 100);
      ctx.fillText(wl[0], W / 2, 218 + (tl[1] ? 30 : 0));
    }
  }

  function cards(ctx, rec, imgs) {
    /* 落盘记录里的 cards 已是「已落位牌」，没有 placed 字段（interpret.js:sessionOf
       才在内存补 placed），这里不能再过滤，否则恒为空。 */
    var list = (rec.cards || []).filter(function (c) { return !c.supp; }).slice(0, 3);
    if (!list.length) return 250;
    var imgY = 262, imgW = 150, imgH = 220, gap = 22;
    var total = list.length * imgW + (list.length - 1) * gap;
    var x0 = (W - total) / 2;
    list.forEach(function (c, i) {
      var x = x0 + i * (imgW + gap);
      ctx.save();
      roundRect(ctx, x, imgY, imgW, imgH, 10);
      ctx.clip();
      ctx.fillStyle = '#2A2145';
      ctx.fillRect(x, imgY, imgW, imgH);
      var img = imgs[i];
      if (img) {
        // cover 裁切
        var ir = img.width / img.height, br = imgW / imgH;
        var sw, sh, sx, sy;
        if (ir > br) { sh = img.height; sw = sh * br; sx = (img.width - sw) / 2; sy = 0; }
        else { sw = img.width; sh = sw / br; sx = 0; sy = (img.height - sh) / 2; }
        ctx.drawImage(img, sx, sy, sw, sh, x, imgY, imgW, imgH);
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(214,182,120,.6)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, imgY, imgW, imgH, 10);
      ctx.stroke();
      // 逆位标记
      if (c.reversed) {
        ctx.fillStyle = 'rgba(240,217,168,.92)';
        ctx.font = '14px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText('逆位', x + imgW / 2, imgY + imgH - 10);
      }
      ctx.fillStyle = 'rgba(251,247,255,.94)';
      ctx.font = '15px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('《' + (c.cn || '') + '》', x + imgW / 2, imgY + imgH + 26);
    });
    return imgY + imgH + 40;
  }

  function chapters(ctx, rec, startY) {
    /* 空间充足，放全部六章；每章摘要限 2 行，底部预留给页脚。 */
    var list = (rec.chapters || []).slice(0, 6);
    var y = startY + 8;
    ctx.textAlign = 'left';
    list.forEach(function (ch) {
      // 章节标题
      ctx.fillStyle = 'rgba(240,217,168,.92)';
      ctx.font = '600 19px ' + FONT;
      ctx.fillText((ch.no || '') + '  ' + (ch.title || ''), 62, y);
      y += 30;
      // 首段摘要
      var first = '';
      for (var i = 0; i < (ch.blocks || []).length; i++) {
        var b = ch.blocks[i];
        if ((b.t === 'p' || b.t === 'note' || b.t === 'quote' || b.t === 'quote6') && b.x) {
          first = stripTags(b.x);
          break;
        }
      }
      if (!first) first = '（本章解读见完整档案）';
      ctx.fillStyle = 'rgba(233,223,246,.85)';
      ctx.font = '16px ' + FONT;
      var lines = wrap(ctx, first, W - 124).slice(0, 2);
      lines.forEach(function (ln) {
        ctx.fillText(ln, 62, y);
        y += 24;
      });
      y += 12;
    });
    return y;
  }

  function footer(ctx) {
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(214,182,120,.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(90, H - 96);
    ctx.lineTo(W - 90, H - 96);
    ctx.stroke();
    ctx.fillStyle = 'rgba(206,198,232,.62)';
    ctx.font = '15px ' + FONT;
    ctx.fillText('每一次抽牌，都是与你自己的一次对话。', W / 2, H - 64);
    ctx.fillStyle = 'rgba(240,217,168,.6)';
    ctx.font = '13px ' + SERIF;
    ctx.fillText('DIMENSION ANCHOR · 维度锚点', W / 2, H - 38);
  }

  function toDataURL(rec) {
    rec = rec || latestRecord();
    if (!rec) return Promise.reject(new Error('没有可分享的解读记录'));
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    bg(ctx);
    header(ctx, rec);
    var imgs = ((rec.cards || []).filter(function (c) { return !c.supp; }).slice(0, 3)).map(function (c) {
      return window.DA_TAROT_IMG && window.DA_TAROT_IMG[c.id] ? window.DA_TAROT_IMG[c.id] : null;
    });
    return Promise.all(imgs.map(loadImage)).then(function (loaded) {
      var y = cards(ctx, rec, loaded);
      chapters(ctx, rec, y);
      footer(ctx);
      try { return canvas.toDataURL('image/png'); }
      catch (e) { throw new Error('生成图片失败：' + (e.message || e)); }
    });
  }

  function make(rec) {
    return toDataURL(rec).then(function (url) {
      var S = window.DA_STORE;
      var d = new Date();
      function p2(n) { return n < 10 ? '0' + n : '' + n; }
      var name = 'da-share-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.png';
      if (S && S.downloadDataURL) {
        return S.downloadDataURL(name, url) ? url : Promise.reject(new Error('下载被浏览器阻止'));
      }
      // 兜底：直接 a 标签
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function () { a.remove(); }, 400);
      return url;
    });
  }

  window.DA_SHARECARD = { make: make, toDataURL: toDataURL, latestRecord: latestRecord };
})();
