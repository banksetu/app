const WHATSAPP_APP_URL='whatsapp://send?phone=917002513264&text=Hello%20Bank%20Setu%20Support';
const WHATSAPP_WEB_URL='https://wa.me/917002513264?text=Hello%20Bank%20Setu%20Support';

async function openWhatsAppSupport(shell){
  try{await shell.openExternal(WHATSAPP_APP_URL);return {opened:'app'};}
  catch{await shell.openExternal(WHATSAPP_WEB_URL);return {opened:'browser'};}
}

function installSupportLinks({ipcMain,trusted,shell}){
  ipcMain.handle('support:whatsapp',async event=>{trusted(event);return openWhatsAppSupport(shell);});
}

module.exports={WHATSAPP_APP_URL,WHATSAPP_WEB_URL,openWhatsAppSupport,installSupportLinks};
