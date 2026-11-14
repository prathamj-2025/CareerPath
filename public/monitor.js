/* Reports uncaught browser errors so a broken page is noticed without waiting for a student to write in.
 * Sends the error text, script file and line, a short stack, the page path and browser name to /api/report, which writes one
 * log line (Vercel > Logs, search "client-error"). It sends no names, emails or answers. At most 5 distinct errors per page
 * load. Never throws, never blocks the page. Local files and the test pages do not report. */
(function () {
  "use strict";
  if (!/^https?:$/.test(window.location.protocol)) return;
  var sent = 0, seen = {};
  function path() { return String(window.location.pathname || "/").slice(0, 100); }
  function send(kind, msg, src, line, col, stack) {
    try {
      msg = String(msg || "").slice(0, 300);
      if (!msg || sent >= 5 || seen[msg]) return;
      seen[msg] = 1; sent++;
      var body = JSON.stringify({
        kind: kind, msg: msg, src: String(src || "").replace(/[?#].*$/, "").slice(0, 200), line: line || 0, col: col || 0,
        stack: String(stack || "").replace(/(https?:\/\/[^\s)]+?)[?#][^\s)]*/g, "$1").slice(0, 1200),
        page: path(), ua: String(navigator.userAgent || "").slice(0, 160)
      });
      if (navigator.sendBeacon && navigator.sendBeacon("/api/report", new Blob([body], { type: "application/json" }))) return;
      fetch("/api/report", { method: "POST", headers: { "content-type": "application/json" }, body: body, keepalive: true }).catch(function () {});
    } catch (e) { /* reporting must never cause an error of its own */ }
  }
  window.addEventListener("error", function (e) {
    if (e && e.target && e.target !== window) return;           // a failed image or script tag is not a code error
    send("error", e.message, e.filename, e.lineno, e.colno, e.error && e.error.stack);
  });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e && e.reason;
    send("promise", (r && r.message) || String(r), "", 0, 0, r && r.stack);
  });
})();
