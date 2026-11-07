const path=require('node:path');
const {createAppPreferences,defaultShortcuts}=require('./app-preferences.cjs');

const routes=[
  ['dashboard','Dashboard',false],
  ['customer-entry','Customer Entry',true],
  ['quick-passbook','Quick Passbook',true],
  ['passbook','Passbook Print',true],
  ['all-customer-data','All Customer Data',false],
  ['customers','Customers',false],
  ['search','Account Opening PDF Sample',true],
  ['forms-send-to-branch','Forms Send to Branch',true],
  ['settings','Settings',false]
];
const allowedKeys=Array.from({length:12},(_,index)=>`F${index+1}`);

function installAppMenu({app,Menu,dialog,getWindow,authorize,userData}){
  const preferences=createAppPreferences(path.join(userData,'banksetu-app-preferences.json'));
  let printers=[];
  const canWrite=()=>{try{authorize();return true;}catch{return false;}};
  const navigate=(page,protectedPage)=>{
    const target=getWindow();if(!target||target.isDestroyed())return;
    if(protectedPage){
      try{authorize();}catch{
        void dialog.showMessageBox(target,{type:'warning',title:'License verification required',message:'Please connect your internet to verify the license.',detail:'This feature is unavailable in read-only mode.',buttons:['OK'],noLink:true});return;
      }
    }
    target.webContents.send('app-menu:navigate',page);
  };
  const rebuild=()=>{
    const settings=preferences.get(),licensed=canWrite();
    const selected=settings.defaultPrinter;
    const printerItems=printers.map(printer=>({label:printer.displayName||printer.name,type:'radio',checked:selected?printer.name===selected:printer.isDefault===true,click:()=>{preferences.setDefaultPrinter(printer.name);rebuild();}}));
    if(selected&&!printers.some(printer=>printer.name===selected))printerItems.unshift({label:`Unavailable: ${selected}`,enabled:false});
    const shortcutItems=routes.map(([page,label,protectedPage])=>({label,accelerator:settings.shortcuts[page],enabled:!protectedPage||licensed,click:()=>navigate(page,protectedPage)}));
    const changeItems=routes.map(([page,label])=>({label,submenu:[
      ...allowedKeys.map(key=>({label:key,type:'radio',checked:settings.shortcuts[page]===key,click:()=>{preferences.setShortcut(page,key);rebuild();}})),
      {type:'separator'},{label:'No shortcut',type:'radio',checked:!settings.shortcuts[page],click:()=>{preferences.setShortcut(page,'');rebuild();}}
    ]}));
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {label:'File',submenu:[{role:'close'},{type:'separator'},{role:'quit'}]},
      {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
      {label:'Window',submenu:[{role:'minimize'},{role:'zoom'},{type:'separator'},{role:'front'}]},
      {label:'Default Printer',submenu:[
        {label:'Use Windows Default Printer',type:'radio',checked:!selected,click:()=>{preferences.setDefaultPrinter('');rebuild();}},
        {type:'separator'},
        ...(printerItems.length?printerItems:[{label:'No installed printers found',enabled:false}]),
        {type:'separator'},{label:'Refresh Printer List',click:()=>void refreshPrinters()}
      ]},
      {label:'Shortcuts',submenu:[...shortcutItems,{type:'separator'},{label:'Change Shortcuts',submenu:changeItems},{label:'Reset to Default',click:()=>{preferences.resetShortcuts();rebuild();}}]}
    ]));
  };
  const refreshPrinters=async()=>{
    const target=getWindow();
    if(target&&!target.isDestroyed())printers=await target.webContents.getPrintersAsync().catch(()=>[]);
    rebuild();return printers;
  };
  rebuild();
  return {refreshPrinters,refreshState:rebuild,getDefaultPrinter:()=>preferences.get().defaultPrinter,getPreferences:()=>preferences.get()};
}

module.exports={installAppMenu,routes,defaultShortcuts};
