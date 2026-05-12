const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE, 'Desktop', 'portale-mazzini', 'src', 'App.jsx');
let c = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
let ok = 0;

function fix(desc, from, to) {
  if (c.includes(from)) { c = c.split(from).join(to); ok++; console.log('OK:', desc); }
  else console.log('NON TROVATO:', desc);
}

// 1. Aggiorna costanti categorie
fix('CAT_LABELS',
  'const CAT_LABELS = {consuntivi:"Consuntivi",preventivi:"Preventivi & Rate",verbali:"Verbali di Assemblea",altro:"Altro"};',
  'const CAT_LABELS = {convocazione:"Convocazione",rendiconto:"Rendiconto",preventivo:"Preventivo",verbale:"Verbale",altro:"Altro"};'
);

fix('CAT_ICONS',
  'const CAT_ICONS  = {consuntivi:"📊",preventivi:"💶",verbali:"📋",altro:"📎"};',
  'const CAT_ICONS  = {convocazione:"📨",rendiconto:"📊",preventivo:"💶",verbale:"📋",altro:"📎"};'
);

fix('CAT_COLORS',
  'const CAT_COLORS = {consuntivi:"bg-blue-50 text-blue-700",preventivi:"bg-green-50 text-green-700",verbali:"bg-purple-50 text-purple-700",altro:"bg-gray-100 text-gray-600"};',
  'const CAT_COLORS = {convocazione:"bg-orange-50 text-orange-700",rendiconto:"bg-blue-50 text-blue-700",preventivo:"bg-green-50 text-green-700",verbale:"bg-purple-50 text-purple-700",altro:"bg-gray-100 text-gray-600"};'
);

// 2. Aggiorna DocModal: selezione categoria
fix('DocModal categoria default',
  'const [cat,setCat]=useState("consuntivi");',
  'const [cat,setCat]=useState("convocazione");'
);

// 3. Riscrivi CondDocs — mostra tutti i doc, filtro opzionale, colori per categoria
const OLD_COND_DOCS = `function CondDocs({user, soloPersonali=false}) {
  const [sezione,setSezione]=useState(soloPersonali?"personal":"cond"); const [tab,setTab]=useState("consuntivi");
  const {data:docs,loading}=useData(()=>
    sezione==="cond"
      ? GET("docs",\`cond_id=eq.\${user.cond_id}&cat=eq.\${tab}&select=*&order=uploaded_at.desc\`,user.token)
      : GET("personal_docs",\`user_id=eq.\${user.id}&cat=eq.\${tab}&select=*&order=uploaded_at.desc\`,user.token),
    [sezione,tab,user.token,user.cond_id,user.id]);
  const handleDownload=async d=>{
    if(!d.storage_path){alert("File non disponibile."); return;}
    try{ const url=await getSignedUrl(sezione==="cond"?"docs-condominiali":"docs-personali",d.storage_path,user.token); window.open(url,"_blank"); }
    catch(e){alert("Errore download: "+e.message);}
  };
  return (
    <div>
      <h2 className="text-2xl font-black text-gray-800 mb-5">Documenti</h2>
      <div className="flex gap-2 mb-4">
        {[{k:"cond",l:"🏢 Condominiali"},{k:"personal",l:"👤 Personali"}].map(({k,l})=>(
          <button key={k} onClick={()=>setSezione(k)} className={\`px-4 py-2 rounded-xl text-sm font-semibold transition-all \${sezione===k?"bg-slate-800 text-white":"bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}\`}>{l}</button>
        ))}
      </div>
      <div className="flex gap-2 mb-5 flex-wrap">
        {Object.entries(CAT_LABELS).map(([k,v])=>(
          <button key={k} onClick={()=>setTab(k)} className={\`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all \${tab===k?"bg-blue-600 text-white":"bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}\`}>
            <span>{CAT_ICONS[k]}</span><span>{v}</span>
          </button>
        ))}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!docs?.length?<EmptyState icon={CAT_ICONS[tab]} text={\`Nessun documento in "\${CAT_LABELS[tab]}".\`}/>:docs.map((d,i)=>(
          <div key={d.id} className={\`flex items-center justify-between p-4 hover:bg-gray-50 transition \${i<docs.length-1?"border-b border-gray-50":""}\`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center text-xl">📄</div>
              <div><p className="font-medium text-gray-800 text-sm">{d.name}</p><p className="text-xs text-gray-400">Anno {d.year} · {d.size}</p></div>
            </div>
            <Btn variant="secondary" onClick={()=>handleDownload(d)}>⬇ Scarica</Btn>
          </div>
        ))}
      </div>
    </div>
  );
}`;

const NEW_COND_DOCS = `function CondDocs({user, soloPersonali=false}) {
  const [sezione,setSezione]=useState(soloPersonali?"personal":"cond");
  const [filtro,setFiltro]=useState("");
  const qsCond=filtro
    ? \`cond_id=eq.\${user.cond_id}&cat=eq.\${filtro}&select=*&order=uploaded_at.desc\`
    : \`cond_id=eq.\${user.cond_id}&select=*&order=uploaded_at.desc\`;
  const qsPerso=filtro
    ? \`user_id=eq.\${user.id}&cat=eq.\${filtro}&select=*&order=uploaded_at.desc\`
    : \`user_id=eq.\${user.id}&select=*&order=uploaded_at.desc\`;
  const {data:docs,loading}=useData(()=>
    sezione==="cond"
      ? GET("docs",qsCond,user.token)
      : GET("personal_docs",qsPerso,user.token),
    [sezione,filtro,user.token,user.cond_id,user.id]);
  const handleDownload=async d=>{
    if(!d.storage_path){alert("File non disponibile."); return;}
    try{ const url=await getSignedUrl(sezione==="cond"?"docs-condominiali":"docs-personali",d.storage_path,user.token); window.open(url,"_blank"); }
    catch(e){alert("Errore download: "+e.message);}
  };
  const CAT_BG={convocazione:"bg-orange-50",rendiconto:"bg-blue-50",preventivo:"bg-green-50",verbale:"bg-purple-50",altro:"bg-gray-100"};
  return (
    <div>
      <h2 className="text-2xl font-black text-gray-800 mb-5">Documenti</h2>
      <div className="flex gap-2 mb-4">
        {[{k:"cond",l:"🏢 Condominiali"},{k:"personal",l:"👤 Personali"}].map(({k,l})=>(
          <button key={k} onClick={()=>{setSezione(k);setFiltro("");}} className={\`px-4 py-2 rounded-xl text-sm font-semibold transition-all \${sezione===k?"bg-slate-800 text-white":"bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}\`}>{l}</button>
        ))}
      </div>
      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={()=>setFiltro("")} className={\`px-3 py-1.5 rounded-xl text-sm font-medium transition-all \${filtro===""?"bg-slate-800 text-white":"bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}\`}>Tutti</button>
        {Object.entries(CAT_LABELS).map(([k,v])=>(
          <button key={k} onClick={()=>setFiltro(filtro===k?"":k)} className={\`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all \${filtro===k?"bg-blue-600 text-white":"bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}\`}>
            <span>{CAT_ICONS[k]}</span><span>{v}</span>
          </button>
        ))}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!docs?.length?<EmptyState icon="📂" text={filtro?"Nessun documento in questa categoria.":"Nessun documento disponibile."}/>
        :docs.map((d,i)=>(
          <div key={d.id} className={\`flex items-center justify-between p-4 hover:bg-gray-50 transition \${i<docs.length-1?"border-b border-gray-50":""}\`}>
            <div className="flex items-center gap-3">
              <div className={\`w-10 h-10 rounded-xl flex items-center justify-center text-xl \${CAT_BG[d.cat]||"bg-gray-100"}\`}>{CAT_ICONS[d.cat]||"📎"}</div>
              <div>
                <p className="font-medium text-gray-800 text-sm">{d.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge cat={d.cat}/>
                  <span className="text-xs text-gray-400">{d.year} · {d.size}</span>
                </div>
              </div>
            </div>
            <Btn variant="secondary" onClick={()=>handleDownload(d)}>⬇ Scarica</Btn>
          </div>
        ))}
      </div>
    </div>
  );
}`;

fix('riscrivi CondDocs', OLD_COND_DOCS, NEW_COND_DOCS);

// 4. Aggiorna CondGeneralDocs — stessa logica (tutti + filtro)
const OLD_GEN = `function CondGeneralDocs({user}) {
  const [tab,setTab]=useState("consuntivi");
  const {data:docs,loading}=useData(()=>GET("general_docs",\`cond_id=eq.\${user.cond_id}&cat=eq.\${tab}&select=*&order=uploaded_at.desc\`,user.token),[tab,user.token,user.cond_id]);
  const handleDownload=async d=>{
    if(!d.storage_path){alert("File non disponibile."); return;}
    try{ const url=await getSignedUrl("docs-generali",d.storage_path,user.token); window.open(url,"_blank"); }
    catch(e){alert("Errore download: "+e.message);}
  };
  return (
    <div>
      <h2 className="text-2xl font-black text-gray-800 mb-2">Documenti Generali</h2>
      <p className="text-gray-400 text-sm mb-5">Documenti dello studio validi per tutti i condomìni.</p>
      <div className="flex gap-2 mb-5 flex-wrap">
        {Object.entries(CAT_LABELS).map(([k,v])=>(
          <button key={k} onClick={()=>setTab(k)} className={\`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all \${tab===k?"bg-blue-600 text-white":"bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}\`}>
            <span>{CAT_ICONS[k]}</span><span>{v}</span>
          </button>
        ))}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!docs?.length?<EmptyState icon="📋" text="Nessun documento in questa categoria."/>:docs.map((d,i)=>(
          <div key={d.id} className={\`flex items-center justify-between p-4 hover:bg-gray-50 transition \${i<docs.length-1?"border-b border-gray-50":""}\`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-xl">📋</div>
              <div><p className="font-medium text-gray-800 text-sm">{d.name}</p><p className="text-xs text-gray-400">Anno {d.year} · {d.size}</p></div>
            </div>
            <Btn variant="secondary" onClick={()=>handleDownload(d)}>⬇ Scarica</Btn>
          </div>
        ))}
      </div>
    </div>
  );
}`;

const NEW_GEN = `function CondGeneralDocs({user}) {
  const [filtro,setFiltro]=useState("");
  const qs=filtro
    ? \`cond_id=eq.\${user.cond_id}&cat=eq.\${filtro}&select=*&order=uploaded_at.desc\`
    : \`cond_id=eq.\${user.cond_id}&select=*&order=uploaded_at.desc\`;
  const {data:docs,loading}=useData(()=>GET("general_docs",qs,user.token),[filtro,user.token,user.cond_id]);
  const handleDownload=async d=>{
    if(!d.storage_path){alert("File non disponibile."); return;}
    try{ const url=await getSignedUrl("docs-generali",d.storage_path,user.token); window.open(url,"_blank"); }
    catch(e){alert("Errore download: "+e.message);}
  };
  const CAT_BG={convocazione:"bg-orange-50",rendiconto:"bg-blue-50",preventivo:"bg-green-50",verbale:"bg-purple-50",altro:"bg-gray-100"};
  return (
    <div>
      <h2 className="text-2xl font-black text-gray-800 mb-2">Documenti Generali</h2>
      <p className="text-gray-400 text-sm mb-5">Documenti dello studio validi per tutti i condomìni.</p>
      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={()=>setFiltro("")} className={\`px-3 py-1.5 rounded-xl text-sm font-medium transition-all \${filtro===""?"bg-slate-800 text-white":"bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}\`}>Tutti</button>
        {Object.entries(CAT_LABELS).map(([k,v])=>(
          <button key={k} onClick={()=>setFiltro(filtro===k?"":k)} className={\`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all \${filtro===k?"bg-blue-600 text-white":"bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}\`}>
            <span>{CAT_ICONS[k]}</span><span>{v}</span>
          </button>
        ))}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!docs?.length?<EmptyState icon="📋" text={filtro?"Nessun documento in questa categoria.":"Nessun documento disponibile."}/>
        :docs.map((d,i)=>(
          <div key={d.id} className={\`flex items-center justify-between p-4 hover:bg-gray-50 transition \${i<docs.length-1?"border-b border-gray-50":""}\`}>
            <div className="flex items-center gap-3">
              <div className={\`w-10 h-10 rounded-xl flex items-center justify-center text-xl \${CAT_BG[d.cat]||"bg-gray-100"}\`}>{CAT_ICONS[d.cat]||"📎"}</div>
              <div>
                <p className="font-medium text-gray-800 text-sm">{d.name}</p>
                <div className="flex items-center gap-2 mt-0.5"><Badge cat={d.cat}/><span className="text-xs text-gray-400">{d.year} · {d.size}</span></div>
              </div>
            </div>
            <Btn variant="secondary" onClick={()=>handleDownload(d)}>⬇ Scarica</Btn>
          </div>
        ))}
      </div>
    </div>
  );
}`;

fix('riscrivi CondGeneralDocs', OLD_GEN, NEW_GEN);

fs.writeFileSync(file, c, 'utf8');
console.log('\n✅ Completato:', ok, 'modifiche applicate.');
console.log('Ora: git add src/App.jsx && git commit -m "aggiorna documenti nuove categorie e vista completa" && git push');
