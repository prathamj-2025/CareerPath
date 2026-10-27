/* CareerPath.
   Two roles share one application: students learn and get assessed, admins manage
   content. All state is in memory for the session. */
(function () {
  "use strict";

  // The CareerPath mark: a mortarboard. Drawn in currentColor so it follows the surface it sits on.
  var CAP = '<svg viewBox="0 0 32 32" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 7 28 13 16 19 4 13Z"/><path d="M9 16.5v5.2c0 2.2 3.1 4 7 4s7-1.8 7-4v-5.2"/><path d="M28 13v7"/></svg>';
  var BRAND = '<a class="brand" href="/" data-action="home" aria-label="CareerPath home"><div class="brand-mark">' + CAP +
    '</div><div class="brand-name">career<span>path</span></div></a>';


  var ROLES = window.CP_ROLES;
  var LEVELS = window.CP_LEVELS;
  var SCHOOLS = ["USC", "UCLA", "NYU", "Georgia Tech", "UT Austin", "University of Michigan"];
  var MAJORS = ["Engineering Management", "Computer Science", "Business Administration",
                "Industrial Engineering", "Economics", "Data Science", "Information Systems"];

  var STAR = "&#9733;";
  var REAL = false;   // true when real accounts (Supabase) are switched on for this deployment

  /* ---------------- state ---------------- */

  var state = {
    users: [],
    userId: null,
    route: { name: "roadmap" },
    authTab: "login",
    authError: "",
    roleMenu: false,      // the role switcher in the top bar is open
    authBusy: false,      // a sign-in or sign-up request is in flight
    authNotice: null,     // { kind: "verify" | "reset-sent", email, info } shown instead of the forms
    authDraft: {},        // what was typed in the sign-up form, kept when an error re-draws it
    booting: false,       // restoring a saved session at start-up
    lessonIdx: 0,
    practiceState: {},    // key -> { hints revealed, answer shown, learner's attempt }
    projDraft: {},        // skillId -> { text, busy, err, hints } for the practical project
    quiz: null,
    exam: null,
    result: null,
    mexam: null,          // module exam in progress: { trackId, items, idx, answers }
    mresult: null,
    preview: null,        // { roleId, skillId, user }  set while an admin previews content
    adminSkill: null,     // { roleId, skillId }
    adminEdit: null,      // qid being edited, or "new"
    adminLesson: null,    // lesson index being edited
    adminHistory: null,   // qid whose version history is open
    adminStudent: null,   // student id whose profile is open
    studentFilter: { role: "all", school: "all", q: "" },

    onb: null,            // onboarding: resume, placement test, recommendation
    ch: null,             // { cid, busy, feedback } while a challenge is being worked on
    adminCh: null,        // challenge cid being edited, or "new"
    adminChReview: null   // challenge cid whose submissions are open
  };

  function uid() { return "u" + Math.random().toString(36).slice(2, 9); }

  function newUser(o) {
    return {
      id: uid(), name: o.name, email: o.email, password: o.password,
      role: o.role || "student",
      school: o.school, major: o.major, gradYear: o.gradYear, title: o.title || "",
      roleId: o.roleId || null, points: o.points || 0,
      progress: o.progress || {},
      seeded: !!o.seeded,
      resume: o.resume || null,          // { name, chars, skills, roles, kind } never uploaded anywhere
      placement: o.placement || null,    // { pct, right, total, perRole, perSkill, when }
      roleHistory: o.roleHistory || [],  // roadmaps left behind, never deleted
      challenges: o.challenges || {},    // cid -> submission
      mexams: o.mexams || {}             // trackId -> { best, attempts, passed, passedOn, history }
    };
  }

  function prog(user, skillId) {
    if (!user.progress[skillId]) {
      user.progress[skillId] = { stars: 0, best: 0, attempts: 0, project: false, projectSub: null, lessonsDone: [], history: [] };
    }
    return user.progress[skillId];
  }

  function me() { return state.users.filter(function (u) { return u.id === state.userId; })[0] || null; }
  function actor() { return state.preview ? state.preview.user : me(); }
  function isAdmin() { var u = me(); return !!u && u.role === "admin"; }

  function role(id) { return ROLES.filter(function (r) { return r.id === id; })[0] || null; }
  function skill(roleId, skillId) {
    var r = role(roleId); if (!r) return null;
    return r.skills.filter(function (s) { return s.id === skillId; })[0] || null;
  }
  function allSkills() {
    var out = [];
    ROLES.forEach(function (r) { r.skills.forEach(function (s) { out.push({ role: r, skill: s }); }); });
    return out;
  }

  /* ---------------- content versioning ----------------
     Graded content is versioned. An admin edit creates a draft; publishing
     retires the current version into the archive and raises the version number,
     so a score recorded against v2 stays explainable after v3 goes live. */

  function ensureVersioning() {
    allSkills().forEach(function (x) {
      var s = x.skill;
      if (!s.drafts) s.drafts = [];
      if (!s.archive) s.archive = [];
      s.assessment.forEach(function (q, i) {
        if (!q.qid) q.qid = s.id + "-q" + (i + 1);
        if (!q.v) q.v = 1;
      });
    });
  }

  function findQ(s, qid) {
    return s.assessment.filter(function (q) { return q.qid === qid; })[0] || null;
  }
  function draftFor(s, qid) {
    return s.drafts.filter(function (d) { return d.qid === qid; })[0] || null;
  }
  function allDrafts() {
    var out = [];
    allSkills().forEach(function (x) {
      x.skill.drafts.forEach(function (d) { out.push({ role: x.role, skill: x.skill, draft: d }); });
    });
    return out;
  }
  function archiveFor(s, qid) {
    return s.archive.filter(function (a) { return a.qid === qid; });
  }

  function publishDraft(s, qid) {
    var d = draftFor(s, qid);
    if (!d) return;
    if (d.isNew) {
      var nq = { qid: qid, v: 1, lvl: d.fields.lvl, q: d.fields.q, opts: d.fields.opts.slice(), a: d.fields.a, why: d.fields.why };
      s.assessment.push(nq);
    } else {
      var q = findQ(s, qid);
      if (q) {
        s.archive.push({ qid: qid, v: q.v, retired: today(),
          fields: { q: q.q, opts: q.opts.slice(), a: q.a, lvl: q.lvl, why: q.why } });
        q.q = d.fields.q; q.opts = d.fields.opts.slice(); q.a = d.fields.a;
        q.lvl = d.fields.lvl; q.why = d.fields.why; q.v = q.v + 1;
      }
    }
    s.drafts = s.drafts.filter(function (x) { return x.qid !== qid; });
  }

  function retireQuestion(s, qid) {
    var q = findQ(s, qid);
    if (!q) return;
    s.archive.push({ qid: qid, v: q.v, retired: today(), retiredOut: true,
      fields: { q: q.q, opts: q.opts.slice(), a: q.a, lvl: q.lvl, why: q.why } });
    s.assessment = s.assessment.filter(function (x) { return x.qid !== qid; });
    s.drafts = s.drafts.filter(function (x) { return x.qid !== qid; });
  }

  /* ---------------- scoring ---------------- */

  var GR = window.CP_GRADING;   // stars, pass mark and module-exam rules live in grading.js, shared with the server
  function levelFor(pct) { return GR.levelFor(LEVELS, pct); }

  function awardFor(pct, projectDone) { return GR.awardFor(LEVELS, pct, projectDone); }

  function starHTML(n, size) {
    var s = '<span class="stars"' + (size ? ' style="font-size:' + size + '"' : "") + ">";
    for (var i = 1; i <= 5; i++) s += i <= n ? STAR : '<span class="off">' + STAR + "</span>";
    return s + "</span>";
  }

  function totalStars(user) {
    if (user._stars != null) return user._stars;   // a classmate on the real board: only totals are known
    var r = role(user.roleId); if (!r) return 0;
    return r.skills.reduce(function (a, s) { return a + prog(user, s.id).stars; }, 0);
  }
  function maxStars(user) { var r = role(user.roleId); return r ? r.skills.length * 5 : 0; }
  function verifiedCount(user) {
    var r = role(user.roleId); if (!r) return 0;
    return r.skills.filter(function (s) { return prog(user, s.id).stars > 0; }).length;
  }
  /* Job-ready is 3 stars ("Job-ready proficiency" in CP_LEVELS). The roadmap counts
     progress in these, because "has any star" made one lucky quiz look like a skill. */
  var JOB_READY = GR.JOB_READY;
  function jobReadyCount(user) {
    if (user._ready != null) return user._ready;
    var r = role(user.roleId); if (!r) return 0;
    return r.skills.filter(function (s) { return prog(user, s.id).stars >= JOB_READY; }).length;
  }
  /* ---------------- main modules and certificates ----------------
     A role may group its skills into main modules (role.tracks). Stars stay per
     sub-module. A main module awards a certificate only after every required
     sub-module is job-ready AND the learner passes a module exam, whose questions
     are drawn from those sub-modules' assessments. Roles without tracks keep one
     certificate per skill. */

  function skillsOfTrack(r, t, requiredOnly) { return GR.skillsOfTrack(r, t, requiredOnly); }
  function trackOfSkill(r, skillId) {
    if (!r || !r.tracks) return null;
    return r.tracks.filter(function (t) {
      return skillsOfTrack(r, t, false).some(function (s) { return s.id === skillId; });
    })[0] || null;
  }
  function trackById(r, id) {
    return r && r.tracks ? (r.tracks.filter(function (t) { return t.id === id; })[0] || null) : null;
  }
  function mex(user, tid) {
    if (!user.mexams) user.mexams = {};
    if (!user.mexams[tid]) user.mexams[tid] = { best: 0, attempts: 0, passed: false, passedOn: "", history: [] };
    return user.mexams[tid];
  }
  function passMark() { return GR.passMark(LEVELS); }
  function trackStatus(user, r, t) {
    var req = skillsOfTrack(r, t, true);
    var ready = req.filter(function (s) { return prog(user, s.id).stars >= JOB_READY; });
    var opt = skillsOfTrack(r, t, false).filter(function (s) { return req.indexOf(s) === -1; });
    var optReady = opt.filter(function (s) { return prog(user, s.id).stars >= JOB_READY; });
    var m = mex(user, t.id);
    return { req: req, ready: ready, opt: opt, optReady: optReady, exam: m,
      eligible: ready.length === req.length && !!t.cert,
      certified: !!t.cert && m.passed,
      withBadge: opt.length > 0 && optReady.length === opt.length };
  }
  function certTitle(user, r, t) {
    var st = trackStatus(user, r, t);
    var badge = "";
    t.groups.forEach(function (g) { if (g.badge && st.withBadge) badge = " " + g.badge; });
    return t.cert + badge;
  }
  function certsFor(user) {
    var r = role(user.roleId); if (!r) return [];
    if (r.tracks) {
      return r.tracks.filter(function (t) { return t.cert && mex(user, t.id).passed; }).map(function (t) {
        var best = mex(user, t.id).best;
        return { skill: { id: t.id, name: certTitle(user, r, t) }, p: { stars: levelFor(best).stars, best: best }, track: t };
      });
    }
    return r.skills.filter(function (s) { return prog(user, s.id).stars >= 3; })
      .map(function (s) { return { skill: s, p: prog(user, s.id) }; });
  }
  function verifyId(user, skillId) {
    var src = user.id + "|" + user.roleId + "|" + skillId;
    var h = 0;
    for (var i = 0; i < src.length; i++) { h = (h * 31 + src.charCodeAt(i)) >>> 0; }
    var code = h.toString(36).toUpperCase().slice(0, 6);
    while (code.length < 6) code = "0" + code;
    return "CP-" + user.roleId.toUpperCase() + "-" + code;
  }

  /* ---------------- weekly challenge ----------------
     A challenge is scored by its rubric, which is a fixed set of criteria, so the
     score is reproducible and a student can see exactly why they got it. The AI
     writes the feedback around that score rather than deciding it, because a
     number that changes between two identical submissions cannot sit on a
     leaderboard. Status follows the same discipline as assessment questions:
     nothing that awards points goes live without a publish step. */

  var CHALLENGES = window.CP_CHALLENGES || [];

  function chById(cid) {
    return CHALLENGES.filter(function (c) { return c.cid === cid; })[0] || null;
  }
  function liveChallenge(roleId) {
    return CHALLENGES.filter(function (c) { return c.roleId === roleId && c.status === "live"; })[0] || null;
  }
  function chFor(roleId) {
    return CHALLENGES.filter(function (c) { return c.roleId === roleId; })
      .sort(function (a, b) { return b.week - a.week; });
  }
  var CH = window.CP_CHALLENGE;   // scoring and feedback wording live in challenge.js, shared with the server
  function words(text) { return CH.words(text); }
  // Weeks are numbered from the start of the programme, not the calendar.
  function nextWeek() {
    return CHALLENGES.reduce(function (a, c) { return Math.max(a, c.week); }, 0) + 1;
  }

  /* Rule-based scoring (challenge.js). Real accounts are scored on the server (api/grade-challenge.js);
     this copy scores demo accounts and rebuilds the per-criterion ticks for a saved answer. */
  function scoreChallenge(c, text) { return CH.score(c, text); }

  /* Real accounts: send the answer to the server, which checks the student, scores it with the fixed rubric,
     writes the review and saves it. This page only shows what comes back. */
  function submitToServer(user, c, text) {
    state.ch = { cid: c.cid, busy: true, err: "", draft: text };
    render();
    var fail = function (msg) {
      if (me() !== user) return;
      state.ch = { cid: c.cid, err: msg, draft: text };
      render();
    };
    CP_AUTH.token().then(function (t) {
      if (!t) return fail("Your session expired. Sign in again. Your answer is still here.");
      return fetch("/api/grade-challenge", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + t },
        body: JSON.stringify({ cid: c.cid, answer: text })
      }).then(function (r) {
        return r.json().catch(function () { return null; }).then(function (b) {
          if (me() !== user) return;
          if (!r.ok || !b || !b.submission) {
            var code = b && b.error && b.error.code;
            return fail(code === "not_configured" ? "Challenge scoring is not switched on yet. Please contact support." :
              code === "wrong_roadmap" ? "Your roadmap choice is still saving, or this challenge is for another roadmap. Wait a moment and try again; your answer is still here." :
              (b && b.error && b.error.message) || "Your answer could not be scored. Try again; it is still here.");
          }
          var x = b.submission;
          user.challenges[c.cid] = { text: b.submission.answer || text, pct: x.pct, met: x.met, hit: x.hit, of: x.of, words: x.words, short: x.short,
            when: serverDate(x.when), feedback: x.feedback || "", source: x.source || "rules" };
          if (!b.already && x.points) user.points += x.points;
          state.ch = { cid: c.cid };
          render();
          if (live.chOff) pollChBoard();
        });
      });
    }).catch(function () { fail("Could not reach the server. Your answer is still here, so try again."); });
  }
  function serverDate(iso) {
    var d = iso ? new Date(iso + "T00:00:00") : new Date();
    return isNaN(d) ? today() : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  /* Real accounts: the saved submissions come back from the database on sign-in. */
  function loadChallenges(u, tries) {
    CP_AUTH.rest("GET", "challenge_submissions?select=*&user_id=eq." + encodeURIComponent(u.id)).then(function (r) {
      if (state.userId !== u.id && state.finishUser !== u.id) return;
      if (r.error) { if ((tries || 0) < 4) setTimeout(function () { loadChallenges(u, (tries || 0) + 1); }, 8000); return; }
      (r.body || []).forEach(function (row) {
        var c = chById(row.challenge_id);
        if (!c) return;
        var res = CH.score(c, row.answer);
        u.challenges[c.cid] = { text: row.answer, pct: row.score, met: res.met, hit: row.hits, of: c.rubric.length, words: row.words,
          short: row.words < c.minWords, when: serverDate(String(row.created_at || "").slice(0, 10)), feedback: row.feedback || "",
          source: row.feedback && row.feedback.indexOf("No written review is available") !== 0 ? "ai" : "rules" };
      });
      render();
    });
  }

  function chSubmissions(cid) {
    var out = [];
    state.users.forEach(function (u) {
      if (u.role !== "student") return;
      var s = u.challenges[cid];
      if (s) out.push({ user: u, sub: s });
    });
    return out.sort(function (a, b) { return b.sub.pct - a.sub.pct; });
  }

  function chRank(user, cid) {
    var rows = chSubmissions(cid).filter(function (r) {
      return r.user.school === user.school;
    });
    var i = -1;
    rows.forEach(function (r, idx) { if (r.user.id === user.id) i = idx; });
    return { rows: rows, place: i + 1 };
  }

  /* ---------------- roadmap history ----------------
     Switching roadmaps never deletes anything. Progress is keyed per skill and
     skill ids are role-specific, so the stars are still there; this records the
     switch so a student can see what they left behind and go back to it. */

  function switchRoadmap(user, roleId) {
    if (user.roleId === roleId) return;
    if (user.roleId) {
      var r = role(user.roleId);
      var stars = totalStars(user), verified = verifiedCount(user);
      var prev = user.roleHistory.filter(function (h) { return h.roleId === user.roleId; })[0];
      if (prev) {
        prev.stars = stars; prev.verified = verified; prev.left = today(); prev.returns = (prev.returns || 0) + 1;
      } else {
        user.roleHistory.push({
          roleId: user.roleId, name: r.name, stars: stars, verified: verified,
          of: r.skills.length, left: today(), returns: 0
        });
      }
    }
    user.roleId = roleId;
  }

  /* ---------------- live leaderboard ----------------
     The board updates on screen without a reload. On a real deployment it is read from the database
     every 30 seconds. The preview copy has no shared database, so it generates sample classmates on a
     timer and the page says so in plain words rather than implying the numbers are real. */

  var live = { timer: null, flash: {}, feed: [], chFeed: [], rows: null, boardKey: "",
    off: null, topic: "", rtLive: false, rtTimer: null, rtDirty: false, ticks: 0,
    chRows: null, chKey: "", chOff: null, chTopic: "", chLive: false, chTimer: null, chDirty: false };
  var LIVE_ROUTES = ["roadmap", "leaderboard", "challenge"];

  function startLive() {
    if (REAL) {
      pollBoard(); listenBoard();
      if (state.route.name === "challenge") { pollChBoard(); listenCh(); } else stopListeningCh();
    }
    if (live.timer) return;
    // Real mode: the push from the database is the main path. This timer is the safety net, so it runs every
    // 30 seconds while the live connection is down and only every two minutes while it is up.
    live.timer = window.setInterval(REAL ? function () {
      if (live.rtLive && (++live.ticks % 4)) return;
      pollBoard();
      if (state.route.name === "challenge" && !(live.chLive && (live.ticks % 4))) pollChBoard();
    } : liveTick, REAL ? 30000 : 4200);
  }

  /* The same spelling of a school the database uses for channel names (board_slug in 006_realtime.sql). */
  function boardSlug(s) { return String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

  /* Real accounts: hear the moment anyone at this school and roadmap changes a score, and reload the board.
     The message carries no data, so the board is still read through the same function as before. */
  function listenBoard() {
    var user = me();
    if (!user || !user.school || !user.roleId || !window.CP_AUTH || !CP_AUTH.listen) return;
    var topic = "board:" + boardSlug(user.school) + ":" + user.roleId;
    if (live.topic === topic && live.off) return;
    stopListening();
    live.topic = topic;
    live.off = CP_AUTH.listen(topic, boardChanged, function (st) {
      var was = live.rtLive;
      live.rtLive = st === "live";
      if (live.rtLive && !was) pollBoard();      // catch up on anything missed while the line was down
      if (was !== live.rtLive) paintPill();
    });
  }
  /* The weekly challenge board is its own channel, "challenge:<id>", open to every college. */
  function listenCh() {
    var user = me(); var c = user && user.roleId ? liveChallenge(user.roleId) : null;
    if (!c || !window.CP_AUTH || !CP_AUTH.listen) return;
    var topic = "challenge:" + c.cid;
    if (live.chTopic === topic && live.chOff) return;
    stopListeningCh();
    live.chTopic = topic;
    live.chOff = CP_AUTH.listen(topic, chBoardChanged, function (st) {
      var was = live.chLive;
      live.chLive = st === "live";
      if (live.chLive && !was) pollChBoard();
      if (was !== live.chLive) paintPill();
    });
  }
  function stopListeningCh() {
    if (live.chOff) { live.chOff(); live.chOff = null; }
    live.chTopic = ""; live.chLive = false;
    if (live.chTimer) { window.clearTimeout(live.chTimer); live.chTimer = null; }
    live.chDirty = false;
  }
  function chBoardChanged() {
    if (live.chTimer) { live.chDirty = true; return; }
    pollChBoard();
    live.chTimer = window.setTimeout(function () {
      live.chTimer = null;
      if (live.chDirty) { live.chDirty = false; chBoardChanged(); }
    }, 700);
  }
  function pollChBoard() {
    var user = me();
    var c = user && user.role === "student" && user.roleId ? liveChallenge(user.roleId) : null;
    if (!REAL || !c || state.preview) return;
    CP_AUTH.rest("POST", "rpc/challenge_board", { p_challenge: c.cid }).then(function (r) {
      if (me() !== user || r.error) return;
      live.chRows = (r.body || []).map(function (x) {
        return { id: x.user_id, name: x.display_name, school: x.school, score: x.score, rank: x.rank, me: !!x.is_me };
      });
      live.chKey = c.cid;
      paintLive();
    });
  }

  function stopListening() {
    stopListeningCh();
    if (live.off) { live.off(); live.off = null; }
    live.topic = ""; live.rtLive = false;
    if (live.rtTimer) { window.clearTimeout(live.rtTimer); live.rtTimer = null; }
    live.rtDirty = false;
  }
  // Reload at once on the first message, then at most every 700 ms, so a burst of saves is one reload.
  function boardChanged() {
    if (live.rtTimer) { live.rtDirty = true; return; }
    pollBoard();
    live.rtTimer = window.setTimeout(function () {
      live.rtTimer = null;
      if (live.rtDirty) { live.rtDirty = false; boardChanged(); }
    }, 700);
  }
  /* "Live" is shown only while the push connection is actually up. */
  function livePill(kind) {
    var on = !REAL || (kind === "ch" ? live.chLive : live.rtLive);
    return '<span class="live-pill' + (on ? "" : " off") + '" data-live="pill"' + (kind ? ' data-kind="' + kind + '"' : "") + "><i></i>" + (on ? "Live" : "Refreshing") + "</span>";
  }
  function paintPill() {
    var pills = document.querySelectorAll('[data-live="pill"]');
    for (var i = 0; i < pills.length; i++) pills[i].outerHTML = livePill(pills[i].dataset.kind || "");
  }

  /* Real accounts: the board is read from the database every half minute. Peers appear by short name only. */
  function pollBoard() {
    var user = me();
    if (!REAL || !user || user.role !== "student" || !user.roleId || !user.school || state.preview) return;
    var key = user.roleId + "|" + user.school;
    CP_AUTH.rest("POST", "rpc/leaderboard", { p_roadmap: user.roleId, p_school: user.school }).then(function (r) {
      if (me() !== user || r.error) return;
      live.rows = (r.body || []).map(function (x) {
        return { id: x.user_id, name: x.display_name, points: x.points, stars: x.total_stars, ready: x.job_ready };
      });
      live.boardKey = key;
      paintLive();
    });
  }
  function stopLive() {
    if (live.timer) { window.clearInterval(live.timer); live.timer = null; }
    stopListening();
  }

  function livePeers(user) {
    return state.users.filter(function (u) {
      return u.seeded && u.role === "student" && u.school === user.school && u.roleId === user.roleId;
    });
  }

  function liveTick() {
    var user = me();
    if (!user || user.role !== "student" || !user.roleId) return;
    var peers = livePeers(user);
    if (!peers.length) return;

    var p = peers[Math.floor(Math.random() * peers.length)];

    // On the challenge screen, generate challenge submissions instead of stars, so the
    // board the student is actually looking at is the one that moves.
    if (state.route.name === "challenge") {
      var c = liveChallenge(user.roleId);
      if (!c) return;
      var idle = peers.filter(function (x) { return !x.challenges[c.cid]; });
      if (!idle.length) return;
      var q = idle[Math.floor(Math.random() * idle.length)];
      var pct = [40, 60, 60, 80, 80, 100][Math.floor(Math.random() * 6)];
      q.challenges[c.cid] = { text: "(submitted just now)", pct: pct,
        met: c.rubric.map(function (_, i) { return i < Math.round(pct / 100 * c.rubric.length); }),
        hit: Math.round(pct / 100 * c.rubric.length), of: c.rubric.length,
        words: 95 + Math.floor(Math.random() * 130), short: false, when: today(),
        feedback: "", source: "rules" };
      q.points += 30 + Math.round(pct / 2);
      live.flash[q.id] = Date.now();
      live.chFeed.unshift({ name: q.name, pct: pct, at: Date.now() });
      live.chFeed = live.chFeed.slice(0, 4);
      paintLive();
      return;
    }

    var r = role(p.roleId);
    var open = r.skills.filter(function (s) { return prog(p, s.id).stars < 5; });
    if (!open.length) return;
    var s = open[Math.floor(Math.random() * open.length)];
    var pr = prog(p, s.id);

    pr.stars += 1;
    pr.best = Math.max(pr.best, 48 + pr.stars * 9);
    pr.attempts += 1;
    pr.history.push({ pct: pr.best, stars: pr.stars, when: today() });
    if (pr.stars === 5) pr.project = true;
    p.points += 100;

    live.flash[p.id] = Date.now();
    live.feed.unshift({ name: p.name, skill: s.name, stars: pr.stars, at: Date.now() });
    live.feed = live.feed.slice(0, 4);
    paintLive();
  }

  function fresh(id) { return live.flash[id] && Date.now() - live.flash[id] < 9000; }

  // Repaint only the board, so a half-typed answer elsewhere on the page survives.
  function paintLive() {
    var user = me();
    if (!user || user.role !== "student") return;
    var boards = document.querySelectorAll('[data-live="board"]');
    for (var i = 0; i < boards.length; i++) {
      boards[i].innerHTML = boardHTML(user, boards[i].dataset.compact === "1");
    }
    var sums = document.querySelectorAll('[data-live="summary"]');
    for (var s0 = 0; s0 < sums.length; s0++) sums[s0].innerHTML = summaryHTML(user);
    var feeds = document.querySelectorAll('[data-live="feed"]');
    for (var j = 0; j < feeds.length; j++) feeds[j].innerHTML = feedHTML();

    var boards2 = document.querySelectorAll('[data-live="chboard"]');
    for (var k = 0; k < boards2.length; k++) {
      var c = chById(boards2[k].dataset.cid);
      if (c) boards2[k].innerHTML = chBoardHTML(user, c);
    }
    var feeds2 = document.querySelectorAll('[data-live="chfeed"]');
    for (var m = 0; m < feeds2.length; m++) feeds2[m].innerHTML = chFeedHTML();
  }

  function feedHTML() {
    if (REAL) return "";
    if (!live.feed.length) return '<span class="tiny muted">Waiting for the next result.</span>';
    return live.feed.map(function (e, i) {
      return '<div class="feed-row' + (i === 0 ? " new" : "") + '"><span class="feed-dot"></span>' +
        "<span>" + esc(e.name.split(" ")[0]) + " reached " + e.stars + STAR + " in " + esc(e.skill) + "</span></div>";
    }).join("");
  }

  function peersOf(user) {
    if (REAL) {
      var rows = live.boardKey === user.roleId + "|" + user.school ? (live.rows || []) : [];
      var out = rows.filter(function (r) { return r.id !== user.id; }).map(function (r) {
        return { id: r.id, name: r.name, school: user.school, roleId: user.roleId, role: "student",
          points: r.points, _stars: r.stars, _ready: r.ready, progress: {} };
      });
      out.push(user);   // your own row always reflects what you see on screen
      return out.sort(function (a, b) { return b.points - a.points || totalStars(b) - totalStars(a); });
    }
    return state.users.filter(function (u) {
      return u.role === "student" && u.school === user.school && u.roleId === user.roleId;
    }).sort(function (a, b) { return b.points - a.points || totalStars(b) - totalStars(a); });
  }

  function boardHTML(user, compact) {
    var rows = peersOf(user);
    if (compact) rows = rows.slice(0, 6);
    return '<table class="grid">' +
      "<thead><tr><th></th><th>Student</th>" + (compact ? "" : "<th>Stars</th><th>Job-ready skills</th>") +
        "<th>Points</th></tr></thead><tbody>" +
      rows.map(function (u, i) {
        var cls = (u.id === user.id ? "lb-you " : "") + (fresh(u.id) ? "lb-move" : "");
        return '<tr class="' + cls.trim() + '">' +
          '<td><span class="rank ' + (i < 3 ? "top" : "") + '">' + (i + 1) + "</span></td>" +
          "<td>" + esc(compact ? u.name.split(" ")[0] + " " + (u.name.split(" ")[1] || "").charAt(0) + "." : u.name) +
            (u.id === user.id ? ' <span class="pill accent">You</span>' : "") + "</td>" +
          (compact ? "" :
            "<td>" + starHTML(Math.round(totalStars(u) / Math.max(1, role(u.roleId).skills.length))) +
              ' <span class="mono tiny muted">' + totalStars(u) + "</span></td>" +
            '<td class="mono">' + jobReadyCount(u) + " / " + role(u.roleId).skills.length + "</td>") +
          '<td class="mono">' + u.points + "</td></tr>";
      }).join("") + "</tbody></table>";
  }

  // The four figures above the board. Repainted with the board so they never disagree with it.
  function summaryHTML(user) {
    var mine = peersOf(user);
    var place = 0;
    mine.forEach(function (u, i) { if (u.id === user.id) place = i + 1; });
    return summaryCell("Your place", place + "<small> of " + mine.length + "</small>") +
      summaryCell("Your points", String(user.points)) +
      summaryCell("Leader", '<span style="font-size:15px;font-family:var(--sans)">' +
        esc(mine.length ? mine[0].name.split(" ")[0] : "&mdash;") + "</span>") +
      summaryCell("Points to next", place > 1 ? String(mine[place - 2].points - user.points) : "&mdash;");
  }

  function liveNote() {
    if (REAL) {
      return '<p class="tiny muted">Ranked from every student\u2019s saved results at your school on this roadmap. ' +
        "It moves the moment anyone\u2019s score changes. Other students appear by first name and last initial only. " +
        "You can hide yourself on your Profile page.</p>";
    }
    return '<p class="tiny muted">The classmates on this board are samples, and their results are simulated, because this ' +
      "preview copy has no shared database. On the live site the board is built from real students&rsquo; saved results.</p>";
  }

  /* ---------------- saved accounts ----------------
     Accounts people create (sign-up or Google) are kept in this browser so signing out,
     refreshing or coming back later does not start from scratch. There is still no server
     database: nothing leaves the browser, and other browsers or devices do not see it.
     Storage can be blocked (private window, preview), so every access is guarded. */

  var ACCOUNTS_KEY = "cp-accounts";
  var BUILT_IN = {};   // emails of the demo accounts, which are rebuilt on every load

  /* With real accounts, other people who used this browser must never show up on this student's
     leaderboard or in the admin list. Their saved copies wait in the stash (by account id) and only
     the signed-in student's copy is brought into state.users. */
  var stash = {};

  function saveAccounts() {
    syncProfile();
    try {
      var mine = state.users.filter(function (u) {
        return u.role === "student" && !u.seeded && !u.remote && !BUILT_IN[String(u.email).toLowerCase()];
      });
      if (REAL) {
        mine.forEach(function (u) { stash[u.id] = u; });
        mine = Object.keys(stash).map(function (k) { return stash[k]; });
      }
      window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(mine));
    } catch (e) { /* storage unavailable: the app still works for this visit */ }
  }

  /* Data Analyst and Financial Analyst are no longer offered. A student who was on one is
     moved to the roadmap picker; the stars they earned stay in their history. */
  var RETIRED = { da: "Data Analyst", fa: "Financial Analyst" };
  function retireRoadmap(u) {
    if (!u.roleId || role(u.roleId) || !RETIRED[u.roleId]) return;
    var suffix = "-" + u.roleId, stars = 0, verified = 0, of = 0;
    Object.keys(u.progress || {}).forEach(function (k) {
      if (k.slice(-suffix.length) !== suffix) return;
      var st = (u.progress[k] && u.progress[k].stars) || 0;
      stars += st; if (st >= 3) verified++;
    });
    of = Object.keys(u.progress || {}).filter(function (k) { return k.slice(-suffix.length) === suffix; }).length || 5;
    u.roleHistory.push({ roleId: u.roleId, name: RETIRED[u.roleId], stars: stars, verified: verified,
      of: of, left: today(), returns: 0, retired: true });
    u.roleId = null;
  }

  function loadAccounts() {
    state.users.forEach(function (u) { BUILT_IN[String(u.email).toLowerCase()] = true; });
    try {
      var raw = window.localStorage.getItem(ACCOUNTS_KEY);
      if (!raw) return;
      var list = JSON.parse(raw);
      if (!Array.isArray(list)) return;
      list.forEach(function (u) {
        if (!u || !u.email || !u.id || u.role !== "student" || BUILT_IN[String(u.email).toLowerCase()]) return;
        u.seeded = false;
        u.progress = u.progress || {};
        u.challenges = u.challenges || {};
        u.mexams = u.mexams || {};
        u.roleHistory = u.roleHistory || [];
        retireRoadmap(u);
        if (REAL) stash[u.id] = u; else state.users.push(u);
      });
    } catch (e) { /* damaged or blocked storage: start with the demo accounts only */ }
  }

  /* ---------------- real accounts (Supabase) ----------------
     The profile row in the database is the source of truth for name, school, major, graduation year,
     role, the chosen roadmap, the roadmaps left behind, and the resume and placement summaries.
     Progress and scores still live in this browser until the progress step moves them too. */

  var sync = { last: "", timer: null, busy: false, skills: {}, mods: {}, progressReady: false };

  /* The profile columns the site writes, always in the same order so two copies compare as equal text. */
  function patchFrom(f) {
    return {
      name: f.name || "", school: f.school || "", major: f.major || "", grad_year: String(f.gradYear || ""),
      roadmap_id: f.roleId || null, roadmap_history: f.roleHistory || [],
      onboarding: { resume: f.resume || null, placement: f.placement || null },
      show_on_leaderboard: f.showOnBoard !== false
    };
  }
  function profilePatch(u) { return patchFrom(u); }

  /* Local progress shapes <-> database rows.
     Scores, stars, points, attempts and the project are written by the server only (api/exam.js, api/grade-project.js),
     and the database refuses them from the page. The page saves one thing itself: which lessons were opened. */
  function lessonsKey(p) { return JSON.stringify((p.lessonsDone || []).slice().sort(function (a, b) { return a - b; })); }
  /* Saved history -> the scored attempts, plus the project submission kept apart from them. */
  function splitHistory(raw) {
    var list = Array.isArray(raw) ? raw : [], sub = null, hist = [];
    list.forEach(function (h) {
      if (h && h.kind === "project") { sub = Object.assign({}, h); delete sub.kind; } else hist.push(h);
    });
    return { history: hist, sub: sub };
  }
  /* A skill the student only opened has nothing worth saving. */
  function blankSkill(p) { return !p.attempts && !p.stars && !p.project && !p.projectSub && !(p.lessonsDone && p.lessonsDone.length); }

  function pendingRows(u) {
    var sk = [];
    if (!sync.progressReady) return { sk: sk };   // never write before the saved copy has been read
    Object.keys(u.progress || {}).forEach(function (id) {
      var p = u.progress[id];
      if (!p || !(p.lessonsDone && p.lessonsDone.length)) return;
      var j = lessonsKey(p);
      if (sync.skills[id] !== j) sk.push({ id: id, j: j, done: JSON.parse(j) });
    });
    return { sk: sk };
  }

  function syncProfile() {
    if (!REAL || sync.busy) return;
    var u = me();
    if (!u || u.role !== "student") return;
    var pend = pendingRows(u);
    if (JSON.stringify(profilePatch(u)) === sync.last && !pend.sk.length) return;
    clearTimeout(sync.timer);
    sync.timer = setTimeout(function () { flushProfile(u.id); }, 800);
  }

  function flushProfile(id) {
    var u = me();
    if (!u || u.id !== id || sync.busy) return;
    var body = JSON.stringify(profilePatch(u)), pend = pendingRows(u), jobs = [];
    sync.busy = true;
    if (body !== sync.last) {
      jobs.push(CP_AUTH.saveProfile(JSON.parse(body)).then(function (r) { if (!r.error) sync.last = body; return r; }));
    }
    pend.sk.forEach(function (x) {
      jobs.push(CP_AUTH.rest("POST", "rpc/save_lessons", { p_skill: x.id, p_done: x.done }, "return=minimal").then(function (r) {
        if (!r.error) sync.skills[x.id] = x.j;
        return r;
      }));
    });
    Promise.all(jobs).then(function (rs) {
      sync.busy = false;
      if (rs.some(function (r) { return r.error; })) sync.timer = setTimeout(syncProfile, 15000);   // try again shortly
      else syncProfile();                                                                           // pick up changes made meanwhile
    });
  }

  function adoptProfile(p) {
    var u = state.users.filter(function (x) { return x.id === p.id; })[0];
    if (!u && stash[p.id]) { u = stash[p.id]; state.users.push(u); }
    if (!u) {
      u = newUser({ name: p.name, email: p.email, role: "student", school: p.school, major: p.major, gradYear: p.grad_year });
      u.id = p.id; u.password = null; state.users.push(u);
    }
    u.name = p.name || u.name; u.email = p.email; u.role = p.role === "admin" ? "admin" : "student";
    u.school = p.school; u.major = p.major; u.gradYear = p.grad_year; u.title = p.title || "";
    u.picture = p.picture_url || u.picture || null;
    u.progress = u.progress || {}; u.challenges = u.challenges || {}; u.mexams = u.mexams || {};
    var ob = p.onboarding || {};
    var hist = Array.isArray(p.roadmap_history) ? p.roadmap_history : [];
    var server = { name: p.name, school: p.school, major: p.major, gradYear: p.grad_year,
      roleId: role(p.roadmap_id) ? p.roadmap_id : null, roleHistory: hist, resume: ob.resume || null,
      placement: ob.placement || null, points: p.points || 0, showOnBoard: p.show_on_leaderboard !== false };
    if (p.roadmap_id || hist.length || ob.resume || ob.placement) {
      u.roleId = server.roleId; u.roleHistory = hist; u.resume = server.resume; u.placement = server.placement;
      retireRoadmap(u);
    }
    u.showOnBoard = server.showOnBoard;
    // Points are set by the server alone, so the saved total is the truth.
    u.points = server.points;
    sync.last = JSON.stringify(patchFrom(server));   // what the server holds now; anything different is sent on the next save
    return u;
  }

  /* Merge the saved progress with what this browser already holds. More attempts wins; lessons done are combined. */
  function adoptProgress(u, skillRows, modRows) {
    sync.skills = {}; sync.mods = {};
    function union(a, b) {
      var out = (a || []).slice();
      (b || []).forEach(function (i) { if (out.indexOf(i) < 0) out.push(i); });
      return out.sort(function (x, y) { return x - y; });
    }
    (skillRows || []).forEach(function (r) {
      var sp = splitHistory(r.history);
      var srv = { stars: r.stars, best: r.best, attempts: r.attempts, project: r.project, projectSub: sp.sub,
        lessonsDone: (r.lessons_done || []).slice(), history: sp.history };
      sync.skills[r.skill_id] = lessonsKey(srv);
      var loc = u.progress[r.skill_id];
      // The server owns every score. This browser only adds lessons it opened that the server has not seen yet.
      var merged = Object.assign({}, srv);
      merged.lessonsDone = union(srv.lessonsDone, loc && loc.lessonsDone);
      u.progress[r.skill_id] = merged;
    });
    (modRows || []).forEach(function (r) {
      // Module exam results are written by the server only, so the saved copy is the truth.
      var merged = { best: r.best, attempts: r.attempts, passed: r.passed, passedOn: r.passed_on || "", history: r.history || [] };
      u.mexams[r.track_id] = merged;
    });
    sync.progressReady = true;
  }

  function loadProgress(u, tries) {
    return Promise.all([
      CP_AUTH.rest("GET", "skill_progress?select=*&user_id=eq." + encodeURIComponent(u.id)),
      CP_AUTH.rest("GET", "module_results?select=*&user_id=eq." + encodeURIComponent(u.id))
    ]).then(function (rs) {
      if (state.userId !== u.id && state.finishUser !== u.id) return;               // signed out meanwhile
      if (rs[0].error || rs[1].error) {
        // Never save over the stored copy without having read it. Try again shortly.
        if ((tries || 0) < 6) setTimeout(function () { loadProgress(u, (tries || 0) + 1); }, 10000);
        return;
      }
      adoptProgress(u, rs[0].body, rs[1].body);
      render();
    });
  }

  function startSession() {
    state.booting = true; state.authBusy = true; render();
    sync.progressReady = false; sync.skills = {}; sync.mods = {};
    return CP_AUTH.profile().then(function (r) {
      state.booting = false; state.authBusy = false;
      if (r.error) {
        if (r.error.code !== "network") CP_AUTH.signOut();
        state.authError = r.error.text; return render();
      }
      var u = adoptProfile(r.profile);
      if (u.role === "student" && !u.school) {
        /* First time with Google: the account has a name and email but not the three profile details
           the leaderboards need. Ask for them before going on. */
        state.finishUser = u.id; state.userId = null;
        state.googlePending = { name: u.name, email: u.email, picture: u.picture };
        loadProgress(u); loadChallenges(u);
        return render();
      }
      state.userId = u.id; state.authError = ""; state.authNotice = null;
      if (u.role === "student") { loadProgress(u); loadChallenges(u); }
      var fresh = u.role === "student" && !u.roleId && !u.resume && !u.placement && !u.roleHistory.length;
      if (u.role === "admin") { loadAdminData(); return goPage(pageFor(u, "a-content")); }
      if (fresh) { state.onb = { step: 1 }; return go("onb-resume"); }
      goPage(pageFor(u, u.roleId ? "roadmap" : "roles"));
    });
  }

  /* Admin: read every student from the database. Row-level rules let only admins do this.
     These copies live in memory for this visit only and are never written to the browser's storage. */
  function pageAll(table, params) {
    var out = [];
    function next(off) {
      return CP_AUTH.rest("GET", table + "?" + params + "&limit=1000&offset=" + off).then(function (r) {
        if (r.error) return r;
        out = out.concat(r.body || []);
        return (r.body || []).length === 1000 ? next(off + 1000) : { ok: true, body: out };
      });
    }
    return next(0);
  }

  /* The site files carry no answer keys. Admins fetch them after sign-in so the question bank and the preview can show them. */
  function loadAdminKeys() {
    return CP_AUTH.token().then(function (t) {
      if (!t) return;
      return fetch("/api/keys", { headers: { authorization: "Bearer " + t } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (b) {
        if (!b || !b.keys) return;
        ROLES.forEach(function (r) {
          r.skills.forEach(function (sk) {
            (b.keys[r.id + "/" + sk.id] || []).forEach(function (k) {
              var q = sk.assessment.filter(function (x) { return x.qid === k.qid; })[0];
              if (q) { q.a = k.a; q.why = k.why; }
            });
          });
        });
        render();
      });
    }).catch(function () { /* the bank shows no answers until the next sign-in */ });
  }

  function loadAdminData() {
    loadAdminKeys();
    return Promise.all([
      pageAll("profiles", "select=*&role=eq.student&order=created_at.asc"),
      pageAll("skill_progress", "select=*&order=user_id.asc,skill_id.asc"),
      pageAll("module_results", "select=*&order=user_id.asc,track_id.asc")
    ]).then(function (rs) {
      if (rs.some(function (r) { return r.error; }) || !isAdmin()) return;
      state.users = state.users.filter(function (u) { return !u.remote; });
      var byId = {};
      rs[0].body.forEach(function (p) {
        var ob = p.onboarding || {};
        var u = newUser({ name: p.name, email: p.email, role: "student", school: p.school, major: p.major, gradYear: p.grad_year,
          roleId: role(p.roadmap_id) ? p.roadmap_id : null, points: p.points, roleHistory: p.roadmap_history || [] });
        u.id = p.id; u.password = null; u.remote = true; u.resume = ob.resume || null; u.placement = ob.placement || null;
        byId[p.id] = u; state.users.push(u);
      });
      rs[1].body.forEach(function (r) {
        var u = byId[r.user_id]; if (!u) return;
        var sp = splitHistory(r.history);
        u.progress[r.skill_id] = { stars: r.stars, best: r.best, attempts: r.attempts, project: r.project, projectSub: sp.sub,
          lessonsDone: r.lessons_done || [], history: sp.history };
      });
      rs[2].body.forEach(function (r) {
        var u = byId[r.user_id]; if (!u) return;
        u.mexams[r.track_id] = { best: r.best, attempts: r.attempts, passed: r.passed, passedOn: r.passed_on || "", history: r.history || [] };
      });
      render();
    });
  }

  function authFail(r) {
    state.authBusy = false;
    if (r.error && r.error.code === "unconfirmed") {
      state.authNotice = { kind: "verify", email: val("li-email") || (state.authDraft && state.authDraft.email) || "" };
    } else state.authError = r.error ? r.error.text : "Something went wrong. Please try again.";
    render();
  }

  /* ---------------- seed ---------------- */

  function seed() {
    var student = null;
    if (!REAL) {
    student = newUser({
      name: "Pratham Jain", email: "student@careerpath.com", password: "student", role: "student",
      school: "USC", major: "Engineering Management", gradYear: "2027", roleId: "pm"
    });
    student.progress["foundations-pm"] = { stars: 3, best: 80, attempts: 2, project: false, lessonsDone: [0, 1, 2, 3],
      history: [{ pct: 60, stars: 1, when: "Sep 12, 2026" }, { pct: 80, stars: 3, when: "Sep 18, 2026" }] };
    student.progress["metrics-pm"] = { stars: 2, best: 70, attempts: 1, project: false, lessonsDone: [0, 1],
      history: [{ pct: 70, stars: 2, when: "Sep 16, 2026" }] };
    student.points = 500;
    state.users.push(student);

    state.users.push(newUser({
      name: "Dana Whitfield", email: "admin@careerpath.com", password: "admin", role: "admin",
      title: "Content Manager", school: "CareerPath", major: "", gradYear: ""
    }));
    }

    var classmates = [
      ["Priya Chavan", "USC", "pm", 1400, 5, 80], ["Marcus Webb", "USC", "pm", 1100, 4, 60],
      ["Ana Ruiz", "USC", "pm", 900, 4, 100], ["Dev Patel", "USC", "pm", 400, 2, 0],
      ["Sarah Kim", "USC", "pm", 300, 2, 40], ["Tom Alvarez", "USC", "pm", 200, 1, 0],
      ["Jing Liu", "USC", "ba", 1250, 5, 80], ["Noor Hassan", "USC", "ba", 800, 3, 60],
      ["Ellie Brandt", "USC", "pjm", 1500, 5, 75], ["Raj Menon", "UCLA", "pm", 1600, 5, 0]
    ];
    (REAL ? [] : classmates).forEach(function (c) {
      var u = newUser({ name: c[0], school: c[1],
        email: c[0].split(" ")[0].toLowerCase() + "@" + (c[1] === "USC" ? "usc.edu" : "ucla.edu"),
        password: "-", major: "Engineering Management", gradYear: "2027", roleId: c[2], points: c[3], seeded: true });
      var r = role(c[2]);
      r.skills.forEach(function (s, i) {
        if (i < c[4]) {
          var st = Math.max(1, 5 - i);
          u.progress[s.id] = { stars: st, best: 60 + st * 7, attempts: 1, project: st === 5,
            lessonsDone: [0, 1, 2], history: [{ pct: 60 + st * 7, stars: st, when: "Sep 2026" }] };
        }
      });
      // Some classmates have already attempted this week's challenge.
      var lc = liveChallenge(c[2]);
      if (lc && c[5]) {
        u.challenges[lc.cid] = { pct: c[5], hit: Math.round(c[5] / 100 * lc.rubric.length),
          of: lc.rubric.length, words: 110 + c[5], when: "Sep 28, 2026", met: [], source: "rules",
          text: "(submitted before you joined)" };
      }
      state.users.push(u);
    });

    // The signed-in student arrives with a resume already read, so the onboarding
    // result is visible on their profile without having to redo it.
    if (student) student.resume = { name: "PrathamJain_Resume.pdf", chars: 2410, kind: "pdf",
      skills: ["foundations-pm", "metrics-pm", "prd-pm", "experimentation-pm", "sql-ba", "agilebasics-pjm", "stakeholders-pjm"],
      roles: { pm: ["product manager"] }, when: "Sep 12, 2026" };
    if (student) student.placement = { answered: 8, total: 8, when: "Sep 12, 2026",
      perRole: { pm: { weight: 19, points: 6, signal: 1 }, ba: { weight: 9, points: 2, signal: 0.47 },
                 pjm: { weight: 7, points: 1, signal: 0.37 } },
      matches: { pm: 86, pjm: 41, ba: 38 } };
  }

  /* ---------------- helpers ---------------- */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function initials(name) {
    return name.split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase();
  }
  function today() {
    return new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }
  /* Lesson bodies use a small, safe subset of Markdown: ## and ### headings, - and 1. lists,
     fenced code, > key-point callouts, | tables |, **bold** and `code`. Everything is escaped
     first, so content can never inject markup. Old plain bodies still render as paragraphs. */
  function inline(t) {
    return esc(t)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }
  /* Line-based so a heading, list, table or callout is recognised even when the author did not
     leave a blank line around it. Blank lines still separate paragraphs. */
  function paras(text) {
    var out = [], parts = String(text).split(/^```[a-z]*\n?/m);
    /* Odd-numbered parts sit inside a fence. */
    parts.forEach(function (chunk, k) {
      if (k % 2 === 1) { out.push("<pre>" + esc(chunk.replace(/\n+$/, "")) + "</pre>"); return; }
      var mode = "", buf = [];
      function flush() {
        if (!buf.length) { mode = ""; return; }
        if (mode === "p") {
          var raw = buf.join("\n");
          if (/^(SELECT|WITH)\b/.test(raw.trim())) out.push("<pre>" + esc(raw) + "</pre>");
          else out.push("<p>" + inline(buf.join(" ")) + "</p>");
        } else if (mode === "quote") {
          out.push('<div class="keypt">' + buf.map(function (l) { return inline(l); }).join("<br>") + "</div>");
        } else if (mode === "table") {
          var rows = buf.filter(function (l) { return !/^\|[\s:|-]+\|?$/.test(l); }).map(function (l) {
            return l.replace(/^\||\|$/g, "").split("|").map(function (c) { return c.trim(); });
          });
          if (rows.length) {
            out.push('<div class="tbl"><table><thead><tr>' + rows[0].map(function (c) { return "<th>" + inline(c) + "</th>"; }).join("") +
              "</tr></thead><tbody>" + rows.slice(1).map(function (r) {
                return "<tr>" + r.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>";
              }).join("") + "</tbody></table></div>");
          }
        } else if (mode === "ul" || mode === "ol") {
          out.push("<" + mode + ">" + buf.map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</" + mode + ">");
        }
        buf = []; mode = "";
      }
      chunk.split("\n").forEach(function (line) {
        if (!line.trim()) { flush(); return; }
        var m;
        if ((m = /^(#{2,3}) +(.*)$/.exec(line))) {
          flush();
          out.push(m[1].length === 3 ? "<h4>" + inline(m[2]) + "</h4>" : "<h3>" + inline(m[2]) + "</h3>");
        } else if (/^> ?/.test(line)) {
          if (mode !== "quote") flush();
          mode = "quote"; buf.push(line.replace(/^> ?/, ""));
        } else if (/^\|/.test(line)) {
          if (mode !== "table") flush();
          mode = "table"; buf.push(line);
        } else if (/^- /.test(line)) {
          if (mode !== "ul") flush();
          mode = "ul"; buf.push(line.slice(2));
        } else if (/^\d+\. /.test(line)) {
          if (mode !== "ol") flush();
          mode = "ol"; buf.push(line.replace(/^\d+\. /, ""));
        } else if (/^ {2,}\S/.test(line) && (mode === "ul" || mode === "ol")) {
          buf[buf.length - 1] += " " + line.trim();
        } else {
          if (mode !== "p") flush();
          mode = "p"; buf.push(line);
        }
      });
      flush();
    });
    return out.join("");
  }
  /* A refresh keeps you on the page you were on. Only browsing pages are remembered, in this tab only (sessionStorage):
     an exam in progress or a result is not, because those need data the page no longer holds. */
  var KEEP_PAGES = ["roadmap", "roles", "track", "skill", "learn", "certs", "cert", "challenge", "leaderboard", "history", "profile",
    "a-content", "a-bank", "a-lessons", "a-drafts", "a-challenges", "a-students"];
  function rememberPage() {
    try {
      var r = state.route, u = me();
      if (u && !state.preview && KEEP_PAGES.indexOf(r.name) > -1) sessionStorage.setItem("cp-page", JSON.stringify({ uid: u.id, route: r }));
      else if (!u || !state.preview) sessionStorage.removeItem("cp-page");
    } catch (e) { /* storage can be blocked; the page then opens on the roadmap as before */ }
  }
  function forgetPage() { try { sessionStorage.removeItem("cp-page"); } catch (e) {} }
  function pageFor(u, fallback) {
    try {
      var saved = JSON.parse(sessionStorage.getItem("cp-page") || "null");
      if (saved && saved.uid === u.id && saved.route && KEEP_PAGES.indexOf(saved.route.name) > -1) {
        var admin = u.role === "admin", isAdminPage = saved.route.name.indexOf("a-") === 0;
        if (admin === isAdminPage || saved.route.name === "profile") return saved.route;
      }
    } catch (e) {}
    return { name: fallback };
  }
  function go(name, params) {
    state.roleMenu = false;
    state.route = Object.assign({ name: name }, params || {});
    rememberPage();
    window.scrollTo(0, 0);
    render();
  }
  function goPage(r) { var p = Object.assign({}, r); var n = p.name; delete p.name; go(n, p); }
  function summaryCell(k, v) {
    return '<div class="summary-cell"><div class="k">' + k + '</div><div class="v mono">' + v + "</div></div>";
  }

  /* ---------------- theme ----------------
     The control shows where it will take you, not where you are: a moon means
     "go dark". Following the system until someone chooses otherwise. */

  var SUN = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2' +
    'M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M20.5 14.3A8.6 8.6 0 0 1 9.7 3.5a8.6 8.6 0 1 0 10.8 10.8z"/></svg>';

  function themeNow() {
    var set = document.documentElement.getAttribute("data-theme");
    if (set) return set;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function themeBtn(extra) {
    var dark = themeNow() === "dark";
    var label = dark ? "Switch to light mode" : "Switch to dark mode";
    return '<button class="btn sm ghost icon-btn' + (extra ? " " + extra : "") + '" data-action="theme" ' +
      'title="' + label + '" aria-label="' + label + '">' + (dark ? SUN : MOON) + "</button>";
  }

  /* ---------------- auth ---------------- */

  function renderAuth() {
    var isSignup = state.authTab === "signup";
    var el = document.getElementById("auth");
    el.hidden = false;
    document.getElementById("shell").hidden = true;

    el.innerHTML =
      '<div class="auth-aside">' +
        BRAND +
        '<div class="auth-hero">' +
          '<span class="tag-pill">Skills-first learning</span>' +
          '<div class="auth-claim">Pick a role.<br>Learn the skills.<br><em>Prove it.</em></div>' +
          '<p class="auth-sub">A guided path from where you are to the job you want, with assessments that show you are ready.</p>' +
          '<div class="auth-example" aria-hidden="true">' +
            '<div class="ex-k">Example path</div>' +
            '<div class="ex-name">' + esc(ROLES[0].name) + '</div>' +
            '<div class="bar"><span style="width:40%"></span></div>' +
            '<div class="ex-meta">2 of ' + ROLES[0].skills.length + ' skills verified</div>' +
          "</div>" +
        "</div>" +
        '<div class="auth-points">' +
          '<div><b>01</b><span>Pick a target role and get the full skill roadmap for it.</span></div>' +
          '<div><b>02</b><span>Learn each skill through your role&rsquo;s lens, or test straight out.</span></div>' +
          '<div><b>03</b><span>Earn verified stars. Progress only moves through assessment.</span></div>' +
        "</div>" +
      "</div>" +
      '<div class="auth-form-wrap"><div class="auth-form">' +
        '<div class="tabs" role="tablist">' +
          '<button role="tab" aria-selected="' + isSignup + '" data-action="auth-tab" data-tab="signup">Create account</button>' +
          '<button role="tab" aria-selected="' + !isSignup + '" data-action="auth-tab" data-tab="login">Sign in</button>' +
        "</div>" +
        (REAL ? realGoogle() : state.googlePending ? "" :
          '<div id="g-wrap" class="g-wrap"' + (gsi.ready ? "" : " hidden") + '><div id="g-btn" class="g-btn"></div>' +
            '<div class="or-div"><span>or</span></div></div>') +
        (REAL ? realBody(isSignup) : state.googlePending ? googleFinishForm() : isSignup ? signupForm() : loginForm()) +
        (state.authError ? '<p class="err" style="margin-top:12px" role="alert">' + esc(state.authError) + "</p>" : "") +
        (state.authInfo && !state.authError ? '<p class="tiny" style="margin-top:12px" role="status">' + esc(state.authInfo) + "</p>" : "") +
        (REAL || isSignup || state.googlePending ? "" : credCards()) +
        (REAL ? siteLinks("center")
          : '<p class="tiny muted" style="margin-top:16px;text-align:center"><a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a></p>') +
      "</div></div>";
    if (state.googlePending || (REAL && (state.booting || state.authNotice || state.authTab === "reset" || state.authTab === "forgot"))) {
      var tabs = el.querySelector(".tabs");
      if (tabs) tabs.hidden = true;
    }
    if (!REAL) setupGoogle();
  }

  /* Real-account screens */
  function realGoogle() {
    if (!CP_AUTH.googleOAuth || state.googlePending || state.booting || state.authNotice || state.authTab === "reset" || state.authTab === "forgot") return "";
    var G = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' +
      '<path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>' +
      '<path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.5-4.1 7-10.2 7-17.6z"/>' +
      '<path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/>' +
      '<path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';
    return '<div class="g-wrap"><a class="btn" style="justify-content:center;gap:10px;width:100%;text-decoration:none" href="' + esc(CP_AUTH.googleUrl()) + '">' + G + "<span>Continue with Google</span></a>" +
      '<div class="or-div"><span>or</span></div></div>';
  }

  function realBody(isSignup) {
    if (state.googlePending) return googleFinishForm();
    if (state.booting) return '<p class="muted" role="status">Signing you in&hellip;</p>';
    var n = state.authNotice;
    if (n) {
      var sent = n.kind === "reset-sent";
      return '<div class="stack" style="gap:12px"><h3 style="margin:0">Check your email</h3>' +
        "<p>" + (sent
          ? "If an account exists for <b>" + esc(n.email) + "</b>, a reset link is on its way."
          : "We sent a confirmation link to <b>" + esc(n.email) + "</b>. Open it to finish creating your account.") + "</p>" +
        '<p class="tiny muted">It can take a minute. Check your spam folder if you do not see it.</p>' +
        (n.info ? '<p class="tiny" role="status">' + esc(n.info) + "</p>" : "") +
        (sent ? "" : '<button class="btn" style="justify-content:center"' + (state.authBusy ? " disabled" : "") + ' data-action="resend-confirm">Send the email again</button>') +
        '<button class="btn ghost sm" style="justify-content:center" data-action="auth-back">Back to sign in</button></div>';
    }
    if (state.authTab === "reset") {
      return '<div class="stack" style="gap:12px"><h3 style="margin:0">Choose a new password</h3>' +
        '<div class="field"><label for="rs-pass">New password</label><input id="rs-pass" type="password" autocomplete="new-password" placeholder="At least 8 characters"></div>' +
        '<div class="field"><label for="rs-pass2">Repeat it</label><input id="rs-pass2" type="password" autocomplete="new-password"></div>' +
        '<button class="btn primary" style="justify-content:center"' + (state.authBusy ? " disabled" : "") + ' data-action="reset-save">Save password</button></div>';
    }
    if (state.authTab === "forgot") {
      return '<div class="stack" style="gap:12px"><h3 style="margin:0">Reset your password</h3>' +
        '<p class="tiny muted">Enter your email and we will send you a link.</p>' +
        '<div class="field"><label for="fg-email">Email</label><input id="fg-email" type="email" autocomplete="email"></div>' +
        '<button class="btn primary" style="justify-content:center"' + (state.authBusy ? " disabled" : "") + ' data-action="forgot-send">Send reset link</button>' +
        '<button class="btn ghost sm" style="justify-content:center" data-action="auth-back">Back to sign in</button></div>';
    }
    return isSignup ? signupForm() : loginForm();
  }

  /* ---------------- Sign in with Google ----------------
     Shown only when the deployment has GOOGLE_CLIENT_ID set (read from /api/config) and the
     page is served over http(s). The ID token Google returns is verified on the server by
     /api/google-auth before the page trusts the email in it. Inside the Claude artifact the
     Google script cannot load, so the button simply never appears there. */
  var gsi = { asked: false, clientId: null, ready: false, inited: false };

  function setupGoogle() {
    if (!/^https?:$/.test(location.protocol)) return;
    if (!gsi.asked) {
      gsi.asked = true;
      fetch("/api/config").then(function (r) { return r.ok ? r.json() : null; }).then(function (c) {
        gsi.clientId = c && c.googleClientId;
        if (!gsi.clientId) return;
        var sc = document.createElement("script");
        sc.src = "https://accounts.google.com/gsi/client";
        sc.async = true;
        sc.onload = function () { gsi.ready = true; drawGoogle(); };
        document.head.appendChild(sc);
      }).catch(function () { /* no config route here: password sign-in only */ });
      return;
    }
    drawGoogle();
  }

  function drawGoogle() {
    var host = document.getElementById("g-btn"), wrap = document.getElementById("g-wrap");
    if (!gsi.ready || !host || !wrap || !window.google || !google.accounts) return;
    if (!gsi.inited) {
      google.accounts.id.initialize({ client_id: gsi.clientId, callback: onGoogleCredential, ux_mode: "popup" });
      gsi.inited = true;
    }
    wrap.hidden = false;
    var dark = document.documentElement.getAttribute("data-theme") === "dark" ||
      (!document.documentElement.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    google.accounts.id.renderButton(host, {
      theme: dark ? "filled_black" : "outline", size: "large", shape: "pill",
      text: state.authTab === "signup" ? "signup_with" : "signin_with",
      width: Math.min(400, Math.max(220, host.offsetWidth || 320))
    });
  }

  function onGoogleCredential(resp) {
    state.authError = "";
    fetch("/api/google-auth", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential: resp && resp.credential })
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, j: j }; });
    }).then(function (x) {
      if (!x.ok) { state.authError = (x.j && x.j.error && x.j.error.message) || "Google sign-in failed."; return render(); }
      googleSignedIn(x.j);
    }).catch(function () {
      state.authError = "Could not reach the server to finish Google sign-in."; render();
    });
  }

  function googleSignedIn(p) {
    var u = state.users.filter(function (x) { return !x.seeded && x.email.toLowerCase() === p.email; })[0];
    if (u && u.role === "admin") { state.authError = "Admin accounts sign in with email and password."; return render(); }
    if (u) { state.userId = u.id; state.authError = ""; return go(u.roleId ? "roadmap" : "roles"); }
    /* First time with Google: we know the name and email, but the leaderboards are per school,
       so ask the three profile questions the normal sign-up asks. */
    state.googlePending = { name: p.name, email: p.email, picture: p.picture };
    render();
  }

  function googleFinishForm() {
    var g = state.googlePending;
    return '<div class="stack" style="gap:12px">' +
      '<div><h3>Finish your profile</h3>' +
        '<p class="tiny muted" style="margin-top:4px">Signed in with Google as <b>' + esc(g.email) + "</b>. Three quick details and you&rsquo;re in.</p></div>" +
      '<div class="field"><label for="gf-name">Full name</label><input id="gf-name" value="' + esc(g.name) + '"></div>' +
      '<div class="auth-grid">' +
        '<div class="field"><label for="gf-school">School</label><select id="gf-school">' +
          SCHOOLS.map(function (s) { return "<option>" + esc(s) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label for="gf-year">Graduation</label><select id="gf-year">' +
          ["2026", "2027", "2028", "2029"].map(function (y) { return "<option>" + y + "</option>"; }).join("") + "</select></div>" +
      "</div>" +
      '<div class="field"><label for="gf-major">Major</label><select id="gf-major">' +
        MAJORS.map(function (m) { return "<option>" + esc(m) + "</option>"; }).join("") + "</select></div>" +
      '<button class="btn primary" style="margin-top:6px;justify-content:center" data-action="google-finish"' + (state.authBusy ? " disabled" : "") + '>' + (REAL ? "Continue" : "Create student account") + '</button>' +
      '<button class="btn ghost sm" style="justify-content:center" data-action="google-cancel">Use a different account</button>' +
    "</div>";
  }

  function credCards() {
    return '<div class="cred-grid">' +
      '<button class="cred-card" data-action="fill" data-email="student@careerpath.com" data-pass="student">' +
        '<span><span class="who-role">Student account</span>' +
        '<span class="who-cred" style="display:block">student@careerpath.com &middot; student</span></span>' +
        '<span class="use">Use</span></button>' +
    "</div>";
  }

  function signupForm() {
    var draft = state.authDraft || {};
    return '<div class="stack" style="gap:12px">' +
      '<div class="field"><label for="su-name">Full name</label><input id="su-name" placeholder="Alex Rivera" value="' + esc(draft.name) + '"></div>' +
      '<div class="field"><label for="su-email">Email</label><input id="su-email" type="email" placeholder="alex@usc.edu" value="' + esc(draft.email) + '"></div>' +
      '<div class="field"><label for="su-pass">Password</label><input id="su-pass" type="password" autocomplete="new-password" placeholder="' + (REAL ? "At least 8 characters" : "At least 4 characters") + '"></div>' +
      '<div class="auth-grid">' +
        '<div class="field"><label for="su-school">School</label><select id="su-school">' +
          SCHOOLS.map(function (s) { return "<option" + (s === draft.school ? " selected" : "") + ">" + esc(s) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label for="su-year">Graduation</label><select id="su-year">' +
          ["2026", "2027", "2028", "2029"].map(function (y) { return "<option" + (y === draft.year ? " selected" : "") + ">" + y + "</option>"; }).join("") + "</select></div>" +
      "</div>" +
      '<div class="field"><label for="su-major">Major</label><select id="su-major">' +
        MAJORS.map(function (m) { return "<option" + (m === draft.major ? " selected" : "") + ">" + esc(m) + "</option>"; }).join("") + "</select></div>" +
      '<button class="btn primary" style="margin-top:6px;justify-content:center"' + (state.authBusy ? " disabled" : "") + ' data-action="signup">Create student account</button>' +
      (REAL
        ? '<p class="tiny muted">By creating an account you agree to the <a href="terms.html" target="_blank" rel="noopener">Terms of use</a> ' +
          'and the <a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a>.</p>'
        : '<p class="tiny muted">Sign-up creates a student account. Admin accounts are provisioned by the platform team.</p>') +
    "</div>";
  }

  function loginForm() {
    return '<div class="stack" style="gap:12px">' +
      '<div class="field"><label for="li-email">Email</label><input id="li-email" type="email" autocomplete="email" value="' + (REAL ? "" : "student@careerpath.com") + '"></div>' +
      '<div class="field"><label for="li-pass">Password</label><input id="li-pass" type="password" autocomplete="current-password" value="' + (REAL ? "" : "student") + '"></div>' +
      '<button class="btn primary" style="margin-top:6px;justify-content:center"' + (state.authBusy ? " disabled" : "") + ' data-action="login">Sign in</button>' +
      (REAL ? '<button class="btn ghost sm" style="justify-content:center" data-action="forgot">Forgot your password?</button>' : "") +
    "</div>";
  }

  /* ---------------- shell ---------------- */

  var STUDENT_NAV = [
    { id: "roadmap", label: "Roadmap" },
    { id: "challenge", label: "Weekly challenge" },
    { id: "leaderboard", label: "Leaderboard" },
    { id: "certs", label: "Certificates" },
    { id: "history", label: "History" }
  ];
  var ADMIN_NAV = [
    { id: "a-content", label: "Content" },
    { id: "a-drafts", label: "Review queue" },
    { id: "a-challenges", label: "Weekly challenge" },
    { id: "a-students", label: "Students" }
  ];

  function navFor(user) {
    if (user.role === "admin") {
      return ADMIN_NAV.map(function (n) {
        var count = "";
        if (n.id === "a-drafts") count = String(allDrafts().length);
        if (n.id === "a-challenges") count = String(CHALLENGES.filter(function (c) { return c.status === "live"; }).length);
        return { id: n.id, label: n.label, count: count };
      });
    }
    return STUDENT_NAV.map(function (n) {
      var count = "";
      if (n.id === "certs") count = String(certsFor(user).length);
      if (n.id === "roadmap" && user.roleId) count = jobReadyCount(user) + "/" + role(user.roleId).skills.length;
      if (n.id === "challenge" && user.roleId) {
        var c = liveChallenge(user.roleId);
        count = c ? (user.challenges[c.cid] ? "&#10003;" : "New") : "";
      }
      return { id: n.id, label: n.label, count: count };
    });
  }

  function activeNav() {
    var n = state.route.name;
    if (state.preview) return "a-content";
    if (["skill", "learn", "assess", "result", "roles", "track", "mexam", "mresult"].indexOf(n) > -1) return "roadmap";
    if (n.indexOf("onb-") === 0) return "roadmap";
    if (n === "cert") return "certs";
    if (n === "a-bank" || n === "a-lessons") return "a-content";
    if (n === "a-student") return "a-students";
    if (n === "a-review") return "a-drafts";
    return n;
  }

  /* ---------------- role switcher (top bar) ----------------
     The role pill in the bar is the switcher. The match score beside each roadmap is the one the student
     got from the placement questions, saved with the placement so it can be shown here at any time. */
  function matchOf(user, id) {
    var m = user && user.placement && user.placement.matches;
    return m && typeof m[id] === "number" ? m[id] : null;
  }
  function saveMatches(o) {
    var u = me();
    if (!u || !o || !o.rec) return;
    u.placement = u.placement || { answered: 0, total: 0, perRole: {}, when: today() };
    u.placement.matches = {};
    o.rec.forEach(function (x) { u.placement.matches[x.roleId] = x.score; });
  }
  var CHEV = '<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg>';

  function roleSwitchHTML(user) {
    var r = role(user.roleId);
    var open = !!state.roleMenu;
    var list = ROLES.slice();
    var any = list.some(function (x) { return matchOf(user, x.id) != null; });
    if (any) list.sort(function (a, b) { return (matchOf(user, b.id) || 0) - (matchOf(user, a.id) || 0); });
    return '<div class="role-switch">' +
      '<button class="bar-context role-btn" data-action="role-menu" aria-haspopup="true" aria-expanded="' + open + '" title="Switch roadmap">' +
        "<span>" + esc(r ? r.name : "Choose a role") + "</span>" + CHEV + "</button>" +
      '<div class="role-menu" role="menu"' + (open ? "" : " hidden") + ">" +
        '<div class="role-menu-head">Switch roadmap</div>' +
        list.map(function (x) {
          var cur = x.id === user.roleId, m = matchOf(user, x.id);
          return '<button class="role-opt" role="menuitem" data-action="role-switch" data-role="' + x.id + '" aria-current="' + cur + '">' +
            '<span class="role-opt-main"><b>' + esc(x.name) + "</b><small>" + esc(x.tagline) + "</small></span>" +
            '<span class="role-opt-end">' +
              (m != null ? '<b class="mono">' + m + "%</b><small>match</small>" : "") +
              (cur ? '<i class="role-cur">Current</i>' : "") +
            "</span></button>";
        }).join("") +
        '<p class="role-menu-note">' + (any ? "Match scores come from your placement questions. " : "") +
          "Your stars stay with the roadmap they were earned on.</p>" +
        '<div class="role-menu-foot">' +
          '<button class="btn sm ghost" data-action="nav" data-nav="roles">Compare roadmaps</button>' +
          '<button class="btn sm ghost" data-action="onb-open">' + (any ? "Retake the match quiz" : "Get match scores") + "</button>" +
        "</div>" +
      "</div></div>";
  }

  /* Links to the website pages. Only shown on a real deployment: the pages do not exist in the demo copy. */
  function siteLinks(cls) {
    if (!REAL) return "";
    return '<nav class="site-links ' + (cls || "") + '" aria-label="About CareerPath">' +
      [["about.html", "About"], ["faq.html", "FAQ"], ["help.html", "Help and support"], ["contact.html", "Contact"],
       ["privacy.html", "Privacy"], ["terms.html", "Terms"]].map(function (l) {
        return '<a href="' + l[0] + '" target="_blank" rel="noopener">' + l[1] + "</a>";
      }).join("") + "</nav>";
  }

  function renderShell(user) {
    document.getElementById("auth").hidden = true;
    document.getElementById("shell").hidden = false;
    var r = role(user.roleId);
    var act = activeNav();
    var admin = user.role === "admin";
    var context = admin ? "Content admin" : (r ? r.name : "No role yet");
    var sub = admin
      ? esc(user.title)
      : user.points + " pts &middot; " + totalStars(user) + STAR;

    // One horizontal bar across the top. A vertical rail costs 232px of width on
    // every screen, and this application is mostly wide content: tables, a roadmap
    // and a leaderboard beside it.
    document.getElementById("sidebar").innerHTML =
      '<div class="bar-left">' +
        BRAND +
        (admin ? '<span class="bar-context">' + context + "</span>" : roleSwitchHTML(user)) +
      "</div>" +
      '<nav class="side">' +
        navFor(user).map(function (n) {
          return '<button class="nav-item" data-action="nav" data-nav="' + n.id + '" aria-current="' + (act === n.id) + '">' +
            "<span>" + n.label + "</span>" +
            (n.count ? '<span class="nav-count mono">' + n.count + "</span>" : "") + "</button>";
        }).join("") +
      "</nav>" +
      '<div class="side-foot">' +
        '<button class="who" data-action="nav" data-nav="profile" aria-current="' + (act === "profile") + '" title="Profile">' +
          '<span class="avatar">' + esc(initials(user.name)) + "</span><span>" +
          '<span class="who-name">' + esc(user.name) + "</span>" +
          '<span class="who-sub mono">' + sub + "</span>" +
        "</span></button>" +
        themeBtn() +
        '<button class="btn sm ghost" data-action="logout">Sign out</button>' +
      "</div>";

    var sf = document.getElementById("sitefoot");
    if (sf) sf.innerHTML = REAL ? '<span>&copy; 2026 CareerPath</span>' + siteLinks() : "";

    document.getElementById("mobilebar").innerHTML =
      '<div class="mb-top">' +
        BRAND +
        '<div class="row" style="gap:4px">' +
          (admin ? '<span class="pill mono">Admin</span>' : roleSwitchHTML(user)) +
          themeBtn() +
          '<button class="btn sm ghost" data-action="logout">Out</button>' +
        "</div>" +
      "</div>" +
      '<div class="mb-nav">' +
        navFor(user).map(function (n) {
          return '<button data-action="nav" data-nav="' + n.id + '" aria-current="' + (act === n.id) + '">' + n.label + "</button>";
        }).join("") +
        '<button data-action="nav" data-nav="profile" aria-current="' + (act === "profile") + '">Profile</button>' +
      "</div>";
  }

  /* ---------------- onboarding views ----------------
     Resume, then a placement test built from it, then a ranked recommendation.
     After the resume the student chooses: "I know my target role" or "Help me choose".
     The recommendation is advice: the student can pick any roadmap from the same screen
     regardless of what it says. */

  function viewOnbResume(user) {
    var o = state.onb || {};
    var det = o.detect;

    var body;
    if (o.parsing) {
      body = '<div class="card"><p class="muted">Reading ' + esc(o.name || "your resume") + "&hellip;</p></div>";
    } else if (det) {
      var ids = Object.keys(det.skills);

      // The evidence is the words the person wrote. Show all of them by area, then what the roadmaps cover.
      var general = det.general || {};
      var groups = Object.keys(general);
      var found = [];
      groups.forEach(function (g) { general[g].forEach(function (t) { found.push(t); }); });
      ids.forEach(function (sid) {
        det.skills[sid].forEach(function (t) {
          if (found.indexOf(t) === -1) found.push(t);
        });
      });
      found = window.CP_ONBOARD.tidyTerms(found);
      var thin = o.chars < 600 || found.length < 4;

      var byRole = ROLES.map(function (r) {
        var mine = r.skills.filter(function (s) { return ids.indexOf(s.id) > -1; });
        return { r: r, mine: mine };
      });

      body = '<div class="card">' +
        '<div class="row" style="justify-content:space-between;margin-bottom:12px">' +
          "<div><h3>What we read</h3>" +
          '<p class="tiny muted">' + esc(o.name) + " &middot; " + o.chars + " characters" +
            (o.kind && o.kind !== "text" ? " &middot; " + esc(o.kind.toUpperCase()) : "") + "</p></div>" +
          '<button class="btn sm ghost" data-action="onb-redo">Use a different file</button>' +
        "</div>" +
        (thin
          ? '<p class="err" style="margin-bottom:12px">Only ' + found.length + " skill word" + (found.length === 1 ? "" : "s") +
            " came out of " + o.chars + " characters. If your resume has more than that, the file may be a scanned " +
            'image or an unusual PDF. Use "Paste text instead" and it will read the same words reliably.</p>'
          : "") +
        (found.length === 0
          ? '<p class="tiny muted">No skill words were found in the file.</p>'
          : groups.map(function (g) {
              return '<span class="fl">' + esc(g) + '</span><div class="row" style="gap:5px;margin:0 0 12px">' +
                general[g].map(function (t) { return '<span class="pill ok">' + esc(t) + "</span>"; }).join("") + "</div>";
            }).join("") +
            '<span class="fl" style="margin-top:6px">What the roadmaps cover</span>' +
            '<div class="stack" style="gap:7px;margin-bottom:12px">' + byRole.map(function (x) {
              var pctw = Math.round(x.mine.length / x.r.skills.length * 100);
              return '<div class="cover-row"><span>' + esc(x.r.name) + "</span>" +
                '<span class="bar"><span style="width:' + pctw + '%"></span></span>' +
                '<span class="mono tiny muted">' + x.mine.length + " / " + x.r.skills.length + "</span></div>";
            }).join("") + "</div>" +
            '<p class="tiny muted">The words above are in your file, grouped by area. The bars count only the skill ' +
            "areas these roadmaps teach, so a strong resume can still show a short bar. The ranking in the next step " +
            "reads your resume itself, not just these words.</p>") +
        (Object.keys(det.roles).length
          ? '<p class="tiny muted" style="margin-top:10px">Job titles found: ' +
            Object.keys(det.roles).map(function (rid) {
              return '<b style="color:var(--ink)">' + esc(det.roles[rid].slice(0, 2).join(", ")) + "</b>";
            }).join(", ") + "</p>"
          : "") +
        '<div class="row" style="margin-top:16px">' +
          '<button class="btn primary" data-action="onb-to-fork">Continue &rarr;</button>' +
        "</div></div>";
    } else {
      body = '<div class="card">' +
        '<div class="field"><label for="onb-file">Resume file</label>' +
          '<input id="onb-file" class="file-input" type="file" accept=".pdf,.docx,.txt,.md">' +
          '<p class="tiny muted" style="margin-top:7px">PDF, Word or plain text.</p></div>' +
        (o.err ? '<p class="err" style="margin-top:12px">' + esc(o.err) + "</p>" : "") +
        '<hr class="divider" style="margin:18px 0">' +
        (o.paste
          ? '<div class="field"><label for="onb-text">Paste your resume text</label>' +
            '<textarea id="onb-text" class="ex-input" rows="8" placeholder="Paste the text of your resume here"></textarea></div>' +
            '<div class="row" style="margin-top:10px"><button class="btn primary sm" data-action="onb-paste-save">Use this text</button>' +
            '<button class="btn sm ghost" data-action="onb-paste">Cancel</button></div>'
          : '<div class="row"><button class="btn sm" data-action="onb-paste">Paste text instead</button>' +
            '<button class="btn sm ghost" data-action="onb-to-fork">I don&rsquo;t have a resume yet</button></div>') +
      "</div>" +
      '<div class="explain">' +
        '<div><b>1. Your resume is not stored</b><p>It is read in your browser. When the ranking is ' +
          "written, the text is sent once to the AI provider and then dropped.</p></div>" +
        '<div><b>2. Tell us where you are headed</b><p>Already know your target role? Pick it. ' +
          "Not sure? Answer five short questions with no wrong answers and the AI reads them with your resume.</p></div>" +
        '<div><b>3. Start the coursework</b><p>Either way you land on a roadmap, with a match score ' +
          "for each one if you asked for help. You can switch later.</p></div>" +
      "</div>";
    }

    return '<div class="page-head"><div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px">' +
        '<div><div class="eyebrow">Step 1 of 3</div><h1>Upload your resume</h1></div>' +
        "</div>" +
        '<p class="sub">CareerPath reads your resume to see what you have already worked with. ' +
        "It must be a resume: a different kind of document is turned away so the results stay meaningful.</p></div>" +
      '<div class="onb-steps">' + onbSteps(1) + "</div>" + body;
  }

  // The three steps are controls, not a label. Anything already done, and the
  // recommendation once it exists, can be opened again to change an answer.
  function onbSteps(at) {
    var o = state.onb || {};
    var reachable = function (n) {
      if (n === at) return false;
      if (n === 1) return true;
      if (n === 2) return !!(o.mode || o.detect || o.items || at === 3);
      return !!(o.rec && o.rec.length);
    };
    return ["Resume", "Your target", "Recommendation"].map(function (l, i) {
      var n = i + 1;
      var inner = '<b class="mono">' + (n < at ? "&#10003;" : n) + "</b>" + esc(l);
      var attrs = ' aria-current="' + (n === at) + '" data-done="' + (n < at) + '"';
      return reachable(n)
        ? '<button type="button" class="onb-step go" data-action="onb-step" data-step="' + n + '"' + attrs +
            ' aria-label="Go to step ' + n + ", " + esc(l) + '">' + inner + "</button>"
        : '<span class="onb-step"' + attrs + ">" + inner + "</span>";
    }).join("");
  }

  /* The question every new student answers once: do you already know where you are going?
     Both answers are first-class. Knowing the role goes straight to the roadmap list, and
     asking for help runs the five questions. Neither is a detour from the other. */
  function viewOnbFork(user) {
    var o = state.onb || {};
    var det = o.detect;
    var found = 0;
    if (det) {
      var seen = {};
      Object.keys(det.general || {}).forEach(function (g) { det.general[g].forEach(function (t) { seen[t] = 1; }); });
      Object.keys(det.skills || {}).forEach(function (sid) { det.skills[sid].forEach(function (t) { seen[t] = 1; }); });
      found = Object.keys(seen).length;
    }
    var n = (window.CP_GUIDED || []).length;

    return '<div class="page-head"><div class="eyebrow">Step 2 of 3</div><h1>Do you already know your target role?</h1>' +
        '<p class="sub">Either answer is fine, and you can change your mind at any point. ' +
        (found ? "The " + found + " skill words from your resume are used either way." : "You can still add a resume later from your profile.") +
        "</p></div>" +
      '<div class="onb-steps">' + onbSteps(2) + "</div>" +
      '<div class="fork">' +
        '<button class="fork-card" data-action="onb-know">' +
          '<span class="fork-ico" aria-hidden="true">&#10003;</span>' +
          "<h3>I know my target role</h3>" +
          "<p>See the roadmaps, pick one, and start the coursework.</p>" +
          '<span class="fork-go">Choose a roadmap &rarr;</span></button>' +
        '<button class="fork-card" data-action="onb-guided">' +
          '<span class="fork-ico" aria-hidden="true">?</span>' +
          "<h3>Help me choose</h3>" +
          "<p>Answer " + n + " short questions about how you like to work. No answer is wrong. " +
          "The AI reads them with your resume and gives you a match % for every roadmap.</p>" +
          '<span class="fork-go">Start the ' + n + " questions &rarr;</span></button>" +
      "</div>" +
      "";
  }

  function viewOnbPlacement(user) {
    var o = state.onb;
    var items = o.items || [];

    if (!items.length) {
      return '<div class="page-head"><div class="eyebrow">Step 2 of 3</div><h1>A few quick questions</h1></div>' +
        '<div class="card"><p class="muted">There are no questions to ask yet.</p>' +
        '<button class="btn sm primary" style="margin-top:12px" data-action="onb-know">Choose a roadmap</button></div>';
    }

    if (o.idx >= items.length) {
      return '<div class="page-head"><div class="eyebrow">Step 2 of 3</div><h1>Answers recorded</h1>' +
          '<p class="sub">These are scored against each roadmap, and the model reads them alongside your resume. ' +
          "Nothing here touches a star, a certificate or the leaderboard.</p></div>" +
        '<div class="onb-steps">' + onbSteps(2) + "</div>" +
        '<div class="card"><h3 style="margin-bottom:12px">What you picked</h3>' +
          '<div class="stack" style="gap:11px">' + items.map(function (it, i) {
            var opt = it.opts[o.answers[i]];
            return '<div class="picked"><span class="tiny muted">' + esc(it.q) + "</span>" +
              "<b>" + esc(opt ? opt.t : "&mdash;") + "</b></div>";
          }).join("") + "</div></div>" +
        '<div class="row" style="margin-top:18px">' +
          '<button class="btn primary" data-action="onb-to-recommend">See recommended roadmaps &rarr;</button>' +
          '<button class="btn ghost" data-action="onb-redo-test">Answer them again</button>' +
        "</div>";
    }

    var it = items[o.idx];
    return '<div class="page-head"><div class="eyebrow">Step 2 of 3 &middot; question ' + (o.idx + 1) + " of " + items.length + "</div>" +
        "<h1>A few quick questions</h1>" +
        '<p class="sub">' + items.length + " questions, about a minute. None has a right answer, so pick what feels most like you. " +
        "Nothing here is scored against you.</p></div>" +
      '<div class="onb-steps">' + onbSteps(2) + "</div>" +
      '<div class="progress-head"><span><span class="pill">No right answer</span></span>' +
        '<span class="mono tiny">' + (o.idx + 1) + " / " + items.length + "</span></div>" +
      '<div class="bar" style="margin-bottom:18px"><span style="width:' + Math.round(o.idx / items.length * 100) + '%"></span></div>' +
      '<div class="q-card"><p class="q-stem">' + esc(it.q) + "</p>" +
        '<div class="opts">' + it.opts.map(function (opt, i) {
          return '<button class="opt" data-action="onb-answer" data-i="' + i + '">' +
            '<span class="key">' + "ABCD".charAt(i) + "</span><span>" + esc(opt.t) + "</span></button>";
        }).join("") + "</div></div>" +
      '<div class="row" style="margin-top:16px">' +
        (o.idx > 0
          ? '<button class="btn sm" data-action="onb-back">&larr; Back</button>'
          : '<button class="btn sm" data-action="onb-to-fork">&larr; Back</button>') +
      "</div>";
  }

  function viewOnbRecommend(user) {
    var o = state.onb;
    var rec = o.rec || [];
    var spread = rec.length ? rec[0].score - rec[rec.length - 1].score : 0;

    var byModel = o.by === "model";

    return '<div class="page-head"><div class="eyebrow">Step 3 of 3</div><h1>Recommended roadmaps</h1>' +
        '<p class="sub">Ranked from ' + (o.detect ? "what your resume mentioned and " : "") + "how you answered. " +
        "The match is how well each roadmap fits what you told us, not a grade. This is advice, not a gate: " +
        "pick any roadmap on this page and you get the full thing.</p></div>" +
      '<div class="onb-steps">' + onbSteps(3) + "</div>" +
      '<div class="rank-by">' +
        (o.busy
          ? '<span class="pill warn">Reading your answers&hellip;</span>' +
            '<span class="tiny muted">Showing the rule-based ranking until the model answers.</span>'
          : byModel
            ? '<span class="pill ok">Ranked by the model</span>' +
              '<span class="tiny muted">It read ' + (o.detect ? "your resume matches and " : "") + "all " + (o.items || []).length + " answers.</span>"
            : '<span class="pill">Ranked by the scoring rules</span>' +
              '<span class="tiny muted">' +
              (o.rankErr ? esc(o.rankErr) : "The model was not reachable, so the fixed weights produced this.") +
              "</span>" +
              (tutor.ready && !tutor.denied
                ? ' <button class="btn sm" data-action="onb-rerank">Try the model again</button>' : "")) +
      "</div>" +
      (o.planned
        ? '<div class="card" style="margin-bottom:16px;border-color:var(--accent)"><p class="tiny">' +
          "<b>Your answers point most towards " + esc(o.planned.name) + ".</b> That roadmap is planned but not on " +
          "CareerPath yet. The ones below are the closest fit available today, so treat the scores as " +
          "second best.</p></div>"
        : "") +
      (spread < 12 && !byModel && !o.planned
        ? '<div class="card" style="margin-bottom:16px;border-color:var(--warn)"><p class="tiny">' +
          "<b>These roadmaps are close together.</b> Your answers" + (o.detect ? " and resume" : "") +
          " did not point clearly at one, so choose the role you actually want rather than the one at the top.</p></div>"
        : "") +
      '<div class="stack" style="gap:12px">' + rec.map(function (x, i) {
        return '<div class="rec-card' + (i === 0 ? " lead" : "") + '">' +
          '<div class="rec-head"><div>' +
            (i === 0 ? '<span class="pill accent">' + (o.planned ? "Closest available" : "Best match") + "</span> " : "") +
            '<span class="rec-name">' + esc(x.name) + "</span>" +
            '<span class="tiny muted" style="display:block;margin-top:2px">' + esc(x.tagline) + "</span>" +
          "</div>" +
          '<div class="rec-score"><b class="mono">' + x.score + "%</b><span class=\"tiny muted\">match</span></div></div>" +
          '<div class="bar" style="margin:10px 0 12px"><span style="width:' + x.score + '%"></span></div>' +
          (x.why ? '<p class="rec-why">' + esc(x.why) + "</p>" : "") +
          '<ul class="crits">' + x.reasons.map(function (rs) {
            return '<li class="crit met"><span class="mark">&middot;</span><span>' + esc(rs) + "</span></li>";
          }).join("") + "</ul>" +
          '<div class="row" style="margin-top:14px">' +
            '<button class="btn ' + (i === 0 ? "primary" : "") + '" data-action="onb-pick" data-role="' + x.roleId + '">' +
              "Start the " + esc(x.name) + " roadmap</button>" +
          "</div></div>";
      }).join("") + "</div>" +
      '<p class="tiny muted" style="margin-top:16px">You can switch roadmaps later without losing anything. Stars stay ' +
      "attached to the roadmap they were earned on, because the same skill is assessed differently for each role.</p>";
  }

  /* ---------------- weekly challenge view ---------------- */

  function viewChallenge(user) {
    var r = role(user.roleId);
    var c = liveChallenge(user.roleId);

    if (!c) {
      return '<div class="page-head"><div class="eyebrow">Weekly challenge</div><h1>No challenge open</h1>' +
        '<p class="sub">There is no live challenge for the ' + esc(r.name) + " roadmap this week.</p></div>" +
        '<div class="card"><p class="muted">A content admin publishes one challenge per roadmap per week.</p></div>';
    }

    var sub = user.challenges[c.cid];
    var st = state.ch && state.ch.cid === c.cid ? state.ch : null;
    var rank = chRank(user, c.cid);

    var answerBlock;
    if (sub) {
      answerBlock = '<div class="check-panel ' + (sub.pct >= 75 ? "ok" : sub.pct >= 50 ? "warn" : "bad") + '">' +
          "<b>Submitted &middot; " + sub.pct + "%</b> &mdash; " + sub.hit + " of " + sub.of + " rubric points, " +
          sub.words + " words." +
          (sub.short ? " Your answer was under the " + c.minWords + " word minimum, which caps the score at 40%." : "") +
          '<ul class="crits">' + c.rubric.map(function (rb, i) {
            var met = sub.met[i];
            return '<li class="crit ' + (met ? "met" : "unmet") + '"><span class="mark">' + (met ? "&#10003;" : "&#9675;") +
              "</span><span>" + esc(rb.label) + "</span></li>";
          }).join("") + "</ul>" +
          '<p class="check-note tiny">The score comes from these fixed criteria, so it is the same for the same answer ' +
          "every time. It reports whether you raised an idea, not how well you argued it.</p>" +
        "</div>" +
        (sub.feedback
          ? '<div class="card" style="margin-top:12px"><div class="row" style="justify-content:space-between;margin-bottom:8px">' +
            '<h3>Reviewer feedback</h3><span class="pill">' +
            (sub.source === "ai" ? "AI" : "Rule-based") + "</span></div>" +
            '<div class="prose tiny">' + tmd(sub.feedback) + "</div></div>"
          : REAL ? "" : '<div class="row" style="margin-top:12px">' +
            '<button class="btn sm" data-action="ch-feedback"' + (st && st.busy ? " disabled" : "") + ">" +
            (st && st.busy ? "Asking the reviewer&hellip;" : "Get written feedback") + "</button>" +
            (st && st.err ? '<span class="err tiny">' + esc(st.err) + "</span>" : "") + "</div>") +
        '<div class="card" style="margin-top:12px"><h3 style="margin-bottom:8px">Your answer</h3>' +
          '<p class="tiny muted" style="white-space:pre-wrap">' + esc(sub.text) + "</p></div>";
    } else {
      answerBlock = '<div class="field"><label for="ch-text">Your answer</label>' +
          '<textarea id="ch-text" class="ex-input" rows="10" data-ch="1" placeholder="Write your answer here. Minimum ' +
            c.minWords + ' words."' + (st && st.busy ? " readonly" : "") + ">" + esc(st && st.draft || "") + "</textarea></div>" +
        '<div class="row" style="margin-top:12px">' +
          '<button class="btn primary" data-action="ch-submit" data-cid="' + c.cid + '"' + (st && st.busy ? " disabled" : "") + ">" +
            (st && st.busy ? "Scoring your answer&hellip;" : "Submit answer") + "</button>" +
          '<span class="tiny muted">One submission per challenge. Points are awarded once.</span>' +
        "</div>" +
        (st && st.err ? '<p class="err tiny" style="margin-top:10px">' + esc(st.err) + "</p>" : "");
    }

    return '<div class="page-head"><div class="eyebrow">' + esc(r.name) + " &middot; week " + c.week + "</div>" +
        "<h1>" + esc(c.title) + "</h1></div>" +

      '<div class="roadmap-cols"><div>' +
        '<div class="card" style="margin-bottom:16px">' +
          '<h3 style="margin-bottom:8px">The brief</h3>' +
          "<p>" + esc(c.brief) + "</p>" +
          '<h3 style="margin:16px 0 8px">What it is scored on</h3>' +
          '<ul class="crits">' + c.rubric.map(function (rb) {
            return '<li class="crit unmet"><span class="mark">&#9675;</span><span>' + esc(rb.label) + "</span></li>";
          }).join("") + "</ul>" +
          '<p class="tiny muted" style="margin-top:10px">The rubric is shown before you answer on purpose. Hiding it would ' +
          "test guessing rather than the skill.</p>" +
        "</div>" +
        '<div class="card">' + answerBlock + "</div>" +
      "</div>" + challengeAside(user, c) + "</div>";
  }

  /* The challenge board is open to every college: one fresh, level contest each week, so it is not limited
     to a school the way the course board is. It moves as students submit, because a ranking nobody
     watches change is just a table. */
  function challengeAside(user, c) {
    return '<aside class="rail">' +
      '<div class="side-card">' +
        '<div class="side-head"><span>Challenge leaderboard</span>' + (REAL ? livePill("ch") : '<span class="live-pill"><i></i>Live</span>') + '</div>' +
        '<div class="side-board" data-live="chboard" data-cid="' + c.cid + '">' + chBoardHTML(user, c) + "</div>" +
        '<div class="feed" data-live="chfeed">' + chFeedHTML() + "</div>" +
        '<p class="tiny muted" style="margin:0">' + "Open to students from every college, on this roadmap. Challenge points are " +
        "separate from your stars.</p>" +
      "</div>" +
    "</aside>";
  }

  /* Real accounts: every college together, read through challenge_board (top 50 plus the student). */
  function chBoardReal(user, c) {
    if (live.chKey !== c.cid || !live.chRows) return '<p class="tiny muted" style="padding:0 14px">Loading the board&hellip;</p>';
    if (!live.chRows.length) return '<p class="tiny muted" style="padding:0 14px">No one has submitted yet. Be the first this week.</p>';
    return '<table class="grid"><thead><tr><th></th><th>Student</th><th>Score</th></tr></thead><tbody>' +
      live.chRows.map(function (row) {
        return '<tr class="' + (row.me ? "lb-you" : "") + '">' +
          '<td><span class="rank ' + (row.rank <= 3 ? "top" : "") + '">' + row.rank + "</span></td>" +
          "<td>" + esc(row.name) + (row.me ? ' <span class="pill accent">You</span>' : "") +
            (row.school ? '<span class="tiny muted" style="display:block">' + esc(row.school) + "</span>" : "") + "</td>" +
          '<td class="mono">' + row.score + "%</td></tr>";
      }).join("") + "</tbody></table>";
  }

  function chBoardHTML(user, c) {
    if (REAL) return chBoardReal(user, c);
    var rows = chSubmissions(c.cid);
    if (!rows.length) return '<p class="tiny muted" style="padding:0 14px">No one has submitted yet. Be the first this week.</p>';
    return '<table class="grid"><thead><tr><th></th><th>Student</th><th>Score</th></tr></thead><tbody>' +
      rows.map(function (row, i) {
        var cls = (row.user.id === user.id ? "lb-you " : "") + (fresh(row.user.id) ? "lb-move" : "");
        return '<tr class="' + cls.trim() + '">' +
          '<td><span class="rank ' + (i < 3 ? "top" : "") + '">' + (i + 1) + "</span></td>" +
          "<td>" + esc(row.user.name.split(" ")[0] + " " + (row.user.name.split(" ")[1] || "").charAt(0) + ".") +
            (row.user.id === user.id ? ' <span class="pill accent">You</span>' : "") +
            (row.user.school ? '<span class="tiny muted" style="display:block">' + esc(row.user.school) + "</span>" : "") + "</td>" +
          '<td class="mono">' + row.sub.pct + "%</td></tr>";
      }).join("") + "</tbody></table>";
  }

  function chFeedHTML() {
    if (REAL) return "";
    if (!live.chFeed.length) return '<span class="tiny muted">Waiting for the next submission.</span>';
    return live.chFeed.map(function (e, i) {
      return '<div class="feed-row' + (i === 0 ? " new" : "") + '"><span class="feed-dot"></span>' +
        "<span>" + esc(e.name.split(" ")[0]) + " submitted, scored " + e.pct + "%</span></div>";
    }).join("");
  }

  /* ---------------- student views ---------------- */

  function viewRoles(user) {
    var o = state.onb;
    /* A student who picked "I know my target role" and changed their mind needs a way
       back to the options, or to the recommendation if they asked for one. */
    var back = null;
    if (o && o.rec) back = { to: "onb-recommend", label: "Back to your recommendations" };
    else if (o) back = { to: "onb-fork", label: "Back to your options" };

    return '<div class="page-head">' +
        (back ? '<button class="btn sm ghost" style="margin-bottom:10px" data-action="onb-resume-flow" ' +
                'data-to="' + back.to + '"' + (back.fresh ? ' data-fresh="1"' : "") +
                ">&larr; " + esc(back.label) + "</button>" : "") +
        '<div class="eyebrow">' + (o && o.mode === "know" ? "Step 3 of 3" : "Step 1") + '</div><h1>Choose your target role</h1>' +
        '<p class="sub">Each role has its own roadmap, its own courses, and its own assessments. The same skill is taught and tested differently depending on the role you are preparing for.</p></div>' +
      '<div class="role-grid">' +
        ROLES.map(function (r) {
          var hits = o && o.detect ? r.skills.filter(function (s) { return !!o.detect.skills[s.id]; }).length : 0;
          return '<button class="role-card" data-action="pick-role" data-role="' + r.id + '">' +
            '<span class="role-ico" aria-hidden="true">' + esc(initials(r.name)) + "</span>" +
            "<h3>" + esc(r.name) + "</h3><p class=\"tag\">" + esc(r.tagline) + "</p>" +
            (hits ? '<div class="pill ok" style="margin-bottom:8px">Your resume covers ' + hits + " of " + r.skills.length + " skills</div>" : "") +
            '<div class="n">' + (r.tracks ? r.tracks.length + " modules &middot; " + r.skills.length + " sub-modules" : r.skills.length + " skills") + " &middot; " +
              r.skills.reduce(function (a, s) { return a + s.assessment.length; }, 0) + " assessment questions</div></button>";
        }).join("") +
      "</div>" +
      (user.roleId ? '<p class="tiny muted" style="margin-top:16px">Switching roles keeps your stars on your current track. Stars are earned per skill within a role, so they do not transfer between roles.</p>' : "") +
      historyOfRoadmaps(user) +
      ((o && o.rec) ? "" :
        '<div class="card" style="margin-top:18px"><div class="row" style="justify-content:space-between">' +
        '<p class="tiny muted">Not sure which one? Answer five short questions with no wrong answers, and ' +
        "CareerPath will give each roadmap a match score with a reason.</p>" +
        '<button class="btn sm" data-action="onb-open">' +
        (user.resume || user.placement ? "Redo the recommendation" : "Get a recommendation") + "</button></div></div>");
  }

  /* Roadmaps a student has left are kept, never deleted, so the stars earned there
     still mean something and they can go back to that track. */
  function historyOfRoadmaps(user) {
    if (!user.roleHistory.length) return "";
    return '<div class="card" style="margin-top:18px">' +
      '<h3 style="margin-bottom:4px">Roadmaps you have worked on before</h3>' +
      '<p class="tiny muted" style="margin-bottom:12px">Nothing here was deleted when you switched. Pick one again and ' +
      "your stars on it are exactly where you left them.</p>" +
      '<div class="scroll-x"><table class="grid"><thead><tr><th>Roadmap</th><th>Stars</th><th>Verified</th><th>Left</th><th></th></tr></thead><tbody>' +
      user.roleHistory.map(function (h) {
        return "<tr><td>" + esc(h.name) + '</td><td class="mono">' + h.stars + "</td>" +
          '<td class="mono">' + h.verified + " / " + h.of + '</td><td class="mono tiny">' + esc(h.left) + "</td>" +
          "<td>" + (h.retired || !role(h.roleId) ? '<span class="tiny muted">No longer offered</span>'
            : '<button class="btn sm" data-action="pick-role" data-role="' + h.roleId + '">Resume</button>') + "</td></tr>";
      }).join("") + "</tbody></table></div></div>";
  }

  function viewRoadmap(user) {
    var r = role(user.roleId);
    if (!r) return viewRoles(user);
    if (r.tracks) return viewRoadmapTracks(user, r);
    var n = r.skills.length, next = upNext(user, r);

    return '<div class="page-head"><div class="eyebrow">' + esc(r.name) + " roadmap</div>" +
        "<h1>Your verified skill roadmap</h1>" +
        '<p class="sub">Progress moves only through assessment. Nothing here can be checked off by hand.</p></div>' +
      progressCard(user, r) +
      '<div class="summary-row">' +
        summaryCell("Job-ready skills", jobReadyCount(user) + "<small> / " + n + "</small>") +
        summaryCell("Stars earned", totalStars(user) + "<small> / " + maxStars(user) + "</small>") +
        summaryCell("Certificates", String(certsFor(user).length)) +
        summaryCell("Leaderboard points", String(user.points)) +
      "</div>" +
      '<div class="roadmap-cols"><div>' +
      '<div class="skill-list rm-list">' +
        r.skills.map(function (s, i) { return roadmapRow(user, s, i, next); }).join("") +
      "</div>" +
      (state.preview ? "" : roadmapExtras(user, r)) +
      "</div>" + (state.preview ? "" : roadmapAside(user)) + "</div>";
  }


  /* ---------------- roadmap with main modules ---------------- */

  function trackCount(user, r) { return r.tracks.filter(function (t) { return t.cert; }).length; }

  function nextModuleStep(user, r) {
    // A module exam that is ready beats the next sub-module, because it is the step that pays off.
    for (var i = 0; i < r.tracks.length; i++) {
      var t = r.tracks[i], st = trackStatus(user, r, t);
      if (st.eligible && !st.certified) return { kind: "exam", track: t };
    }
    for (var j = 0; j < r.tracks.length; j++) {
      var req = skillsOfTrack(r, r.tracks[j], true);
      for (var k = 0; k < req.length; k++) {
        if (prog(user, req[k].id).stars < JOB_READY) return { kind: "skill", skill: req[k], track: r.tracks[j] };
      }
    }
    return null;
  }

  function viewRoadmapTracks(user, r) {
    var n = r.skills.length;
    return '<div class="page-head"><div class="eyebrow">' + esc(r.name) + " roadmap</div>" +
        "<h1>Your verified skill roadmap</h1>" +
        '<p class="sub">' + r.tracks.length + " main modules, " + n + " sub-modules. Stars are earned per sub-module, and a certificate is earned per main module. Nothing here can be checked off by hand.</p></div>" +
      trackProgressCard(user, r) +
      '<div class="summary-row">' +
        summaryCell("Job-ready sub-modules", jobReadyCount(user) + "<small> / " + n + "</small>") +
        summaryCell("Stars earned", totalStars(user) + "<small> / " + maxStars(user) + "</small>") +
        summaryCell("Certificates", certsFor(user).length + "<small> / " + trackCount(user, r) + "</small>") +
        summaryCell("Leaderboard points", String(user.points)) +
      "</div>" +
      '<div class="roadmap-cols"><div>' +
      '<div class="skill-list rm-list">' + r.tracks.map(function (t, i) { return trackRow(user, r, t, i); }).join("") + "</div>" +
      (state.preview ? "" : roadmapExtras(user, r)) +
      "</div>" + (state.preview ? "" : roadmapAside(user)) + "</div>";
  }

  function trackProgressCard(user, r) {
    var n = r.skills.length, ready = jobReadyCount(user), step = nextModuleStep(user, r), box;
    if (step && step.kind === "exam") {
      box = '<div class="rm-next"><div class="rm-next-k">Module exam ready</div>' +
        '<div class="rm-next-n">' + esc(step.track.name) + "</div>" +
        '<p class="rm-next-d">Every required sub-module is job-ready. Pass the module exam (' + passMark() + '% or more) to earn the certificate.</p>' +
        '<button class="btn primary" data-action="open-track" data-track="' + step.track.id + '">Open module &rarr;</button></div>';
    } else if (step) {
      var st = prog(user, step.skill.id).stars;
      box = '<div class="rm-next"><div class="rm-next-k">Up next</div>' +
        '<div class="rm-next-n">' + esc(step.skill.name) + "</div>" +
        '<p class="rm-next-d">' + esc(step.track.name) + ". " + (st === 0
          ? "Start the sub-module or take its assessment to test out."
          : "You have " + st + " star" + (st === 1 ? "" : "s") + ". Score " + passMark() + "% or more on the assessment to become job-ready.") + "</p>" +
        '<button class="btn primary" data-action="open-skill" data-skill="' + step.skill.id + '">Continue &rarr;</button></div>';
    } else {
      box = '<div class="rm-next done"><div class="rm-next-k">Roadmap complete</div>' +
        '<div class="rm-next-n">Every sub-module is job-ready</div>' +
        '<p class="rm-next-d">You can still raise any sub-module toward 5 stars.</p>' +
        '<button class="btn" data-action="nav" data-nav="certs">View certificates &rarr;</button></div>';
    }
    return '<section class="rm-progress" aria-label="Your progress">' +
      '<div class="rm-top"><div class="rm-sum">' +
        '<div class="rm-k">Your progress</div>' +
        '<div class="rm-num"><em>' + certsFor(user).length + "</em> of " + trackCount(user, r) + " certificates <small>earned</small></div>" +
        '<p class="rm-def"><b>' + ready + " of " + n + " sub-modules job-ready.</b> Job-ready = 3 stars: score " + passMark() + "% or more on the sub-module&rsquo;s assessment.</p>" +
      "</div>" + box + "</div>" +
      '<div class="rm-segs" role="img" aria-label="Progress in each of ' + r.tracks.length + ' main modules">' +
        r.tracks.map(function (t) {
          var st = trackStatus(user, r, t);
          var w = st.req.length ? Math.round(st.ready.length / st.req.length * 100) : 0;
          return '<div class="rm-seg" title="' + esc(t.name) + '"><i><b style="width:' + w + '%"></b></i><span>' + esc(shortTrackName(t.name)) + "</span></div>";
        }).join("") +
      "</div></section>";
  }

  function shortTrackName(name) {
    return String(name).replace("Professional Product Management", "Professional PM")
      .replace("Data-Driven Product Management", "Data-Driven PM").replace("SQL for Product Managers", "SQL for PMs");
  }

  function trackRow(user, r, t, i) {
    var st = trackStatus(user, r, t);
    var done = st.certified || (!t.cert && st.req.length && st.ready.length === st.req.length);
    var cur = !done && (st.ready.length > 0 || st.eligible);
    var dot = done ? '<span class="rm-dot done" aria-hidden="true">&#10003;</span>'
      : '<span class="rm-dot' + (cur ? " cur" : "") + '" aria-hidden="true">' + (i + 1) + "</span>";
    var chip = st.certified ? '<span class="rm-chip ok">&#10003; Certified</span>'
      : st.eligible ? '<span class="rm-chip prog">Exam ready</span>'
      : !t.cert && done ? '<span class="rm-chip ok">&#10003; Complete</span>'
      : st.ready.length > 0 ? '<span class="rm-chip prog">In progress</span>'
      : '<span class="rm-chip">Not started</span>';
    var note = st.ready.length + " of " + st.req.length + " sub-modules job-ready" + (t.cert ? "" : '<span class="rm-sub">No certificate for this module</span>');
    return '<button class="skill-row rm-row' + (done ? " is-ready" : "") + (cur ? " is-next" : "") + '" data-action="open-track" data-track="' + t.id + '">' +
      dot + '<span class="rm-name"><span class="skill-name">' + esc(t.name) + "</span>" +
        '<span class="skill-lens">' + esc(t.lens) + "</span></span>" +
      '<span class="rm-meta"><span class="rm-st">' + chip + '</span><span class="rm-sr"><span class="rm-note">' + note + "</span></span></span>" +
      '<span class="rm-chev" aria-hidden="true">&rsaquo;</span></button>';
  }

  function viewTrack(user) {
    var r = role(user.roleId), t = trackById(r, state.route.track);
    if (!t) return viewRoadmap(user);
    var st = trackStatus(user, r, t), idx = r.tracks.indexOf(t);
    var step = nextModuleStep(user, r);
    var nextSkill = step && step.kind === "skill" && step.track.id === t.id ? step.skill : null;
    var counter = 0;
    var steps = "";
    if (t.cert) {
      var need = st.req.length - st.ready.length;
      steps = '<div class="card" style="margin-bottom:18px"><h3 style="margin-bottom:10px">How you earn the certificate</h3>' +
        '<ol class="mx-steps">' +
          "<li" + (need === 0 ? ' class="ok"' : "") + "><b>Reach 3 stars in every required sub-module.</b> " +
            (need === 0 ? "Done: " + st.ready.length + " of " + st.req.length + "." : st.ready.length + " of " + st.req.length + " done, " + need + " to go.") + "</li>" +
          "<li" + (st.certified ? ' class="ok"' : "") + "><b>Pass the module exam.</b> " + t.questions + " questions drawn from those sub-modules, " + passMark() + "% or more to pass. " +
            (st.exam.attempts ? "Best score " + st.exam.best + "% over " + st.exam.attempts + " attempt" + (st.exam.attempts > 1 ? "s" : "") + "." : "Not attempted yet.") + "</li>" +
        "</ol>" +
        (st.certified
          ? '<div class="row" style="gap:8px"><span class="pill ok">Certified' + (st.withBadge ? " &middot; with Python" : "") + '</span>' +
            '<button class="btn primary" data-action="open-cert" data-skill="' + t.id + '">View certificate</button>' +
            '<button class="btn" data-action="start-mexam" data-track="' + t.id + '">Retake exam</button></div>'
          : st.eligible
            ? '<button class="btn primary" data-action="start-mexam" data-track="' + t.id + '">Take the module exam</button>'
            : '<button class="btn" disabled>Module exam locked</button> <span class="tiny muted">Unlocks when every required sub-module is job-ready.</span>') +
        (t.groups.some(function (g) { return g.badge; }) && st.certified && !st.withBadge
          ? '<p class="tiny muted" style="margin-top:10px">Optional: reach 3 stars in the Python sub-modules to add the &ldquo;with Python&rdquo; distinction to this certificate.</p>' : "") +
        "</div>";
    } else {
      steps = '<div class="card" style="margin-bottom:18px"><p class="tiny muted">This module is practice. It has stars for each sub-module but no module exam and no certificate.</p></div>';
    }
    var dataCard = "";
    if (t.data) {
      var files = ["users", "artists", "tracks", "listens", "events", "subscriptions", "experiment_assignments", "support_tickets"];
      dataCard = '<div class="card" style="margin-bottom:18px"><h3 style="margin-bottom:6px">Practice dataset: TuneBox</h3>' +
        '<p class="tiny muted" style="margin-bottom:10px">Every query and code example in these lessons was run on this synthetic music-app data (3,000 users, about 75,000 listens). ' +
        "Download the CSV files, load them into SQLite or pandas, and run the examples yourself. The numbers are illustrative, not real-world benchmarks.</p>" +
        '<div class="row" style="gap:6px">' + files.map(function (f) {
          return '<a class="pill accent" href="practice-data/' + f + '.csv" download>' + f + ".csv</a>";
        }).join("") + "</div></div>";
    }
    return examErrBox() + '<div class="page-head"><button class="btn sm ghost" style="margin-bottom:10px" data-action="nav" data-nav="roadmap">&larr; Roadmap</button>' +
        '<div class="eyebrow">Module ' + (idx + 1) + " of " + r.tracks.length + "</div><h1>" + esc(t.name) + "</h1>" +
        '<p class="sub">' + esc(t.summary) + "</p></div>" + steps + dataCard +
      t.groups.map(function (g) {
        var list = g.skills.map(function (id) { return r.skills.filter(function (x) { return x.id === id; })[0]; }).filter(Boolean);
        return (t.groups.length > 1 || !g.required ? '<h3 class="trk-group">' + esc(g.label) + (g.required ? "" : ' <span class="pill">Optional</span>') + "</h3>" : "") +
          '<div class="skill-list rm-list" style="margin-bottom:18px">' +
          list.map(function (sk) { counter++; return roadmapRow(user, sk, counter - 1, nextSkill); }).join("") + "</div>";
      }).join("");
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x;
    }
    return a;
  }

  /* A module exam is a fresh draw from the sub-modules' own graded assessments, spread
     evenly across the required sub-modules and skewed away from the easiest level. */
  /* ---------------- server grading (real accounts) ----------------
     With real accounts the server picks the questions, grades the answers and records the result (api/exam.js). The page
     holds no answer keys, so it cannot grade; it sends the answers and shows what comes back. The browser-only demo and the
     admin preview still grade on the page, which is why they keep the keys. */
  function serverGrading() { return REAL && !state.preview; }

  function apiPost(path, payload) {
    return CP_AUTH.token().then(function (t) {
      if (!t) return { error: { code: "signed_out", message: "Your session expired. Sign in again." } };
      return fetch(path, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + t }, body: JSON.stringify(payload) })
        .then(function (r) {
          return r.json().catch(function () { return null; }).then(function (b) {
            if (r.ok && b && !b.error) return { data: b };
            return { error: (b && b.error) || { code: "server_error", message: "The server could not be reached. Try again." } };
          });
        });
    }).catch(function () { return { error: { code: "network", message: "Could not reach the server. Check your connection and try again." } }; });
  }

  function examErrBox() {
    return state.examErr ? '<div class="check-panel warn" style="margin-bottom:16px"><b>Could not start the exam.</b><p class="tiny" style="margin-top:4px">' + esc(state.examErr) + "</p></div>" : "";
  }

  /* The server's list of question ids -> the questions on this page (text and options, no answers). */
  function localQuestions(user, items) {
    var r = role(user.roleId);
    return items.map(function (it) {
      var sk = skill(user.roleId, it.skill), q = findQ(sk, it.qid);
      return q ? { q: q.q, opts: q.opts, lvl: q.lvl, qid: q.qid, v: q.v, skillId: sk.id, skillName: sk.name } : null;
    }).filter(Boolean);
  }
  function resOk(res, i, q) { return res.ok ? !!res.ok[i] : res.answers[i] === q.a; }
  function resKey(res, i, q) { return res.ka && res.ka[i] != null ? res.ka[i] : q.a; }
  function resWhy(res, i, q) { return res.kw && res.kw[i] != null ? res.kw[i] : q.why; }

  /* Hand the finished attempt to the server and show its answer. A failed send keeps the answers so the student can retry. */
  function sendExam(kind, e) {
    var u = actor();
    state.pendingExam = { kind: kind, e: e };
    state.result = kind === "skill" ? { skillId: e.skillId, busy: true } : null;
    state.mresult = kind === "module" ? { trackId: e.trackId, busy: true } : null;
    go(kind === "skill" ? "result" : "mresult");
    apiPost("/api/exam", { action: "submit", attempt: e.attempt, answers: e.answers }).then(function (r) {
      if (me() !== u) return;
      if (r.error) {
        var bad = kind === "skill" ? state.result : state.mresult;
        if (bad) { bad.busy = false; bad.err = r.error.message; bad.retry = ["already_submitted", "no_attempt", "expired"].indexOf(r.error.code) < 0; }
        return render();
      }
      var d = r.data;
      state.pendingExam = null; state.exam = null; state.mexam = null;
      u.points = d.points;
      var ok = d.detail.map(function (x) { return x.ok; }), ka = d.detail.map(function (x) { return x.a; }), kw = d.detail.map(function (x) { return x.why; });
      if (kind === "skill") {
        var p = prog(u, e.skillId), sp = splitHistory(d.progress.history);
        p.stars = d.progress.stars; p.best = d.progress.best; p.attempts = d.progress.attempts; p.project = d.progress.project;
        p.history = sp.history; if (sp.sub) p.projectSub = sp.sub;
        state.result = { skillId: e.skillId, pct: d.pct, right: d.right, total: d.total, answers: e.answers, award: d.award, qs: e.qs,
          newStars: d.newStars, pointsAwarded: d.pointsAwarded, ok: ok, ka: ka, kw: kw };
        sync.skills[e.skillId] = lessonsKey(p);
      } else {
        var m = mex(u, e.trackId);
        m.best = d.module.best; m.attempts = d.module.attempts; m.passed = d.module.passed; m.passedOn = d.module.passedOn; m.history = d.module.history;
        state.mresult = { trackId: e.trackId, pct: d.pct, right: d.right, items: e.items, answers: e.answers, pass: d.passed, first: d.first,
          points: d.pointsAwarded, ok: ok, ka: ka, kw: kw };
      }
      render();
    });
  }

  function buildModuleExam(r, t) {
    var req = skillsOfTrack(r, t, true), per = Math.ceil(t.questions / req.length), items = [];
    req.forEach(function (sk) {
      var pool = shuffle(sk.assessment.filter(function (q) { return q.lvl >= 2; }));
      pool.slice(0, per).forEach(function (q) {
        items.push({ q: q.q, opts: q.opts, a: q.a, why: q.why, lvl: q.lvl, qid: q.qid, v: q.v, skillId: sk.id, skillName: sk.name });
      });
    });
    return shuffle(items).slice(0, t.questions);
  }

  function viewModuleExam(user) {
    var r = role(user.roleId), t = trackById(r, state.mexam.trackId), e = state.mexam;
    var item = e.items[e.idx];
    return '<div class="page-head"><div class="eyebrow">Module exam &middot; ' + esc(t.name) + "</div>" +
        "<h1>Question " + (e.idx + 1) + " of " + e.items.length + "</h1></div>" +
      '<div class="segs" role="progressbar" aria-valuemin="0" aria-valuemax="' + e.items.length + '" aria-valuenow="' + e.idx + '">' +
        e.items.map(function (q, j) { return '<i class="' + (j < e.idx ? "on" : "") + '"></i>'; }).join("") + "</div>" +
      '<div class="q-card"><div class="progress-head"><span class="pill">Level ' + item.lvl + '</span>' +
        '<span class="tiny muted ver">' + esc(item.skillName) + "</span></div>" +
        '<p class="q-stem">' + esc(item.q) + '</p><div class="opts">' +
        item.opts.map(function (o, j) {
          return '<button class="opt" data-action="mexam-answer" data-i="' + j + '"><span class="key">' + "ABCD"[j] + "</span><span>" + esc(o) + "</span></button>";
        }).join("") + "</div></div>" +
      '<p class="tiny muted" style="margin-top:14px">Answers are final once selected. You need ' + passMark() + "% to pass.</p>";
  }

  function finishModuleExam(user, r, t, e) {
    var right = e.answers.filter(function (a, i) { return a === e.items[i].a; }).length;
    var pct = Math.round(right / e.items.length * 100);
    var m = mex(user, t.id), pass = pct >= passMark(), first = false, pts = 0;
    if (!state.preview) {
      m.attempts++;
      m.history.push({ pct: pct, when: today() });
      if (pct > m.best) m.best = pct;
      if (pass && !m.passed) { m.passed = true; m.passedOn = today(); first = true; pts = 250; user.points += pts; }
    }
    state.mresult = { trackId: t.id, pct: pct, right: right, items: e.items, answers: e.answers, pass: pass, first: first, points: pts };
    state.mexam = null;
    go("mresult");
  }

  function viewModuleResult(user) {
    var res = state.mresult, r = role(user.roleId), t = trackById(r, res.trackId);
    if (res.busy || res.err) return scoringView(res, null, "module");
    var by = {};
    res.items.forEach(function (q, i) {
      var b = by[q.skillId] || (by[q.skillId] = { name: q.skillName, right: 0, total: 0 });
      b.total++; if (resOk(res, i, q)) b.right++;
    });
    var weak = res.items.filter(function (q, i) { return !resOk(res, i, q); });
    var st = trackStatus(user, r, t);
    return '<div class="page-head result-head"><div class="eyebrow">Module exam result &middot; ' + esc(t.name) + "</div>" +
        '<h1 class="result-h1"><span class="big">' + res.pct + "%</span> <span class=\"rest\">" + (res.pass ? "Passed" : "Not yet") + "</span></h1>" +
        '<p class="sub">' + (state.preview ? "Preview only. Nothing was recorded."
          : res.first ? "You earned the " + esc(certTitle(user, r, t)) + " certificate and " + res.points + " leaderboard points."
          : res.pass ? "You passed again. Your certificate was already issued."
          : "You need " + passMark() + "% to pass. Review the areas below, then try again. Each attempt draws a fresh set of questions.") + "</p></div>" +
      '<div class="summary-row">' +
        summaryCell("Score", res.right + "<small> / " + res.items.length + "</small>") +
        summaryCell("Percent", res.pct + "<small>%</small>") +
        summaryCell("Pass mark", passMark() + "<small>%</small>") +
        summaryCell("Attempt", String(st.exam.attempts)) +
      "</div>" +
      '<div class="stack"><div class="card"><h3 style="margin-bottom:12px">Performance by sub-module</h3>' +
        '<div class="scroll-x"><table class="grid"><thead><tr><th>Sub-module</th><th>Correct</th><th>Result</th></tr></thead><tbody>' +
        Object.keys(by).map(function (k) {
          var b = by[k], ratio = b.right / b.total;
          return "<tr><td>" + esc(b.name) + '</td><td class="mono">' + b.right + " / " + b.total + "</td><td>" +
            (ratio >= 0.75 ? '<span class="pill ok">Strong</span>' : ratio < 0.4 ? '<span class="pill bad">Weak</span>' : '<span class="pill warn">Partial</span>') + "</td></tr>";
        }).join("") + "</tbody></table></div></div>" +
      (weak.length ? '<div class="card"><h3 style="margin-bottom:4px">Review these ' + weak.length + "</h3>" +
        '<p class="tiny muted" style="margin-bottom:13px">Each one you missed, with the reasoning.</p><div class="stack" style="gap:16px">' +
        res.items.map(function (q, i) {
          if (resOk(res, i, q)) return "";
          return '<div><p style="font-weight:500;margin-bottom:8px"><span class="pill" style="margin-right:6px">' + esc(q.skillName) + "</span>" + esc(q.q) + "</p>" +
            '<div class="opts">' + q.opts.map(function (o, j) {
              var sx = j === resKey(res, i, q) ? "correct" : (res.answers[i] === j ? "wrong" : "");
              return '<div class="opt" data-state="' + sx + '"><span class="key">' + "ABCD"[j] + "</span><span>" + esc(o) + "</span></div>";
            }).join("") + '</div><div class="why"><b>Why:</b> ' + esc(resWhy(res, i, q)) + "</div></div>";
        }).join("") + "</div></div>"
        : '<div class="card"><h3>Every question correct.</h3></div>') +
      "</div>" +
      '<div class="row" style="margin-top:20px">' +
        (state.preview ? '<button class="btn primary" data-action="exit-preview">Exit preview</button>'
          : '<button class="btn primary" data-action="open-track" data-track="' + t.id + '">Back to module</button>') +
        (!state.preview && res.pass ? '<button class="btn" data-action="open-cert" data-skill="' + t.id + '">View certificate</button>' : "") +
        (!res.pass ? '<button class="btn" data-action="start-mexam" data-track="' + t.id + '">Try again</button>' : "") +
      "</div>";
  }

  /* The first skill, in roadmap order, that is not yet job-ready. Null when all are. */
  function upNext(user, r) {
    for (var i = 0; i < r.skills.length; i++) {
      if (prog(user, r.skills[i].id).stars < JOB_READY) return r.skills[i];
    }
    return null;
  }

  // Short label for the segmented bar: the part of the name before "&", "for" or ":".
  function shortSkillName(name) {
    return String(name).split(/ & | for |: /)[0];
  }

  function resumeMentions(user, skillId) {
    var rr = user.resume;
    return !!(rr && rr.skills && rr.skills.indexOf(skillId) !== -1);
  }

  /* One number for progress: skills at 3 stars. The bar has one segment per skill,
     filled toward that same target, so the count and the bar can never disagree. */
  function progressCard(user, r) {
    var n = r.skills.length, ready = jobReadyCount(user), next = upNext(user, r);
    var box;
    if (next) {
      var st = prog(user, next.id).stars;
      var line = st === 0
        ? "Start the course or take the assessment to test out."
        : "You have " + st + " star" + (st === 1 ? "" : "s") + ". Score " + LEVELS[JOB_READY].min +
          "% or more on the assessment to become job-ready.";
      box = '<div class="rm-next"><div class="rm-next-k">Up next</div>' +
        '<div class="rm-next-n">' + esc(next.name) + "</div>" +
        '<p class="rm-next-d">' + line + "</p>" +
        '<button class="btn primary" data-action="open-skill" data-skill="' + next.id + '">Continue &rarr;</button></div>';
    } else {
      box = '<div class="rm-next done"><div class="rm-next-k">Roadmap complete</div>' +
        '<div class="rm-next-n">All ' + n + " skills are job-ready</div>" +
        '<p class="rm-next-d">You can still raise any skill toward 5 stars.</p>' +
        '<button class="btn" data-action="nav" data-nav="certs">View certificates &rarr;</button></div>';
    }
    return '<section class="rm-progress" aria-label="Your progress">' +
      '<div class="rm-top"><div class="rm-sum">' +
        '<div class="rm-k">Your progress</div>' +
        '<div class="rm-num"><em>' + ready + "</em> of " + n + " skills <small>job-ready</small></div>" +
        '<p class="rm-def"><b>Job-ready = 3 stars:</b> score ' + LEVELS[JOB_READY].min + "% or more on the skill&rsquo;s assessment.</p>" +
      "</div>" + box + "</div>" +
      '<div class="rm-segs" role="img" aria-label="' + ready + " of " + n + ' skills job-ready">' +
        r.skills.map(function (s) {
          var w = Math.round(Math.min(prog(user, s.id).stars, JOB_READY) / JOB_READY * 100);
          return '<div class="rm-seg" title="' + esc(s.name) + '"><i><b style="width:' + w + '%"></b></i>' +
            (n > 8 ? "" : "<span>" + esc(shortSkillName(s.name)) + "</span>") + "</div>";
        }).join("") +
      "</div></section>";
  }

  function roadmapRow(user, s, i, next) {
    var st = prog(user, s.id).stars;
    var ready = st >= JOB_READY, cur = !!next && next.id === s.id;
    var dot = ready ? '<span class="rm-dot done" aria-hidden="true">&#10003;</span>'
      : '<span class="rm-dot' + (cur ? " cur" : "") + '" aria-hidden="true">' + (i + 1) + "</span>";
    var chip = ready ? '<span class="rm-chip ok">&#10003; Job-ready</span>'
      : st > 0 ? '<span class="rm-chip prog">In progress</span>'
      : '<span class="rm-chip">Not started</span>';
    var note = st === JOB_READY ? "Target met"
      : st > JOB_READY ? LEVELS[st].label
      : (JOB_READY - st) + " star" + (JOB_READY - st === 1 ? "" : "s") + " to job-ready";
    var stars = '<span class="stars rm-stars" aria-label="' + st + ' of 5 stars">';
    for (var k = 1; k <= 5; k++) {
      stars += '<span class="' + (k <= st ? "on" : "off") + (k === JOB_READY ? " tgt" : "") + '">' + STAR + "</span>";
    }
    stars += "</span>";
    return '<button class="skill-row rm-row' + (ready ? " is-ready" : "") + (cur ? " is-next" : "") + '" ' +
        'data-action="open-skill" data-skill="' + s.id + '">' +
      dot +
      '<span class="rm-name"><span class="skill-name">' + esc(s.name) + "</span>" +
        '<span class="skill-lens">' + esc(s.lens) + "</span>" +
        (st === 0 && resumeMentions(user, s.id)
          ? '<span class="rm-hint">Your resume mentions this. Take the test to skip ahead.</span>' : "") +
      "</span>" +
      '<span class="rm-meta"><span class="rm-st">' + chip + "</span>" +
        '<span class="rm-sr">' + stars + '<span class="rm-note">' + note + "</span></span></span>" +
      '<span class="rm-chev" aria-hidden="true">&rsaquo;</span>' +
    "</button>";
  }

  /* The board sits beside the roadmap and moves while the student is looking at it,
     which is the point of making it live rather than a page they have to reload. */
  /* Under the roadmap list: how stars work, and what the student can earn next. The rail beside the list
     is taller than the list, so without these the left column ends early and leaves a blank block. */
  function recentResults(user, r) {
    var out = [];
    r.skills.forEach(function (sk) {
      var p = user.progress[sk.id];
      if (p && p.history) p.history.forEach(function (h) { out.push({ name: sk.name, pct: h.pct, stars: h.stars, when: h.when }); });
    });
    return out.slice(-4).reverse();
  }

  function roadmapExtras(user, r) {
    var stars = '<div class="card ex-card"><h3>How stars work</h3><p class="tiny muted">Every sub-module is scored by its assessment. Higher scores earn more stars.</p>' +
      '<ul class="ex-levels">' + [1, 2, 3, 4, 5].map(function (n) {
        return '<li class="' + (n === JOB_READY ? "target" : "") + '"><span>' + starHTML(n, "13px") + "</span>" +
          "<span>" + esc(LEVELS[n].label) + "</span><b class=\"mono\">" + LEVELS[n].min + "%" + (n === 5 ? " + project" : "") + "</b></li>";
      }).join("") + "</ul></div>";

    var second;
    if (r.tracks) {
      second = '<div class="card ex-card"><h3>Certificates you can earn</h3>' +
        '<p class="tiny muted">One per main module. Get every required sub-module job-ready, then pass the module exam.</p>' +
        '<ul class="ex-certs">' + r.tracks.filter(function (t) { return t.cert; }).map(function (t) {
          var st = trackStatus(user, r, t);
          var tag = st.certified ? '<span class="rm-chip ok">&#10003; Certified</span>'
            : st.eligible ? '<span class="rm-chip prog">Exam ready</span>'
            : '<span class="tiny muted mono">' + st.ready.length + "/" + st.req.length + "</span>";
          return '<li><button data-action="open-track" data-track="' + t.id + '"><span>' + esc(t.name) + "</span>" + tag + "</button></li>";
        }).join("") + "</ul></div>";
    } else {
      var rec = recentResults(user, r);
      second = '<div class="card ex-card"><h3>Recent results</h3>' +
        (rec.length
          ? '<ul class="ex-certs">' + rec.map(function (h) {
              return "<li><div class=\"ex-row\"><span>" + esc(h.name) + '<small class="muted"> &middot; ' + esc(h.when) + "</small></span>" +
                '<b class="mono">' + h.pct + "%</b></div></li>";
            }).join("") + "</ul>"
          : '<p class="tiny muted">Nothing yet. Take any assessment and your score shows up here.</p>') + "</div>";
    }
    return '<div class="ex-grid">' + stars + second + "</div>";
  }

  function roadmapAside(user) {
    var c = liveChallenge(user.roleId);
    var sub = c ? user.challenges[c.cid] : null;

    return '<aside class="rail">' +
      '<div class="side-card">' +
        '<div class="side-head"><span>School leaderboard</span>' + livePill() + '</div>' +
        '<div class="side-board" data-live="board" data-compact="1">' + boardHTML(user, true) + "</div>" +
        '<div class="feed" data-live="feed">' + feedHTML() + "</div>" +
        '<button class="btn sm ghost" style="width:100%;justify-content:center" data-action="nav" data-nav="leaderboard">Full board</button>' +
      "</div>" +
      (c
        ? '<div class="side-card">' +
          '<div class="side-head"><span>This week&rsquo;s challenge</span><span class="pill">W' + c.week + "</span></div>" +
          '<p class="tiny" style="font-weight:500;margin-bottom:4px">' + esc(c.title) + "</p>" +
          '<p class="tiny muted" style="margin-bottom:10px">' +
            (sub ? "You scored " + sub.pct + "%." : "Not attempted yet.") + "</p>" +
          '<button class="btn sm ' + (sub ? "" : "primary") + '" style="width:100%;justify-content:center" ' +
            'data-action="nav" data-nav="challenge">' + (sub ? "View result" : "Attempt it") + "</button>" +
        "</div>"
        : "") +
    "</aside>";
  }

  function viewSkill(user) {
    var s = skill(user.roleId, state.route.skill);
    var p = prog(user, s.id);
    var r = role(user.roleId);
    var lessonsDone = p.lessonsDone.length;

    return examErrBox() + '<div class="page-head">' +
        (state.preview ? "" : (trackOfSkill(r, s.id)
          ? '<button class="btn sm ghost" style="margin-bottom:10px" data-action="open-track" data-track="' + trackOfSkill(r, s.id).id + '">&larr; ' + esc(trackOfSkill(r, s.id).name) + "</button>"
          : '<button class="btn sm ghost" style="margin-bottom:10px" data-action="nav" data-nav="roadmap">&larr; Roadmap</button>')) +
        '<div class="eyebrow">' + (trackOfSkill(r, s.id) ? esc(trackOfSkill(r, s.id).name) + " &middot; sub-module" : esc(r.name) + " track") + "</div><h1>" + esc(s.name) + "</h1>" +
        '<p class="sub">' + esc(s.summary) + "</p></div>" +

      '<div class="card" style="margin-bottom:18px">' +
        '<div class="row" style="justify-content:space-between;align-items:flex-start">' +
          "<div><div class=\"eyebrow\">Current level</div>" +
            '<div style="font-size:19px;margin:4px 0 2px">' + starHTML(p.stars, "19px") +
              ' <span style="font-weight:500">' + LEVELS[p.stars].label + "</span></div>" +
            '<p class="tiny muted">' + (p.attempts ? "Best score " + p.best + "% over " + p.attempts + " attempt" + (p.attempts > 1 ? "s" : "") : "No assessment taken yet") + "</p></div>" +
          '<div class="row" style="gap:8px">' +
            '<button class="btn" data-action="start-learn" data-skill="' + s.id + '">' + (lessonsDone ? "Continue course" : "Learn the skill") + "</button>" +
            '<button class="btn primary" data-action="start-exam" data-skill="' + s.id + '">Take the assessment</button>' +
          "</div></div></div>" +

      '<div class="stack">' +
        '<div class="card">' +
          '<div class="row" style="justify-content:space-between;margin-bottom:10px">' +
            '<h3>Lessons</h3><span class="pill">' + lessonsDone + " / " + s.lessons.length + " read</span></div>" +
          '<div class="bar" style="margin-bottom:12px"><span style="width:' + Math.round(lessonsDone / s.lessons.length * 100) + '%"></span></div>' +
          '<div class="stack" style="gap:8px">' +
            s.lessons.map(function (l, i) {
              var done = p.lessonsDone.indexOf(i) > -1;
              var firstOpen = -1;
              s.lessons.forEach(function (x, k) { if (firstOpen < 0 && p.lessonsDone.indexOf(k) < 0) firstOpen = k; });
              return '<button class="opt mod' + (done ? " is-done" : "") + (i === firstOpen ? " is-current" : "") + '" data-action="start-learn" data-skill="' + s.id + '" data-lesson="' + i + '">' +
                '<span class="key">' + (done ? "&#10003;" : i + 1) + "</span><span>" + esc(l.title) + "</span></button>";
            }).join("") +
          "</div></div>" +

        projectBlock(s) +

        '<div class="card"><h3 style="margin-bottom:10px">Assessment</h3>' +
          '<div class="row" style="gap:16px">' +
            '<span class="tiny muted"><b class="mono" style="color:var(--ink)">' + s.assessment.length + "</b> questions</span>" +
            '<span class="tiny muted">Difficulty <b class="mono" style="color:var(--ink)">L1&ndash;L5</b></span>' +
            '<span class="tiny muted">Scored on first selection per question</span>' +
          "</div></div>" +
      "</div>";
  }

  function viewLearn(user) {
    var s = skill(user.roleId, state.route.skill);
    var p = prog(user, s.id);
    var i = Math.min(state.lessonIdx, s.lessons.length - 1);
    var lesson = s.lessons[i];
    var last = i === s.lessons.length - 1;

    return '<div class="page-head">' +
        '<button class="btn sm ghost" style="margin-bottom:10px" data-action="open-skill" data-skill="' + s.id + '">&larr; ' + esc(s.name) + "</button>" +
        '<div class="eyebrow">Lesson ' + (i + 1) + " of " + s.lessons.length + (lesson.minutes ? " &middot; " + lesson.minutes + " min read" : "") + "</div><h1>" + esc(lesson.title) + "</h1></div>" +
      '<div class="segs" aria-hidden="true">' +
        s.lessons.map(function (l, j) {
          return '<i class="' + (p.lessonsDone.indexOf(j) > -1 || j <= i ? "on" : "") + '"></i>';
        }).join("") +
      "</div>" +
      '<div class="lesson-nav">' +
        s.lessons.map(function (l, j) {
          var done = p.lessonsDone.indexOf(j) > -1;
          /* Long courses get numbered chips with the title on hover; the current title is the page heading. */
          var compact = s.lessons.length > 5;
          return '<button data-action="lesson" data-i="' + j + '" aria-current="' + (j === i) + '" class="' + (done && j !== i ? "done" : "") + (compact ? " num" : "") + '"' +
            (compact ? ' title="' + esc(l.title) + '" aria-label="Lesson ' + (j + 1) + ": " + esc(l.title) + '"' : "") + ">" +
            (compact ? (j + 1) : (j + 1) + ". " + esc(l.title)) + "</button>";
        }).join("") +
      "</div>" +
      '<div class="card prose" style="margin-bottom:18px">' + paras(lesson.body) + "</div>" +
      scenarioBlock(s, i, lesson) + revisionBlock(lesson) +
      (last ? (s.practice && s.practice.length ? practiceBlock(s) : "") + deliverableBlock(s) + quizBlock(s) : "") +
      '<div class="row" style="margin-top:20px;justify-content:space-between">' +
        '<button class="btn" data-action="lesson" data-i="' + Math.max(0, i - 1) + '"' + (i === 0 ? " disabled" : "") + ">&larr; Previous</button>" +
        (last ? '<button class="btn primary" data-action="start-exam" data-skill="' + s.id + '">Go to assessment &rarr;</button>'
              : '<button class="btn primary" data-action="lesson" data-i="' + (i + 1) + '">Next lesson &rarr;</button>') +
      "</div>";
  }

  var KIND = {
    query: { label: "Write a query", placeholder: "-- Write your query here" },
    formula: { label: "Write the formula", placeholder: "=" },
    written: { label: "Written answer", placeholder: "Write your answer here before taking a hint" }
  };

  function pstate(key) {
    if (!state.practiceState[key]) state.practiceState[key] = { hints: 0, shown: false, text: "", checked: null, tries: 0 };
    return state.practiceState[key];
  }

  /* Structural check. There is no database in the browser, so a query is checked
     against what a correct answer must contain and the mistakes that make one wrong.
     Written answers are checked for concept coverage instead of correctness. */
  function runCheck(ex, text) {
    var t = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!t) return { empty: true };
    var c = ex.check;
    if (!c) return { none: true };

    var graded = !c.points.length;
    var criteria = (graded ? c.must : c.points).map(function (m) {
      return { label: m.label, ok: m.re.test(t) };
    });
    var problems = c.forbid.filter(function (m) { return m.re.test(t); })
      .map(function (m) { return m.label; });

    var met = criteria.filter(function (x) { return x.ok; }).length;
    var verdict;
    if (graded) {
      verdict = (met === criteria.length && !problems.length) ? "correct"
              : (!problems.length && met / criteria.length >= 0.6) ? "close" : "not-yet";
    } else {
      verdict = met === criteria.length ? "full" : met ? "partial" : "none-covered";
    }
    return { criteria: criteria, problems: problems, met: met, total: criteria.length, graded: graded, verdict: verdict };
  }

  var VERDICT = {
    correct: { tone: "ok", title: "Looks correct" },
    close: { tone: "warn", title: "Close, but something is missing" },
    "not-yet": { tone: "bad", title: "Not yet" },
    full: { tone: "ok", title: "Covers every key point" },
    partial: { tone: "warn", title: "Partly covered" },
    "none-covered": { tone: "bad", title: "None of the key points yet" }
  };

  function checkPanel(res) {
    if (res.empty) {
      return '<div class="check-panel bad"><b>Write an attempt first.</b>' +
        '<p class="tiny" style="margin-top:4px">The check looks at what you wrote, so there is nothing to check yet.</p></div>';
    }
    if (res.none) {
      return '<div class="check-panel warn"><b>No automatic check for this exercise.</b>' +
        '<p class="tiny" style="margin-top:4px">Compare your answer against the model answer below.</p></div>';
    }
    var v = VERDICT[res.verdict];
    return '<div class="check-panel ' + v.tone + '">' +
      '<div class="row" style="justify-content:space-between;gap:10px">' +
        "<b>" + v.title + "</b>" +
        '<span class="mono tiny">' + res.met + " / " + res.total + (res.graded ? " requirements" : " key points") + "</span>" +
      "</div>" +
      '<ul class="crits">' +
        res.criteria.map(function (c) {
          return '<li class="crit ' + (c.ok ? "met" : "unmet") + '"><span class="mark">' +
            (c.ok ? "&#10003;" : "&#8213;") + "</span><span>" + esc(c.label) + "</span></li>";
        }).join("") +
        res.problems.map(function (p) {
          return '<li class="crit problem"><span class="mark">&#10007;</span><span>' + esc(p) + "</span></li>";
        }).join("") +
      "</ul>" +
      '<p class="tiny check-note">' + (res.graded
        ? "This checks the structure of your query against what a correct answer has to contain. It does not run the query against data, so it can pass something that would still fail on a real table."
        : "This checks whether you raised each idea, not how well you argued it. Read the model answer to judge the reasoning.") + "</p>" +
    "</div>";
  }

  function practiceBlock(s) {
    return '<div class="card" style="margin-bottom:18px">' +
      '<h3 style="margin-bottom:4px">Practice exercises</h3>' +
      '<p class="tiny muted" style="margin-bottom:14px">Write your own answer, check it, and take a hint if you are stuck. Practice is for learning only and never affects your stars.</p>' +
      '<div class="stack" style="gap:14px">' +
      s.practice.map(function (ex, i) {
        var key = s.id + "-" + i;
        var st = pstate(key);
        var kind = KIND[ex.kind || "written"];
        var hints = ex.hints || [];
        var more = hints.length - st.hints;

        return '<div class="ex">' +
          '<div class="row" style="justify-content:space-between;margin-bottom:9px">' +
            '<span class="pill accent">Exercise ' + (i + 1) + "</span>" +
            '<span class="pill">' + kind.label + "</span>" +
          "</div>" +

          '<p class="ex-prompt">' + esc(ex.prompt) + "</p>" +

          (ex.schema
            ? '<div class="ex-schema"><span class="fl">Tables available</span><pre>' + esc(ex.schema) + "</pre></div>"
            : "") +

          '<textarea class="ex-input' + (ex.kind === "query" || ex.kind === "formula" ? " code" : "") +
            '" data-practice="' + key + '" rows="' + (ex.kind === "query" ? 8 : 4) +
            '" placeholder="' + esc(kind.placeholder) + '" spellcheck="false">' + esc(st.text) + "</textarea>" +

          '<div class="row" style="margin-top:10px">' +
            '<button class="btn sm primary" data-action="practice-check" data-key="' + key + '">' +
              (st.checked ? "Check again" : "Check my answer") + "</button>" +
            (more > 0
              ? '<button class="btn sm" data-action="practice-hint" data-key="' + key + '">' +
                (st.hints === 0 ? "Show a hint" : "Next hint") + " (" + more + " left)</button>"
              : (hints.length ? '<span class="tiny muted">All hints shown</span>' : "")) +
            (st.tries > 0
              ? '<button class="btn sm" data-action="practice-answer" data-key="' + key + '">' + (st.shown ? "Hide answer" : "Show answer") + "</button>"
              : '<span class="tiny muted">The model answer unlocks after you check your own attempt.</span>') +
            (st.tries > 1 ? '<span class="tiny muted mono">attempt ' + st.tries + "</span>" : "") +
          "</div>" +

          (st.checked ? checkPanel(st.checked) : "") +

          (st.hints > 0
            ? '<div class="stack" style="gap:7px;margin-top:11px">' +
              hints.slice(0, st.hints).map(function (h, j) {
                return '<div class="hint"><b>Hint ' + (j + 1) + "</b> " + esc(h) + "</div>";
              }).join("") + "</div>"
            : "") +

          (st.shown && st.tries > 0
            ? '<div style="margin-top:12px">' +
              (ex.solution ? '<div class="ex-solution"><span class="fl">Model answer</span><pre>' + esc(ex.solution) + "</pre></div>" : "") +
              '<div class="why">' + esc(ex.answer).split("\n\n").map(function (p) { return "<p>" + p + "</p>"; }).join("") + "</div>" +
            "</div>"
            : "") +
        "</div>";
      }).join("") + "</div></div>";
  }


  /* ---------------- scenario practice and revision sheet ----------------
     Every lesson of the newer courses ends with a scenario: one decision question that is
     answered at once, and one written answer that is checked for the key ideas a strong
     answer contains. The model answer is shown on request. Practice never affects stars. */

  function scnState(skillId, i) { return pstate(skillId + "|L" + i); }

  function scenarioBlock(s, i, lesson) {
    var sc = lesson.scenario;
    if (!sc) return "";
    var key = s.id + "|L" + i;
    var st = pstate(key);
    var q = sc.mcq, w = sc.written;
    var picked = typeof st.pick === "number";
    var attempted = !!(st.checked && !st.checked.empty);
    var canReview = st.checked && !st.checked.empty && !st.checked.none && tutor.ready && !tutor.denied;

    return '<div class="card scn" style="margin-bottom:18px">' +
      '<div class="row" style="justify-content:space-between;margin-bottom:8px">' +
        '<h3>Practice scenario</h3><span class="pill accent">Does not affect your stars</span></div>' +
      '<p class="scn-setup">' + esc(sc.setup) + "</p>" +

      '<p class="ex-prompt" style="margin-top:14px"><b>Step 1.</b> ' + esc(q.q) + "</p>" +
      '<div class="opts">' + q.opts.map(function (o, j) {
        var state = !picked ? "" : j === q.a ? "correct" : (st.pick === j ? "wrong" : "");
        return '<button class="opt" data-action="scn-pick" data-key="' + esc(key) + '" data-i="' + j + '"' +
          (state ? ' data-state="' + state + '"' : "") + (picked ? " disabled" : "") + '>' +
          '<span class="key">' + "ABCD"[j] + "</span><span>" + esc(o) + "</span></button>";
      }).join("") + "</div>" +
      (picked ? '<div class="why ' + (st.pick === q.a ? "right" : "wrong") + '"><b>' + (st.pick === q.a ? "Right." : "Not quite.") + "</b> " + esc(q.why) + "</div>" : "") +

      '<p class="ex-prompt" style="margin-top:16px"><b>Step 2.</b> ' + esc(w.prompt) + "</p>" +
      '<textarea class="ex-input" data-practice="' + esc(key) + '" rows="5" placeholder="Write your answer the way you would say it in an interview. Check it when you are done." spellcheck="true">' +
        esc(st.text) + "</textarea>" +
      '<div class="row" style="margin-top:10px">' +
        '<button class="btn sm primary" data-action="scn-check" data-key="' + esc(key) + '">' + (st.checked ? "Check again" : "Check my answer") + "</button>" +
        (canReview ? '<button class="btn sm" data-action="scn-review" data-key="' + esc(key) + '"' + (st.reviewBusy ? " disabled" : "") + ">" +
          (st.reviewBusy ? "Reviewing..." : st.review ? "Review again" : "Get a written review") + "</button>" : "") +
        ((st.hintList || []).length < 3
          ? '<button class="btn sm" data-action="scn-hint" data-key="' + esc(key) + '"' + (st.hintBusy ? " disabled" : "") + ">" +
            (st.hintBusy ? "Thinking..." : (st.hintList || []).length ? "Another hint" : "Get a hint") + "</button>" : "") +
        (attempted
          ? '<button class="btn sm" data-action="scn-show" data-key="' + esc(key) + '">' + (st.shown ? "Hide the stronger answer" : "Show the stronger answer") + "</button>"
          : '<span class="tiny muted">The stronger answer unlocks after you check your own.</span>') +
      "</div>" +
      (st.hintList || []).map(function (h, j) { return '<div class="hint" style="margin-top:10px"><b>Hint ' + (j + 1) + "</b> " + esc(h) + "</div>"; }).join("") +
      (st.checked ? checkPanel(st.checked) : "") +
      (st.review ? '<div class="hint" style="margin-top:11px"><b>Review</b> ' + esc(st.review) + "</div>" : "") +
      (st.reviewErr ? '<div class="check-panel warn" style="margin-top:11px"><b>No review this time.</b><p class="tiny" style="margin-top:4px">' + esc(st.reviewErr) + "</p></div>" : "") +
      (st.shown && attempted ? '<div style="margin-top:12px"><div class="ex-solution"><span class="fl">A stronger answer</span>' +
        '<div class="why" style="margin-top:6px"><p>' + esc(w.improved) + "</p></div></div>" +
        '<p class="scn-lesson">' + esc(w.lesson) + "</p></div>" : "") +
    "</div>";
  }

  function revisionBlock(lesson) {
    var r = lesson.revision;
    if (!r || !r.length) return "";
    var md = "| Concept | What to remember |\n|---|---|\n" + r.map(function (x) {
      return "| " + String(x[0]).replace(/\|/g, "/") + " | " + String(x[1]).replace(/\|/g, "/") + " |";
    }).join("\n");
    return '<div class="card prose rev" style="margin-bottom:18px"><h3>Revision sheet</h3>' +
      '<p class="tiny muted" style="margin-bottom:8px">Be able to explain each of these without looking at your notes.</p>' +
      paras(md) + "</div>";
  }

  /* ---------------- practical project ----------------
     The student writes the project here and the AI reviews it against what a hiring manager would accept.
     Nothing is ticked by the student. A score of PRJ.PASS or more accepts it; below that the review says what to fix. */
  var PRJ = window.CP_PROJECT;

  function projDraft(skillId) {
    if (!state.projDraft[skillId]) state.projDraft[skillId] = { text: null, busy: false, err: "", hints: [], hintBusy: false };
    return state.projDraft[skillId];
  }

  function projectReview(sub) {
    return '<div class="check-panel ' + (sub.accepted ? "ok" : "warn") + '" style="margin-top:12px">' +
      '<div class="row" style="justify-content:space-between;gap:10px">' +
        "<b>" + (sub.accepted ? "Accepted" : "Not accepted yet") + "</b>" +
        '<span class="mono tiny">Score ' + sub.score + " / 100 &middot; needs " + PRJ.PASS + "</span></div>" +
      '<p class="proj-sum">' + esc(sub.summary) + "</p>" +
      '<ul class="crits">' + (sub.criteria || []).map(function (c) {
        return '<li class="crit ' + (c.ok ? "met" : "unmet") + '"><span class="mark">' + (c.ok ? "&#10003;" : "&#8213;") +
          "</span><span><b>" + esc(c.label) + ".</b> " + esc(c.note) + "</span></li>";
      }).join("") + "</ul>" +
      ((sub.next || []).length
        ? '<p class="tiny check-note"><b>' + (sub.accepted ? "To make it stronger:" : "Fix first:") + "</b> " + (sub.next || []).map(esc).join(" ") + "</p>"
        : "") +
    "</div>";
  }

  function projectBlock(s) {
    if (!s.project) return "";
    var u = actor(), p = prog(u, s.id), d = projDraft(s.id), sub = p.projectSub;
    var text = d.text != null ? d.text : (sub && !p.project ? sub.text : "");
    var n = PRJ.words(text);
    var canAsk = tutor.ready && !tutor.denied;
    var head = '<div class="proj-head"><div class="eyebrow">Practical project</div>' +
      '<h3>' + esc(s.project.title) + "</h3>" +
      '<p class="muted proj-brief">' + esc(s.project.brief) + "</p></div>";

    if (p.project) {
      return '<div class="card proj" data-proj-card="' + esc(s.id) + '">' + head +
        '<div class="row" style="margin-top:12px"><span class="pill ok">Accepted' + (sub ? " &middot; score " + sub.score : "") + "</span>" +
        '<span class="tiny muted">Counts toward the fifth star.</span></div>' +
        (sub && sub.summary ? projectReview(sub) : "") +
        (sub && sub.text ? '<details class="proj-sent"><summary>Your submission</summary><pre class="proj-pre">' + esc(sub.text) + "</pre></details>" : "") +
      "</div>";
    }

    return '<div class="card proj" data-proj-card="' + esc(s.id) + '">' + head +
      '<div class="proj-std"><b>What reviewers look for</b><ul>' + PRJ.STANDARD.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>" +
      '<textarea class="ex-input proj-input" data-proj="' + esc(s.id) + '" rows="12" spellcheck="true" ' +
        'placeholder="Write your project here, in your own words. Aim for a clear, specific answer a reviewer could use in about two minutes."' +
        (state.preview ? " disabled" : "") + ">" + esc(text) + "</textarea>" +
      '<div class="row" style="margin-top:10px;justify-content:space-between">' +
        '<span class="tiny muted mono" data-proj-count>' + n + " words &middot; at least " + PRJ.MIN_WORDS + " to submit</span>" +
        '<div class="row" style="gap:8px">' +
          (canAsk ? '<button class="btn sm" data-action="project-hint" data-skill="' + esc(s.id) + '"' + (d.hintBusy || d.busy || state.preview ? " disabled" : "") + ">" +
            (d.hintBusy ? "Thinking..." : d.hints.length ? "Another hint" : "Get a hint") + "</button>" : "") +
          '<button class="btn sm primary" data-action="project-submit" data-skill="' + esc(s.id) + '"' + (d.busy || state.preview ? " disabled" : "") + ">" +
            (d.busy ? "Reviewing..." : sub ? "Submit again" : "Submit for review") + "</button>" +
        "</div></div>" +
      (state.preview ? '<p class="tiny muted" style="margin-top:8px">Preview only. Students write and submit here; nothing is recorded in preview.</p>' : "") +
      (!canAsk && !state.preview ? '<p class="tiny muted" style="margin-top:8px">The reviewer is not available on this deployment, so projects cannot be submitted right now.</p>' : "") +
      d.hints.map(function (h, j) { return '<div class="hint" style="margin-top:10px"><b>Hint ' + (j + 1) + "</b> " + esc(h) + "</div>"; }).join("") +
      (d.err ? '<div class="check-panel warn" style="margin-top:12px"><b>Not submitted.</b><p class="tiny" style="margin-top:4px">' + esc(d.err) + "</p></div>" : "") +
      (sub && sub.summary ? projectReview(sub) : "") +
    "</div>";
  }

  function deliverableBlock(s) { return projectBlock(s); }

  var SCN_RULES =
    "You are reviewing a student's written answer to a practice scenario in a course on CareerPath. The role is given with the scenario. " +
    "The score is only a coverage check and is already fixed. Your job is to explain the answer's quality so the student can improve it.\n\n" +
    "Write three or four sentences. Say what the answer did well, name the single most important thing missing or weakest, " +
    "and give one concrete suggestion. Plain language, no headings, no bullet lists, no em dashes. " +
    "Do not rewrite the answer for them and do not repeat the key points verbatim.\n\n";

  function quizBlock(s) {
    var q = state.quiz;
    if (!q || q.skillId !== s.id) {
      return '<div class="card"><h3 style="margin-bottom:4px">Module quiz</h3>' +
        '<p class="tiny muted" style="margin-bottom:12px">' + s.quiz.length + " questions. Checks the module before you attempt the graded assessment.</p>" +
        '<button class="btn" data-action="start-quiz" data-skill="' + s.id + '">Start module quiz</button></div>';
    }
    if (q.done) {
      var right = q.answers.filter(function (a, i) { return a === s.quiz[i].a; }).length;
      return '<div class="card"><h3 style="margin-bottom:10px">Module quiz &mdash; ' + right + " of " + s.quiz.length + " correct</h3>" +
        '<div class="stack" style="gap:14px">' +
          s.quiz.map(function (item, i) {
            return "<div><p style=\"font-weight:500;margin-bottom:8px\">" + (i + 1) + ". " + esc(item.q) + "</p>" +
              '<div class="opts">' + item.opts.map(function (o, j) {
                var st = j === item.a ? "correct" : (q.answers[i] === j ? "wrong" : "");
                return '<div class="opt" data-state="' + st + '"><span class="key">' + "ABCD"[j] + "</span><span>" + esc(o) + "</span></div>";
              }).join("") + '</div><div class="why"><b>Why:</b> ' + esc(item.why) + "</div></div>";
          }).join("") +
        '</div><button class="btn sm" style="margin-top:14px" data-action="start-quiz" data-skill="' + s.id + '">Retake quiz</button></div>';
    }
    var item = s.quiz[q.idx];
    return '<div class="card"><div class="progress-head"><span>Module quiz &middot; question ' + (q.idx + 1) + " of " + s.quiz.length + "</span></div>" +
      '<p class="q-stem">' + esc(item.q) + '</p><div class="opts">' +
      item.opts.map(function (o, j) {
        return '<button class="opt" data-action="quiz-answer" data-i="' + j + '"><span class="key">' + "ABCD"[j] + "</span><span>" + esc(o) + "</span></button>";
      }).join("") + "</div></div>";
  }

  function viewExam(user) {
    var s = skill(user.roleId, state.route.skill);
    var e = state.exam;
    var qs = e.qs || s.assessment;
    var item = qs[e.idx];

    return '<div class="page-head"><div class="eyebrow">Assessment &middot; ' + esc(s.name) + "</div>" +
        "<h1>Question " + (e.idx + 1) + " of " + qs.length + "</h1></div>" +
      '<div class="segs" role="progressbar" aria-valuemin="0" aria-valuemax="' + qs.length + '" aria-valuenow="' + e.idx + '">' +
        qs.map(function (q, j) { return '<i class="' + (j < e.idx ? "on" : "") + '"></i>'; }).join("") +
      "</div>" +
      '<div class="q-card"><div class="progress-head">' +
        '<span class="pill">Level ' + item.lvl + '</span><span class="tiny muted ver">' + esc(item.qid) + " v" + item.v + "</span></div>" +
        '<p class="q-stem">' + esc(item.q) + '</p><div class="opts">' +
        item.opts.map(function (o, j) {
          return '<button class="opt" data-action="exam-answer" data-i="' + j + '"><span class="key">' + "ABCD"[j] + "</span><span>" + esc(o) + "</span></button>";
        }).join("") + "</div></div>" +
      '<p class="tiny muted" style="margin-top:14px">Answers are final once selected. Each attempt records the question version it was scored against.</p>';
  }

  function r0(user) { return role(user.roleId); }

  /* Shown while the server scores an attempt, and when scoring could not finish. */
  function scoringView(res, s, kind) {
    var back = kind === "skill" ? '<button class="btn" data-action="open-skill" data-skill="' + res.skillId + '">Back to the skill</button>'
                                : '<button class="btn" data-action="open-track" data-track="' + res.trackId + '">Back to the module</button>';
    if (res.busy) {
      return '<div class="page-head"><div class="eyebrow">' + (kind === "skill" ? "Assessment" : "Module exam") + '</div><h1>Scoring your answers</h1>' +
        '<p class="sub">The result is calculated on the server. This takes a moment.</p></div><div class="card"><p class="muted">Please wait...</p></div>';
    }
    return '<div class="page-head"><div class="eyebrow">' + (kind === "skill" ? "Assessment" : "Module exam") + '</div><h1>Your answers were not scored yet</h1></div>' +
      '<div class="check-panel warn"><b>' + esc(res.err) + '</b><p class="tiny" style="margin-top:4px">Nothing was recorded. ' +
      (res.retry ? "Your answers are still here, so you can send them again." : "Start the exam again.") + "</p></div>" +
      '<div class="row" style="margin-top:16px">' + (res.retry ? '<button class="btn primary" data-action="exam-retry">Send my answers again</button>' : "") + back + "</div>";
  }

  function viewResult(user) {
    var res = state.result;
    var s = skill(user.roleId, res.skillId);
    var p = prog(user, res.skillId);
    if (res.busy || res.err) return scoringView(res, s, "skill");
    var qs = res.qs || s.assessment;
    var byLevel = {};
    qs.forEach(function (q, i) {
      var k = "L" + q.lvl;
      if (!byLevel[k]) byLevel[k] = { right: 0, total: 0 };
      byLevel[k].total++;
      if (resOk(res, i, q)) byLevel[k].right++;
    });
    var weak = qs.filter(function (q, i) { return !resOk(res, i, q); });

    return '<div class="page-head result-head"><div class="eyebrow">Result &middot; ' + esc(s.name) + "</div>" +
        '<h1 class="result-h1"><span class="big">' + res.pct + "%</span> <span class=\"rest\">" + res.award.label + "</span></h1>" +
        '<p class="sub">' + (state.preview
            ? "Preview only. No score, stars, or points were recorded for anyone."
            : (res.newStars ? "Your roadmap has been updated and " + res.pointsAwarded + " leaderboard points were added."
                            : "This did not beat your previous best of " + p.best + "%, so your roadmap is unchanged.")) + "</p></div>" +

      '<div class="card" style="margin-bottom:18px;text-align:center">' +
        '<div style="font-size:30px;line-height:1">' + starHTML(res.award.stars, "30px") + "</div>" +
        '<p style="margin-top:8px;font-weight:500">' + res.award.label + "</p>" +
        (res.award.capped ? '<p class="tiny" style="color:var(--warn);margin-top:6px">Scored at mastery level. The fifth star unlocks when your practical project is accepted.</p>' : "") +
      "</div>" +

      '<div class="summary-row">' +
        summaryCell("Score", res.right + "<small> / " + qs.length + "</small>") +
        summaryCell("Percent", res.pct + "<small>%</small>") +
        summaryCell("Stars", res.award.stars + "<small> / 5</small>") +
        summaryCell("Attempt", String(p.attempts)) +
      "</div>" +

      '<div class="stack"><div class="card">' +
          '<h3 style="margin-bottom:12px">Performance by difficulty</h3>' +
          '<div class="scroll-x"><table class="grid"><thead><tr><th>Level</th><th>Correct</th><th>Result</th></tr></thead><tbody>' +
            Object.keys(byLevel).sort().map(function (k) {
              var b = byLevel[k];
              return '<tr><td class="mono">' + k + '</td><td class="mono">' + b.right + " / " + b.total + "</td><td>" +
                (b.right === b.total ? '<span class="pill ok">Strong</span>' : b.right === 0 ? '<span class="pill bad">Weak</span>' : '<span class="pill warn">Partial</span>') +
                "</td></tr>";
            }).join("") + "</tbody></table></div></div>" +

        (weak.length ? '<div class="card"><h3 style="margin-bottom:4px">Review these ' + weak.length + "</h3>" +
          '<p class="tiny muted" style="margin-bottom:13px">Each one you missed, with the reasoning.</p>' +
          '<div class="stack" style="gap:16px">' +
            qs.map(function (q, i) {
              if (resOk(res, i, q)) return "";
              return '<div><p style="font-weight:500;margin-bottom:8px"><span class="pill" style="margin-right:6px">L' + q.lvl + "</span>" + esc(q.q) + "</p>" +
                '<div class="opts">' + q.opts.map(function (o, j) {
                  var st = j === resKey(res, i, q) ? "correct" : (res.answers[i] === j ? "wrong" : "");
                  return '<div class="opt" data-state="' + st + '"><span class="key">' + "ABCD"[j] + "</span><span>" + esc(o) + "</span></div>";
                }).join("") + '</div><div class="why"><b>Why:</b> ' + esc(resWhy(res, i, q)) + "</div>" +
                '<div class="row" style="margin-top:9px"><button class="tutor-inline" data-action="tutor-explain" data-i="' + i + '">Ask the assistant why</button></div>' +
                "</div>";
            }).join("") + "</div></div>"
          : '<div class="card"><h3>Every question correct.</h3><p class="tiny muted" style="margin-top:5px">Nothing to review on this attempt.</p></div>') +
      "</div>" +

      '<div class="row" style="margin-top:20px">' +
        (state.preview
          ? '<button class="btn primary" data-action="exit-preview">Exit preview</button>'
          : '<button class="btn primary" data-action="nav" data-nav="roadmap">Back to roadmap</button>') +
        '<button class="btn" data-action="start-exam" data-skill="' + s.id + '">Retake assessment</button>' +
        (!state.preview && !r0(user).tracks && prog(user, s.id).stars >= 3 ? '<button class="btn" data-action="open-cert" data-skill="' + s.id + '">View certificate</button>' : "") +
        (!state.preview && trackOfSkill(r0(user), s.id) && trackStatus(user, r0(user), trackOfSkill(r0(user), s.id)).eligible && !trackStatus(user, r0(user), trackOfSkill(r0(user), s.id)).certified
          ? '<button class="btn" data-action="open-track" data-track="' + trackOfSkill(r0(user), s.id).id + '">Module exam is ready</button>' : "") +
      "</div>";
  }

  function viewCerts(user) {
    var list = certsFor(user);
    var r = role(user.roleId);
    return '<div class="page-head"><div class="eyebrow">Certificates</div><h1>Verified proficiency</h1>' +
        '<p class="sub">' + (r.tracks
          ? "A certificate is issued for a main module when every required sub-module is job-ready (three stars) and you pass the module exam. Stars stay with each sub-module."
          : "A certificate is issued at three stars or above, which is the job-ready threshold. Each one names the role track, because the same skill is assessed differently in each.") + '</p></div>' +
      (list.length === 0
        ? '<div class="card"><p class="muted">' + (r.tracks
            ? "No certificates yet. Finish a main module&rsquo;s sub-modules, then pass its module exam."
            : "No certificates yet. Reach " + STAR + STAR + STAR + " on any skill in the " + esc(r.name) + " roadmap to issue one.") + "</p>" +
          '<button class="btn sm primary" style="margin-top:12px" data-action="nav" data-nav="roadmap">Open roadmap</button></div>'
        : '<div class="skill-list">' + list.map(function (c) {
            return '<button class="skill-row" data-action="open-cert" data-skill="' + c.skill.id + '">' +
              '<span><span class="skill-name">' + esc(c.skill.name) + '</span><span class="skill-lens" style="display:block">' +
                (c.track ? "Module exam " + c.p.best + "%" : LEVELS[c.p.stars].label) + " &middot; " + verifyId(user, c.skill.id) + "</span></span>" +
              '<span class="skill-right">' + starHTML(c.p.stars) + '<span class="pill accent">View</span></span></button>';
          }).join("") + "</div>");
  }

  function viewCert(user) {
    var r = role(user.roleId);
    var t = trackById(r, state.route.skill);
    if (t) return viewTrackCert(user, r, t);
    var s = skill(user.roleId, state.route.skill);
    var p = prog(user, s.id);
    return '<div class="page-head"><button class="btn sm ghost" style="margin-bottom:10px" data-action="nav" data-nav="certs">&larr; Certificates</button><h1>Certificate</h1></div>' +
      '<div class="cert"><div class="cert-seal">' + CAP.replace('width="18" height="18"', 'width="30" height="30"') + '</div><div class="cert-org">CareerPath &middot; Verified Skill Certificate</div>' +
        '<div class="cert-name">' + esc(user.name) + '</div><div class="cert-skill">' + esc(s.name) + "</div>" +
        '<div class="cert-level"><div style="font-size:24px">' + starHTML(p.stars, "24px") + "</div>" +
          '<div style="font-weight:500;margin-top:5px">' + LEVELS[p.stars].label + "</div></div>" +
        '<p class="tiny muted" style="max-width:62ch;margin:0 auto">Demonstrated through assessment on the ' + esc(r.name) +
          " track. Progress on this platform is earned only through scored assessment.</p>" +
        '<div class="cert-meta"><span>ID ' + verifyId(user, s.id) + "</span><span>Score " + p.best + "%</span>" +
          "<span>" + esc(user.school) + "</span><span>Issued " + today() + "</span></div></div>" +
      '<p class="tiny muted" style="margin-top:14px">In the working product this is a downloadable PDF and the ID resolves to a public verification page.</p>';
  }

  function viewTrackCert(user, r, t) {
    var m = mex(user, t.id), st = trackStatus(user, r, t);
    if (!m.passed) return viewTrack(user);
    var subs = st.req.concat(st.withBadge ? st.opt : []);
    return '<div class="page-head"><button class="btn sm ghost" style="margin-bottom:10px" data-action="nav" data-nav="certs">&larr; Certificates</button><h1>Certificate</h1></div>' +
      '<div class="cert"><div class="cert-seal">' + CAP.replace('width="18" height="18"', 'width="30" height="30"') + '</div><div class="cert-org">CareerPath &middot; Verified Module Certificate</div>' +
        '<div class="cert-name">' + esc(user.name) + '</div><div class="cert-skill">' + esc(certTitle(user, r, t)) + "</div>" +
        '<div class="cert-level"><div style="font-weight:500;margin-top:5px">Module exam passed with ' + m.best + "%</div></div>" +
        '<p class="tiny muted" style="max-width:62ch;margin:0 auto">Demonstrated on the ' + esc(r.name) + " track: " + subs.length +
          " sub-modules taken to job-ready level (" + subs.map(function (x) { return esc(x.name); }).join(", ") + "), then a module exam drawn from their assessments.</p>" +
        '<div class="cert-meta"><span>ID ' + verifyId(user, t.id) + "</span><span>Best score " + m.best + "%</span>" +
          "<span>" + esc(user.school) + "</span><span>Issued " + (m.passedOn || today()) + "</span></div></div>" +
      '<p class="tiny muted" style="margin-top:14px">In the working product this is a downloadable PDF and the ID resolves to a public verification page.</p>';
  }

  function viewLeaderboard(user) {
    var r = role(user.roleId);
    return '<div class="page-head"><div class="eyebrow">' + esc(user.school) + " &middot; " + esc(r.name) + "</div>" +
        '<h1>School leaderboard ' + livePill() + '</h1>' +
        '<p class="sub">You compete only with students at your own school who chose the same target role. Points come from reaching new verified levels and completing practical projects, so repeating an assessment you have already passed adds nothing.</p></div>' +
      '<div class="summary-row" data-live="summary">' + summaryHTML(user) + "</div>" +
      '<div class="card" style="padding:14px 16px">' +
        '<div class="row" style="justify-content:space-between;margin-bottom:10px">' +
          '<span class="tiny muted">Updates as results come in. No reload needed.</span>' +
          '<div class="feed feed-inline" data-live="feed">' + feedHTML() + "</div>" +
        "</div>" +
        '<div class="scroll-x" data-live="board" data-compact="0">' + boardHTML(user, false) + "</div></div>" +
      '<p class="tiny muted" style="margin-top:14px">Other roles at ' + esc(user.school) + " have separate boards. Star column shows the average level across the roadmap, with total stars beside it.</p>" +
      liveNote();
  }

  function viewHistory(user) {
    var r = role(user.roleId);
    var rows = [];
    r.skills.forEach(function (s) {
      var hist = prog(user, s.id).history;
      var best = hist.reduce(function (a, h) { return Math.max(a, h.pct); }, -1);
      var bestSeen = false;
      hist.forEach(function (h, i) {
        var isBest = !bestSeen && h.pct === best;
        if (isBest) bestSeen = true;
        rows.push({ s: s, h: h, n: i + 1, of: hist.length, isBest: isBest });
      });
    });
    rows.reverse();
    return '<div class="page-head"><div class="eyebrow">Activity</div><h1>Assessment history</h1>' +
      '<p class="sub">One row per scored attempt on the ' + esc(r.name) +
        " track. A skill that appears more than once is the same assessment retaken, not a different track, and only the best attempt sets your stars.</p></div>" +
      (rows.length === 0 ? '<div class="card"><p class="muted">No attempts yet.</p></div>'
        : '<div class="card" style="padding:14px 16px"><div class="scroll-x"><table class="grid">' +
          "<thead><tr><th>When</th><th>Skill</th><th>Attempt</th><th>Score</th><th>Level awarded</th></tr></thead><tbody>" +
          rows.map(function (row) {
            return '<tr><td class="mono tiny">' + esc(row.h.when) + "</td><td>" + esc(row.s.name) + "</td>" +
              '<td class="mono tiny">' + row.n + " of " + row.of +
                (row.isBest && row.of > 1 ? ' <span class="pill ok">Counts</span>' : "") + "</td>" +
              '<td class="mono">' + row.h.pct + "%</td><td>" + starHTML(row.h.stars) +
              ' <span class="tiny muted">' + LEVELS[row.h.stars].label + "</span></td></tr>";
          }).join("") + "</tbody></table></div></div>");
  }

  function viewProfile(user) {
    if (user.role === "admin") {
      return '<div class="page-head"><div class="eyebrow">Account</div><h1>' + esc(user.name) + "</h1>" +
        '<p class="sub">' + esc(user.title) + " &middot; CareerPath platform team</p></div>" +
        '<div class="summary-row">' +
          summaryCell("Access", '<span style="font-size:15px;font-family:var(--sans)">Content admin</span>') +
          summaryCell("Skills managed", String(allSkills().length)) +
          summaryCell("Drafts pending", String(allDrafts().length)) +
          summaryCell("Students", String(state.users.filter(function (u) { return u.role === "student"; }).length)) +
        "</div>" +
        '<div class="card"><h3 style="margin-bottom:8px">What this account can do</h3>' +
        '<p class="tiny muted">Edit lessons and publish them directly. Propose question changes as drafts, which require a publish step and retain the previous version. Preview any content exactly as a student sees it. This account has no roadmap, takes no assessments, and does not appear on any leaderboard.</p></div>';
    }
    var r = role(user.roleId);
    var proven = r ? r.skills.filter(function (sk) { return prog(user, sk.id).stars > 0; }) : [];
    return '<div class="page-head profile-head"><span class="avatar lg" aria-hidden="true">' + esc(initials(user.name)) + "</span>" +
      '<div><div class="eyebrow">Account</div><h1>' + esc(user.name) + "</h1>" +
      '<p class="sub">' + esc(user.major) + " &middot; " + esc(user.school) + " &middot; Class of " + esc(user.gradYear) + "</p></div></div>" +
      '<div class="summary-row">' +
        summaryCell("Target role", '<span style="font-size:15px;font-family:var(--sans)">' + esc(r ? r.name : "None") + "</span>") +
        summaryCell("Stars", totalStars(user) + "<small> / " + maxStars(user) + "</small>") +
        summaryCell("Certificates", String(certsFor(user).length)) +
        summaryCell("Points", String(user.points)) +
      "</div>" +
      (proven.length
        ? '<div class="card" style="margin-bottom:14px"><span class="fl">Skills proven</span><div class="row" style="gap:8px;margin-top:6px">' +
          proven.map(function (sk) { return '<span class="chip-ok">&#10003; ' + esc(sk.name) + "</span>"; }).join("") + "</div></div>"
        : "") +
      '<div class="card"><h3 style="margin-bottom:8px">Target role</h3>' +
        '<p class="tiny muted" style="margin-bottom:12px">Changing role gives you a different roadmap. Stars stay attached to the role they were earned in, because the assessments differ.</p>' +
        '<button class="btn" data-action="nav" data-nav="roles">Change target role</button></div>' +
      onboardingCard(user) +
      historyOfRoadmaps(user) +
      (REAL ? accountCard(user) + deleteCard() : "");
  }

  function optionList(list, current) {
    var all = list.indexOf(current) < 0 && current ? [current].concat(list) : list;
    return all.map(function (x) { return "<option" + (x === current ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("");
  }

  /* Real accounts only: edit the details the leaderboards depend on, and choose whether to appear on them. */
  function accountCard(user) {
    return '<div class="card" style="margin-top:14px"><h3 style="margin-bottom:8px">Your details</h3>' +
      '<div class="stack acct-stack" style="gap:12px">' +
        '<div class="field"><label for="pf-name">Full name</label><input id="pf-name" maxlength="80" value="' + esc(user.name) + '"></div>' +
        '<div class="field"><label>Email</label><input value="' + esc(user.email) + '" disabled></div>' +
        '<div class="auth-grid">' +
          '<div class="field"><label for="pf-school">School</label><select id="pf-school">' + optionList(SCHOOLS, user.school) + "</select></div>" +
          '<div class="field"><label for="pf-year">Graduation</label><select id="pf-year">' + optionList(["2026", "2027", "2028", "2029"], String(user.gradYear)) + "</select></div>" +
        "</div>" +
        '<div class="field"><label for="pf-major">Major</label><select id="pf-major">' + optionList(MAJORS, user.major) + "</select></div>" +
        '<label class="check-row"><input type="checkbox" id="pf-board"' + (user.showOnBoard !== false ? " checked" : "") + ">" +
          '<span class="check-text"><span class="check-title">Show me on the leaderboards</span>' +
          '<span class="check-help">Other students see only your first name and last initial. You still see your own place.</span></span></label>' +
        '<div class="row" style="gap:10px;align-items:center"><button class="btn primary" data-action="profile-save">Save details</button>' +
          (state.acctMsg ? '<span class="tiny" role="status">' + esc(state.acctMsg) + "</span>" : "") + "</div>" +
      "</div></div>";
  }

  function deleteCard() {
    var ask = state.delAsk;
    return '<div class="card" style="margin-top:14px"><h3 style="margin-bottom:8px">Delete my account</h3>' +
      '<p class="tiny muted" style="margin-bottom:12px">This removes your sign-in, profile, progress, stars, points and exam results from CareerPath. It cannot be undone.</p>' +
      (ask
        ? '<p class="err" style="margin-bottom:10px" role="alert">Are you sure? Everything saved for this account will be deleted.</p>' +
          '<div class="row" style="gap:10px"><button class="btn" style="border-color:var(--bad);color:var(--bad)"' + (state.delBusy ? " disabled" : "") + ' data-action="delete-confirm">Yes, delete everything</button>' +
          '<button class="btn ghost" data-action="delete-cancel">Keep my account</button></div>' +
          (state.delErr ? '<p class="err" style="margin-top:8px">' + esc(state.delErr) + "</p>" : "")
        : '<button class="btn" data-action="delete-ask">Delete my account</button>') +
      "</div>";
  }

  function onboardingCard(user) {
    if (!user.resume && !user.placement) {
      return '<div class="card" style="margin-top:14px"><h3 style="margin-bottom:8px">Resume and placement</h3>' +
        '<p class="tiny muted" style="margin-bottom:12px">You have not uploaded a resume. Upload one, then either pick your target role or answer ' +
        "five short questions and get a match score for each roadmap.</p>" +
        '<button class="btn" data-action="onb-open">Upload a resume</button></div>';
    }
    var rr = user.resume, pl = user.placement;
    return '<div class="card" style="margin-top:14px">' +
      '<div class="row" style="justify-content:space-between;margin-bottom:10px">' +
        '<h3>Resume and placement</h3>' +
        '<button class="btn sm ghost" data-action="onb-open">Redo</button></div>' +
      (rr
        ? '<p class="tiny muted" style="margin-bottom:10px"><b style="color:var(--ink)">' + esc(rr.name) + "</b> read on " +
          esc(rr.when || today()) + ". " + rr.skills.length + " of " + Object.keys(window.CP_SKILL_TERMS || {}).length + " skills were mentioned. The file was read in your " +
          "browser and never stored.</p>" +
          '<div class="row" style="gap:5px;margin-bottom:12px">' + rr.skills.map(function (sid) {
            var found = null;
            allSkills().forEach(function (x) { if (x.skill.id === sid) found = x.skill; });
            return found ? '<span class="pill">' + esc(found.name) + "</span>" : "";
          }).join("") + "</div>"
        : "") +
      (pl
        ? '<p class="tiny muted"><b style="color:var(--ink)">' + (pl.answered || pl.total) + " placement answers</b> " +
          "recorded on " + esc(pl.when || today()) + ". They fed the roadmap ranking and nothing else. No star, " +
          "certificate or leaderboard point came from them.</p>"
        : '<p class="tiny muted">No placement questions answered.</p>');
  }

  /* ---------------- admin views ---------------- */

  function viewAdminContent() {
    var qTotal = allSkills().reduce(function (a, x) { return a + x.skill.assessment.length; }, 0);
    var lTotal = allSkills().reduce(function (a, x) { return a + x.skill.lessons.length; }, 0);

    return '<div class="page-head"><div class="eyebrow">Content</div><h1>Roadmaps and course material</h1>' +
      '<p class="sub">Lessons publish directly. Assessment questions go through a draft and publish step, because scores and certificates are tied to the version that was live when the student took the exam.</p></div>' +
      '<div class="summary-row">' +
        summaryCell("Roles", String(ROLES.length)) +
        summaryCell("Skills", String(allSkills().length)) +
        summaryCell("Lessons", String(lTotal)) +
        summaryCell("Live questions", String(qTotal)) +
      "</div>" +
      '<div class="card" style="padding:14px 16px"><div class="scroll-x"><table class="grid">' +
        "<thead><tr><th>Role</th><th>Skill</th><th>Lessons</th><th>Questions</th><th>Drafts</th><th></th></tr></thead><tbody>" +
        allSkills().map(function (x) {
          var d = x.skill.drafts.length;
          return "<tr><td>" + esc(x.role.name) + "</td><td>" + esc(x.skill.name) + "</td>" +
            '<td class="mono">' + x.skill.lessons.length + '</td><td class="mono">' + x.skill.assessment.length + "</td>" +
            "<td>" + (d ? '<span class="pill warn">' + d + "</span>" : '<span class="mono muted">0</span>') + "</td>" +
            '<td><div class="row" style="gap:6px;flex-wrap:nowrap">' +
              '<button class="btn sm" data-action="a-open" data-role="' + x.role.id + '" data-skill="' + x.skill.id + '">Questions</button>' +
              '<button class="btn sm" data-action="a-lessons" data-role="' + x.role.id + '" data-skill="' + x.skill.id + '">Lessons</button>' +
            "</div></td></tr>";
        }).join("") + "</tbody></table></div></div>";
  }

  function viewAdminBank() {
    var ctx = state.adminSkill;
    var s = skill(ctx.roleId, ctx.skillId);
    var r = role(ctx.roleId);

    return '<div class="page-head">' +
        '<button class="btn sm ghost" style="margin-bottom:10px" data-action="nav" data-nav="a-content">&larr; Content</button>' +
        '<div class="eyebrow">' + esc(r.name) + " &middot; question bank</div><h1>" + esc(s.name) + "</h1>" +
        '<p class="sub">' + s.assessment.length + " live questions, " + s.drafts.length + " draft" +
          (s.drafts.length === 1 ? "" : "s") + " awaiting publish, " + s.archive.length + " archived version" +
          (s.archive.length === 1 ? "" : "s") + ".</p></div>" +

      '<div class="row" style="margin-bottom:16px">' +
        '<button class="btn primary sm" data-action="a-new">Add question</button>' +
        '<button class="btn sm" data-action="preview" data-mode="assess">Preview assessment as student</button>' +
        '<button class="btn sm" data-action="preview" data-mode="learn">Preview course as student</button>' +
      "</div>" +

      (state.adminEdit === "new" ? editorCard(null, s) : "") +

      '<div class="stack" style="gap:10px">' +
        s.assessment.map(function (q) {
          if (state.adminEdit === q.qid) return editorCard(q, s);
          var d = draftFor(s, q.qid);
          var arch = archiveFor(s, q.qid);
          return '<div style="border:1px solid ' + (d ? "var(--warn)" : "var(--line)") + ';border-radius:9px;padding:13px">' +
            '<div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px">' +
              '<p style="font-weight:500"><span class="pill" style="margin-right:6px">L' + q.lvl + "</span>" + esc(q.q) + "</p>" +
              '<div class="row" style="gap:6px;flex-wrap:nowrap">' +
                (d ? '<button class="btn sm primary" data-action="a-review-one" data-qid="' + q.qid + '">Review draft</button>'
                   : '<button class="btn sm" data-action="a-edit" data-qid="' + q.qid + '">Edit</button>') +
                '<button class="btn sm" data-action="a-history" data-qid="' + q.qid + '">History</button>' +
                '<button class="btn sm" data-action="a-retire" data-qid="' + q.qid + '">Retire</button>' +
              "</div></div>" +
            '<div class="row" style="gap:14px;margin-top:8px">' +
              '<span class="tiny muted">Correct: <b style="color:var(--ok)">' + esc(q.opts[q.a]) + "</b></span>" +
              '<span class="ver">' + esc(q.qid) + " &middot; v" + q.v + "</span>" +
              (d ? '<span class="pill warn">Draft pending</span>' : "") +
              (arch.length ? '<span class="tiny muted">' + arch.length + " earlier version" + (arch.length === 1 ? "" : "s") + "</span>" : "") +
            "</div>" +
            (state.adminHistory === q.qid ? historyBlock(arch) : "") +
          "</div>";
        }).join("") +
      "</div>";
  }

  function historyBlock(arch) {
    if (!arch.length) return '<p class="tiny muted" style="margin-top:10px">No earlier versions. This question has never been changed.</p>';
    return '<div class="stack" style="gap:8px;margin-top:12px">' +
      arch.slice().reverse().map(function (a) {
        return '<div style="border:1px solid var(--line);border-radius:8px;padding:10px;background:var(--surface-2)">' +
          '<div class="row" style="justify-content:space-between"><span class="ver">v' + a.v + " &middot; retired " + esc(a.retired) + "</span>" +
            (a.retiredOut ? '<span class="pill bad">Removed from bank</span>' : '<span class="pill">Superseded</span>') + "</div>" +
          '<p class="tiny" style="margin-top:6px">' + esc(a.fields.q) + "</p>" +
          '<p class="tiny muted" style="margin-top:4px">Correct: ' + esc(a.fields.opts[a.fields.a]) + "</p></div>";
      }).join("") + "</div>";
  }

  function editorCard(q, s) {
    var f = q ? { q: q.q, opts: q.opts, a: q.a, lvl: q.lvl, why: q.why }
              : { q: "", opts: ["", "", "", ""], a: 0, lvl: 1, why: "" };
    return '<div style="border:1px solid var(--accent);border-radius:9px;padding:15px;margin-bottom:12px">' +
      '<h3 style="margin-bottom:4px">' + (q ? "Edit question " + esc(q.qid) + " (currently v" + q.v + ")" : "New question") + "</h3>" +
      '<p class="tiny muted" style="margin-bottom:13px">' + (q
        ? "Saving creates a draft. The live question stays at v" + q.v + " until the draft is published."
        : "Saving creates a draft. The question goes live once the draft is published.") + "</p>" +
      '<div class="stack" style="gap:10px">' +
        '<div class="field"><label for="ae-q">Question</label><input id="ae-q" value="' + esc(f.q) + '"></div>' +
        [0, 1, 2, 3].map(function (j) {
          return '<div class="field"><label for="ae-o' + j + '">Option ' + "ABCD"[j] + '</label><input id="ae-o' + j + '" value="' + esc(f.opts[j] || "") + '"></div>';
        }).join("") +
        '<div class="auth-grid">' +
          '<div class="field"><label for="ae-a">Correct answer</label><select id="ae-a">' +
            [0, 1, 2, 3].map(function (j) { return '<option value="' + j + '"' + (j === f.a ? " selected" : "") + ">" + "ABCD"[j] + "</option>"; }).join("") + "</select></div>" +
          '<div class="field"><label for="ae-l">Difficulty level</label><select id="ae-l">' +
            [1, 2, 3, 4, 5].map(function (l) { return '<option value="' + l + '"' + (l === f.lvl ? " selected" : "") + ">L" + l + "</option>"; }).join("") + "</select></div>" +
        "</div>" +
        '<div class="field"><label for="ae-w">Explanation shown after the assessment</label><input id="ae-w" value="' + esc(f.why) + '"></div>' +
        '<div class="row"><button class="btn primary sm" data-action="a-save" data-qid="' + (q ? q.qid : "new") + '">Save as draft</button>' +
          '<button class="btn sm" data-action="a-cancel">Cancel</button></div>' +
      "</div></div>";
  }

  function viewAdminLessons() {
    var ctx = state.adminSkill;
    var s = skill(ctx.roleId, ctx.skillId);
    var r = role(ctx.roleId);
    var ed = state.adminLesson;

    return '<div class="page-head">' +
        '<button class="btn sm ghost" style="margin-bottom:10px" data-action="nav" data-nav="a-content">&larr; Content</button>' +
        '<div class="eyebrow">' + esc(r.name) + " &middot; course material</div><h1>" + esc(s.name) + "</h1>" +
        '<p class="sub">Lesson edits publish immediately. They carry no scoring risk, so they do not need a review step.</p></div>' +
      '<div class="row" style="margin-bottom:16px">' +
        '<button class="btn sm" data-action="preview" data-mode="learn">Preview course as student</button></div>' +
      '<div class="stack" style="gap:10px">' +
        s.lessons.map(function (l, i) {
          if (ed === i) {
            return '<div style="border:1px solid var(--accent);border-radius:9px;padding:15px">' +
              '<div class="stack" style="gap:10px">' +
                '<div class="field"><label for="al-t">Module title</label><input id="al-t" value="' + esc(l.title) + '"></div>' +
                '<div class="field"><label for="al-b">Body</label>' +
                  '<textarea id="al-b" rows="14" style="background:var(--surface);border:1px solid var(--line-strong);border-radius:8px;padding:10px;font-size:13.5px;line-height:1.6;width:100%">' + esc(l.body) + "</textarea></div>" +
                '<div class="row"><button class="btn primary sm" data-action="al-save" data-i="' + i + '">Publish changes</button>' +
                  '<button class="btn sm" data-action="al-cancel">Cancel</button></div>' +
              "</div></div>";
          }
          return '<div style="border:1px solid var(--line);border-radius:9px;padding:13px">' +
            '<div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px">' +
              '<p style="font-weight:500"><span class="pill" style="margin-right:6px">' + (i + 1) + "</span>" + esc(l.title) + "</p>" +
              '<button class="btn sm" data-action="al-edit" data-i="' + i + '">Edit</button></div>' +
            '<p class="tiny muted" style="margin-top:8px">' + esc(l.body.slice(0, 160)) + "&hellip;</p></div>";
        }).join("") +
      "</div>";
  }

  function viewAdminDrafts() {
    var drafts = allDrafts();
    return '<div class="page-head"><div class="eyebrow">Review queue</div><h1>Question drafts awaiting publish</h1>' +
      '<p class="sub">Nothing here is live yet. Publishing swaps the draft in and archives the version it replaces, so a score recorded against the old version stays explainable.</p></div>' +
      (drafts.length === 0
        ? '<div class="card"><p class="muted">The queue is empty. Edit a question in Content to create a draft.</p>' +
          '<button class="btn sm primary" style="margin-top:12px" data-action="nav" data-nav="a-content">Open content</button></div>'
        : '<div class="stack">' + drafts.map(function (d) {
            return draftCard(d.role, d.skill, d.draft);
          }).join("") + "</div>");
  }

  function draftCard(r, s, d) {
    var q = d.isNew ? null : findQ(s, d.qid);
    var cur = q ? { q: q.q, opts: q.opts, a: q.a, lvl: q.lvl, why: q.why } : null;
    var nx = d.fields;
    function fld(label, curV, nxV) {
      var changed = String(curV) !== String(nxV);
      return { label: label, cur: curV, next: nxV, changed: changed };
    }
    var fields = cur ? [
      fld("Question", cur.q, nx.q),
      fld("Option A", cur.opts[0], nx.opts[0]),
      fld("Option B", cur.opts[1], nx.opts[1]),
      fld("Option C", cur.opts[2], nx.opts[2]),
      fld("Option D", cur.opts[3], nx.opts[3]),
      fld("Correct", "ABCD"[cur.a], "ABCD"[nx.a]),
      fld("Level", "L" + cur.lvl, "L" + nx.lvl),
      fld("Explanation", cur.why, nx.why)
    ] : null;

    return '<div class="card">' +
      '<div class="row" style="justify-content:space-between;margin-bottom:12px;gap:12px">' +
        "<div><h3>" + esc(s.name) + "</h3>" +
          '<p class="ver" style="margin-top:3px">' + esc(r.name) + " &middot; " + esc(d.qid) +
            (q ? " &middot; live v" + q.v + " &rarr; v" + (q.v + 1) : " &middot; new question") + " &middot; drafted " + esc(d.created) + "</p></div>" +
        '<div class="row" style="gap:6px;flex-wrap:nowrap">' +
          '<button class="btn sm primary" data-action="a-publish" data-role="' + r.id + '" data-skill="' + s.id + '" data-qid="' + d.qid + '">Publish</button>' +
          '<button class="btn sm" data-action="a-discard" data-role="' + r.id + '" data-skill="' + s.id + '" data-qid="' + d.qid + '">Discard</button>' +
        "</div></div>" +

      (fields
        ? '<div class="diff-grid">' +
            '<div class="diff-col"><h4>Currently live &middot; v' + q.v + "</h4>" +
              fields.map(function (f) {
                return '<div class="diff-field ' + (f.changed ? "changed" : "") + '"><span class="fl">' + f.label + '</span><span class="fv">' + esc(f.cur) + "</span></div>";
              }).join("") + "</div>" +
            '<div class="diff-col next"><h4>Proposed &middot; v' + (q.v + 1) + "</h4>" +
              fields.map(function (f) {
                return '<div class="diff-field ' + (f.changed ? "changed" : "") + '"><span class="fl">' + f.label + '</span><span class="fv">' + esc(f.next) + "</span></div>";
              }).join("") + "</div>" +
          "</div>"
        : '<div class="diff-col next"><h4>New question</h4>' +
            '<div class="diff-field"><span class="fl">Question</span><span class="fv">' + esc(nx.q) + "</span></div>" +
            [0, 1, 2, 3].map(function (j) {
              return '<div class="diff-field"><span class="fl">Option ' + "ABCD"[j] + '</span><span class="fv">' + esc(nx.opts[j]) + "</span></div>";
            }).join("") +
            '<div class="diff-field"><span class="fl">Correct</span><span class="fv">' + "ABCD"[nx.a] + "</span></div>" +
            '<div class="diff-field"><span class="fl">Level</span><span class="fv">L' + nx.lvl + "</span></div>" +
            '<div class="diff-field"><span class="fl">Explanation</span><span class="fv">' + esc(nx.why) + "</span></div>" +
          "</div>") +
    "</div>";
  }

  function viewAdminStudents(user) {
    var all = state.users.filter(function (u) { return u.role === "student"; });
    var f = state.studentFilter;
    var schools = all.reduce(function (a, u) { return a.indexOf(u.school) > -1 ? a : a.concat([u.school]); }, []).sort();
    var q = f.q.toLowerCase();

    var students = all.filter(function (u) {
      if (f.role !== "all" && u.roleId !== f.role) return false;
      if (f.school !== "all" && u.school !== f.school) return false;
      if (q && u.name.toLowerCase().indexOf(q) === -1 && u.email.toLowerCase().indexOf(q) === -1) return false;
      return true;
    }).sort(function (a, b) { return b.points - a.points; });

    var filtered = f.role !== "all" || f.school !== "all" || !!q;
    var attempts = students.reduce(function (a, u) {
      return a + Object.keys(u.progress).reduce(function (b, k) { return b + u.progress[k].history.length; }, 0);
    }, 0);

    return '<div class="page-head"><div class="eyebrow">Students</div><h1>Registered learners</h1>' +
      '<p class="sub">Read-only. Admins can see progress but cannot alter a student&rsquo;s stars, since verified progress must come from assessment alone.</p></div>' +

      '<div class="filter-bar">' +
        '<div class="field"><label for="sf-role">Target role</label><select id="sf-role" data-filter="role">' +
          '<option value="all"' + (f.role === "all" ? " selected" : "") + ">All roles</option>" +
          ROLES.map(function (r) {
            return '<option value="' + r.id + '"' + (f.role === r.id ? " selected" : "") + ">" + esc(r.name) + "</option>";
          }).join("") + "</select></div>" +
        '<div class="field"><label for="sf-school">School</label><select id="sf-school" data-filter="school">' +
          '<option value="all"' + (f.school === "all" ? " selected" : "") + ">All schools</option>" +
          schools.map(function (s) {
            return '<option value="' + esc(s) + '"' + (f.school === s ? " selected" : "") + ">" + esc(s) + "</option>";
          }).join("") + "</select></div>" +
        '<div class="field"><label for="sf-q">Search name or email</label>' +
          '<input id="sf-q" data-filter="q" value="' + esc(f.q) + '" placeholder="Start typing"></div>' +
        '<button class="btn sm" data-action="sf-clear"' + (filtered ? "" : " disabled") + ">Clear</button>" +
      "</div>" +

      '<div class="summary-row">' +
        summaryCell("Showing", students.length + (filtered ? "<small> of " + all.length + "</small>" : "")) +
        summaryCell("Schools", String(students.reduce(function (a, u) { return a.indexOf(u.school) > -1 ? a : a.concat([u.school]); }, []).length)) +
        summaryCell("Certificates issued", String(students.reduce(function (a, u) { return a + certsFor(u).length; }, 0))) +
        summaryCell("Assessments taken", String(attempts)) +
      "</div>" +

      (students.length === 0
        ? '<div class="card"><p class="muted">No students match these filters.</p>' +
          '<button class="btn sm" style="margin-top:12px" data-action="sf-clear">Clear filters</button></div>'
        : '<div class="card" style="padding:14px 16px"><div class="scroll-x"><table class="grid">' +
          "<thead><tr><th>Name</th><th>School</th><th>Target role</th><th>Stars</th><th>Points</th><th>Certs</th></tr></thead><tbody>" +
          students.map(function (u) {
            return '<tr><td><button class="linkbtn" data-action="a-student" data-id="' + u.id + '">' + esc(u.name) + "</button></td>" +
              "<td>" + esc(u.school) + "</td>" +
              "<td>" + esc(role(u.roleId) ? role(u.roleId).name : "&mdash;") + "</td>" +
              '<td class="mono">' + totalStars(u) + '</td><td class="mono">' + u.points + '</td><td class="mono">' + certsFor(u).length + "</td></tr>";
          }).join("") + "</tbody></table></div></div>") +

      '<p class="tiny muted" style="margin-top:14px">Select a name to open that student&rsquo;s profile. Filtering by role and school together is how you read a single leaderboard cohort, since students only compete within their own school and target role.</p>';
  }

  function viewAdminStudent() {
    var u = state.users.filter(function (x) { return x.id === state.adminStudent; })[0];
    if (!u) return viewAdminStudents();
    var r = role(u.roleId);

    var rows = r ? r.skills.map(function (s) {
      var p = prog(u, s.id);
      var status = p.stars > 0 ? "verified" : (p.lessonsDone.length ? "studying" : "none");
      return { s: s, p: p, status: status };
    }) : [];

    var studying = rows.filter(function (x) { return x.status === "studying"; });
    var hist = [];
    rows.forEach(function (x) {
      x.p.history.forEach(function (h, i) { hist.push({ s: x.s, h: h, n: i + 1, of: x.p.history.length }); });
    });
    hist.reverse();
    var lessonsRead = rows.reduce(function (a, x) { return a + x.p.lessonsDone.length; }, 0);
    var lessonsTotal = rows.reduce(function (a, x) { return a + x.s.lessons.length; }, 0);

    return '<div class="page-head">' +
        '<button class="btn sm ghost" style="margin-bottom:10px" data-action="nav" data-nav="a-students">&larr; Students</button>' +
        '<div class="eyebrow">Student profile</div><h1>' + esc(u.name) + "</h1>" +
        '<p class="sub">' + esc(u.email) + " &middot; " + esc(u.school) +
          (u.major ? " &middot; " + esc(u.major) : "") +
          (u.gradYear ? " &middot; Class of " + esc(u.gradYear) : "") +
          " &middot; Target role: " + esc(r ? r.name : "not chosen yet") + "</p></div>" +

      '<div class="summary-row">' +
        summaryCell("Job-ready skills", jobReadyCount(u) + (r ? "<small> / " + r.skills.length + "</small>" : "")) +
        summaryCell("Stars", totalStars(u) + (r ? "<small> / " + maxStars(u) + "</small>" : "")) +
        summaryCell("Points", String(u.points)) +
        summaryCell("Certificates", String(certsFor(u).length)) +
      "</div>" +

      (!r ? '<div class="card"><p class="muted">This student has not chosen a target role yet, so there is no roadmap to report on.</p></div>' :
      '<div class="stack">' +

        '<div class="card">' +
          '<div class="row" style="justify-content:space-between;margin-bottom:12px;gap:10px">' +
            '<h3>Roadmap progress</h3>' +
            '<span class="pill">' + lessonsRead + " / " + lessonsTotal + " modules read</span></div>" +
          '<div class="scroll-x"><table class="grid">' +
            "<thead><tr><th>Skill</th><th>Status</th><th>Stars</th><th>Best</th><th>Attempts</th><th>Modules read</th><th>Project</th></tr></thead><tbody>" +
            rows.map(function (x) {
              var pill = x.status === "verified" ? '<span class="pill ok">' + LEVELS[x.p.stars].label + "</span>"
                : x.status === "studying" ? '<span class="pill warn">Studying</span>'
                : '<span class="pill">Not started</span>';
              return "<tr><td>" + esc(x.s.name) + "</td><td>" + pill + "</td>" +
                "<td>" + starHTML(x.p.stars) + "</td>" +
                '<td class="mono">' + (x.p.attempts ? x.p.best + "%" : "&mdash;") + "</td>" +
                '<td class="mono">' + (x.p.attempts || "&mdash;") + "</td>" +
                '<td class="mono">' + x.p.lessonsDone.length + " / " + x.s.lessons.length + "</td>" +
                "<td>" + (x.p.project ? '<span class="pill ok">Accepted' + (x.p.projectSub ? " &middot; " + x.p.projectSub.score : "") + "</span>" : x.p.projectSub ? '<span class="pill warn">Revising &middot; ' + x.p.projectSub.score + "</span>" : '<span class="tiny muted">&mdash;</span>') + "</td></tr>";
            }).join("") +
          "</tbody></table></div>" +
          (studying.length
            ? '<p class="tiny muted" style="margin-top:12px">Currently studying without a verified result: ' +
              studying.map(function (x) { return esc(x.s.name); }).join(", ") + ".</p>"
            : "") +
        "</div>" +

        '<div class="card">' +
          '<h3 style="margin-bottom:12px">Assessment history</h3>' +
          (hist.length === 0
            ? '<p class="tiny muted">No scored attempts yet.</p>'
            : '<div class="scroll-x"><table class="grid">' +
              "<thead><tr><th>When</th><th>Skill</th><th>Attempt</th><th>Score</th><th>Level awarded</th></tr></thead><tbody>" +
              hist.map(function (x) {
                return '<tr><td class="mono tiny">' + esc(x.h.when) + "</td><td>" + esc(x.s.name) + "</td>" +
                  '<td class="mono tiny">' + x.n + " of " + x.of + "</td>" +
                  '<td class="mono">' + x.h.pct + "%</td><td>" + starHTML(x.h.stars) +
                  ' <span class="tiny muted">' + LEVELS[x.h.stars].label + "</span></td></tr>";
              }).join("") + "</tbody></table></div>") +
        "</div>" +

        '<div class="card">' +
          '<h3 style="margin-bottom:12px">Certificates issued</h3>' +
          (certsFor(u).length === 0
            ? '<p class="tiny muted">None yet.' + (role(u.roleId) && role(u.roleId).tracks ? " A certificate is issued for a main module after its module exam." : " A certificate is issued at " + STAR + STAR + STAR + " or above.") + "</p>"
            : '<div class="scroll-x"><table class="grid">' +
              "<thead><tr><th>Skill</th><th>Level</th><th>Score</th><th>Verification ID</th></tr></thead><tbody>" +
              certsFor(u).map(function (c) {
                return "<tr><td>" + esc(c.skill.name) + "</td><td>" + starHTML(c.p.stars) +
                  ' <span class="tiny muted">' + LEVELS[c.p.stars].label + "</span></td>" +
                  '<td class="mono">' + c.p.best + '%</td><td class="mono tiny">' + verifyId(u, c.skill.id) + "</td></tr>";
              }).join("") + "</tbody></table></div>") +
        "</div>" +
      "</div>") +

      '<p class="tiny muted" style="margin-top:14px">Read-only. Stars, scores and certificates here can only be changed by the student taking an assessment, which is what makes a verified level mean something.</p>';
  }

  /* ---------------- render ---------------- */

  /* ---------------- admin: weekly challenge ----------------
     A challenge awards points and feeds a leaderboard, so it gets the same
     discipline as an assessment question: it is created as a draft, scheduled for
     a week, and only one is live per roadmap at a time. Publishing one closes the
     one it replaces rather than deleting it. */

  var CH_STATUS = {
    draft: { label: "Draft", pill: "warn" },
    scheduled: { label: "Scheduled", pill: "" },
    live: { label: "Live", pill: "ok" },
    closed: { label: "Closed", pill: "" }
  };

  function viewAdminChallenges() {
    var byRole = ROLES.map(function (r) { return { r: r, list: chFor(r.id) }; });
    var liveCount = CHALLENGES.filter(function (c) { return c.status === "live"; }).length;
    var subs = CHALLENGES.reduce(function (a, c) { return a + chSubmissions(c.cid).length; }, 0);

    return '<div class="page-head"><div class="eyebrow">Weekly challenge</div><h1>Challenge schedule</h1>' +
        '<p class="sub">One challenge per roadmap per week. A challenge awards points and ranks students, so it is ' +
        "created as a draft and published deliberately. Publishing closes the one it replaces instead of deleting it.</p></div>" +
      '<div class="summary-row">' +
        summaryCell("Roadmaps", String(ROLES.length)) +
        summaryCell("Challenges", String(CHALLENGES.length)) +
        summaryCell("Live now", String(liveCount)) +
        summaryCell("Submissions", String(subs)) +
      "</div>" +
      '<div class="row" style="margin-bottom:16px">' +
        '<button class="btn primary sm" data-action="ac-new">Create challenge</button>' +
      "</div>" +
      (state.adminCh === "new" ? chEditor(null) : "") +
      '<div class="stack">' + byRole.map(function (x) {
        return '<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:10px">' +
          '<h3>' + esc(x.r.name) + "</h3>" +
          '<span class="tiny muted">' + x.list.length + " challenge" + (x.list.length === 1 ? "" : "s") + "</span></div>" +
          (x.list.length === 0 ? '<p class="tiny muted">Nothing written for this roadmap yet.</p>' :
            '<div class="stack" style="gap:10px">' + x.list.map(function (c) {
              if (state.adminCh === c.cid) return chEditor(c);
              var st = CH_STATUS[c.status] || CH_STATUS.draft;
              var n = chSubmissions(c.cid).length;
              return '<div class="ch-row">' +
                '<div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px">' +
                  '<div><p style="font-weight:500">' + esc(c.title) + "</p>" +
                    '<p class="tiny muted" style="margin-top:3px">Week ' + c.week + " &middot; " + c.rubric.length +
                      " rubric points &middot; " + c.minWords + " word minimum &middot; " + n + " submission" +
                      (n === 1 ? "" : "s") + "</p></div>" +
                  '<div class="row" style="gap:6px;flex-wrap:nowrap">' +
                    '<span class="pill ' + st.pill + '">' + st.label + "</span>" +
                    '<button class="btn sm" data-action="ac-edit" data-cid="' + c.cid + '">Edit</button>' +
                    (c.status === "draft" ? '<button class="btn sm" data-action="ac-status" data-cid="' + c.cid + '" data-to="scheduled">Schedule</button>' : "") +
                    (c.status === "draft" || c.status === "scheduled"
                      ? '<button class="btn sm primary" data-action="ac-status" data-cid="' + c.cid + '" data-to="live">Publish live</button>' : "") +
                    (c.status === "live" ? '<button class="btn sm" data-action="ac-status" data-cid="' + c.cid + '" data-to="closed">Close</button>' : "") +
                    (n ? '<button class="btn sm" data-action="ac-review" data-cid="' + c.cid + '">Submissions</button>' : "") +
                  "</div></div>" +
                (state.adminChReview === c.cid ? chReviewBlock(c) : "") +
              "</div>";
            }).join("") + "</div>") +
        "</div>";
      }).join("") + "</div>";
  }

  function chReviewBlock(c) {
    var rows = chSubmissions(c.cid);
    return '<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px">' +
      '<div class="scroll-x"><table class="grid"><thead><tr><th>Student</th><th>School</th><th>Words</th><th>Score</th><th>Submitted</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return "<tr><td>" + esc(r.user.name) + "</td><td>" + esc(r.user.school) + "</td>" +
          '<td class="mono">' + r.sub.words + '</td><td class="mono">' + r.sub.pct + "%</td>" +
          '<td class="mono tiny">' + esc(r.sub.when) + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<p class="tiny muted" style="margin-top:10px">Scores come from the rubric, so two identical answers always score ' +
      "the same. An admin cannot change a score here, the same way an admin cannot change a star.</p></div>";
  }

  function chEditor(c) {
    var isNew = !c;
    return '<div class="card" style="border-color:var(--accent);margin-bottom:12px">' +
      '<h3 style="margin-bottom:12px">' + (isNew ? "New challenge" : "Edit challenge") + "</h3>" +
      '<div class="stack" style="gap:11px">' +
        '<div class="auth-grid">' +
          '<div class="field"><label for="ac-role">Roadmap</label><select id="ac-role"' + (isNew ? "" : " disabled") + ">" +
            ROLES.map(function (r) {
              return '<option value="' + r.id + '"' + (c && c.roleId === r.id ? " selected" : "") + ">" + esc(r.name) + "</option>";
            }).join("") + "</select></div>" +
          '<div class="field"><label for="ac-week">Week number</label>' +
            '<input id="ac-week" type="number" min="1" value="' + (c ? c.week : nextWeek()) + '"></div>' +
        "</div>" +
        '<div class="field"><label for="ac-title">Title</label>' +
          '<input id="ac-title" value="' + (c ? esc(c.title) : "") + '" placeholder="Diagnose a drop in week-one retention"></div>' +
        '<div class="field"><label for="ac-brief">Brief</label>' +
          '<textarea id="ac-brief" class="ex-input" rows="4">' + (c ? esc(c.brief) : "") + "</textarea></div>" +
        '<div class="field"><label for="ac-min">Minimum words</label>' +
          '<input id="ac-min" type="number" value="' + (c ? c.minWords : 90) + '"></div>' +
        '<div class="field"><label for="ac-rubric">Rubric, one criterion per line</label>' +
          '<textarea id="ac-rubric" class="ex-input" rows="6" placeholder="Segments the drop rather than treating it as one number | segment|cohort|breakdown">' +
            (c ? esc(c.rubric.map(function (r) { return r.label + " | " + r.re; }).join("\n")) : "") + "</textarea>" +
          '<p class="tiny muted" style="margin-top:6px">Each line is <b>what a good answer must do</b>, then a pipe, then the ' +
          "pattern that recognizes it. Without a pattern, the words in the criterion longer than four letters are used.</p></div>" +
        '<div class="row">' +
          '<button class="btn primary sm" data-action="ac-save" data-cid="' + (isNew ? "new" : c.cid) + '">Save as draft</button>' +
          '<button class="btn sm ghost" data-action="ac-cancel">Cancel</button>' +
          '<span class="tiny muted">Saving never changes what students see. Publishing does.</span>' +
        "</div>" +
      "</div></div>";
  }

  function previewBar() {
    var s = skill(state.preview.roleId, state.preview.skillId);
    return '<div class="preview-bar">' +
      '<span class="pv-label">Preview as student &middot; ' + esc(s.name) + "</span>" +
      '<span class="pv-note">Nothing here is recorded. No score, no stars, no leaderboard points.</span>' +
      '<button class="btn sm" data-action="exit-preview">Exit preview</button></div>';
  }

  function render() {
    saveAccounts();
    var user = me();
    if (!user) {
      renderAuth();
      if (typeof updateTutor === "function") updateTutor();   // the rail must not sit over the sign-in page
      return;
    }
    renderShell(user);

    var v = document.getElementById("view");
    var n = state.route.name;
    var subject = actor();
    var html;

    if (state.preview) {
      html = previewBar() +
        (n === "learn" ? viewLearn(subject) :
         n === "assess" ? viewExam(subject) :
         n === "result" ? viewResult(subject) :
         viewSkill(subject));
    } else if (user.role === "admin") {
      if (["a-content", "a-bank", "a-lessons", "a-drafts", "a-challenges", "a-students", "a-student", "profile"].indexOf(n) === -1) n = "a-content";
      html =
        n === "a-bank" ? viewAdminBank() :
        n === "a-lessons" ? viewAdminLessons() :
        n === "a-drafts" ? viewAdminDrafts() :
        n === "a-challenges" ? viewAdminChallenges() :
        n === "a-student" ? viewAdminStudent() :
        n === "a-students" ? viewAdminStudents(user) :
        n === "profile" ? viewProfile(user) :
        viewAdminContent();
    } else {
      var onboarding = n.indexOf("onb-") === 0;
      if (!user.roleId && !onboarding && n !== "roles" && n !== "profile") n = "roles";
      if (onboarding && !state.onb) n = "onb-resume";
      html =
        n === "onb-resume" ? viewOnbResume(user) :
        n === "onb-fork" ? viewOnbFork(user) :
        n === "onb-placement" ? viewOnbPlacement(user) :
        n === "onb-recommend" ? viewOnbRecommend(user) :
        n === "roles" ? viewRoles(user) :
        n === "skill" ? viewSkill(user) :
        n === "learn" ? viewLearn(user) :
        n === "track" ? viewTrack(user) :
        n === "mexam" ? viewModuleExam(user) :
        n === "mresult" ? viewModuleResult(user) :
        n === "assess" ? viewExam(user) :
        n === "result" ? viewResult(user) :
        n === "certs" ? viewCerts(user) :
        n === "cert" ? viewCert(user) :
        n === "challenge" ? viewChallenge(user) :
        n === "leaderboard" ? viewLeaderboard(user) :
        n === "history" ? viewHistory(user) :
        n === "profile" ? viewProfile(user) :
        viewRoadmap(user);
    }
    v.innerHTML = html;

    // The board only ticks while someone is looking at one.
    if (user.role === "student" && !state.preview && user.roleId && LIVE_ROUTES.indexOf(n) > -1) startLive();
    else stopLive();

    if (typeof updateTutor === "function") updateTutor();
  }

  /* ---------------- actions ---------------- */

  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }

  var actions = {
    "auth-tab": function (el) { state.authTab = el.dataset.tab; state.authError = ""; state.authInfo = ""; render(); },

    fill: function (el) {
      var e = document.getElementById("li-email"), p = document.getElementById("li-pass");
      if (e) e.value = el.dataset.email;
      if (p) p.value = el.dataset.pass;
    },

    signup: function () {
      var name = val("su-name"), email = val("su-email"), pass = val("su-pass");
      if (REAL) {
        if (state.authBusy) return;
        state.authDraft = { name: name, email: email, school: val("su-school"), major: val("su-major"), year: val("su-year") };
        if (!name || !email || !pass) { state.authError = "Name, email, and password are all required."; return render(); }
        if (pass.length < 8) { state.authError = "Password must be at least 8 characters."; return render(); }
        state.authBusy = true; state.authError = ""; render();
        return CP_AUTH.signUp(email, pass, { name: name, school: val("su-school"), major: val("su-major"), grad_year: val("su-year") }).then(function (r) {
          if (r.error) return authFail(r);
          if (r.session) return startSession();
          state.authBusy = false; state.authNotice = { kind: "verify", email: email }; render();
        });
      }
      if (!name || !email || !pass) { state.authError = "Name, email, and password are all required."; return render(); }
      if (pass.length < 4) { state.authError = "Password must be at least 4 characters."; return render(); }
      if (state.users.some(function (u) { return u.email.toLowerCase() === email.toLowerCase(); })) {
        state.authError = "An account already exists for that email. Try signing in."; return render();
      }
      var u = newUser({ name: name, email: email, password: pass, role: "student",
        school: val("su-school"), major: val("su-major"), gradYear: val("su-year") });
      state.users.push(u);
      state.userId = u.id; state.authError = "";
      state.onb = { step: 1 };
      go("onb-resume");
    },

    login: function () {
      var email = val("li-email"), pass = val("li-pass");
      if (REAL) {
        if (state.authBusy) return;
        if (!email || !pass) { state.authError = "Enter your email and password."; return render(); }
        state.authBusy = true; state.authError = ""; render();
        return CP_AUTH.signIn(email, pass).then(function (r) {
          if (r.error) { state.authDraft = { email: email }; return authFail(r); }
          return startSession();
        });
      }
      var u = state.users.filter(function (x) {
        return x.email.toLowerCase() === email.toLowerCase() && x.password && x.password === pass && !x.seeded;
      })[0];
      if (!u) { state.authError = "No account matches that email and password."; return render(); }
      state.userId = u.id; state.authError = "";
      go(u.role === "admin" ? "a-content" : (u.roleId ? "roadmap" : "roles"));
    },

    "google-finish": function () {
      var g = state.googlePending;
      if (!g) return;
      if (REAL) {
        var uu = state.users.filter(function (x) { return x.id === state.finishUser; })[0];
        if (!uu || state.authBusy) return;
        var patch = { name: val("gf-name") || g.name, school: val("gf-school"), major: val("gf-major"), grad_year: val("gf-year") };
        state.authBusy = true; state.authError = ""; render();
        return CP_AUTH.saveProfile(patch).then(function (r) {
          state.authBusy = false;
          if (r.error) { state.authError = r.error.text; return render(); }
          uu.name = patch.name; uu.school = patch.school; uu.major = patch.major; uu.gradYear = patch.grad_year;
          sync.last = "";   // send the full profile on the next save
          state.googlePending = null; state.finishUser = null; state.userId = uu.id;
          state.onb = { step: 1 };
          go("onb-resume");
        });
      }
      var u = newUser({ name: val("gf-name") || g.name, email: g.email, password: null, role: "student",
        school: val("gf-school"), major: val("gf-major"), gradYear: val("gf-year") });
      u.google = true; u.picture = g.picture || null;
      state.users.push(u);
      state.googlePending = null; state.userId = u.id; state.authError = "";
      state.onb = { step: 1 };
      go("onb-resume");
    },
    "profile-save": function () {
      var u = me(); if (!u || !REAL) return;
      var name = val("pf-name");
      if (!name) { state.acctMsg = "Your name cannot be empty."; return render(); }
      u.name = name.slice(0, 80); u.school = val("pf-school") || u.school; u.major = val("pf-major") || u.major;
      u.gradYear = val("pf-year") || u.gradYear;
      var box = document.getElementById("pf-board"); u.showOnBoard = box ? box.checked : true;
      state.acctMsg = "Saved.";
      live.rows = null; live.boardKey = ""; live.chRows = null; live.chKey = "";
      render();   // saving to the database happens right after, as with every other change
    },
    "delete-ask": function () { state.delAsk = true; state.delErr = ""; render(); },
    "delete-cancel": function () { state.delAsk = false; state.delErr = ""; render(); },
    "delete-confirm": function () {
      var u = me(); if (!u || !REAL || state.delBusy) return;
      state.delBusy = true; state.delErr = ""; render();
      CP_AUTH.rest("POST", "rpc/delete_my_account", {}).then(function (r) {
        state.delBusy = false;
        if (r.error) { state.delErr = "Could not delete the account. Please try again."; return render(); }
        delete stash[u.id];
        state.users = state.users.filter(function (x) { return x.id !== u.id; });
        try { window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(Object.keys(stash).map(function (k) { return stash[k]; }))); } catch (e) { /* ignore */ }
        CP_AUTH.signOut();
        sync.last = ""; sync.skills = {}; sync.mods = {}; sync.progressReady = false;
        state.userId = null; state.delAsk = false; state.acctMsg = ""; state.authTab = "login"; state.onb = null; state.ch = null;
        state.authNotice = null; state.authError = "";
        stopLive(); live.rows = null; live.boardKey = ""; live.chRows = null; live.chKey = "";
        tutor.turns = []; tutor.quote = ""; tutor.open = false;
        state.authInfo = "Your account and everything saved for it were deleted.";
        render();
      });
    },

    "google-cancel": function () {
      if (REAL) {
        CP_AUTH.signOut();
        state.users = state.users.filter(function (x) { return x.id !== state.finishUser; });
        state.finishUser = null;
      }
      state.googlePending = null; state.authError = "";
      if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
      render();
    },

    forgot: function () { state.authTab = "forgot"; state.authError = ""; state.authNotice = null; render(); },
    "auth-back": function () { state.authTab = "login"; state.authError = ""; state.authNotice = null; render(); },
    "forgot-send": function () {
      var email = val("fg-email");
      if (!email) { state.authError = "Enter your email."; return render(); }
      if (state.authBusy) return;
      state.authBusy = true; state.authError = ""; render();
      CP_AUTH.recover(email).then(function (r) {
        state.authBusy = false;
        if (r.error && r.error.code !== "email") { state.authError = r.error.text; return render(); }
        if (r.error) { state.authError = r.error.text; return render(); }
        state.authNotice = { kind: "reset-sent", email: email }; render();
      });
    },
    "resend-confirm": function () {
      var n = state.authNotice; if (!n || state.authBusy) return;
      state.authBusy = true; render();
      CP_AUTH.resend(n.email).then(function (r) {
        state.authBusy = false;
        state.authNotice = { kind: "verify", email: n.email, info: r.error ? r.error.text : "Sent again. It can take a minute." };
        render();
      });
    },
    "reset-save": function () {
      var a = val("rs-pass"), b = val("rs-pass2");
      if (a.length < 8) { state.authError = "Password must be at least 8 characters."; return render(); }
      if (a !== b) { state.authError = "The two passwords do not match."; return render(); }
      if (state.authBusy) return;
      state.authBusy = true; state.authError = ""; render();
      CP_AUTH.updatePassword(a).then(function (r) {
        if (r.error) return authFail(r);
        state.authTab = "login";
        startSession();
      });
    },

    logout: function () {
      if (REAL) {
        var cur = me();
        CP_AUTH.signOut();
        if (cur) { stash[cur.id] = cur; state.users = state.users.filter(function (x) { return x.id !== cur.id; }); }
        sync.last = ""; sync.skills = {}; sync.mods = {}; sync.progressReady = false;
        state.users = state.users.filter(function (x) { return !x.remote; });
        live.rows = null; live.boardKey = ""; live.chRows = null; live.chKey = "";
      }
      forgetPage();
      state.userId = null; state.authTab = "login"; state.exam = null; state.mexam = null; state.mresult = null; state.quiz = null; state.googlePending = null;
      state.preview = null; state.adminSkill = null; state.adminEdit = null;
      state.onb = null; state.ch = null; state.adminCh = null; state.adminChReview = null;
      state.practiceState = {}; state.projDraft = {};   // drafts belong to the person who wrote them
      live.feed = []; live.chFeed = []; live.flash = {};
      stopLive();
      tutor.turns = []; tutor.quote = ""; tutor.open = false;   // don't leak one student's chat to the next
      render();
    },

    nav: function (el) { state.adminEdit = null; state.adminLesson = null; go(el.dataset.nav); },

    // The logo always goes to the student's home: the roadmap, or the role picker until one is chosen.
    home: function () {
      var u = me();
      state.roleMenu = false;
      if (!u) { state.authNotice = null; state.authError = ""; return render(); }
      state.adminEdit = null; state.adminLesson = null;
      if (state.preview) { state.preview = null; state.exam = null; state.quiz = null; state.result = null; }
      go(u.role === "admin" ? "a-content" : (u.roleId ? "roadmap" : "roles"));
    },

    "role-menu": function () { state.roleMenu = !state.roleMenu; render(); },

    "role-switch": function (el) {
      state.roleMenu = false;
      switchRoadmap(me(), el.dataset.role);
      go("roadmap");
    },

    theme: function () {
      var root = document.documentElement;
      var cur = root.getAttribute("data-theme");
      var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      var next = cur ? (cur === "dark" ? "light" : "dark") : (systemDark ? "light" : "dark");
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("cp-theme", next); } catch (e) {}   // the website pages read this too
      render();
    },

    "pick-role": function (el) { switchRoadmap(me(), el.dataset.role); go("roadmap"); },

    /* ---- onboarding ---- */

    "onb-open": function () { state.onb = { step: 1 }; go("onb-resume"); },

    "onb-resume-flow": function (el) {
      var o = state.onb;
      if (!o) return actions["onb-open"]();
      o.skipped = false;
      go(el.dataset.to);
    },
    "onb-step": function (el) {
      var o = state.onb;
      if (!o) return;
      var n = +el.dataset.step;
      o.skipped = false;
      window.scrollTo(0, 0);
      if (n === 1) return go("onb-resume");
      if (n === 2) {
        // From the recommendation, step 2 reopens the answers; otherwise it is the choice itself.
        if (o.mode === "guided" && o.items && o.items.length) return go("onb-placement");
        return go("onb-fork");
      }
      if (o.rec && o.rec.length) return go("onb-recommend");
    },
    "onb-redo": function () { state.onb = { step: 1 }; render(); },
    "onb-paste": function () {
      state.onb = state.onb || {};
      state.onb.paste = !state.onb.paste;
      state.onb.err = "";
      render();
    },

    "onb-paste-save": function () {
      var text = (document.getElementById("onb-text") || {}).value || "";
      var O = window.CP_ONBOARD;
      if (!O.readable(O.clean(text))) {
        state.onb.err = "That is not enough text to work with. Paste at least a few lines of your resume.";
        return render();
      }
      var chk = O.assessResume(O.clean(text));
      if (!chk.ok) return rejectResume(chk, "That text");
      acceptResume(O.clean(text), "Pasted text", "text");
    },

    "onb-to-fork": function () {
      if (!state.onb) state.onb = { step: 1 };
      state.onb.skipped = false;
      window.scrollTo(0, 0);
      go("onb-fork");
    },

    // "I know my target role": straight to the roadmap list, resume coverage shown on each card.
    "onb-know": function () {
      if (!state.onb) state.onb = { step: 1 };
      state.onb.mode = "know";
      state.onb.skipped = false;
      window.scrollTo(0, 0);
      go("roles");
    },

    // "Help me choose": five questions, then the ranked recommendation.
    "onb-guided": function () {
      if (!state.onb) state.onb = { step: 1 };
      var o = state.onb;
      o.mode = "guided"; o.skipped = false;
      if (!o.items || !o.items.length || (o.answers || []).length < o.items.length) {
        o.items = window.CP_ONBOARD.buildPlacement();
        o.idx = 0; o.answers = []; o.rec = null;
      }
      window.scrollTo(0, 0);
      go("onb-placement");
    },

    "onb-answer": function (el) {
      var o = state.onb;
      o.answers[o.idx] = +el.dataset.i;
      o.rec = null;   // an earlier recommendation no longer matches the answers
      o.idx++;
      window.scrollTo(0, 0);
      if (o.idx >= o.items.length) {
        o.score = window.CP_ONBOARD.scorePlacement(o.items, o.answers, ROLES.map(function (r) { return r.id; }));
        var u = me();
        u.placement = { answered: o.score.answered, total: o.score.total,
          perRole: o.score.perRole, when: today() };
        // The last answer goes straight to the recommendation; the review page stays reachable from step 2.
        return actions["onb-to-recommend"]();
      }
      render();
    },

    "onb-back": function () {
      var o = state.onb;
      if (o.idx > 0) o.idx--;
      render();
    },

    "onb-redo-test": function () {
      var o = state.onb;
      o.idx = 0; o.answers = []; o.score = null; o.rec = null;
      render();
    },

    "onb-to-recommend": function () {
      var o = state.onb;
      // The rule-based ranking is computed first so there is always something to show.
      o.rec = window.CP_ONBOARD.recommend(ROLES, o.detect || { skills: {}, roles: {} }, o.score);
      o.planned = window.CP_ONBOARD.plannedLead(ROLES, o.score);
      o.by = "rules";
      saveMatches(o);
      // Marked busy before the first paint, so the page says the model is working
      // rather than showing the fallback numbers as if they were final.
      o.busy = !!(tutor.ready && !tutor.denied);
      go("onb-recommend");
      askRanking(o);
    },

    "onb-rerank": function () { askRanking(state.onb, true); },

    "onb-pick": function (el) {
      switchRoadmap(me(), el.dataset.role);
      // The recommendation is kept rather than thrown away, so it stays reachable from
      // the role picker if they want to reconsider.
      if (state.onb) state.onb.picked = true;
      go("roadmap");
    },

    /* ---- weekly challenge ---- */

    "ch-submit": function (el) {
      var user = me();
      var c = chById(el.dataset.cid);
      if (!c || user.challenges[c.cid]) return;
      if (state.ch && state.ch.busy) return;
      var box = document.getElementById("ch-text");
      var text = box ? box.value.trim() : "";
      if (!text) {
        state.ch = { cid: c.cid, err: "Write an answer before submitting." };
        return render();
      }
      // Real accounts are scored on the server, so the score on the leaderboard cannot be set from this page.
      if (REAL && !state.preview) return submitToServer(user, c, text);
      var res = scoreChallenge(c, text);
      user.challenges[c.cid] = { text: text, pct: res.pct, met: res.met, hit: res.hit, of: res.of,
        words: res.words, short: res.short, when: today(), feedback: "", source: "" };
      // Points once per challenge, and never enough to outweigh a verified star.
      user.points += CH.points(res.pct);
      state.ch = { cid: c.cid };
      render();
      askChallengeFeedback(c, user);
    },

    "ch-feedback": function () {
      var user = me();
      var c = liveChallenge(user.roleId);
      if (c) askChallengeFeedback(c, user);
    },

    /* ---- admin: weekly challenge ---- */

    "ac-new": function () { state.adminCh = "new"; render(); },
    "ac-edit": function (el) { state.adminCh = el.dataset.cid; render(); },
    "ac-cancel": function () { state.adminCh = null; render(); },
    "ac-review": function (el) {
      state.adminChReview = state.adminChReview === el.dataset.cid ? null : el.dataset.cid;
      render();
    },

    "ac-save": function (el) {
      var isNew = el.dataset.cid === "new";
      var rubric = parseRubric(val("ac-rubric"));
      var title = val("ac-title"), brief = val("ac-brief");
      if (!title || !brief || !rubric.length) {
        state.adminChErr = "A challenge needs a title, a brief and at least one rubric line.";
        return render();
      }
      var fields = {
        week: +val("ac-week") || nextWeek(), title: title, brief: brief,
        minWords: +val("ac-min") || 80, rubric: rubric
      };
      if (isNew) {
        var roleId = val("ac-role") || ROLES[0].id;
        CHALLENGES.push(Object.assign({ cid: roleId + "-w" + fields.week + "-" + uid().slice(1, 4),
          roleId: roleId, status: "draft" }, fields));
      } else {
        var c = chById(el.dataset.cid);
        if (c) Object.assign(c, fields);
      }
      state.adminCh = null; state.adminChErr = "";
      render();
    },

    "ac-status": function (el) {
      var c = chById(el.dataset.cid);
      if (!c) return;
      var to = el.dataset.to;
      if (to === "live") {
        // One live challenge per roadmap. The one it replaces is closed, not deleted.
        CHALLENGES.forEach(function (x) {
          if (x.roleId === c.roleId && x.status === "live" && x.cid !== c.cid) x.status = "closed";
        });
      }
      c.status = to;
      render();
    },

    "open-skill": function (el) { state.quiz = null; state.examErr = ""; go("skill", { skill: el.dataset.skill }); },

    "start-learn": function (el) {
      state.lessonIdx = el.dataset.lesson ? +el.dataset.lesson : 0;
      state.quiz = null;
      markLesson(el.dataset.skill, state.lessonIdx);
      go("learn", { skill: el.dataset.skill });
    },

    lesson: function (el) {
      state.lessonIdx = +el.dataset.i;
      markLesson(state.route.skill, state.lessonIdx);
      window.scrollTo(0, 0);
      render();
    },

    "practice-check": function (el) {
      var key = el.dataset.key;
      var st = pstate(key);
      var parts = key.split("-");
      var i = +parts.pop();
      var s = skill(actor().roleId, parts.join("-"));
      var box = document.querySelector('[data-practice="' + key + '"]');
      if (box) st.text = box.value;
      st.checked = runCheck(s.practice[i], st.text);
      if (!st.checked.empty) st.tries++;
      render();
    },

    "practice-hint": function (el) {
      var st = pstate(el.dataset.key);
      st.hints++;
      render();
    },

    "practice-answer": function (el) {
      var st = pstate(el.dataset.key);
      st.shown = !st.shown;
      render();
    },

    "scn-pick": function (el) {
      var st = pstate(el.dataset.key);
      if (typeof st.pick !== "number") st.pick = +el.dataset.i;
      render();
    },

    "scn-check": function (el) {
      var key = el.dataset.key, st = pstate(key);
      var parts = key.split("|L");
      var s = skill(actor().roleId, parts[0]);
      var w = s.lessons[+parts[1]].scenario.written;
      var box = document.querySelector('[data-practice="' + key + '"]');
      if (box) st.text = box.value;
      var t = String(st.text || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (!t) { st.checked = { empty: true }; return render(); }
      var criteria = w.points.map(function (p) { return { label: p.label, ok: p.re.test(t) }; });
      var met = criteria.filter(function (c) { return c.ok; }).length;
      st.checked = { criteria: criteria, problems: [], met: met, total: criteria.length, graded: false,
        verdict: met === criteria.length ? "full" : met ? "partial" : "none-covered" };
      st.tries = (st.tries || 0) + 1;
      st.review = ""; st.reviewErr = "";
      render();
    },

    "scn-show": function (el) {
      var st = pstate(el.dataset.key);
      if (!st.checked || st.checked.empty) return;     // the stronger answer is for after an honest attempt
      st.shown = !st.shown;
      render();
    },

    "scn-hint": function (el) {
      var key = el.dataset.key, st = pstate(key);
      if (st.hintBusy) return;
      var parts = key.split("|L");
      var s = skill(actor().roleId, parts[0]);
      var lesson = s.lessons[+parts[1]], sc = lesson.scenario;
      var box = document.querySelector('[data-practice="' + key + '"]');
      if (box) st.text = box.value;
      st.hintList = st.hintList || [];
      var fallback = [
        "Start from the decision the question asks for, then give the reason. Re-read the lesson \"" + lesson.title + "\" for the idea this question tests.",
        "Make it specific. A number, a named person or team, or a trade-off you are accepting is what separates a strong answer from a generic one.",
        "Write your own attempt now, even a rough one, then check it. The check shows how many of the " + sc.written.points.length + " key ideas you covered."
      ];
      if (!tutor.ready || tutor.denied) { st.hintList.push(fallback[Math.min(st.hintList.length, 2)]); return render(); }
      st.hintBusy = true; render();
      askModel({ rules: PRJ.hintRules, signal: null, onText: null, convo: [{ role: "user", content:
        PRJ.hintPrompt((role(actor().roleId) || {}).name, lesson.title, sc.setup + "\n" + sc.written.prompt, st.text, st.hintList) }] })
        .then(function (res) { st.hintBusy = false; st.hintList.push(String(res.text || "").replace(/\u2014/g, "-").trim().slice(0, 500) || fallback[Math.min(st.hintList.length, 2)]); render(); })
        .catch(function () { st.hintBusy = false; st.hintList.push(fallback[Math.min(st.hintList.length, 2)]); render(); });
    },

    "scn-review": function (el) {
      var key = el.dataset.key, st = pstate(key);
      if (st.reviewBusy || !st.checked || !st.checked.criteria) return;
      var parts = key.split("|L");
      var s = skill(actor().roleId, parts[0]);
      var lesson = s.lessons[+parts[1]], sc = lesson.scenario;
      st.reviewBusy = true; st.reviewErr = "";
      render();
      var convo = [{ role: "user", content:
        "Lesson: " + lesson.title + "\n\nScenario:\n" + sc.setup + "\n\nQuestion asked:\n" + sc.written.prompt +
        "\n\nKey points a strong answer covers:\n" + st.checked.criteria.map(function (c, k) {
          return (k + 1) + ". " + c.label + " [" + (c.ok ? "found" : "not found") + "]";
        }).join("\n") +
        "\n\nThe student's answer:\n" + String(st.text || "").slice(0, 3000) }];
      convo[0].content = "Target role: " + ((role(actor().roleId) || {}).name || "not set") + "\n" + convo[0].content;
      askModel({ rules: SCN_RULES, convo: convo, signal: null, onText: null })
        .then(function (res) { st.review = res.text; st.reviewBusy = false; render(); })
        .catch(function (e) {
          st.reviewBusy = false;
          st.reviewErr = tutorErrCopy((e && e.code) || "upstream_error", e && e.message);
          render();
        });
    },

    "start-quiz": function (el) { state.quiz = { skillId: el.dataset.skill, idx: 0, answers: [], done: false }; render(); },

    "quiz-answer": function (el) {
      var q = state.quiz;
      var s = skill(actor().roleId, q.skillId);
      q.answers.push(+el.dataset.i);
      q.idx++;
      if (q.idx >= s.quiz.length) q.done = true;
      render();
    },

    "start-exam": function (el) {
      if (serverGrading()) {
        var sid = el.dataset.skill, u0 = actor();
        if (state.examBusy) return;
        state.examBusy = true; state.examErr = "";
        return apiPost("/api/exam", { action: "start", kind: "skill", id: sid }).then(function (r) {
          state.examBusy = false;
          if (r.error) { state.examErr = r.error.message; go("skill", { skill: sid }); return; }
          state.exam = { skillId: sid, idx: 0, answers: [], attempt: r.data.attempt, qs: localQuestions(u0, r.data.items) };
          go("assess", { skill: sid });
        });
      }
      state.exam = { skillId: el.dataset.skill, idx: 0, answers: [] };
      go("assess", { skill: el.dataset.skill });
    },

    "exam-answer": function (el) {
      var e = state.exam;
      var subject = actor();
      var s = skill(subject.roleId, e.skillId);
      e.answers.push(+el.dataset.i);
      e.idx++;
      if (e.idx < (e.qs || s.assessment).length) { window.scrollTo(0, 0); return render(); }
      if (e.attempt) return sendExam("skill", e);
      finishExam(subject, s, e);
    },

    "project-submit": function (el) {
      var u = actor(), sid = el.dataset.skill, s = skill(u.roleId, sid), p = prog(u, sid), d = projDraft(sid);
      var box = document.querySelector('[data-proj="' + sid + '"]');
      if (box) d.text = box.value;
      if (d.busy || p.project || state.preview) return;
      var n = PRJ.words(d.text);
      if (n < PRJ.MIN_WORDS) {
        d.err = "Write at least " + PRJ.MIN_WORDS + " words before submitting. You have " + n + ". The reviewer needs enough to judge.";
        return render();
      }
      if (!tutor.ready || tutor.denied) {
        d.err = "The reviewer is not available right now, so the project was not submitted. Your text is still here; try again in a moment.";
        return render();
      }
      d.busy = true; d.err = "";
      render();
      var sent = d.text;
      if (serverGrading()) {
        // Real accounts: the server reviews the project and records the result, the page only shows it.
        return apiPost("/api/grade-project", { skill: sid, text: sent }).then(function (r) {
          d.busy = false;
          if (me() !== u) return;
          if (r.error) { d.err = r.error.message; return render(); }
          var sp = splitHistory(r.data.progress.history);
          p.stars = r.data.progress.stars; p.project = r.data.progress.project; p.projectSub = sp.sub || r.data.sub;
          u.points = r.data.points;
          sync.skills[sid] = lessonsKey(p);
          render();
        });
      }
      var convo = [{ role: "user", content: PRJ.prompt((role(u.roleId) || {}).name, s.name, s.project, sent) }];
      askModel({ rules: PRJ.rules(todayLong()), convo: convo, signal: null, onText: null })
        .then(function (res) {
          d.busy = false;
          var r = PRJ.read(res.text);
          if (!r) {
            d.err = "The review came back in a form the page could not read, so nothing was recorded. Try submitting again.";
            return render();
          }
          var accepted = r.score >= PRJ.PASS;
          p.projectSub = { score: r.score, accepted: accepted, text: sent.slice(0, PRJ.KEEP_CHARS), summary: r.summary,
            criteria: r.criteria, next: r.next, when: today(), tries: ((p.projectSub && p.projectSub.tries) || 0) + 1 };
          if (accepted && !p.project) {
            p.project = true;
            u.points += 150;
            if (p.best >= 95 && p.stars < 5) { u.points += 100; p.stars = 5; }
          }
          render();
        })
        .catch(function (e) {
          d.busy = false;
          d.err = tutorErrCopy((e && e.code) || "upstream_error", e && e.message) + " Your text is still here.";
          render();
        });
    },

    "project-hint": function (el) {
      var u = actor(), sid = el.dataset.skill, s = skill(u.roleId, sid), d = projDraft(sid);
      var box = document.querySelector('[data-proj="' + sid + '"]');
      if (box) d.text = box.value;
      if (d.hintBusy || !tutor.ready || tutor.denied) return;
      d.hintBusy = true;
      render();
      askModel({ rules: PRJ.hintRules, signal: null, onText: null, convo: [{ role: "user", content:
        PRJ.hintPrompt((role(u.roleId) || {}).name, s.name + " project: " + s.project.title, s.project.brief, d.text, d.hints) }] })
        .then(function (res) { d.hintBusy = false; d.hints.push(String(res.text || "").replace(/—/g, "-").trim().slice(0, 500)); render(); })
        .catch(function (e) { d.hintBusy = false; d.err = tutorErrCopy((e && e.code) || "upstream_error", e && e.message); render(); });
    },

    "open-cert": function (el) { go("cert", { skill: el.dataset.skill }); },

    "open-track": function (el) { state.examErr = ""; go("track", { track: el.dataset.track }); },

    "exam-retry": function () {
      var x = state.pendingExam;
      if (x) sendExam(x.kind, x.e);
    },

    "start-mexam": function (el) {
      var u = actor(), r = role(u.roleId), t = trackById(r, el.dataset.track);
      if (!t || !t.cert) return;
      if (!trackStatus(u, r, t).eligible) return go("track", { track: t.id });
      if (serverGrading()) {
        if (state.examBusy) return;
        state.examBusy = true; state.examErr = "";
        return apiPost("/api/exam", { action: "start", kind: "module", id: t.id }).then(function (x) {
          state.examBusy = false;
          if (x.error) { state.examErr = x.error.message; go("track", { track: t.id }); return; }
          state.mexam = { trackId: t.id, attempt: x.data.attempt, items: localQuestions(u, x.data.items), idx: 0, answers: [] };
          go("mexam", { track: t.id });
        });
      }
      state.mexam = { trackId: t.id, items: buildModuleExam(r, t), idx: 0, answers: [] };
      go("mexam", { track: t.id });
    },

    "mexam-answer": function (el) {
      var e = state.mexam; if (!e) return;
      var u = actor(), r = role(u.roleId), t = trackById(r, e.trackId);
      e.answers.push(+el.dataset.i);
      e.idx++;
      if (e.idx < e.items.length) { window.scrollTo(0, 0); return render(); }
      if (e.attempt) return sendExam("module", e);
      finishModuleExam(u, r, t, e);
    },

    /* ---- admin ---- */

    "a-open": function (el) {
      state.adminSkill = { roleId: el.dataset.role, skillId: el.dataset.skill };
      state.adminEdit = null; state.adminHistory = null;
      go("a-bank");
    },
    "a-lessons": function (el) {
      state.adminSkill = { roleId: el.dataset.role, skillId: el.dataset.skill };
      state.adminLesson = null;
      go("a-lessons");
    },
    "a-edit": function (el) { state.adminEdit = el.dataset.qid; render(); },
    "a-new": function () { state.adminEdit = "new"; render(); },
    "a-cancel": function () { state.adminEdit = null; render(); },
    "a-history": function (el) {
      state.adminHistory = state.adminHistory === el.dataset.qid ? null : el.dataset.qid;
      render();
    },

    "a-save": function (el) {
      var s = skill(state.adminSkill.roleId, state.adminSkill.skillId);
      var fields = {
        q: val("ae-q"), opts: [0, 1, 2, 3].map(function (j) { return val("ae-o" + j); }),
        a: +val("ae-a"), lvl: +val("ae-l"), why: val("ae-w")
      };
      if (!fields.q || fields.opts.some(function (o) { return !o; })) return;
      var isNew = el.dataset.qid === "new";
      var qid = isNew ? s.id + "-q" + (s.assessment.length + s.drafts.length + 1) + "n" : el.dataset.qid;
      s.drafts = s.drafts.filter(function (d) { return d.qid !== qid; });
      s.drafts.push({ qid: qid, fields: fields, isNew: isNew, created: today() });
      state.adminEdit = null;
      go("a-drafts");
    },

    "a-review-one": function (el) { go("a-drafts"); },

    "a-publish": function (el) {
      var s = skill(el.dataset.role, el.dataset.skill);
      publishDraft(s, el.dataset.qid);
      render();
    },
    "a-discard": function (el) {
      var s = skill(el.dataset.role, el.dataset.skill);
      s.drafts = s.drafts.filter(function (d) { return d.qid !== el.dataset.qid; });
      render();
    },
    "a-retire": function (el) {
      var s = skill(state.adminSkill.roleId, state.adminSkill.skillId);
      retireQuestion(s, el.dataset.qid);
      render();
    },

    "al-edit": function (el) { state.adminLesson = +el.dataset.i; render(); },
    "al-cancel": function () { state.adminLesson = null; render(); },
    "al-save": function (el) {
      var s = skill(state.adminSkill.roleId, state.adminSkill.skillId);
      var l = s.lessons[+el.dataset.i];
      var t = val("al-t"), b = val("al-b");
      if (t) l.title = t;
      if (b) l.body = b;
      state.adminLesson = null;
      render();
    },

    preview: function (el) {
      var ctx = state.adminSkill;
      state.preview = {
        roleId: ctx.roleId, skillId: ctx.skillId,
        user: { id: "preview", name: "Preview", school: "CareerPath", roleId: ctx.roleId,
                points: 0, progress: {}, role: "student", preview: true }
      };
      state.quiz = null;
      if (el.dataset.mode === "assess") {
        state.exam = { skillId: ctx.skillId, idx: 0, answers: [] };
        go("assess", { skill: ctx.skillId });
      } else {
        state.lessonIdx = 0;
        go("learn", { skill: ctx.skillId });
      }
    },

    "a-student": function (el) { state.adminStudent = el.dataset.id; go("a-student"); },

    "sf-clear": function () {
      state.studentFilter = { role: "all", school: "all", q: "" };
      render();
    },

    "exit-preview": function () {
      state.preview = null; state.exam = null; state.quiz = null; state.result = null;
      go("a-bank");
    }
  };

  /* ---------------- onboarding and challenge helpers ---------------- */

  /* The file was readable but is not a resume. Say so plainly, keep the upload box open and
     store nothing about the file. */
  function rejectResume(chk, what) {
    var o = state.onb = state.onb || {};
    o.parsing = false; o.detect = null; o.name = ""; o.text = ""; o.rec = null;
    o.err = what + " does not look like a resume" + (chk.looksLike ? ". It looks like " + chk.looksLike : "") +
      ". Please upload your resume (PDF, Word or plain text) and try again.";
    render();
  }

  function acceptResume(text, name, kind) {
    var det = window.CP_ONBOARD.detect(text);
    var u = me();
    state.onb = Object.assign(state.onb || {}, {
      name: name, kind: kind, chars: text.length, text: text,
      detect: det, parsing: false, err: "", paste: false, rec: null
    });
    // What is kept is the conclusion, not the document. The resume text itself never
    // leaves the page and is dropped when the session ends.
    u.resume = { name: name, kind: kind, chars: text.length,
      skills: Object.keys(det.skills), roles: det.roles, general: det.general, when: today() };
    render();
  }

  /* Hand the whole picture to the model and let it rank. The rule-based ranking is
     already on screen, so this replaces it if the answer comes back valid and leaves
     it alone if it does not. Either way the page says which one produced the numbers,
     because a match percentage with no visible source is the kind of thing a reviewer
     is right to distrust. */
  function askRanking(o, again) {
    if (!o || !o.items) return;
    if (!tutor.ready || tutor.denied) {
      o.by = "rules"; o.busy = false; o.rankErr = "";
      return render();
    }

    o.busy = true; o.rankErr = "";
    if (again) render();

    var O = window.CP_ONBOARD;
    var prompt = O.rankPrompt(ROLES, o.detect || { skills: {}, roles: {}, general: {} }, o.items, o.answers, o.text);

    askModel({ rules: O.rankRules(ROLES), convo: [{ role: "user", content: prompt }], signal: null, onText: null })
      .then(function (res) {
        var ranking = O.readRanking(res.text, ROLES);
        o.busy = false;
        if (!ranking) {
          o.rankErr = "The model's answer did not come back in a form the page could read, so the ranking below is the rule-based one.";
          return render();
        }
        var byId = {};
        o.rec.forEach(function (x) { byId[x.roleId] = x; });
        o.rec = ranking.map(function (row) {
          var base = byId[row.roleId];
          return {
            roleId: row.roleId, name: base.name, tagline: base.tagline,
            score: row.match, claimed: base.claimed,
            reasons: base.reasons, why: row.why
          };
        });
        o.by = "model";
        saveMatches(o);
        var u = me();
        if (u && u.placement) u.placement.rankedBy = "model";
        render();
      })
      .catch(function (e) {
        o.busy = false;
        o.rankErr = tutorErrCopy((e && e.code) || "upstream_error", e && e.message);
        render();
      });
  }

  function parseRubric(text) {
    return String(text || "").split("\n").map(function (l) { return l.trim(); })
      .filter(Boolean).map(function (l) {
        var i = l.indexOf("|");
        var label = i > -1 ? l.slice(0, i).trim() : l;
        var re = i > -1 ? l.slice(i + 1).trim() : "";
        if (!re) {
          // No pattern given: the substantive words of the criterion become one.
          re = label.toLowerCase().split(/[^a-z0-9]+/)
            .filter(function (w) { return w.length > 4; }).slice(0, 6).join("|");
        }
        return { label: label, re: re || label };
      });
  }

  function askChallengeFeedback(c, user) {
    var sub = user.challenges[c.cid];
    if (!sub || sub.feedback) return;

    // Without a model reachable, the rubric still explains the score, so say that
    // plainly instead of pretending a reviewer looked at it.
    if (!tutor.ready || tutor.denied) {
      sub.feedback = "No written review is available on this deployment, so the rubric above is the whole " +
        "explanation of the score. It shows which of the " + sub.of + " things a strong answer has to do were " +
        "found in yours.";
      sub.source = "rules";
      state.ch = { cid: c.cid };
      return render();
    }

    state.ch = { cid: c.cid, busy: true, err: "" };
    render();

    var convo = [{ role: "user", content: CH.feedbackPrompt(c, sub, sub.text) }];

    askModel({ rules: CH.feedbackRules, convo: convo, signal: null, onText: null })
      .then(function (res) {
        sub.feedback = res.text;
        sub.source = "ai";
        state.ch = { cid: c.cid };
        render();
      })
      .catch(function (e) {
        state.ch = { cid: c.cid, err: tutorErrCopy((e && e.code) || "upstream_error", e && e.message) };
        render();
      });
  }

  function markLesson(skillId, i) {
    var p = prog(actor(), skillId);
    if (p.lessonsDone.indexOf(i) === -1) p.lessonsDone.push(i);
  }

  function finishExam(user, s, e) {
    var right = e.answers.filter(function (a, i) { return a === s.assessment[i].a; }).length;
    var pct = Math.round(right / s.assessment.length * 100);
    var p = prog(user, s.id);
    var award = awardFor(pct, p.project);

    p.attempts++;
    var pointsAwarded = 0, improved = false;

    if (!state.preview) {
      p.history.push({ pct: pct, stars: award.stars, when: today() });
      if (award.stars > p.stars) {
        pointsAwarded = (award.stars - p.stars) * 100;
        user.points += pointsAwarded;
        p.stars = award.stars;
        improved = true;
      }
      if (pct > p.best) { p.best = pct; improved = true; }
    }

    state.result = { skillId: s.id, pct: pct, right: right, answers: e.answers, award: award,
      newStars: pointsAwarded > 0 || improved, pointsAwarded: pointsAwarded };
    state.exam = null;
    go("result");
  }

  document.addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-action]");
    if (state.roleMenu && !ev.target.closest(".role-switch")) {
      state.roleMenu = false;
      if (!el) return render();
    }
    if (!el) return;
    if (el.tagName === "A" && (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button)) return;   // open in a new tab as usual
    var fn = actions[el.dataset.action];
    if (fn) { ev.preventDefault(); fn(el); }
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && state.roleMenu) { state.roleMenu = false; render(); }
  });

  document.addEventListener("change", function (ev) {
    var el = ev.target.closest && ev.target.closest("[data-filter]");
    if (!el || el.tagName !== "SELECT") return;
    state.studentFilter[el.dataset.filter] = el.value;
    render();
  });

  // Resume upload. The file is read here in the browser and never sent anywhere.
  document.addEventListener("change", function (ev) {
    var el = ev.target;
    if (!el || el.id !== "onb-file" || !el.files || !el.files.length) return;
    var f = el.files[0];

    state.onb = Object.assign(state.onb || {}, { parsing: true, name: f.name, err: "", paste: false });
    render();

    window.CP_ONBOARD.parseFile(f).then(function (res) {
      if (!res.ok) {
        state.onb.parsing = false;
        state.onb.name = "";
        var m;
        if (res.kind === "image") {
          m = "That is an image, not a resume file. Please upload your resume as a PDF, Word (.docx) or text file.";
        } else if (res.kind === "doc") {
          m = "Old Word (.doc) files cannot be read. Save your resume as .docx or PDF and upload it again.";
        } else if (res.locked) {
          m = "That PDF is password protected, so it cannot be read. Remove the password or upload another copy of your resume.";
        } else if (res.scanned) {
          m = "No text could be read from that file. It looks like a scan or a photo (for example an ID, visa or form), " +
            "which is not a resume. Please upload your resume as a text PDF or Word file. If it is a scanned resume, paste its text instead.";
        } else if (res.kind === "pdf") {
          m = "Not enough readable text came out of that PDF to check it. If it is your resume, export it again as a text PDF " +
            "or paste its text. If it is something else, please upload your resume.";
        } else {
          m = "Not enough readable text came out of that file to check it. Please upload your resume as a PDF, Word (.docx) or text file.";
        }
        state.onb.err = m;
        return render();
      }
      var chk = window.CP_ONBOARD.assessResume(res.text);
      if (!chk.ok) return rejectResume(chk, "That file");
      acceptResume(res.text, f.name, res.kind);
    }, function () {
      state.onb.parsing = false;
      state.onb.paste = true;
      state.onb.err = "That file could not be read. Paste the text instead.";
      render();
    });
  });

  // The learner's attempt is stored without re-rendering, so the caret never jumps.
  document.addEventListener("input", function (ev) {
    var t = ev.target;
    if (t && t.dataset && t.dataset.practice) { pstate(t.dataset.practice).text = t.value; }
    if (t && t.dataset && t.dataset.proj) {
      projDraft(t.dataset.proj).text = t.value;
      var c = document.querySelector("[data-proj-count]");
      if (c) c.innerHTML = PRJ.words(t.value) + " words &middot; at least " + PRJ.MIN_WORDS + " to submit";
    }
  });

  document.addEventListener("input", function (ev) {
    var el = ev.target.closest && ev.target.closest("[data-filter]");
    if (!el || el.tagName !== "INPUT") return;
    state.studentFilter[el.dataset.filter] = el.value;
    var pos = el.selectionStart;
    var id = el.id;
    render();
    var again = document.getElementById(id);
    if (again) {
      again.focus();
      try { again.setSelectionRange(pos, pos); } catch (e) { /* not all inputs support it */ }
    }
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Enter") return;
    var auth = document.getElementById("auth");
    if (ev.target && ev.target.tagName === "INPUT" && auth && !auth.hidden) {
      var btn = document.querySelector('[data-action="signup"], [data-action="login"], [data-action="forgot-send"], [data-action="reset-save"]');
      if (btn) { ev.preventDefault(); actions[btn.dataset.action](btn); }
    }
  });

  /* ================= AI study assistant =================
     Runs on the viewer's own Claude account through the artifact runtime.
     Two rules shape it: it teaches for the student's target role, and it is
     switched off during a graded assessment, because a verified level has to
     mean the student knew the answer. */

  /* Two backends, one interface. On claude.ai the page asks Claude through the
     artifact runtime. Deployed anywhere else it posts to /api/ask, a serverless
     function that holds the API key server-side so the key never reaches the browser. */
  var tutor = {
    fn: null, mode: null, ready: false, open: false, busy: false,
    turns: [], quote: "", ctl: null, denied: false, docked: true
  };

  // Docking is a per-viewer convenience, so browser storage is the right home for it
  // and the page must render correctly when storage is unavailable.
  // Dock wherever a rail fits. Below this the panel floats, and a scrim goes behind it
  // so it reads as an overlay rather than two pages printed on top of each other.
  var DOCK_MQ = window.matchMedia ? window.matchMedia("(min-width: 940px)") : { matches: false };
  try {
    var saved = window.localStorage.getItem("cp-tutor-dock");
    if (saved === "0") tutor.docked = false;
  } catch (e) { /* private window, blocked storage: keep the default */ }

  function saveDock() {
    try { window.localStorage.setItem("cp-tutor-dock", tutor.docked ? "1" : "0"); } catch (e) { /* ignore */ }
  }
  function isDocked() { return tutorVisible() && tutor.docked && DOCK_MQ.matches; }

  var TUTOR = window.CP_TUTOR;   // standing instructions and context wording live in tutor.js

  function todayLong() {
    return new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }

  /* The student's own roadmap and progress, so "what should I do next" gets a real answer. */
  function roadmapSummary(u, r) {
    if (!r) return "";
    var lines = [];
    var done = r.skills.filter(function (x) { return prog(u, x.id).stars >= JOB_READY; }).length;
    lines.push("Roadmap: " + r.name + ", " + done + " of " + r.skills.length + " sub-modules job-ready (3 stars or more).");
    var list = function (arr) {
      return arr.map(function (x) {
        var st = prog(u, x.id).stars;
        return x.name + " (" + (st ? st + "\u2605" : "not started") + ")";
      }).join("; ");
    };
    if (r.tracks && r.tracks.length) {
      r.tracks.forEach(function (t, i) {
        var ts = trackStatus(u, r, t);
        lines.push("Main module " + (i + 1) + ", " + t.name + (t.cert ? (ts.certified ? " [certificate earned]" : ts.eligible ? " [ready for the module exam]" : "") : "") +
          ": " + list(skillsOfTrack(r, t, false)));
      });
    } else {
      lines.push("Sub-modules: " + list(r.skills));
    }
    return lines.join("\n").slice(0, 5000);
  }

  function tutorContext() {
    var u = actor();
    if (!u) return TUTOR.context({ signedIn: false });
    var r = role(u.roleId);
    var n = state.route.name;
    var s = state.route.skill ? skill(u.roleId, state.route.skill) : null;
    var info = { signedIn: true, roleName: r && r.name, roleTagline: r && r.tagline, roadmap: r ? roadmapSummary(u, r) : "",
                 onRoadmap: n === "roadmap" || n === "roles" };
    if (s) {
      var p = prog(u, s.id);
      info.skillName = s.name; info.lens = s.lens;
      info.level = p.stars ? p.stars + " of 5 stars, " + LEVELS[p.stars].label : "not yet assessed";
      if (n === "learn") {
        var l = s.lessons[Math.min(state.lessonIdx, s.lessons.length - 1)];
        info.lessonTitle = l.title; info.lessonBody = l.body;
      }
      if (n === "result" && state.result) info.result = { pct: state.result.pct, label: state.result.award.label };
    }
    return TUTOR.context(info);
  }

  function tutorBlocked() { return ["assess", "challenge", "mexam"].indexOf(state.route.name) > -1; }

  function tutorVisible() {
    if (!tutor.ready || tutor.denied) return false;
    var u = me();
    if (!u) return false;
    return u.role === "student" || !!state.preview;
  }

  function tmd(text) {
    var html = "";
    String(text).split(/```/).forEach(function (seg, i) {
      if (i % 2) {
        html += "<pre>" + esc(seg.replace(/^[a-z]*\n/i, "").replace(/\n+$/, "")) + "</pre>";
      } else {
        seg.split(/\n{2,}/).forEach(function (p) {
          if (!p.trim()) return;
          html += "<p>" + esc(p.trim())
            .replace(/`([^`\n]+)`/g, "<code>$1</code>")
            .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
            .replace(/\n/g, "<br>") + "</p>";
        });
      }
    });
    return html;
  }

  var TUTOR_ERR = {
    // artifact runtime
    not_granted: "You declined access, so the assistant is off for this page. Reload to be asked again.",
    sampling_disabled: "The assistant is not available on this account.",
    session_expired: "Your session expired. Sign in again and reload.",
    refused: "The model would not answer that one. Try asking it a different way.",
    prompt_too_large: "That is too much text to send at once. Select a smaller piece.",
    // shared
    rate_limited: "Too many questions at once, or the account is out of quota. Try again in a moment.",
    empty_completion: "No answer came back. Try asking for less at a time.",
    cancelled: "",
    upstream_error: "Something went wrong reaching the model. Try again.",
    // /api/ask
    no_backend: "The assistant needs its server function. On a deployment, check that api/ask is present.",
    no_key: "The server has no API key configured. Add OPENAI_API_KEY in the hosting settings and redeploy.",
    bad_key: "The API key was rejected. Check OPENAI_API_KEY in the hosting settings.",
    no_quota: "The API account is out of credit. Add credit to the provider account and try again.",
    bad_model: "The configured model is not available to this API account.",
    too_large: "That is too much text to send at once. Select a smaller piece.",
    upstream_unreachable: "Could not reach the model provider. Check the connection and try again.",
    bad_request: "The assistant sent a malformed request. Reload the page."
  };

  /* For a misconfiguration the server's own message names the exact fix, which is more
     use than generic copy while a deployment is being set up. */
  var TUTOR_SHOW_DETAIL = ["no_key", "bad_key", "no_quota", "bad_model", "rate_limited", "upstream_error"];

  function tutorErrCopy(code, message) {
    if (TUTOR_SHOW_DETAIL.indexOf(code) > -1 && message) return message;
    return TUTOR_ERR[code] || TUTOR_ERR.upstream_error;
  }

  /* ---- backend: the artifact runtime ---- */

  function askClaude(o) {
    var input = [{ role: "user", content: o.rules }];
    o.convo.forEach(function (t) { input.push({ role: t.role, content: t.content }); });
    if (input[input.length - 1].role !== "user") {
      input.push({ role: "user", content: o.convo[o.convo.length - 1].content });
    }
    return tutor.fn(input, {
      cache: false, modelTier: "default", signal: o.signal, onText: o.onText
    });
  }

  /* ---- backend: /api/ask ---- */

  function askApi(o) {
    return fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rules: o.rules, messages: o.convo }),
      signal: o.signal
    }).catch(function (e) {
      if (e && e.name === "AbortError") throw { code: "cancelled", message: "stopped" };
      throw { code: "upstream_unreachable", message: String(e && e.message || e) };
    }).then(function (res) {
      if (!res.ok) {
        if (res.status === 404) throw { code: "no_backend", message: "api/ask not found" };
        return res.json().catch(function () { return null; }).then(function (j) {
          var err = (j && j.error) || {};
          throw { code: err.code || "upstream_error", message: err.message || ("HTTP " + res.status) };
        });
      }
      var ctype = res.headers.get("content-type") || "";
      if (ctype.indexOf("text/event-stream") === -1 || !res.body) {
        return res.json().catch(function () { return null; }).then(function (j) {
          var t = j && (j.text ||
            (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content));
          if (!t) throw { code: "empty_completion", message: "no text" };
          if (o.onText) o.onText({ text: t, delta: t });
          return { text: t, truncated: false };
        });
      }
      return readStream(res.body, o);
    });
  }

  function readStream(body, o) {
    var reader = body.getReader();
    var decoder = new TextDecoder();
    var buffer = "", text = "";

    function pump() {
      return reader.read().then(function (chunk) {
        if (chunk.done) {
          if (!text.trim()) throw { code: "empty_completion", message: "no text" };
          return { text: text, truncated: false };
        }
        buffer += decoder.decode(chunk.value, { stream: true });
        var lines = buffer.split("\n");
        buffer = lines.pop();
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (line.indexOf("data:") !== 0) continue;
          var payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          var ev = null;
          try { ev = JSON.parse(payload); } catch (e) { continue; }
          if (ev.error) throw { code: "upstream_error", message: String(ev.error), text: text };
          if (ev.delta) {
            text += ev.delta;
            if (o.onText) o.onText({ text: text, delta: ev.delta });
          }
        }
        return pump();
      }, function (e) {
        if (o.signal && o.signal.aborted) throw { code: "cancelled", message: "stopped", text: text };
        throw { code: "upstream_error", message: String(e && e.message || e), text: text };
      });
    }
    return pump();
  }

  function askModel(o) {
    if (tutor.mode === "claude") return askClaude(o);
    return askApi(o);
  }

  function tutorLog() {
    var log = document.getElementById("tutor-log");
    if (!log) return;

    if (tutorBlocked()) {
      var isCh = state.route.name === "challenge";
      log.innerHTML = '<div class="t-locked"><b>The assistant is off during ' + (isCh ? "the weekly challenge" : "an assessment") + '.</b>' +
        (isCh ? "The challenge is scored on your own answer. The assistant is available again on the other pages."
              : "Your stars are meant to show what you know without help. Finish the assessment and the assistant " +
                "comes back, including an explanation of anything you got wrong.") + "</div>";
      return;
    }

    if (!tutor.turns.length) {
      log.innerHTML = '<div class="t-empty"><b>Ask about what you are reading.</b>' +
        "Select any text in the module and choose Ask about this, or type a question below.</div>";
      return;
    }

    log.innerHTML = tutor.turns.map(function (t) {
      if (t.role === "user") {
        return '<div class="t-msg you">' +
          (t.quote ? '<span class="t-quote">' + esc(t.quote.slice(0, 240)) + "</span>" : "") +
          esc(t.display || t.content) + "</div>";
      }
      if (t.error) return '<div class="t-msg err">' + esc(t.content) + "</div>";
      return '<div class="t-msg bot">' + (t.content ? tmd(t.content) : "<p><i>Thinking...</i></p>") + "</div>";
    }).join("");
    log.scrollTop = log.scrollHeight;
  }

  function updateTutor() {
    var wrap = document.getElementById("tutor");
    if (!wrap) return;
    var visible = tutorVisible();
    wrap.hidden = !visible;
    if (!visible) tutor.open = false;

    var launch = document.getElementById("tutor-launch");
    var panel = document.getElementById("tutor-panel");
    var blocked = tutorBlocked();
    var docked = isDocked();

    document.body.classList.toggle("tutor-docked", docked);
    panel.classList.toggle("docked", docked);

    launch.hidden = docked || tutor.open;
    launch.className = blocked ? "locked" : "";
    document.getElementById("tutor-launch-label").textContent = blocked ? "Assistant off" : "Ask";
    launch.setAttribute("aria-expanded", String(tutor.open || docked));

    panel.hidden = !(docked || tutor.open);
    document.getElementById("tutor-scrim").hidden = !(tutor.open && !docked);
    document.getElementById("tutor-dock").hidden = docked || !DOCK_MQ.matches;
    document.getElementById("tutor-undock").hidden = !docked;
    document.getElementById("tutor-close").hidden = docked;

    if (!panel.hidden) {
      var u = actor();
      var s = state.route.skill && u ? skill(u.roleId, state.route.skill) : null;
      document.getElementById("tutor-sub").textContent = s ? s.name : "";
      document.getElementById("tutor-foot").hidden = blocked;
      tutorLog();
      renderQuote();
    }
  }

  function renderQuote() {
    var box = document.getElementById("tutor-quote");
    if (!box) return;
    box.hidden = !tutor.quote;
    if (tutor.quote) document.getElementById("tutor-quote-text").textContent = tutor.quote;
  }

  function openTutor(quote) {
    if (!tutorVisible()) return;
    if (quote) tutor.quote = quote;
    tutor.open = true;
    updateTutor();
    var input = document.getElementById("tutor-input");
    if (input && !tutorBlocked()) input.focus();
  }

  function tutorSetBusy(on) {
    tutor.busy = on;
    var send = document.getElementById("tutor-send");
    var stop = document.getElementById("tutor-stop");
    if (send) { send.disabled = on; send.textContent = on ? "Asking" : "Ask"; }
    if (stop) stop.hidden = !on;
  }

  function tutorAsk(question, quote, displayAs) {
    if (!tutor.ready || tutor.busy || tutorBlocked()) return;
    var q = String(question || "").trim();
    if (!q) return;

    tutor.turns.push({ role: "user", content: q, quote: quote || "", display: displayAs || "" });
    var slot = { role: "assistant", content: "" };
    tutor.turns.push(slot);
    tutorLog();
    tutorSetBusy(true);

    // Standing instructions are sent separately; only the last few exchanges follow.
    var convo = tutor.turns.slice(0, -1)              // drop the empty slot being filled
      .filter(function (t) { return t.content && !t.error; })
      .slice(-8)
      .map(function (t) {
        return {
          role: t.role,
          content: t.quote ? 'About this text:\n"' + t.quote + '"\n\n' + t.content : t.content
        };
      });

    tutor.ctl = new AbortController();
    askModel({
      rules: TUTOR.rules(todayLong()) + tutorContext(),
      convo: convo,
      signal: tutor.ctl.signal,
      onText: function (u) { slot.content = u.text; tutorLog(); }
    }).then(function (res) {
      slot.content = res.text;
      tutorSetBusy(false);
      tutorLog();
    }).catch(function (e) {
      var code = (e && e.code) || "upstream_error";
      if (code === "cancelled") {
        slot.content = e.text || "";
        if (!slot.content) tutor.turns.splice(tutor.turns.indexOf(slot), 1);
      } else if (e && e.text) {
        slot.content = e.text;
        tutor.turns.push({ role: "assistant", content: tutorErrCopy(code, e && e.message), error: true });
      } else {
        slot.content = tutorErrCopy(code, e && e.message);
        slot.error = true;
      }
      // Hide the feature only when the viewer themselves has refused it or the platform
      // cannot serve it. A misconfigured deployment must stay visible: hiding the panel
      // also hides the message that says how to fix it, which is the worst moment to
      // disappear. Those errors are shown and the panel stays open.
      if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled",
           "capability_removed", "session_expired"].indexOf(code) > -1) {
        tutor.denied = true;
      }
      tutorSetBusy(false);
      tutorLog();
      updateTutor();
    });

    tutor.quote = "";
    renderQuote();
  }

  function initTutor() {
    // Served over http(s) outside claude.ai, the server function is the backend.
    function fallBackToApi() {
      if (/^https?:$/.test(window.location.protocol)) {
        tutor.mode = "api";
        tutor.ready = true;
      } else {
        tutor.mode = null;
        tutor.ready = false;      // opened as a local file: no backend, hide the feature
      }
      updateTutor();
    }

    if (window.claude && typeof window.claude.use === "function") {
      window.claude.use("sample").then(function (fn) {
        if (fn) {
          tutor.fn = fn;
          tutor.mode = "claude";
          tutor.ready = true;
          updateTutor();
        } else {
          fallBackToApi();
        }
      }).catch(fallBackToApi);
    } else {
      fallBackToApi();
    }

    document.getElementById("tutor-launch").addEventListener("click", function () { openTutor(); });

    document.getElementById("tutor").addEventListener("click", function (ev) {
      var el = ev.target.closest("[data-tutor]");
      if (!el) return;
      var what = el.dataset.tutor;
      if (what === "close") { tutor.open = false; updateTutor(); }
      if (what === "clear") { tutor.turns = []; tutor.quote = ""; updateTutor(); }
      if (what === "unquote") { tutor.quote = ""; renderQuote(); }
      if (what === "dock") { tutor.docked = true; tutor.open = false; saveDock(); updateTutor(); }
      if (what === "undock") { tutor.docked = false; tutor.open = false; saveDock(); updateTutor(); }
    });

    if (DOCK_MQ.addEventListener) DOCK_MQ.addEventListener("change", updateTutor);
    else if (DOCK_MQ.addListener) DOCK_MQ.addListener(updateTutor);

    document.getElementById("tutor-stop").addEventListener("click", function () {
      if (tutor.ctl) tutor.ctl.abort();
    });

    document.getElementById("tutor-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var input = document.getElementById("tutor-input");
      var q = input.value.trim();
      if (!q) return;
      input.value = "";
      tutorAsk(q, tutor.quote);
    });

    document.getElementById("tutor-input").addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        document.getElementById("tutor-form").dispatchEvent(new Event("submit", { cancelable: true }));
      }
    });

    // Select text anywhere in the page body to ask about that specific passage.
    var selBtn = document.getElementById("sel-ask");
    var pending = "";

    function hideSel() { selBtn.hidden = true; pending = ""; }

    function checkSelection() {
      if (!tutorVisible() || tutorBlocked()) return hideSel();
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return hideSel();
      var text = sel.toString().trim();
      if (text.length < 3 || text.length > 1200) return hideSel();
      var node = sel.anchorNode;
      var host = node && (node.nodeType === 1 ? node : node.parentElement);
      if (!host || !host.closest("#view")) return hideSel();

      var rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect.width && !rect.height) return hideSel();
      pending = text;
      selBtn.hidden = false;
      var rightEdge = window.innerWidth - (isDocked() ? 360 : 0);
      var top = Math.min(rect.bottom + 8, window.innerHeight - 44);
      var left = Math.min(Math.max(8, rect.left), rightEdge - 150);
      selBtn.style.top = top + "px";
      selBtn.style.left = left + "px";
    }

    document.addEventListener("mouseup", function () { setTimeout(checkSelection, 0); });
    document.addEventListener("touchend", function () { setTimeout(checkSelection, 0); });
    document.addEventListener("scroll", hideSel, true);
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") hideSel(); });

    selBtn.addEventListener("mousedown", function (ev) { ev.preventDefault(); });
    selBtn.addEventListener("click", function () {
      var text = pending;
      hideSel();
      if (text) openTutor(text);
    });
  }

  // Result-page shortcut: explain a question the student got wrong.
  actions["tutor-explain"] = function (el) {
    var u = actor();
    var s = skill(u.roleId, state.result.skillId);
    var i = +el.dataset.i;
    var q = (state.result.qs || s.assessment)[i];
    var chose = state.result.answers[i];
    openTutor();
    tutorAsk(
      "I just got this assessment question wrong and I want to understand why.\n\n" +
      "Question: " + q.q + "\n" +
      q.opts.map(function (o, j) { return "ABCD"[j] + ") " + o; }).join("\n") + "\n\n" +
      "I chose " + "ABCD"[chose] + ". The correct answer is " + "ABCD"[resKey(state.result, i, q)] + ".\n\n" +
      "Explain why my answer is wrong and why the correct one is right, for my target role. " +
      "Then give me one short way to remember it.",
      "",
      "Why was my answer to question " + (i + 1) + " wrong?"
    );
  };

  /* Start-up: find out whether real accounts are on, then draw. With them off (the Claude artifact,
     local tests) the page is the browser-only demo, exactly as before. */
  CP_AUTH.init().then(function (r) {
    REAL = !!r.enabled;
    seed();
    loadAccounts();
    ensureVersioning();
    if (REAL) {
      if (r.link === "recovery") state.authTab = "reset";
      else if (r.link === "error") state.authError = r.linkError || "That link is no longer valid.";
      if (r.session && r.link !== "recovery") { initTutor(); return startSession(); }
    }
    render();
    initTutor();
  });
})();
