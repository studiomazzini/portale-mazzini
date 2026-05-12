exports.handler = async (event) => {
  try {
    const SB = process.env.VITE_SUPABASE_URL;
    const KEY = process.env.VITE_SUPABASE_SERVICE_KEY;
    const RESEND = process.env.VITE_RESEND_KEY;

    const fra7 = new Date();
    fra7.setDate(fra7.getDate() + 7);
    const target = fra7.toISOString().split('T')[0];

    const h = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' };

    // 1. Trova le rate_condominio in scadenza fra 7 giorni
    const r1 = await fetch(SB + '/rest/v1/rate_condominio?select=id&data_scadenza=eq.' + target, { headers: h });
    const rateInScadenza = await r1.json();
    if (!Array.isArray(rateInScadenza) || rateInScadenza.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ inviati: 0, msg: 'Nessuna rata in scadenza il ' + target }) };
    }

    const rataIds = rateInScadenza.map(x => x.id).join(',');

    // 2. Trova gli importi non ancora notificati per quelle rate
    const r2 = await fetch(SB + '/rest/v1/rate_condomino?select=id,importo,user_id&rata_id=in.(' + rataIds + ')&notificato=eq.false', { headers: h });
    const importi = await r2.json();
    if (!Array.isArray(importi) || importi.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ inviati: 0, msg: 'Tutti gia notificati o nessun importo' }) };
    }

    const userIds = [...new Set(importi.map(x => x.user_id))].join(',');

    // 3. Carica i profili con email
    const r3 = await fetch(SB + '/rest/v1/profiles?select=id,nome,cognome,email_contatto&id=in.(' + userIds + ')', { headers: h });
    const profili = await r3.json();
    const profiloMap = {};
    if (Array.isArray(profili)) profili.forEach(p => { profiloMap[p.id] = p; });

    let inviati = 0;
    for (const imp of importi) {
      const profilo = profiloMap[imp.user_id];
      if (!profilo) continue;
      const email = profilo.email_contatto;
      if (!email || email.includes('@noemail.local')) continue;

      const nome = ((profilo.nome || '') + ' ' + (profilo.cognome || '')).trim();
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + RESEND },
        body: JSON.stringify({
          from: 'noreply@studiomazzinibo.com',
          to: email,
          subject: 'Promemoria rata condominiale - scadenza ' + target,
          html: '<p>Gentile ' + nome + ',</p>'
            + '<p>Le ricordiamo che e in scadenza il <strong>' + target + '</strong> '
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

    return { statusCode: 200, body: JSON.stringify({ inviati: inviati, totale: importi.length }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ errore: err.message }) };
  }
};