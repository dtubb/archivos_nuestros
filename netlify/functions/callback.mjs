// Decap CMS GitHub OAuth — step 2: trade the code for a token and hand it back
// to the CMS window via the postMessage handshake Decap expects.
export default async (req) => {
  const code = new URL(req.url).searchParams.get("code");
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.OAUTH_CLIENT_ID,
      client_secret: process.env.OAUTH_CLIENT_SECRET,
      code,
    }),
  });
  const data = await res.json();
  const ok = Boolean(data.access_token);
  const result = ok ? { token: data.access_token, provider: "github" } : data;
  const message = `authorization:github:${ok ? "success" : "error"}:${JSON.stringify(result)}`;
  const html = `<!doctype html><html><body><script>
    (function () {
      function receiveMessage(e) {
        window.opener.postMessage(${JSON.stringify(message)}, e.origin);
        window.removeEventListener("message", receiveMessage, false);
      }
      window.addEventListener("message", receiveMessage, false);
      window.opener.postMessage("authorizing:github", "*");
    })();
  </script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
};
