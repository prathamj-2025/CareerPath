"""Builds content/lessons-ba.js (the Business Analyst course) from the written modules.

usage: python3 tools/build_lessons_ba.py [source_dir] [out_file]
  source_dir  holds outline.json, tracks.json and new/<module id>.json   (default /home/claude/content-ba)
  out_file    default content/lessons-ba.js

Then run `npm run build:content` to produce the public copy (answer keys removed). Mirrors tools/build_lessons_pjm.py. The five
original Business Analyst skills keep their practice exercises (patched in by data4.js and data5.js) because the builder carries
`practice` over from the skill that is already in CP_ROLES when this file loads.
"""
import json, os, sys
SRC = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/content-ba'
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'content', 'lessons-ba.js')
M = json.load(open(f'{SRC}/outline.json')); TRACKS = json.load(open(f'{SRC}/tracks.json'))
meta = {m['id']: dict(id=m['id'], name=m['name'], lens=m['lens'], summary=m['summary'], project=m['project']) for m in M}
course = {m['id']: json.load(open(f'{SRC}/new/{m["id"]}.json')) for m in M}
order = [m['id'] for m in M]
J = lambda o: json.dumps(o, ensure_ascii=True, separators=(',', ':'))
n = sum(len(course[i]['lessons']) for i in order)
out = [f'/* Business Analyst course: 5 main modules, {len(order)} sub-modules, {n} lessons. Same structure as the Product Manager course:',
 '   every lesson has a teaching body, a scenario (one decision and one written answer with a coverage check',
 '   and a model answer) and a revision sheet; every sub-module has a short quiz and a 10-question graded',
 '   assessment; four main modules award a certificate after a module exam. Text is ASCII only. */',
 'window.CP_BA_META = [' + ',\n'.join(J(meta[i]) for i in order) + '];',
 'window.CP_COURSE_BA = {\n' + ',\n'.join(f'"{i}":' + J(course[i]) for i in order) + '\n};',
 'window.CP_BA_TRACKS = ' + json.dumps(TRACKS, indent=1) + ';',
 '''(function () {
  var ba = (window.CP_ROLES || []).filter(function (r) { return r.id === "ba"; })[0];
  if (!ba) return;
  /* Written-answer key points are stored as regular-expression text; compile them once. */
  function compile(lessons) {
    lessons.forEach(function (l) {
      var w = l.scenario && l.scenario.written;
      if (!w) return;
      w.points = w.points.map(function (p) {
        var re;
        try { re = new RegExp(p.re, "i"); } catch (e) { re = new RegExp("$^"); }
        return { label: p.label, re: re };
      });
    });
    return lessons;
  }
  /* The practice exercises of the original skills (SQL, requirements, process, Excel, stakeholders) were patched in by
     data4.js and data5.js before this file loads, so carry them over by id. */
  var before = {};
  ba.skills.forEach(function (s) { before[s.id] = s; });
  ba.tracks = window.CP_BA_TRACKS;
  ba.skills = window.CP_BA_META.map(function (m) {
    var c = window.CP_COURSE_BA[m.id];
    return {
      id: m.id, name: m.name, lens: m.lens, summary: m.summary,
      lessons: compile(c.lessons), practice: before[m.id] && before[m.id].practice ? before[m.id].practice : [],
      quiz: c.quiz, assessment: c.assessment, project: m.project
    };
  });
})();
''']
open(OUT, 'w', encoding='utf-8').write('\n'.join(out))
print(n, 'lessons', os.path.getsize(OUT), 'bytes')
