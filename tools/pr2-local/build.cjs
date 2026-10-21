'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'build/pr2-local');
fs.mkdirSync(out,{recursive:true});
// Isolated derivative only: production helper, protocol and app remain untouched.
let source=fs.readFileSync(path.join(root,'desktop/pr2-helper/Bridge.cs'),'utf8').replace(/\r\n/g,'\n');
source=source.replace('public string path;','public string path; public bool targetHardware;');
source=source.replace('transport=transport};','transport=transport,targetHardware=path.IndexOf("vid_04b8&pid_0005",StringComparison.OrdinalIgnoreCase)>=0};');
source=source.replace('d.id,d.name,d.transport','d.id,d.name,d.transport,d.targetHardware');
source=source.replace('if(d.transport=="serial"){','if(!d.targetHardware || d.transport!="usb-direct")throw new Exception("Only USB VID_04B8 PID_0005 is allowed.");\n    if(d.transport=="serial"){');
const old='while(total<count){int n=stream.Read(bytes,total,count-total);if(n==0)throw new Exception("Printer disconnected before its status reply.");total+=n;}\n    return new {data=Convert.ToBase64String(bytes)};';
if(!source.includes(old))throw Error('Upstream read implementation changed; review adaptation');
source=source.replace(old,`bool timedOut=false;var watch=System.Diagnostics.Stopwatch.StartNew();
    while(total<count){
     int remaining=3000-(int)watch.ElapsedMilliseconds;if(remaining<=0){timedOut=true;break;}
     var pending=stream.BeginRead(bytes,total,count-total,null,null);
     if(!pending.AsyncWaitHandle.WaitOne(remaining)){timedOut=true;CancelIoEx(handle,IntPtr.Zero);try{stream.EndRead(pending);}catch{}break;}
     int n=stream.EndRead(pending);if(n==0)break;total+=n;
    }
    return new {data=Convert.ToBase64String(bytes,0,total),timedOut=timedOut};`);
// Small FileStream reads otherwise prefetch up to 4096 bytes; isolate USB transactions.
source=source.replace('new FileStream(handle,FileAccess.ReadWrite,4096,true)', 'new FileStream(handle,FileAccess.ReadWrite,1,true)');
source=source.replace('case "read": {', `case "capture": {
    if(stream==null||handle==null)throw new Exception("USB not connected.");
    byte[] bytes=new byte[256];int total=0;bool quiet=false;int zeroReads=0;
    var segments=new List<object>();var watch=System.Diagnostics.Stopwatch.StartNew();long lastByteAt=0;
    while(total<bytes.Length && watch.ElapsedMilliseconds<1500){
     int wait=(total==0?1000-(int)watch.ElapsedMilliseconds:150-(int)(watch.ElapsedMilliseconds-lastByteAt));
     wait=Math.Min(wait,1500-(int)watch.ElapsedMilliseconds);
     if(wait<=0){quiet=true;break;}
     var pending=stream.BeginRead(bytes,total,bytes.Length-total,null,null);
     if(!pending.AsyncWaitHandle.WaitOne(wait)){
      CancelIoEx(handle,IntPtr.Zero);int late=0;
      try{late=stream.EndRead(pending);}catch(IOException){}
      if(late>0){segments.Add(new {offset=total,count=late,elapsedMs=watch.ElapsedMilliseconds,cancelRace=true});total+=late;}
      quiet=true;break;
     }
     int n=stream.EndRead(pending);
     if(n==0){
      // Some USB printer interfaces complete an empty read immediately even
      // while a response is still arriving. Do not send the next command yet.
      zeroReads++;System.Threading.Thread.Sleep(Math.Min(25,Math.Max(1,wait)));
      continue;
     }
     segments.Add(new {offset=total,count=n,elapsedMs=watch.ElapsedMilliseconds,cancelRace=false});total+=n;lastByteAt=watch.ElapsedMilliseconds;
    }
    if(watch.ElapsedMilliseconds>=1500)quiet=true;
    return new {data=Convert.ToBase64String(bytes,0,total),segments=segments,zeroReads=zeroReads,quietTimeout=quiet,limitReached=total==bytes.Length};
   }
   case "read": {`);
const cs=path.join(out,'LocalBridge.cs');fs.writeFileSync(cs,source);
execFileSync(path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/platform:x64','/r:System.Management.dll','/r:System.Web.Extensions.dll','/out:'+path.join(out,'BankSetu.Pr2Bridge.exe'),cs],{stdio:'inherit'});
for(const f of ['agent.cjs','core.cjs','diagnostics.cjs','controller.cjs','controller-main.cjs','Start.cmd','Controller.cmd','mailbox-crypto.cjs','mailbox.cjs','mailbox-session.cjs','pairing-gate.cjs','README.md'])fs.copyFileSync(path.join(__dirname,f),path.join(out,f));
for(const f of ['pr2-native.cjs','pr2-protocol.cjs'])fs.copyFileSync(path.join(root,'desktop',f),path.join(out,f));
fs.copyFileSync(process.execPath,path.join(out,'node.exe'));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(out,f))).digest('hex');
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({protocol:1,sha256:sha('BankSetu.Pr2Bridge.exe')}));
fs.writeFileSync(path.join(out,'SOURCE.txt'),execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}));
const hashes={};for(const f of fs.readdirSync(out))if(fs.statSync(path.join(out,f)).isFile()&&f!=='SHA256.json')hashes[f]=sha(f);
fs.writeFileSync(path.join(out,'SHA256.json'),JSON.stringify(hashes,null,2));
