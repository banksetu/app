/** Only the Android packaging script sets the client build target.
 * No release, cloud sync, repository mutation or alternate data engine.
 * Build failures stop before Capacitor sync; Windows EXE remains untouched.
 */
import {spawnSync} from "node:child_process";
const windows=process.platform==="win32";
const execute=(cmd,args,env=process.env)=>{
 const result=spawnSync(cmd,args,{stdio:"inherit",env,shell:windows});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
};
execute(windows?"npm.cmd":"npm",["run","build"],{...process.env,BANKSETU_BUILD_TARGET:"android"});
execute(windows?"npx.cmd":"npx",["cap","sync","android"]);
