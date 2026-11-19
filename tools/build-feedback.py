"""Builds public/feedback.html (the feedback form) from the header and footer of public/contact.html.
Run: python3 tools/build-feedback.py   (after tools/build-pages.mjs if the site header or footer changed).
The choices must match CHOICES in api/_feedback.js and FB_LABEL in public/app.js."""
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent / "public"
src = (ROOT / "contact.html").read_text()
head = src[:src.index('<main class="wrap">')]
foot = src[src.index('<footer class="site-foot">'):]
head = head.replace('<title>Contact | CareerPath</title>', '<title>Feedback | CareerPath</title>')
head = head.replace('content="Reach the CareerPath team with a question, a bug report or an idea."',
                    'content="Tell the CareerPath team what works, what does not, and what you would add. About four minutes."')
head = head.replace('<a href="contact.html" aria-current="page">Contact</a>', '<a href="contact.html">Contact</a>')
foot = foot.replace('<script src="site.js"></script>', '<script src="site.js"></script>\n<script src="feedback.js"></script>')

def radios(name, opts):
    return "".join(f'<label class="fb-chip"><input type="radio" name="{name}" value="{v}"><span>{t}</span></label>' for v, t in opts)
def checks(name, opts):
    return "".join(f'<label class="fb-chip"><input type="checkbox" name="{name}" value="{v}"><span>{t}</span></label>' for v, t in opts)
def chips(inner): return '<div class="fb-chips">' + inner + '</div>'
def scale(name, lo, hi, left, right):
    cells = "".join(f'<label class="fb-cell"><input type="radio" name="{name}" value="{n}"><span>{n}</span></label>' for n in range(lo, hi + 1))
    return f'<div class="fb-scale" style="--n:{hi-lo+1}">{cells}</div><div class="fb-ends"><span>{left}</span><span>{right}</span></div>'
def q(num, legend, body, req=False, name="", hint=""):
    mark = ' <b class="fb-req" aria-hidden="true">*</b>' if req else ' <span class="fb-opt">Optional</span>'
    h = f'<p class="fb-hint">{hint}</p>' if hint else ''
    return (f'<fieldset class="fb-q" data-q="{name}"{" data-required" if req else ""}><legend><span class="fb-n">{num}</span>'
            f'<span class="fb-lt">{legend}{mark}</span></legend>{h}{body}<p class="fb-err" role="alert" hidden></p></fieldset>\n')
def textarea(name, rows=3, ph=""):
    p = f' placeholder="{ph}"' if ph else ''
    return f'<textarea name="{name}" rows="{rows}" maxlength="1000"{p}></textarea>'
def follow(id_, label, name):
    idattr = f' id="{id_}" hidden' if id_ else ''
    return f'<label class="fb-field fb-follow"{idattr}><span>{label}</span><textarea name="{name}" rows="2" maxlength="1000"></textarea></label>'

USED = [("match", "Role match (resume or questions)"), ("roadmap", "Roadmap"), ("lessons", "Lessons"), ("practice", "Practice with hints"),
        ("assessments", "Assessments and stars"), ("assistant", "Study assistant"), ("leaderboard", "Leaderboard"), ("challenge", "Weekly challenge")]
PICK = "Pick all that apply."

b = '''<main class="wrap fb-main">
  <h1>Help us make CareerPath better</h1>
  <p class="lead">About four minutes. Every answer is read by the team, and nothing you write is shown to other students.</p>
  <p class="fb-note" id="fb-linked" hidden><label><input type="checkbox" id="fb-link" checked> Link this answer to my CareerPath account, so we can see which parts you used.</label></p>

  <form id="fb-form" novalidate>
  <section class="fb-sec"><h2>About you</h2>
'''
b += q(1, "Are you a student or working?", chips(radios("status", [("student", "Student"), ("working", "Working professional"), ("other", "Other")])), True, "status")
b += q(2, "Your school and program", '<div class="fb-two"><label class="fb-field"><span>School</span><input name="school" maxlength="120" autocomplete="organization" placeholder="e.g. USC"></label><label class="fb-field"><span>Program</span><input name="program" maxlength="120" placeholder="e.g. MS Engineering Management"></label></div>', False, "school")
b += q(3, "Which role are you aiming for?", chips(radios("role", [("pm", "Product Manager"), ("pjm", "Project Manager"), ("ba", "Business Analyst"), ("other", "Something else"), ("unsure", "Not sure yet")])), True, "role")
b += q(4, "How are you preparing for your target role right now?", chips(checks("prepare", [("google", "Google search"), ("youtube", "YouTube"), ("courses", "Online courses"), ("chatgpt", "ChatGPT or other AI"), ("linkedin", "LinkedIn posts"), ("mentors", "Mentors or friends"), ("books", "Books"), ("none", "I have not started")])), True, "prepare", PICK)
b += q(5, "What is the hardest part of preparing for your target role?", chips(checks("struggle", [("order", "Knowing what to learn first and next"), ("testing", "Testing whether I really know it"), ("too_many", "Too many resources"), ("time", "Finding the time"), ("interviews", "Getting ready for interviews"), ("other", "Something else")])), True, "struggle", PICK)
b += '''  </section>
  <section class="fb-sec"><h2>CareerPath</h2>
'''
b += q(6, "How did you hear about CareerPath?", chips(radios("heard", [("whatsapp", "WhatsApp or group chat"), ("friend", "A friend or classmate"), ("class", "In class or from a professor"), ("linkedin", "LinkedIn"), ("poster", "A poster or flyer"), ("other", "Something else")])), True, "heard")
b += q(7, "Have you tried CareerPath?", chips(radios("tried", [("yes", "Yes"), ("no", "Not yet")])), True, "tried")
b += '''  </section>
  <section class="fb-sec" id="fb-yes" hidden><h2>Using it</h2>
'''
b += q(8, "Which parts did you use?", chips(checks("used", USED)), True, "used", PICK)
b += q(9, "How easy was it to get started?", scale("ease", 1, 5, "Very hard", "Very easy"), True, "ease")
b += q(10, "What did you use it on?", chips(checks("device", [("phone", "Phone"), ("laptop", "Laptop"), ("tablet", "Tablet")])), False, "device", PICK)
b += q(11, "Did anything look broken or confusing?", textarea("broken", 3, "What happened, and on which page?"), False, "broken")
b += q(12, "How helpful were the lessons in the modules?", scale("lessons", 1, 5, "Not helpful", "Extremely helpful") + follow("", "What would make the lessons better? (optional)", "lessons_better"), True, "lessons")
b += q(13, "Which part did you like most?", chips(radios("favorite", USED)), False, "favorite")
b += q(14, "Will you keep using CareerPath?", chips(radios("continue", [("regularly", "Yes, regularly"), ("sometimes", "Now and then"), ("interviews", "Only before interviews"), ("no", "No")])) + follow("fb-mind", "What would change your mind? (optional)", "change_mind"), True, "continue")
b += q(15, "How would you feel if you could no longer use CareerPath?", chips(radios("pmf", [("very", "Very disappointed"), ("somewhat", "Somewhat disappointed"), ("not", "Not disappointed")])), True, "pmf")
b += q(16, "How likely are you to recommend CareerPath to a friend?", scale("recommend", 0, 10, "Not at all likely", "Extremely likely"), True, "recommend")
b += q(17, "One thing you would add or change", textarea("add_or_change", 3, "A feature, a skill, a lesson, anything."), False, "add_or_change")
b += '''  </section>
  <section class="fb-sec" id="fb-no" hidden><h2>Before you try it</h2>
'''
b += q(8, "What stopped you so far?", chips(radios("why_not", [("no_time", "No time yet"), ("not_sure", "Not sure it is for me"), ("forgot", "I forgot about it"), ("other", "Something else")])), True, "why_not")
b += q(9, "What would make you try it?", textarea("would_try", 3), False, "would_try")
b += '''  </section>
  <section class="fb-sec fb-last" id="fb-end" hidden>
'''
b += q("&#9993;", "Want us to follow up?", '<label class="fb-field"><span>Email</span><input name="email" type="email" maxlength="200" autocomplete="email" placeholder="you@school.edu"></label>', False, "email",
       "Leave your email if you are happy to answer a quick follow-up question. We will not share it or send spam.")
b += '''    <div class="fb-hp" aria-hidden="true"><label>Leave this empty <input name="website" tabindex="-1" autocomplete="off"></label></div>
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
'''
(ROOT / "feedback.html").write_text(head + b + foot)
print("public/feedback.html written")
