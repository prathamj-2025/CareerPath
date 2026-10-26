/* Fills the support address on the website pages from the deployment's settings (SUPPORT_EMAIL),
   so the address can change without rebuilding the pages. The pages already show a default. */
(function () {
  fetch("/api/config", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (c) {
    if (!c || !c.supportEmail) return;
    document.querySelectorAll(".support-email").forEach(function (a) {
      a.href = "mailto:" + c.supportEmail; a.textContent = c.supportEmail;
    });
  }).catch(function () {});
})();
