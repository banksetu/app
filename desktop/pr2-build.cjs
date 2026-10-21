const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),output=path.join(root,'build/pr2');
function build(){
 if(process.platform!=='win32')throw Error('Build the bundled Printer Bridge on Windows.');
 fs.mkdirSync(output,{recursive:true});
 const csc=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
 const exe=path.join(output,'BankSetu.Pr2Bridge.exe');
 execFileSync(csc,['/nologo','/target:exe','/platform:x64','/optimize+','/r:System.Management.dll','/r:System.Web.Extensions.dll','/out:'+exe,path.join(__dirname,'pr2-helper/Bridge.cs')],{stdio:'inherit'});
 fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({protocol:1,sha256:crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex')}));
}
module.exports=async context=>{if(context.electronPlatformName==='win32')build();};
module.exports.build=build;
if(require.main===module)build();
