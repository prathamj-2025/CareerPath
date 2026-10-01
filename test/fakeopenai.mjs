/* Stands in for the model provider so the whole request path can be tested
   without spending anyone's key. Speaks the streaming chat-completions format. */
import http from 'node:http';

const PORT = Number(process.env.PORT || 3112);

http.createServer(async (req, res) => {
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
    const ranked = ["pm", "ba", "da", "fa"]
      .map((id) => ({ id, n: mentions(id) }))
      .sort((a, b) => b.n - a.n);
    const ranking = ranked.map((r, i) => ({
      roleId: r.id,
      match: [86, 52, 38, 21][i],
      why: "Your answers and your resume line up with this roadmap more than the others."
    }));
    pieces = ['{"ranking":', JSON.stringify(ranking), "}"];
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
