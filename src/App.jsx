import { useState, useEffect, useCallback } from "react";

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_KEY;
const SB_SVC = import.meta.env.VITE_SUPABASE_SERVICE_KEY;
const RS_KEY = import.meta.env.VITE_RESEND_KEY;
const PS = 25;
const isRealEmail = e => e && !e.includes("@noemail.local");

// ── API ───────────────────────────────────────────────────────────────────────
async function sb(path, { method="GET", body, prefer, token, svc }={}) {
  const key = svc ? SB_SVC : SB_KEY;
  const tok = svc ? SB_SVC : (token||SB_KEY);
  const h = { "Content-Type":"application/json", "apikey":key, "Authorization":`Bearer ${tok}` };
  if (prefer) h["Prefer"] = prefer;
  const r = await fetch(`${SB_URL}${path}`, { method, headers:h, body:body!=null?JSON.stringify(body):undefined });
  if (r.status===204) return null;
  const d = await r.json();
  if (!r.ok) throw new Error(d.message||d.error_description||d.error||`Errore ${r.status}`);
  return d;
}
const GET  = (t,qs,tok)   => sb(`/rest/v1/${t}?${qs||""}`,{token:tok});
const POST = (t,b,tok)    => sb(`/rest/v1/${t}`,{method:"POST",body:b,prefer:"return=representation",token:tok});
const PATCH= (t,qs,b,tok) => sb(`/rest/v1/${t}?${qs}`,{method:"PATCH",body:b,prefer:"return=representation",token:tok});
const DEL  = (t,qs,tok)   => sb(`/rest/v1/${t}?${qs}`,{method:"DELETE",token:tok});
const UPS  = (t,b,tok)    => sb(`/rest/v1/${t}`,{method:"POST",body:b,prefer:"return=representation,resolution=merge-duplicates",token:tok});

async function createAuthUser(email, password) {
  const realEmail = email||`noemail_${Date.now()}_${Math.random().toString(36).slice(2)}@noemail.local`;
  const d = await sb("/auth/v1/admin/users",{method:"POST",body:{email:realEmail,password,email_confirm:true},svc:true});
  return { id:d.id, email:realEmail, hasRealEmail:!!email };
}

// ── Storage ───────────────────────────────────────────────────────────────────
async function uploadFile(bucket, filePath, file, token) {
  const r = await fetch(`${SB_URL}/storage/v1/object/${bucket}/${filePath}`,{
    method:"POST",
    headers:{"apikey":SB_KEY,"Authorization":`Bearer ${token}`,"Content-Type":file.type||"application/octet-stream","x-upsert":"true"},
    body:file,
  });
  if(!r.ok){const d=await r.json().catch(()=>({})); throw new Error(d.message||"Errore upload");}
  return filePath;
}
async function getSignedUrl(bucket, filePath, token) {
  const r = await fetch(`${SB_URL}/storage/v1/object/sign/${bucket}/${filePath}`,{
    method:"POST",
    headers:{"apikey":SB_KEY,"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
    body:JSON.stringify({expiresIn:3600}),
  });
  const d = await r.json();
  if(!r.ok) throw new Error(d.message||"Errore URL");
  return `${SB_URL}/storage/v1${d.signedURL}`;
}

// ── Email ─────────────────────────────────────────────────────────────────────
const MAIL_FROM = "Portale Condominiale <portale@studiomazzinibo.com>";
const sendEmail = async(to, subject, html) => {
  const r = await fetch("/.netlify/functions/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, subject, html })
  });
  if (!r.ok) throw new Error("Errore invio email");
};
const mailFooter = `<p style="color:#64748b;font-size:12px;margin-top:16px">Studio Amministrazioni Immobiliari s.a.s. di Mazzini & C.<br><a href="https://studiomazzinibo.com">studiomazzinibo.com</a></p>`;
const catText = c => ({consuntivi:"un nuovo consuntivo",preventivi:"un nuovo preventivo con piano rate",verbali:"un nuovo verbale di assemblea",altro:"un nuovo documento"}[c]||"un nuovo documento");

async function notifyCondoDoc(condId, docName, cat, tok) {
  try {
    const users = await GET("profiles",`cond_id=eq.${condId}&role=eq.condomino&select=name,email,email2`,tok);
    const condo = (await GET("condominii",`id=eq.${condId}&select=nome`,tok))?.[0];
    for(const u of users||[]){
      const emails=[u.email,u.email2].filter(e=>isRealEmail(e));
      if(!emails.length) continue;
      await sendEmail(emails,`${condo?.nome} — Nuovo documento disponibile`,
        `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
          <h2 style="color:#1e40af">Studio Amministrazioni Immobiliari</h2>
          <p>Gentile <strong>${u.name}</strong>,</p>
          <p>È disponibile <strong>${catText(cat)}</strong> nel portale condominiale.</p>
          <p style="background:#f1f5f9;padding:12px;border-radius:8px">📄 <strong>${docName}</strong></p>
          ${mailFooter}</div>`);
    }
  }catch(e){console.error("Notifica errore:",e);}
}
async function notifyPersonalDoc(userId, docName, cat, tok) {
  try {
    const u = (await GET("profiles",`id=eq.${userId}&select=name,email,email2`,tok))?.[0];
    const emails=[u?.email,u?.email2].filter(e=>isRealEmail(e));
    if(!emails.length) return;
    await sendEmail(emails,"Nuovo documento personale disponibile",
      `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        <h2 style="color:#1e40af">Studio Amministrazioni Immobiliari</h2>
        <p>Gentile <strong>${u.name}</strong>,</p>
        <p>È disponibile <strong>${catText(cat)}</strong> nel Suo fascicolo personale.</p>
        <p style="background:#f1f5f9;padding:12px;border-radius:8px">📄 <strong>${docName}</strong></p>
        ${mailFooter}</div>`);
  }catch(e){console.error("Notifica errore:",e);}
}
async function notifySegnalazione(segn, userName, condoNome, interno, adminEmail) {
  if(!adminEmail) return;
  try {
    const col = segn.urgenza==="urgente"?"#e53e3e":"#2d3748";
    await sendEmail([adminEmail],`🚨 Nuova segnalazione — ${userName} — ${condoNome}`,
      `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        <h2 style="color:#e53e3e">Nuova Segnalazione</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
          <tr><td style="padding:8px;font-weight:bold;background:#f7fafc">Condomino</td><td style="padding:8px">${userName} · Int. ${interno}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;background:#f7fafc">Condominio</td><td style="padding:8px">${condoNome}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;background:#f7fafc">Tipo</td><td style="padding:8px">${segn.tipo}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;background:#f7fafc">Urgenza</td><td style="padding:8px;color:${col};font-weight:bold">${segn.urgenza.toUpperCase()}</td></tr>
        </table>
        <div style="background:#f7fafc;padding:12px;border-radius:8px"><strong>Descrizione:</strong><br>${segn.descrizione}</div>
        <p style="color:#718096;font-size:12px">Ricevuta il ${new Date().toLocaleDateString("it-IT")} alle ${new Date().toLocaleTimeString("it-IT")}</p>
      </div>`);
  }catch(e){console.error("Notifica errore:",e);}
}
async function sendWelcomeEmail(email, nome, password, condoNome) {
  await sendEmail([email],"Le tue credenziali di accesso al Portale Condominiale",
    `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
      <h2 style="color:#1e40af">Studio Amministrazioni Immobiliari s.a.s. di Mazzini & C.</h2>
      <p>Gentile <strong>${nome}</strong>,</p>
      <p>Le sue credenziali per accedere al Portale Condominiale <strong>${condoNome}</strong>:</p>
      <div style="background:#f1f5f9;padding:16px;border-radius:8px;margin:16px 0">
        <p style="margin:4px 0">🌐 <a href="https://studiomazzinibo.com">studiomazzinibo.com</a></p>
        <p style="margin:4px 0">📧 ${email}</p>
        <p style="margin:4px 0">🔑 ${password}</p>
      </div>
      ${mailFooter}</div>`);
}

// ── UI ────────────────────────────────────────────────────────────────────────
const Inp = ({label,hint,...p}) => (
  <div className="mb-3">
    {label&&<label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>}
    <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition" {...p}/>
    {hint&&<p className="text-xs text-gray-400 mt-1">{hint}</p>}
  </div>
);
const Sel = ({label,children,...p}) => (
  <div className="mb-3">
    {label&&<label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>}
    <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition" {...p}>{children}</select>
  </div>
);
const Btn = ({children,variant="primary",className="",...p}) => {
  const v={primary:"bg-blue-600 hover:bg-blue-700 text-white shadow-sm",secondary:"bg-white hover:bg-gray-50 text-gray-700 border border-gray-200",danger:"bg-red-500 hover:bg-red-600 text-white shadow-sm",success:"bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm",ghost:"hover:bg-gray-100 text-gray-500",warning:"bg-amber-500 hover:bg-amber-600 text-white shadow-sm"}[variant]||"";
  return <button className={`${v} px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`} {...p}>{children}</button>;
};
const Modal = ({title,children,onClose}) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h3 className="font-bold text-gray-800">{title}</h3>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 text-xl">×</button>
      </div>
      <div className="px-6 py-5 max-h-96 overflow-y-auto">{children}</div>
    </div>
  </div>
);
const CAT_LABELS = {convocazione:"Convocazione",rendiconto:"Rendiconto",preventivo:"Preventivo",verbale:"Verbale",altro:"Altro"};
const CAT_ICONS  = {convocazione:"📨",rendiconto:"📊",preventivo:"💶",verbale:"📋",altro:"📎"};
const CAT_COLORS = {convocazione:"bg-orange-50 text-orange-700",rendiconto:"bg-blue-50 text-blue-700",preventivo:"bg-green-50 text-green-700",verbale:"bg-purple-50 text-purple-700",altro:"bg-gray-100 text-gray-600"};
const STATO_COLORS = {aperta:"bg-red-100 text-red-700",in_lavorazione:"bg-amber-100 text-amber-700",chiusa:"bg-emerald-100 text-emerald-700"};
const STATO_LABELS = {aperta:"Aperta","in_lavorazione":"In lavorazione",chiusa:"Chiusa"};
const Badge = ({cat}) => <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_COLORS[cat]}`}>{CAT_LABELS[cat]}</span>;
const STATO_UTENTE_COLORS = {attivo:"bg-emerald-100 text-emerald-700",ex_condomino:"bg-amber-100 text-amber-700",disattivato:"bg-gray-100 text-gray-500"};
const STATO_UTENTE_LABELS = {attivo:"Attivo",ex_condomino:"Ex condomino",disattivato:"Disattivato"};
const StatoUtente = ({s}) => <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATO_UTENTE_COLORS[s]||"bg-gray-100 text-gray-500"}`}>{STATO_UTENTE_LABELS[s]||s}</span>;
const StatoBadge = ({s}) => <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATO_COLORS[s]||"bg-gray-100 text-gray-600"}`}>{STATO_LABELS[s]||s}</span>;
const EmptyState = ({icon,text}) => <div className="py-12 text-center"><div className="text-4xl mb-3">{icon}</div><p className="text-gray-400 text-sm">{text}</p></div>;
const Spinner = () => <div className="py-12 flex justify-center"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div>;
const ErrBox = ({msg}) => msg?<div className="bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl px-3 py-2 mb-3">{msg}</div>:null;
const SearchBar = ({value,onChange,placeholder}) => (
  <div className="relative flex-1">
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
    <input className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>
  </div>
);
function useData(fn, deps=[]) {
  const [data,setData]=useState(null); const [loading,setLoading]=useState(true); const [err,setErr]=useState("");
  const load=useCallback(async()=>{setLoading(true);setErr("");try{setData(await fn());}catch(e){setErr(e.message);}setLoading(false);},deps);
  useEffect(()=>{load();},[load]);
  return {data,loading,err,reload:load};
}

// ── Cambio Password Obbligatorio ──────────────────────────────────────────────
function CambioPassword({user, onComplete}) {
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [show, setShow] = useState(false);

  const submit = async () => {
    setErr("");
    if (pwd.length < 8) { setErr("La password deve essere di almeno 8 caratteri."); return; }
    if (pwd !== pwd2) { setErr("Le password non coincidono."); return; }
    setLoading(true);
    try {
      const r = await fetch(`${SB_URL}/auth/v1/user`, {
        method: "PUT",
        headers: { "Content-Type":"application/json", "apikey":SB_KEY, "Authorization":`Bearer ${user.token}` },
        body: JSON.stringify({ password: pwd })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || "Errore aggiornamento password");
      await PATCH("profiles", `id=eq.${user.id}`, { primo_accesso: false }, user.token);
      onComplete();
    } catch(e) { setErr(e.message); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-blue-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white text-3xl">🔑</span>
          </div>
          <h1 className="text-2xl font-black text-white">Cambio password</h1>
          <p className="text-blue-200 text-sm mt-1">Obbligatorio al primo accesso</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
            <p className="text-sm text-amber-800">Benvenuto <strong>{user.name}</strong>! Per garantire la sicurezza del tuo account devi impostare una password personale prima di continuare.</p>
          </div>
          <div className="relative mb-3">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nuova password</label>
            <input type={show?"text":"password"} value={pwd} onChange={e=>{setPwd(e.target.value);setErr("");}}
              placeholder="Minimo 8 caratteri"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-20"/>
            <button type="button" onClick={()=>setShow(v=>!v)} className="absolute right-3 top-7 text-gray-400 text-xs">{show?"Nascondi":"Mostra"}</button>
          </div>
          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Conferma password</label>
            <input type={show?"text":"password"} value={pwd2} onChange={e=>{setPwd2(e.target.value);setErr("");}}
              placeholder="Ripeti la password"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>
          {pwd.length>0&&pwd.length<8&&<p className="text-xs text-amber-600 mb-2">Ancora {8-pwd.length} caratteri</p>}
          {pwd.length>=8&&pwd===pwd2&&<p className="text-xs text-emerald-600 mb-2">✓ Password valida</p>}
          <ErrBox msg={err}/>
          <Btn className="w-full justify-center mt-2" onClick={submit} disabled={loading||pwd.length<8||pwd!==pwd2}>
            {loading?"Salvataggio...":"Imposta password e accedi →"}
          </Btn>
        </div>
      </div>
    </div>
  );
}


function CookieBanner({onAccept}) {
  const [det,setDet]=useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pointer-events-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-xl pointer-events-auto">
        <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="w-8 h-8 bg-blue-500 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0">M</div>
          <div><p className="font-bold text-gray-800 text-sm">Studio Mazzini — Portale Condominiale</p><p className="text-xs text-gray-400">Informativa sull'uso dei cookie</p></div>
        </div>
        <div className="px-6 py-4">
          <p className="text-sm text-gray-600 leading-relaxed">Questo portale utilizza esclusivamente <strong>cookie tecnici strettamente necessari</strong> al funzionamento del servizio: gestione della sessione di autenticazione e sicurezza degli accessi. Non vengono utilizzati cookie di profilazione né strumenti pubblicitari.</p>
          {det&&(
            <div className="mt-3 bg-gray-50 rounded-xl p-4 border border-gray-100 text-xs text-gray-600 space-y-2">
              <p>✓ <strong>Token di sessione (JWT):</strong> mantiene l'utente autenticato — Durata: sessione/24h — Non richiede consenso</p>
              <p>✓ <strong>Cookie di sicurezza (CSRF):</strong> protegge da attacchi informatici — Durata: sessione — Non richiede consenso</p>
            </div>
          )}
          <button onClick={()=>setDet(v=>!v)} className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium">{det?"▲ Nascondi dettagli":"▼ Mostra dettagli cookie"}</button>
        </div>
        <div className="px-6 pb-5 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-gray-400 flex-1">Utilizzando il portale accetti l'uso dei cookie tecnici ai sensi dell'art. 122, comma 1, D.Lgs. 196/2003.</p>
          <Btn onClick={onAccept}>Accetta e continua →</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
function ContactFooter({c}) {
  if(!c) return null;
  return (
    <div className="bg-white border-t border-gray-200 px-6 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-xs">M</div>
        <span className="text-xs font-semibold text-gray-700">{c.nome}</span>
      </div>
      {c.telefono&&<a href={`tel:${c.telefono}`} className="text-xs text-gray-500 hover:text-blue-600 transition">📞 {c.telefono}</a>}
      {c.email&&<a href={`mailto:${c.email}`} className="text-xs text-gray-500 hover:text-blue-600 transition">✉️ {c.email}</a>}
      {c.indirizzo&&<span className="text-xs text-gray-400">📍 {c.indirizzo}</span>}
      {c.orari&&<span className="text-xs text-gray-400">🕐 {c.orari}</span>}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({items,active,onSelect,user,onLogout}) {
  return (
    <div className="w-60 bg-slate-900 min-h-screen flex flex-col flex-shrink-0">
      <div className="px-5 py-6 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center text-white font-bold">M</div>
          <div><p className="text-white text-sm font-bold">Studio Mazzini</p><p className="text-slate-400 text-xs">Portale Condominiale</p></div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {items.map(({id,label,icon})=>(
          <button key={id} onClick={()=>onSelect(id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${active===id?"bg-blue-600 text-white font-medium":"text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
            <span>{icon}</span><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-700">
        <p className="text-slate-300 text-xs font-medium truncate mb-0.5">{user.name}</p>
        <p className="text-slate-500 text-xs truncate mb-3">{user.email}</p>
        <button onClick={onLogout} className="text-slate-500 hover:text-white text-xs">← Esci</button>
      </div>
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────
function Login({onLogin}) {
  const [email,setEmail]=useState(""); const [pwd,setPwd]=useState(""); const [err,setErr]=useState(""); const [loading,setLoading]=useState(false); const [show,setShow]=useState(false);
  const submit=async()=>{
    if(!email||!pwd) return; setLoading(true); setErr("");
    try{
      const auth=await sb("/auth/v1/token?grant_type=password",{method:"POST",body:{email,password:pwd}});
      const profiles=await GET("profiles",`id=eq.${auth.user.id}&select=*,condominii(*)`,auth.access_token);
      if(!profiles?.length) throw new Error("Profilo non trovato. Contatta l'amministratore.");
      if(profiles[0].stato==="disattivato"){
        await sb("/auth/v1/logout",{method:"POST",token:auth.access_token});
        throw new Error("Il tuo account è stato disattivato. Contatta lo studio per riattivarlo.");
      }
      onLogin({token:auth.access_token,...profiles[0],email:auth.user.email});
    }catch(e){setErr(e.message);}
    setLoading(false);
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-blue-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"><span className="text-white text-3xl font-black">M</span></div>
          <h1 className="text-2xl font-black text-white">Studio Mazzini</h1>
          <p className="text-blue-200 text-sm mt-1">Portale Condominiale</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <Inp label="Email" type="email" value={email} onChange={e=>{setEmail(e.target.value);setErr("");}} placeholder="tua@email.it" onKeyDown={e=>e.key==="Enter"&&submit()}/>
          <div className="relative mb-3">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Password</label>
            <input type={show?"text":"password"} value={pwd} onChange={e=>{setPwd(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="••••••••"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-20"/>
            <button type="button" onClick={()=>setShow(v=>!v)} className="absolute right-3 top-7 text-gray-400 text-xs">{show?"Nascondi":"Mostra"}</button>
          </div>
          <ErrBox msg={err}/>
          <Btn className="w-full justify-center" onClick={submit} disabled={loading}>{loading?"Accesso...":"Accedi →"}</Btn>
          <p className="text-xs text-gray-400 text-center mt-4">Usa le credenziali fornite dall'amministratore</p>
        </div>
      </div>
    </div>
  );
}

// ── DocModal (condiviso) ──────────────────────────────────────────────────────
function DocModal({onSave,onClose,bucket,pathPrefix,tok}) {
  const [nome,setNome]=useState(""); const [cat,setCat]=useState("convocazione"); const [anno,setAnno]=useState(new Date().getFullYear());
  const [file,setFile]=useState(null); const [uploading,setUploading]=useState(false);
  const handleFile=e=>{ const fl=e.target.files[0]; if(!fl) return; setFile(fl); setNome(fl.name); };
  const handleSave=async()=>{
    if(!file){alert("Seleziona un file."); return;} setUploading(true);
    try{
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
      const filePath=`${pathPrefix}/${Date.now()}_${safeName}`;
      await uploadFile(bucket,filePath,file,tok);
      onSave({name:nome||file.name,cat,year:anno,size:`${(file.size/1024).toFixed(0)} KB`,storage_path:filePath});
    }catch(e){alert("Errore upload: "+e.message);}
    setUploading(false);
  };
  return (
    <Modal title="Carica Documento" onClose={onClose}>
      <div className="mb-3">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Seleziona file *</label>
        <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={handleFile} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50"/>
        {file&&<p className="text-xs text-emerald-600 mt-1">✓ {file.name} ({(file.size/1024).toFixed(0)} KB)</p>}
      </div>
      <div className="mb-3">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome visualizzato</label>
        <input value={nome} onChange={e=>setNome(e.target.value)} placeholder="Es. Consuntivo 2024.pdf"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
      </div>
      <Sel label="Categoria" value={cat} onChange={e=>setCat(e.target.value)}>{Object.entries(CAT_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Sel>
      <div className="mb-3">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Anno</label>
        <input type="number" value={anno} onChange={e=>setAnno(Number(e.target.value))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Btn variant="secondary" onClick={onClose}>Annulla</Btn>
        <Btn onClick={handleSave} disabled={!file||uploading}>{uploading?"Caricamento...":"⬆ Carica file"}</Btn>
      </div>
    </Modal>
  );
}

// ── Admin ─────────────────────────────────────────────────────────────────────
function AdminPanel({user,onLogout,view,setView}) {
  const nav=[
    {id:"condominii",  label:"Condomìni",      icon:"🏢"},
    {id:"utenti",      label:"Utenti",          icon:"👥"},
    {id:"importa",     label:"Importa Excel",   icon:"📥"},
    {id:"rate",        label:"Rate",             icon:"📅"},
    {id:"documenti",   label:"Documenti",        icon:"📁"},
    {id:"generali",    label:"Doc. Generali",    icon:"📋"},
    {id:"scadenze",    label:"Rate in Scadenza", icon:"⏰"},
    {id:"segnalazioni",label:"Segnalazioni",     icon:"🚨"},
    {id:"contatti",    label:"Contatti Studio",  icon:"📞"},
  ];
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar items={nav} active={view} onSelect={setView} user={user} onLogout={onLogout}/>
      <div className="flex-1 p-8 overflow-auto">
        <div className="max-w-4xl mx-auto">
          {view==="condominii"   && <AdminCondominii tok={user.token}/>}
          {view==="utenti"       && <AdminUtenti tok={user.token}/>}
          {view==="importa"      && <AdminImport tok={user.token}/>}
          {view==="rate"         && <AdminRate tok={user.token}/>}
          {view==="documenti"    && <AdminDocumenti tok={user.token}/>}
          {view==="generali"     && <AdminGeneralDocs tok={user.token}/>}
          {view==="scadenze"     && <AdminScadenze tok={user.token}/>}
          {view==="segnalazioni" && <AdminSegnalazioni tok={user.token}/>}
          {view==="contatti"     && <AdminContatti tok={user.token}/>}
        </div>
      </div>
    </div>
  );
}

// ── Admin Condomìni ───────────────────────────────────────────────────────────
function CondominioModal({mode,data,onSave,onClose}) {
  const [f,setF]=useState(data); const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <Modal title={mode==="add"?"Nuovo Condominio":"Modifica Condominio"} onClose={onClose}>
      <Inp label="Nome" value={f.nome} onChange={e=>s("nome",e.target.value)} placeholder="Es. Cond. Via Parma 5"/>
      <Inp label="Indirizzo" value={f.indirizzo} onChange={e=>s("indirizzo",e.target.value)}/>
      <div className="flex gap-3"><div style={{width:"38%"}}><Inp label="CAP" value={f.cap} onChange={e=>s("cap",e.target.value)}/></div><div className="flex-1"><Inp label="Città" value={f.citta} onChange={e=>s("citta",e.target.value)}/></div></div>
      <Inp label="Telefono (opzionale)" value={f.telefono||""} onChange={e=>s("telefono",e.target.value)} placeholder="Es. 051 452244"/>
      <Inp label="Email di contatto (opzionale)" type="email" value={f.email_contatto||""} onChange={e=>s("email_contatto",e.target.value)}/>
      <div className="flex justify-end gap-3 pt-2"><Btn variant="secondary" onClick={onClose}>Annulla</Btn><Btn onClick={()=>f.nome&&onSave(f)} disabled={!f.nome}>Salva</Btn></div>
    </Modal>
  );
}

function AdminCondominii({tok}) {
  const {data:list,loading,err,reload}=useData(()=>GET("condominii","select=*&order=nome",tok),[tok]);
  const [modal,setModal]=useState(null);
  const [expanded,setExpanded]=useState(null);
  const save=async f=>{ try{modal.mode==="add"?await POST("condominii",f,tok):await PATCH("condominii",`id=eq.${f.id}`,f,tok); setModal(null); reload();}catch(e){alert(e.message);} };
  const remove=async id=>{ if(!window.confirm("Eliminare?")) return; try{await DEL("condominii",`id=eq.${id}`,tok); reload();}catch(e){alert(e.message);} };
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h2 className="text-2xl font-black text-gray-800">Gestione Condomìni</h2><p className="text-gray-400 text-sm">{list?.length||0} condomìni</p></div>
        <Btn onClick={()=>setModal({mode:"add",data:{nome:"",indirizzo:"",cap:"",citta:"",telefono:"",email_contatto:""}})}>+ Nuovo</Btn>
      </div>
      <ErrBox msg={err}/>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!list?.length?<EmptyState icon="🏢" text="Nessun condominio."/>:list.map((c,i)=>(
          <div key={c.id}>
            <div className={`flex items-center justify-between p-5 ${i<list.length-1||expanded===c.id?"border-b border-gray-50":""}`}>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-xl">🏢</div>
                <div>
                  <p className="font-semibold text-gray-800">{c.nome}</p>
                  <p className="text-xs text-gray-400">{c.indirizzo} · {c.cap} {c.citta}</p>
                  {c.telefono&&<p className="text-xs text-gray-400">📞 {c.telefono}</p>}
                  {c.email_contatto&&<p className="text-xs text-gray-400">✉️ {c.email_contatto}</p>}
                </div>
              </div>
              <div className="flex gap-2">
                <Btn variant="secondary" onClick={()=>setExpanded(expanded===c.id?null:c.id)}>{expanded===c.id?"▲ Inquilini":"▼ Inquilini"}</Btn>
                <Btn variant="secondary" onClick={()=>setModal({mode:"edit",data:{...c}})}>Modifica</Btn>
                <Btn variant="danger" onClick={()=>remove(c.id)}>Elimina</Btn>
              </div>
            </div>
            {expanded===c.id&&<InlineInquilini condId={c.id} tok={tok}/>}
          </div>
        ))}
      </div>
      {modal&&<CondominioModal mode={modal.mode} data={modal.data} onSave={save} onClose={()=>setModal(null)}/>}
    </div>
  );
}

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

// ── Inquilini inline per condominio ──────────────────────────────────────────
// ── Admin Utenti ──────────────────────────────────────────────────────────────
function UtenteModal({mode,data,condominii,onSave,onClose}) {
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
}

function AdminUtenti({tok}) {
  const {data:condominii}=useData(()=>GET("condominii","select=id,nome,citta&order=nome",tok),[tok]);
  const [users,setUsers]=useState([]); const [loading,setLoading]=useState(true); const [err,setErr]=useState("");
  const [search,setSearch]=useState(""); const [filterCond,setFilterCond]=useState(""); const [page,setPage]=useState(0); const [hasMore,setHasMore]=useState(false);
  const [modal,setModal]=useState(null);
  const load=useCallback(async()=>{
    setLoading(true); setErr("");
    try{
      let qs=`role=eq.condomino&select=*,condominii(nome,citta)&order=name&limit=${PS+1}&offset=${page*PS}`;
      if(search) qs+=`&or=(name.ilike.*${encodeURIComponent(search)}*,email.ilike.*${encodeURIComponent(search)}*)`;
      if(filterCond) qs+=`&cond_id=eq.${filterCond}`;
      const d=await GET("profiles",qs,tok);
      setHasMore(d.length>PS); setUsers(d.slice(0,PS));
    }catch(e){setErr(e.message);}
    setLoading(false);
  },[tok,search,filterCond,page]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>setPage(0),[search,filterCond]);
  const save=async f=>{
    try{
      if(modal.mode==="add"){
        const {id:uid,email:realEmail}=await createAuthUser(f.email||null,f.pwd);
        await POST("profiles",{id:uid,name:f.name,role:"condomino",cond_id:Number(f.cond_id),scala:f.scala,interno:f.interno,email:isRealEmail(f.email)?f.email:null,email2:f.email2||null,telefono:f.telefono||null,telefono2:f.telefono2||null,cell:f.cell||null,cell2:f.cell2||null,nome:f.nome||null,cognome:f.cognome||null,titolo:f.titolo||null,presso:f.presso||null,via:f.via||null,localita:f.localita||null,prov:f.prov||null,cap:f.cap||null,num:f.num||null,tipo:f.tipo||null},tok);
      }else{
        await PATCH("profiles",`id=eq.${f.id}`,{name:f.name,cond_id:Number(f.cond_id),scala:f.scala,interno:f.interno,email:f.email||null,email2:f.email2||null,telefono:f.telefono||null,telefono2:f.telefono2||null,cell:f.cell||null,cell2:f.cell2||null,nome:f.nome||null,cognome:f.cognome||null,titolo:f.titolo||null,presso:f.presso||null,via:f.via||null,localita:f.localita||null,prov:f.prov||null,cap:f.cap||null,num:f.num||null,tipo:f.tipo||null},tok);
      }
      setModal(null); load();
    }catch(e){alert(e.message);}
  };
  const remove=async id=>{
    if(!window.confirm("Eliminare questo utente e tutti i suoi dati (documenti, inquilini, catastali, segnalazioni)?")) return;
    try{
      await DEL("segnalazioni",`user_id=eq.${id}`,tok);
      await sb(`/auth/v1/admin/users/${id}`,{method:"DELETE",svc:true});
      load();
    }catch(e){alert(e.message);}
  };
  const makeExCondomino=async id=>{ if(!window.confirm("Impostare come ex-condomino? L'utente non potrà più accedere alle funzioni complete.")) return; try{await PATCH("profiles",`id=eq.${id}`,{stato:"ex_condomino"},tok); load();}catch(e){alert(e.message);} };
  const reattiva=async id=>{ if(!window.confirm("Riattivare questo utente?")) return; try{await PATCH("profiles",`id=eq.${id}`,{stato:"attivo"},tok); load();}catch(e){alert(e.message);} };
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h2 className="text-2xl font-black text-gray-800">Gestione Utenti</h2></div>
        <Btn onClick={()=>setModal({mode:"add",data:{name:"",email:"",pwd:"",cond_id:condominii?.[0]?.id||"",scala:"",interno:""}})}>+ Nuovo utente</Btn>
      </div>
      <div className="flex gap-3 mb-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Cerca nome o email..."/>
        <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" value={filterCond} onChange={e=>setFilterCond(e.target.value)}>
          <option value="">Tutti i condomìni</option>
          {condominii?.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>
      <ErrBox msg={err}/>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!users.length?<EmptyState icon="👥" text="Nessun utente trovato."/>:users.map((u,i)=>(
          <div key={u.id} className={`flex items-center justify-between p-4 ${i<users.length-1?"border-b border-gray-50":""}`}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 font-bold text-sm">{u.name?.charAt(0)}</div>
              <div>
                <div className="flex items-center gap-2"><p className="font-semibold text-gray-800 text-sm">{u.name}</p><StatoUtente s={u.stato}/></div>
                <p className="text-xs text-gray-400">{u.condominii?.nome} · Int.{u.interno}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Btn variant="secondary" onClick={()=>setModal({mode:"edit",data:{...u,cond_id:u.cond_id||""}})}>Modifica</Btn>
              {u.stato==="attivo"&&<Btn variant="warning" onClick={()=>makeExCondomino(u.id)}>Ex-Condomino</Btn>}
              {(u.stato==="ex_condomino"||u.stato==="disattivato")&&<Btn variant="success" onClick={()=>reattiva(u.id)}>Riattiva</Btn>}
              <Btn variant="danger" onClick={()=>remove(u.id)}>Elimina</Btn>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-4">
        <p className="text-xs text-gray-400">Pagina {page+1}</p>
        <div className="flex gap-2">
          <Btn variant="secondary" onClick={()=>setPage(p=>p-1)} disabled={page===0}>← Prec</Btn>
          <Btn variant="secondary" onClick={()=>setPage(p=>p+1)} disabled={!hasMore}>Succ →</Btn>
        </div>
      </div>
      {modal&&<UtenteModal mode={modal.mode} data={modal.data} condominii={condominii||[]} onSave={save} onClose={()=>setModal(null)}/>}
    </div>
  );
}

// ── Admin Importa Excel ───────────────────────────────────────────────────────
function AdminImport({tok}) {
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
      if(data.length>0) console.log("COLONNE EXCEL: "+Object.keys(data[0]).join(" | "));
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
    w.document.write(`<html><head><title>Credenziali</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ccc;padding:8px}th{background:#f1f5f9}@media print{button{display:none}}</style></head><body>
    <h2>Studio Amministrazioni Immobiliari s.a.s. di Mazzini & C.</h2><h3>Credenziali — ${condo?.nome||""}</h3>
    <p>Data: ${new Date().toLocaleDateString("it-IT")} | Portale: studiomazzinibo.com</p>
    <table><tr><th>Num.</th><th>Cognome e Nome</th><th>Via</th><th>Email</th><th>Password</th></tr>
    ${tutti.map(r=>`<tr><td>${r.num||""}</td><td>${r.nomeCompleto}</td><td>${r.via||""} ${r.localita||""}</td><td>${r.email||"—"}</td><td>${r.password}</td></tr>`).join("")}
    </table><br><button onclick="window.print()">🖨️ Stampa</button></body></html>`);
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
            <Btn onClick={doImport} disabled={importing}>{importing?`Importazione... ${progress}%`:"Importa tutti"}</Btn>
          </div>
          {importing&&<div className="h-1 bg-gray-100"><div className="h-1 bg-blue-500 transition-all" style={{width:`${progress}%`}}/></div>}
          <div className="max-h-72 overflow-y-auto">
            {rows.map((r,i)=>(
              <div key={i} className={`flex items-center justify-between px-5 py-3 ${i<rows.length-1?"border-b border-gray-50":""}`}>
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

// ── Admin Inquilini ───────────────────────────────────────────────────────────
function AdminInquilini({tok}) {
  const {data:condominii}=useData(()=>GET("condominii","select=id,nome,citta&order=nome",tok),[tok]);
  const [selCond,setSelCond]=useState(""); const [inqList,setInqList]=useState([]); const [loading,setLoading]=useState(false);
  const [modal,setModal]=useState(null); const [docModal,setDocModal]=useState(null);
  useEffect(()=>{ if(condominii?.length&&!selCond) setSelCond(String(condominii[0].id)); },[condominii]);
  useEffect(()=>{ loadInq(); },[selCond,tok]);
  const loadInq=async()=>{
    if(!selCond) return; setLoading(true);
    try{
      const users=await GET("profiles",`cond_id=eq.${selCond}&role=eq.condomino&select=id,name,interno`,tok)||[];
      if(!users.length){setInqList([]); setLoading(false); return;}
      const ids=users.map(u=>u.id).join(",");
      const inq=await GET("inquilini",`user_id=in.(${ids})&select=*`,tok)||[];
      setInqList(inq.map(i=>({...i,proprietario:users.find(u=>u.id===i.user_id)?.name||"—",proprietario_interno:users.find(u=>u.id===i.user_id)?.interno||""})));
    }catch(e){console.error(e);}
    setLoading(false);
  };
  const save=async f=>{
    try{
      modal.mode==="add"?await POST("inquilini",f,tok):await PATCH("inquilini",`id=eq.${f.id}`,f,tok);
      setModal(null); loadInq();
    }catch(e){alert(e.message);}
  };
  const remove=async id=>{ if(window.confirm("Eliminare?")){ try{await DEL("inquilini",`id=eq.${id}`,tok); loadInq();}catch(e){alert(e.message);} } };
  const addDoc=async(docData)=>{
    try{ await POST("personal_docs",{user_id:docModal.userId,...docData},tok); setDocModal(null);}catch(e){alert(e.message);}
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h2 className="text-2xl font-black text-gray-800">Gestione Inquilini</h2><p className="text-gray-400 text-sm">{inqList.length} inquilino/i nel condominio selezionato</p></div>
      </div>
      <div className="mb-4">
        <Sel label="Condominio" value={selCond} onChange={e=>setSelCond(e.target.value)}>{condominii?.map(c=><option key={c.id} value={c.id}>{c.nome} · {c.citta}</option>)}</Sel>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!inqList.length?<EmptyState icon="🏠" text="Nessun inquilino in questo condominio."/>:inqList.map((i,idx)=>(
          <div key={i.id} className={`flex items-center justify-between p-4 ${idx<inqList.length-1?"border-b border-gray-50":""}`}>
            <div>
              <p className="font-semibold text-gray-800 text-sm">{i.nome}</p>
              <p className="text-xs text-gray-400">Proprietario: {i.proprietario} · Int.{i.proprietario_interno}</p>
              <p className="text-xs text-gray-400">{i.email}{i.tel?` · ${i.tel}`:""}</p>
              <p className="text-xs text-gray-400">{i.dal?`Dal ${new Date(i.dal).toLocaleDateString("it-IT")}`:""}{i.al?` al ${new Date(i.al).toLocaleDateString("it-IT")}`:" · (in corso)"}</p>
            </div>
            <div className="flex gap-2">
              <Btn variant="secondary" onClick={()=>setDocModal({userId:i.user_id,nome:i.nome})}>📄 Doc</Btn>
              <Btn variant="secondary" onClick={()=>setModal({mode:"edit",data:{...i}})}>Modifica</Btn>
              <Btn variant="danger" onClick={()=>remove(i.id)}>Elimina</Btn>
            </div>
          </div>
        ))}
      </div>
      {modal&&<InqModal mode={modal.mode} data={modal.data} onSave={save} onClose={()=>setModal(null)}/>}
      {docModal&&<DocModal onSave={addDoc} onClose={()=>setDocModal(null)} bucket="docs-personali" pathPrefix={docModal.userId} tok={tok}/>}
    </div>
  );
}

// ── Admin Rate ────────────────────────────────────────────────────────────────
function RataModal({mode,data,onSave,onClose}) {
  const [f,setF]=useState(data); const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <Modal title={mode==="add"?"Nuova Rata":"Modifica Rata"} onClose={onClose}>
      <div className="mb-3">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Numero rata (1-5)</label>
        <input type="number" min="1" max="5" value={f.numero_rata} onChange={e=>s("numero_rata",Number(e.target.value))}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
      </div>
      <Inp label="Data scadenza" type="date" value={f.data_scadenza} onChange={e=>s("data_scadenza",e.target.value)}/>
      <Inp label="Descrizione (opzionale)" value={f.descrizione||""} onChange={e=>s("descrizione",e.target.value)} placeholder="Es. Prima rata semestrale"/>
      <div className="flex justify-end gap-3 pt-2">
        <Btn variant="secondary" onClick={onClose}>Annulla</Btn>
        <Btn onClick={()=>f.data_scadenza&&onSave(f)} disabled={!f.data_scadenza}>Salva</Btn>
      </div>
    </Modal>
  );
}

function BulkImportiModal({condId,rate,tok,onClose}) {
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
          if(!isNaN(imp)&&imp>0) await sb("/rest/v1/rate_condomino?on_conflict=rata_id,user_id",{method:"POST",body:{rata_id:r.id,user_id:u.id,importo:imp,notificato:false},prefer:"return=representation,resolution=merge-duplicates",token:tok});
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

function ImportImportiModal({rata,condId,tok,onClose}) {
  const [rows,setRows]=useState([]); const [preview,setPreview]=useState(false);
  const [importing,setImporting]=useState(false); const [err,setErr]=useState("");
  const parseExcel=async file=>{
    setErr(""); setRows([]); setPreview(false);
    try{
      const XLSX=await import("https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs");
      const buf=await file.arrayBuffer(); const wb=XLSX.read(buf); const ws=wb.Sheets[wb.SheetNames[0]];
      const data=XLSX.utils.sheet_to_json(ws,{defval:""});
      const users=await GET("profiles",`cond_id=eq.${condId}&role=eq.condomino&select=id,name,interno&order=name`,tok)||[];
      const parsed=[];
      for(const row of data){
        const nome=String(row["Nome"]||row["NOME"]||row["Cognome"]||"").trim();
        const unita=String(row["Unità"]||row["UNITA"]||row["Interno"]||row["INTERNO"]||"").trim();
        const importoKey=Object.keys(row).find(k=>k===`Rata ${rata.numero_rata}`||k===`R${rata.numero_rata}`||k.toLowerCase()===`rata ${rata.numero_rata}`);
        const importo=importoKey?parseFloat(String(row[importoKey]).replace(",",".")):0;
        if(!importo) continue;
        const user=users.find(u=>u.name.toLowerCase().includes(nome.toLowerCase())||u.interno===unita);
        if(user) parsed.push({userId:user.id,nome:user.name,interno:user.interno,importo});
      }
      setRows(parsed); setPreview(true);
    }catch(e){setErr("Errore: "+e.message);}
  };
  const doImport=async()=>{
    setImporting(true);
    try{ for(const r of rows) await UPS("rate_condomino",{rata_id:rata.id,user_id:r.userId,importo:r.importo,notificato:false},tok); onClose(); alert(`${rows.length} importi caricati!`); }
    catch(e){alert(e.message);}
    setImporting(false);
  };
  return (
    <Modal title={`Importa importi — Rata ${rata.numero_rata}`} onClose={onClose}>
      <p className="text-xs text-gray-500 mb-3">Il file deve avere colonne: <strong>Nome</strong> (o Unità/Interno) e <strong>Rata {rata.numero_rata}</strong> con l'importo.</p>
      <input type="file" accept=".xlsx,.xls" onChange={e=>e.target.files[0]&&parseExcel(e.target.files[0])} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 mb-3"/>
      <ErrBox msg={err}/>
      {preview&&rows.length>0&&(
        <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-xl mb-3">
          {rows.map((r,i)=>(
            <div key={i} className={`flex items-center justify-between px-3 py-2 text-sm ${i<rows.length-1?"border-b border-gray-50":""}`}>
              <span className="text-gray-700">{r.nome} · Int.{r.interno}</span>
              <span className="font-bold text-blue-700">€ {r.importo.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-3">
        <Btn variant="secondary" onClick={onClose}>Annulla</Btn>
        {preview&&rows.length>0&&<Btn onClick={doImport} disabled={importing}>{importing?"Importazione...":`Importa ${rows.length} importi`}</Btn>}
      </div>
    </Modal>
  );
}

function AdminRate({tok}) {
  const {data:condominii}=useData(()=>GET("condominii","select=id,nome,citta&order=nome",tok),[tok]);
  const [selCond,setSelCond]=useState(""); const [rate,setRate]=useState([]); const [loading,setLoading]=useState(false);
  const [modal,setModal]=useState(null); const [importModal,setImportModal]=useState(null); const [sending,setSending]=useState(false); const [bulkModal,setBulkModal]=useState(false);
  useEffect(()=>{ if(condominii?.length&&!selCond) setSelCond(String(condominii[0].id)); },[condominii]);
  useEffect(()=>{ loadRate(); },[selCond,tok]);
  const loadRate=async()=>{ if(!selCond) return; setLoading(true); try{setRate(await GET("rate_condominio",`cond_id=eq.${selCond}&select=*&order=numero_rata`,tok)||[]);}catch(e){} setLoading(false); };
  const saveRata=async f=>{ try{ modal.mode==="add"?await POST("rate_condominio",{...f,cond_id:Number(selCond)},tok):await PATCH("rate_condominio",`id=eq.${f.id}`,f,tok); setModal(null); loadRate(); }catch(e){alert(e.message);} };
  const delRata=async id=>{ if(!window.confirm("Eliminare questa rata e tutti gli importi associati?")) return; try{await DEL("rate_condominio",`id=eq.${id}`,tok); loadRate();}catch(e){alert(e.message);} };
  const sendReminders=async()=>{
    setSending(true);
    try{ const r=await fetch("/.netlify/functions/check-reminders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({})}); const d=await r.json(); alert(d.inviati>0?`✅ Inviati ${d.inviati} promemoria.`:"ℹ️ Nessun promemoria da inviare (nessuna rata in scadenza nei prossimi 5 giorni)."); }
    catch(e){alert("Errore: "+e.message);}
    setSending(false);
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h2 className="text-2xl font-black text-gray-800">Gestione Rate</h2><p className="text-gray-400 text-sm">Configura scadenze e importi (max 5 rate per condominio).</p></div>
        <div className="flex gap-2">
          <Btn variant="warning" onClick={sendReminders} disabled={sending}>{sending?"Invio...":"📧 Invia promemoria"}</Btn>
          {rate.length>0&&<Btn variant="secondary" onClick={()=>setBulkModal(true)}>📊 Gestisci importi</Btn>}
          {rate.length<5&&<Btn onClick={()=>setModal({mode:"add",data:{numero_rata:rate.length+1,data_scadenza:"",descrizione:""}})}>+ Rata</Btn>}
        </div>
      </div>
      <div className="mb-5"><Sel label="Condominio" value={selCond} onChange={e=>setSelCond(e.target.value)}>{condominii?.map(c=><option key={c.id} value={c.id}>{c.nome} · {c.citta}</option>)}</Sel></div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!rate.length?<EmptyState icon="📅" text="Nessuna rata configurata. Aggiungi la prima scadenza."/>:rate.map((r,i)=>(
          <div key={r.id} className={`flex items-center justify-between p-4 ${i<rate.length-1?"border-b border-gray-50":""}`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center font-black text-blue-600 text-xl">{r.numero_rata}</div>
              <div><p className="font-bold text-gray-800">Rata {r.numero_rata}</p><p className="text-xs text-gray-400">Scadenza: {new Date(r.data_scadenza).toLocaleDateString("it-IT")}{r.descrizione?` · ${r.descrizione}`:""}</p></div>
            </div>
            <div className="flex gap-2">
              <Btn variant="secondary" onClick={()=>setImportModal(r)}>📥 Importa importi</Btn>
              <Btn variant="secondary" onClick={()=>setModal({mode:"edit",data:{...r}})}>Modifica</Btn>
              <Btn variant="danger" onClick={()=>delRata(r.id)}>Elimina</Btn>
            </div>
          </div>
        ))}
      </div>
      {modal&&<RataModal mode={modal.mode} data={modal.data} onSave={saveRata} onClose={()=>setModal(null)}/>}
      {importModal&&<ImportImportiModal rata={importModal} condId={selCond} tok={tok} onClose={()=>setImportModal(null)}/>}
      {bulkModal&&<BulkImportiModal condId={selCond} rate={rate} tok={tok} onClose={()=>setBulkModal(false)}/>}
    </div>
  );
}

// ── Admin Documenti ───────────────────────────────────────────────────────────
function AdminDocumenti({tok}) {
  const {data:condominii}=useData(()=>GET("condominii","select=id,nome,citta&order=nome",tok),[tok]);
  const [tipo,setTipo]=useState("cond"); const [selCond,setSelCond]=useState(""); const [selUid,setSelUid]=useState("");
  const [users,setUsers]=useState([]); const [docs,setDocs]=useState([]); const [loading,setLoading]=useState(false); const [modal,setModal]=useState(false);
  useEffect(()=>{ if(condominii?.length&&!selCond) setSelCond(String(condominii[0].id)); },[condominii]);
  useEffect(()=>{ if(!selCond) return; GET("profiles",`cond_id=eq.${selCond}&role=eq.condomino&select=id,name,scala,interno&order=name`,tok).then(d=>{setUsers(d||[]);setSelUid(d?.[0]?.id||"");}); },[selCond,tok]);
  useEffect(()=>{loadDocs();},[tipo,selCond,selUid,tok]);
  const loadDocs=async()=>{
    if(!selCond) return; setLoading(true);
    try{
      if(tipo==="cond") setDocs(await GET("docs",`cond_id=eq.${selCond}&select=*&order=uploaded_at.desc`,tok)||[]);
      else if(selUid) setDocs(await GET("personal_docs",`user_id=eq.${selUid}&select=*&order=uploaded_at.desc`,tok)||[]);
      else setDocs([]);
    }catch{setDocs([]);}
    setLoading(false);
  };
  const addDoc=async f=>{
    try{
      if(tipo==="cond"){
        await POST("docs",{cond_id:Number(selCond),...f},tok);
        notifyCondoDoc(selCond,f.name,f.cat,tok);
      }else{
        await POST("personal_docs",{user_id:selUid,...f},tok);
        notifyPersonalDoc(selUid,f.name,f.cat,tok);
      }
      setModal(false); loadDocs();
    }catch(e){alert(e.message);}
  };
  const remove=async id=>{ if(!window.confirm("Eliminare?")) return; try{tipo==="cond"?await DEL("docs",`id=eq.${id}`,tok):await DEL("personal_docs",`id=eq.${id}`,tok); loadDocs();}catch(e){alert(e.message);} };
  return (
    <div>
      <div className="flex items-center justify-between mb-6"><h2 className="text-2xl font-black text-gray-800">Gestione Documenti</h2><Btn onClick={()=>setModal(true)}>+ Carica documento</Btn></div>
      <div className="flex gap-2 mb-5">
        {[{k:"cond",l:"🏢 Condominiali"},{k:"personal",l:"👤 Personali"}].map(({k,l})=>(
          <button key={k} onClick={()=>setTipo(k)} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tipo===k?"bg-slate-800 text-white":"bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>{l}</button>
        ))}
      </div>
      <div className="flex gap-3 mb-5">
        <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1" value={selCond} onChange={e=>setSelCond(e.target.value)}>
          {condominii?.map(c=><option key={c.id} value={c.id}>{c.nome} · {c.citta}</option>)}
        </select>
        {tipo==="personal"&&<select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1" value={selUid} onChange={e=>setSelUid(e.target.value)}>
          <option value="">— Seleziona condomino —</option>
          {users.map(u=><option key={u.id} value={u.id}>{u.name} · Int.{u.interno}</option>)}
        </select>}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!docs.length?<EmptyState icon="📭" text="Nessun documento."/>:docs.map((d,i)=>(
          <div key={d.id} className={`flex items-center justify-between p-4 ${i<docs.length-1?"border-b border-gray-50":""}`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center text-lg">📄</div>
              <div><p className="font-medium text-gray-800 text-sm">{d.name}</p><div className="flex items-center gap-2 mt-1"><Badge cat={d.cat}/><span className="text-xs text-gray-400">{d.year} · {d.size}</span></div></div>
            </div>
            <Btn variant="danger" onClick={()=>remove(d.id)}>Elimina</Btn>
          </div>
        ))}
      </div>
      {modal&&<DocModal onSave={addDoc} onClose={()=>setModal(false)} bucket={tipo==="cond"?"docs-condominiali":"docs-personali"} pathPrefix={tipo==="cond"?selCond:selUid} tok={tok}/>}
    </div>
  );
}

// ── Admin Documenti Generali ──────────────────────────────────────────────────
function AdminGeneralDocs({tok}) {
  const {data:condominii}=useData(()=>GET("condominii","select=id,nome,citta&order=nome",tok),[tok]);
  const [selCond,setSelCond]=useState("");
  const [modal,setModal]=useState(false);
  useEffect(()=>{ if(condominii?.length&&!selCond) setSelCond(String(condominii[0].id)); },[condominii]);
  const qs = selCond ? `cond_id=eq.${selCond}&select=*&order=uploaded_at.desc` : "select=*&order=uploaded_at.desc";
  const {data:docs,loading,reload}=useData(()=>GET("general_docs",qs,tok),[tok,selCond]);
  const addDoc=async f=>{ try{await POST("general_docs",{...f,cond_id:Number(selCond)},tok); setModal(false); reload();}catch(e){alert(e.message);} };
  const remove=async id=>{ if(!window.confirm("Eliminare?")) return; try{await DEL("general_docs",`id=eq.${id}`,tok); reload();}catch(e){alert(e.message);} };
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h2 className="text-2xl font-black text-gray-800">Documenti Generali</h2><p className="text-gray-400 text-sm mt-0.5">Documenti visibili a tutti i condomini dello stabile selezionato.</p></div>
        <Btn onClick={()=>setModal(true)} disabled={!selCond}>+ Carica documento</Btn>
      </div>
      <div className="mb-5">
        <Sel label="Condominio" value={selCond} onChange={e=>setSelCond(e.target.value)}>
          {condominii?.map(c=><option key={c.id} value={c.id}>{c.nome} · {c.citta}</option>)}
        </Sel>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!docs?.length?<EmptyState icon="📋" text="Nessun documento generale per questo condominio."/>:docs.map((d,i)=>(
          <div key={d.id} className={`flex items-center justify-between p-4 ${i<docs.length-1?"border-b border-gray-50":""}`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-lg">📋</div>
              <div><p className="font-medium text-gray-800 text-sm">{d.name}</p><div className="flex items-center gap-2 mt-1"><Badge cat={d.cat}/><span className="text-xs text-gray-400">{d.year} · {d.size}</span></div></div>
            </div>
            <Btn variant="danger" onClick={()=>remove(d.id)}>Elimina</Btn>
          </div>
        ))}
      </div>
      {modal&&<DocModal onSave={addDoc} onClose={()=>setModal(false)} bucket="docs-generali" pathPrefix={selCond} tok={tok}/>}
    </div>
  );
}

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

// ── Admin Segnalazioni ────────────────────────────────────────────────────────
function AdminSegnalazioni({tok}) {
  const {data:condominii}=useData(()=>GET("condominii","select=id,nome&order=nome",tok),[tok]);
  const [filterStato,setFilterStato]=useState(""); const [filterCond,setFilterCond]=useState("");
  const [list,setList]=useState([]); const [loading,setLoading]=useState(true);
  const [expanded,setExpanded]=useState(null);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      let qs="select=*&order=created_at.desc";
      if(filterStato) qs+=`&stato=eq.${filterStato}`;
      if(filterCond) qs+=`&cond_id=eq.${filterCond}`;
      const segn=await GET("segnalazioni",qs,tok)||[];
      if(segn.length){
        const userIds=[...new Set(segn.map(s=>s.user_id))].join(",");
        const condIds=[...new Set(segn.map(s=>s.cond_id))].join(",");
        const [prof,conds]=await Promise.all([
          GET("profiles",`id=in.(${userIds})&select=id,name,interno`,tok),
          GET("condominii",`id=in.(${condIds})&select=id,nome`,tok),
        ]);
        setList(segn.map(s=>({
          ...s,
          profiles:(prof||[]).find(p=>p.id===s.user_id)||{name:"—",interno:"—"},
          condominii:(conds||[]).find(c=>c.id===s.cond_id)||{nome:"—"},
        })));
      } else { setList([]); }
    }catch(e){console.error(e);}
    setLoading(false);
  },[tok,filterStato,filterCond]);

  useEffect(()=>{load();},[load]);
  const updateStato=async(id,stato)=>{ try{await PATCH("segnalazioni",`id=eq.${id}`,{stato},tok); load();}catch(e){alert(e.message);} };

  return (
    <div>
      <div className="mb-6"><h2 className="text-2xl font-black text-gray-800">Segnalazioni</h2><p className="text-gray-400 text-sm">{list.length} segnalazioni</p></div>
      <div className="flex gap-3 mb-5">
        <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" value={filterStato} onChange={e=>setFilterStato(e.target.value)}>
          <option value="">Tutti gli stati</option>
          <option value="aperta">Aperte</option>
          <option value="in_lavorazione">In lavorazione</option>
          <option value="chiusa">Chiuse</option>
        </select>
        <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1" value={filterCond} onChange={e=>setFilterCond(e.target.value)}>
          <option value="">Tutti i condomìni</option>
          {condominii?.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!list.length?<EmptyState icon="🚨" text="Nessuna segnalazione."/>:list.map((s,i)=>(
          <div key={s.id} className={`${i<list.length-1?"border-b border-gray-50":""}`}>
            <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50" onClick={()=>setExpanded(expanded===s.id?null:s.id)}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <StatoBadge s={s.stato}/>
                  {s.urgenza==="urgente"&&<span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">⚠️ Urgente</span>}
                  <span className="text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString("it-IT")}</span>
                </div>
                <p className="font-semibold text-gray-800 text-sm">{s.profiles?.name} · Int.{s.profiles?.interno}</p>
                <p className="text-xs text-gray-400">{s.condominii?.nome} · {s.tipo}</p>
              </div>
              <span className="text-gray-400 text-sm">{expanded===s.id?"▲":"▼"}</span>
            </div>
            {expanded===s.id&&(
              <div className="px-4 pb-4 bg-gray-50">
                <p className="text-sm text-gray-700 mb-3">{s.descrizione}</p>
                <div className="flex gap-2">
                  {s.stato!=="aperta"&&<Btn variant="danger" onClick={()=>updateStato(s.id,"aperta")}>Riapri</Btn>}
                  {s.stato!=="in_lavorazione"&&<Btn variant="warning" onClick={()=>updateStato(s.id,"in_lavorazione")}>In lavorazione</Btn>}
                  {s.stato!=="chiusa"&&<Btn variant="success" onClick={()=>updateStato(s.id,"chiusa")}>Chiudi</Btn>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Admin Contatti ────────────────────────────────────────────────────────────
function AdminContatti({tok}) {
  const {data,reload}=useData(()=>GET("contatti","id=eq.1",tok),[tok]);
  const [f,setF]=useState(null); const [saved,setSaved]=useState(false);
  useEffect(()=>{ if(data?.[0]) setF({...data[0]}); },[data]);
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const save=async()=>{ try{await UPS("contatti",{...f,updated_at:new Date().toISOString()},tok); reload(); setSaved(true); setTimeout(()=>setSaved(false),2500);}catch(e){alert(e.message);} };
  if(!f) return <Spinner/>;
  return (
    <div>
      <div className="mb-6"><h2 className="text-2xl font-black text-gray-800">Contatti Studio</h2><p className="text-gray-400 text-sm">Visibili a piè di pagina e usati per le notifiche email.</p></div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        {[{k:"nome",l:"Nome studio"},{k:"telefono",l:"Telefono"},{k:"email",l:"Email (riceve le segnalazioni)"},{k:"indirizzo",l:"Indirizzo"},{k:"orari",l:"Orari"}].map(({k,l})=><Inp key={k} label={l} value={f[k]||""} onChange={e=>s(k,e.target.value)}/>)}
        <div className="flex items-center gap-4 pt-4 border-t border-gray-100">
          <Btn variant="success" onClick={save}>✓ Salva</Btn>
          {saved&&<p className="text-emerald-600 text-sm font-semibold">Salvato!</p>}
        </div>
      </div>
      <div className="mt-5"><p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Anteprima footer</p><div className="rounded-2xl overflow-hidden border border-gray-200"><ContactFooter c={f}/></div></div>
    </div>
  );
}

// ── Condomino Account ─────────────────────────────────────────────────────────
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

function CondAccount({user,onLogout}) {
  const [loading,setLoading]=useState(false);
  const deactivate=async()=>{
    if(!window.confirm("Sei sicuro di voler disattivare il tuo account?\n\nI tuoi documenti personali verranno eliminati definitivamente.\nI tuoi dati di contatto rimarranno nel sistema.\nPotrai chiedere la riattivazione contattando lo studio.")) return;
    setLoading(true);
    try{
      await DEL("personal_docs",`user_id=eq.${user.id}`,user.token);
      await PATCH("profiles",`id=eq.${user.id}`,{stato:"disattivato"},user.token);
      const contatti=(await GET("contatti","id=eq.1",user.token))?.[0];
      if(contatti?.email){
        await sendEmail([contatti.email],
          `⚠️ Disattivazione account — ${user.name} — ${user.condominii?.nome}`,
          `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
            <h2 style="color:#e53e3e">Disattivazione Account</h2>
            <p>Il condomino <strong>${user.name}</strong> ha disattivato il proprio account.</p>
            <p><strong>Condominio:</strong> ${user.condominii?.nome} · Int. ${user.interno}</p>
            <p><strong>Email:</strong> ${user.email||"—"}</p>
            <p>I documenti personali sono stati eliminati. Puoi riattivare l'account dal pannello Gestione Utenti.</p>
            ${mailFooter}
          </div>`
        );
      }
      onLogout();
    }catch(e){alert(e.message);}
    setLoading(false);
  };
  return (
    <div>
      <h2 className="text-2xl font-black text-gray-800 mb-2">Il mio account</h2>
      <p className="text-gray-400 text-sm mb-6">Gestisci le impostazioni del tuo profilo.</p>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
        <h3 className="font-bold text-gray-700 mb-1">Dati profilo</h3>
        <p className="text-sm text-gray-600">Nome: <strong>{user.name}</strong></p>
        <p className="text-sm text-gray-600">Email: <strong>{user.email||"—"}</strong></p>
        {user.email2&&<p className="text-sm text-gray-600">Email 2: <strong>{user.email2}</strong></p>}
        {user.telefono&&<p className="text-sm text-gray-600">Telefono: <strong>{user.telefono}</strong></p>}
        {user.telefono2&&<p className="text-sm text-gray-600">Telefono 2: <strong>{user.telefono2}</strong></p>}
        <p className="text-sm text-gray-600">Condominio: <strong>{user.condominii?.nome}</strong> · Int. {user.interno}</p>
      </div>
      <div className="bg-red-50 border border-red-100 rounded-2xl p-6">
        <h3 className="font-bold text-red-700 mb-2">⚠️ Zona pericolosa</h3>
        <p className="text-sm text-red-600 mb-4">Disattivando il tuo account i tuoi <strong>documenti personali verranno eliminati</strong>. I tuoi dati di contatto rimarranno nel sistema e potrai essere riattivato dall'amministratore.</p>
        <Btn variant="danger" onClick={deactivate} disabled={loading}>{loading?"Disattivazione...":"Disattiva il mio account"}</Btn>
      </div>
    </div>
  );
}

// ── Condomino ─────────────────────────────────────────────────────────────────
function CondominoPanel({user,onLogout,view,setView}) {
  const {data:contattiArr}=useData(()=>GET("contatti","id=eq.1",user.token),[user.token]);
  const condo=user.condominii;
  const isEx = user.stato==="ex_condomino";
  const navBase = isEx
    ? [{id:"docs",label:"Documenti",icon:"📄"},{id:"account",label:"Il mio account",icon:"⚙️"}]
    : [
        {id:"docs",         label:"Documenti",     icon:"📄"},
        {id:"generali",     label:"Doc. Generali", icon:"📋"},
        {id:"inq",          label:"Inquilini",      icon:"🏠"},
        {id:"rate",         label:"Le mie rate",    icon:"💶"},
        {id:"cat",          label:"Dati Catastali", icon:"📊"},
        {id:"segnalazioni", label:"Segnalazioni",   icon:"🚨"},
        {id:"account",      label:"Il mio account", icon:"⚙️"},
      ];
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar items={navBase} active={view} onSelect={setView} user={user} onLogout={onLogout}/>
      <div className="flex flex-col flex-1 min-h-screen">
        <div className="flex-1 p-8 overflow-auto">
          <div className="max-w-3xl mx-auto">
            {isEx&&(
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 mb-4 flex items-center gap-3">
                <span className="text-xl">ℹ️</span>
                <p className="text-sm text-amber-700">Sei registrato come <strong>ex condomino</strong>. Hai accesso solo ai tuoi documenti personali.</p>
              </div>
            )}
            <div className="bg-white border border-gray-100 rounded-2xl px-5 py-3 mb-6 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-xl">🏢</div>
              <div><p className="text-sm font-bold text-gray-800">{condo?.nome||"Condominio"}</p><p className="text-xs text-gray-400">{condo?.indirizzo} · {condo?.cap} {condo?.citta} · Int. {user.interno}</p></div>
            </div>
            {view==="docs"         && <CondDocs user={user} soloPersonali={isEx}/>}
            {view==="generali"     && !isEx && <CondGeneralDocs user={user}/>}
            {view==="inq"          && !isEx && <CondInquilini user={user}/>}
            {view==="rate"         && !isEx && <CondRate user={user}/>}
            {view==="cat"          && !isEx && <CondCatastali user={user}/>}
            {view==="segnalazioni" && !isEx && <CondSegnalazioni user={user}/>}
            {view==="account"      && <CondAccount user={user} onLogout={onLogout}/>}
          </div>
        </div>
        <ContactFooter c={contattiArr?.[0]}/>
      </div>
    </div>
  );
}

function CondDocs({user, soloPersonali=false}) {
  const [sezione,setSezione]=useState(soloPersonali?"personal":"cond");
  const [filtro,setFiltro]=useState("");
  const qsCond=filtro
    ? `cond_id=eq.${user.cond_id}&cat=eq.${filtro}&select=*&order=uploaded_at.desc`
    : `cond_id=eq.${user.cond_id}&select=*&order=uploaded_at.desc`;
  const qsPerso=filtro
    ? `user_id=eq.${user.id}&cat=eq.${filtro}&select=*&order=uploaded_at.desc`
    : `user_id=eq.${user.id}&select=*&order=uploaded_at.desc`;
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
          <button key={k} onClick={()=>{setSezione(k);setFiltro("");}} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${sezione===k?"bg-slate-800 text-white":"bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>{l}</button>
        ))}
      </div>
      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={()=>setFiltro("")} className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${filtro===""?"bg-slate-800 text-white":"bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>Tutti</button>
        {Object.entries(CAT_LABELS).map(([k,v])=>(
          <button key={k} onClick={()=>setFiltro(filtro===k?"":k)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${filtro===k?"bg-blue-600 text-white":"bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>
            <span>{CAT_ICONS[k]}</span><span>{v}</span>
          </button>
        ))}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!docs?.length?<EmptyState icon="📂" text={filtro?"Nessun documento in questa categoria.":"Nessun documento disponibile."}/>
        :docs.map((d,i)=>(
          <div key={d.id} className={`flex items-center justify-between p-4 hover:bg-gray-50 transition ${i<docs.length-1?"border-b border-gray-50":""}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${CAT_BG[d.cat]||"bg-gray-100"}`}>{CAT_ICONS[d.cat]||"📎"}</div>
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
}

function CondGeneralDocs({user}) {
  const [filtro,setFiltro]=useState("");
  const qs=filtro
    ? `cond_id=eq.${user.cond_id}&cat=eq.${filtro}&select=*&order=uploaded_at.desc`
    : `cond_id=eq.${user.cond_id}&select=*&order=uploaded_at.desc`;
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
        <button onClick={()=>setFiltro("")} className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${filtro===""?"bg-slate-800 text-white":"bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>Tutti</button>
        {Object.entries(CAT_LABELS).map(([k,v])=>(
          <button key={k} onClick={()=>setFiltro(filtro===k?"":k)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${filtro===k?"bg-blue-600 text-white":"bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>
            <span>{CAT_ICONS[k]}</span><span>{v}</span>
          </button>
        ))}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!docs?.length?<EmptyState icon="📋" text={filtro?"Nessun documento in questa categoria.":"Nessun documento disponibile."}/>
        :docs.map((d,i)=>(
          <div key={d.id} className={`flex items-center justify-between p-4 hover:bg-gray-50 transition ${i<docs.length-1?"border-b border-gray-50":""}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${CAT_BG[d.cat]||"bg-gray-100"}`}>{CAT_ICONS[d.cat]||"📎"}</div>
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
}

function InqModal({mode,data,onSave,onClose}) {
  const [f,setF]=useState(data); const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <Modal title={mode==="add"?"Nuovo Inquilino":"Modifica Inquilino"} onClose={onClose}>
      <Inp label="Nome e Cognome" value={f.nome} onChange={e=>s("nome",e.target.value)}/>
      <Inp label="Email" type="email" value={f.email||""} onChange={e=>s("email",e.target.value)}/>
      <Inp label="Telefono" value={f.tel||""} onChange={e=>s("tel",e.target.value)}/>
      <div className="flex gap-3"><div className="flex-1"><Inp label="Inizio" type="date" value={f.dal||""} onChange={e=>s("dal",e.target.value)}/></div><div className="flex-1"><Inp label="Fine" type="date" value={f.al||""} onChange={e=>s("al",e.target.value)} hint="Vuoto = in corso"/></div></div>
      <div className="flex justify-end gap-3 pt-2"><Btn variant="secondary" onClick={onClose}>Annulla</Btn><Btn onClick={()=>f.nome&&onSave(f)}>Salva</Btn></div>
    </Modal>
  );
}

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

function CondInquilini({user}) {
  const {data:inq,loading,reload}=useData(()=>GET("inquilini",`user_id=eq.${user.id}&select=*&order=created_at`,user.token),[user.token,user.id]);
  const [modal,setModal]=useState(null);
  const save=async f=>{ try{modal.mode==="add"?await POST("inquilini",{...f,user_id:user.id},user.token):await PATCH("inquilini",`id=eq.${f.id}`,f,user.token); setModal(null); reload();}catch(e){alert(e.message);} };
  const remove=async id=>{ if(window.confirm("Rimuovere?")){ try{await DEL("inquilini",`id=eq.${id}`,user.token); reload();}catch(e){alert(e.message);} } };
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h2 className="text-2xl font-black text-gray-800">Gestione Inquilini</h2><p className="text-gray-400 text-sm">{inq?.length||0} inquilino/i</p></div>
        <Btn onClick={()=>setModal({mode:"add",data:{nome:"",email:"",tel:"",dal:"",al:""}})}>+ Aggiungi</Btn>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!inq?.length?<EmptyState icon="🏠" text="Nessun inquilino registrato."/>:inq.map((i,idx)=>(
          <div key={i.id} className={`flex items-center justify-between p-5 ${idx<inq.length-1?"border-b border-gray-50":""}`}>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 font-bold text-sm">{i.nome?.charAt(0)}</div>
              <div>
                <p className="font-semibold text-gray-800">{i.nome}</p>
                <p className="text-xs text-gray-400">{i.email}{i.tel?` · ${i.tel}`:""}</p>
                <p className="text-xs text-gray-400">{i.dal?`Dal ${new Date(i.dal).toLocaleDateString("it-IT")}`:""}{i.al?` al ${new Date(i.al).toLocaleDateString("it-IT")}`:" · (in corso)"}</p>
              </div>
            </div>
            <div className="flex gap-2"><Btn variant="secondary" onClick={()=>setModal({mode:"edit",data:{...i}})}>Modifica</Btn><Btn variant="danger" onClick={()=>remove(i.id)}>Rimuovi</Btn></div>
          </div>
        ))}
      </div>
      {modal&&<Modal title={modal.mode==="add"?"Nuovo Inquilino":"Modifica Inquilino"} onClose={()=>setModal(null)}>
        {(()=>{const [f,setF]=useState(modal.data); const s=(k,v)=>setF(p=>({...p,[k]:v})); return(<>
          <Inp label="Nome e Cognome" value={f.nome} onChange={e=>s("nome",e.target.value)}/>
          <Inp label="Email" type="email" value={f.email||""} onChange={e=>s("email",e.target.value)}/>
          <Inp label="Telefono" value={f.tel||""} onChange={e=>s("tel",e.target.value)}/>
          <div className="flex gap-3"><div className="flex-1"><Inp label="Inizio" type="date" value={f.dal||""} onChange={e=>s("dal",e.target.value)}/></div><div className="flex-1"><Inp label="Fine" type="date" value={f.al||""} onChange={e=>s("al",e.target.value)} hint="Vuoto = in corso"/></div></div>
          <div className="flex justify-end gap-3 pt-2"><Btn variant="secondary" onClick={()=>setModal(null)}>Annulla</Btn><Btn onClick={()=>f.nome&&save(f)}>Salva</Btn></div>
        </>);})()}
      </Modal>}
    </div>
  );
}

function CondCatastali({user}) {
  const {data,reload}=useData(()=>GET("catastali",`user_id=eq.${user.id}`,user.token),[user.token,user.id]);
  const empty={foglio:"",particella:"",subalterno:"",categoria:"",classe:"",consistenza:"",rendita:"",superficie:""};
  const [f,setF]=useState(empty); const [saved,setSaved]=useState(false);
  useEffect(()=>{ if(data?.[0]) setF({...data[0]}); else setF(empty); },[data]);
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const save=async()=>{ try{await UPS("catastali",{...f,user_id:user.id,updated_at:new Date().toISOString()},user.token); reload(); setSaved(true); setTimeout(()=>setSaved(false),2500);}catch(e){alert(e.message);} };
  const fields=[{k:"foglio",l:"Foglio",p:"Es. 15"},{k:"particella",l:"Particella",p:"Es. 234"},{k:"subalterno",l:"Subalterno",p:"Es. 3"},{k:"categoria",l:"Categoria catastale",p:"Es. A/2"},{k:"classe",l:"Classe",p:"Es. 3"},{k:"consistenza",l:"Consistenza",p:"Es. 5 vani"},{k:"rendita",l:"Rendita (€)",p:"Es. 520,00"},{k:"superficie",l:"Superficie (mq)",p:"Es. 85"}];
  return (
    <div>
      <h2 className="text-2xl font-black text-gray-800 mb-2">Dati Catastali</h2>
      <p className="text-gray-400 text-sm mb-5">Dati catastali della tua unità immobiliare.</p>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-2 gap-x-5">{fields.map(({k,l,p})=><Inp key={k} label={l} value={f[k]||""} onChange={e=>s(k,e.target.value)} placeholder={p}/>)}</div>
        <div className="flex items-center gap-4 mt-3 pt-4 border-t border-gray-100">
          <Btn variant="success" onClick={save}>✓ Salva dati catastali</Btn>
          {saved&&<p className="text-emerald-600 text-sm font-semibold">Salvato!</p>}
        </div>
      </div>
    </div>
  );
}

function CondSegnalazioni({user}) {
  const {data:list,loading,reload}=useData(()=>GET("segnalazioni",`user_id=eq.${user.id}&select=*&order=created_at.desc`,user.token),[user.token,user.id]);
  const [form,setForm]=useState({tipo:"",descrizione:"",urgenza:"normale"});
  const [sending,setSending]=useState(false); const [sent,setSent]=useState(false);
  const s=(k,v)=>setForm(p=>({...p,[k]:v}));
  const submit=async()=>{
    if(!form.tipo||!form.descrizione){alert("Compila tutti i campi."); return;}
    setSending(true);
    try{
      await POST("segnalazioni",{user_id:user.id,cond_id:user.cond_id,...form},user.token);
      const contatti=(await GET("contatti","id=eq.1",user.token))?.[0];
      await notifySegnalazione(form,user.name,user.condominii?.nome,user.interno,contatti?.email);
      setForm({tipo:"",descrizione:"",urgenza:"normale"});
      setSent(true); setTimeout(()=>setSent(false),3000); reload();
    }catch(e){alert(e.message);}
    setSending(false);
  };
  const tipi=["Guasto impianti","Infiltrazioni d'acqua","Problemi parti comuni","Rumori molesti","Sicurezza","Altro"];
  return (
    <div>
      <h2 className="text-2xl font-black text-gray-800 mb-5">Segnalazioni</h2>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <h3 className="font-bold text-gray-700 mb-4">Nuova segnalazione</h3>
        <Sel label="Tipo di problema *" value={form.tipo} onChange={e=>s("tipo",e.target.value)}>
          <option value="">— Seleziona —</option>
          {tipi.map(t=><option key={t} value={t}>{t}</option>)}
        </Sel>
        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Descrizione *</label>
          <textarea value={form.descrizione} onChange={e=>s("descrizione",e.target.value)} rows={4} placeholder="Descrivi il problema in dettaglio..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"/>
        </div>
        <Sel label="Urgenza" value={form.urgenza} onChange={e=>s("urgenza",e.target.value)}>
          <option value="normale">Normale</option>
          <option value="urgente">⚠️ Urgente</option>
        </Sel>
        {sent&&<div className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm rounded-xl px-3 py-2 mb-3">✓ Segnalazione inviata! Lo studio la contatterà al più presto.</div>}
        <Btn onClick={submit} disabled={sending||!form.tipo||!form.descrizione}>{sending?"Invio in corso...":"🚨 Invia segnalazione"}</Btn>
      </div>
      <h3 className="font-bold text-gray-700 mb-3">Le mie segnalazioni</h3>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!list?.length?<EmptyState icon="🚨" text="Nessuna segnalazione inviata."/>:list.map((s,i)=>(
          <div key={s.id} className={`p-4 ${i<list.length-1?"border-b border-gray-50":""}`}>
            <div className="flex items-center justify-between mb-1">
              <p className="font-semibold text-gray-800 text-sm">{s.tipo}</p>
              <StatoBadge s={s.stato}/>
            </div>
            <p className="text-xs text-gray-500 mb-1">{s.descrizione}</p>
            <p className="text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString("it-IT")} · {s.urgenza==="urgente"?"⚠️ Urgente":"Normale"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── App Root ──────────────────────────────────────────────────────────────────
export default function App() {
  const [user,setUser]=useState(null); const [view,setView]=useState("docs"); const [checking,setChecking]=useState(true);
  const [cookieOk,setCookieOk]=useState(()=>localStorage.getItem("cookie_consent_v1")==="accepted");

  useEffect(()=>{
    (async()=>{
      try{
        const saved=localStorage.getItem("sb_session_v1");
        if(saved){
          const sess=JSON.parse(saved);
          const profiles=await GET("profiles",`id=eq.${sess.id}&select=*,condominii(*)`,sess.token);
          if(profiles?.length){ setUser({...sess,...profiles[0]}); setView(sess.role==="admin"?"condominii":"docs"); }
        }
      }catch{}
      setChecking(false);
    })();
  },[]);

  const acceptCookie=()=>{ localStorage.setItem("cookie_consent_v1","accepted"); setCookieOk(true); };
  const handleLogin=async u=>{
    try{localStorage.setItem("sb_session_v1",JSON.stringify({id:u.id,token:u.token,role:u.role}));}catch{}
    setUser(u);
    setView(u.role==="admin"?"condominii":"docs");
  };
  const handlePasswordChanged=()=>{
    setUser(u=>({...u,primo_accesso:false}));
  };
  const handleLogout=async()=>{ try{await sb("/auth/v1/logout",{method:"POST",token:user.token});}catch{} localStorage.removeItem("sb_session_v1"); setUser(null); };

  if(checking) return <div className="min-h-screen bg-gradient-to-br from-slate-800 to-blue-900 flex items-center justify-center"><div className="w-10 h-10 border-4 border-blue-300 border-t-white rounded-full animate-spin"/></div>;

  return (
    <>
      {!user && <Login onLogin={handleLogin}/>}
      {user && user.role!=="admin" && user.primo_accesso && <CambioPassword user={user} onComplete={handlePasswordChanged}/>}
      {user && user.role==="admin" && <AdminPanel user={user} onLogout={handleLogout} view={view} setView={setView}/>}
      {user && user.role!=="admin" && !user.primo_accesso && <CondominoPanel user={user} onLogout={handleLogout} view={view} setView={setView}/>}
      {!cookieOk && <CookieBanner onAccept={acceptCookie}/>}
    </>
  );
}