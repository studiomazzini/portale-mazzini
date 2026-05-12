const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE,'Desktop','portale-mazzini','src','App.jsx');
let lines = fs.readFileSync(file,'utf8').split('\n');
let removed = 0;
for(let i=0;i<lines.length-1;i++){
  if(lines[i].trim()==='const [bulkModal, setBulkModal] = useState(false);' &&
     lines[i+1].trim()==='const [bulkModal, setBulkModal] = useState(false);'){
    lines.splice(i+1,1);
    removed++;
    console.log('OK rimossa riga duplicata alla riga '+(i+2));
    break;
  }
}
if(removed===0){
  // prova con formato compatto
  for(let i=0;i<lines.length-1;i++){
    if(lines[i].includes('bulkModal')&&lines[i].includes('useState(false)')&&
       lines[i+1].includes('bulkModal')&&lines[i+1].includes('useState(false)')){
      lines.splice(i+1,1);
      console.log('OK rimossa riga duplicata (formato compatto) alla riga '+(i+2));
      break;
    }
  }
}
fs.writeFileSync(file, lines.join('\n'), 'utf8');
