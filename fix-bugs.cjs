const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE, 'Desktop', 'portale-mazzini', 'src', 'App.jsx');
let c = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
let ok = 0;

function fix(desc, from, to) {
  if (c.includes(from)) { c = c.split(from).join(to); ok++; console.log('OK:', desc); }
  else console.log('GIA OK (non trovato):', desc);
}

// 1. Rimuovi campi telefono/email duplicati in CondominioModal
fix('duplicati CondominioModal',
  '<Inp label="Telefono (opzionale)" value={f.telefono||""} onChange={e=>s("telefono",e.target.value)} placeholder="Es. 051 452244"/>\n      <Inp label="Email di contatto (opzionale)" type="email" value={f.email_contatto||""} onChange={e=>s("email_contatto",e.target.value)}/>\n      <Inp label="Telefono (opzionale)" value={f.telefono||""} onChange={e=>s("telefono",e.target.value)} placeholder="Es. 051 452244"/>\n      <Inp label="Email di contatto (opzionale)" type="email" value={f.email_contatto||""} onChange={e=>s("email_contatto",e.target.value)}/>',
  '<Inp label="Telefono (opzionale)" value={f.telefono||""} onChange={e=>s("telefono",e.target.value)} placeholder="Es. 051 452244"/>\n      <Inp label="Email di contatto (opzionale)" type="email" value={f.email_contatto||""} onChange={e=>s("email_contatto",e.target.value)}/>'
);

// 2. Rimuovi pulsante Gestisci importi duplicato in AdminRate
fix('duplicato btn Gestisci importi',
  '{rate.length>0&&<Btn variant="secondary" onClick={()=>setBulkModal(true)}>📊 Gestisci importi</Btn>}\n          {rate.length>0&&<Btn variant="secondary" onClick={()=>setBulkModal(true)}>📊 Gestisci importi</Btn>}',
  '{rate.length>0&&<Btn variant="secondary" onClick={()=>setBulkModal(true)}>📊 Gestisci importi</Btn>}'
);

// 3. Rimuovi BulkImportiModal duplicato in AdminRate
fix('duplicato BulkImportiModal render',
  '{bulkModal&&<BulkImportiModal condId={selCond} rate={rate} tok={tok} onClose={()=>setBulkModal(false)}/> }\n      {bulkModal&&<BulkImportiModal condId={selCond} rate={rate} tok={tok} onClose={()=>setBulkModal(false)}/>}',
  '{bulkModal&&<BulkImportiModal condId={selCond} rate={rate} tok={tok} onClose={()=>setBulkModal(false)}/>}'
);

// 3b. Variante senza spazio
fix('duplicato BulkImportiModal render v2',
  '{bulkModal&&<BulkImportiModal condId={selCond} rate={rate} tok={tok} onClose={()=>setBulkModal(false)}/>}\n      {bulkModal&&<BulkImportiModal condId={selCond} rate={rate} tok={tok} onClose={()=>setBulkModal(false)}/>}',
  '{bulkModal&&<BulkImportiModal condId={selCond} rate={rate} tok={tok} onClose={()=>setBulkModal(false)}/>}'
);

// 4. Aggiungi makeExCondomino e reattiva in AdminUtenti (prima del return)
fix('aggiungi makeExCondomino + reattiva',
  '  const remove=async id=>{\n    if(!window.confirm("Eliminare questo utente e tutti i suoi dati (documenti, inquilini, catastali, segnalazioni)?")) return;\n    try{\n      await DEL("segnalazioni",`user_id=eq.${id}`,tok);\n      await sb(`/auth/v1/admin/users/${id}`,{method:"DELETE",svc:true});\n      load();\n    }catch(e){alert(e.message);}\n  };',
  '  const remove=async id=>{\n    if(!window.confirm("Eliminare questo utente e tutti i suoi dati (documenti, inquilini, catastali, segnalazioni)?")) return;\n    try{\n      await DEL("segnalazioni",`user_id=eq.${id}`,tok);\n      await sb(`/auth/v1/admin/users/${id}`,{method:"DELETE",svc:true});\n      load();\n    }catch(e){alert(e.message);}\n  };\n  const makeExCondomino=async id=>{ if(!window.confirm("Impostare come ex-condomino? L\'utente non potrà più accedere alle funzioni complete.")) return; try{await PATCH("profiles",`id=eq.${id}`,{stato:"ex_condomino"},tok); load();}catch(e){alert(e.message);} };\n  const reattiva=async id=>{ if(!window.confirm("Riattivare questo utente?")) return; try{await PATCH("profiles",`id=eq.${id}`,{stato:"attivo"},tok); load();}catch(e){alert(e.message);} };'
);

// 5. Rimuovi commento duplicato InlineInquilini
fix('commento duplicato InlineInquilini',
  '// ── Inquilini inline per condominio ──────────────────────────────────────────────────────────────────\n// ── Admin Utenti',
  '// ── Admin Utenti'
);

fs.writeFileSync(file, c, 'utf8');
console.log('\n✅ Completato:', ok, 'fix applicati.');
console.log('Ora: git add src/App.jsx && git commit -m "fix bug portale" && git push');
