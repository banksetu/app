import {StrictMode,useEffect} from "react";
import {createRoot} from "react-dom/client";
import {codespacesLayoutPreviewAvailable} from "./platform/layoutCodespacesPreview";
import "./index.css";
import {finishStartupSplash} from "./core/startupSplash";

function LayoutPreviewReady(){
  useEffect(()=>{finishStartupSplash();},[]);
  return null;
}

async function launch(){
  // Development-only Codespaces preview never starts Firebase authentication,
  // standard sync, PR2 bridges, print hooks or a production service worker.
  if(codespacesLayoutPreviewAvailable()&&!new URLSearchParams(window.location.search).has("normal-app")){
    const {default:CodespacesLayoutPreview}=await import("./CodespacesLayoutPreview");
    createRoot(document.getElementById("root")!).render(<StrictMode><LayoutPreviewReady/><CodespacesLayoutPreview/></StrictMode>);
    return;
  }
  const [{showMessage},{requireLicensedWrite},{isAndroid,startAndroidRuntime},{default:App}]=await Promise.all([
    import("./uiDialogs"),import("./core/licenseAccess"),import("./platform/android/runtime"),import("./App.tsx")
  ]);
  startAndroidRuntime();
  if(!isAndroid()&&location.protocol!=="banksetu:"){
    const browserPrint=window.print.bind(window);
    window.print=()=>{void requireLicensedWrite().then(browserPrint)
      .catch(error=>showMessage(error instanceof Error?error.message:"Verify your license before printing."));};
  }
  createRoot(document.getElementById("root")!).render(<StrictMode><App/></StrictMode>);
  if(!isAndroid()&&"serviceWorker" in navigator&&location.protocol==="https:"){
    const registerLatestWorker=async()=>{
      try{
        const registration=await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`,{
          scope:import.meta.env.BASE_URL,updateViaCache:"none"
        });
        await registration.update();
        if(registration.waiting)registration.waiting.postMessage("ACTIVATE_UPDATE");
        navigator.serviceWorker.addEventListener("controllerchange",()=>{
          const key="banksetu-sw-reloaded";
          if(!sessionStorage.getItem(key)){
            sessionStorage.setItem(key,"1");
            window.location.reload();
          }
        });
      }catch(error){console.warn("Offline application cache unavailable",error);}
    };
    void registerLatestWorker();
  }
}
void launch();
