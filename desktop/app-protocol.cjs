const fs=require('node:fs/promises');
const path=require('node:path');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2','.pdf':'application/pdf','.wasm':'application/wasm'};
// Read packaged ASAR files through Electron's filesystem implementation, avoiding
// file:// network loading of resources under the custom secure origin on Windows.
function createAppProtocol(root){
  root=path.resolve(root);
  return async request=>{
    try{
      const url=new URL(request.url);
      if(url.host!=='app')return new Response('Forbidden',{status:403});
      const pathname=decodeURIComponent(url.pathname);
      const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
      if(!file.startsWith(root+path.sep))return new Response('Forbidden',{status:403});
      const data=await fs.readFile(file);
      return new Response(data,{headers:{'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream'}});
    }catch(error){return new Response('Application resource unavailable',{status:error.code==='ENOENT'?404:400});}
  };
}
module.exports={createAppProtocol};
