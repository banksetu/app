// Internal testing channel: fixed repository and GitHub's SHA-256 asset digest.
// Signed installations continue to use electron-updater's Authenticode verification.
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const REPO='https://api.github.com/repos/banksetu/app/releases?per_page=30';
function newer(next,current){
  const parse=value=>/^\d+\.\d+\.\d+$/.test(value)?value.split('.').map(Number):null;
  const a=parse(next),b=parse(current);if(!a||!b)return false;
  for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;
}
function selectAsset(release,current){
  const version=String(release.tag_name||'').replace(/^v/,'');
  if(release.draft||release.prerelease||!newer(version,current))return null;
  const assets=release.assets?.filter(asset=>asset.state==='uploaded'&&/^Bank[ ._-]?Setu.*\.exe$/i.test(asset.name)&&asset.name.includes(version)) || [];
  // Android-only releases are valid and must not make the Windows updater fail.
  if(!assets.length)return null;
  if(assets.length!==1)throw new Error('A unique Bank Setu Windows installer is required.');
  const asset=assets[0];
  if(!/^sha256:[a-f0-9]{64}$/i.test(asset.digest||'')||!Number.isSafeInteger(asset.size)||asset.size<1000000||asset.size>400*1024*1024)throw new Error('GitHub installer checksum or size is missing.');
  const url=new URL(asset.browser_download_url);
  if(url.origin!=='https://github.com'||!url.pathname.startsWith('/banksetu/app/releases/download/')||url.search||url.hash)throw new Error('Unexpected installer source.');
  return {version,url:url.href,digest:asset.digest.slice(7).toLowerCase(),size:asset.size};
}
function findLatestWindowsAsset(releases,current){
  return releases.map(release=>selectAsset(release,current)).filter(Boolean).sort((a,b)=>{
    const parse=value=>String(value).split('.').map(Number);
    const av=parse(a.version),bv=parse(b.version);
    for(let i=0;i<3;i++)if(av[i]!==bv[i])return bv[i]-av[i];
    return 0;
  })[0] || null;
}
function createTestUpdater({fetch,current,directory,backup,launch,manifestUrl}){
  let selected;
  return {
    async check(){
      if (manifestUrl) {
        const manifestResponse=await fetch(`${manifestUrl}?t=${Date.now()}`,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)}).catch(()=>null);
        if (manifestResponse?.ok) {
          const manifest=await manifestResponse.json().catch(()=>null);
          if (manifest?.windowsVersion && newer(String(manifest.windowsVersion),current)) {
            // Firebase announces the update; GitHub remains the verified binary source.
            const releaseResponse=await fetch(REPO,{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
            if (releaseResponse.ok) {
              const releases=await releaseResponse.json();
              selected=findLatestWindowsAsset(Array.isArray(releases)?releases:[releases],current);
            }
            return {latestVersion:String(manifest.windowsVersion),notes:manifest.notes||'',changelog:manifest.changelog?.windows?.version===manifest.windowsVersion?manifest.changelog.windows:undefined,releaseDate:manifest.releaseDate};
          }
        }
      }
      const response=await fetch(REPO,{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
      if(response.status===404){selected=null;return {latestVersion:current,notes:'No newer test installer is published.'};}
      if(!response.ok)throw new Error('Could not check the Bank Setu test release.');
      const payload=await response.json();
      selected=findLatestWindowsAsset(Array.isArray(payload)?payload:[payload],current);
      return {latestVersion:selected?.version||current,notes:'Internal test channel: GitHub repository and SHA-256 checksum. Database backup is made before installation.'};
    },
    async install(){
      await this.check();if(!selected)throw new Error('No newer test installer is available.');
      const asset={...selected};await fs.mkdir(directory,{recursive:true});
      const file=path.join(directory,`BankSetu-${asset.version}.exe`),temporary=file+'.partial';
      const response=await fetch(asset.url,{signal:AbortSignal.timeout(180000)});
      if(!response.ok||!response.body)throw new Error('Installer download failed.');
      const handle=await fs.open(temporary,'w');const hash=crypto.createHash('sha256');let size=0;
      try{
        for await(const chunk of response.body){size+=chunk.length;if(size>asset.size)throw new Error('Installer exceeds its published size.');hash.update(chunk);await handle.writeFile(chunk);}
        await handle.close();
        if(size!==asset.size||hash.digest('hex')!==asset.digest)throw new Error('Installer checksum verification failed.');
        await fs.rename(temporary,file);backup();await launch(file);
      }catch(error){await handle.close().catch(()=>{});await fs.rm(temporary,{force:true});throw error;}
    }
  };
}
module.exports={newer,selectAsset,findLatestWindowsAsset,createTestUpdater};
