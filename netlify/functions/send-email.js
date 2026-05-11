exports.handler = async (event) => {
  if (event.httpMethod !== "POST")
    return { statusCode: 405, body: "Method Not Allowed" };
  try {
    const { to, subject, html } = JSON.parse(event.body);
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.VITE_RESEND_KEY}`
      },
      body: JSON.stringify({
        from: "Portale Condominiale <portale@studiomazzinibo.com>",
        to, subject, html
      })
    });
    const d = await r.json();
    return { statusCode: r.ok ? 200 : 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) };
  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};