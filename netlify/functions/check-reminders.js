exports.handler = async (event) => {
  try {
    const SB = process.env.VITE_SUPABASE_URL;
    const KEY = process.env.VITE_SUPABASE_SERVICE_KEY;
    const RESEND = process.env.VITE_RESEND_KEY;

    const fra7 = new Date();
    fra7.setDate(fra7.getDate() + 7);
    const target = fra7.toISOString().split('T')[0];

    // Carica rate in scadenza fra 7 giorni non ancora notificate
    const url = SB + '/rest/v1/rate_condomino'
      + '?select=id,importo,rata_id,user_id,profiles(nome,cognome,email_contatto),rate_condominio(data_scadenza)'
      + '&notificato=eq.false';

    const r = await fetch(url, {
      headers: {
        'apikey': KEY,
        'Authorization': 'Bearer ' + KEY,
        'Content-Type': 'application/json'
      }
    });
    const righe = await r.json();
    if (!Array.isArray(righe)) {
      return { statusCode: 200, body: JSON.stringify({ inviati: 0, debug: righe }) };
    }

    // Filtra solo quelle in scadenza nella data target
    const daInviare = righe.filter(riga =>
      riga.rate_condominio && riga.rate_condominio.data_scadenza === target
    );

    let inviati = 0;
    for (const riga of daInviare) {
      const email = riga.profiles && riga.profiles.email_contatto;
      if (!email || email.includes('@noemail.local')) continue;

      const nome = (riga.profiles.nome || '') + ' ' + (riga.profiles.cognome || '');
      const scad = riga.rate_condominio.data_scadenza;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + RESEND
        },
        body: JSON.stringify({
          from: 'noreply@studiomazzinibo.com',
          to: email,
          subject: 'Promemoria rata condominiale - scadenza ' + scad,
          html: '<p>Gentile ' + nome.trim() + ',</p>'
            + '<p>La informiamo che e in scadenza il <strong>' + scad + '</strong> '
            + 'la sua rata condominiale di importo <strong>EUR ' + riga.importo + '</strong>.</p>'
            + '<p>Per qualsiasi informazione non esiti a contattarci.</p>'
            + '<p>Cordiali saluti,<br>Studio Amministrazioni Immobiliari Mazzini & C.</p>'
        })
      });

      if (res.ok) {
        inviati++;
        // Segna come notificato
        await fetch(SB + '/rest/v1/rate_condomino?id=eq.' + riga.id, {
          method: 'PATCH',
          headers: {
            'apikey': KEY,
            'Authorization': 'Bearer ' + KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ notificato: true })
        });
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ inviati: inviati, totale: daInviare.length })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ errore: err.message }) };
  }
};