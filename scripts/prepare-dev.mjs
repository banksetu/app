import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

const projectRoot=resolve(fileURLToPath(new URL('..',import.meta.url)));

export async function missingDevDependencies(root=projectRoot) {
  const manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
  const lock=JSON.parse(await readFile(join(root,'package-lock.json'),'utf8'));
  const names=Object.keys({...manifest.dependencies,...manifest.devDependencies});
  const missing=[];
  for(const name of names) {
    try {
      const installed=JSON.parse(await readFile(join(root,'node_modules',name,'package.json'),'utf8'));
      const expected=lock.packages?.[`node_modules/${name}`]?.version;
      if(expected && installed.version!==expected)missing.push(name);
    } catch { missing.push(name); }
  }
  return missing;
}

function installDependencies(root) {
  // npm supplies its CLI path to lifecycle scripts on Windows and Linux.
  // Use the existing lockfile and ordinary install scripts; never replace
  // native Capacitor modules with browser-only mocks or change their versions.
  const cli=process.env.npm_execpath;
  if(!cli)throw new Error('Run npm run dev, or install project packages with npm ci first.');
  const result=spawnSync(process.execPath,[cli,'ci','--include=dev','--no-audit','--no-fund'],{
    cwd:root,stdio:'inherit',env:process.env,
  });
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error('Project package installation failed. Resolve the npm error above and run npm run dev again.');
}

export async function prepareDev({root=projectRoot,install=installDependencies,log=console.log}={}) {
  const missing=await missingDevDependencies(root);
  if(!missing.length)return;
  log(`Installing missing or outdated project packages: ${missing.join(', ')}`);
  await install(root);
  const remaining=await missingDevDependencies(root);
  if(remaining.length)throw new Error(`Project packages are still unavailable: ${remaining.join(', ')}. Run npm ci before starting the preview.`);
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try { await prepareDev(); }
  catch(error) { console.error(error instanceof Error?error.message:error);process.exitCode=1; }
}
