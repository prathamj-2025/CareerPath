/* The feedback form. Sends to /api/config?task=feedback (api/_feedback.js), which checks every answer again.
   On the preview copy (no database) the answer is kept in this browser, so the admin Feedback tab there can show it. */
(function () {
  var form = document.getElementById("fb-form");
  if (!form) return;
  var DEMO_KEY = "cp-feedback-demo";
  var params = new URLSearchParams(location.search);
  var source = ["app", "prompt"].indexOf(params.get("from")) > -1 ? params.get("from") : "page";
  var real = null;          // null until the settings arrive: then true (database) or false (preview copy)
  var token = "";

  try { var s = JSON.parse(localStorage.getItem("cp-session") || "null"); if (s && s.access) token = s.access; } catch (e) { token = ""; }
  if (token) document.getElementById("fb-linked").hidden = false;

  fetch("/api/config", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (c) { real = !!(c && c.supabaseUrl); }).catch(function () { real = true; });

  var $ = function (id) { return document.getElementById(id); };
  function val(name) { var el = form.querySelector('[name="' + name + '"]:checked'); return el ? el.value : ""; }
  function vals(name) { return Array.prototype.map.call(form.querySelectorAll('[name="' + name + '"]:checked'), function (el) { return el.value; }); }
  function text(name) { var el = form.elements[name]; return el ? String(el.value || "").trim() : ""; }

  function sync() {
    var t = val("tried");
    $("fb-yes").hidden = t !== "yes";
    $("fb-no").hidden = t !== "no";
    $("fb-end").hidden = !t;
    $("fb-mind").hidden = val("continue") !== "no";
    // A linked answer already comes with the account's email, so the follow-up box is only for everyone else.
    var linked = !!(token && $("fb-link") && $("fb-link").checked);
    var eq = form.querySelector('.fb-q[data-q="email"]');
    if (eq) eq.hidden = linked;
  }
  if ($("fb-link")) $("fb-link").addEventListener("change", sync);
  form.addEventListener("change", function (e) {
    sync();
    var q = e.target.closest && e.target.closest(".fb-q");
    if (q && q.classList.contains("bad")) mark(q, "");
  });
  sync();

  function mark(q, msg) {
    q.classList.toggle("bad", !!msg);
    var p = q.querySelector(".fb-err");
    if (p) { p.textContent = msg; p.hidden = !msg; }
  }

  var NEEDS = {
    status: "Please choose one.", role: "Please choose one.", prepare: "Please pick at least one.", struggle: "Please pick at least one.",
    heard: "Please choose one.", tried: "Please choose one.", used: "Please pick at least one.", ease: "Please pick a number.",
    lessons: "Please pick a number.", continue: "Please choose one.", pmf: "Please choose one.", recommend: "Please pick a number.",
    why_not: "Please choose one."
  };
  function check() {
    var first = null;
    Array.prototype.forEach.call(form.querySelectorAll(".fb-q[data-required]"), function (q) {
      if (q.closest("[hidden]")) { mark(q, ""); return; }
      var name = q.getAttribute("data-q");
      var missing = !val(name);
      mark(q, missing ? NEEDS[name] || "Please answer this." : "");
      if (missing && !first) first = q;
    });
    var email = form.querySelector('.fb-q[data-q="email"]').hidden ? "" : text("email");
    var eq = form.querySelector('.fb-q[data-q="email"]');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { mark(eq, "That email address does not look right. Leave it empty if you prefer."); first = first || eq; }
    else if (eq) mark(eq, "");
    return first;
  }

  function payload() {
    var tried = val("tried");
    var p = { source: source, status: val("status"), role: val("role"), school: text("school"), program: text("program"),
      prepare: vals("prepare"), struggle: vals("struggle"), heard: val("heard"), tried: tried, website: text("website"),
      email: form.querySelector('.fb-q[data-q="email"]').hidden ? "" : text("email") };
    if (tried === "yes") {
      p.used = vals("used"); p.ease = Number(val("ease")); p.device = vals("device"); p.broken = text("broken");
      p.lessons = Number(val("lessons")); p.lessons_better = text("lessons_better"); p.favorite = val("favorite");
      p.continue = val("continue"); p.change_mind = val("continue") === "no" ? text("change_mind") : "";
      p.pmf = val("pmf"); p.recommend = Number(val("recommend")); p.add_or_change = text("add_or_change");
    } else {
      p.why_not = val("why_not"); p.would_try = text("would_try");
    }
    var link = $("fb-link");
    p.link = !!(token && link && link.checked);
    return p;
  }

  function done(note) {
    form.hidden = true;
    $("fb-linked").hidden = true;
    if (note) $("fb-done-text").textContent = note;
    $("fb-done").hidden = false;
    window.scrollTo(0, 0);
  }
  function fail(msg) {
    var e = $("fb-error"); e.textContent = msg; e.hidden = false;
    $("fb-send").disabled = false; $("fb-send").textContent = "Send feedback";
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    $("fb-error").hidden = true;
    var bad = check();
    if (bad) {
      bad.scrollIntoView({ behavior: "smooth", block: "center" });
      var inp = bad.querySelector("input, textarea"); if (inp) try { inp.focus({ preventScroll: true }); } catch (e) { /* old browser */ }
      return;
    }
    var p = payload();
    $("fb-send").disabled = true; $("fb-send").textContent = "Sending...";
    if (real === false) {
      try {
        var list = JSON.parse(localStorage.getItem(DEMO_KEY) || "[]");
        // Saved like the live site saves them: each choice as it reads on the page.
        var yes = p.tried === "yes", none = function (v) { return v || null; };
        var word = function (name, v) {
          var el = v ? form.querySelector('[name="' + name + '"][value="' + v + '"]') : null;
          return el ? el.parentNode.querySelector("span").textContent : null;
        };
        var words = function (name, list) { return (list || []).map(function (v) { return word(name, v); }).filter(Boolean); };
        var row = { id: list.length + 1, created_at: new Date().toISOString(), source: p.source, user_id: null,
          status: word("status", p.status), school: none(p.school), program: none(p.program), target_role: word("role", p.role),
          prepare: words("prepare", p.prepare), struggle: words("struggle", p.struggle), heard: word("heard", p.heard), tried: word("tried", p.tried),
          used: yes ? words("used", p.used) : [], ease: yes ? p.ease : null, device: yes ? words("device", p.device) : [],
          broken: yes ? none(p.broken) : null, lessons: yes ? p.lessons : null, lessons_better: yes ? none(p.lessons_better) : null,
          favorite: yes ? word("favorite", p.favorite) : null, continue_use: yes ? word("continue", p.continue) : null,
          change_mind: yes ? none(p.change_mind) : null, pmf: yes ? word("pmf", p.pmf) : null, recommend: yes ? p.recommend : null,
          add_or_change: yes ? none(p.add_or_change) : null, why_not: yes ? null : word("why_not", p.why_not),
          would_try: yes ? null : none(p.would_try), email: none(p.email) };
        list.push(row); localStorage.setItem(DEMO_KEY, JSON.stringify(list.slice(-200)));
      } catch (e) { /* storage blocked: still thank them */ }
      done("This preview copy has no database, so your answer was kept in this browser only.");
      return;
    }
    var h = { "content-type": "application/json" };
    if (p.link) h.authorization = "Bearer " + token;
    fetch("/api/config?task=feedback", { method: "POST", headers: h, body: JSON.stringify(p) })
      .then(function (r) { return r.json().catch(function () { return null; }).then(function (b) { return { ok: r.ok, b: b }; }); })
      .then(function (r) {
        if (r.ok) return done("");
        fail((r.b && r.b.error && r.b.error.message) || "Your answer could not be sent. Please try again.");
      })
      .catch(function () { fail("Could not reach CareerPath. Check your connection and try again."); });
  });
})();
