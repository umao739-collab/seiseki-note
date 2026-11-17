/**
 * Code.gs — doGet と公開関数（Config.gs の PUBLIC_FUNCTIONS）。
 *
 * ★google.script.run から呼べるのは末尾 `_` の無い関数すべて。ここに置く公開関数は PUBLIC_FUNCTIONS だけ。
 * 各公開関数の順序: guard_ → getContext_（本人・在職・学校）→ 役割・担当クラス → 入力の検査 → 処理。
 * 画面から来る値は「どれを見たい・変えたいか」の指定にすぎず、権限の根拠にしない。
 * 返す値にスプレッドシートの ID は入れない（設定担当の取り込み用名簿シートの URL だけは例外）。
 */
function doGet() {
  var t = HtmlService.createTemplateFromFile('index');
  t.isDemoJson = JSON.stringify(isDemoMode_());
  t.personasJson = JSON.stringify(isDemoMode_() ? demoPersonas_() : []).replace(/</g, '\\u003c');
  return t.evaluate()
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}
function include_(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }

/** アプリの例外（appError_）の文言だけを画面に返す。ほかは固定の文言にし、ログには種類と場所だけを残す。 */
function guard_(fn) {
  try {
    return fn();
  } catch (e) {
    if (e && e.isApp) throw new Error(e.message);
    console.error((e && e.name) || 'Error', e && e.stack ? String(e.stack).split('\n').slice(1, 4).join(' / ') : '');
    throw new Error('うまくいきませんでした。時間をおいて、もう一度ためしてください。');
  }
}

/** 今年度のデータファイル（無ければ断る）。 */
function currentFile_(actor) {
  var id = Directory.getOpenDataFileId(actor.schoolId, fiscalYearOf_(today_()));
  if (!id) throw appError_('今年度のデータがまだ用意されていません。アプリ管理者に連絡してください。');
  return id;
}
/** 学年の教科の設定（まだ無ければ初期値）。 */
function gradeSubjects_(fileId, grade) {
  var row = Store.list(fileId, 'gradeSubjects', function (o) { return o.grade === String(grade); })[0];
  if (row) { try { return JSON.parse(row.subjects); } catch (e) { /* こわれていたら初期値 */ } }
  return defaultSubjectsForGrade_(grade);
}
function testsOfClass_(fileId, classKey) {
  return Store.list(fileId, 'tests', function (t) { return t.classKey === classKey; }).map(function (t) {
    var points = {};
    try { points = JSON.parse(t.points); } catch (e) { points = {}; }
    return { testId: t.testId, subject: t.subject, term: t.term, order: Number(t.order) || 0, name: t.name, points: points };
  });
}
function classContext_(ctx, classKey) {
  var c = requireClass_(ctx, classKey);
  var school = Directory.getSchool(ctx.actor.schoolId);
  var fileId = currentFile_(ctx.actor);
  var students = Directory.listClassStudents(ctx.actor.schoolId, c);
  return { classKey: c, grade: gradeOf_(c), school: school, terms: termsOf_(school.termSystem), fileId: fileId,
    students: students, emails: students.map(function (s) { return s.email; }), subjects: gradeSubjects_(fileId, gradeOf_(c)) };
}

// ================= 共通 =================

/** 最初の表示。役割はサーバーが決める。 */
function bootstrap(actingAs) {
  return guard_(function () {
    var ctx = getContext_(actingAs);
    var a = ctx.actor;
    var base = { role: a.role, name: a.name, version: APP_VERSION, isDemo: isDemoMode_(), isAdmin: !!ctx.isAdmin };
    if (a.role === 'admin') return base;
    var school = Directory.getSchool(a.schoolId);
    var counts = {};
    Directory.listSchoolClasses(a.schoolId).forEach(function (x) { counts[x.classKey] = x.count; });
    base.schoolName = school.schoolName;
    base.termSystem = school.termSystem;
    base.terms = termsOf_(school.termSystem);
    base.fiscalYear = fiscalYearOf_(today_());
    base.isSetup = a.isSetup;
    base.classes = a.classes.map(function (k) { return { classKey: k, label: classLabel_(k), grade: gradeOf_(k), count: counts[k] || 0 }; });
    return base;
  });
}

/** クラスの成績のデータ（名簿・教科・テスト・点数・手で入れた値）。 */
function getClassData(classKey, actingAs) {
  return guard_(function () {
    var ctx = getContext_(actingAs);
    var cc = classContext_(ctx, classKey);
    var scores = {};
    Store.list(cc.fileId, Store.classSheet('scores', cc.classKey)).forEach(function (r) {
      if (cc.emails.indexOf(r.studentEmail) === -1) return;
      var v = {};
      try { v = JSON.parse(r.values); } catch (e) { v = {}; }
      (scores[r.testId] = scores[r.testId] || {})[r.studentEmail] = v;
    });
    var manual = {};
    Store.list(cc.fileId, Store.classSheet('manual', cc.classKey)).forEach(function (r) {
      if (cc.emails.indexOf(r.studentEmail) === -1 || r.value === '') return;
      manual[[r.studentEmail, r.subject, r.term, r.field].join('|')] = r.value;
    });

    var crit = criteriaOf_(cc.fileId, cc.classKey);
    return {
      criteria: crit.criteria, hyoteiRules: crit.hyoteiRules, peers: null,
      classKey: cc.classKey, label: classLabel_(cc.classKey), grade: cc.grade, termSystem: cc.school.termSystem, terms: cc.terms,
      students: cc.students.map(function (s) { return { key: s.email, no: s.number, name: s.name }; }),
      subjects: cc.subjects, tests: testsOfClass_(cc.fileId, cc.classKey), scores: scores, manual: manual,
      sameGrade: ctx.actor.classes.filter(function (k) { return k !== cc.classKey && gradeOf_(k) === cc.grade; })
        .map(function (k) { return { classKey: k, label: classLabel_(k) }; }),
      canEditSubjects: !!ctx.actor.isSetup
    };
  });
}

/** クラスの評価の基準（'教科|学期' → {kanten, unit}）と評定の表（教科 → {AAA:'3',…}）。 */
function criteriaOf_(fileId, classKey) {
  var out = { criteria: {}, hyoteiRules: {} };
  Store.list(fileId, 'criteria', function (o) { return o.classKey === classKey; }).forEach(function (o) {
    var v;
    try { v = JSON.parse(o.value); } catch (e) { return; }
    if (o.term === HYOTEI_RULE_TERM) out.hyoteiRules[o.subject] = v; else out.criteria[o.subject + '|' + o.term] = v;
  });
  return out;
}
function writeCriteria_(fileId, classKey, subject, term, value, by) {
  Store.upsert(fileId, 'criteria', function (o) { return o.key; },
    [{ key: [classKey, subject, term].join('|'), classKey: classKey, subject: subject, term: term, value: JSON.stringify(value), updatedAt: now_(), updatedBy: by }]);
}
/**
 * 学年のほかのクラスの点数（名前・メール・番号は入れない）。担任が基準を決めるときに、学年の人数をくらべるため。
 * 並びはクラスごとにばらばらにする（名簿の順から子どもを推測させない）。テストの名前・配点・点数だけを返す。
 */
function peersOf_(cc) {
  var sid = cc.school.schoolId;
  return Directory.listSchoolClasses(sid).filter(function (c) { return c.classKey !== cc.classKey && gradeOf_(c.classKey) === cc.grade; }).map(function (c) {
    var emails = Directory.listClassStudents(sid, c.classKey).map(function (x) { return x.email; });
    for (var i = emails.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = emails[i]; emails[i] = emails[j]; emails[j] = t; }
    var byTest = {};
    Store.list(cc.fileId, Store.classSheet('scores', c.classKey)).forEach(function (r) {
      var v;
      try { v = JSON.parse(r.values); } catch (e) { return; }
      (byTest[r.testId] = byTest[r.testId] || {})[r.studentEmail] = v;
    });
    return {
      label: classLabel_(c.classKey), n: emails.length,
      tests: testsOfClass_(cc.fileId, c.classKey).map(function (t) {
        var sc = byTest[t.testId] || {};
        return { subject: t.subject, term: t.term, name: t.name, points: t.points, rows: emails.map(function (e) { return sc[e] || null; }) };
      })
    };
  });
}

/**
 * 学年のほかのクラスの点数（名前なし）。重いので、クラスの画面を出したあとに、別に読む。
 * 2分のあいだはキャッシュから返す（タブを切りかえるたびに読み直さない）。
 */
function getPeers(classKey, actingAs) {
  return guard_(function () {
    var ctx = getContext_(actingAs);
    var cc = classContext_(ctx, classKey);
    var cs = null, key = 'peers1:' + cc.fileId.slice(-12) + ':' + cc.classKey;
    try { cs = CacheService.getScriptCache(); } catch (e) { cs = null; }
    if (cs) {
      try { var hit = cs.get(key); if (hit) return JSON.parse(hit); } catch (e) { /* 読み直す */ }
    }
    var peers = peersOf_(cc);
    if (cs) {
      try { var json = JSON.stringify(peers); if (json.length < 95000) cs.put(key, json, 120); } catch (e) { /* 置けなくてもよい */ }
    }
    return peers;
  });
}

/** 評価の基準を保存する（クラス×教科×学期）。 */
function saveCriteria(classKey, subject, term, value, actingAs) {
  return guard_(function () {
    var ctx = getContext_(actingAs);
    var cc = classContext_(ctx, classKey);
    var sub = cc.subjects.filter(function (x) { return x.name === subject; })[0];
    if (!sub) throw appError_('この学年の教科ではありません。');
    if (cc.terms.indexOf(term) === -1) throw appError_('学期が正しくありません。');
    var v = validateCriteria_(value, sub);
    writeCriteria_(cc.fileId, cc.classKey, sub.name, term, v, ctx.me);
    return { criteria: v };
  });
}

/** 評定の表を保存する（クラス×教科）。 */
function saveHyoteiRule(classKey, subject, rule, actingAs) {
  return guard_(function () {
    var ctx = getContext_(actingAs);
    var cc = classContext_(ctx, classKey);
    var sub = cc.subjects.filter(function (x) { return x.name === subject; })[0];
    if (!sub) throw appError_('この学年の教科ではありません。');
    var v = validateHyoteiRule_(rule, sub);
    writeCriteria_(cc.fileId, cc.classKey, sub.name, HYOTEI_RULE_TERM, v, ctx.me);
    return { rule: v };
  });
}

/** 評価の基準（学期）か評定の表（term='評定'）を、同じ学年のほかのクラス（その先生の担当）にも写す。 */
function copyCriteriaToClasses(classKey, subject, term, targets, actingAs) {
  return guard_(function () {
    var ctx = getContext_(actingAs);
    var cc = classContext_(ctx, classKey);
    if (cc.terms.indexOf(term) === -1 && term !== HYOTEI_RULE_TERM) throw appError_('時期が正しくありません。');
    var mine = criteriaOf_(cc.fileId, cc.classKey);
    var value = term === HYOTEI_RULE_TERM ? mine.hyoteiRules[subject] : mine.criteria[subject + '|' + term];
    if (!value) throw appError_('先に、このクラスで保存してください。');
    checkArray_(targets, 30);
    var done = [];
    targets.forEach(function (k) {
      var tk = requireClass_(ctx, k);
      if (tk === cc.classKey || gradeOf_(tk) !== cc.grade) throw appError_('写せるのは、同じ学年のほかのクラスだけです。');
      writeCriteria_(cc.fileId, tk, subject, term, value, ctx.me);
      done.push(classLabel_(tk));
    });
    return { copied: done };
  });
}

/** テストの登録（クラス×教科×学期のテストをまるごと入れかえる）。消したテストの点数も消す。 */
function saveTests(classKey, subject, term, tests, actingAs) {
  return guard_(function () {
    var ctx = getContext_(actingAs);
    var cc = classContext_(ctx, classKey);
    var sub = cc.subjects.filter(function (s) { return s.name === subject; })[0];
    if (!sub) throw appError_('この学年の教科ではありません。');
    if (cc.terms.indexOf(term) === -1) throw appError_('学期が正しくありません。');
    var list = validateTests_(tests, sub);
    var before = testsOfClass_(cc.fileId, cc.classKey).filter(function (t) { return t.subject === sub.name && t.term === term; });
    var ids = before.map(function (t) { return t.testId; });
    list.forEach(function (t) { if (t.testId && ids.indexOf(t.testId) === -1) throw appError_('このクラスのテストではありません。'); });
    writeTests_(cc.fileId, cc.classKey, sub.name, term, list, ctx.me);
    var keep = list.map(function (t) { return t.testId; });
    var dropped = ids.filter(function (id) { return keep.indexOf(id) === -1; });
    if (dropped.length) {
      // 消す前に、テストと点数の控えを「trash」シートに残す（まちがえて消したときに戻せるように）
      var now = now_();
      var scoreRows = Store.list(cc.fileId, Store.classSheet('scores', cc.classKey), function (r) { return dropped.indexOf(r.testId) !== -1; });
      Store.upsert(cc.fileId, 'trash', function (o) { return o.key; }, before.filter(function (t) { return dropped.indexOf(t.testId) !== -1; }).map(function (t) {
        var sc = {};
        scoreRows.forEach(function (r) { if (r.testId === t.testId) sc[r.studentEmail] = r.values; });
        return { key: t.testId + '|' + now, classKey: cc.classKey, subject: sub.name, term: term,
          test: JSON.stringify({ testId: t.testId, name: t.name, points: t.points, order: t.order }), scores: JSON.stringify(sc), deletedAt: now, deletedBy: ctx.me };
      }));
      Store.replaceWhere(cc.fileId, Store.classSheet('scores', cc.classKey), function (r) { return dropped.indexOf(r.testId) !== -1; }, []);
    }
    return { tests: testsOfClass_(cc.fileId, cc.classKey) };
  });
}
function writeTests_(fileId, classKey, subject, term, list, by) {
  var now = now_();
  list.forEach(function (t) { if (!t.testId) t.testId = newId_(); });
  Store.replaceWhere(fileId, 'tests', function (o) { return o.classKey === classKey && o.subject === subject && o.term === term; },
    list.map(function (t) {
      return { testId: t.testId, classKey: classKey, subject: subject, term: term, order: t.order, name: t.name,
        points: JSON.stringify(t.points), updatedAt: now, updatedBy: by };
    }));
}

/**
 * 同じ学年のほかのクラスにテストを写す。名前が同じテストは配点を合わせ、無いテストは足す。
 * 写す先にしかないテスト（と、その点数）は消さない。写す先も、その先生の担当のクラスだけ。
 */
function copyTestsToClasses(classKey, subject, term, targets, actingAs) {
  return guard_(function () {
    var ctx = getContext_(actingAs);
    var cc = classContext_(ctx, classKey);
    if (cc.terms.indexOf(term) === -1) throw appError_('学期が正しくありません。');
    var src = testsOfClass_(cc.fileId, cc.classKey).filter(function (t) { return t.subject === subject && t.term === term; })
      .sort(function (a, b) { return a.order - b.order; });
    if (!src.length) throw appError_('写すテストがありません。');
    checkArray_(targets, 30);
    var done = [];
    targets.forEach(function (k) {
      var tk = requireClass_(ctx, k);
      if (tk === cc.classKey || gradeOf_(tk) !== cc.grade) throw appError_('写せるのは、同じ学年のほかのクラスだけです。');
      var have = testsOfClass_(cc.fileId, tk).filter(function (t) { return t.subject === subject && t.term === term; })
        .sort(function (a, b) { return a.order - b.order; });
      var merged = src.map(function (s) {
        var same = have.filter(function (h) { return h.name === s.name; })[0];
        return { testId: same ? same.testId : '', name: s.name, points: s.points };
      });
      have.forEach(function (h) { if (!src.some(function (s) { return s.name === h.name; })) merged.push({ testId: h.testId, name: h.name, points: h.points }); });
      merged.forEach(function (m, i) { m.order = i + 1; });
      writeTests_(cc.fileId, tk, subject, term, merged, ctx.me);
      done.push(classLabel_(tk));
    });
    return { copied: done };
  });
}

/** 点数を保存する。changes = [{studentEmail, testId, kanten, value}]（value '' は消す）。 */
function saveScores(classKey, changes, actingAs) {
  return guard_(function () {
    var ctx = getContext_(actingAs);
    var cc = classContext_(ctx, classKey);
    var byId = {};
    testsOfClass_(cc.fileId, cc.classKey).forEach(function (t) { byId[t.testId] = t; });
    var list = validateScoreChanges_(changes, cc.emails, byId);
    var grouped = {};
    list.forEach(function (c) {
      var k = c.testId + '|' + c.studentEmail;
      var g = grouped[k] = grouped[k] || { key: k, testId: c.testId, studentEmail: c.studentEmail, set: {} };
      g.set[c.kanten] = c.value;
    });
    list.forEach(function (c) { if (c.base !== undefined) (grouped[c.testId + '|' + c.studentEmail].base = grouped[c.testId + '|' + c.studentEmail].base || {})[c.kanten] = c.base; });
    var now = now_();
    var conflicts = [];
    // ロックの中で読み直した値が、画面で読みこんだ値（base）と違うマスは、ほかの人が先に変えたので上書きしない
    Store.upsert(cc.fileId, Store.classSheet('scores', cc.classKey), function (o) { return o.key; },
      Object.keys(grouped).map(function (k) { return grouped[k]; }),
      function (old, next) {
        var v = {}, changed = false;
        if (old) { try { v = JSON.parse(old.values); } catch (e) { v = {}; } }
        Object.keys(next.set).forEach(function (l) {
          var cur = v[l] === undefined || v[l] === null ? '' : String(v[l]);
          var want = String(next.set[l]);
          if (next.base && l in next.base && cur !== next.base[l] && cur !== want) {
            conflicts.push({ testId: next.testId, studentEmail: next.studentEmail, kanten: l, value: v[l] === undefined ? '' : v[l], by: old ? old.updatedBy : '' });
            return;
          }
          if (next.set[l] === '') delete v[l]; else v[l] = next.set[l];
          changed = true;
        });
        if (old && !changed) return old;
        return { key: next.key, testId: next.testId, studentEmail: next.studentEmail, values: JSON.stringify(v), updatedAt: now, updatedBy: ctx.me };
      });
    return { savedAt: now, count: list.length - conflicts.length, conflicts: conflictOut_(conflicts, cc) };
  });
}

/** 保存できなかったマス（ほかの人が先に変えた）を画面に返す形にする。変えた人は名前だけ（メールは返さない）。 */
function conflictOut_(conflicts, cc) {
  if (!conflicts.length) return [];
  var staff = {};
  Directory.listStaff(cc.school.schoolId).forEach(function (x) { staff[x.email] = x.name; });
  return conflicts.map(function (c) {
    var o = {};
    Object.keys(c).forEach(function (k) { if (k !== 'by') o[k] = c[k]; });
    o.byName = staff[normEmail_(c.by)] || 'ほかの先生';
    return o;
  });
}

/** 先生が入れる値（主体的に学習に取り組む態度・手直し）を保存する。 */
function saveManual(classKey, changes, actingAs) {
  return guard_(function () {
    var ctx = getContext_(actingAs);
    var cc = classContext_(ctx, classKey);
    var list = validateManualChanges_(changes, cc.emails, cc.subjects, cc.terms);
    var now = now_();
    var conflicts = [];
    Store.upsert(cc.fileId, Store.classSheet('manual', cc.classKey), function (o) { return o.key; }, list.map(function (c) {
      return { key: [c.studentEmail, c.subject, c.term, c.field].join('|'), studentEmail: c.studentEmail, subject: c.subject,
        term: c.term, field: c.field, value: c.value, base: c.base, updatedAt: now, updatedBy: ctx.me };
    }), function (old, next) {
      var cur = old ? old.value : '';
      if (next.base !== undefined && cur !== next.base && cur !== next.value) {
        conflicts.push({ studentEmail: next.studentEmail, subject: next.subject, term: next.term, field: next.field, value: cur, by: old ? old.updatedBy : '' });
        return old;
      }
      delete next.base;
      return next;
    });
    return { savedAt: now, count: list.length - conflicts.length, conflicts: conflictOut_(conflicts, cc) };
  });
}

// ================= 設定担当 =================

/** 設定担当: 学校の設定の画面（名簿の取り込みの状況・クラスと担任・教職員・学年の教科）。 */
function getSchoolSetup(actingAs) {
  return guard_(function () {
    var ctx = getContext_(actingAs);
    requireSetup_(ctx);
    var sid = ctx.actor.schoolId;
    var rosterId = SchoolRoster.ensure(sid);
    SchoolRoster.syncEditors(rosterId, sid);
    currentFile_(ctx.actor);
    var byClass = {};
    Directory.listAssignments(sid).forEach(function (a) {
      var c = byClass[a.classKey] = byClass[a.classKey] || { homeroom: '', assistants: [] };
      if (a.role === ASSIGN_ROLE.homeroom) c.homeroom = normEmail_(a.email); else c.assistants.push(normEmail_(a.email));
    });
    var classes = Directory.listSchoolClasses(sid);
    var rrow = Directory.getSchoolRosterRow(sid) || {};
    return {
      schoolName: Directory.getSchool(sid).schoolName,
      rosterSheetUrl: 'https://docs.google.com/spreadsheets/d/' + rosterId + '/edit',
      rosterLinked: !!rrow.sourceId, rosterImportedAt: rrow.importedAt || '',
      students: Directory.listStudents(sid).length,
      classes: classes.map(function (c) { var a = byClass[c.classKey] || { homeroom: '', assistants: [] }; return { classKey: c.classKey, label: classLabel_(c.classKey), count: c.count, homeroom: a.homeroom, assistants: a.assistants }; }),
      staff: Directory.listStaff(sid)
    };
  });
}

/** 設定担当: 担任・担当の割り当てをまるごと入れかえる（自分の学校の分だけ）。 */
function saveAssignments(classes, actingAs) {
  return guard_(function () {
    var ctx = getContext_(actingAs);
    requireSetup_(ctx);
    var sid = ctx.actor.schoolId;
    var rows = normalizeAssignments_(classes, Directory.listSchoolClasses(sid).map(function (c) { return c.classKey; }),
      Directory.listStaff(sid).map(function (x) { return x.email; }));
    var now = now_();
    Store.replaceWhere(getMasterId_(), 'assignments', function (o) { return o.schoolId === sid; }, rows.map(function (r) {
      return { schoolId: sid, classKey: r.classKey, email: r.email, role: r.role, updatedAt: now, updatedBy: ctx.me };
    }));
    Directory.clear();
    return { count: rows.length };
  });
}

/**
 * 設定担当: 名簿マスターのリンクを貼って、名簿を取り込む（url が空なら、前に貼った名簿マスターから取り込みなおす）。
 * 読むのは「児童生徒」「教職員」シートの決まった列だけ（住所・保護者などの列は読まない）。
 * 「学校」の列がこの学校の行だけを、取り込み用名簿シートに書く。画面には件数だけを返す。
 */
function importRoster(url, actingAs) {
  return guard_(function () {
    var ctx = getContext_(actingAs);
    requireSetup_(ctx);
    var sid = ctx.actor.schoolId;
    var school = Directory.getSchool(sid);
    var row = Directory.getSchoolRosterRow(sid) || {};
    var srcId = url ? sheetIdFromUrl_(url) : (row.sourceId || '');
    if (!srcId) throw appError_(url ? 'スプレッドシートのURLではないようです。名簿マスターのリンクをそのまま貼ってください。' : '名簿マスターのリンクを貼ってください。');
    var ss;
    try { ss = SpreadsheetApp.openById(srcId); } catch (e) {
      throw appError_('この名簿マスターを開けませんでした。アプリ管理者のアカウントで見られるファイルか、確かめてください。');
    }
    var now = now_();
    var parsed = parseRosterMaster_(readColumns_(ss, '児童生徒', MASTER_STUDENT_COLS), readColumns_(ss, '教職員', MASTER_STAFF_COLS), sid, school.schoolName, now);
    if (!parsed.roster.length && !parsed.staff.length) throw appError_('この名簿マスターに「' + school.schoolName + '」の行が見つかりませんでした。');
    var rosterId = SchoolRoster.ensure(sid);
    SchoolRoster.write(rosterId, sid, parsed);
    Store.withLock(function () {
      var sh = ensureSheetWithHeader_(SpreadsheetApp.openById(getMasterId_()), 'schoolRosters', SCHEMA.schoolRosters);
      var values = sh.getDataRange().getDisplayValues();
      for (var r = 1; r < values.length; r++) {
        if (values[r][0] !== sid) continue;
        sh.getRange(r + 1, SCHEMA.schoolRosters.indexOf('sourceId') + 1, 1, 2).setNumberFormat('@').setValues([[srcId, now]]);
      }
    });
    Directory.clear();
    var classes = {};
    parsed.roster.forEach(function (x) { if (x.status === 'active') classes[x.grade + '-' + x.classNo] = true; });
    return {
      students: parsed.roster.filter(function (x) { return x.status === 'active'; }).length,
      staff: parsed.staff.filter(function (x) { return x.status === 'active'; }).length,
      classes: Object.keys(classes).length, importedAt: now
    };
  });
}
/** シートの見出しから、決まった列だけを読む（ほかの列は読まない）。返すのは [見出し, 行...]。 */
function readColumns_(ss, sheetName, want) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh) throw appError_('「' + sheetName + '」シートがありません。名簿マスターのリンクか、確かめてください。');
  var last = sh.getLastRow();
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(function (h) { return String(h).trim(); });
  var names = Object.keys(want).map(function (k) { return want[k]; });
  var columns = names.map(function (n) {
    var i = head.indexOf(n);
    if (i === -1) throw appError_('名簿マスターの「' + sheetName + '」シートに「' + n + '」の列が見つかりません。');
    return last >= 2 ? sh.getRange(2, i + 1, last - 1, 1).getDisplayValues().map(function (r) { return r[0]; }) : [];
  });
  var out = [names];
  for (var r = 0; r < Math.max(0, last - 1); r++) out.push(columns.map(function (c) { return c[r]; }));
  return out;
}

// ================= アプリ管理者 =================

function adminView_() {
  var fy = fiscalYearOf_(today_());
  return {
    fiscalYear: fy,
    schoolList: SCHOOL_LIST.map(function (x) { return { schoolId: x[0], schoolName: x[1] }; }),
    schools: Directory.listSchools().filter(function (x) { return x.schoolId.indexOf(TEST_SCHOOL_PREFIX) !== 0; }).map(function (x) {
      return { schoolId: x.schoolId, schoolName: x.schoolName, active: Directory.isActive(x.active), termSystem: x.termSystem || '3学期制',
        setupTeachers: Directory.listSetupTeacherEmails(x.schoolId), students: Directory.listStudents(x.schoolId).length,
        hasDataFile: !!Directory.getOpenDataFileId(x.schoolId, fy) };
    })
  };
}
function getAdminView(actingAs) {
  return guard_(function () {
    requireAdmin_(getContext_(actingAs));
    Directory.clear();
    return adminView_();
  });
}
/** アプリ管理者: 学校と最初の設定担当を登録する（同じ学校コードなら設定担当を足す）。今年度データも作る。 */
function registerSchool(input, actingAs) {
  return guard_(function () {
    requireAdmin_(getContext_(actingAs));
    checkObject_(input);
    var schoolId = String(input.schoolId || '').trim();
    var listed = SCHOOL_LIST.filter(function (x) { return x[0] === schoolId; })[0];
    if (!listed) throw appError_('学校を一覧からえらんでください。');
    var schoolName = listed[1];
    var termSystem = TERM_LABELS[input.termSystem] ? input.termSystem : '3学期制';
    var email = normEmail_(input.email);
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw appError_('設定担当の先生のメールを入れてください。');
    var name = checkText_(input.teacherName, 40, '先生の名前');
    if (Directory.isRosterEmail(email)) throw appError_('このメールは児童の名簿にあるため、設定担当にできません。');
    Store.withLock(function () {
      var master = SpreadsheetApp.openById(getMasterId_());
      upsertRow_(ensureSheetWithHeader_(master, 'schools', SCHEMA.schools), function (r) { return r[0] === schoolId; }, [schoolId, schoolName, 'TRUE', termSystem]);
      upsertRow_(ensureSheetWithHeader_(master, 'teachers', SCHEMA.teachers), function (r) { return r[0] === schoolId && normEmail_(r[1]) === email; }, [schoolId, email, name, 'TRUE', 'setup']);
    });
    Directory.clear();
    startFiscalYear_(fiscalYearOf_(today_()));
    SchoolRoster.ensure(schoolId);
    return adminView_();
  });
}
/** アプリ管理者: 学校名・利用中／休止・学期制を直す。 */
function updateSchool(input, actingAs) {
  return guard_(function () {
    requireAdmin_(getContext_(actingAs));
    checkObject_(input);
    var schoolId = String(input.schoolId || '');
    var s = Directory.listSchools().filter(function (x) { return x.schoolId === schoolId; })[0];
    if (!s) throw appError_('その学校は登録されていません。');
    var next = [schoolId,
      input.schoolName === undefined ? s.schoolName : checkText_(input.schoolName, MAX_LEN.schoolName, '学校名'),
      input.active === undefined ? s.active : (input.active ? 'TRUE' : 'FALSE'),
      TERM_LABELS[input.termSystem] ? input.termSystem : (s.termSystem || '3学期制')];
    Store.withLock(function () {
      upsertRow_(ensureSheetWithHeader_(SpreadsheetApp.openById(getMasterId_()), 'schools', SCHEMA.schools), function (r) { return r[0] === schoolId; }, next);
    });
    Directory.clear();
    return adminView_();
  });
}
