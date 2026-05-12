const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE,'Desktop','portale-mazzini','src','App.jsx');
const lines = fs.readFileSync(file,'utf8').split('\n');
lines.forEach((l,i)=>{ if(l.includes('AdminImport')||l.includes('importData')||l.includes('cognome=col')) console.log((i+1)+': '+l.substring(0,120)); });
