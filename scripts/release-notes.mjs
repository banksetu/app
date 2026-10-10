import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const CATEGORIES=['New Features','Bug Fixes','Improvements','Performance & Stability','Security Updates'];
const blocked=/\b(?:password|secret|token|private.key|api.key|credential|customer.name|account.number|aadhaar|uidai|otp)\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|\b\d{9,}\b/i;
export function classify(subject,paths){
  if (/^revert\b|^release metadata\b/i.test(subject)) return null;
  const names=paths.filter(Boolean);
  const app=names.some(path=>/^(src\/|desktop\/|android\/|apps-script\/|cloudflare\/)/.test(path));
  if(!app)return null;
  const windows=names.some(path=>/^(desktop\/|src\/)/.test(path));
  const android=names.some(path=>/^(android\/|src\/)/.test(path));
  const shared=names.some(path=>/^(apps-script\/|cloudflare\/)/.test(path));
  if(!windows&&!android&&!shared)return null;
  const scope=/^[a-z]+\(([^)]+)\)!?:/i.exec(subject)?.[1]?.toLowerCase();
  const clean=subject.replace(/^(feat|fix|perf|refactor|security|docs|chore)(\([^)]+\))?!?:\s*/i,'').trim();
  const safe=clean && clean.length<=150 && !blocked.test(clean) && !/[<>\[\]{}]/.test(clean);
  const category=/^feat(?:\(|:|!)/i.test(subject)?CATEGORIES[0]:/^fix(?:\(|:|!)/i.test(subject)?CATEGORIES[1]:/^perf(?:\(|:|!)/i.test(subject)?CATEGORIES[3]:/^security(?:\(|:|!)/i.test(subject)?CATEGORIES[4]:CATEGORIES[2];
  return {category,text:safe?clean.replace(/[\\*_`#]/g,'').replace(/[.!?]*$/,'.'):'Maintenance and reliability updates.',windows:scope==='windows'||scope==='electron'?true:scope==='android'||scope==='capacitor'?false:windows||shared,android:scope==='android'||scope==='capacitor'?true:scope==='windows'||scope==='electron'?false:android||shared};
}
export function notesFor(commits,platform){
  const categories={};
  const reverted=new Set(commits.map(commit=>/^Revert "(.+)"$/i.exec(commit.subject)?.[1]).filter(Boolean));
  for(const commit of commits){
    if(reverted.has(commit.subject))continue;
    const item=classify(commit.subject,commit.paths);
    if(!item||!item[platform])continue;
    (categories[item.category] ||= []);
    if(!categories[item.category].includes(item.text))categories[item.category].push(item.text);
  }
  return categories;
}
function runGit(args){return execFileSync('git',args,{encoding:'utf8',maxBuffer:3_000_000}).trim();}
export function commitsSince(tag){
  const range=tag?`${tag}..HEAD`:'HEAD';
  const raw=runGit(['log','--first-parent','--max-count=100','--format=@@BANKSETU@@%s','--name-only',range]);
  return raw.split('@@BANKSETU@@').filter(Boolean).map(block=>{
    const [subject,...paths]=block.trim().split('\n').map(x=>x.trim()).filter(Boolean);
    return {subject,paths};
  });
}
function printCategories(categories){return CATEGORIES.filter(name=>categories[name]?.length).map(name=>`### ${name}\n${categories[name].map(text=>`- ${text}`).join('\n')}`).join('\n\n');}
async function previousTag(platform,token){
  if(!token)throw Error('GitHub token required to identify the previous published platform release.');
  const response=await fetch('https://api.github.com/repos/banksetu/app/releases?per_page=100',{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(`Cannot inspect published releases (${response.status}).`);
  const releases=await response.json();
  return releases.find(release=>!release.draft&&!release.prerelease&&release.assets?.some(asset=>platform==='windows'?/^BankSetu-Setup-.*\.exe$/.test(asset.name):/^BankSetu-Android-\d+\.apk$/.test(asset.name)))?.tag_name||'';
}
export async function generate({token=process.env.GH_TOKEN,versionPath='public/version.json',output='release-notes.md'}={}){
  const data=JSON.parse(readFileSync(versionPath,'utf8'));
  const baselines={windows:await previousTag('windows',token),android:await previousTag('android',token)};
  const versions={};
  for(const platform of ['windows','android']){
    if(baselines[platform])runGit(['rev-parse','--verify',`${baselines[platform]}^{commit}`]);
    versions[platform]={version:data.latestVersion,releaseDate:data.releaseDate,categories:notesFor(commitsSince(baselines[platform]),platform)};
  }
  data.changelog=versions;
  data.notes='See What\'s New in This Version.';
  writeFileSync(versionPath,JSON.stringify(data,null,2)+'\n');
  writeFileSync(output,`# Bank Setu ${data.latestVersion}\n\n## Windows\n\n${printCategories(versions.windows.categories)}\n\n## Android\n\n${printCategories(versions.android.categories)}\n`);
  return {baselines,versions};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  generate().then(({baselines})=>console.log('Release notes generated from published platform baselines:',baselines)).catch(error=>{console.error(error.message);process.exitCode=1;});
}
