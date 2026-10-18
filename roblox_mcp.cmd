@echo off
rem Starts the Roblox Studio MCP bridge that belongs to the INSTALLED Studio (the version folder that has both RobloxStudioBeta.exe and StudioMCP.exe).
rem Using a different version than Studio makes every tool fail with "Client proxy is out of date". Used by lead_mcp.json.
for /f "delims=" %%D in ('dir /b /ad /o-d "%LOCALAPPDATA%\Roblox\Versions\version-*" 2^>nul') do (
  if exist "%LOCALAPPDATA%\Roblox\Versions\%%D\RobloxStudioBeta.exe" if exist "%LOCALAPPDATA%\Roblox\Versions\%%D\StudioMCP.exe" (
    "%LOCALAPPDATA%\Roblox\Versions\%%D\StudioMCP.exe" %*
    exit /b %ERRORLEVEL%
  )
)
echo StudioMCP.exe not found next to Roblox Studio; install or update Roblox Studio 1>&2
exit /b 1
