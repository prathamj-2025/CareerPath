import json,os,sys
OUT=sys.argv[1] if len(sys.argv)>1 else '/home/claude/careerpath-web/public/lessons-pjm.js'
here=os.path.dirname(os.path.abspath(__file__))
M=json.load(open(f'{here}/outline.json')); TRACKS=json.load(open(f'{here}/tracks.json'))
meta={m['id']:dict(id=m['id'],name=m['name'],lens=m['lens'],summary=m['summary'],project=m['project']) for m in M}
course={m['id']:json.load(open(f'{here}/new/{m["id"]}.json')) for m in M}
order=[m['id'] for m in M]
J=lambda o:json.dumps(o,ensure_ascii=True,separators=(',',':'))
n=sum(len(course[i]['lessons']) for i in order)
out=[f'/* Project Manager course: 5 main modules, {len(order)} sub-modules, {n} lessons. Same structure as the Product Manager course:',
 '   every lesson has a teaching body, a scenario (one decision and one written answer with a coverage check',
 '   and a model answer) and a revision sheet; every sub-module has a short quiz and a 10-question graded',
 '   assessment; four main modules award a certificate after a module exam. Text is ASCII only. */',
 'window.CP_ROLES.push({ id: "pjm", name: "Project Manager", tagline: "Plan it, run it, deliver it.", skills: [], tracks: [] });',
 'window.CP_PJM_META = ['+',\n'.join(J(meta[i]) for i in order)+'];',
 'window.CP_PJM_COURSE = {\n'+',\n'.join(f'"{i}":'+J(course[i]) for i in order)+'\n};',
 'window.CP_PJM_TRACKS = '+json.dumps(TRACKS,indent=1)+';',
 '''(function () {
  var pjm = (window.CP_ROLES || []).filter(function (r) { return r.id === "pjm"; })[0];
  if (!pjm) return;
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
  pjm.tracks = window.CP_PJM_TRACKS;
  pjm.skills = window.CP_PJM_META.map(function (m) {
    var c = window.CP_PJM_COURSE[m.id];
    return {
      id: m.id, name: m.name, lens: m.lens, summary: m.summary,
      lessons: compile(c.lessons), practice: [], quiz: c.quiz, assessment: c.assessment,
      project: m.project
    };
  });
})();
''']
open(OUT,'w',encoding='utf-8').write('\n'.join(out))
print(n,'lessons',os.path.getsize(OUT),'bytes')
