/* Verifies a "Sign in with Google" ID token on the server.
 *
 * The browser gets a signed ID token (a JWT) from Google and posts it here. We ask Google's
 * tokeninfo endpoint to validate the signature and expiry, then check that the token was
 * issued for OUR client ID and that the email is verified. Only then do we hand back the
 * name, email and picture. The browser never decides on its own that a token is valid.
 *
 * Environment variable: GOOGLE_CLIENT_ID (the OAuth client ID from Google Cloud Console).
 */
function fail(res, status, code, message) {
  res.status(status).json({ error: { code: code, message: message } });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "method_not_allowed", "Use POST.");
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return fail(res, 500, "not_configured", "Google sign-in is not set up on this deployment.");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const credential = body && typeof body.credential === "string" ? body.credential : "";
  if (!credential || credential.length > 4096) return fail(res, 400, "bad_request", "Missing Google credential.");

  let info;
  try {
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
    if (!r.ok) return fail(res, 401, "invalid_token", "Google could not verify this sign-in. Please try again.");
    info = await r.json();
  } catch (e) {
    return fail(res, 502, "google_unreachable", "Could not reach Google to verify the sign-in.");
  }

  const issuerOk = info.iss === "accounts.google.com" || info.iss === "https://accounts.google.com";
  const notExpired = Number(info.exp) * 1000 > Date.now();
  const verified = info.email_verified === true || info.email_verified === "true";
  if (info.aud !== clientId || !issuerOk || !notExpired) {
    return fail(res, 401, "invalid_token", "This sign-in was not issued for CareerPath.");
  }
  if (!info.email || !verified) return fail(res, 401, "unverified_email", "Your Google email is not verified.");

  res.status(200).json({
    email: String(info.email).toLowerCase(),
    name: info.name || String(info.email).split("@")[0],
    picture: info.picture || null
  });
}
