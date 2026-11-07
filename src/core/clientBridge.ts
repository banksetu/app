export const CLIENT_BRIDGE_SOURCE_VERSION="ssa-v1-20261107";
export const CLIENT_BRIDGE_DOWNLOAD_URL=`/client-bridge/Code.gs?revision=${CLIENT_BRIDGE_SOURCE_VERSION}`;

export async function fetchCurrentClientBridge():Promise<string>{
  const response=await fetch(CLIENT_BRIDGE_DOWNLOAD_URL,{cache:"no-store"});
  if(!response.ok)throw new Error("Setup source is unavailable. Rebuild the app before client setup.");
  const source=await response.text();
  const required=[
    `BANKSETU_BRIDGE_SOURCE_VERSION = "${CLIENT_BRIDGE_SOURCE_VERSION}"`,
    "function syncCustomerOperation","SYNC_DELETIONS_SHEET","rowDeleted:true",
    "function getSsaCampaignEntries","function syncSsaCampaignEntry",
    'const SSA_CAMPAIGN_TAB = "SSA Campaign"'
  ];
  if(required.some(marker=>!source.includes(marker)))
    throw new Error("Client setup source is outdated or incomplete. Refresh the app and download again.");
  return source;
}
