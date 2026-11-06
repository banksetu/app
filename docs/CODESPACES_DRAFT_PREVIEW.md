# BANK SETU PR #100 — Test the actual draft UI in GitHub Codespaces

This guide is **only for development preview**. No main branch merge, deployment, Firebase write, real customer data or printer job is performed by this mode.

## Start in an existing GitHub Codespace

1. Check in the Codespaces terminal that the working tree is clean (`git status --short`). If you have uncommitted changes, preserve them before switching branches.
2. Check out the current draft (not `main`):

```bash
git fetch origin codex/passbook-wizard-word-draft-20261106
git switch --detach FETCH_HEAD
node --version
npm ci
npm run dev
```

Use Node.js 24, the same Node version used in the layout workflow.

3. In the Codespaces **PORTS** panel open port **5173** in the browser. The original repository's `vite.config.ts` already forwards this port to `<codespace>-5173.app.github.dev` with HTTPS.
4. The Codespaces draft design lab opens directly by default. If the browser is showing the normal sign-in page, make sure you fetched the updated Draft PR #100 branch and did not add `?normal-app=1`. Refresh once.
5. Select a bank → PDF / Word DOC/DOCX / Blank → Quick Passbook or PR2. Use the **real** draft Layout Studio UI, including **Layout → Page Setup → Open Book / Folded Book**, margins, fold, print-start line, and the Home/Insert/Mailings/Review ribbons.
6. Upload a non-sensitive sample PDF or Word file; inspect OCR editable text/graphics, drag a bank/customer field, insert a text/table, select Demo Customer, save the demo draft, switch to slot 2/3, and export a proof/JSON backup.
7. For the normal BANK SETU login UI in Codespaces, choose **Normal BANK SETU App**, which uses `/?normal-app=1`. Do not use real production customers for preview testing.

## What is deliberately unavailable in the Codespaces design lab?

- This is **browser-local preview**, not a Windows Electron/PR2 runtime. It does not fake the `banksetu://` protocol, desktop SQLite, licensing, PR2 serial/driver bridge, printer detection or physical Epson output.
- The browser demo does **not** sign into Firebase or call the Cloudflare Worker; customer data is synthetic only. Editor changes are saved into a separate `banksetu:codespaces:synthetic-layout-preview` browser-local namespace. Download an editable JSON backup if you want the preview design outside this Codespace/browser.
- `Save & Send to Master`, cloud sync, actual Master approval, print activation and customer database access remain **disabled**. Test them later in a separate Windows testing profile under valid permissions.
- Production builds, Android builds and public Web bundles have the preview entry disabled at build time. Standard feature guards remain Windows-only.

## Troubleshooting

- `npm run dev` starts on port 5173. If that port is already occupied, stop the previous Vite process (`Ctrl+C`) instead of changing production port rules.
- If you see `Windows EXE only` inside the Codespaces lab, confirm `git status` and that you are on the Draft PR #100 commit, then restart the Vite dev server.
- If no preview appears, verify Codespaces has a `CODESPACE_NAME` environment variable and your Ports panel uses the same Codespace session.
- `npm run desktop:dev` cannot launch a Windows Electron installer inside Linux Codespaces. Use the unsigned Windows CI installer on a separate Windows test profile for printer acceptance.
- Never make the forwarded port Public for document uploads. Use **Private** port visibility and non-sensitive sample files.

## Automated checks

```bash
node --test scripts/layout-codespaces-preview.test.mjs
node --test scripts/layout-*.test.mjs
npm run build
```

`npm run build` creates the Windows-targeted document-bundling assets in `dist`; it does not start the production One Click Release workflow.
