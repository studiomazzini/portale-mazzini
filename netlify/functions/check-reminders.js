const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_SERVICE_KEY
    );

    const oggi = new Date();
    const fra7 = new Date(oggi);
    fra7.setDate(oggi.getDate() + 7);
    const dataTarget = fra7.toISOString().split('T')[0];

    const { data: rate, error } = await supabase
      .from('rate')
      .select('*, profiles(nome, cognome, email_contatto), condominii(nome)')
      .eq('scadenza', dataTarget)
      .eq('pagata', false);

    if (error) throw error;

    let inviati = 0;
    for (const rata of rate || []) {
      const email = rata.profiles?.email_contatto;
      if (!email || email.includes('@noemail.local')) continue;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': Bearer 
        },
        body: JSON.stringify({
          from: 'noreply@studiomazzinibo.com',
          to: email,
          subject: Promemoria rata condominiale - scadenza ,
          html: <p>Gentile  ,</p>
                 <p>La informiamo che è in scadenza il <strong></strong> 
                 la rata condominiale del condominio <strong></strong>
                 di importo <strong>€ </strong>.</p>
                 <p>Per qualsiasi informazione non esiti a contattarci.</p>
                 <p>Cordiali saluti,<br>Studio Amministrazioni Immobiliari Mazzini & C.</p>
        })
      });
      if (res.ok) inviati++;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ inviati, totale: rate?.length || 0 })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ errore: err.message }) };
  }
};
