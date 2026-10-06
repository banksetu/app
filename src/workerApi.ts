import { auth } from "./firebase";

const workerUrl = String(import.meta.env.VITE_BANKSETU_WORKER_URL || "")
  .trim()
  .replace(/\/+$/, "");

export async function callBankSetuWorker<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in again.");
  if (!workerUrl) {
    throw new Error("The trusted Cloudflare account service is not configured yet.");
  }

  let idToken = await user.getIdToken();
  const send = () => fetch(`${workerUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  let response=await send();
  if(response.status===401){idToken=await user.getIdToken(true);if(auth.currentUser?.uid!==user.uid)throw new Error("Session changed.");response=await send();}
  const result = await response.json().catch(() => ({})) as {
    error?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(result.message || result.error || `Account service failed (${response.status}).`);
  }
  return result as T;
}
