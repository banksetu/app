export type ReleaseChangelog = {version?: string; releaseDate?: string; categories?: Record<string,string[]>};
const categories = ["New Features","Bug Fixes","Improvements","Performance & Stability","Security Updates"];
/** Parse the platform section attached to a verified GitHub Release. */
export function parsePlatformNotes(body: string, platform: "Windows" | "Android"): ReleaseChangelog {
  const section = body.split(new RegExp(`^## ${platform}\\s*$`,"im"))[1]?.split(/^## (?:Windows|Android)\s*$/im)[0] || "";
  const result: Record<string,string[]> = {};
  let heading = "";
  for (const line of section.split(/\r?\n/)) {
    const name = /^### (.+)$/.exec(line.trim())?.[1];
    if (name) {heading=categories.includes(name)?name:"";continue;}
    const item = /^- (.+)$/.exec(line.trim())?.[1];
    if (heading && item) (result[heading] ||= []).push(item.slice(0,200));
  }
  return {categories:result};
}
