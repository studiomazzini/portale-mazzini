const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE,'Desktop','portale-mazzini','src','App.jsx');
let c = fs.readFileSync(file,'utf8');
const OLD = 'if(!isNaN(imp)&&imp>0) await UPS("rate_condomino",{rata_id:r.id,user_id:u.id,importo:imp,notificato:false},tok);';
const NEW = 'if(!isNaN(imp)&&imp>0) await sb("/rest/v1/rate_condomino?on_conflict=rata_id,user_id",{method:"POST",body:{rata_id:r.id,user_id:u.id,importo:imp,notificato:false},prefer:"return=representation,resolution=merge-duplicates",token:tok});';
if(c.includes(OLD)){ c=c.split(OLD).join(NEW); fs.writeFileSync(file,c,"utf8"); console.log("OK corretto!"); }
else console.log("Pattern non trovato");
