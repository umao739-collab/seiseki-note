/**
 * Demo.gs — 見本のクラス（架空の名前・点数）。実在の児童の名前は使わない。
 *
 * 毎回同じ見本になるように、決まった種から乱数を作る。
 * 「入れわすれチェック」が見られるように、何人かの点数をわざと空けてある。
 */
function demoModel_() {
  var seed = 20261114;
  function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
  function noise(w) { return (rnd() + rnd() + rnd() - 1.5) * w; }

  var family = ['ひまわり', 'あさひ', 'なぎさ', 'ほしの', 'わかば', 'みずき', 'こもれび', 'そよかぜ', 'さくらぎ', 'あおぞら',
    'もみじ', 'すずらん', 'こはる', 'ゆきみ', 'はるかぜ', 'つばさ', 'みなと', 'かえで', 'しらゆき', 'あかね',
    'ことり', 'まつば', 'いずみ', 'ひなた', 'きらら', 'くるみ', 'みどり', 'あまの'];
  var given = ['はな', 'そら', 'かい', 'つき', 'めい', 'うみ', 'りく', 'ゆい', 'たける', 'ひかり',
    'こう', 'さき', 'はると', 'みお', 'ゆうと', 'あん', 'れん', 'ここ', 'しょう', 'のあ',
    'だいち', 'ゆな', 'けい', 'りん', 'そうた', 'まな', 'いつき', 'えま'];
  var students = family.map(function (f, i) { return { idx: i, no: i + 1, name: f + ' ' + given[i] }; });

  var KOKUGO = ['思考・判断・表現', '知識・技能', '漢字', '言葉'];
  var TWO = ['知識・技能', '思考・判断・表現'];
  var plan = {
    '国語': { kanten: KOKUGO, terms: {
      '1学期': [['物語を読もう①', [100, 100, 50, 50]], ['国語辞典の使い方', [0, 100, 0, 100]], ['漢字の音と訓', [0, 50, 100, 50]], ['説明文を読もう①', [100, 100, 0, 0]], ['たしかめよう①', [50, 50, 50, 50]]],
      '2学期': [['物語を読もう②', [100, 100, 50, 50]], ['こそあど言葉', [0, 100, 0, 100]], ['説明文を読もう②', [100, 100, 0, 0]]]
    } },
    '社会': { kanten: TWO, terms: {
      '1学期': [['わたしたちのまち', [100, 50]], ['地図記号', [100, 50]]],
      '2学期': [['お店ではたらく人', [100, 50]], ['工場ではたらく人', [100, 50]]]
    } },
    '算数': { kanten: TWO, terms: {
      '1学期': [['かけ算', [100, 50]], ['時こくと時間', [100, 50]], ['わり算', [100, 50]], ['たし算とひき算の筆算', [100, 50]], ['長いものの長さ', [100, 0]]],
      '2学期': [['あまりのあるわり算', [100, 50]], ['大きい数', [100, 50]], ['かけ算の筆算①', [100, 50]], ['円と球', [100, 50]]]
    } },
    '理科': { kanten: TWO, terms: {
      '1学期': [['植物を育てよう', [100, 50]], ['こん虫を調べよう', [100, 50]], ['風とゴムの力', [100, 50]]],
      '2学期': [['太陽とかげ', [100, 50]], ['光を調べよう', [100, 50]], ['電気の通り道', [100, 50]]]
    } }
  };
  // 子どもごとの「その教科・観点の力」（0.45〜0.98）。2学期にぐんと伸びる子も入れる
  var ability = {};
  students.forEach(function (s) {
    var base = 0.62 + rnd() * 0.3;
    Object.keys(plan).forEach(function (sub) {
      plan[sub].kanten.forEach(function (k) {
        ability[s.idx + '|' + sub + '|' + k] = Math.max(0.45, Math.min(0.98, base + noise(0.18)));
      });
    });
  });
  var growers = { 3: true, 11: true, 19: true };
  var missing = { '国語|2学期|説明文を読もう②|5': true, '算数|2学期|円と球|12': true, '算数|2学期|円と球|20': true, '理科|1学期|風とゴムの力|8': true };

  var th = { a: 80, b: 50 };
  var subjects = Object.keys(plan).map(function (sub) {
    var p = plan[sub];
    var units = [];
    var thresholds = {};
    Object.keys(p.terms).forEach(function (term) {
      thresholds[term] = th;
      p.terms[term].forEach(function (def) {
        var kanten = [];
        p.kanten.forEach(function (k, i) { if (def[1][i] > 0) kanten.push({ label: k, max: def[1][i] }); });
        var scores = [], evals = [];
        students.forEach(function (s) {
          if (missing[sub + '|' + term + '|' + def[0] + '|' + s.idx]) { scores.push(kanten.map(function () { return null; })); evals.push(''); return; }
          var sum = 0, max = 0;
          var row = kanten.map(function (kt) {
            var a = ability[s.idx + '|' + sub + '|' + kt.label] + (term === '2学期' && growers[s.idx] ? 0.15 : 0);
            var v = Math.round(Math.max(0, Math.min(1, a + noise(0.12))) * kt.max / 5) * 5;
            sum += v; max += kt.max;
            return v;
          });
          scores.push(row);
          var rate = sum / max * 100;
          evals.push(rate >= th.a ? 'A' : rate >= th.b ? 'B' : 'C');
        });
        units.push({ term: term, name: def[0], kanten: kanten, scores: scores, evals: evals });
      });
    });
    return { name: sub, thresholds: thresholds, units: units };
  });
  return {
    source: 'demo',
    fileName: '見本のクラス（架空の名前と点数）',
    meta: { region: '見本', termSystem: '3学期制', grade: '3年', className: '1', teacher: '見本' },
    termLabels: ['1学期', '2学期'],
    students: students,
    subjects: subjects,
    shoken: {}
  };
}
