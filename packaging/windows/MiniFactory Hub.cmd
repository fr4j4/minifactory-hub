@echo off
title MiniFactory Hub
rem Arranca MiniFactory Hub con el Node incluido y abre el navegador. Cerrar esta ventana detiene la aplicacion.
"%~dp0node\node.exe" "%~dp0launcher.mjs" start --open
if errorlevel 1 pause
