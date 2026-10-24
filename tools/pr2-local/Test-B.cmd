@echo off
cd /d "%~dp0"
echo VARIANT B - 8.75pt / 70%% / 1px
node.exe agent.cjs --one-click --variant=B
pause
