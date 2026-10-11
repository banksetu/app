export type RecoveryCategory="auth"|"bridge"|"database-lock"|"network"|"photo"|"license"|"sync"|"pdf"|"storage"|"print";
export type RecoveryEvent={at:number;category:RecoveryCategory;action:string;result:"recovering"|"verified"|"attention"};

export function classifyRecovery(error: unknown): RecoveryCategory {
  const message=String(error instanceof Error?error.message:error).toLowerCase();
  if(/license|entitlement|renewal/.test(message))return "license";
  if(/quota|storage full|no space|insufficient storage/.test(message))return "storage";
  if(/pdf|preview|canvas/.test(message))return "pdf";
  if(/print|printer/.test(message))return "print";
  if(/lock timeout|sync busy|another process/.test(message))return "database-lock";
  if(/bridge|workspace connection/.test(message))return "bridge";
  if(/token|authentication|sign in|permission/.test(message))return "auth";
  if(/photo|drive/.test(message))return "photo";
  if(/offline|network|fetch|timeout|429|50[0234]/.test(message))return "network";
  return "sync";
}

/** Diagnostic codes and outcomes only; customer details and server error text stay out of history. */
export function recoveryJournal(limit=20) {
  const history:RecoveryEvent[]=[];
  return {
    add(event:RecoveryEvent){
      const last=history.at(-1);
      if(last?.category===event.category && last.result===event.result && event.at-last.at<60_000)return;
      history.push(event);if(history.length>limit)history.splice(0,history.length-limit);
    },
    list(){return history.slice().reverse();},
    clear(){history.length=0;},
  };
}
