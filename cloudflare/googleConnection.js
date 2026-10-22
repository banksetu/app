export function parseGoogleResource(input, kind) {
  const text = String(input || "").trim();
  const expression = kind === "sheet" ? /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})(?:[/?#].*)?$/ : /^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{20,})(?:[/?#].*)?$/;
  const id = text.match(expression)?.[1];
  if (!id) throw new Error("Enter a valid Google " + kind + " link.");
  return id;
}
export function validateResourceOwnership(sheet, folder, email) {
  const owned = file => file.owners?.some(owner => String(owner.emailAddress || "").toLowerCase() === String(email).toLowerCase());
  if (sheet.mimeType !== "application/vnd.google-apps.spreadsheet" || folder.mimeType !== "application/vnd.google-apps.folder" || sheet.trashed || folder.trashed || !sheet.parents?.includes(folder.id)) throw new Error("Place the Bank Setu Sheet inside the selected Drive folder.");
  if (!owned(sheet) || !owned(folder)) throw new Error("Both resources must belong to your verified Bank Setu login email. Shared Drives require a separately verified organization ownership policy.");
  if (!sheet.capabilities?.canEdit || !folder.capabilities?.canEdit) throw new Error("Grant Editor access to both the Sheet and folder.");
}
