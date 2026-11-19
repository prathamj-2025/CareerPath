/* Stands in for the model provider so the whole request path can be tested
   without spending anyone's key. Speaks the streaming chat-completions format. */
import http from 'node:http';

const PORT = Number(process.env.PORT || 3112);
const flakySeen = new Set();

http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/__lastbody') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(globalThis.__lastBody || null)); return; }
  if (req.method === 'GET' && req.url === '/__lastjudge') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(globalThis.__lastJudge || null)); return; }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');

  const auth = req.headers.authorization || '';
  if (auth !== 'Bearer test-key') {
    res.statusCode = 401;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { message: 'Incorrect API key provided', code: 'invalid_api_key' } }));
    return;
  }

  // A student message containing BUSY503 gets the answer the real provider gives under load.
  const lastUser = JSON.stringify(body.messages || []).includes('BUSY503');
  if (lastUser) {
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify([{ error: { code: 503, message: 'This model is currently experiencing high demand. Please try again later.', status: 'UNAVAILABLE' } }]));
    return;
  }

  // FAIL_MODE lets the tests drive the provider's error paths.
  const mode = process.env.FAIL_MODE || '';
  if (mode === 'quota') {
    res.statusCode = 429;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: {
      message: 'You exceeded your current quota, please check your plan and billing details.',
      type: 'insufficient_quota', code: 'insufficient_quota' } }));
    return;
  }
  if (mode === 'ratelimit') {
    res.statusCode = 429;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: {
      message: 'Rate limit reached for requests', type: 'requests', code: 'rate_limit_exceeded' } }));
    return;
  }
  if (mode === 'model') {
    res.statusCode = 404;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: {
      message: 'The model `gpt-9` does not exist or you do not have access to it.',
      code: 'model_not_found' } }));
    return;
  }

  // Echo back what the server actually forwarded, so the test can assert on it.
  globalThis.__lastBody = body;
  const seen = JSON.stringify({ roles: body.messages.map(m => m.role), model: body.model });
  const sent = JSON.stringify(body.messages || []);

  const projectReply = () => {
    // Scores the submission by markers the test puts in it, so the stand-in responds to its input.
    const m = /SUBMISSION\\n([\s\S]*?)\\nSUBMISSION>>>/.exec(sent);
    const text = m ? m[1] : '';
    if (/BADJSON/.test(text)) return 'I think this is fine, maybe a 90.';
    if (/FLAKY/.test(text) && !flakySeen.has(text)) { flakySeen.add(text); return '{"score": 80, "summary": "Cut off mid-'; }   // the first reply is unreadable, the retry is fine
    if (/COMMAS/.test(text)) return '{"score": 82, "summary": "Specific and well reasoned.",\n "criteria": [{"label": "Follows the brief", "ok": true, "note": "Covers it.",}, {"label": "Specific evidence", "ok": true, "note": "Concrete.",},],\n "next": ["Add one number.",],}';
    const score = /GOODPROJECT/.test(text) ? 82 : /IGNORE/.test(text) ? 15 : 55;
    return JSON.stringify({ score, summary: score >= 70 ? 'Specific and well reasoned. The recommendation is clear.' : 'The idea is right but it stays generic. Add numbers and a decision.',
      criteria: [{ label: 'Follows the brief', ok: score >= 70, note: 'Covers the parts the brief asked for.' }, { label: 'Specific evidence', ok: score >= 70, note: 'Uses concrete detail.' },
        { label: 'Clear recommendation', ok: score >= 80, note: 'States a decision.' }, { label: 'Readable structure', ok: true, note: 'Easy to scan.' }],
      next: ['Add a number that supports your main claim.'] });
  };
  if (body.stream === false) {                       // non-streaming callers (the challenge and project reviewers on the server)
    res.setHeader('content-type', 'application/json');
    if (/You are the marker for CareerPath/.test(sent)) {
      // Stand-in for the AI marker. Reads the criteria and the answer out of the prompt and decides from markers the test puts
      // in the answer: MET:1,3 meets criteria 1 and 3, ALLMET meets all, PROB:1 flags problem 1, BADJSON answers badly.
      globalThis.__lastJudge = body;
      const u = (body.messages.filter((m) => m.role === 'user').pop() || {}).content || '';
      const sect = (name) => { const m = new RegExp('(?:^|\\n)' + name + '\\n([\\s\\S]*?)(?:\\n\\n|$)').exec(u); return m ? m[1].split('\n').filter(Boolean) : []; };
      const nC = sect('CRITERIA').length, nP = sect('PROBLEMS').length;
      const a = (/ANSWER<<<\n([\s\S]*?)\n>>>ANSWER/.exec(u) || [, ''])[1];
      if (/BADJSON/.test(a)) { res.end(JSON.stringify({ choices: [{ message: { content: 'Looks mostly fine to me.' } }] })); return; }
      const all = /ALLMET/.test(a);
      const mm = /MET:([\d,]+)/.exec(a);
      const set = new Set(mm ? mm[1].split(',').map(Number) : []);
      const pp = /PROB:([\d,]+)/.exec(a);
      const pset = new Set(pp ? pp[1].split(',').map(Number) : []);
      const out = { criteria: [], problems: [] };
      for (let i = 1; i <= nC; i++) out.criteria.push({ n: i, met: all || set.has(i), why: all || set.has(i) ? 'Your answer does this.' : 'Not shown in your answer.' });
      for (let i = 1; i <= nP; i++) out.problems.push({ n: i, present: pset.has(i) });
      res.end(JSON.stringify({ choices: [{ message: { content: (/FENCED/.test(a) ? '```json\n' : '') + JSON.stringify(out) + (/FENCED/.test(a) ? '\n```' : '') } }] }));
      return;
    }
    if (/project reviewer on CareerPath/.test(sent)) { res.end(JSON.stringify({ choices: [{ message: { content: projectReply() } }] })); return; }
    const asked = /Score already awarded: (\d+)%/.exec(sent);
    res.end(JSON.stringify({ choices: [{ message: { content: 'REVIEW: you scored ' + (asked ? asked[1] : '?') + '% on the rubric. Add a clear first step next time.' } }] }));
    return;
  }
  res.setHeader('content-type', 'text/event-stream');

  // The roadmap ranking asks for JSON, so answer in the shape the page parses.
  // Ordered by how often each roadmap id appears in the prompt, which makes the
  // stand-in respond to its input instead of returning a fixed winner.
  let pieces;
  if (/roadmap adviser/.test(sent)) {
    // Rank by how many skills the prompt says the resume mentioned for each roadmap, so
    // the stand-in responds to its input instead of always naming the same winner.
    const mentions = (id) => {
      const m = new RegExp("- " + id + " [^:]*: resume mentions (\\d+)").exec(sent);
      return m ? Number(m[1]) : 0;
    };
    const ranked = ["pm", "ba", "pjm"]
      .map((id) => ({ id, n: mentions(id) }))
      .sort((a, b) => b.n - a.n);
    const ranking = ranked.map((r, i) => ({
      roleId: r.id,
      match: [86, 52, 38, 21][i],
      why: "Your answers and your resume line up with this roadmap more than the others."
    }));
    pieces = ['{"ranking":', JSON.stringify(ranking), "}"];
  } else if (/project reviewer on CareerPath/.test(sent)) {
    pieces = [projectReply()];
  } else if (/You give hints on CareerPath/.test(sent)) {
    pieces = ['Ask yourself who the ', 'user is before the metric. HINTED'];
  } else {
    pieces = ['A funnel counts people, ', 'so use COUNT(DISTINCT user_id). ', 'FORWARDED=' + seen];
  }

  for (const p of pieces) {
    res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: p } }] }) + '\n\n');
    await new Promise(r => setTimeout(r, 15));
  }
  res.write('data: [DONE]\n\n');
  res.end();
}).listen(PORT, () => console.log('fake provider on http://localhost:' + PORT));
