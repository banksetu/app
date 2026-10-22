import type { ReleaseChangelog } from "./releaseNotes";
export type UpdateManifest = {
  latestVersion?: string;
  downloadUrl?: string;
  androidBuild?: number;
  androidDownloadUrl?: string;
  windowsVersion?: string;
  windowsDownloadUrl?: string;
  notes?: string;
  releaseDate?: string;
  changelog?: {windows?: ReleaseChangelog; android?: ReleaseChangelog};
};

export const UPDATE_MANIFEST_URL =
  import.meta.env.VITE_UPDATE_MANIFEST_URL ||
  "https://banksetu-app.web.app/version.json";

export async function fetchUpdateManifest(): Promise<UpdateManifest | null> {
  try {
    const response = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data && typeof data === "object" ? data as UpdateManifest : null;
  } catch {
    return null;
  }
}
