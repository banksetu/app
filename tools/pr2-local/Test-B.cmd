@echo off
cd /d "%~dp0"
echo SAMPLE B - 9.25pt / 70%% / 1px / 1.00mm label gap / 3mm data gap
node.exe agent.cjs --one-click --variant=B
pause
