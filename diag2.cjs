const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE,'Desktop','portale-mazzini','src','App.jsx');
const lines = fs.readFileSync(file,'utf8').split('\n');
console.log('=== Cerca d.sent ===');
lines.forEach((l,i)=>{ if(l.includes('d.sent')) console.log((i+1)+': '+l); });
console.log('\n=== Riga condominio row (465-480) ===');
lines.slice(464,482).forEach((l,i)=>console.log((465+i)+': '+l));
