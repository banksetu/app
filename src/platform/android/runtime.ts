import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const isAndroid = () => Capacitor.getPlatform() === 'android';
const NativePrint = registerPlugin<{ print(): Promise<void> }>('BankSetuPrint');
export function startAndroidRuntime() {
  if (!isAndroid()) return;
  window.print = () => { void NativePrint.print().catch(() => window.alert('Printing could not be started. Please retry.')); };
  void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) window.dispatchEvent(new Event('online'));
  });
}
export async function shareAndroidBackup(text: string) {
  const path = `BankSetu-backup-${Date.now()}.json`;
  const result = await Filesystem.writeFile({path, data: text, directory: Directory.Cache, encoding: Encoding.UTF8});
  try {
    await Share.share({title: 'Bank Setu backup', files: [result.uri], dialogTitle: 'Save your workspace backup'});
  } finally {
    // Keep the temporary file long enough for the chosen app to read it.
    setTimeout(() => { void Filesystem.deleteFile({path, directory: Directory.Cache}).catch(() => undefined); }, 300000);
  }
}
