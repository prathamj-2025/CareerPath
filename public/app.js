/* CareerPath prototype.
   Two roles share one application: students learn and get assessed, admins manage
   content. All state is in memory for the session. */
(function () {
  "use strict";

  // The CareerPath mark: a mortarboard. Drawn in currentColor so it follows the surface it sits on.
  var CAP = '<svg viewBox="0 0 32 32" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 7 28 13 16 19 4 13Z"/><path d="M9 16.5v5.2c0 2.2 3.1 4 7 4s7-1.8 7-4v-5.2"/><path d="M28 13v7"/></svg>';


  var ROLES = window.CP_ROLES;
  var LEVELS = window.CP_LEVELS;
  var SCHOOLS = ["USC", "UCLA", "NYU", "Georgia Tech", "UT Austin", "University of Michigan"];
  var MAJORS = ["Engineering Management", "Computer Science", "Business Administration",
                "Industrial Engineering", "Economics", "Data Science", "Information Systems"];

  var STAR = "&#9733;";

  /* ---------------- state ---------------- */

  var state = {
    users: [],
    userId: null,
    route: { name: "roadmap" },
    authTab: "login",
    authError: "",
    lessonIdx: 0,
    practiceState: {},    // key -> { hints revealed, answer shown, learner's attempt }
    quiz: null,
    exam: null,
    result: null,
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
      challenges: o.challenges || {}     // cid -> submission
    };
  }

  function prog(user, skillId) {
    if (!user.progress[skillId]) {
      user.progress[skillId] = { stars: 0, best: 0, attempts: 0, project: false, lessonsDone: [], history: [] };
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

  function levelFor(pct) {
    var lv = LEVELS[0];
    LEVELS.forEach(function (l) { if (pct >= l.min) lv = l; });
    return lv;
  }

  function awardFor(pct, projectDone) {
    var lv = levelFor(pct);
    if (lv.stars === 5 && !projectDone) return { stars: 4, label: LEVELS[4].label, capped: true };
    return { stars: lv.stars, label: lv.label, capped: false };
  }

  function starHTML(n, size) {
    var s = '<span class="stars"' + (size ? ' style="font-size:' + size + '"' : "") + ">";
    for (var i = 1; i <= 5; i++) s += i <= n ? STAR : '<span class="off">' + STAR + "</span>";
    return s + "</span>";
  }

  function totalStars(user) {
    var r = role(user.roleId); if (!r) return 0;
    return r.skills.reduce(function (a, s) { return a + prog(user, s.id).stars; }, 0);
  }
  function maxStars(user) { var r = role(user.roleId); return r ? r.skills.length * 5 : 0; }
  function verifiedCount(user) {
    var r = role(user.roleId); if (!r) return 0;
    return r.skills.filter(function (s) { return prog(user, s.id).stars > 0; }).length;
  }
  function certsFor(user) {
    var r = role(user.roleId); if (!r) return [];
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
  function words(text) {
    return String(text || "").trim().split(/\s+/).filter(Boolean).length;
  }
  // Weeks are numbered from the start of the programme, not the calendar.
  function nextWeek() {
    return CHALLENGES.reduce(function (a, c) { return Math.max(a, c.week); }, 0) + 1;
  }

  /* Rule-based scoring. Each criterion is a pattern describing what a good answer
     has to raise. This reports whether an idea was raised, not how well it was
     argued, and the UI says so. */
  function scoreChallenge(c, text) {
    var n = words(text);
    var met = c.rubric.map(function (r) {
      var re;
      try { re = new RegExp(r.re, "i"); } catch (e) { re = null; }
      return !!re && re.test(text);
    });
    var hit = met.filter(Boolean).length;
    var pct = Math.round(hit / c.rubric.length * 100);
    var short = n < c.minWords;
    if (short) pct = Math.min(pct, 40);
    return { pct: pct, met: met, hit: hit, of: c.rubric.length, words: n, short: short };
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
     The board updates on screen without a reload. There is no shared backend in
     this prototype, so peer activity is generated on a timer here and the UI says
     that in plain words rather than implying the numbers are real. In the product
     this is a subscription to the same rows every other open page is watching. */

  var live = { timer: null, flash: {}, feed: [], chFeed: [] };
  var LIVE_ROUTES = ["roadmap", "leaderboard", "challenge"];

  function startLive() {
    if (live.timer) return;
    live.timer = window.setInterval(liveTick, 4200);
  }
  function stopLive() {
    if (live.timer) { window.clearInterval(live.timer); live.timer = null; }
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
    if (!live.feed.length) return '<span class="tiny muted">Waiting for the next result.</span>';
    return live.feed.map(function (e, i) {
      return '<div class="feed-row' + (i === 0 ? " new" : "") + '"><span class="feed-dot"></span>' +
        "<span>" + esc(e.name.split(" ")[0]) + " reached " + e.stars + STAR + " in " + esc(e.skill) + "</span></div>";
    }).join("");
  }

  function peersOf(user) {
    return state.users.filter(function (u) {
      return u.role === "student" && u.school === user.school && u.roleId === user.roleId;
    }).sort(function (a, b) { return b.points - a.points || totalStars(b) - totalStars(a); });
  }

  function boardHTML(user, compact) {
    var rows = peersOf(user);
    if (compact) rows = rows.slice(0, 6);
    return '<table class="grid">' +
      "<thead><tr><th></th><th>Student</th>" + (compact ? "" : "<th>Stars</th><th>Verified skills</th>") +
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
            '<td class="mono">' + verifiedCount(u) + " / " + role(u.roleId).skills.length + "</td>") +
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
    return '<p class="tiny muted">Peer results in this prototype are generated on a timer, because there is no ' +
      "shared backend yet. In the product this is a live subscription, so every open page sees the same row change " +
      "at the same moment.</p>";
  }

  /* ---------------- seed ---------------- */

  function seed() {
    var student = newUser({
      name: "Pratham Jain", email: "student@careerpath.com", password: "student", role: "student",
      school: "USC", major: "Engineering Management", gradYear: "2027", roleId: "pm"
    });
    student.progress["sql-pm"] = { stars: 3, best: 80, attempts: 2, project: false, lessonsDone: [0, 1, 2, 3],
      history: [{ pct: 60, stars: 1, when: "Sep 12, 2026" }, { pct: 80, stars: 3, when: "Sep 18, 2026" }] };
    student.progress["metrics-pm"] = { stars: 2, best: 70, attempts: 1, project: false, lessonsDone: [0, 1],
      history: [{ pct: 70, stars: 2, when: "Sep 16, 2026" }] };
    student.points = 500;
    state.users.push(student);

    state.users.push(newUser({
      name: "Dana Whitfield", email: "admin@careerpath.com", password: "admin", role: "admin",
      title: "Content Manager", school: "CareerPath", major: "", gradYear: ""
    }));

    var classmates = [
      ["Priya Chavan", "USC", "pm", 1400, 5, 80], ["Marcus Webb", "USC", "pm", 1100, 4, 60],
      ["Ana Ruiz", "USC", "pm", 900, 4, 100], ["Dev Patel", "USC", "pm", 400, 2, 0],
      ["Sarah Kim", "USC", "pm", 300, 2, 40], ["Tom Alvarez", "USC", "pm", 200, 1, 0],
      ["Jing Liu", "USC", "ba", 1250, 5, 80], ["Noor Hassan", "USC", "ba", 800, 3, 60],
      ["Ellie Brandt", "USC", "da", 1500, 5, 75], ["Raj Menon", "UCLA", "pm", 1600, 5, 0]
    ];
    classmates.forEach(function (c) {
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
    student.resume = { name: "PrathamJain_Resume.pdf", chars: 2410, kind: "pdf",
      skills: ["sql-pm", "metrics-pm", "prd-pm", "experimentation-pm", "sql-ba", "python-da", "viz-da"],
      roles: { pm: ["product manager"] }, when: "Sep 12, 2026" };
    student.placement = { answered: 8, total: 8, when: "Sep 12, 2026",
      perRole: { pm: { weight: 19, points: 6, signal: 1 }, ba: { weight: 9, points: 2, signal: 0.47 },
                 da: { weight: 7, points: 1, signal: 0.37 }, fa: { weight: 3, points: 0, signal: 0.16 } } };
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
  function paras(text) {
    return text.split("\n\n").map(function (p) {
      if (/^(SELECT|WITH)/.test(p.trim())) return "<pre>" + esc(p) + "</pre>";
      return "<p>" + esc(p) + "</p>";
    }).join("");
  }
  function go(name, params) {
    state.route = Object.assign({ name: name }, params || {});
    window.scrollTo(0, 0);
    render();
  }
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
        '<div class="brand"><div class="brand-mark">' + CAP + '</div><div class="brand-name">career<span>path</span></div></div>' +
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
        (isSignup ? signupForm() : loginForm()) +
        (state.authError ? '<p class="err" style="margin-top:12px">' + esc(state.authError) + "</p>" : "") +
        (isSignup ? "" : credCards()) +
      "</div></div>";
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
    return '<div class="stack" style="gap:12px">' +
      '<div class="field"><label for="su-name">Full name</label><input id="su-name" placeholder="Alex Rivera"></div>' +
      '<div class="field"><label for="su-email">Email</label><input id="su-email" type="email" placeholder="alex@usc.edu"></div>' +
      '<div class="field"><label for="su-pass">Password</label><input id="su-pass" type="password" placeholder="At least 4 characters"></div>' +
      '<div class="auth-grid">' +
        '<div class="field"><label for="su-school">School</label><select id="su-school">' +
          SCHOOLS.map(function (s) { return "<option>" + esc(s) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label for="su-year">Graduation</label><select id="su-year">' +
          ["2026", "2027", "2028", "2029"].map(function (y) { return "<option>" + y + "</option>"; }).join("") + "</select></div>" +
      "</div>" +
      '<div class="field"><label for="su-major">Major</label><select id="su-major">' +
        MAJORS.map(function (m) { return "<option>" + esc(m) + "</option>"; }).join("") + "</select></div>" +
      '<button class="btn primary" style="margin-top:6px;justify-content:center" data-action="signup">Create student account</button>' +
      '<p class="tiny muted">Sign-up creates a student account. Admin accounts are provisioned by the platform team.</p>' +
    "</div>";
  }

  function loginForm() {
    return '<div class="stack" style="gap:12px">' +
      '<div class="field"><label for="li-email">Email</label><input id="li-email" type="email" value="student@careerpath.com"></div>' +
      '<div class="field"><label for="li-pass">Password</label><input id="li-pass" type="password" value="student"></div>' +
      '<button class="btn primary" style="margin-top:6px;justify-content:center" data-action="login">Sign in</button>' +
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
      if (n.id === "roadmap" && user.roleId) count = verifiedCount(user) + "/" + role(user.roleId).skills.length;
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
    if (["skill", "learn", "assess", "result", "roles"].indexOf(n) > -1) return "roadmap";
    if (n.indexOf("onb-") === 0) return "roadmap";
    if (n === "cert") return "certs";
    if (n === "a-bank" || n === "a-lessons") return "a-content";
    if (n === "a-student") return "a-students";
    if (n === "a-review") return "a-drafts";
    return n;
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
        '<div class="brand"><div class="brand-mark">' + CAP + '</div><div class="brand-name">career<span>path</span></div></div>' +
        '<span class="bar-context">' + context + "</span>" +
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

    document.getElementById("mobilebar").innerHTML =
      '<div class="mb-top">' +
        '<div class="brand"><div class="brand-mark">' + CAP + '</div><div class="brand-name">career<span>path</span></div></div>' +
        '<div class="row" style="gap:4px">' +
          '<span class="pill mono">' + (admin ? "Admin" : user.points + " pts") + "</span>" +
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
     Every step is skippable. The recommendation is advice: the student can pick
     any roadmap from the same screen regardless of what it says. */

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
          "<div><h3 style=\"font-size:15px\">What we read</h3>" +
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
          '<button class="btn primary" data-action="onb-to-placement">Continue to the questions &rarr;</button>' +
          '<button class="btn ghost" data-action="onb-skip">Skip and choose a roadmap myself</button>' +
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
            '<button class="btn sm ghost" data-action="onb-skip">Skip this step</button></div>') +
      "</div>" +
      '<div class="explain">' +
        '<div><b>1. Your resume is not stored</b><p>It is read in your browser. When the ranking is ' +
          "written, the text is sent once to the AI provider and then dropped.</p></div>" +
        '<div><b>2. Ten short questions</b><p>Six about how you like to work, four with a best ' +
          "answer. About a minute.</p></div>" +
        '<div><b>3. The roadmaps get ranked</b><p>From your resume and your answers, with a reason ' +
          "for each. You can still pick any of the four.</p></div>" +
      "</div>";
    }

    return '<div class="page-head"><div class="eyebrow">Step 1 of 3</div><h1>Upload your resume</h1>' +
        '<p class="sub">CareerPath reads your resume to see what you have already worked with, then asks ten short ' +
        "questions about how you like to work. You can skip either and pick a roadmap yourself.</p></div>" +
      '<div class="onb-steps">' + onbSteps(1) + "</div>" + body;
  }

  // The three steps are controls, not a label. Anything already done, and the
  // recommendation once it exists, can be opened again to change an answer.
  function onbSteps(at) {
    var o = state.onb || {};
    var reachable = function (n) {
      if (n === at) return false;
      if (n === 1) return true;
      if (n === 2) return !!(o.detect || o.items || at === 3);
      return !!(o.rec && o.rec.length);
    };
    return ["Resume", "A few questions", "Recommendation"].map(function (l, i) {
      var n = i + 1;
      var inner = '<b class="mono">' + (n < at ? "&#10003;" : n) + "</b>" + esc(l);
      var attrs = ' aria-current="' + (n === at) + '" data-done="' + (n < at) + '"';
      return reachable(n)
        ? '<button type="button" class="onb-step go" data-action="onb-step" data-step="' + n + '"' + attrs +
            ' aria-label="Go to step ' + n + ", " + esc(l) + '">' + inner + "</button>"
        : '<span class="onb-step"' + attrs + ">" + inner + "</span>";
    }).join("");
  }

  function viewOnbPlacement(user) {
    var o = state.onb;
    var items = o.items || [];

    if (!items.length) {
      return '<div class="page-head"><div class="eyebrow">Step 2 of 3</div><h1>Placement test</h1></div>' +
        '<div class="card"><p class="muted">There are no questions to ask yet.</p>' +
        '<button class="btn sm primary" style="margin-top:12px" data-action="onb-skip">Choose a roadmap</button></div>';
    }

    if (o.idx >= items.length) {
      var got = items.filter(function (it, i) { return it.kind === "best" && o.answers[i] === it.best; }).length;
      var bests = items.filter(function (it) { return it.kind === "best"; }).length;

      return '<div class="page-head"><div class="eyebrow">Step 2 of 3</div><h1>Answers recorded</h1>' +
          '<p class="sub">These go to the model along with what your resume mentioned, and it ranks the four ' +
          "roadmaps for you. Nothing here touches a star, a certificate or the leaderboard.</p></div>" +
        '<div class="onb-steps">' + onbSteps(2) + "</div>" +
        '<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:12px">' +
          '<h3 style="font-size:15px">What you picked</h3>' +
          '<span class="tiny muted">' + got + " of " + bests + " best answers</span></div>" +
          '<div class="stack" style="gap:11px">' + items.map(function (it, i) {
            var opt = it.opts[o.answers[i]];
            var mark = "";
            if (it.kind === "best") {
              mark = o.answers[i] === it.best
                ? ' <span class="pill ok">Best answer</span>'
                : ' <span class="pill warn">Best was: ' + esc(it.opts[it.best].t) + "</span>";
            }
            return '<div class="picked"><span class="tiny muted">' + esc(it.q) + "</span>" +
              "<b>" + esc(opt ? opt.t : "&mdash;") + mark + "</b></div>";
          }).join("") + "</div></div>" +
        '<div class="row" style="margin-top:18px">' +
          '<button class="btn primary" data-action="onb-to-recommend">See recommended roadmaps &rarr;</button>' +
          '<button class="btn ghost" data-action="onb-redo-test">Answer them again</button>' +
        "</div>";
    }

    var it = items[o.idx];
    return '<div class="page-head"><div class="eyebrow">Step 2 of 3 &middot; question ' + (o.idx + 1) + " of " + items.length + "</div>" +
        "<h1>A few quick questions</h1>" +
        '<p class="sub">Ten questions, about a minute. Most ask how you like to work and have no right answer. ' +
        "Four of them do have a best answer, and those say so. Nothing here is scored against you.</p></div>" +
      '<div class="onb-steps">' + onbSteps(2) + "</div>" +
      '<div class="progress-head"><span>' +
        (it.kind === "best"
          ? '<span class="pill warn">One best answer</span>'
          : '<span class="pill">No right answer</span>') + "</span>" +
        '<span class="mono tiny">' + (o.idx + 1) + " / " + items.length + "</span></div>" +
      '<div class="bar" style="margin-bottom:18px"><span style="width:' + Math.round(o.idx / items.length * 100) + '%"></span></div>' +
      '<div class="q-card"><p class="q-stem">' + esc(it.q) + "</p>" +
        '<div class="opts">' + it.opts.map(function (opt, i) {
          return '<button class="opt" data-action="onb-answer" data-i="' + i + '">' +
            '<span class="key">' + "ABCD".charAt(i) + "</span><span>" + esc(opt.t) + "</span></button>";
        }).join("") + "</div></div>" +
      '<div class="row" style="margin-top:16px">' +
        (o.idx > 0 ? '<button class="btn sm" data-action="onb-back">&larr; Back</button>' : "") +
        '<button class="btn sm ghost" data-action="onb-skip">Skip these</button></div>';
  }

  function viewOnbRecommend(user) {
    var o = state.onb;
    var rec = o.rec || [];
    var spread = rec.length ? rec[0].score - rec[rec.length - 1].score : 0;

    var byModel = o.by === "model";

    return '<div class="page-head"><div class="eyebrow">Step 3 of 3</div><h1>Recommended roadmaps</h1>' +
        '<p class="sub">Ranked from what your resume mentioned and how you answered. This is advice, not a gate. ' +
        "Pick any roadmap on this page and you get the full thing.</p></div>" +
      '<div class="onb-steps">' + onbSteps(3) + "</div>" +
      '<div class="rank-by">' +
        (o.busy
          ? '<span class="pill warn">Reading your answers&hellip;</span>' +
            '<span class="tiny muted">Showing the rule-based ranking until the model answers.</span>'
          : byModel
            ? '<span class="pill ok">Ranked by the model</span>' +
              '<span class="tiny muted">It read your resume matches and all ten answers.</span>'
            : '<span class="pill">Ranked by the scoring rules</span>' +
              '<span class="tiny muted">' +
              (o.rankErr ? esc(o.rankErr) : "The model was not reachable, so the fixed weights produced this.") +
              "</span>" +
              (tutor.ready && !tutor.denied
                ? ' <button class="btn sm" data-action="onb-rerank">Try the model again</button>' : "")) +
      "</div>" +
      (spread < 12 && !byModel
        ? '<div class="card" style="margin-bottom:16px;border-color:var(--warn)"><p class="tiny">' +
          "<b>These four are close together.</b> Your resume and your answers did not point clearly at one roadmap, " +
          "so choose the role you actually want rather than the one at the top.</p></div>"
        : "") +
      '<div class="stack" style="gap:12px">' + rec.map(function (x, i) {
        return '<div class="rec-card' + (i === 0 ? " lead" : "") + '">' +
          '<div class="rec-head"><div>' +
            (i === 0 ? '<span class="pill accent">Best match</span> ' : "") +
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
            '<h3 style="font-size:14px">Reviewer feedback</h3><span class="pill">' +
            (sub.source === "ai" ? "AI" : "Rule-based") + "</span></div>" +
            '<div class="prose tiny">' + tmd(sub.feedback) + "</div></div>"
          : '<div class="row" style="margin-top:12px">' +
            '<button class="btn sm" data-action="ch-feedback"' + (st && st.busy ? " disabled" : "") + ">" +
            (st && st.busy ? "Asking the reviewer&hellip;" : "Get written feedback") + "</button>" +
            (st && st.err ? '<span class="err tiny">' + esc(st.err) + "</span>" : "") + "</div>") +
        '<div class="card" style="margin-top:12px"><h3 style="font-size:14px;margin-bottom:8px">Your answer</h3>' +
          '<p class="tiny muted" style="white-space:pre-wrap">' + esc(sub.text) + "</p></div>";
    } else {
      answerBlock = '<div class="field"><label for="ch-text">Your answer</label>' +
          '<textarea id="ch-text" class="ex-input" rows="10" data-ch="1" placeholder="Write your answer here. Minimum ' +
            c.minWords + ' words."></textarea></div>' +
        '<div class="row" style="margin-top:12px">' +
          '<button class="btn primary" data-action="ch-submit" data-cid="' + c.cid + '">Submit answer</button>' +
          '<span class="tiny muted">One submission per challenge. Points are awarded once.</span>' +
        "</div>" +
        (st && st.err ? '<p class="err tiny" style="margin-top:10px">' + esc(st.err) + "</p>" : "");
    }

    return '<div class="page-head"><div class="eyebrow">' + esc(r.name) + " &middot; week " + c.week + "</div>" +
        "<h1>" + esc(c.title) + "</h1></div>" +

      '<div class="roadmap-cols"><div>' +
        '<div class="card" style="margin-bottom:16px">' +
          '<h3 style="font-size:14px;margin-bottom:8px">The brief</h3>' +
          "<p>" + esc(c.brief) + "</p>" +
          '<h3 style="font-size:14px;margin:16px 0 8px">What it is scored on</h3>' +
          '<ul class="crits">' + c.rubric.map(function (rb) {
            return '<li class="crit unmet"><span class="mark">&#9675;</span><span>' + esc(rb.label) + "</span></li>";
          }).join("") + "</ul>" +
          '<p class="tiny muted" style="margin-top:10px">The rubric is shown before you answer on purpose. Hiding it would ' +
          "test guessing rather than the skill.</p>" +
        "</div>" +
        '<div class="card">' + answerBlock + "</div>" +
      "</div>" + challengeAside(user, c) + "</div>";
  }

  /* The challenge board moves as other students submit, for the same reason the school
     board does: a ranking nobody watches change is just a table. */
  function challengeAside(user, c) {
    return '<aside class="rail">' +
      '<div class="side-card">' +
        '<div class="side-head"><span>Challenge leaderboard</span><span class="live-pill"><i></i>Live</span></div>' +
        '<div class="side-board" data-live="chboard" data-cid="' + c.cid + '">' + chBoardHTML(user, c) + "</div>" +
        '<div class="feed" data-live="chfeed">' + chFeedHTML() + "</div>" +
        '<p class="tiny muted" style="margin:0">' + esc(user.school) + " only, on this roadmap. Challenge points are " +
        "separate from your stars.</p>" +
      "</div>" +
    "</aside>";
  }

  function chBoardHTML(user, c) {
    var rows = chSubmissions(c.cid).filter(function (r) { return r.user.school === user.school; });
    if (!rows.length) return '<p class="tiny muted" style="padding:0 14px">No one at your school has submitted yet.</p>';
    return '<table class="grid"><thead><tr><th></th><th>Student</th><th>Score</th></tr></thead><tbody>' +
      rows.map(function (row, i) {
        var cls = (row.user.id === user.id ? "lb-you " : "") + (fresh(row.user.id) ? "lb-move" : "");
        return '<tr class="' + cls.trim() + '">' +
          '<td><span class="rank ' + (i < 3 ? "top" : "") + '">' + (i + 1) + "</span></td>" +
          "<td>" + esc(row.user.name.split(" ")[0] + " " + (row.user.name.split(" ")[1] || "").charAt(0) + ".") +
            (row.user.id === user.id ? ' <span class="pill accent">You</span>' : "") + "</td>" +
          '<td class="mono">' + row.sub.pct + "%</td></tr>";
      }).join("") + "</tbody></table>";
  }

  function chFeedHTML() {
    if (!live.chFeed.length) return '<span class="tiny muted">Waiting for the next submission.</span>';
    return live.chFeed.map(function (e, i) {
      return '<div class="feed-row' + (i === 0 ? " new" : "") + '"><span class="feed-dot"></span>' +
        "<span>" + esc(e.name.split(" ")[0]) + " submitted, scored " + e.pct + "%</span></div>";
    }).join("");
  }

  /* ---------------- student views ---------------- */

  function viewRoles(user) {
    var o = state.onb;
    /* A student who skipped the questions by accident, or changed their mind, needs a
       way back in from here. Without one, skip is a door that only opens outward. */
    var back = null;
    if (o && o.rec) back = { to: "onb-recommend", label: "Back to your recommendations" };
    else if (o && o.items && o.answers && o.answers.length) back = { to: "onb-placement", label: "Back to the questions" };
    else if (o && o.detect) back = { to: "onb-placement", label: "Answer the questions instead", fresh: true };
    else if (o) back = { to: "onb-resume", label: "Back to the resume step" };

    return '<div class="page-head">' +
        (back ? '<button class="btn sm ghost" style="margin-bottom:10px" data-action="onb-resume-flow" ' +
                'data-to="' + back.to + '"' + (back.fresh ? ' data-fresh="1"' : "") +
                ">&larr; " + esc(back.label) + "</button>" : "") +
        '<div class="eyebrow">Step 1</div><h1>Choose your target role</h1>' +
        '<p class="sub">Each role has its own roadmap, its own courses, and its own assessments. The same skill is taught and tested differently depending on the role you are preparing for.</p></div>' +
      '<div class="role-grid">' +
        ROLES.map(function (r) {
          return '<button class="role-card" data-action="pick-role" data-role="' + r.id + '">' +
            '<span class="role-ico" aria-hidden="true">' + esc(initials(r.name)) + "</span>" +
            "<h3>" + esc(r.name) + "</h3><p class=\"tag\">" + esc(r.tagline) + "</p>" +
            '<div class="n">' + r.skills.length + " skills &middot; " +
              r.skills.reduce(function (a, s) { return a + s.assessment.length; }, 0) + " assessment questions</div></button>";
        }).join("") +
      "</div>" +
      (user.roleId ? '<p class="tiny muted" style="margin-top:16px">Switching roles keeps your stars on your current track. Stars are earned per skill within a role, so they do not transfer between roles.</p>' : "") +
      historyOfRoadmaps(user) +
      ((o && o.rec) ? "" :
        '<div class="card" style="margin-top:18px"><div class="row" style="justify-content:space-between">' +
        '<p class="tiny muted">Not sure which one? Upload your resume, answer ten short questions, and ' +
        "CareerPath will rank the four roadmaps for you with a reason for each.</p>" +
        '<button class="btn sm" data-action="onb-open">' +
        (user.resume || user.placement ? "Redo the recommendation" : "Get a recommendation") + "</button></div></div>");
  }

  /* Roadmaps a student has left are kept, never deleted, so the stars earned there
     still mean something and they can go back to that track. */
  function historyOfRoadmaps(user) {
    if (!user.roleHistory.length) return "";
    return '<div class="card" style="margin-top:18px">' +
      '<h3 style="font-size:15px;margin-bottom:4px">Roadmaps you have worked on before</h3>' +
      '<p class="tiny muted" style="margin-bottom:12px">Nothing here was deleted when you switched. Pick one again and ' +
      "your stars on it are exactly where you left them.</p>" +
      '<div class="scroll-x"><table class="grid"><thead><tr><th>Roadmap</th><th>Stars</th><th>Verified</th><th>Left</th><th></th></tr></thead><tbody>' +
      user.roleHistory.map(function (h) {
        return "<tr><td>" + esc(h.name) + '</td><td class="mono">' + h.stars + "</td>" +
          '<td class="mono">' + h.verified + " / " + h.of + '</td><td class="mono tiny">' + esc(h.left) + "</td>" +
          '<td><button class="btn sm" data-action="pick-role" data-role="' + h.roleId + '">Resume</button></td></tr>';
      }).join("") + "</tbody></table></div></div>";
  }

  function viewRoadmap(user) {
    var r = role(user.roleId);
    if (!r) return viewRoles(user);
    var pct = Math.round(totalStars(user) / maxStars(user) * 100);

    return '<div class="page-head"><div class="eyebrow">' + esc(r.name) + " roadmap</div>" +
        "<h1>Your verified skill roadmap</h1>" +
        '<p class="sub">Progress moves only through assessment. Nothing here can be checked off by hand.</p></div>' +
      journeyMap(user, r, pct) +
      '<div class="summary-row">' +
        summaryCell("Verified skills", verifiedCount(user) + "<small> / " + r.skills.length + "</small>") +
        summaryCell("Stars earned", totalStars(user) + "<small> / " + maxStars(user) + "</small>") +
        summaryCell("Roadmap complete", pct + "<small>%</small>") +
        summaryCell("Leaderboard points", String(user.points)) +
      "</div>" +
      '<div class="roadmap-cols"><div>' +
      '<div class="skill-list">' +
        r.skills.map(function (s) {
          var p = prog(user, s.id);
          var status = p.stars === 0 ? '<span class="pill">Not started</span>'
            : '<span class="pill ok">' + LEVELS[p.stars].label + "</span>";
          return '<button class="skill-row" data-action="open-skill" data-skill="' + s.id + '">' +
            '<span><span class="skill-name">' + esc(s.name) + '</span><span class="skill-lens" style="display:block">' + esc(s.lens) + "</span></span>" +
            '<span class="skill-right">' + status + starHTML(p.stars) +
              (p.best ? '<span class="mono tiny muted">' + p.best + "%</span>" : '<span class="mono tiny muted">&mdash;</span>') +
            "</span></button>";
        }).join("") +
      "</div>" +
      '<div class="row" style="margin-top:18px;justify-content:space-between">' +
        '<p class="tiny muted">Stars: ' + STAR + " Foundation &middot; " + STAR + STAR + " Basic application &middot; " +
          STAR + STAR + STAR + " Job-ready &middot; " + STAR + STAR + STAR + STAR + " Advanced &middot; " +
          STAR + STAR + STAR + STAR + STAR + " Practical mastery</p>" +
        (state.preview ? "" : '<button class="btn sm" data-action="nav" data-nav="roles">Change role</button>') +
      "</div>" +
      "</div>" + (state.preview ? "" : roadmapAside(user)) + "</div>";
  }

  /* The journey: the same skills as the list below, laid along a winding path. Done is
     a verified skill, current is the first one still to prove, the rest wait. Nodes are
     real buttons laid over the drawing, so they take focus and the keyboard. */
  function journeyMap(user, r, pct) {
    var n = r.skills.length;
    var W = 720, H = 250;
    var pts = r.skills.map(function (sk, i) {
      return { x: n === 1 ? W / 2 : 56 + i * (W - 112) / (n - 1), y: 112 + Math.sin(i * 1.25 + 0.5) * 52 };
    });
    var cur = -1;
    r.skills.forEach(function (sk, i) { if (cur < 0 && prog(user, sk.id).stars === 0) cur = i; });

    // Smooth curve through the points (Catmull-Rom turned into cubic segments).
    function curve(upTo) {
      if (upTo < 1) return "";
      var d = "M" + pts[0].x.toFixed(1) + " " + pts[0].y.toFixed(1);
      for (var i = 0; i < upTo; i++) {
        var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
        var c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
        var c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
        d += " C" + c1x.toFixed(1) + " " + c1y.toFixed(1) + " " + c2x.toFixed(1) + " " + c2y.toFixed(1) +
          " " + p2.x.toFixed(1) + " " + p2.y.toFixed(1);
      }
      return d;
    }

    var doneTo = cur < 0 ? n - 1 : cur;
    var next = cur >= 0 ? r.skills[cur] : null;

    return '<section class="journey" aria-label="Your journey">' +
      '<div class="journey-head"><div><h2>Your journey</h2>' +
        '<p class="tiny muted">' + esc(r.name) + " &middot; " + verifiedCount(user) + " of " + n + " skills verified</p></div>" +
        (next ? '<button class="btn sm primary" data-action="open-skill" data-skill="' + next.id + '">Next: ' + esc(next.name) + " &rarr;</button>"
              : '<span class="pill ok">Roadmap complete</span>') +
      "</div>" +
      '<div class="journey-map" style="aspect-ratio:' + W + " / " + H + '">' +
        '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true">' +
          '<path class="jm-track" d="' + curve(n - 1) + '"/>' +
          (doneTo > 0 ? '<path class="jm-done" d="' + curve(doneTo) + '"/>' : "") +
        "</svg>" +
        r.skills.map(function (sk, i) {
          var st = prog(user, sk.id).stars > 0 ? "done" : (i === cur ? "current" : "todo");
          return '<button class="jm-node ' + st + '" data-action="open-skill" data-skill="' + sk.id + '" ' +
            'style="left:' + (pts[i].x / W * 100).toFixed(2) + "%;top:" + (pts[i].y / H * 100).toFixed(2) + '%" ' +
            'aria-label="' + esc(sk.name) + (st === "done" ? ", verified" : st === "current" ? ", next up" : ", not started") + '">' +
            '<span class="jm-dot">' + (st === "done" ? "&#10003;" : st === "current" ? "&#9654;" : "&middot;") + "</span>" +
            '<span class="jm-label">' + esc(sk.name) + "</span></button>";
        }).join("") +
      "</div>" +
      '<div class="bar"><span style="width:' + pct + '%"></span></div>' +
    "</section>";
  }

  /* The board sits beside the roadmap and moves while the student is looking at it,
     which is the point of making it live rather than a page they have to reload. */
  function roadmapAside(user) {
    var c = liveChallenge(user.roleId);
    var sub = c ? user.challenges[c.cid] : null;

    return '<aside class="rail">' +
      '<div class="side-card">' +
        '<div class="side-head"><span>School leaderboard</span><span class="live-pill"><i></i>Live</span></div>' +
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

    return '<div class="page-head">' +
        (state.preview ? "" : '<button class="btn sm ghost" style="margin-bottom:10px" data-action="nav" data-nav="roadmap">&larr; Roadmap</button>') +
        '<div class="eyebrow">' + esc(r.name) + " track</div><h1>" + esc(s.name) + "</h1>" +
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
            '<h3 style="font-size:15px">Course modules</h3><span class="pill">' + lessonsDone + " / " + s.lessons.length + " read</span></div>" +
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

        '<div class="card"><h3 style="font-size:15px;margin-bottom:6px">Practical project</h3>' +
          '<p class="tiny muted" style="margin-bottom:10px"><b style="color:var(--ink)">' + esc(s.project.title) + "</b> &mdash; " + esc(s.project.brief) + "</p>" +
          (p.project ? '<span class="pill ok">Submitted &middot; +150 points</span>'
            : '<div class="row"><button class="btn sm" data-action="submit-project" data-skill="' + s.id + '">Mark project submitted</button>' +
              '<span class="tiny muted">Required for the fifth star.</span></div>') +
        "</div>" +

        '<div class="card"><h3 style="font-size:15px;margin-bottom:10px">Assessment</h3>' +
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
        '<div class="eyebrow">Module ' + (i + 1) + " of " + s.lessons.length + "</div><h1>" + esc(lesson.title) + "</h1></div>" +
      '<div class="segs" aria-hidden="true">' +
        s.lessons.map(function (l, j) {
          return '<i class="' + (p.lessonsDone.indexOf(j) > -1 || j <= i ? "on" : "") + '"></i>';
        }).join("") +
      "</div>" +
      '<div class="lesson-nav">' +
        s.lessons.map(function (l, j) {
          var done = p.lessonsDone.indexOf(j) > -1;
          return '<button data-action="lesson" data-i="' + j + '" aria-current="' + (j === i) + '" class="' + (done && j !== i ? "done" : "") + '">' + (j + 1) + ". " + esc(l.title) + "</button>";
        }).join("") +
      "</div>" +
      '<div class="card prose" style="margin-bottom:18px">' + paras(lesson.body) + "</div>" +
      (last ? practiceBlock(s) + quizBlock(s) : "") +
      '<div class="row" style="margin-top:20px;justify-content:space-between">' +
        '<button class="btn" data-action="lesson" data-i="' + Math.max(0, i - 1) + '"' + (i === 0 ? " disabled" : "") + ">&larr; Previous</button>" +
        (last ? '<button class="btn primary" data-action="start-exam" data-skill="' + s.id + '">Go to assessment &rarr;</button>'
              : '<button class="btn primary" data-action="lesson" data-i="' + (i + 1) + '">Next module &rarr;</button>') +
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
      '<h3 style="font-size:15px;margin-bottom:4px">Practice exercises</h3>' +
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
            '<button class="btn sm" data-action="practice-answer" data-key="' + key + '">' +
              (st.shown ? "Hide answer" : "Show answer") + "</button>" +
            (st.tries > 1 ? '<span class="tiny muted mono">attempt ' + st.tries + "</span>" : "") +
          "</div>" +

          (st.checked ? checkPanel(st.checked) : "") +

          (st.hints > 0
            ? '<div class="stack" style="gap:7px;margin-top:11px">' +
              hints.slice(0, st.hints).map(function (h, j) {
                return '<div class="hint"><b>Hint ' + (j + 1) + "</b> " + esc(h) + "</div>";
              }).join("") + "</div>"
            : "") +

          (st.shown
            ? '<div style="margin-top:12px">' +
              (ex.solution ? '<div class="ex-solution"><span class="fl">Model answer</span><pre>' + esc(ex.solution) + "</pre></div>" : "") +
              '<div class="why">' + esc(ex.answer).split("\n\n").map(function (p) { return "<p>" + p + "</p>"; }).join("") + "</div>" +
            "</div>"
            : "") +
        "</div>";
      }).join("") + "</div></div>";
  }

  function quizBlock(s) {
    var q = state.quiz;
    if (!q || q.skillId !== s.id) {
      return '<div class="card"><h3 style="font-size:15px;margin-bottom:4px">Module quiz</h3>' +
        '<p class="tiny muted" style="margin-bottom:12px">' + s.quiz.length + " questions. Checks the module before you attempt the graded assessment.</p>" +
        '<button class="btn" data-action="start-quiz" data-skill="' + s.id + '">Start module quiz</button></div>';
    }
    if (q.done) {
      var right = q.answers.filter(function (a, i) { return a === s.quiz[i].a; }).length;
      return '<div class="card"><h3 style="font-size:15px;margin-bottom:10px">Module quiz &mdash; ' + right + " of " + s.quiz.length + " correct</h3>" +
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
    var item = s.assessment[e.idx];
    var pctDone = Math.round(e.idx / s.assessment.length * 100);

    return '<div class="page-head"><div class="eyebrow">Assessment &middot; ' + esc(s.name) + "</div>" +
        "<h1>Question " + (e.idx + 1) + " of " + s.assessment.length + "</h1></div>" +
      '<div class="segs" role="progressbar" aria-valuemin="0" aria-valuemax="' + s.assessment.length + '" aria-valuenow="' + e.idx + '">' +
        s.assessment.map(function (q, j) { return '<i class="' + (j < e.idx ? "on" : "") + '"></i>'; }).join("") +
      "</div>" +
      '<div class="q-card"><div class="progress-head">' +
        '<span class="pill">Level ' + item.lvl + '</span><span class="tiny muted ver">' + esc(item.qid) + " v" + item.v + "</span></div>" +
        '<p class="q-stem">' + esc(item.q) + '</p><div class="opts">' +
        item.opts.map(function (o, j) {
          return '<button class="opt" data-action="exam-answer" data-i="' + j + '"><span class="key">' + "ABCD"[j] + "</span><span>" + esc(o) + "</span></button>";
        }).join("") + "</div></div>" +
      '<p class="tiny muted" style="margin-top:14px">Answers are final once selected. Each attempt records the question version it was scored against.</p>';
  }

  function viewResult(user) {
    var res = state.result;
    var s = skill(user.roleId, res.skillId);
    var p = prog(user, res.skillId);
    var byLevel = {};
    s.assessment.forEach(function (q, i) {
      var k = "L" + q.lvl;
      if (!byLevel[k]) byLevel[k] = { right: 0, total: 0 };
      byLevel[k].total++;
      if (res.answers[i] === q.a) byLevel[k].right++;
    });
    var weak = s.assessment.filter(function (q, i) { return res.answers[i] !== q.a; });

    return '<div class="page-head result-head"><div class="eyebrow">Result &middot; ' + esc(s.name) + "</div>" +
        '<h1 class="result-h1"><span class="big">' + res.pct + "%</span> <span class=\"rest\">&mdash; " + res.award.label + "</span></h1>" +
        '<p class="sub">' + (state.preview
            ? "Preview only. No score, stars, or points were recorded for anyone."
            : (res.newStars ? "Your roadmap has been updated and " + res.pointsAwarded + " leaderboard points were added."
                            : "This did not beat your previous best of " + p.best + "%, so your roadmap is unchanged.")) + "</p></div>" +

      '<div class="card" style="margin-bottom:18px;text-align:center">' +
        '<div style="font-size:30px;line-height:1">' + starHTML(res.award.stars, "30px") + "</div>" +
        '<p style="margin-top:8px;font-weight:500">' + res.award.label + "</p>" +
        (res.award.capped ? '<p class="tiny" style="color:var(--warn);margin-top:6px">Scored at mastery level. The fifth star unlocks when the practical project is submitted.</p>' : "") +
      "</div>" +

      '<div class="summary-row">' +
        summaryCell("Score", res.right + "<small> / " + s.assessment.length + "</small>") +
        summaryCell("Percent", res.pct + "<small>%</small>") +
        summaryCell("Stars", res.award.stars + "<small> / 5</small>") +
        summaryCell("Attempt", String(p.attempts)) +
      "</div>" +

      '<div class="stack"><div class="card">' +
          '<h3 style="font-size:15px;margin-bottom:12px">Performance by difficulty</h3>' +
          '<div class="scroll-x"><table class="grid"><thead><tr><th>Level</th><th>Correct</th><th>Result</th></tr></thead><tbody>' +
            Object.keys(byLevel).sort().map(function (k) {
              var b = byLevel[k];
              return '<tr><td class="mono">' + k + '</td><td class="mono">' + b.right + " / " + b.total + "</td><td>" +
                (b.right === b.total ? '<span class="pill ok">Strong</span>' : b.right === 0 ? '<span class="pill bad">Weak</span>' : '<span class="pill warn">Partial</span>') +
                "</td></tr>";
            }).join("") + "</tbody></table></div></div>" +

        (weak.length ? '<div class="card"><h3 style="font-size:15px;margin-bottom:4px">Review these ' + weak.length + "</h3>" +
          '<p class="tiny muted" style="margin-bottom:13px">Each one you missed, with the reasoning.</p>' +
          '<div class="stack" style="gap:16px">' +
            s.assessment.map(function (q, i) {
              if (res.answers[i] === q.a) return "";
              return '<div><p style="font-weight:500;margin-bottom:8px"><span class="pill" style="margin-right:6px">L' + q.lvl + "</span>" + esc(q.q) + "</p>" +
                '<div class="opts">' + q.opts.map(function (o, j) {
                  var st = j === q.a ? "correct" : (res.answers[i] === j ? "wrong" : "");
                  return '<div class="opt" data-state="' + st + '"><span class="key">' + "ABCD"[j] + "</span><span>" + esc(o) + "</span></div>";
                }).join("") + '</div><div class="why"><b>Why:</b> ' + esc(q.why) + "</div>" +
                '<div class="row" style="margin-top:9px"><button class="tutor-inline" data-action="tutor-explain" data-i="' + i + '">Ask the assistant why</button></div>' +
                "</div>";
            }).join("") + "</div></div>"
          : '<div class="card"><h3 style="font-size:15px">Every question correct.</h3><p class="tiny muted" style="margin-top:5px">Nothing to review on this attempt.</p></div>') +
      "</div>" +

      '<div class="row" style="margin-top:20px">' +
        (state.preview
          ? '<button class="btn primary" data-action="exit-preview">Exit preview</button>'
          : '<button class="btn primary" data-action="nav" data-nav="roadmap">Back to roadmap</button>') +
        '<button class="btn" data-action="start-exam" data-skill="' + s.id + '">Retake assessment</button>' +
        (!state.preview && prog(user, s.id).stars >= 3 ? '<button class="btn" data-action="open-cert" data-skill="' + s.id + '">View certificate</button>' : "") +
      "</div>";
  }

  function viewCerts(user) {
    var list = certsFor(user);
    var r = role(user.roleId);
    return '<div class="page-head"><div class="eyebrow">Certificates</div><h1>Verified proficiency</h1>' +
        '<p class="sub">A certificate is issued at three stars or above, which is the job-ready threshold. Each one names the role track, because the same skill is assessed differently in each.</p></div>' +
      (list.length === 0
        ? '<div class="card"><p class="muted">No certificates yet. Reach ' + STAR + STAR + STAR + " on any skill in the " + esc(r.name) + " roadmap to issue one.</p>" +
          '<button class="btn sm primary" style="margin-top:12px" data-action="nav" data-nav="roadmap">Open roadmap</button></div>'
        : '<div class="skill-list">' + list.map(function (c) {
            return '<button class="skill-row" data-action="open-cert" data-skill="' + c.skill.id + '">' +
              '<span><span class="skill-name">' + esc(c.skill.name) + '</span><span class="skill-lens" style="display:block">' +
                LEVELS[c.p.stars].label + " &middot; " + verifyId(user, c.skill.id) + "</span></span>" +
              '<span class="skill-right">' + starHTML(c.p.stars) + '<span class="pill accent">View</span></span></button>';
          }).join("") + "</div>");
  }

  function viewCert(user) {
    var s = skill(user.roleId, state.route.skill);
    var p = prog(user, s.id);
    var r = role(user.roleId);
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

  function viewLeaderboard(user) {
    var r = role(user.roleId);
    return '<div class="page-head"><div class="eyebrow">' + esc(user.school) + " &middot; " + esc(r.name) + "</div>" +
        '<h1>School leaderboard <span class="live-pill"><i></i>Live</span></h1>' +
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
        '<div class="card"><h3 style="font-size:15px;margin-bottom:8px">What this account can do</h3>' +
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
      '<div class="card"><h3 style="font-size:15px;margin-bottom:8px">Target role</h3>' +
        '<p class="tiny muted" style="margin-bottom:12px">Changing role gives you a different roadmap. Stars stay attached to the role they were earned in, because the assessments differ.</p>' +
        '<button class="btn" data-action="nav" data-nav="roles">Change target role</button></div>' +
      onboardingCard(user) +
      historyOfRoadmaps(user);
  }

  function onboardingCard(user) {
    if (!user.resume && !user.placement) {
      return '<div class="card" style="margin-top:14px"><h3 style="font-size:15px;margin-bottom:8px">Resume and placement</h3>' +
        '<p class="tiny muted" style="margin-bottom:12px">You have not uploaded a resume. Uploading one lets CareerPath ' +
        "build a placement test from the skills you already claim, and rank the roadmaps against them.</p>" +
        '<button class="btn" data-action="onb-open">Upload a resume</button></div>';
    }
    var rr = user.resume, pl = user.placement;
    return '<div class="card" style="margin-top:14px">' +
      '<div class="row" style="justify-content:space-between;margin-bottom:10px">' +
        '<h3 style="font-size:15px">Resume and placement</h3>' +
        '<button class="btn sm ghost" data-action="onb-open">Redo</button></div>' +
      (rr
        ? '<p class="tiny muted" style="margin-bottom:10px"><b style="color:var(--ink)">' + esc(rr.name) + "</b> read on " +
          esc(rr.when || today()) + ". " + rr.skills.length + " of 21 skills were mentioned. The file was read in your " +
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
      '<h3 style="font-size:14px;margin-bottom:4px">' + (q ? "Edit question " + esc(q.qid) + " (currently v" + q.v + ")" : "New question") + "</h3>" +
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
        "<div><h3 style=\"font-size:15px\">" + esc(s.name) + "</h3>" +
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
        summaryCell("Verified skills", verifiedCount(u) + (r ? "<small> / " + r.skills.length + "</small>" : "")) +
        summaryCell("Stars", totalStars(u) + (r ? "<small> / " + maxStars(u) + "</small>" : "")) +
        summaryCell("Points", String(u.points)) +
        summaryCell("Certificates", String(certsFor(u).length)) +
      "</div>" +

      (!r ? '<div class="card"><p class="muted">This student has not chosen a target role yet, so there is no roadmap to report on.</p></div>' :
      '<div class="stack">' +

        '<div class="card">' +
          '<div class="row" style="justify-content:space-between;margin-bottom:12px;gap:10px">' +
            '<h3 style="font-size:15px">Roadmap progress</h3>' +
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
                "<td>" + (x.p.project ? '<span class="pill ok">Submitted</span>' : '<span class="tiny muted">&mdash;</span>') + "</td></tr>";
            }).join("") +
          "</tbody></table></div>" +
          (studying.length
            ? '<p class="tiny muted" style="margin-top:12px">Currently studying without a verified result: ' +
              studying.map(function (x) { return esc(x.s.name); }).join(", ") + ".</p>"
            : "") +
        "</div>" +

        '<div class="card">' +
          '<h3 style="font-size:15px;margin-bottom:12px">Assessment history</h3>' +
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
          '<h3 style="font-size:15px;margin-bottom:12px">Certificates issued</h3>' +
          (certsFor(u).length === 0
            ? '<p class="tiny muted">None yet. A certificate is issued at ' + STAR + STAR + STAR + " or above.</p>"
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
          '<h3 style="font-size:15px">' + esc(x.r.name) + "</h3>" +
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
      '<h3 style="font-size:15px;margin-bottom:12px">' + (isNew ? "New challenge" : "Edit challenge") + "</h3>" +
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
          "pattern that recognises it. Without a pattern, the words in the criterion longer than four letters are used.</p></div>" +
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
        n === "onb-placement" ? viewOnbPlacement(user) :
        n === "onb-recommend" ? viewOnbRecommend(user) :
        n === "roles" ? viewRoles(user) :
        n === "skill" ? viewSkill(user) :
        n === "learn" ? viewLearn(user) :
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
    "auth-tab": function (el) { state.authTab = el.dataset.tab; state.authError = ""; render(); },

    fill: function (el) {
      var e = document.getElementById("li-email"), p = document.getElementById("li-pass");
      if (e) e.value = el.dataset.email;
      if (p) p.value = el.dataset.pass;
    },

    signup: function () {
      var name = val("su-name"), email = val("su-email"), pass = val("su-pass");
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
      var u = state.users.filter(function (x) {
        return x.email.toLowerCase() === email.toLowerCase() && x.password === pass && !x.seeded;
      })[0];
      if (!u) { state.authError = "No account matches that email and password."; return render(); }
      state.userId = u.id; state.authError = "";
      go(u.role === "admin" ? "a-content" : (u.roleId ? "roadmap" : "roles"));
    },

    logout: function () {
      state.userId = null; state.authTab = "login"; state.exam = null; state.quiz = null;
      state.preview = null; state.adminSkill = null; state.adminEdit = null;
      state.onb = null; state.ch = null; state.adminCh = null; state.adminChReview = null;
      live.feed = []; live.chFeed = []; live.flash = {};
      stopLive();
      tutor.turns = []; tutor.quote = ""; tutor.open = false;   // don't leak one student's chat to the next
      render();
    },

    nav: function (el) { state.adminEdit = null; state.adminLesson = null; go(el.dataset.nav); },

    theme: function () {
      var root = document.documentElement;
      var cur = root.getAttribute("data-theme");
      var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.setAttribute("data-theme", cur ? (cur === "dark" ? "light" : "dark") : (systemDark ? "light" : "dark"));
      render();
    },

    "pick-role": function (el) { switchRoadmap(me(), el.dataset.role); go("roadmap"); },

    /* ---- onboarding ---- */

    "onb-open": function () { state.onb = { step: 1 }; go("onb-resume"); },

    "onb-resume-flow": function (el) {
      var o = state.onb;
      if (!o) return actions["onb-open"]();
      o.skipped = false;
      if (el.dataset.fresh) {
        o.items = window.CP_ONBOARD.buildPlacement();
        o.idx = 0; o.answers = [];
      }
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
        if (!o.items || !o.items.length) { o.items = window.CP_ONBOARD.buildPlacement(); o.idx = 0; o.answers = []; }
        return go("onb-placement");
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
      acceptResume(O.clean(text), "Pasted text", "text");
    },

    "onb-skip": function () {
      // Kept, not discarded: skipping by accident is easy and walking back should be too.
      if (state.onb) state.onb.skipped = true;
      go("roles");
    },

    "onb-to-placement": function () {
      var o = state.onb;
      o.items = window.CP_ONBOARD.buildPlacement();
      o.idx = 0; o.answers = [];
      go("onb-placement");
    },

    "onb-answer": function (el) {
      var o = state.onb;
      o.answers[o.idx] = +el.dataset.i;
      o.rec = null;   // an earlier recommendation no longer matches the answers
      o.idx++;
      if (o.idx >= o.items.length) {
        o.score = window.CP_ONBOARD.scorePlacement(o.items, o.answers);
        var u = me();
        u.placement = { answered: o.score.answered, total: o.score.total,
          perRole: o.score.perRole, when: today() };
      }
      window.scrollTo(0, 0);
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
      o.by = "rules";
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
      var box = document.getElementById("ch-text");
      var text = box ? box.value.trim() : "";
      if (!text) {
        state.ch = { cid: c.cid, err: "Write an answer before submitting." };
        return render();
      }
      var res = scoreChallenge(c, text);
      user.challenges[c.cid] = { text: text, pct: res.pct, met: res.met, hit: res.hit, of: res.of,
        words: res.words, short: res.short, when: today(), feedback: "", source: "" };
      // Points once per challenge, and never enough to outweigh a verified star.
      user.points += 30 + Math.round(res.pct / 2);
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

    "open-skill": function (el) { state.quiz = null; go("skill", { skill: el.dataset.skill }); },

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
      state.exam = { skillId: el.dataset.skill, idx: 0, answers: [] };
      go("assess", { skill: el.dataset.skill });
    },

    "exam-answer": function (el) {
      var e = state.exam;
      var subject = actor();
      var s = skill(subject.roleId, e.skillId);
      e.answers.push(+el.dataset.i);
      e.idx++;
      if (e.idx < s.assessment.length) { window.scrollTo(0, 0); return render(); }
      finishExam(subject, s, e);
    },

    "submit-project": function (el) {
      var u = actor();
      var p = prog(u, el.dataset.skill);
      if (p.project) return;
      p.project = true;
      if (!state.preview) u.points += 150;
      if (p.best >= 95 && p.stars < 5) { if (!state.preview) u.points += 100; p.stars = 5; }
      render();
    },

    "open-cert": function (el) { go("cert", { skill: el.dataset.skill }); },

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

    askModel({ rules: O.rankRules, convo: [{ role: "user", content: prompt }], signal: null, onText: null })
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

  var CH_RULES =
    "You are reviewing a student's answer to a weekly practice challenge on CareerPath, a platform where " +
    "students learn the skills a specific job role needs and prove them through assessment.\n\n" +
    "You are NOT setting the score. The score is already fixed by the rubric and you will be told it. " +
    "Your job is to explain the answer's quality in a way the student can act on.\n\n" +
    "Write three or four sentences. Say what the answer did well, name the single most important thing " +
    "missing or weakest, and give one concrete suggestion. Plain language, no headings, no bullet lists, " +
    "no em dashes. Do not rewrite the answer for them, and do not repeat the rubric back verbatim.\n\n";

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

    var missing = c.rubric.filter(function (r, i) { return !sub.met[i]; })
      .map(function (r) { return r.label; });

    var convo = [{ role: "user", content:
      "Challenge: " + c.title + "\n\nBrief given to the student:\n" + c.brief +
      "\n\nRubric:\n" + c.rubric.map(function (r, i) {
        return (i + 1) + ". " + r.label + " [" + (sub.met[i] ? "met" : "not met") + "]";
      }).join("\n") +
      "\n\nScore already awarded: " + sub.pct + "% (" + sub.hit + " of " + sub.of + " rubric points)" +
      (missing.length ? "\nNot met: " + missing.join("; ") : "\nEvery rubric point was met.") +
      "\n\nThe student's answer:\n" + sub.text.slice(0, 4000) }];

    askModel({ rules: CH_RULES, convo: convo, signal: null, onText: null })
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
    if (!el) return;
    var fn = actions[el.dataset.action];
    if (fn) { ev.preventDefault(); fn(el); }
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
        state.onb.paste = true;
        state.onb.err = res.kind === "pdf"
          ? "That PDF keeps its text as images, or in a font that cannot be read back. Paste the text instead and it will work the same way."
          : "Not enough readable text came out of that file. A PDF, a Word file or pasted text all work.";
        return render();
      }
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
      var btn = document.querySelector('[data-action="signup"], [data-action="login"]');
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

  var TUTOR_RULES =
    "You are the CareerPath study assistant. CareerPath is a platform where students learn the skills " +
    "for a specific target job role and prove them through assessment.\n\n" +
    "How to answer:\n" +
    "- Teach for the student's target role. The same skill means different things in different roles: " +
    "SQL for a Product Manager is funnels, retention and experiment readouts, while SQL for a Financial " +
    "Analyst is ledger periods and reconciliation. Answer through their role's lens.\n" +
    "- Be short. Two or three sentences unless they ask for more. Plain language. Explain a term the first " +
    "time you use it.\n" +
    "- Use the module text below when it covers the question. If it does not, say so in a few words and " +
    "answer from general knowledge.\n" +
    "- If they paste or select text and ask about it, explain that specific thing rather than the topic in general.\n" +
    "- Never write an em dash.\n\n" +
    "Limits:\n" +
    "- Only help with the skill they are studying, the course material, or how to use CareerPath. If asked " +
    "about anything else, say that in one line and offer to help with the module instead.\n" +
    "- Never hand over the answer to a scored assessment question. If a student asks what to pick, teach the " +
    "idea being tested and let them decide.\n\n" +
    "Current context:\n";

  function tutorContext() {
    var u = actor();
    if (!u) return "The student has not signed in.";
    var out = [];
    var r = role(u.roleId);
    if (r) out.push("Target role: " + r.name + " (" + r.tagline + ")");
    var n = state.route.name;
    var s = state.route.skill ? skill(u.roleId, state.route.skill) : null;

    if (s) {
      out.push("Skill: " + s.name);
      out.push("This skill's focus for this role: " + s.lens);
      var p = prog(u, s.id);
      out.push("Their level so far: " + (p.stars ? p.stars + " of 5 stars, " + LEVELS[p.stars].label : "not yet assessed"));
      if (n === "learn") {
        var l = s.lessons[Math.min(state.lessonIdx, s.lessons.length - 1)];
        out.push("Module they are reading: " + l.title);
        out.push("Module text:\n" + l.body.slice(0, 4500));
      }
      if (n === "result" && state.result) {
        out.push("They just scored " + state.result.pct + "% and were awarded " + state.result.award.label + ".");
      }
    } else if (n === "roadmap" || n === "roles") {
      out.push("They are looking at their roadmap, not a specific skill.");
    }
    return out.join("\n");
  }

  function tutorBlocked() { return state.route.name === "assess"; }

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
      log.innerHTML = '<div class="t-locked"><b>The assistant is off during an assessment.</b>' +
        "Your stars are meant to show what you know without help. Finish the assessment and the assistant " +
        "comes back, including an explanation of anything you got wrong.</div>";
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
      document.getElementById("tutor-sub").textContent =
        s ? s.name : (u && role(u.roleId) ? role(u.roleId).name + " roadmap" : "");
      document.getElementById("tutor-foot").hidden = blocked;
      var note = document.getElementById("tutor-note");
      if (note) {
        note.textContent = (tutor.mode === "claude"
          ? "Answers come from Claude. "
          : "Answers come from the AI model this deployment is configured with. ") +
          "Select any text in the lesson to ask about it.";
      }
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
      rules: TUTOR_RULES + tutorContext(),
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
    var q = s.assessment[i];
    var chose = state.result.answers[i];
    openTutor();
    tutorAsk(
      "I just got this assessment question wrong and I want to understand why.\n\n" +
      "Question: " + q.q + "\n" +
      q.opts.map(function (o, j) { return "ABCD"[j] + ") " + o; }).join("\n") + "\n\n" +
      "I chose " + "ABCD"[chose] + ". The correct answer is " + "ABCD"[q.a] + ".\n\n" +
      "Explain why my answer is wrong and why the correct one is right, for my target role. " +
      "Then give me one short way to remember it.",
      "",
      "Why was my answer to question " + (i + 1) + " wrong?"
    );
  };

  seed();
  ensureVersioning();
  render();
  initTutor();
})();
