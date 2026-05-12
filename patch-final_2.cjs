const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE, 'Desktop', 'portale-mazzini', 'src', 'App.jsx');
let c = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
let ok = 0, fail = 0;

function rep(desc, from, to) {
  if (c.includes(from)) { c = c.split(from).join(to); ok++; console.log('OK:', desc); }
  else { fail++; console.log('NON TROVATO:', desc); }
}

// 1. Fix d.sent → d.inviati nel sendReminders
rep('fix d.sent',
  'd.sent>0?',
  'd.inviati>0?'
);
rep('fix ${d.sent}',
  '${d.sent} promemoria',
  '${d.inviati} promemoria'
);

// 2. Rimuovi inquilini dal nav
rep('nav inquilini',
  '    {id:"inquilini",   label:"Inquilini",        icon:"🏠"},\n',
  ''
);

// 3. Rimuovi view inquilini dal router
rep('view inquilini',
  '          {view==="inquilini"    && <AdminInquilini tok={user.token}/>}\n',
  ''
);

// 4. Aggiungi stato expanded in AdminCondominii
rep('expanded state',
  '  const [modal,setModal]=useState(null);\n  const save=async f=>{ try{modal.mode==="add"?await POST("condominii",f,tok):await PATCH("condominii",`id=eq.${f.id}`,f,tok); setModal(null); reload();}catch(e){alert(e.message);} };\n  const remove=async id=>{ if(!window.confirm("Eliminare?")) return; try{await DEL("condominii",`id=eq.${id}`,tok); reload();}catch(e){alert(e.message);} };',
  '  const [modal,setModal]=useState(null);\n  const [expanded,setExpanded]=useState(null);\n  const save=async f=>{ try{modal.mode==="add"?await POST("condominii",f,tok):await PATCH("condominii",`id=eq.${f.id}`,f,tok); setModal(null); reload();}catch(e){alert(e.message);} };\n  const remove=async id=>{ if(!window.confirm("Eliminare?")) return; try{await DEL("condominii",`id=eq.${id}`,tok); reload();}catch(e){alert(e.message);} };'
);

// 5. Aggiungi telefono+email_contatto nel form "+ Nuovo"
rep('nuovo cond dati',
  'data:{nome:"",indirizzo:"",cap:"",citta:""}',
  'data:{nome:"",indirizzo:"",cap:"",citta:"",telefono:"",email_contatto:""}'
);

// 6. Aggiorna la riga di ogni condominio con expand + telefono/email
rep('cond row expand',
  '          <div key={c.id} className={`flex items-center justify-between p-5 ${i<list.length-1?"border-b border-gray-50":""}`}>\n            <div className="flex items-center gap-4">\n              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-xl">🏢</div>\n              <div><p className="font-semibold text-gray-800">{c.nome}</p><p className="text-xs text-gray-400">{c.indirizzo} · {c.cap} {c.citta}</p></div>\n            </div>\n            <div className="flex gap-2">\n              <Btn variant="secondary" onClick={()=>setModal({mode:"edit",data:{...c}})}>Modifica</Btn>\n              <Btn variant="danger" onClick={()=>remove(c.id)}>Elimina</Btn>\n            </div>\n          </div>',
  '          <div key={c.id}>\n            <div className={`flex items-center justify-between p-5 ${i<list.length-1||expanded===c.id?"border-b border-gray-50":""}`}>\n              <div className="flex items-center gap-4">\n                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-xl">🏢</div>\n                <div>\n                  <p className="font-semibold text-gray-800">{c.nome}</p>\n                  <p className="text-xs text-gray-400">{c.indirizzo} · {c.cap} {c.citta}</p>\n                  {c.telefono&&<p className="text-xs text-gray-400">📞 {c.telefono}</p>}\n                  {c.email_contatto&&<p className="text-xs text-gray-400">✉️ {c.email_contatto}</p>}\n                </div>\n              </div>\n              <div className="flex gap-2">\n                <Btn variant="secondary" onClick={()=>setExpanded(expanded===c.id?null:c.id)}>{expanded===c.id?"▲ Inquilini":"▼ Inquilini"}</Btn>\n                <Btn variant="secondary" onClick={()=>setModal({mode:"edit",data:{...c}})}>Modifica</Btn>\n                <Btn variant="danger" onClick={()=>remove(c.id)}>Elimina</Btn>\n              </div>\n            </div>\n            {expanded===c.id&&<InlineInquilini condId={c.id} tok={tok}/>}\n          </div>'
);

// 7. Aggiungi telefono+email nel CondominioModal (prima del tasto salva)
rep('cond modal telefono',
  '      <div className="flex justify-end gap-3 pt-2"><Btn variant="secondary" onClick={onClose}>Annulla</Btn><Btn onClick={()=>f.nome&&onSave(f)} disabled={!f.nome}>Salva</Btn></div>\n    </Modal>\n  );\n}',
  '      <Inp label="Telefono (opzionale)" value={f.telefono||""} onChange={e=>s("telefono",e.target.value)} placeholder="Es. 051 452244"/>\n      <Inp label="Email di contatto (opzionale)" type="email" value={f.email_contatto||""} onChange={e=>s("email_contatto",e.target.value)}/>\n      <div className="flex justify-end gap-3 pt-2"><Btn variant="secondary" onClick={onClose}>Annulla</Btn><Btn onClick={()=>f.nome&&onSave(f)} disabled={!f.nome}>Salva</Btn></div>\n    </Modal>\n  );\n}'
);

// 8. Aggiungi componente InlineInquilini dopo AdminCondominii
const INLINE_INQ = `
// ── Inquilini inline per condominio ──────────────────────────────────────────
function InlineInquilini({condId,tok}) {
  const [users,setUsers]=useState([]); const [inqMap,setInqMap]=useState({});
  const [loading,setLoading]=useState(true); const [modal,setModal]=useState(null);
  const load=async()=>{
    setLoading(true);
    try{
      const us=await GET("profiles","cond_id=eq."+condId+"&role=eq.condomino&select=id,name,scala,interno&order=name",tok)||[];
      setUsers(us);
      if(us.length){
        const ids=us.map(u=>u.id).join(",");
        const inq=await GET("inquilini","user_id=in.("+ids+")&select=*",tok)||[];
        const map={};
        us.forEach(u=>{ map[u.id]=inq.filter(i=>i.user_id===u.id); });
        setInqMap(map);
      }
    }catch(e){console.error(e);}
    setLoading(false);
  };
  useEffect(()=>{load();},[condId,tok]);
  const save=async f=>{
    try{ modal.mode==="add"?await POST("inquilini",f,tok):await PATCH("inquilini","id=eq."+f.id,f,tok); setModal(null); load(); }catch(e){alert(e.message);}
  };
  const remove=async id=>{ if(window.confirm("Eliminare inquilino?")){ try{await DEL("inquilini","id=eq."+id,tok); load();}catch(e){alert(e.message);} } };
  if(loading) return <div className="px-5 py-4 bg-slate-50"><Spinner/></div>;
  if(!users.length) return <div className="px-5 py-3 bg-slate-50 text-sm text-gray-400">Nessun condomino registrato in questo condominio.</div>;
  return (
    <div className="bg-slate-50 border-t border-gray-100 px-5 py-4">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Inquilini per condomino</p>
      {users.map(u=>(
        <div key={u.id} className="mb-4 last:mb-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">Int. {u.interno} — {u.name}</span>
            <Btn variant="secondary" onClick={()=>setModal({mode:"add",data:{user_id:u.id,nome:"",email:"",tel:"",dal:"",al:""}})}>+ Inquilino</Btn>
          </div>
          {(inqMap[u.id]||[]).length===0&&<p className="text-xs text-gray-400 ml-2 mb-1">Nessun inquilino.</p>}
          {(inqMap[u.id]||[]).map(i=>(
            <div key={i.id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2 mb-1 border border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-800">{i.nome}</p>
                <p className="text-xs text-gray-400">{i.email||""}{i.tel?" · "+i.tel:""}{i.dal?" · Dal "+new Date(i.dal).toLocaleDateString("it-IT"):""}{i.al?" al "+new Date(i.al).toLocaleDateString("it-IT"):" (in corso)"}</p>
              </div>
              <div className="flex gap-2">
                <Btn variant="secondary" onClick={()=>setModal({mode:"edit",data:{...i}})}>✏️</Btn>
                <Btn variant="danger" onClick={()=>remove(i.id)}>🗑</Btn>
              </div>
            </div>
          ))}
        </div>
      ))}
      {modal&&<InqModal mode={modal.mode} data={modal.data} onSave={save} onClose={()=>setModal(null)}/>}
    </div>
  );
}

`;

rep('inserisci InlineInquilini',
  '\n// ── Admin Utenti',
  INLINE_INQ + '// ── Admin Utenti'
);

// 9. Aggiungi stato bulkModal in AdminRate
rep('rate bulk state',
  '  const [modal,setModal]=useState(null); const [importModal,setImportModal]=useState(null); const [sending,setSending]=useState(false);',
  '  const [modal,setModal]=useState(null); const [importModal,setImportModal]=useState(null); const [sending,setSending]=useState(false); const [bulkModal,setBulkModal]=useState(false);'
);

// 10. Aggiungi pulsante "Gestisci importi" in AdminRate
rep('rate bulk btn',
  '          <Btn variant="warning" onClick={sendReminders} disabled={sending}>{sending?"Invio...":"📧 Invia promemoria"}</Btn>',
  '          <Btn variant="warning" onClick={sendReminders} disabled={sending}>{sending?"Invio...":"📧 Invia promemoria"}</Btn>\n          {rate.length>0&&<Btn variant="secondary" onClick={()=>setBulkModal(true)}>📊 Gestisci importi</Btn>}'
);

// 11. Aggiungi render di BulkImportiModal in AdminRate
rep('rate bulk render',
  '      {importModal&&<ImportImportiModal rata={importModal} condId={selCond} tok={tok} onClose={()=>setImportModal(null)}/>}',
  '      {importModal&&<ImportImportiModal rata={importModal} condId={selCond} tok={tok} onClose={()=>setImportModal(null)}/>}\n      {bulkModal&&<BulkImportiModal condId={selCond} rate={rate} tok={tok} onClose={()=>setBulkModal(false)}/>}'
);

// 12. Inserisci BulkImportiModal prima di ImportImportiModal
const BULK_MODAL = `function BulkImportiModal({condId,rate,tok,onClose}) {
  const [users,setUsers]=useState([]); const [vals,setVals]=useState({}); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false);
  useEffect(()=>{
    (async()=>{
      setLoading(true);
      try{
        const us=await GET("profiles","cond_id=eq."+condId+"&role=eq.condomino&select=id,name,scala,interno&order=name",tok)||[];
        setUsers(us);
        const existing={};
        if(us.length){
          for(const r of rate){
            const ids=us.map(u=>u.id).join(",");
            const imp=await GET("rate_condomino","rata_id=eq."+r.id+"&user_id=in.("+ids+")&select=*",tok)||[];
            imp.forEach(i=>{ existing[r.id+":"+i.user_id]=String(i.importo||""); });
          }
        }
        setVals(existing);
      }catch(e){console.error(e);}
      setLoading(false);
    })();
  },[condId,rate,tok]);
  const setVal=(rataId,userId,v)=>setVals(p=>({...p,[rataId+":"+userId]:v}));
  const save=async()=>{
    setSaving(true);
    try{
      for(const r of rate){
        for(const u of users){
          const key=r.id+":"+u.id;
          const imp=parseFloat((vals[key]||"").replace(",","."));
          if(!isNaN(imp)&&imp>0) await UPS("rate_condomino",{rata_id:r.id,user_id:u.id,importo:imp,notificato:false},tok);
        }
      }
      alert("Importi salvati correttamente!");
      onClose();
    }catch(e){alert(e.message);}
    setSaving(false);
  };
  return (
    <Modal title="Gestione importi — tutte le rate" onClose={onClose}>
      {loading?<Spinner/>:(
        <>
          <p className="text-xs text-gray-400 mb-3">Inserisci o modifica gli importi per ogni condomino e ogni rata. Lascia vuoto per non modificare.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-2 pr-4 text-gray-600 font-semibold min-w-32">Condomino</th>
                  {rate.map(r=><th key={r.id} className="text-center py-2 px-2 text-gray-600 font-semibold whitespace-nowrap">Rata {r.numero_rata}<br/><span className="font-normal text-xs text-gray-400">{new Date(r.data_scadenza).toLocaleDateString("it-IT")}</span></th>)}
                </tr>
              </thead>
              <tbody>
                {users.map(u=>(
                  <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 pr-4 text-gray-800 text-sm font-medium whitespace-nowrap">Int.{u.interno} {u.name}</td>
                    {rate.map(r=>(
                      <td key={r.id} className="py-1 px-1 text-center">
                        <input type="text" value={vals[r.id+":"+u.id]||""} onChange={e=>setVal(r.id,u.id,e.target.value)}
                          className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-center text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="€"/>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Btn variant="secondary" onClick={onClose}>Annulla</Btn>
            <Btn onClick={save} disabled={saving}>{saving?"Salvataggio...":"Salva tutti gli importi"}</Btn>
          </div>
        </>
      )}
    </Modal>
  );
}

`;

rep('inserisci BulkImportiModal',
  'function ImportImportiModal(',
  BULK_MODAL + 'function ImportImportiModal('
);

fs.writeFileSync(file, c, 'utf8');
console.log('\n--- Risultato: ' + ok + ' OK, ' + fail + ' non trovati ---');
if(fail===0) console.log('Tutto OK! Ora: git add . && git commit -m "aggiornamento portale v2" && git push');
else console.log('Alcuni pattern non trovati — dimmi quali e sistemiamo.');
