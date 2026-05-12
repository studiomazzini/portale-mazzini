const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE,'Desktop','portale-mazzini','src','App.jsx');
const lines = fs.readFileSync(file,'utf8').split('\n');
let start=-1;
for(let i=0;i<lines.length;i++){ if(lines[i].includes('function AdminImport(')) start=i; }
lines.slice(start,start+30).forEach((l,i)=>console.log((start+1+i)+': '+l.substring(0,150)));
