@echo off
"%USERPROFILE%\.local\bin\claude.exe" -p --model sonnet --tools "" --strict-mcp-config --mcp-config C:\agents\lead_mcp.json --allowedTools mcp__figma --max-turns 60 < C:\agents\work\fig3.md > C:\agents\work\fig3.out 2>&1

