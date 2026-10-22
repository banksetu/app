import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import ts from 'typescript';

const root=resolve(import.meta.dirname,'..');
const configSource=await readFile(resolve(root,'vite.config.ts'),'utf8');
const stripped=configSource.replace(/^import .*;\n/gm,'')
  .replace('export default defineConfig(', 'return defineConfig(');
const evaluate=new Function('process','readFileSync','react','defineConfig',ts.transpileModule(stripped,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText);
const config=env=>evaluate({env},()=>'{"version":"test-version"}',()=>({name:'react-test'}),value=>value);

test('bare npm run dev uses loopback and the real local WebSocket port',()=>{
  const {server}=config({});
  assert.equal(server.host,'127.0.0.1');
  assert.equal(server.port,5173);
  assert.equal(server.hmr,undefined);
  assert.deepEqual(server.allowedHosts,[]);
});

test('Codespaces permits its exact forwarded host and uses its HTTPS WebSocket',()=>{
  const {server}=config({CODESPACE_NAME:'synthetic-workspace',GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:'app.github.dev'});
  assert.equal(server.host,'0.0.0.0');
  assert.deepEqual(server.allowedHosts,['synthetic-workspace-5173.app.github.dev']);
  assert.deepEqual(server.hmr,{protocol:'wss',host:'synthetic-workspace-5173.app.github.dev',clientPort:443});
  assert.equal(server.strictPort,true);
});

test('Codespaces fallback domain stays scoped to this workspace',()=>{
  const {server}=config({CODESPACE_NAME:'other-workspace'});
  assert.deepEqual(server.allowedHosts,['other-workspace-5173.app.github.dev']);
  assert.equal(config({GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:'app.github.dev'}).server.hmr,undefined);
});
