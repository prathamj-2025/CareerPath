/* Builds public/feedback.html (the feedback form) from the questions in api/_feedback_form.js and the header and footer of
   public/contact.html. Run: node tools/build-feedback.mjs   (and again after tools/build-pages.mjs if the site header or footer
   changed). Edit the questions and choices in api/_feedback_form.js, never in the built page. */
import { readFileSync, writeFileSync } from "node:fs";
import { FORM, OPEN } from "../api/_feedback_form.js";

const ROOT = new URL("../public/", import.meta.url).pathname;
const src = readFileSync(ROOT + "contact.html", "utf8");
let head = src.slice(0, src.indexOf('<main class="wrap">'));
let foot = src.slice(src.indexOf('<footer class="site-foot">'));
head = head.replace("<title>Contact | CareerPath</title>", "<title>Feedback | CareerPath</title>")
  .replace('content="Reach the CareerPath team with a question, a bug report or an idea."',
    'content="Tell the CareerPath team what works, what does not, and what you would add. About four minutes."')
  .replace('<a href="contact.html" aria-current="page">Contact</a>', '<a href="contact.html">Contact</a>');
foot = foot.replace('<script src="site.js"></script>', '<script src="site.js"></script>\n<script src="feedback.js"></script>');

const NAME = { target_role: "role", continue_use: "continue" };   // the field names feedback.js reads
const PICK = "Pick all that apply.";
const chips = (k) => {
  const f = FORM[k], type = f.many ? "checkbox" : "radio", name = NAME[k] || k;
  return '<div class="fb-chips">' + Object.entries(f.opts).map(([v, t]) =>
    `<label class="fb-chip"><input type="${type}" name="${name}" value="${v}"><span>${t}</span></label>`).join("") + "</div>";
};
const scale = (name, lo, hi, left, right) => {
  let cells = "";
  for (let n = lo; n <= hi; n++) cells += `<label class="fb-cell"><input type="radio" name="${name}" value="${n}"><span>${n}</span></label>`;
  return `<div class="fb-scale" style="--n:${hi - lo + 1}">${cells}</div><div class="fb-ends"><span>${left}</span><span>${right}</span></div>`;
};
const q = (num, legend, body, req, name, hint) =>
  `<fieldset class="fb-q" data-q="${name}"${req ? " data-required" : ""}><legend><span class="fb-n">${num}</span>` +
  `<span class="fb-lt">${legend}${req ? ' <b class="fb-req" aria-hidden="true">*</b>' : ' <span class="fb-opt">Optional</span>'}</span></legend>` +
  (hint ? `<p class="fb-hint">${hint}</p>` : "") + body + '<p class="fb-err" role="alert" hidden></p></fieldset>\n';
const ask = (k, req, hint, extra) => q(FORM[k].n, FORM[k].q, chips(k) + (extra || ""), req, NAME[k] || k, hint || (FORM[k].many ? PICK : ""));
const textarea = (name, rows, ph) => `<textarea name="${name}" rows="${rows}" maxlength="1000"${ph ? ` placeholder="${ph}"` : ""}></textarea>`;
const follow = (id, name) => `<label class="fb-field fb-follow"${id ? ` id="${id}" hidden` : ""}><span>${OPEN[name].q} (optional)</span>` +
  `<textarea name="${name}" rows="2" maxlength="1000"></textarea></label>`;

let b = `<main class="wrap fb-main">
  <h1>Help us make CareerPath better</h1>
  <p class="lead">About four minutes. Every answer is read by the team, and nothing you write is shown to other students.</p>
  <p class="fb-note" id="fb-linked" hidden><label><input type="checkbox" id="fb-link" checked> Link this answer to my CareerPath account, so we can see which parts you used.</label></p>

  <form id="fb-form" novalidate>
  <section class="fb-sec"><h2>About you</h2>
`;
b += ask("status", true);
b += q(OPEN.school.n, OPEN.school.q, '<div class="fb-two"><label class="fb-field"><span>School</span><input name="school" maxlength="120" autocomplete="organization" placeholder="e.g. USC"></label><label class="fb-field"><span>Program</span><input name="program" maxlength="120" placeholder="e.g. MS Engineering Management"></label></div>', false, "school");
b += ask("target_role", true);
b += ask("prepare", true);
b += ask("struggle", true);
b += `  </section>
  <section class="fb-sec"><h2>CareerPath</h2>
`;
b += ask("heard", true);
b += ask("tried", true);
b += `  </section>
  <section class="fb-sec" id="fb-yes" hidden><h2>Using it</h2>
`;
b += ask("used", true);
b += q(OPEN.ease.n, OPEN.ease.q, scale("ease", 1, 5, "Very hard", "Very easy"), true, "ease");
b += ask("device", false);
b += q(OPEN.broken.n, OPEN.broken.q, textarea("broken", 3, "What happened, and on which page?"), false, "broken");
b += q(OPEN.lessons.n, OPEN.lessons.q, scale("lessons", 1, 5, "Not helpful", "Extremely helpful") + follow("", "lessons_better"), true, "lessons");
b += ask("favorite", false);
b += ask("continue_use", true, "", follow("fb-mind", "change_mind"));
b += ask("pmf", true);
b += q(OPEN.recommend.n, OPEN.recommend.q, scale("recommend", 0, 10, "Not at all likely", "Extremely likely"), true, "recommend");
b += q(OPEN.add_or_change.n, OPEN.add_or_change.q, textarea("add_or_change", 3, "A feature, a skill, a lesson, anything."), false, "add_or_change");
b += `  </section>
  <section class="fb-sec" id="fb-no" hidden><h2>Before you try it</h2>
`;
b += ask("why_not", true);
b += q(OPEN.would_try.n, OPEN.would_try.q, textarea("would_try", 3), false, "would_try");
b += `  </section>
  <section class="fb-sec fb-last" id="fb-end" hidden>
`;
b += q("&#9993;", OPEN.email.q, '<label class="fb-field"><span>Email</span><input name="email" type="email" maxlength="200" autocomplete="email" placeholder="you@school.edu"></label>', false, "email",
  "Leave your email if you are happy to answer a quick follow-up question. We will not share it or send spam.");
b += `    <div class="fb-hp" aria-hidden="true"><label>Leave this empty <input name="website" tabindex="-1" autocomplete="off"></label></div>
    <p class="fb-err fb-err-top" id="fb-error" role="alert" hidden></p>
    <button class="btn fb-send" type="submit" id="fb-send">Send feedback</button>
  </section>
  </form>

  <div class="fb-done" id="fb-done" hidden>
    <div class="fb-tick" aria-hidden="true">&#10003;</div>
    <h2>Thank you</h2>
    <p id="fb-done-text">We read every answer. It goes straight into what we build next.</p>
    <p><a class="btn" href="/">Back to CareerPath</a></p>
  </div>
</main>
`;
writeFileSync(ROOT + "feedback.html", head + b + foot);
console.log("public/feedback.html written");
