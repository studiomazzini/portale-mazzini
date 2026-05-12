const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE, 'Desktop', 'portale-mazzini', 'src', 'App.jsx');
let c = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
let ok = 0;

function fix(desc, from, to) {
  if (c.includes(from)) { c = c.split(from).join(to); ok++; console.log('OK:', desc); }
  else console.log('NON TROVATO:', desc);
}

// ── 1. UtenteModal — anagrafica completa ──────────────────────────────────────
fix('UtenteModal anagrafica completa',
  `function UtenteModal({mode,data,condominii,onSave,onClose}) {
  const [f,setF]=useState(data); const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <Modal title={mode==="add"?"Nuovo Utente":"Modifica Utente"} onClose={onClose}>
      <Inp label="Nome e Cognome" value={f.name} onChange={e=>s("name",e.target.value)}/>
      {mode==="add"&&<><Inp label="Email (opzionale)" type="email" value={f.email} onChange={e=>s("email",e.target.value)} hint="Lascia vuoto se senza email"/><Inp label="Password" value={f.pwd} onChange={e=>s("pwd",e.target.value)}/></>}
      {mode==="edit"&&<Inp label="Email" type="email" value={f.email||""} onChange={e=>s("email",e.target.value)}/>}
      <Sel label="Condominio" value={f.cond_id} onChange={e=>s("cond_id",e.target.value)}>
        <option value="">— Seleziona —</option>
        {condominii?.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
      </Sel>
      <div className="flex gap-3"><div className="flex-1"><Inp label="Civico" value={f.scala} onChange={e=>s("scala",e.target.value)}/></div><div className="flex-1"><Inp label="Interno" value={f.interno} onChange={e=>s("interno",e.target.value)}/></div></div>
      <div className="flex gap-3"><div className="flex-1"><Inp label="Telefono 1" value={f.telefono||""} onChange={e=>s("telefono",e.target.value)} placeholder="Es. 051 452244"/></div><div className="flex-1"><Inp label="Telefono 2" value={f.telefono2||""} onChange={e=>s("telefono2",e.target.value)} placeholder="Es. 333 1234567"/></div></div>
      <Inp label="Email 2 (opzionale)" type="email" value={f.email2||""} onChange={e=>s("email2",e.target.value)} hint="Riceverà le notifiche insieme alla email principale"/>
      <div className="flex justify-end gap-3 pt-2"><Btn variant="secondary" onClick={onClose}>Annulla</Btn><Btn onClick={()=>f.name&&onSave(f)}>Salva</Btn></div>
    </Modal>
  );
}`,
  `function UtenteModal({mode,data,condominii,onSave,onClose}) {
  const [f,setF]=useState(data); const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <Modal title={mode==="add"?"Nuovo Utente":"Modifica Utente"} onClose={onClose}>
      <div className="flex gap-3">
        <div style={{width:"20%"}}><Inp label="Titolo" value={f.titolo||""} onChange={e=>s("titolo",e.target.value)} placeholder="Sig."/></div>
        <div className="flex-1"><Inp label="Nome" value={f.nome||""} onChange={e=>s("nome",e.target.value)}/></div>
        <div className="flex-1"><Inp label="Cognome" value={f.cognome||""} onChange={e=>s("cognome",e.target.value)}/></div>
      </div>
      <Inp label="C/O (Presso)" value={f.presso||""} onChange={e=>s("presso",e.target.value)} placeholder="opzionale"/>
      {mode==="add"&&<><Inp label="Email (opzionale)" type="email" value={f.email||""} onChange={e=>s("email",e.target.value)} hint="Lascia vuoto se senza email"/><Inp label="Password" value={f.pwd||""} onChange={e=>s("pwd",e.target.value)}/></>}
      {mode==="edit"&&<Inp label="Email" type="email" value={f.email||""} onChange={e=>s("email",e.target.value)}/>}
      <Inp label="Email 2" type="email" value={f.email2||""} onChange={e=>s("email2",e.target.value)} hint="Riceve le notifiche insieme alla email principale"/>
      <Sel label="Condominio" value={f.cond_id} onChange={e=>s("cond_id",e.target.value)}>
        <option value="">— Seleziona —</option>
        {condominii?.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
      </Sel>
      <div className="flex gap-3"><div className="flex-1"><Inp label="Civico/Scala" value={f.scala||""} onChange={e=>s("scala",e.target.value)}/></div><div className="flex-1"><Inp label="Interno" value={f.interno||""} onChange={e=>s("interno",e.target.value)}/></div></div>
      <div className="flex gap-3"><div className="flex-1"><Inp label="Via" value={f.via||""} onChange={e=>s("via",e.target.value)}/></div><div style={{width:"30%"}}><Inp label="CAP" value={f.cap||""} onChange={e=>s("cap",e.target.value)}/></div></div>
      <div className="flex gap-3"><div className="flex-1"><Inp label="Località" value={f.localita||""} onChange={e=>s("localita",e.target.value)}/></div><div style={{width:"20%"}}><Inp label="Prov." value={f.prov||""} onChange={e=>s("prov",e.target.value)}/></div></div>
      <div className="flex gap-3"><div className="flex-1"><Inp label="Tel. 1" value={f.telefono||""} onChange={e=>s("telefono",e.target.value)}/></div><div className="flex-1"><Inp label="Tel. 2" value={f.telefono2||""} onChange={e=>s("telefono2",e.target.value)}/></div></div>
      <div className="flex gap-3"><div className="flex-1"><Inp label="Cell. 1" value={f.cell||""} onChange={e=>s("cell",e.target.value)}/></div><div className="flex-1"><Inp label="Cell. 2" value={f.cell2||""} onChange={e=>s("cell2",e.target.value)}/></div></div>
      <div className="flex justify-end gap-3 pt-2"><Btn variant="secondary" onClick={onClose}>Annulla</Btn><Btn onClick={()=>(f.nome||f.cognome||f.name)&&onSave({...f,name:(f.titolo?f.titolo+" ":"")+((f.nome||"")+" "+(f.cognome||"")).trim()||f.name})}>Salva</Btn></div>
    </Modal>
  );
}`
);

// ── 2. AdminUtenti save — salva tutti i campi ─────────────────────────────────
fix('AdminUtenti save campi completi',
  `await PATCH("profiles",\`id=eq.\${f.id}\`,{name:f.name,cond_id:Number(f.cond_id),scala:f.scala,interno:f.interno,email:f.email||null,email2:f.email2||null,telefono:f.telefono||null,telefono2:f.telefono2||null},tok);`,
  `await PATCH("profiles",\`id=eq.\${f.id}\`,{name:f.name,cond_id:Number(f.cond_id),scala:f.scala,interno:f.interno,email:f.email||null,email2:f.email2||null,telefono:f.telefono||null,telefono2:f.telefono2||null,cell:f.cell||null,cell2:f.cell2||null,nome:f.nome||null,cognome:f.cognome||null,titolo:f.titolo||null,presso:f.presso||null,via:f.via||null,localita:f.localita||null,prov:f.prov||null,cap:f.cap||null,num:f.num||null,tipo:f.tipo||null},tok);`
);

// ── 3. AdminImport — aggiorna parser Excel con nuove colonne ──────────────────
fix('AdminImport nuove colonne',
  `const nome=col(r,["Cognome e Nome","Nome","NOME","Cognome"]).trim()||col(r,["Cognome e Nome","COGNOME E NOME"]).trim();`,
  `const cognome=col(r,["Cognome","COGNOME"]).trim();
        const nomeR=col(r,["Nome","NOME"]).trim();
        const titolo=col(r,["Titolo","TITOLO"]).trim();
        const nome=(titolo?(titolo+" "):"")+nomeR+" "+cognome;`
);

fix('AdminImport campi import',
  `await POST("profiles",{id:uid,name:f.name,role:"condomino",cond_id:Number(f.cond_id),scala:f.scala,interno:f.interno,email:isRealEmail(f.email)?f.email:null},tok);`,
  `await POST("profiles",{id:uid,name:importData.nome?.trim()||f.name,role:"condomino",cond_id:Number(f.cond_id),scala:f.scala,interno:f.interno,email:isRealEmail(f.email)?f.email:null,email2:isRealEmail(col(importData,["E-mail 2","Email 2"]))?col(importData,["E-mail 2","Email 2"]):null,telefono:col(importData,["Tel","TEL"])||null,telefono2:col(importData,["Tel2","TEL2"])||null,cell:col(importData,["Cell","CELL"])||null,cell2:col(importData,["Cell2","CELL2"])||null,cognome:col(importData,["Cognome","COGNOME"])||null,nome:col(importData,["Nome","NOME"])||null,titolo:col(importData,["Titolo","TITOLO"])||null,presso:col(importData,["Presso","PRESSO"])||null,via:col(importData,["Via","VIA"])||null,localita:col(importData,["Località","LOCALITA"])||null,prov:col(importData,["Prov.","PROV"])||null,cap:col(importData,["CAP"])||null,num:col(importData,["Num.","NUM"])||null,tipo:col(importData,["U/C/CP","TIPO"])||null},tok);`
);

// ── 4. Aggiungi sezione "Modifica profilo" nel pannello condomino ─────────────
fix('nav modifica profilo condomino',
  '{id:"account",      label:"Account",         icon:"⚙️"}',
  '{id:"profilo",      label:"Il mio profilo",  icon:"👤"},\n        {id:"account",      label:"Account",         icon:"⚙️"}'
);

fix('router modifica profilo condomino',
  '{view==="account"       && <CondAccount user={user} setUser={setUser}/>}',
  '{view==="profilo"       && <CondProfilo user={user} setUser={setUser}/>}\n            {view==="account"       && <CondAccount user={user} setUser={setUser}/>}'
);

// ── 5. Inserisci componente CondProfilo prima di CondAccount ──────────────────
const COND_PROFILO = `
function CondProfilo({user, setUser}) {
  const SBU = import.meta.env.VITE_SUPABASE_URL;
  const SBK = import.meta.env.VITE_SUPABASE_KEY;
  const [f,setF]=useState({
    titolo:user.titolo||"", nome:user.nome||"", cognome:user.cognome||"",
    presso:user.presso||"", via:user.via||"", localita:user.localita||"",
    prov:user.prov||"", cap:user.cap||"", telefono:user.telefono||"",
    telefono2:user.telefono2||"", cell:user.cell||"", cell2:user.cell2||"",
    email2:user.email2||""
  });
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const [saving,setSaving]=useState(false); const [saved,setSaved]=useState(false);

  const save=async()=>{
    setSaving(true);
    try{
      const nome_display=((f.titolo?f.titolo+" ":"")+f.nome+" "+f.cognome).trim()||user.name;
      await fetch(SBU+"/rest/v1/profiles?id=eq."+user.id,{
        method:"PATCH",
        headers:{apikey:SBK,"Authorization":"Bearer "+user.token,"Content-Type":"application/json","Prefer":"return=minimal"},
        body:JSON.stringify({name:nome_display,titolo:f.titolo||null,nome:f.nome||null,cognome:f.cognome||null,presso:f.presso||null,via:f.via||null,localita:f.localita||null,prov:f.prov||null,cap:f.cap||null,telefono:f.telefono||null,telefono2:f.telefono2||null,cell:f.cell||null,cell2:f.cell2||null,email2:f.email2||null})
      });
      // Notifica admin
      try{
        const studio=await fetch(SBU+"/rest/v1/contatti?select=email&limit=1",{headers:{apikey:SBK,"Authorization":"Bearer "+user.token}});
        const studioData=await studio.json();
        const adminEmail=studioData?.[0]?.email;
        if(adminEmail){
          await fetch("/.netlify/functions/send-email",{
            method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({
              to:[adminEmail],
              subject:"Modifica anagrafica — "+nome_display,
              html:"<p>Il condomino <strong>"+nome_display+"</strong> ha modificato la propria anagrafica.</p>"
                +"<p><strong>Condominio:</strong> "+user.condominii?.nome+"</p>"
                +"<p><strong>Interno:</strong> "+user.interno+"</p>"
                +"<p>Effettua il login al portale per visualizzare i dati aggiornati.</p>"
            })
          });
        }
      }catch(e){console.warn("Notifica admin fallita",e);}
      if(setUser) setUser(p=>({...p,...f,name:nome_display}));
      setSaved(true); setTimeout(()=>setSaved(false),3000);
    }catch(e){alert(e.message);}
    setSaving(false);
  };

  return (
    <div>
      <h2 className="text-2xl font-black text-gray-800 mb-2">Il mio profilo</h2>
      <p className="text-gray-400 text-sm mb-5">Modifica i tuoi dati anagrafici. Lo studio riceverà una notifica.</p>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
        <div className="flex gap-3">
          <div style={{width:"20%"}}><Inp label="Titolo" value={f.titolo} onChange={e=>s("titolo",e.target.value)} placeholder="Sig."/></div>
          <div className="flex-1"><Inp label="Nome" value={f.nome} onChange={e=>s("nome",e.target.value)}/></div>
          <div className="flex-1"><Inp label="Cognome" value={f.cognome} onChange={e=>s("cognome",e.target.value)}/></div>
        </div>
        <Inp label="C/O (Presso)" value={f.presso} onChange={e=>s("presso",e.target.value)} placeholder="opzionale"/>
        <Inp label="Email principale" value={user.email||""} disabled hint="Non modificabile — contatta lo studio"/>
        <Inp label="Email 2" type="email" value={f.email2} onChange={e=>s("email2",e.target.value)} hint="Riceve le notifiche insieme alla email principale"/>
        <Inp label="Via / Indirizzo di residenza" value={f.via} onChange={e=>s("via",e.target.value)}/>
        <div className="flex gap-3">
          <div className="flex-1"><Inp label="Località" value={f.localita} onChange={e=>s("localita",e.target.value)}/></div>
          <div style={{width:"20%"}}><Inp label="Prov." value={f.prov} onChange={e=>s("prov",e.target.value)}/></div>
          <div style={{width:"25%"}}><Inp label="CAP" value={f.cap} onChange={e=>s("cap",e.target.value)}/></div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1"><Inp label="Telefono 1" value={f.telefono} onChange={e=>s("telefono",e.target.value)}/></div>
          <div className="flex-1"><Inp label="Telefono 2" value={f.telefono2} onChange={e=>s("telefono2",e.target.value)}/></div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1"><Inp label="Cellulare 1" value={f.cell} onChange={e=>s("cell",e.target.value)}/></div>
          <div className="flex-1"><Inp label="Cellulare 2" value={f.cell2} onChange={e=>s("cell2",e.target.value)}/></div>
        </div>
        <div className="flex items-center justify-between pt-2">
          {saved&&<span className="text-sm text-emerald-600 font-semibold">✓ Dati salvati</span>}
          {!saved&&<span/>}
          <Btn onClick={save} disabled={saving}>{saving?"Salvataggio...":"Salva modifiche"}</Btn>
        </div>
      </div>
    </div>
  );
}

`;

fix('inserisci CondProfilo',
  '\nfunction CondAccount(',
  COND_PROFILO + 'function CondAccount('
);

fs.writeFileSync(file, c, 'utf8');
console.log('\n✅ Completato:', ok, 'modifiche applicate.');
console.log('Ora: git add src/App.jsx && git commit -m "anagrafica completa import Excel e modifica profilo" && git push');
