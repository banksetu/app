import fs from 'node:fs';
fs.mkdirSync('public/client-bridge',{recursive:true});
fs.copyFileSync('apps-script/Code.gs','public/client-bridge/Code.gs');
