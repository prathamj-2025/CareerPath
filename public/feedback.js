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
  }
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
    status: "Please choose one.", role: "Please choose one.", tried: "Please choose one.",
    ease: "Please pick a number.", lessons: "Please pick a number.", continue: "Please choose one.", recommend: "Please pick a number."
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
    var email = text("email");
    var eq = form.querySelector('.fb-q[data-q="email"]');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { mark(eq, "That email address does not look right. Leave it empty if you prefer."); first = first || eq; }
    else if (eq) mark(eq, "");
    return first;
  }

  function payload() {
    var tried = val("tried");
    var p = { source: source, status: val("status"), role: val("role"), school: text("school"), program: text("program"),
      prepare: vals("prepare"), struggle: vals("struggle"), tried: tried, email: text("email"), website: text("website") };
    if (tried === "yes") {
      p.used = vals("used"); p.ease = Number(val("ease")); p.device = vals("device"); p.broken = text("broken");
      p.lessons = Number(val("lessons")); p.lessons_better = text("lessons_better"); p.favorite = val("favorite");
      p.continue = val("continue"); p.change_mind = val("continue") === "no" ? text("change_mind") : "";
      p.recommend = Number(val("recommend")); p.change = text("change");
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
        var row = { id: list.length + 1, created_at: new Date().toISOString(), source: p.source, status: p.status, target_role: p.role,
          tried: p.tried, ease: p.ease || null, lessons: p.lessons || null, recommend: p.tried === "yes" ? p.recommend : null,
          continue_use: p.continue || null, email: p.email || null, answers: p };
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
