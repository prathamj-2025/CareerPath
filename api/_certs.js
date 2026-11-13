/* Certificates: what a student has earned, worked out from the results the server holds, and the ID each one carries.
   Nothing here trusts the page. A certificate exists only if the results in the database say it is earned.
     roadmaps with modules   one per module exam passed; a badge is added to the title when every optional sub-module
                             is also at three stars
     roadmaps without        one per skill at three stars or more
   Issued rows are kept (supabase/migrations/010_certificates.sql); a revoked one stays revoked. */
import { randomInt } from "node:crypto";
import { roleOf } from "./_content.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";     // no 0/O/1/I, so an ID read aloud or typed from paper is not misread
export function newId() {
  const pick = (n) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return "CP-" + pick(4) + "-" + pick(4);
}
export const ID_PATTERN = /^CP-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/* What the student has earned right now: [{ kind, target, title, stars, score }] */
export function earned(C, role, skillRows, moduleRows) {
  const G = C.grading, L = C.levels;
  const stars = {}; (skillRows || []).forEach((r) => { stars[r.skill_id] = r; });
  const mods = {}; (moduleRows || []).forEach((r) => { mods[r.track_id] = r; });
  const out = [];
  if (role.tracks) {
    role.tracks.forEach((t) => {
      const m = mods[t.id];
      if (!t.cert || !m || !m.passed) return;
      const req = G.skillsOfTrack(role, t, true);
      const opt = G.skillsOfTrack(role, t, false).filter((s) => req.indexOf(s) === -1);
      const withBadge = opt.length > 0 && opt.every((s) => ((stars[s.id] || {}).stars || 0) >= G.JOB_READY);
      let badge = "";
      t.groups.forEach((g) => { if (g.badge && withBadge) badge = " " + g.badge; });
      out.push({ kind: "module", target: t.id, title: t.cert + badge, stars: G.levelFor(L, m.best).stars, score: m.best });
    });
  } else {
    role.skills.forEach((s) => {
      const p = stars[s.id];
      if (p && p.stars >= G.JOB_READY) out.push({ kind: "skill", target: s.id, title: s.name, stars: p.stars, score: p.best });
    });
  }
  return out;
}

/* Brings the student's certificates up to date and returns them all. Missing ones are issued; the score, title and
   holder of existing ones are refreshed (a better score, a name typo fixed). A revoked certificate is left as it is. */
export async function sync(C, uid, profile, rest) {
  const role = roleOf(C, profile.roadmap_id);
  const have = await rest("GET", "certificates?user_id=eq." + uid + "&select=*");
  if (!have.ok || !Array.isArray(have.data)) return null;
  if (!role) return have.data;
  const sk = await rest("GET", "skill_progress?user_id=eq." + uid + "&select=skill_id,stars,best");
  const md = await rest("GET", "module_results?user_id=eq." + uid + "&select=track_id,best,passed");
  if (!sk.ok || !md.ok) return null;
  const who = await rest("GET", "profiles?id=eq." + uid + "&select=name,school");
  const me = who.ok && who.data && who.data[0] ? who.data[0] : { name: "", school: "" };

  for (const e of earned(C, role, sk.data, md.data)) {
    const row = have.data.filter((c) => c.kind === e.kind && c.target === e.target)[0];
    const facts = { title: e.title, stars: e.stars, score: e.score, holder: me.name || "", school: me.school || "", roadmap_id: role.id, roadmap_name: role.name };
    if (row) {
      if (row.revoked_at) continue;
      if (Object.keys(facts).some((k) => row[k] !== facts[k])) {
        const up = await rest("PATCH", "certificates?id=eq." + row.id, facts, "return=representation");
        if (up.ok && up.data && up.data[0]) Object.assign(row, up.data[0]);
      }
      continue;
    }
    for (let tries = 0; tries < 4; tries++) {                    // a clash on the random ID is astronomically unlikely, but retry anyway
      const made = await rest("POST", "certificates", Object.assign({ id: newId(), user_id: uid, kind: e.kind, target: e.target }, facts), "return=representation");
      if (made.ok && made.data && made.data[0]) { have.data.push(made.data[0]); break; }
      if (made.status === 409 && !String(made.data && made.data.message || "").includes("certificates_pkey")) {   // issued a moment ago by another request
        const again = await rest("GET", "certificates?user_id=eq." + uid + "&kind=eq." + e.kind + "&target=eq." + encodeURIComponent(e.target) + "&select=*");
        if (again.ok && again.data && again.data[0]) { have.data.push(again.data[0]); }
        break;
      }
    }
  }
  return have.data;
}

/* What the page needs from a certificate row. */
export const shape = (c) => ({ id: c.id, kind: c.kind, target: c.target, title: c.title, stars: c.stars, score: c.score,
  issued: c.issued_at, revoked: !!c.revoked_at, holder: c.holder, school: c.school, roadmap: c.roadmap_name, roadmapId: c.roadmap_id });
