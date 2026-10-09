import fs from "node:fs";

const packagePath = "./package.json";
const packageLockPath = "./package-lock.json";
const versionPath = "./public/version.json";

// Read package.json
const pkg = JSON.parse(
  fs.readFileSync(packagePath, "utf8")
);

const oldVersion = String(pkg.version);
const parts = oldVersion.split(".").map(Number);

if (
  parts.length !== 3 ||
  parts.some(
    (part) =>
      !Number.isInteger(part) || part < 0
  )
) {
  throw new Error(
    `Invalid version in package.json: ${oldVersion}`
  );
}

// Increase patch version
const [major, minor, patch] = parts;

const newVersion = process.argv[2] || `${major}.${minor}.${patch + 1}`;
if (!/^\d+\.\d+\.\d+$/.test(newVersion)) throw Error('Version must be x.y.z');
const [nextMajor, nextMinor, nextPatch] = newVersion.split('.').map(Number);
if (nextMinor > 999 || nextPatch > 999 || nextMajor * 1000000 + nextMinor * 1000 + nextPatch > 99999999 ||
    nextMajor * 1000000 + nextMinor * 1000 + nextPatch <= major * 1000000 + minor * 1000 + patch) throw Error('Release version must increase');

// Update package.json
pkg.version = newVersion;

fs.writeFileSync(
  packagePath,
  JSON.stringify(pkg, null, 2) + "\n",
  "utf8"
);

// Update package-lock.json if it exists
if (fs.existsSync(packageLockPath)) {
  const lock = JSON.parse(
    fs.readFileSync(packageLockPath, "utf8")
  );

  lock.version = newVersion;

  if (lock.packages?.[""]) {
    lock.packages[""].version = newVersion;
  }

  fs.writeFileSync(
    packageLockPath,
    JSON.stringify(lock, null, 2) + "\n",
    "utf8"
  );
}

// Update public/version.json
let versionData = {
  latestVersion: newVersion,
  downloadUrl: "",
  notes: "Bank Setu new update.",
  version: newVersion,
  releaseTag: `v${newVersion}`,
  releaseUrl: `https://github.com/banksetu/app/releases/tag/v${newVersion}`
};

if (fs.existsSync(versionPath)) {
  try {
    versionData = {
      ...versionData,
      ...JSON.parse(
        fs.readFileSync(versionPath, "utf8")
      ),
      latestVersion: newVersion,
      releaseDate: new Date().toISOString().slice(0, 10),
      version: newVersion,
      releaseTag: `v${newVersion}`,
      releaseUrl: `https://github.com/banksetu/app/releases/tag/v${newVersion}`,
      androidBuild: nextMajor * 1000000 + nextMinor * 1000 + nextPatch,
      androidDownloadUrl: `https://github.com/banksetu/app/releases/download/v${newVersion}/BankSetu-Android-${nextMajor * 1000000 + nextMinor * 1000 + nextPatch}.apk`,
      downloadUrl: `https://github.com/banksetu/app/releases/download/v${newVersion}/BankSetu-Setup-${newVersion}-x64.exe`,
      windowsVersion: newVersion,
      windowsDownloadUrl: `https://github.com/banksetu/app/releases/download/v${newVersion}/BankSetu-Setup-${newVersion}-x64.exe`
    };
  } catch {
    // Keep default values
  }
}

fs.writeFileSync(
  versionPath,
  JSON.stringify(versionData, null, 2) + "\n",
  "utf8"
);

console.log("");
console.log(
  `✅ Bank Setu version: ${oldVersion} → ${newVersion}`
);
console.log(
  "✅ package.json updated"
);
console.log(
  "✅ package-lock.json updated"
);
console.log(
  "✅ public/version.json updated"
);
console.log("");
console.log(
  "Next: npm run build"
);
