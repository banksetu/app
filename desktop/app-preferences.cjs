const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');

const shortcutPages=['dashboard','customer-entry','quick-passbook','passbook','all-customer-data','customers','search','forms-send-to-branch','settings'];
const shortcutKeys=new Set(Array.from({length:12},(_,index)=>`F${index+1}`));
const defaultShortcuts=Object.freeze(Object.fromEntries(shortcutPages.map((page,index)=>[page,`F${index+1}`])));

function valid(value){
  const input=value&&typeof value==='object'?value:{};
  const printer=typeof input.defaultPrinter==='string'&&input.defaultPrinter.length<=260?input.defaultPrinter:'';
  const shortcuts={};const used=new Set();
  for(const page of shortcutPages){
    const saved=input.shortcuts&&Object.prototype.hasOwnProperty.call(input.shortcuts,page)?input.shortcuts[page]:defaultShortcuts[page];
    const key=String(saved||'');
    if(!key){shortcuts[page]='';continue;}
    if(shortcutKeys.has(key)&&!used.has(key)){shortcuts[page]=key;used.add(key);continue;}
    const fallback=defaultShortcuts[page];
    shortcuts[page]=shortcutKeys.has(fallback)&&!used.has(fallback)?fallback:'';
    if(shortcuts[page])used.add(shortcuts[page]);
  }
  return {defaultPrinter:printer,shortcuts};
}

function createAppPreferences(file){
  let state;
  try{state=valid(JSON.parse(fs.readFileSync(file,'utf8')));}catch{state=valid({});}
  const save=()=>{
    fs.mkdirSync(path.dirname(file),{recursive:true});
    const temporary=`${file}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary,JSON.stringify(state),{flag:'wx',mode:0o600});
    fs.renameSync(temporary,file);
  };
  return {
    get:()=>({defaultPrinter:state.defaultPrinter,shortcuts:{...state.shortcuts}}),
    setDefaultPrinter(value){state.defaultPrinter=typeof value==='string'&&value.length<=260?value:'';save();},
    setShortcut(page,key){
      if(!shortcutPages.includes(page)||key!==''&&!shortcutKeys.has(key))throw Error('Invalid shortcut.');
      const current=state.shortcuts[page]||'';
      const occupied=Object.keys(state.shortcuts).find(item=>item!==page&&state.shortcuts[item]===key);
      if(occupied){if(current)state.shortcuts[occupied]=current;else delete state.shortcuts[occupied];}
      if(key)state.shortcuts[page]=key;else delete state.shortcuts[page];
      save();
    },
    resetShortcuts(){state.shortcuts={...defaultShortcuts};save();}
  };
}

module.exports={createAppPreferences,defaultShortcuts,shortcutPages};
