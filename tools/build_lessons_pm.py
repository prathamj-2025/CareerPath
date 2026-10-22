import json,re,glob
ROOT='/home/claude/careerpath-web/public/lessons-pm.js'
src=open(ROOT,encoding='utf-8').read()
tail=src[src.rfind('\n(function () {'):]
# existing 16 from mods/ + meta16.json ; new 12 from new/ + outline2.json
meta={m['id']:m for m in json.load(open('meta16.json'))}
course={i:json.load(open(f'mods/{i}.json')) for i in meta}
for m in json.load(open('outline2.json')):
    meta[m['id']]=dict(id=m['id'],name=m['name'],lens=m['lens'],summary=m['summary'],project=m['project'])
    course[m['id']]=json.load(open(f'new/{m["id"]}.json'))
TRACKS=[
 dict(id="pm-fundamentals",name="PM Fundamentals",cert="PM Fundamentals",
  lens="What a PM does and how products get built",
  summary="The core of the job: what a Product Manager does, how a product moves from idea to launch, how to find real problems, size a market and set strategy.",
  groups=[dict(label="Core modules",required=True,skills=["foundations-pm","lifecycle-pm","discovery-pm","market-pm","strategy-pm"])],questions=25),
 dict(id="pm-professional",name="Professional Product Management",cert="Professional Product Management",
  lens="Design, specs, delivery, technical and leadership skills",
  summary="The working PM toolkit: UX, PRDs, prioritization, agile delivery and launches, plus technical and AI literacy and the leadership, finance and communication skills that senior PMs rely on.",
  groups=[dict(label="Product craft",required=True,skills=["ux-pm","prd-pm","prioritization-pm","agile-pm","launch-pm","tools-pm"]),
          dict(label="Technical and AI",required=True,skills=["technical-pm","ai-pm","aiworkflow-pm"]),
          dict(label="Leadership and business",required=True,skills=["leadership-pm","finance-pm","comm-pm"])],questions=24),
 dict(id="pm-data",name="Data-Driven Product Management",cert="Data-Driven Product Management",
  lens="Metrics, experiments, statistics and dashboards",
  summary="Measure what matters, run experiments, read statistics and dashboards without being fooled. Add the optional Python sub-modules to earn the Data-Driven PM with Python distinction.",
  groups=[dict(label="Core modules",required=True,skills=["metrics-pm","experimentation-pm","stats-pm","bi-pm"]),
          dict(label="Optional: Python for PMs",required=False,skills=["python-basics-pm","pandas-pm","viz-automation-pm"],badge="with Python")],questions=24, data=True),
 dict(id="pm-sql",name="SQL for Product Managers",cert="SQL for Product Managers",
  lens="Query your own data",
  summary="Learn SQL from zero: your first SELECT, joins and subqueries, then funnels, retention, window functions and A/B test results on a real practice dataset.",
  groups=[dict(label="Core modules",required=True,skills=["sql-foundations-pm","sql-joins-pm","sql-product-pm"])],questions=24, data=True),
 dict(id="pm-career",name="Interview-Ready PM",cert=None,
  lens="Portfolio, cases and interviews",
  summary="Turn what you have learned into a portfolio, practise product cases and prepare for interviews. Practice only, so there is no certificate for this module.",
  groups=[dict(label="Practice",required=True,skills=["career-pm"])],questions=0),
]
order=[s for t in TRACKS for g in t['groups'] for s in g['skills']]
assert len(order)==28 and set(order)==set(meta), set(meta)^set(order)
J=lambda o:json.dumps(o,ensure_ascii=True,separators=(',',':'))
out=['/* Product Manager course: 5 main modules, 28 sub-modules, 217 lessons, built from first principles.',
 '   Each sub-module is one skill on the roadmap and keeps its own stars. Every lesson has a teaching body',
 '   (Markdown subset rendered by paras() in app.js), a scenario to practise (one multiple-choice decision',
 '   and one written answer with a coverage check and a model answer) and a revision sheet. Each sub-module',
 '   also has a short quiz and a 10-question graded assessment. Four main modules award a certificate after',
 '   a module exam drawn from their sub-module assessments. The SQL and Python lessons run on one shared',
 '   practice dataset. Loaded after the other data files, this REPLACES the Product Manager skill list; the',
 '   other roles are unchanged. Text is ASCII only. */']
out.append('window.CP_PM_META = ['+',\n'.join(J(meta[i]) for i in order)+'];')
out.append('window.CP_PM_COURSE = {\n'+',\n'.join(f'"{i}":'+J(course[i]) for i in order)+'\n};')
out.append('window.CP_PM_TRACKS = '+json.dumps(TRACKS,indent=1)+';')
tail=tail.replace('pm.skills = window.CP_PM_META.map(','pm.tracks = window.CP_PM_TRACKS;\n  pm.skills = window.CP_PM_META.map(')
open(ROOT,'w',encoding='utf-8').write('\n'.join(out)+'\n'+tail)
n=sum(len(course[i]['lessons']) for i in order)
print(n,len(open(ROOT).read()))
