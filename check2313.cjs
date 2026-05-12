const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE,'Desktop','portale-mazzini','src','App.jsx');
let lines = fs.readFileSync(file,'utf8').split('\n');
console.log('Riga 2312:', lines[2311]);
console.log('Riga 2313:', lines[2312]);
console.log('Riga 2314:', lines[2313]);
console.log('Riga 2315:', lines[2314]);
