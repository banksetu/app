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

const newVersion =
  `${major}.${minor}.${patch + 1}`;

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
      version: newVersion,
      releaseTag: `v${newVersion}`,
      releaseUrl: `https://github.com/banksetu/app/releases/tag/v${newVersion}`
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
