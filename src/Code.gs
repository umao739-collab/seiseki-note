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

/** クラスの成績のデータ（名簿・教科・テスト・点数・手で入れた値・所見）。 */
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
    var shoken = {};
    Store.list(cc.fileId, Store.classSheet('shoken', cc.classKey)).forEach(function (r) {
      if (cc.emails.indexOf(r.studentEmail) === -1) return;
      shoken[r.studentEmail + '|' + r.term] = { text: r.text, at: r.updatedAt };
    });
    return {
      classKey: cc.classKey, label: classLabel_(cc.classKey), grade: cc.grade, termSystem: cc.school.termSystem, terms: cc.terms,
      students: cc.students.map(function (s) { return { key: s.email, no: s.number, name: s.name }; }),
      subjects: cc.subjects, tests: testsOfClass_(cc.fileId, cc.classKey), scores: scores, manual: manual, shoken: shoken,
      sameGrade: ctx.actor.classes.filter(function (k) { return k !== cc.classKey && gradeOf_(k) === cc.grade; })
        .map(function (k) { return { classKey: k, label: classLabel_(k) }; }),
      canEditSubjects: !!ctx.actor.isSetup
    };
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
    var now = now_();
    Store.upsert(cc.fileId, Store.classSheet('scores', cc.classKey), function (o) { return o.key; },
      Object.keys(grouped).map(function (k) { return grouped[k]; }),
      function (old, next) {
        var v = {};
        if (old) { try { v = JSON.parse(old.values); } catch (e) { v = {}; } }
        Object.keys(next.set).forEach(function (l) { if (next.set[l] === '') delete v[l]; else v[l] = next.set[l]; });
        return { key: next.key, testId: next.testId, studentEmail: next.studentEmail, values: JSON.stringify(v), updatedAt: now, updatedBy: ctx.me };
      });
    return { savedAt: now, count: list.length };
  });
}

/** 先生が入れる値（主体的に学習に取り組む態度・手直し）を保存する。 */
function saveManual(classKey, changes, actingAs) {
  return guard_(function () {
    var ctx = getContext_(actingAs);
    var cc = classContext_(ctx, classKey);
    var list = validateManualChanges_(changes, cc.emails, cc.subjects, cc.terms);
    var now = now_();
    Store.upsert(cc.fileId, Store.classSheet('manual', cc.classKey), function (o) { return o.key; }, list.map(function (c) {
      return { key: [c.studentEmail, c.subject, c.term, c.field].join('|'), studentEmail: c.studentEmail, subject: c.subject,
        term: c.term, field: c.field, value: c.value, updatedAt: now, updatedBy: ctx.me };
    }));
    return { savedAt: now, count: list.length };
  });
}

/** 所見を保存する。 */
function saveShoken(classKey, items, actingAs) {
  return guard_(function () {
    var ctx = getContext_(actingAs);
    var cc = classContext_(ctx, classKey);
    var list = validateShokenItems_(items, cc.emails, cc.terms);
    var now = now_();
    Store.upsert(cc.fileId, Store.classSheet('shoken', cc.classKey), function (o) { return o.key; }, list.map(function (c) {
      return { key: c.studentEmail + '|' + c.term, studentEmail: c.studentEmail, term: c.term, text: c.text, updatedAt: now, updatedBy: ctx.me };
    }));
    return { savedAt: now, count: list.length };
  });
}

/** 設定担当: 学年の教科・観点・基準を保存する。 */
function saveGradeSubjects(grade, subjects, actingAs) {
  return guard_(function () {
    var ctx = getContext_(actingAs);
    requireSetup_(ctx);
    var g = checkInt_(grade, 1, 6, '学年');
    var list = validateGradeSubjects_(subjects);
    var fileId = currentFile_(ctx.actor);
    Store.upsert(fileId, 'gradeSubjects', function (o) { return String(o.grade); },
      [{ grade: String(g), subjects: JSON.stringify(list), updatedAt: now_(), updatedBy: ctx.me }]);
    return { subjects: list };
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
    var fileId = currentFile_(ctx.actor);
    var byClass = {};
    Directory.listAssignments(sid).forEach(function (a) {
      var c = byClass[a.classKey] = byClass[a.classKey] || { homeroom: '', assistants: [] };
      if (a.role === ASSIGN_ROLE.homeroom) c.homeroom = normEmail_(a.email); else c.assistants.push(normEmail_(a.email));
    });
    var classes = Directory.listSchoolClasses(sid);
    var grades = [];
    classes.forEach(function (c) { var g = gradeOf_(c.classKey); if (grades.indexOf(g) === -1) grades.push(g); });
    return {
      schoolName: Directory.getSchool(sid).schoolName,
      rosterSheetUrl: 'https://docs.google.com/spreadsheets/d/' + rosterId + '/edit',
      students: Directory.listStudents(sid).length,
      classes: classes.map(function (c) { var a = byClass[c.classKey] || { homeroom: '', assistants: [] }; return { classKey: c.classKey, label: classLabel_(c.classKey), count: c.count, homeroom: a.homeroom, assistants: a.assistants }; }),
      staff: Directory.listStaff(sid),
      grades: grades.map(function (g) { return { grade: g, subjects: gradeSubjects_(fileId, g) }; })
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

// ================= アプリ管理者 =================

function adminView_() {
  var fy = fiscalYearOf_(today_());
  return {
    fiscalYear: fy,
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
    if (!/^[a-z0-9-]{2,30}$/.test(schoolId)) throw appError_('学校コードは、小文字の英数字とハイフンで2〜30字にしてください。');
    var schoolName = checkText_(input.schoolName, MAX_LEN.schoolName, '学校名');
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
