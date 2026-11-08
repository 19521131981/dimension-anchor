/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR · 五套牌背
   ----------------------------------------------------------------------
   五个花色各有一张独立的 AI 生成牌背（assets/media/backs/*.jpg）。
   这里只做「花色 → 图片」的查表与几个渲染助手，不改动任何牌面数据。
   ══════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var DIR = 'assets/media/backs/';

  var MAP = {
    major:     DIR + 'major.jpg',
    wands:     DIR + 'wands.jpg',
    cups:      DIR + 'cups.jpg',
    swords:    DIR + 'swords.jpg',
    pentacles: DIR + 'pentacles.jpg'
  };

  var CN = {
    major:     '大阿尔卡那',
    wands:     '权杖',
    cups:      '圣杯',
    swords:    '宝剑',
    pentacles: '星币'
  };

  var ORDER = ['major', 'wands', 'cups', 'swords', 'pentacles'];

  /* 大阿尔卡那为默认（整副牌堆、无花色的场合） */
  function url(suit) {
    return MAP[suit] || MAP.major;
  }

  /* 内联 img：用于 .pc__back / .dcard__side--back 这类真实 DOM 容器 */
  function img(suit, cls) {
    return '<img class="cback' + (cls ? ' ' + cls : '') + '" src="' + url(suit) +
      '" alt="" draggable="false" decoding="async">';
  }

  /* CSS 背景值：用于扇形牌这种用背景图渲染的节点 */
  function css(suit) {
    return 'url("' + url(suit) + '")';
  }

  global.DA_BACKS = {
    map: MAP,
    cn: CN,
    order: ORDER,
    url: url,
    img: img,
    css: css
  };
})(window);
