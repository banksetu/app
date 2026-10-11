import { requireLicensedWrite } from "./core/licenseAccess";
import { isAndroid, startAndroidRuntime } from "./platform/android/runtime";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

startAndroidRuntime();
if(!isAndroid() && location.protocol!=="banksetu:"){
  const browserPrint=window.print.bind(window);
  window.print=()=>{void requireLicensedWrite().then(browserPrint).catch(error=>window.alert(error instanceof Error?error.message:"Verify your license before printing."));};
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (!isAndroid() && "serviceWorker" in navigator && location.protocol === "https:") {
  const registerLatestWorker = async () => {
    try {
      // Never let an old browser cache keep serving the previous production bundle.
      const registration = await navigator.serviceWorker.register("/sw.js", {
        updateViaCache: "none",
      });
      await registration.update();

      if (registration.waiting) {
        registration.waiting.postMessage("ACTIVATE_UPDATE");
      }

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        const reloadKey = "banksetu-sw-reloaded";
        if (!sessionStorage.getItem(reloadKey)) {
          sessionStorage.setItem(reloadKey, "1");
          window.location.reload();
        }
      });
    } catch (error) {
      console.warn("Offline application cache unavailable", error);
    }
  };

  void registerLatestWorker();
}
