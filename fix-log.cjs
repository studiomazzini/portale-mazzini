const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE,'Desktop','portale-mazzini','src','App.jsx');
let c = fs.readFileSync(file,'utf8');
c = c.replace(
  'if(data.length>0) console.log("COLONNE EXCEL:",Object.keys(data[0]));',
  'if(data.length>0) console.log("COLONNE EXCEL: "+Object.keys(data[0]).join(" | "));'
);
fs.writeFileSync(file,c,'utf8');
console.log('OK');
