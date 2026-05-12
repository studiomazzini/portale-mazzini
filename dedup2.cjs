const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE,'Desktop','portale-mazzini','src','App.jsx');
let lines = fs.readFileSync(file,'utf8').split('\n');
let count=0, start=-1;
for(let i=0;i<lines.length;i++){
  if(lines[i].includes('function CondProfilo(')){
    count++;
    if(count===2){start=i; break;}
  }
}
if(start===-1){console.log('Non trovato'); process.exit();}
let end=start+1;
while(end<lines.length && !lines[end].match(/^function [A-Z]/) && !lines[end].match(/^\/\/ ──/)) end++;
lines.splice(start,end-start);
fs.writeFileSync(file,lines.join('\n'),'utf8');
console.log('OK rimosso duplicato CondProfilo');
