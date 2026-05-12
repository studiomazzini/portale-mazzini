const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE,'Desktop','portale-mazzini','src','App.jsx');
let c = fs.readFileSync(file,'utf8');
const OLD = 'const parsed=data.filter(r=>g(r,["Cognome","COGNOME"])||g(r,["Nome","NOME"])).map(r=>{';
const NEW = 'if(data.length>0) console.log("COLONNE EXCEL:",Object.keys(data[0]));\n      const parsed=data.filter(r=>g(r,["Cognome","COGNOME"])||g(r,["Nome","NOME"])).map(r=>{';
if(c.includes(OLD)){c=c.split(OLD).join(NEW);fs.writeFileSync(file,c,'utf8');console.log('OK');}
else console.log('NON TROVATO');
