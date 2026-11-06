/** Lightweight runtime guard for the optional Layout Studio engine.
 * This feature is available only inside the trusted Windows EXE shell.
 * It intentionally does NOT change normal customer, bank PDF or Android flows.
 * Backend authorization and Master approval remain separately enforced.
 */
export type LayoutEngineRuntime={
  scheme:string;
  platform?:string;
  protocol?:number;
  desktopRepository:boolean;
};
export function isWindowsLayoutRuntime(runtime:LayoutEngineRuntime):boolean{
  return runtime.scheme==="banksetu:" &&
    runtime.platform==="win32" &&
    runtime.protocol===1 &&
    runtime.desktopRepository===true;
}
export function windowsLayoutEngineAvailable():boolean{
  if(typeof window==="undefined")return false;
  const host=window as Window & {
    bankSetuPr2?:{platform?:string;protocol?:number};
    bankSetuDesktop?:{read?:(scope:string)=>Promise<unknown>;commit?:(...args:unknown[])=>Promise<unknown>};
  };
  return isWindowsLayoutRuntime({
    scheme:window.location.protocol,
    platform:host.bankSetuPr2?.platform,
    protocol:host.bankSetuPr2?.protocol,
    desktopRepository:typeof host.bankSetuDesktop?.read==="function" &&
      typeof host.bankSetuDesktop?.commit==="function",
  });
}
