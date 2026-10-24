@echo off
cd /d "%~dp0"
echo UNION BANK - FINAL PAGE BOUNDARY AND FRONT EJECT TEST
node.exe agent.cjs --one-click --sample=union
pause
