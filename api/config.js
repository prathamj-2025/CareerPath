/* Public, non-secret settings the page needs at start-up.
 *
 * GOOGLE_CLIENT_ID is an OAuth client ID, which Google designs to be public (it sits in
 * every page that shows a Sign in with Google button). The page hides the Google button
 * when it is not set, so the deployment works with or without it.
 */
export default function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  res.status(200).json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null });
}
