/* Scoring rules shared by the page (demo mode and result screens) and by the server, so both apply the same stars,
   the same pass mark and the same module-exam rules. In real accounts the server does the scoring (api/exam.js);
   the page only shows what it returns. */
(function (root) {
  var JOB_READY = 3;
  var EXAM_POINTS = 250;        // first pass of a module exam
  var STAR_POINTS = 100;        // per new star
  var PROJECT_POINTS = 150;     // accepted practical project
  var FIFTH_STAR_POINTS = 100;

  function levelFor(levels, pct) {
    var lv = levels[0];
    levels.forEach(function (l) { if (pct >= l.min) lv = l; });
    return lv;
  }
  /* 95% needs an accepted practical project for the fifth star; without one the award stops at four. */
  function awardFor(levels, pct, projectDone) {
    var lv = levelFor(levels, pct);
    if (lv.stars === 5 && !projectDone) return { stars: 4, label: levels[4].label, capped: true };
    return { stars: lv.stars, label: lv.label, capped: false };
  }
  function passMark(levels) { return levels[JOB_READY].min; }

  function skillsOfTrack(role, t, requiredOnly) {
    var out = [];
    t.groups.forEach(function (g) {
      if (requiredOnly && !g.required) return;
      g.skills.forEach(function (id) {
        var s = role.skills.filter(function (x) { return x.id === id; })[0];
        if (s) out.push(s);
      });
    });
    return out;
  }

  /* The questions of a module exam: an even share from each required sub-module (level 2 and up), then shuffled.
     `rand` is injectable so tests can be exact. */
  function shuffle(a, rand) {
    var x = a.slice();
    for (var i = x.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = x[i]; x[i] = x[j]; x[j] = t; }
    return x;
  }
  function drawModuleExam(role, t, rand) {
    rand = rand || Math.random;
    var req = skillsOfTrack(role, t, true), per = Math.ceil(t.questions / req.length), items = [];
    req.forEach(function (sk) {
      var pool = shuffle(sk.assessment.map(function (q, i) { return { q: q, i: i }; })
        .filter(function (x) { return x.q.lvl >= 2; }), rand);
      pool.slice(0, per).forEach(function (x) { items.push({ skill: sk.id, qid: x.q.qid || (sk.id + "-q" + (x.i + 1)) }); });
    });
    return shuffle(items, rand).slice(0, t.questions);
  }

  var api = { JOB_READY: JOB_READY, EXAM_POINTS: EXAM_POINTS, STAR_POINTS: STAR_POINTS, PROJECT_POINTS: PROJECT_POINTS,
              FIFTH_STAR_POINTS: FIFTH_STAR_POINTS, levelFor: levelFor, awardFor: awardFor, passMark: passMark,
              skillsOfTrack: skillsOfTrack, drawModuleExam: drawModuleExam };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CP_GRADING = api;
})(typeof window !== "undefined" ? window : globalThis);
