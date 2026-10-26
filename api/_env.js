/* Settings shared by the serverless functions. Files that start with an underscore are not routes.
   The URL and publishable key are public by design (see config.js). The service role key is not:
   it lives only in the host's environment settings, never in the repo, the page or a chat. */
export const DEFAULT_URL = "https://vgqmpyqbzmdmvgyvmytq.supabase.co";
export const DEFAULT_KEY = "sb_publishable_MtVoEWvkc7xqhqui_o_S6Q_gWmXiNIt";

export function supabase() {
  return {
    url: (process.env.SUPABASE_URL || DEFAULT_URL).replace(/\/+$/, ""),
    key: process.env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_KEY,
    secret: process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  };
}
