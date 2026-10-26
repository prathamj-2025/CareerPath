/* Answer keys for tests. The site files carry none (tools/strip-keys.mjs), so tests read them from content/ like the server does. */
import { load, FILES } from '../tools/strip-keys.mjs';
import path from 'node:path';
const win = load(FILES, path.join(import.meta.dirname, '..', 'content'));
export const roles = win.CP_ROLES;
export const skillOf = (roleId, skillId) => roles.find(r => r.id === roleId).skills.find(s => s.id === skillId);
export const keyOf = (roleId, skillId) => skillOf(roleId, skillId).assessment.map(q => q.a);
export const trackOf = (roleId, trackId) => roles.find(r => r.id === roleId).tracks.find(t => t.id === trackId);
