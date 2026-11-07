import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');

test('macOS package is ARM64-only, unsigned, notarization-free and excludes the Windows bridge',()=>{
  const config=JSON.parse(read('electron-builder.mac.json'));
  assert.deepEqual(config.mac.target,[{target:'dmg',arch:['arm64']}]);
  assert.equal(config.mac.identity,null);
  assert.equal(config.mac.notarize,false);
  assert.equal(config.mac.hardenedRuntime,false);
  assert.equal(config.dmg.sign,false);
  assert.equal(config.dmg.shrink,true);
  assert.equal(config.dmg.format,'ULFO');
  assert.equal(config.compression,'maximum');
  assert.deepEqual(config.mac.electronLanguages,['en','hi']);
  assert.equal(config.mac.artifactName,'BankSetu-${version}-arm64.${ext}');
  assert.equal(config.extraResources,undefined);
  assert.doesNotMatch(JSON.stringify(config),/BankSetu\.Pr2Bridge\.exe/);
});

test('One Click waits for and verifies the macOS DMG before publishing',()=>{
  const oneClick=read('.github/workflows/publish-app-release.yml');
  const mac=read('.github/workflows/macos-arm64-release.yml');
  assert.match(oneClick,/uses: \.\/\.github\/workflows\/macos-arm64-release\.yml/);
  assert.match(oneClick,/needs: \[version, android, windows, macos\]/);
  assert.match(oneClick,/BankSetu-' \+ process\.env\.VERSION \+ '-arm64\.dmg'/);
  assert.match(oneClick,/SHA256SUMS-macOS\.txt/);
  assert.match(mac,/runs-on: macos-14/);
  assert.match(mac,/CSC_IDENTITY_AUTO_DISCOVERY: 'false'/);
  assert.match(mac,/bash scripts\/prepare-macos-icon\.sh/);
  assert.match(mac,/file .*MacOS\/Bank Setu.*grep -q 'arm64'/s);
  assert.match(mac,/grep -q 'x86_64'/);
  assert.match(mac,/shasum -a 256/);
  assert.match(JSON.parse(read('package.json')).scripts['desktop:pack:mac-arm64'],/prepare-macos-icon\.sh/);
});

test('next automatic version publishes a matching ARM64 DMG URL',()=>{
  const source=read('scripts/release.mjs');
  assert.match(source,/macVersion: newVersion/);
  assert.match(source,/BankSetu-\$\{newVersion\}-arm64\.dmg/);
  assert.match(read('scripts/verify-public-release.mjs'),/macDownloadUrl/);
});
