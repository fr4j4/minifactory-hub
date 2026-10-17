; Instalador de Windows (Inno Setup 6). Lo compila el workflow de release:
;   iscc /DAppVersion=1.2.3 /DSourceDir=dist\minifactory-hub-1.2.3-win-x64 /DOutputDir=dist packaging\windows\minifactory-hub.iss
; Instala por usuario (sin permisos de administrador) en %LOCALAPPDATA%\Programs\MiniFactory Hub.
; Los datos viven aparte, en %LOCALAPPDATA%\MiniFactoryHub, y no se borran al desinstalar ni al actualizar.
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{6B0E2F4C-3A9D-4E51-9C2B-7D8F1A6E3B90}
AppName=MiniFactory Hub
AppVersion={#AppVersion}
AppPublisher=MiniFactory Hub
AppPublisherURL=https://github.com/fr4j4/minifactory-hub
DefaultDirName={autopf}\MiniFactory Hub
DefaultGroupName=MiniFactory Hub
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename=minifactory-hub-{#AppVersion}-win-x64-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=MiniFactory Hub

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[InstallDelete]
; Al actualizar se borra la versión anterior del programa (no los datos) para no mezclar archivos viejos.
Type: filesandordirs; Name: "{app}\app"
Type: filesandordirs; Name: "{app}\node"

[Dirs]
; Carpeta de datos: se crea al instalar y el desinstalador nunca la borra.
Name: "{localappdata}\MiniFactoryHub"; Flags: uninsneveruninstall

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\MiniFactory Hub"; Filename: "{app}\MiniFactory Hub.cmd"; WorkingDir: "{app}"
Name: "{group}\Carpeta de datos de MiniFactory Hub"; Filename: "{localappdata}\MiniFactoryHub"
Name: "{group}\{cm:UninstallProgram,MiniFactory Hub}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\MiniFactory Hub"; Filename: "{app}\MiniFactory Hub.cmd"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\MiniFactory Hub.cmd"; Description: "{cm:LaunchProgram,MiniFactory Hub}"; Flags: postinstall nowait skipifsilent shellexec
