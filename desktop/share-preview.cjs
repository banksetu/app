function installPreviewShare({ipcMain,trusted,dialog,window,fs,shell}) {
  ipcMain.handle('clipboard:share-image',async(event,value)=>{
    trusted(event);
    if(typeof value!=='string'||value.length>16*1024*1024||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value))throw new Error('Invalid preview PNG.');
    const png=Buffer.from(value.slice('data:image/png;base64,'.length),'base64');
    if(png.length<8||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Preview PNG is invalid.');
    const result=await dialog.showSaveDialog(window,{title:'Save customer preview PNG',defaultPath:'BankSetu-customer-preview.png',filters:[{name:'PNG image',extensions:['png']}]});
    if(result.canceled||!result.filePath)return {saved:false,canceled:true};
    await fs.promises.writeFile(result.filePath,png);
    shell.showItemInFolder(result.filePath);
    return {saved:true};
  });
}
module.exports={installPreviewShare};
