const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE, 'Desktop', 'portale-mazzini', 'src', 'App.jsx');
let lines = fs.readFileSync(file, 'utf8').split('\n');

// Trova inizio e fine di AdminImport
let start = -1, end = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('function AdminImport(')) start = i;
  if (start > -1 && i > start && lines[i].match(/^function [A-Z]/) && end === -1) { end = i; break; }
  if (start > -1 && i > start && lines[i].match(/^\/\/ ──/) && end === -1) { end = i; break; }
}
if (start === -1) { console.log('AdminImport non trovato'); process.exit(1); }
console.log('AdminImport: righe ' + (start+1) + ' → ' + end);

const NEW_IMPORT = `function AdminImport({tok}) {
  const {data:condominii}=useData(()=>GET("condominii","select=id,nome,citta&order=nome",tok),[tok]);
  const [selCond,setSelCond]=useState(""); const [rows,setRows]=useState([]); const [preview,setPreview]=useState(false);
  const [importing,setImporting]=useState(false); const [progress,setProgress]=useState(0); const [results,setResults]=useState(null); const [err,setErr]=useState("");
  useEffect(()=>{ if(condominii?.length&&!selCond) setSelCond(String(condominii[0].id)); },[condominii]);

  const parseExcel=async file=>{
    setErr(""); setRows([]); setPreview(false); setResults(null);
    try{
      const XLSX=await import("https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs");
      const buf=await file.arrayBuffer(); const wb=XLSX.read(buf); const ws=wb.Sheets[wb.SheetNames[0]];
      const data=XLSX.utils.sheet_to_json(ws,{defval:""});
      const g=(row,names)=>{ for(const n of names){ const v=row[n]; if(v!==undefined&&String(v).trim()!=="") return String(v).trim(); } return ""; };
      const parsed=data.filter(r=>g(r,["Cognome","COGNOME"])||g(r,["Nome","NOME"])).map(r=>{
        const cognome=g(r,["Cognome","COGNOME"]);
        const nome=g(r,["Nome","NOME"]);
        const titolo=g(r,["Titolo","TITOLO"]);
        const nomeCompleto=((titolo?titolo+" ":"")+nome+" "+cognome).trim();
        const primoToken=cognome||nome||"Utente";
        const token=primoToken.charAt(0).toUpperCase()+primoToken.slice(1,4).toLowerCase();
        const mese=String(new Date().getMonth()+1).padStart(2,"0");
        return {
          num:       g(r,["Num.","NUM","Num"]),
          tipo:      g(r,["U/C/CP","TIPO","Tipo"]),
          cognome,   nome,   titolo,
          nomeCompleto,
          presso:    g(r,["Presso","PRESSO"]),
          via:       g(r,["Via","VIA"]),
          localita:  g(r,["Località","Localita","LOCALITA","Località"]),
          prov:      g(r,["Prov.","PROV","Prov"]),
          cap:       g(r,["CAP","Cap"]),
          email:     g(r,["E-mail","Email","EMAIL","E-Mail","e-mail"]),
          email2:    g(r,["E-mail 2","Email 2","EMAIL 2","E-Mail 2"]),
          tel:       g(r,["Tel","TEL","Tel."]),
          tel2:      g(r,["Tel2","TEL2","Tel.2"]),
          cell:      g(r,["Cell","CELL","Cell."]),
          cell2:     g(r,["Cell2","CELL2","Cell.2"]),
          password:  token+mese+"!"
        };
      });
      if(!parsed.length){ setErr("Nessuna riga valida trovata. Controlla che il file abbia le colonne: Cognome, Nome, E-mail ecc."); return; }
      setRows(parsed); setPreview(true);
    }catch(e){setErr("Errore lettura file: "+e.message);}
  };

  const doImport=async()=>{
    if(!selCond){setErr("Seleziona un condominio."); return;}
    setImporting(true); setErr(""); setProgress(0);
    const ok=[],noEmail=[],failed=[];
    const condo=condominii?.find(c=>String(c.id)===String(selCond));
    for(let i=0;i<rows.length;i++){
      const r=rows[i]; setProgress(Math.round(((i+1)/rows.length)*100));
      try{
        const {id:uid}=await createAuthUser(r.email||null,r.password);
        await POST("profiles",{
          id:uid, name:r.nomeCompleto, role:"condomino",
          cond_id:Number(selCond), email:isRealEmail(r.email)?r.email:null,
          email2:isRealEmail(r.email2)?r.email2:null,
          nome:r.nome, cognome:r.cognome, titolo:r.titolo,
          num:r.num||null, tipo:r.tipo||null, presso:r.presso||null,
          via:r.via||null, localita:r.localita||null, prov:r.prov||null, cap:r.cap||null,
          telefono:r.tel||null, telefono2:r.tel2||null, cell:r.cell||null, cell2:r.cell2||null
        },tok);
        if(isRealEmail(r.email)){
          try{ await sendWelcomeEmail(r.email,r.nomeCompleto,r.password,condo?.nome||""); ok.push(r); }
          catch{ noEmail.push(r); }
        } else noEmail.push(r);
        await new Promise(res=>setTimeout(res,200));
      }catch(e){failed.push({...r,errore:e.message});}
    }
    setResults({ok,noEmail,failed}); setImporting(false);
  };

  const stampa=()=>{
    const condo=condominii?.find(c=>String(c.id)===String(selCond));
    const tutti=[...(results?.ok||[]),...(results?.noEmail||[])];
    const w=window.open("","_blank");
    w.document.write(\`<html><head><title>Credenziali</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ccc;padding:8px}th{background:#f1f5f9}@media print{button{display:none}}</style></head><body>
    <h2>Studio Amministrazioni Immobiliari s.a.s. di Mazzini & C.</h2><h3>Credenziali — \${condo?.nome||""}</h3>
    <p>Data: \${new Date().toLocaleDateString("it-IT")} | Portale: studiomazzinibo.com</p>
    <table><tr><th>Num.</th><th>Cognome e Nome</th><th>Via</th><th>Email</th><th>Password</th></tr>
    \${tutti.map(r=>\`<tr><td>\${r.num||""}</td><td>\${r.nomeCompleto}</td><td>\${r.via||""} \${r.localita||""}</td><td>\${r.email||"—"}</td><td>\${r.password}</td></tr>\`).join("")}
    </table><br><button onclick="window.print()">🖨️ Stampa</button></body></html>\`);
    w.document.close();
  };

  return (
    <div>
      <div className="mb-6"><h2 className="text-2xl font-black text-gray-800">Importazione da Excel</h2>
        <p className="text-gray-400 text-sm mt-1">Colonne attese: Num. · U/C/CP · Cognome · Nome · Presso · Via · Località · Prov. · CAP · Titolo · E-mail · E-mail 2 · Tel · Tel2 · Cell · Cell2</p>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-5">
        <Sel label="Condominio di destinazione" value={selCond} onChange={e=>setSelCond(e.target.value)}>{condominii?.map(c=><option key={c.id} value={c.id}>{c.nome} · {c.citta}</option>)}</Sel>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-3">File Excel (.xlsx)</label>
        <input type="file" accept=".xlsx,.xls" onChange={e=>e.target.files[0]&&parseExcel(e.target.files[0])} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50"/>
      </div>
      <ErrBox msg={err}/>
      {preview&&rows.length>0&&!results&&(
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-5">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div><p className="font-bold text-gray-800">Anteprima — {rows.length} righe</p><p className="text-xs text-gray-400">{rows.filter(r=>isRealEmail(r.email)).length} con email · {rows.filter(r=>!isRealEmail(r.email)).length} senza email</p></div>
            <Btn onClick={doImport} disabled={importing}>{importing?\`Importazione... \${progress}%\`:"Importa tutti"}</Btn>
          </div>
          {importing&&<div className="h-1 bg-gray-100"><div className="h-1 bg-blue-500 transition-all" style={{width:\`\${progress}%\`}}/></div>}
          <div className="max-h-72 overflow-y-auto">
            {rows.map((r,i)=>(
              <div key={i} className={\`flex items-center justify-between px-5 py-3 \${i<rows.length-1?"border-b border-gray-50":""}\`}>
                <div>
                  <p className="font-medium text-gray-800 text-sm">{r.num&&<span className="text-gray-400 mr-2">#{r.num}</span>}{r.nomeCompleto}</p>
                  <p className="text-xs text-gray-400">{r.via?r.via+" · ":""}{r.localita} {r.prov?("("+r.prov+")"):""}  {r.email||"⚠ nessuna email"}</p>
                </div>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono shrink-0 ml-3">{r.password}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {results&&(
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="font-bold text-gray-800 mb-2">Importazione completata</p>
          <p className="text-sm text-emerald-600">✅ {results.ok.length} importati con email di benvenuto</p>
          <p className="text-sm text-amber-600">⚠️ {results.noEmail.length} importati senza email</p>
          {results.failed.length>0&&<p className="text-sm text-red-600">❌ {results.failed.length} errori</p>}
          {results.failed.map((r,i)=><p key={i} className="text-xs text-red-500 mt-1">{r.nomeCompleto}: {r.errore}</p>)}
          <div className="flex gap-3 mt-4"><Btn variant="secondary" onClick={stampa}>🖨️ Stampa credenziali</Btn><Btn variant="secondary" onClick={()=>{setResults(null);setPreview(false);setRows([]);}}>Nuova importazione</Btn></div>
        </div>
      )}
    </div>
  );
}
`;

lines.splice(start, end - start, ...NEW_IMPORT.split('\n'));
fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log('OK AdminImport riscritto. Ora: git add src/App.jsx && git commit -m "riscrittura AdminImport nuovo formato Excel" && git push');
