import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

// Frontend-only and desktop-only releases reuse the last verified backend.
// Keep this list aligned with deploy-cloudflare.yml's push path filter.
const backendPaths=['src/core/afsmPdf.ts','src/core/localData.ts','apps-script/Code.gs','src/core/photoState.ts','scripts/generate-sw.mjs','cloudflare','firestore.rules','scripts/enforce-client-licenses.mjs','scripts/verify-backend-release-gate.mjs','.github/workflows/deploy-cloudflare.yml'];
export function backendSourceCommit(run=execFileSync){
 return run('git',['log','--first-parent','-1','--format=%H','--',...backendPaths],{encoding:'utf8'}).trim();
}
// The release gate checks the exact commit that last changed backend code.
export async function verifyBackendReleaseGate({repository,token,sourceCommit,fetchImpl=fetch}){
 if(!repository||!token)throw Error('GitHub Actions backend verification credentials are unavailable.');
 if(!/^[a-f0-9]{40}$/.test(sourceCommit))throw Error('Cannot identify the current backend source commit.');
 const url=`https://api.github.com/repos/${repository}/actions/workflows/deploy-cloudflare.yml/runs?branch=codex%2Fspark-client-workspace-20261001&per_page=100`;
 const response=await fetchImpl(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error(`Cannot verify the backend deployment (${response.status}).`);
 const runs=(await response.json()).workflow_runs||[];
 if(!runs.some(run=>run.head_sha===sourceCommit&&run.conclusion==='success'))throw Error('The current Cloudflare Worker and Firestore rules commit has no successful production deployment. Finish the backend workflow before releasing native apps.');
 return sourceCommit;
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const sourceCommit=backendSourceCommit();
 const verified=await verifyBackendReleaseGate({repository:process.env.GITHUB_REPOSITORY,token:process.env.GH_TOKEN,sourceCommit});
 console.log(`Backend deployment confirmed for ${verified}.`);
}
