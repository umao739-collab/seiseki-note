/*
 * preview-server.js — 画面の見本（preview/index.html）用の、ブラウザの中だけで動くにせもののサーバー。
 * Code.gs の公開関数と同じ形の値を返す。入力の検査は本物の Rules.gs（Config.gs）を使う。
 * 名前も点数もすべて作りもの。
 */
(function () {
  'use strict';
  window.Utilities = { getUuid: function () { return 'id-' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); } };
  var seed = 20261115;
  function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
  function noise(w) { return (rnd() + rnd() + rnd() - 1.5) * w; }
  var FAM = ['ひまわり', 'あさひ', 'なぎさ', 'ほしの', 'わかば', 'みずき', 'こもれび', 'そよかぜ', 'さくらぎ', 'あおぞら', 'もみじ', 'すずらん', 'こはる', 'ゆきみ',
    'はるかぜ', 'つばさ', 'みなと', 'かえで', 'しらゆき', 'あかね', 'ことり', 'まつば', 'いずみ', 'ひなた', 'きらら', 'くるみ', 'みどり', 'あまの'];
  var GIV = ['はな', 'そら', 'かい', 'つき', 'めい', 'うみ', 'りく', 'ゆい', 'たける', 'ひかり', 'こう', 'さき', 'はると', 'みお', 'ゆうと', 'あん', 'れん', 'ここ',
    'しょう', 'のあ', 'だいち', 'ゆな', 'けい', 'りん', 'そうた', 'まな', 'いつき', 'えま'];
  var school = { schoolId: 'demo', schoolName: 'デモ小学校', termSystem: '3学期制' };
  var terms = TERM_LABELS[school.termSystem];
  var classes = { '3-1': [], '3-2': [] };
  Object.keys(classes).forEach(function (ck, ci) {
    var n = ci === 0 ? 28 : 26;
    for (var i = 0; i < n; i++) {
      var f = FAM[(i + ci * 7) % FAM.length], g = GIV[(i * 3 + ci * 5) % GIV.length];
      classes[ck].push({ email: 'demo.s' + ck.replace('-', '') + '.' + (i + 1) + '@example.com', name: f + ' ' + g, number: i + 1 });
    }
  });
  var personas = {
    'demo.setup@example.com': { role: 'teacher', name: 'デモ 教務', isSetup: true, classes: ['3-1', '3-2'] },
    'demo.t31@example.com': { role: 'teacher', name: 'デモ 担任', isSetup: false, classes: ['3-1'] },
    'demo.admin@example.com': { role: 'admin', name: 'アプリ管理者' }
  };
  var gradeSubjects = { 3: defaultSubjectsForGrade_(3) };
  var tests = [], scores = {}, manual = {}, shoken = {};
  function addTests(ck, subject, term, defs) {
    defs.forEach(function (d, i) { tests.push({ testId: Utilities.getUuid(), classKey: ck, subject: subject, term: term, order: i + 1, name: d[0], points: d[1] }); });
  }
  var K = '知識・技能', T = '思考・判断・表現';
  addTests('3-1', '国語', '1学期', [['物語を読もう①', { '知識・技能': 50, '漢字': 50, '思考・判断・表現': 100 }], ['国語辞典の使い方', { '知識・技能': 100, '言葉': 50 }], ['漢字の音と訓', { '漢字': 100 }], ['説明文を読もう①', { '知識・技能': 50, '思考・判断・表現': 100 }]]);
  addTests('3-1', '国語', '2学期', [['物語を読もう②', { '知識・技能': 50, '漢字': 50, '思考・判断・表現': 100 }], ['こそあど言葉', { '知識・技能': 100, '言葉': 50 }], ['説明文を読もう②', { '知識・技能': 50, '思考・判断・表現': 100 }]]);
  addTests('3-1', '国語', '3学期', [['物語を読もう③', { '知識・技能': 50, '漢字': 50, '思考・判断・表現': 100 }], ['ことわざ・故事成語', { '知識・技能': 100, '言葉': 50 }]]);
  addTests('3-1', '算数', '1学期', [['かけ算', { '知識・技能': 100, '思考・判断・表現': 50 }], ['時こくと時間', { '知識・技能': 100, '思考・判断・表現': 50 }], ['わり算', { '知識・技能': 100, '思考・判断・表現': 50 }], ['たし算とひき算の筆算', { '知識・技能': 100, '思考・判断・表現': 50 }]]);
  addTests('3-1', '算数', '2学期', [['あまりのあるわり算', { '知識・技能': 100, '思考・判断・表現': 50 }], ['大きい数', { '知識・技能': 100, '思考・判断・表現': 50 }], ['かけ算の筆算①', { '知識・技能': 100, '思考・判断・表現': 50 }], ['円と球', { '知識・技能': 100, '思考・判断・表現': 50 }]]);
  addTests('3-1', '算数', '3学期', [['分数', { '知識・技能': 100, '思考・判断・表現': 50 }], ['三角形', { '知識・技能': 100, '思考・判断・表現': 50 }]]);
  addTests('3-1', '社会', '1学期', [['わたしたちのまち', { '知識・技能': 100, '思考・判断・表現': 50 }]]);
  addTests('3-1', '理科', '1学期', [['植物を育てよう', { '知識・技能': 100, '思考・判断・表現': 50 }], ['こん虫を調べよう', { '知識・技能': 100, '思考・判断・表現': 50 }]]);
  addTests('3-2', '国語', '1学期', [['物語を読もう①', { '知識・技能': 50, '漢字': 50, '思考・判断・表現': 100 }]]);
  addTests('3-2', '算数', '1学期', [['かけ算', { '知識・技能': 100, '思考・判断・表現': 50 }], ['時こくと時間', { '知識・技能': 100, '思考・判断・表現': 50 }], ['わり算', { '知識・技能': 100, '思考・判断・表現': 50 }], ['たし算とひき算の筆算', { '知識・技能': 100, '思考・判断・表現': 50 }]]);
  var criteria = {}, hyoteiRules = {};
  function critOf(ck) {
    var o = { criteria: {}, hyoteiRules: {} };
    Object.keys(criteria).forEach(function (k) { var p = k.split('|'); if (p[0] === ck) o.criteria[p[1] + '|' + p[2]] = criteria[k]; });
    Object.keys(hyoteiRules).forEach(function (k) { var p = k.split('|'); if (p[0] === ck) o.hyoteiRules[p[1]] = hyoteiRules[k]; });
    return o;
  }
  function peersOf(ck) {
    return Object.keys(classes).filter(function (k) { return k !== ck && gradeOf_(k) === gradeOf_(ck); }).map(function (k) {
      var em = classes[k].map(function (s) { return s.email; }).sort(function () { return Math.random() - 0.5; });
      return { label: classLabel_(k), n: em.length, tests: tests.filter(function (t) { return t.classKey === k; }).map(function (t) {
        var sc = scores[t.testId] || {};
        return { subject: t.subject, term: t.term, name: t.name, points: t.points, rows: em.map(function (e) { return sc[e] || null; }) };
      }) };
    });
  }
  var skip = { 'こそあど言葉|5': 1, '円と球|12': 1, '円と球|20': 1 };
  tests.forEach(function (t) {
    var list = classes[t.classKey];
    var sc = scores[t.testId] = {};
    list.forEach(function (st, i) {
      if (t.term === '2学期' && skip[t.name + '|' + i]) return;
      var base = 0.6 + ((i * 37) % 30) / 100 + (t.term !== '1学期' && i % 9 === 3 ? 0.12 : 0);
      var row = {};
      Object.keys(t.points).forEach(function (l) {
        var a = Math.max(0, Math.min(1, base + noise(0.14) + (/思考/.test(l) ? -0.04 : 0)));
        row[l] = Math.round(a * t.points[l] / 5) * 5;
      });
      sc[st.email] = row;
    });
  });
  ['国語', '算数'].forEach(function (sub) {
    terms.forEach(function (term) {
      classes['3-1'].forEach(function (st, i) {
        if (term === '3学期' && i % 4 === 0) return;
        manual[[st.email, sub, term, '主体的に学習に取り組む態度'].join('|')] = ['A', 'B', 'B', 'A', 'B', 'C', 'B'][(i + term.length + sub.length) % 7];
      });
    });
  });

  function err(msg) { var e = new Error(msg); throw e; }
  function actor(actingAs) {
    var p = personas[actingAs];
    if (!p) err('利用できません。教職員の名簿に登録がないか、利用できる状態ではありません。');
    return p;
  }
  function cls(a, ck) {
    var c = normClassKey_(ck);
    if (!c || (a.classes || []).indexOf(c) === -1) err('このクラスは担当していません。');
    return c;
  }
  function emails(ck) { return classes[ck].map(function (s) { return s.email; }); }
  function testsOf(ck) { return tests.filter(function (t) { return t.classKey === ck; }).map(function (t) { return JSON.parse(JSON.stringify(t)); }); }

  // 体験版の確かめ用: ほかの先生が先に点数を変えたことにする
  window.__demoOtherTeacher = function (ck, value, kanten) {
    var t = testsOf(ck)[0], email = classes[ck][0].email; kanten = kanten || Object.keys(t.points)[0];
    var sc = scores[t.testId] = scores[t.testId] || {}; (sc[email] = sc[email] || {})[kanten] = value;
  };
  var api = {
    bootstrap: function (actingAs) {
      var a = actor(actingAs);
      if (a.role === 'admin') return { role: 'admin', name: a.name, version: APP_VERSION, isDemo: true };
      return { role: 'teacher', name: a.name, version: APP_VERSION, isDemo: true, schoolName: school.schoolName, termSystem: school.termSystem, terms: terms,
        fiscalYear: '2026', isSetup: a.isSetup, classes: a.classes.map(function (k) { return { classKey: k, label: classLabel_(k), grade: gradeOf_(k), count: classes[k].length }; }) };
    },
    getClassData: function (ck, actingAs) {
      var a = actor(actingAs); var c = cls(a, ck);
      var em = emails(c);
      var sc = {};
      tests.filter(function (t) { return t.classKey === c; }).forEach(function (t) { sc[t.testId] = JSON.parse(JSON.stringify(scores[t.testId] || {})); });
      var mn = {};
      Object.keys(manual).forEach(function (k) { if (em.indexOf(k.split('|')[0]) !== -1 && manual[k] !== '') mn[k] = manual[k]; });
      var sh = {};
      Object.keys(shoken).forEach(function (k) { if (em.indexOf(k.split('|')[0]) !== -1) sh[k] = shoken[k]; });
      var cr = critOf(c);
      return { criteria: cr.criteria, hyoteiRules: cr.hyoteiRules, peers: null, classKey: c, label: classLabel_(c), grade: gradeOf_(c), termSystem: school.termSystem, terms: terms,
        students: classes[c].map(function (s) { return { key: s.email, no: s.number, name: s.name }; }),
        subjects: gradeSubjects[gradeOf_(c)], tests: testsOf(c), scores: sc, manual: mn, shoken: sh,
        sameGrade: a.classes.filter(function (k) { return k !== c && gradeOf_(k) === gradeOf_(c); }).map(function (k) { return { classKey: k, label: classLabel_(k) }; }),
        canEditSubjects: a.isSetup };
    },
    getPeers: function (ck, actingAs) { var a = actor(actingAs); return peersOf(cls(a, ck)); },
    saveCriteria: function (ck, subject, term, value, actingAs) {
      var a = actor(actingAs); var c = cls(a, ck);
      var sub = gradeSubjects[gradeOf_(c)].filter(function (s) { return s.name === subject; })[0];
      criteria[[c, subject, term].join('|')] = validateCriteria_(value, sub);
      return { criteria: criteria[[c, subject, term].join('|')] };
    },
    saveHyoteiRule: function (ck, subject, rule, actingAs) {
      var a = actor(actingAs); var c = cls(a, ck);
      var sub = gradeSubjects[gradeOf_(c)].filter(function (s) { return s.name === subject; })[0];
      hyoteiRules[c + '|' + subject] = validateHyoteiRule_(rule, sub);
      return { rule: hyoteiRules[c + '|' + subject] };
    },
    copyCriteriaToClasses: function (ck, subject, term, targets, actingAs) {
      var a = actor(actingAs); var c = cls(a, ck);
      var v = term === '評定' ? hyoteiRules[c + '|' + subject] : criteria[[c, subject, term].join('|')];
      if (!v) err('先に、このクラスで保存してください。');
      targets.forEach(function (k) { var t = cls(a, k); if (term === '評定') hyoteiRules[t + '|' + subject] = v; else criteria[[t, subject, term].join('|')] = v; });
      return { copied: targets.map(classLabel_) };
    },
    previewSmileImport: function (ck, url, actingAs) {
      var a = actor(actingAs); cls(a, ck);
      if (!sheetIdFromUrl_(url)) err('スプレッドシートのURLではないようです。SMILE ファイルのリンクをそのまま貼ってください。');
      return { label: classLabel_(ck), tests: 9, scores: 250, thresholds: 2, skipped: ['国語「たしかめよう①」の観点「主体的に学習に取り組む態度」（この教科の観点にありません）'],
        subjects: [{ name: '国語', terms: [{ term: '1学期', tests: 5 }] }, { name: '算数', terms: [{ term: '1学期', tests: 4 }] }],
        students: { smile: 28, matched: 27, mismatch: [{ no: 12, smileName: 'すずらん さきこ', rosterName: 'すずらん さき' }], missing: [] } };
    },
    importSmile: function (ck, url, actingAs) { var a = actor(actingAs); cls(a, ck); return { tests: 9, scores: 243, students: 27 }; },
    saveTests: function (ck, subject, term, list, actingAs) {
      var a = actor(actingAs); var c = cls(a, ck);
      var sub = gradeSubjects[gradeOf_(c)].filter(function (s) { return s.name === subject; })[0];
      if (!sub) err('この学年の教科ではありません。');
      var v = validateTests_(list, sub);
      var before = tests.filter(function (t) { return t.classKey === c && t.subject === subject && t.term === term; });
      v.forEach(function (t) { if (!t.testId) t.testId = Utilities.getUuid(); });
      var keep = v.map(function (t) { return t.testId; });
      before.forEach(function (t) { if (keep.indexOf(t.testId) === -1) delete scores[t.testId]; });
      tests = tests.filter(function (t) { return !(t.classKey === c && t.subject === subject && t.term === term); })
        .concat(v.map(function (t) { return { testId: t.testId, classKey: c, subject: subject, term: term, order: t.order, name: t.name, points: t.points }; }));
      return { tests: testsOf(c) };
    },
    copyTestsToClasses: function (ck, subject, term, targets, actingAs) {
      var a = actor(actingAs); var c = cls(a, ck);
      var src = tests.filter(function (t) { return t.classKey === c && t.subject === subject && t.term === term; }).sort(function (x, y) { return x.order - y.order; });
      var done = [];
      targets.forEach(function (k) {
        var tk = cls(a, k);
        var have = tests.filter(function (t) { return t.classKey === tk && t.subject === subject && t.term === term; });
        var merged = src.map(function (s) { var same = have.filter(function (x) { return x.name === s.name; })[0]; return { testId: same ? same.testId : Utilities.getUuid(), classKey: tk, subject: subject, term: term, name: s.name, points: JSON.parse(JSON.stringify(s.points)) }; });
        have.forEach(function (x) { if (!src.some(function (s) { return s.name === x.name; })) merged.push(x); });
        merged.forEach(function (m, i) { m.order = i + 1; });
        tests = tests.filter(function (t) { return !(t.classKey === tk && t.subject === subject && t.term === term); }).concat(merged);
        done.push(classLabel_(tk));
      });
      return { copied: done };
    },
    saveScores: function (ck, changes, actingAs) {
      var a = actor(actingAs); var c = cls(a, ck);
      var byId = {};
      testsOf(c).forEach(function (t) { byId[t.testId] = t; });
      var conflicts = [];
      validateScoreChanges_(changes, emails(c), byId).forEach(function (x) {
        var sc = scores[x.testId] = scores[x.testId] || {};
        var row = sc[x.studentEmail] = sc[x.studentEmail] || {};
        var cur = row[x.kanten] === undefined ? '' : String(row[x.kanten]);
        if (x.base !== undefined && cur !== x.base && cur !== String(x.value)) { conflicts.push({ testId: x.testId, studentEmail: x.studentEmail, kanten: x.kanten, value: row[x.kanten] === undefined ? '' : row[x.kanten], byName: 'デモ 学年の先生' }); return; }
        if (x.value === '') delete row[x.kanten]; else row[x.kanten] = x.value;
      });
      return { savedAt: '2026-11-15 10:00:00', count: changes.length - conflicts.length, conflicts: conflicts };
    },
    saveManual: function (ck, changes, actingAs) {
      var a = actor(actingAs); var c = cls(a, ck);
      var conflicts = [];
      validateManualChanges_(changes, emails(c), gradeSubjects[gradeOf_(c)], terms).forEach(function (x) {
        var k = [x.studentEmail, x.subject, x.term, x.field].join('|'), cur = manual[k] || '';
        if (x.base !== undefined && cur !== x.base && cur !== x.value) { conflicts.push({ studentEmail: x.studentEmail, subject: x.subject, term: x.term, field: x.field, value: cur, byName: 'デモ 学年の先生' }); return; }
        manual[k] = x.value;
      });
      return { savedAt: '2026-11-15 10:00:00', count: changes.length - conflicts.length, conflicts: conflicts };
    },
    saveShoken: function (ck, items, actingAs) {
      var a = actor(actingAs); var c = cls(a, ck);
      validateShokenItems_(items, emails(c), terms).forEach(function (x) { shoken[x.studentEmail + '|' + x.term] = { text: x.text, at: '2026-11-15 10:00' }; });
      return { savedAt: '2026-11-15 10:00:00', count: items.length };
    },
    getSchoolSetup: function (actingAs) {
      var a = actor(actingAs);
      if (!a.isSetup) err('この操作は、学校の設定担当の先生だけができます。');
      return { rosterLinked: true, rosterImportedAt: '2026-11-15 09:30:00', schoolName: school.schoolName, rosterSheetUrl: 'https://docs.google.com/spreadsheets/d/xxxxxxxxxxxxxxxxxxxx/edit',
        students: classes['3-1'].length + classes['3-2'].length,
        classes: Object.keys(classes).map(function (k) { return { classKey: k, label: classLabel_(k), count: classes[k].length, homeroom: k === '3-1' ? 'demo.t31@example.com' : '', assistants: [] }; }),
        staff: [{ email: 'demo.setup@example.com', name: 'デモ 教務', title: '教務主任' }, { email: 'demo.t31@example.com', name: 'デモ 担任', title: '教諭' }, { email: 'demo.t32@example.com', name: 'デモ 二組', title: '教諭' }] };
    },
    importRoster: function (url, actingAs) {
      var a = actor(actingAs); if (!a.isSetup) err('この操作は、学校の設定担当の先生だけができます。');
      if (url && !sheetIdFromUrl_(url)) err('スプレッドシートのURLではないようです。名簿マスターのリンクをそのまま貼ってください。');
      return { students: 54, staff: 3, classes: 2, importedAt: '2026-11-15 10:00:00' };
    },
    saveAssignments: function (list, actingAs) { var a = actor(actingAs); if (!a.isSetup) err('だめ'); return { count: list.length }; },
    getAdminView: function () { return { fiscalYear: '2026', schoolList: SCHOOL_LIST.map(function (x) { return { schoolId: x[0], schoolName: x[1] }; }), schools: [{ schoolId: 'demo', schoolName: 'デモ小学校', active: true, termSystem: '3学期制', setupTeachers: ['demo.setup@example.com'], students: 54, hasDataFile: true }] }; },
    registerSchool: function () { return api.getAdminView(); },
    updateSchool: function () { return api.getAdminView(); }
  };
  function runner(ok, ng) {
    var r = {};
    r.withSuccessHandler = function (f) { return runner(f, ng); };
    r.withFailureHandler = function (f) { return runner(ok, f); };
    Object.keys(api).forEach(function (k) {
      r[k] = function () {
        var args = arguments;
        setTimeout(function () {
          try { var v = JSON.parse(JSON.stringify(api[k].apply(null, args))); if (ok) ok(v); }
          catch (e) { if (ng) ng({ message: e.message }); }
        }, 150);
      };
    });
    return r;
  }
  window.google = { script: { run: runner(null, null) } };
})();
