const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE,'Desktop','portale-mazzini','src','App.jsx');
let lines = fs.readFileSync(file,'utf8').split('\n');

function removeSecond(marker) {
  let count = 0;
  let start = -1;
  for(let i=0;i<lines.length;i++) {
    if(lines[i].includes(marker)) {
      count++;
      if(count===2) { start=i; break; }
    }
  }
  if(start===-1) { console.log('NON TROVATO secondo:', marker); return; }
  // Trova la fine della funzione (prossima riga che inizia con "function " o "// ──")
  let end = start+1;
  while(end<lines.length && !lines[end].match(/^function [A-Z]/) && !lines[end].match(/^\/\/ ──/)) end++;
  lines.splice(start, end-start);
  console.log('OK rimosso duplicato:', marker, '(righe',start+1,'→',end,')');
}

// Rimuovi secondo InlineInquilini
removeSecond('function InlineInquilini(');
// Rimuovi secondo BulkImportiModal
removeSecond('function BulkImportiModal(');
// Rimuovi riga duplicata bulkModal
for(let i=0;i<lines.length-1;i++){
  if(lines[i].includes('bulkModal')&&lines[i].includes('useState')&&
     lines[i+1].includes('bulkModal')&&lines[i+1].includes('useState')){
    lines.splice(i+1,1);
    console.log('OK rimossa riga bulkModal duplicata');
    break;
  }
}

fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log('Fatto. Ora: git add . && git commit -m "fix duplicati" && git push');
