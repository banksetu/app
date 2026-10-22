// App-owned dialogs inherit the same appearance as portals and every page.
// Keep native OS pickers/print services under the operating system's control.
let tail=Promise.resolve();
const pending=new Set<string>();
function openDialog(message:string,title:string,confirmation:boolean):Promise<boolean>{
 const key=title+'\n'+message;
 if(pending.has(key))return Promise.resolve(false);
 pending.add(key);
 const task=tail.then(()=>new Promise<boolean>(resolve=>{
  const previous=document.activeElement,dialog=document.createElement('dialog'),heading=document.createElement('h2'),copy=document.createElement('p'),actions=document.createElement('div');
  dialog.className='app-message-dialog';dialog.setAttribute('aria-label',title);dialog.setAttribute('role',confirmation?'dialog':'alertdialog');heading.textContent=title;copy.textContent=message;actions.className='app-dialog-actions';
  const finish=(value:boolean)=>{dialog.close();dialog.remove();window.removeEventListener('banksetu-workspace-change',cancel);pending.delete(key);if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();resolve(value);};
  const cancel=()=>finish(false);dialog.addEventListener('cancel',event=>{event.preventDefault();cancel();});window.addEventListener('banksetu-workspace-change',cancel,{once:true});
  if(confirmation){const button=document.createElement('button');button.type='button';button.textContent='Cancel';button.onclick=cancel;actions.append(button);}
  const accept=document.createElement('button');accept.type='button';accept.textContent=confirmation?'Confirm':'OK';accept.className='app-dialog-confirm';accept.onclick=()=>finish(true);actions.append(accept);dialog.append(heading,copy,actions);document.body.append(dialog);dialog.showModal();
 }));
 tail=task.then(()=>undefined,()=>undefined);return task;
}
export const confirmAction=(message:string,title='Confirm action')=>openDialog(message,title,true);
export const showMessage=(message:string,title='Bank Setu')=>openDialog(message,title,false).then(()=>undefined);
