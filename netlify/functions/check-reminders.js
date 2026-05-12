exports.handler = async (event) => {
  try {
    const SB = process.env.VITE_SUPABASE_URL;
    const KEY = process.env.VITE_SUPABASE_SERVICE_KEY;
    const RESEND = process.env.VITE_RESEND_KEY;

    const fra7 = new Date();
    fra7.setDate(fra7.getDate() + 7);
    const target = fra7.toISOString().split('T')[0];

    const debug = { target, SB_ok: !!SB, KEY_ok: !!KEY, RESEND_ok: !!RESEND };

    const url = SB + '/rest/v1/rate_condomino'
      + '?select=id,importo,notificato,profiles(nome,cognome,email_contatto),rate_condominio(data_scadenza)'
      + '&notificato=eq.false&limit=20';

    const r = await fetch(url, {
      headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' }
    });

    const righe = await r.json();
    debug.http_status = r.status;
    debug.righe_totali = Array.isArray(righe) ? righe.length : 'ERRORE';
    debug.sample = Array.isArray(righe) ? righe.slice(0, 3) : righe;
    debug.date_presenti = Array.isArray(righe)
      ? [...new Set(righe.map(x => x.rate_condominio && x.rate_condominio.data_scadenza))]
      : [];

    if (!Array.isArray(righe)) return { statusCode: 200, body: JSON.stringify(debug, null, 2) };

    const daInviare = righe.filter(x => x.rate_condominio && x.rate_condominio.data_scadenza === target);
    debug.in_scadenza_fra_7gg = daInviare.length;

    let inviati = 0;
    const log_invii = [];

    for (const riga of daInviare) {
      const email = riga.profiles && riga.profiles.email_contatto;
      if (!email || email.includes('@noemail.local')) {
        log_invii.push({ skip: true, motivo: 'no email', nome: riga.profiles && riga.profiles.nome });
        continue;
      }
      const nome = ((riga.profiles.nome || '') + ' ' + (riga.profiles.cognome || '')).trim();
      const scad = riga.rate_condominio.data_scadenza;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + RESEND },
        body: JSON.stringify({
          from: 'noreply@studiomazzinibo.com',
          to: email,
          subject: 'Promemoria rata condominiale - scadenza ' + scad,
          html: '<p>Gentile ' + nome + ',</p><p>Le ricordiamo che e in scadenza il <strong>' + scad + '</strong> la sua rata condominiale di <strong>EUR ' + riga.importo + '</strong>.</p><p>Cordiali saluti,<br>Studio Amministrazioni Immobiliari Mazzini & C.</p>'
        })
      });
      const resend_body = await res.text();
      log_invii.push({ email, status: res.status, body: resend_body });
      if (res.ok) {
        inviati++;
        await fetch(SB + '/rest/v1/rate_condomino?id=eq.' + riga.id, {
          method: 'PATCH',
          headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ notificato: true })
        });
      }
    }

    debug.inviati = inviati;
    debug.log_invii = log_invii;
    return { statusCode: 200, body: JSON.stringify(debug, null, 2) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ errore: err.message }) };
  }
};