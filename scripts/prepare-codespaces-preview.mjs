/** Codespaces-only dev helper. The editor's pinned offline English/Hindi OCR
 * runtime must exist at /ocr in Vite dev; production builds keep their own
 * established build/postprocess step. No SaaS, CDN or scan upload is involved.
 */
import {prepareOfflineOcr} from "./prepare-offline-ocr.mjs";
if(process.env.CODESPACE_NAME){
  const manifest=prepareOfflineOcr("public");
  console.log("Codespaces layout lab: bundled offline OCR ready",manifest);
}
