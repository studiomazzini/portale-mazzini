exports.handler = async (event) => {
  try {
    const SB = process.env.VITE_SUPABASE_URL;
    const KEY = process.env.VITE_SUPABASE_SERVICE_KEY;
    const RESEND = process.env.VITE_RESEND_KEY;
    const h = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' };

    const oggi = new Date().toISOString().split('T')[0];
    const fra7 = new Date();
    fra7.setDate(fra7.getDate() + 7);
    const target = fra7.toISOString().split('T')[0];

    const r1 = await fetch(
      SB + '/rest/v1/rate_condominio?select=id,data_scadenza&data_scadenza=gte.' + oggi + '&data_scadenza=lte.' + target,
      { headers: h }
    );
    const rateInScadenza = await r1.json();
    if (!Array.isArray(rateInScadenza) || !rateInScadenza.length) {
      return { statusCode: 200, body: JSON.stringify({ inviati: 0, msg: 'Nessuna rata in scadenza nei prossimi 7 giorni' }) };
    }

    const rataIds = rateInScadenza.map(x => x.id).join(',');
    const rataDateMap = {};
    rateInScadenza.forEach(r => { rataDateMap[r.id] = r.data_scadenza; });

    const r2 = await fetch(
      SB + '/rest/v1/rate_condomino?select=id,importo,user_id,rata_id&rata_id=in.(' + rataIds + ')&notificato=eq.false',
      { headers: h }
    );
    const importi = await r2.json();
    if (!Array.isArray(importi) || !importi.length) {
      return { statusCode: 200, body: JSON.stringify({ inviati: 0, msg: 'Tutti già notificati o nessun importo' }) };
    }

    const userIds = [...new Set(importi.map(x => x.user_id))].join(',');
    const r3 = await fetch(
      SB + '/rest/v1/profiles?select=id,name,email,email2&id=in.(' + userIds + ')',
      { headers: h }
    );
    const profili = await r3.json();
    const profiloMap = {};
    if (Array.isArray(profili)) profili.forEach(p => { profiloMap[p.id] = p; });

    const isReal = e => e && !e.includes('@noemail.local');

    let inviati = 0;
    for (const imp of importi) {
      const p = profiloMap[imp.user_id];
      if (!p) continue;
      const emails = [p.email, p.email2].filter(isReal);
      if (!emails.length) continue;

      const scad = rataDateMap[imp.rata_id] || '';
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + RESEND },
        body: JSON.stringify({
          from: 'noreply@studiomazzinibo.com',
          to: emails,
          subject: 'Promemoria rata condominiale - scadenza ' + scad,
          html: '<p>Gentile ' + (p.name || '') + ',</p>'
            + '<p>Le ricordiamo che e in scadenza il <strong>' + scad + '</strong> '
            + 'la sua rata condominiale di importo <strong>EUR ' + imp.importo + '</strong>.</p>'
            + '<p>Per qualsiasi informazione non esiti a contattarci.</p>'
            + '<p>Cordiali saluti,<br>Studio Amministrazioni Immobiliari Mazzini &amp; C.</p>'
        })
      });

      if (res.ok) {
        inviati++;
        await fetch(SB + '/rest/v1/rate_condomino?id=eq.' + imp.id, {
          method: 'PATCH',
          headers: { ...h, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ notificato: true })
        });
      }
    }

    return { statusCode: 200, body: JSON.stringify({ inviati, totale: importi.length }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ errore: err.message }) };
  }
};