import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

// Frontend-only and desktop-only releases reuse the last verified backend.
// Keep this list aligned with deploy-cloudflare.yml's push path filter.
const backendPaths=['src/core/afsmPdf.ts','src/core/localData.ts','apps-script/Code.gs','src/core/photoState.ts','scripts/generate-sw.mjs','cloudflare','firestore.rules','scripts/enforce-client-licenses.mjs','scripts/support-rules.test.mjs','scripts/verify-backend-release-gate.mjs','.github/workflows/deploy-cloudflare.yml'];
export function backendSourceCommit(run=execFileSync){
 return run('git',['log','--first-parent','-1','--format=%H','--',...backendPaths],{encoding:'utf8'}).trim();
}
export function backendTree(commit='HEAD',run=execFileSync){
 return run('git',['ls-tree','-r',commit,'--',...backendPaths],{encoding:'utf8'}).trim();
}
// The release gate checks the exact commit that last changed backend code.
// A main/release sync merge may give identical deployed backend bytes a new
// commit SHA. Accept that case only when the complete guarded tree is equal.
export async function verifyBackendReleaseGate({repository,token,sourceCommit,fetchImpl=fetch,equivalentCommit=()=>false}){
 if(!repository||!token)throw Error('GitHub Actions backend verification credentials are unavailable.');
 if(!/^[a-f0-9]{40}$/.test(sourceCommit))throw Error('Cannot identify the current backend source commit.');
 const url=`https://api.github.com/repos/${repository}/actions/workflows/deploy-cloudflare.yml/runs?branch=codex%2Fspark-client-workspace-20261001&per_page=100`;
 const response=await fetchImpl(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error(`Cannot verify the backend deployment (${response.status}).`);
 const runs=(await response.json()).workflow_runs||[];
 const successful=runs.filter(run=>run.conclusion==='success');
 if(!successful.some(run=>run.head_sha===sourceCommit) &&
    !successful.some(run=>/^[a-f0-9]{40}$/.test(run.head_sha||'')&&equivalentCommit(run.head_sha)))
   throw Error('The current Cloudflare Worker and Firestore rules commit has no successful production deployment. Finish the backend workflow before releasing native apps.');
 return sourceCommit;
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const sourceCommit=backendSourceCommit();
 const currentTree=backendTree();
 const verified=await verifyBackendReleaseGate({
  repository:process.env.GITHUB_REPOSITORY,token:process.env.GH_TOKEN,sourceCommit,
  equivalentCommit:commit=>{try{return backendTree(commit)===currentTree;}catch{return false;}}
 });
 console.log(`Backend deployment confirmed for ${verified}.`);
}
