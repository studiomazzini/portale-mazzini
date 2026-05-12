const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE, 'Desktop', 'portale-mazzini', 'src', 'App.jsx');
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');
const line = lines[453];
const marker = '}; try{modal.mode';
const pos = line.indexOf(marker);
if (pos !== -1) {
  lines[453] = line.substring(0, pos + 2);
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  console.log('Corretto! Ora fai il push.');
} else {
  console.log('Pattern non trovato - dimmi cosa appare.');
}
