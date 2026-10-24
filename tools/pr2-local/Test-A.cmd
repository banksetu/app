@echo off
cd /d "%~dp0"
echo VARIANT A - 8.25pt / 70%% / 1px
node.exe agent.cjs --one-click --variant=A
pause
