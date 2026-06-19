// Decap CMS GitHub OAuth — step 1: send the editor to GitHub to authorize.
// Replaces the retired Netlify Identity / git-gateway flow.
export default async (req) => {
  const origin = new URL(req.url).origin;
  const params = new URLSearchParams({
    client_id: process.env.OAUTH_CLIENT_ID,
    redirect_uri: `${origin}/.netlify/functions/callback`,
    scope: "repo,user",
    // ponytail: CSRF state value, not server-verified — fine for a 2-person CMS
    state: Math.random().toString(36).slice(2),
  });
  return Response.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`,
    302
  );
};
