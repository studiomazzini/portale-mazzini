const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE,'Desktop','portale-mazzini','src','App.jsx');
let lines = fs.readFileSync(file,'utf8').split('\n');
// Trova la riga con importData nella funzione AdminUtenti
for(let i=598;i<610;i++){
  if(lines[i]&&lines[i].includes('importData')){
    console.log('Trovata riga '+(i+1));
    lines[i]='        await POST("profiles",{id:uid,name:f.name,role:"condomino",cond_id:Number(f.cond_id),scala:f.scala,interno:f.interno,email:isRealEmail(f.email)?f.email:null,email2:f.email2||null,telefono:f.telefono||null,telefono2:f.telefono2||null,cell:f.cell||null,cell2:f.cell2||null,nome:f.nome||null,cognome:f.cognome||null,titolo:f.titolo||null,presso:f.presso||null,via:f.via||null,localita:f.localita||null,prov:f.prov||null,cap:f.cap||null,num:f.num||null,tipo:f.tipo||null},tok);';
    console.log('OK corretta!');
  }
}
fs.writeFileSync(file,lines.join('\n'),'utf8');
