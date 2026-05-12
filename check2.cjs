const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE,'Desktop','portale-mazzini','src','App.jsx');
const lines = fs.readFileSync(file,'utf8').split('\n');
lines.slice(585,630).forEach((l,i)=>console.log((586+i)+': '+l));
