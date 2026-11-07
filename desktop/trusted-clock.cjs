const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');

function createTrustedClock(file,safeStorage){
  const load=()=>{
    if(!fs.existsSync(file))return {};
    if(!safeStorage.isEncryptionAvailable())throw Error('Windows credential encryption is unavailable. Connect to verify the license.');
    try{return JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));}
    catch{throw Error('The protected license clock is invalid. Please connect your internet to verify the license.');}
  };
  const save=value=>{
    if(!safeStorage.isEncryptionAvailable())throw Error('Windows credential encryption is unavailable. Connect to verify the license.');
    fs.mkdirSync(path.dirname(file),{recursive:true});
    const temporary=`${file}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary,safeStorage.encryptString(JSON.stringify(value)),{flag:'wx',mode:0o600});
    fs.renameSync(temporary,file);
  };
  return {
    observe(uid,time){
      if(!uid||!Number.isFinite(time))throw Error('Invalid trusted license time.');
      const state=load(),prior=Number(state[uid]||0);
      if(time<prior-5*60*1000)throw Error('Device date/time was changed. Please connect your internet to verify the license.');
      if(time>prior){state[uid]=time;save(state);}
      return Math.max(prior,time);
    },
    verify(uid,time=Date.now()){
      const state=load(),prior=Number(state[uid]||0);
      if(!prior)throw Error('Protected license time is missing. Please connect your internet to verify the license.');
      if(time<prior-5*60*1000)throw Error('Device date/time was changed. Please connect your internet to verify the license.');
      if(time>prior){state[uid]=time;save(state);}
      return true;
    }
  };
}

module.exports={createTrustedClock};
