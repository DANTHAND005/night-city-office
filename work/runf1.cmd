@echo off
"%USERPROFILE%\.local\bin\claude.exe" -p --model sonnet --tools "" --strict-mcp-config --mcp-config C:\agents\lead_mcp.json --allowedTools mcp__figma --max-turns 25 < C:\agents\work\fig1.md > C:\agents\work\fig1.out 2>&1
