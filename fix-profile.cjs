const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE, 'Desktop', 'portale-mazzini', 'src', 'App.jsx');
let c = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
let ok = 0;

function fix(desc, from, to) {
  if (c.includes(from)) { c = c.split(from).join(to); ok++; console.log('OK:', desc); }
  else console.log('NON TROVATO:', desc);
}

// 1. UtenteModal — aggiungi telefono, telefono2, email2
fix('UtenteModal nuovi campi',
  `      <div className="flex gap-3"><div className="flex-1"><Inp label="Civico" value={f.scala} onChange={e=>s("scala",e.target.value)}/></div><div className="flex-1"><Inp label="Interno" value={f.interno} onChange={e=>s("interno",e.target.value)}/></div></div>
      <div className="flex justify-end gap-3 pt-2"><Btn variant="secondary" onClick={onClose}>Annulla</Btn><Btn onClick={()=>f.name&&onSave(f)}>Salva</Btn></div>`,
  `      <div className="flex gap-3"><div className="flex-1"><Inp label="Civico" value={f.scala} onChange={e=>s("scala",e.target.value)}/></div><div className="flex-1"><Inp label="Interno" value={f.interno} onChange={e=>s("interno",e.target.value)}/></div></div>
      <div className="flex gap-3"><div className="flex-1"><Inp label="Telefono 1" value={f.telefono||""} onChange={e=>s("telefono",e.target.value)} placeholder="Es. 051 452244"/></div><div className="flex-1"><Inp label="Telefono 2" value={f.telefono2||""} onChange={e=>s("telefono2",e.target.value)} placeholder="Es. 333 1234567"/></div></div>
      <Inp label="Email 2 (opzionale)" type="email" value={f.email2||""} onChange={e=>s("email2",e.target.value)} hint="Riceverà le notifiche insieme alla email principale"/>
      <div className="flex justify-end gap-3 pt-2"><Btn variant="secondary" onClick={onClose}>Annulla</Btn><Btn onClick={()=>f.name&&onSave(f)}>Salva</Btn></div>`
);

// 2. AdminUtenti save — include nuovi campi nel PATCH
fix('AdminUtenti save nuovi campi',
  `await PATCH("profiles",\`id=eq.\${f.id}\`,{name:f.name,cond_id:Number(f.cond_id),scala:f.scala,interno:f.interno,email:f.email||null},tok);`,
  `await PATCH("profiles",\`id=eq.\${f.id}\`,{name:f.name,cond_id:Number(f.cond_id),scala:f.scala,interno:f.interno,email:f.email||null,email2:f.email2||null,telefono:f.telefono||null,telefono2:f.telefono2||null},tok);`
);

// 3. notifyCondoDoc — invia anche a email2
fix('notifyCondoDoc email2',
  `const users = await GET("profiles",\`cond_id=eq.\${condId}&role=eq.condomino&select=name,email\`,tok);`,
  `const users = await GET("profiles",\`cond_id=eq.\${condId}&role=eq.condomino&select=name,email,email2\`,tok);`
);
fix('notifyCondoDoc send email2',
  `if(!isRealEmail(u.email)) continue;
      await sendEmail([u.email],`,
  `const emails=[u.email,u.email2].filter(e=>isRealEmail(e));
      if(!emails.length) continue;
      await sendEmail(emails,`
);

// 4. notifyPersonalDoc — invia anche a email2
fix('notifyPersonalDoc email2 select',
  `const u = (await GET("profiles",\`id=eq.\${userId}&select=name,email\`,tok))?.[0];
    if(!isRealEmail(u?.email)) return;
    await sendEmail([u.email],`,
  `const u = (await GET("profiles",\`id=eq.\${userId}&select=name,email,email2\`,tok))?.[0];
    const emails=[u?.email,u?.email2].filter(e=>isRealEmail(e));
    if(!emails.length) return;
    await sendEmail(emails,`
);

// 5. CondAccount — mostra i nuovi campi profilo
fix('CondAccount mostra campi',
  `        <p className="text-sm text-gray-600">Nome: <strong>{user.name}</strong></p>
        <p className="text-sm text-gray-600">Email: <strong>{user.email||"—"}</strong></p>
        <p className="text-sm text-gray-600">Condominio: <strong>{user.condominii?.nome}</strong> · Int. {user.interno}</p>`,
  `        <p className="text-sm text-gray-600">Nome: <strong>{user.name}</strong></p>
        <p className="text-sm text-gray-600">Email: <strong>{user.email||"—"}</strong></p>
        {user.email2&&<p className="text-sm text-gray-600">Email 2: <strong>{user.email2}</strong></p>}
        {user.telefono&&<p className="text-sm text-gray-600">Telefono: <strong>{user.telefono}</strong></p>}
        {user.telefono2&&<p className="text-sm text-gray-600">Telefono 2: <strong>{user.telefono2}</strong></p>}
        <p className="text-sm text-gray-600">Condominio: <strong>{user.condominii?.nome}</strong> · Int. {user.interno}</p>`
);

// 6. Login — carica anche email2, telefono, telefono2 nel profilo sessione
fix('login select profilo',
  `const profiles=await GET("profiles",\`id=eq.\${auth.user.id}&select=*,condominii(*)\`,auth.access_token);`,
  `const profiles=await GET("profiles",\`id=eq.\${auth.user.id}&select=*,condominii(*)\`,auth.access_token);`
// già usa select=* quindi prende tutto automaticamente
);

// 7. Assicura che CondominoPanel passi email2 al login (già incluso in select=*)
// Nessuna modifica necessaria — select=* include già i nuovi campi

fs.writeFileSync(file, c, 'utf8');
console.log('\n✅ Completato:', ok, 'modifiche applicate.');
console.log('Ora: git add src/App.jsx && git commit -m "aggiungi telefono2 email2 e notifiche doppie" && git push');
