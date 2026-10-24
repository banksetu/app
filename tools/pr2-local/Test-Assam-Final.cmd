@echo off
cd /d "%~dp0"
echo ASSAM FINAL - 175MM OPEN / 88MM FOLD / DATA START 20MM BELOW FOLD
node.exe agent.cjs --one-click --sample=assam
pause
