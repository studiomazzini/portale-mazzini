const webpush = require("web-push");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  try {
    const { userIds, role, title, body, url } = JSON.parse(event.body);

    const SB_URL = process.env.VITE_SUPABASE_URL;
    const SVC = process.env.VITE_SUPABASE_SERVICE_KEY;
    const H = { apikey: SVC, Authorization: `Bearer ${SVC}` };

    let ids = Array.isArray(userIds) ? userIds.slice() : [];
    if (role) {
      const rr = await fetch(`${SB_URL}/rest/v1/profiles?role=eq.${encodeURIComponent(role)}&select=id`, { headers: H });
      const rows = await rr.json();
      ids = ids.concat((Array.isArray(rows) ? rows : []).map((r) => r.id));
    }
    ids = [...new Set(ids.filter(Boolean))];
    if (!ids.length) return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sent: 0, removed: 0 }) };

    webpush.setVapidDetails(
      "mailto:studiomazzinibo@gmail.com",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const inList = ids.map((u) => `"${u}"`).join(",");
    const r = await fetch(`${SB_URL}/rest/v1/push_subscriptions?user_id=in.(${inList})&select=*`, { headers: H });
    const subs = await r.json();
    const payload = JSON.stringify({ title: title || "Portale Mazzini", body: body || "", url: url || "/" });

    let sent = 0; const gone = [];
    await Promise.all((Array.isArray(subs) ? subs : []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) gone.push(s.endpoint);
      }
    }));
    for (const ep of gone) {
      await fetch(`${SB_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(ep)}`, { method: "DELETE", headers: H });
    }
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sent, removed: gone.length }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
