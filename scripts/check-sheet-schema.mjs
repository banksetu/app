import fs from "node:fs";

function readStringArray(filePath, constantName) {
  const source = fs.readFileSync(filePath, "utf8");
  const match = source.match(new RegExp(`const\\s+${constantName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*;`));
  if (!match) throw new Error(`Could not find ${constantName} in ${filePath}`);
  return [...match[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((entry) => entry[1]);
}

const appsScriptHeaders = readStringArray("apps-script/Code.gs", "HEADERS");
const setupHeaders = readStringArray("functions/src/index.ts", "CUSTOMER_SHEET_HEADERS");

if (appsScriptHeaders.length !== 24 || setupHeaders.length !== 24) {
  throw new Error(`Expected 24 customer columns; found Apps Script=${appsScriptHeaders.length}, setup=${setupHeaders.length}.`);
}

const mismatch = appsScriptHeaders.findIndex((header, index) => header !== setupHeaders[index]);
if (mismatch >= 0) {
  throw new Error(`Client Sheet schema differs at column ${mismatch + 1}: Apps Script="${appsScriptHeaders[mismatch]}", setup="${setupHeaders[mismatch]}".`);
}

console.log(`Client Sheet schema matches Apps Script: ${appsScriptHeaders.length} ordered columns.`);
