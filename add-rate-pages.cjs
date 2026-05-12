const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE, 'Desktop', 'portale-mazzini', 'src', 'App.jsx');
let c = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
let ok = 0;

function fix(desc, from, to) {
  if (c.includes(from)) { c = c.split(from).join(to); ok++; console.log('OK:', desc); }
  else console.log('NON TROVATO:', desc);
}

// ── 1. Nav admin: aggiungi "Rate in Scadenza" ─────────────────────────────────
fix('nav scadenze admin',
  '    {id:"segnalazioni",label:"Segnalazioni",     icon:"🚨"},',
  '    {id:"scadenze",    label:"Rate in Scadenza", icon:"⏰"},\n    {id:"segnalazioni",label:"Segnalazioni",     icon:"🚨"},'
);

// ── 2. Router admin ───────────────────────────────────────────────────────────
fix('router scadenze admin',
  '{view==="segnalazioni" && <AdminSegnalazioni tok={user.token}/>}',
  '{view==="scadenze"     && <AdminScadenze tok={user.token}/>}\n          {view==="segnalazioni" && <AdminSegnalazioni tok={user.token}/>}'
);

// ── 3. Nav condomino: aggiungi "Le mie rate" ──────────────────────────────────
fix('nav rate condomino',
  '{id:"cat",          label:"Dati Catastali", icon:"📊"},',
  '{id:"rate",         label:"Le mie rate",    icon:"💶"},\n        {id:"cat",          label:"Dati Catastali", icon:"📊"},'
);

// ── 4. Router condomino ───────────────────────────────────────────────────────
fix('router rate condomino',
  '{view==="cat"          && !isEx && <CondCatastali user={user}/>}',
  '{view==="rate"         && !isEx && <CondRate user={user}/>}\n            {view==="cat"          && !isEx && <CondCatastali user={user}/>}'
);

// ── 5. Componente AdminScadenze ───────────────────────────────────────────────
const ADMIN_SCADENZE = `
// ── Admin Rate in Scadenza ────────────────────────────────────────────────────
function AdminScadenze({tok}) {
  const SBU = import.meta.env.VITE_SUPABASE_URL;
  const SBK = import.meta.env.VITE_SUPABASE_KEY;
  const hdr = {apikey:SBK, Authorization:"Bearer "+tok};
  const [righe,setRighe]=useState([]); const [loading,setLoading]=useState(true);
  const [sending,setSending]=useState({});

  const load=async()=>{
    setLoading(true);
    try{
      const oggi=new Date().toISOString().split("T")[0];
      const fra15=new Date(); fra15.setDate(fra15.getDate()+15);
      const lim=fra15.toISOString().split("T")[0];
      const r1=await fetch(SBU+"/rest/v1/rate_condominio?select=id,data_scadenza,numero_rata,descrizione,condominii(id,nome,citta)&data_scadenza=gte."+oggi+"&data_scadenza=lte."+lim+"&order=data_scadenza",{headers:hdr});
      const rate=await r1.json();
      if(!Array.isArray(rate)||!rate.length){setRighe([]); setLoading(false); return;}
      const ids=rate.map(r=>r.id).join(",");
      const r2=await fetch(SBU+"/rest/v1/rate_condomino?select=id,importo,notificato,user_id,rata_id,profiles(name,email)&rata_id=in.("+ids+")",{headers:hdr});
      const imp=await r2.json()||[];
      setRighe(rate.map(r=>({...r,importi:Array.isArray(imp)?imp.filter(i=>i.rata_id===r.id):[]})));
    }catch(e){console.error(e);}
    setLoading(false);
  };

  useEffect(()=>{load();},[tok]);

  const inviaUno=async(rata,imp)=>{
    const k=imp.id; setSending(p=>({...p,[k]:true}));
    try{
      const email=imp.profiles?.email;
      if(!email||email.includes("@noemail.local")){alert("Nessuna email per questo condomino."); setSending(p=>({...p,[k]:false})); return;}
      const res=await fetch("/.netlify/functions/send-email",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          to:[email],
          subject:"Promemoria rata condominiale - scadenza "+rata.data_scadenza,
          html:"<p>Gentile <strong>"+imp.profiles.name+"</strong>,</p>"
            +"<p>Le ricordiamo che è in scadenza il <strong>"+rata.data_scadenza+"</strong> la rata n.<strong>"+rata.numero_rata+"</strong>"
            +(rata.condominii?" del condominio <strong>"+rata.condominii.nome+"</strong>":"")
            +" di importo <strong>EUR "+imp.importo+"</strong>.</p>"
            +"<p>Cordiali saluti,<br>Studio Amministrazioni Immobiliari Mazzini &amp; C.</p>"
        })
      });
      if(res.ok){
        await fetch(import.meta.env.VITE_SUPABASE_URL+"/rest/v1/rate_condomino?id=eq."+imp.id,{method:"PATCH",headers:{...hdr,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({notificato:true})});
        load();
      }else{alert("Errore invio email.");}
    }catch(e){alert(e.message);}
    setSending(p=>({...p,[k]:false}));
  };

  const inviaTutti=async(rata)=>{
    const dest=rata.importi.filter(i=>!i.notificato&&i.profiles?.email&&!i.profiles.email.includes("@noemail.local"));
    if(!dest.length){alert("Nessun destinatario con email disponibile."); return;}
    if(!window.confirm("Inviare promemoria a "+dest.length+" condomino/i?")) return;
    for(const i of dest) await inviaUno(rata,i);
  };

  const diffGiorni=d=>Math.ceil((new Date(d)-new Date())/(1000*60*60*24));
  const etichettaGiorni=d=>{const g=diffGiorni(d); return g===0?"scade oggi":g===1?"scade domani":"tra "+g+" giorni";};
  const coloreBordo=d=>{const g=diffGiorni(d); return g<=3?"border-red-300 bg-red-50":g<=7?"border-amber-300 bg-amber-50":"border-blue-200 bg-blue-50";};
  const coloreGiorni=d=>{const g=diffGiorni(d); return g<=3?"text-red-600 font-bold":g<=7?"text-amber-600 font-semibold":"text-blue-600";};

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h2 className="text-2xl font-black text-gray-800">Rate in Scadenza</h2><p className="text-gray-400 text-sm">Scadenze nei prossimi 15 giorni — tutti i condomìni</p></div>
        <Btn variant="secondary" onClick={load}>↺ Aggiorna</Btn>
      </div>
      {loading?<Spinner/>:!righe.length?<div className="bg-white rounded-2xl border border-gray-100 shadow-sm"><EmptyState icon="✅" text="Nessuna rata in scadenza nei prossimi 15 giorni."/></div>
      :righe.map(rata=>(
        <div key={rata.id} className={"mb-4 rounded-2xl border shadow-sm overflow-hidden "+coloreBordo(rata.data_scadenza)}>
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-lg font-black text-gray-800">Rata {rata.numero_rata}</span>
                {rata.condominii&&<span className="text-sm text-gray-600 font-medium">{rata.condominii.nome} · {rata.condominii.citta}</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">📅 {new Date(rata.data_scadenza).toLocaleDateString("it-IT")}</span>
                <span className={"text-sm "+coloreGiorni(rata.data_scadenza)}>⏰ {etichettaGiorni(rata.data_scadenza)}</span>
                {rata.descrizione&&<span className="text-xs text-gray-400">{rata.descrizione}</span>}
              </div>
            </div>
            <Btn onClick={()=>inviaTutti(rata)}>
              📧 Invia a tutti ({rata.importi.filter(i=>!i.notificato&&i.profiles?.email&&!i.profiles.email.includes("@noemail.local")).length})
            </Btn>
          </div>
          <div className="bg-white border-t border-gray-100">
            {!rata.importi.length
              ?<div className="px-5 py-3 text-sm text-gray-400">Nessun importo caricato per questa rata.</div>
              :rata.importi.map((imp,idx)=>{
                const haEmail=imp.profiles?.email&&!imp.profiles.email.includes("@noemail.local");
                return (
                  <div key={imp.id} className={"flex items-center justify-between px-5 py-3 "+(idx<rata.importi.length-1?"border-b border-gray-50":"")}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-sm font-bold text-gray-600">{imp.profiles?.name?.charAt(0)||"?"}</div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{imp.profiles?.name||"—"}</p>
                        <p className="text-xs text-gray-400">{haEmail?imp.profiles.email:"nessuna email"} · <strong>EUR {imp.importo}</strong></p>
                      </div>
                    </div>
                    {imp.notificato
                      ?<span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-3 py-1 rounded-full">✓ Notificato</span>
                      :<Btn variant="secondary" disabled={!haEmail||sending[imp.id]} onClick={()=>inviaUno(rata,imp)}>{sending[imp.id]?"Invio...":"📧 Notifica"}</Btn>
                    }
                  </div>
                );
              })
            }
          </div>
        </div>
      ))}
    </div>
  );
}

`;

fix('inserisci AdminScadenze',
  '\n// ── Admin Segnalazioni',
  ADMIN_SCADENZE + '// ── Admin Segnalazioni'
);

// ── 6. Componente CondRate ────────────────────────────────────────────────────
const COND_RATE = `
function CondRate({user}) {
  const SBU = import.meta.env.VITE_SUPABASE_URL;
  const SBK = import.meta.env.VITE_SUPABASE_KEY;
  const [rate,setRate]=useState([]); const [loading,setLoading]=useState(true);

  useEffect(()=>{
    (async()=>{
      setLoading(true);
      try{
        const r1=await fetch(SBU+"/rest/v1/rate_condominio?select=id,numero_rata,data_scadenza,descrizione&cond_id=eq."+user.cond_id+"&order=data_scadenza",
          {headers:{apikey:SBK,Authorization:"Bearer "+user.token}});
        const rateDef=await r1.json()||[];
        if(!rateDef.length){setRate([]); setLoading(false); return;}
        const ids=rateDef.map(r=>r.id).join(",");
        const r2=await fetch(SBU+"/rest/v1/rate_condomino?select=id,importo,notificato,rata_id&rata_id=in.("+ids+")&user_id=eq."+user.id,
          {headers:{apikey:SBK,Authorization:"Bearer "+user.token}});
        const importi=await r2.json()||[];
        const impMap={};
        if(Array.isArray(importi)) importi.forEach(i=>{impMap[i.rata_id]=i;});
        setRate(rateDef.map(r=>({...r,importo:impMap[r.id]?.importo||null,notificato:impMap[r.id]?.notificato||false})));
      }catch(e){console.error(e);}
      setLoading(false);
    })();
  },[user.token,user.cond_id,user.id]);

  const oggi=new Date();
  const diffGiorni=d=>Math.ceil((new Date(d)-oggi)/(1000*60*60*24));
  const isScaduta=d=>diffGiorni(d)<0;
  const isInScadenza=d=>{const g=diffGiorni(d); return g>=0&&g<=15;};

  return (
    <div>
      <h2 className="text-2xl font-black text-gray-800 mb-2">Le mie rate</h2>
      <p className="text-gray-400 text-sm mb-5">Piano rate del tuo condominio con gli importi a tuo carico.</p>
      {loading?<Spinner/>:!rate.length?<div className="bg-white rounded-2xl border border-gray-100 shadow-sm"><EmptyState icon="📅" text="Nessuna rata configurata per il tuo condominio."/></div>
      :(
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {rate.map((r,i)=>{
            const scaduta=isScaduta(r.data_scadenza);
            const inScadenza=isInScadenza(r.data_scadenza);
            const g=diffGiorni(r.data_scadenza);
            return (
              <div key={r.id} className={"p-5 "+(i<rate.length-1?"border-b border-gray-50":"")}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={"w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg "+(scaduta?"bg-red-100 text-red-600":inScadenza?"bg-amber-100 text-amber-600":"bg-blue-50 text-blue-600")}>
                      {r.numero_rata}
                    </div>
                    <div>
                      <p className="font-bold text-gray-800">Rata {r.numero_rata}{r.descrizione?" · "+r.descrizione:""}</p>
                      <p className="text-xs text-gray-400">Scadenza: {new Date(r.data_scadenza).toLocaleDateString("it-IT")}</p>
                      {scaduta&&<span className="text-xs text-red-500 font-semibold">Scaduta</span>}
                      {inScadenza&&!scaduta&&<span className="text-xs text-amber-500 font-semibold">{g===0?"Scade oggi":g===1?"Scade domani":"Scade tra "+g+" giorni"}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    {r.importo!=null
                      ?<p className="text-xl font-black text-gray-800">EUR {Number(r.importo).toFixed(2)}</p>
                      :<p className="text-sm text-gray-400 italic">Importo non ancora definito</p>
                    }
                    {r.notificato&&<p className="text-xs text-emerald-600 font-semibold mt-0.5">✓ Promemoria inviato</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-gray-400 mt-4 text-center">Per informazioni sugli importi contatta lo studio.</p>
    </div>
  );
}

`;

fix('inserisci CondRate',
  '\nfunction CondInquilini(',
  COND_RATE + 'function CondInquilini('
);

fs.writeFileSync(file, c, 'utf8');
console.log('\n✅ Completato:', ok, 'modifiche applicate.');
console.log('Ora: git add src/App.jsx && git commit -m "aggiungi pagina scadenze e rate condomino" && git push');
