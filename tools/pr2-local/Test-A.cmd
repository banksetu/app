@echo off
cd /d "%~dp0"
echo SAMPLE A - 9.25pt / 70%% / 1px / 0.75mm label gap / 3mm data gap
node.exe agent.cjs --one-click --variant=A
pause
