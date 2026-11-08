/* DIMENSION ANCHOR TAROT — 牌阵定义
   每个牌阵提供：key / 中英名 / 张数 / 设计画布尺寸 / 牌位坐标与解释。
   坐标单位为设计画布 px，由 render 层按容器宽度整体缩放，手机与桌面共用同一套数据。 */

window.DA_SPREADS = (function () {

  /* 十牌阵 A —— 经典凯尔特十字 */
  var celtic = {
    key: 'celtic',
    cn: '经典凯尔特十字',
    en: 'CELTIC CROSS',
    count: 10,
    w: 1120, h: 820, cw: 140,
    hint: '最完整的十位读法：从核心议题一路推到最终结果。',
    slots: [
      { n: 1,  cn: '现状',     en: 'Present',      x: 348, y: 408, rot: 0,
        d: '此刻真正摊在桌面上的议题，事情现在的样子。' },
      { n: 2,  cn: '交叉',     en: 'Challenge',    x: 348, y: 408, rot: 90,
        d: '横在中间的力量：阻碍、张力，或你必须先处理的矛盾。' },
      { n: 3,  cn: '根基',     en: 'Foundation',   x: 348, y: 679, rot: 0,
        d: '水面之下的部分：潜意识根源、这件事真正的起点。' },
      { n: 4,  cn: '过去',     en: 'Past',         x: 134, y: 408, rot: 0,
        d: '已经发生并仍在影响你的部分，正在退场的能量。' },
      { n: 5,  cn: '意识层',   en: 'Conscious',    x: 348, y: 139, rot: 0,
        d: '你希望它变成什么样；你正朝着什么方向使劲。' },
      { n: 6,  cn: '近期未来', en: 'Near Future',  x: 562, y: 408, rot: 0,
        d: '接下来一小段时间里，最先浮出来的变化。' },
      { n: 7,  cn: '自我立场', en: 'Self',         x: 960, y: 696, rot: 0,
        d: '你在这件事里的姿态：你如何看待自己。' },
      { n: 8,  cn: '环境',     en: 'Environment',  x: 960, y: 514, rot: 0,
        d: '他人、场域与外界条件对你的作用力。' },
      { n: 9,  cn: '希望与恐惧', en: 'Hopes & Fears', x: 960, y: 331, rot: 0,
        d: '你既想要又害怕的那件事，往往是同一件。' },
      { n: 10, cn: '最终结果', en: 'Outcome',      x: 960, y: 149, rot: 0,
        d: '沿着当前这条轨道走下去，会抵达的地方。' }
    ]
  };

  /* 十牌阵 B —— 原创星轨十宫 */
  var orbit = {
    key: 'orbit',
    cn: '原创星轨十宫',
    en: 'STAR ORBIT TEN',
    count: 10,
    w: 1160, h: 890, cw: 110,
    hint: '以星核为心的环形读法，专注关系里的坐标与映照。',
    slots: [
      { n: 1,  cn: '星核',     en: 'Core',          x: 580, y: 445, rot: 0,
        d: '当前关系的核心主题——这一切到底在围绕什么旋转。' },
      { n: 2,  cn: '交叠轨道', en: 'Crossing Orbits', x: 580.0, y: 115.0, rot: 0,
        d: '两种力量的交汇与冲突，你们彼此摩擦的那一处。' },
      { n: 3,  cn: '起源之星', en: 'Origin Star',   x: 862.8, y: 192.2, rot: 0,
        d: '关系背景与过去影响，最初让这件事启动的那个瞬间。' },
      { n: 4,  cn: '月影',     en: 'Moonshadow',    x: 1013.3, y: 387.7, rot: 0,
        d: '潜在顾虑与未表达之处，被藏在暗面的那一部分。' },
      { n: 5,  cn: '映照之镜', en: 'Mirror',        x: 961.1, y: 610.0, rot: 0,
        d: '你此刻的感受与期待，你希望被如何回应。' },
      { n: 6,  cn: '未来星径', en: 'Future Path',   x: 730.5, y: 755.1, rot: 0,
        d: '接下来可能出现的变化，这条轨道正转向哪里。' },
      { n: 7,  cn: '自我坐标', en: 'Self Coordinate', x: 429.5, y: 755.1, rot: 0,
        d: '你在这段关系里的位置——你站在离中心多远的地方。' },
      { n: 8,  cn: '对方映象', en: 'Their Reflection', x: 198.9, y: 610.0, rot: 0,
        d: '你所理解的对方状态，注意这是你的映象，不是定论。' },
      { n: 9,  cn: '命运交点', en: 'Destiny Node',  x: 146.7, y: 387.7, rot: 0,
        d: '值得关注的转折：一次选择、一句话、一个时机。' },
      { n: 10, cn: '终点星环', en: 'Final Ring',    x: 297.2, y: 192.2, rot: 0,
        d: '本次探索的综合主题——所有光点最后连成的形状。' }
    ]
  };

  var single = {
    key: 'single',
    cn: '单牌',
    en: 'SINGLE CARD',
    count: 1,
    w: 400, h: 420, cw: 240,
    hint: '只问一件事。适合每日一次的简短确认。',
    slots: [
      { n: 1, cn: '今日星核', en: 'The Core', x: 200, y: 210, rot: 0,
        d: '今天最需要被看见的那一句话。' }
    ]
  };

  var three = {
    key: 'three',
    cn: '三牌阵',
    en: 'THREE CARD',
    count: 3,
    w: 1120, h: 340, cw: 190,
    hint: '过去 — 现在 — 未来，最小的时间轴。',
    slots: [
      { n: 1, cn: '起源之星', en: 'Origin',  x: 200, y: 165, rot: 0,
        d: '促成此刻的过去因由。' },
      { n: 2, cn: '交汇之环', en: 'Present', x: 560, y: 165, rot: 0,
        d: '现在正发生在你身上的事。' },
      { n: 3, cn: '未来星径', en: 'Future',  x: 920, y: 165, rot: 0,
        d: '如果不改变方向，会走向哪里。' }
    ]
  };

  var five = {
    key: 'five',
    cn: '五牌阵',
    en: 'FIVE CARD',
    count: 5,
    w: 1340, h: 340, cw: 190,
    hint: '看清处境、阻力、资源、建议与走向。',
    slots: [
      { n: 1, cn: '当前处境', en: 'Situation', x: 166,  y: 165, rot: 0,
        d: '眼下真实的局面。' },
      { n: 2, cn: '阻碍与挑战', en: 'Obstacle', x: 418,  y: 165, rot: 0,
        d: '让你卡住的那一件事。' },
      { n: 3, cn: '潜在资源', en: 'Resource',  x: 670,  y: 165, rot: 0,
        d: '你其实已经有、但还没用上的力量。' },
      { n: 4, cn: '建议方向', en: 'Advice',    x: 922,  y: 165, rot: 0,
        d: '如果只做一件事，做这件。' },
      { n: 5, cn: '可能结果', en: 'Outcome',   x: 1174, y: 165, rot: 0,
        d: '照此下去最可能的样子。' }
    ]
  };

  var ALL = [single, three, five, celtic, orbit];

  return {
    all: ALL,
    byKey: function (k) {
      for (var i = 0; i < ALL.length; i++) if (ALL[i].key === k) return ALL[i];
      return single;
    },
    /* 十牌阵的两种布局 */
    tens: [celtic, orbit]
  };
})();
