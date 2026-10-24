@echo off
cd /d "%~dp0"
echo VARIANT C - 9.25pt / 70%% / 1px
node.exe agent.cjs --one-click --variant=C
pause
