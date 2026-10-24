@echo off
cd /d "%~dp0"
echo UNION BANK - 215MM OPEN / 107MM FOLD / COMPLETE Y-N / FRONT EJECT
node.exe agent.cjs --one-click --sample=union
pause
