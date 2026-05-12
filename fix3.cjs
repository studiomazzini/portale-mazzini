const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE,'Desktop','portale-mazzini','src','App.jsx');
let c = fs.readFileSync(file,'utf8');
const OLD = 'const [bulkModal,setBulkModal]=useState(false); const [bulkModal,setBulkModal]=useState(false);';
const NEW = 'const [bulkModal,setBulkModal]=useState(false);';
if(c.includes(OLD)){ c=c.split(OLD).join(NEW); fs.writeFileSync(file,c,'utf8'); console.log('OK corretto!'); }
else console.log('Pattern non trovato');
