# Advocate BenefitConnect MCP Server Helper
# Manages the Model Context Protocol local database server connection

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("start", "test", "config")]
    [string]$Action = "test",
    
    [Parameter(Mandatory=$false)]
    [string]$Server = "localhost",
    
    [Parameter(Mandatory=$false)]
    [string]$Database = "AdvocateBenefitConnect"
)

$ErrorActionPreference = "Stop"

function Write-Status {
    param([string]$Message, [string]$Type = "Info")
    $color = switch ($Type) {
        "Success" { "Green" }
        "Error" { "Red" }
        "Warning" { "Yellow" }
        default { "Cyan" }
    }
    Write-Host "[$Type] $Message" -ForegroundColor $color
}

function Test-MCPConnection {
    Write-Status "Testing MCP server connectivity..."
    
    try {
        $mcpPath = "C:\TeamCity\Git\vgdagpin\LocalDbMCP"
        $distPath = Join-Path $mcpPath "dist\index.js"
        
        if (-not (Test-Path $distPath)) {
            Write-Status "✗ MCP server not built" "Error"
            return $false
        }
        
        # Create MCP protocol request to list tools
        $initRequest = @{
            jsonrpc = "2.0"
            id = 1
            method = "initialize"
            params = @{
                protocolVersion = "2024-11-05"
                capabilities = @{
                    roots = @{
                        listChanged = $false
                    }
                }
                clientInfo = @{
                    name = "mcp-test-client"
                    version = "1.0.0"
                }
            }
        } | ConvertTo-Json -Depth 10 -Compress
        
        $listToolsRequest = @{
            jsonrpc = "2.0"
            id = 2
            method = "tools/list"
            params = @{}
        } | ConvertTo-Json -Depth 10 -Compress
        
        # Start MCP server process
        Push-Location $mcpPath
        try {
            $process = Start-Process -FilePath "node" -ArgumentList $distPath `
                -NoNewWindow -PassThru `
                -RedirectStandardInput "$env:TEMP\mcp-test-in.json" `
                -RedirectStandardOutput "$env:TEMP\mcp-test-out.json" `
                -RedirectStandardError "$env:TEMP\mcp-test-err.json"
            
            Start-Sleep -Milliseconds 500
            
            # Send initialize request
            $initRequest | Out-File -FilePath "$env:TEMP\mcp-test-in.json" -Encoding UTF8
            Start-Sleep -Milliseconds 300
            
            # Send tools/list request
            $listToolsRequest | Out-File -FilePath "$env:TEMP\mcp-test-in.json" -Encoding UTF8 -Append
            Start-Sleep -Milliseconds 500
            
            # Check output
            if (Test-Path "$env:TEMP\mcp-test-out.json") {
                $output = Get-Content "$env:TEMP\mcp-test-out.json" -Raw
                
                if ($output -match '"method"\s*:\s*"tools/list"' -or $output -match '"list_tables"') {
                    Write-Status "✓ MCP server responded successfully!" "Success"
                    
                    # Try to count tools
                    $toolCount = ([regex]::Matches($output, '"name"\s*:\s*"(list_tables|query_data|get_schema)"')).Count
                    if ($toolCount -gt 0) {
                        Write-Status "✓ MCP server has $toolCount tool(s) available" "Success"
                    }
                    
                    $process.Kill()
                    return $true
                }
            }
            
            # Check for errors
            if (Test-Path "$env:TEMP\mcp-test-err.json") {
                $errorOutput = Get-Content "$env:TEMP\mcp-test-err.json" -Raw
                if ($errorOutput) {
                    Write-Status "⚠ MCP server error: $($errorOutput.Substring(0, [Math]::Min(100, $errorOutput.Length)))" "Warning"
                }
            }
            
            $process.Kill()
            Write-Status "✗ MCP server did not respond as expected" "Error"
            return $false
        }
        finally {
            Pop-Location
            # Cleanup temp files
            Remove-Item -Path "$env:TEMP\mcp-test-*.json" -ErrorAction SilentlyContinue
        }
    }
    catch {
        Write-Status "✗ MCP server test failed: $($_.Exception.Message)" "Error"
        return $false
    }
}

function Test-LocalMCPInstalled {
    Write-Status "Checking Local MCP installation..."
    
    $mcpPath = "C:\TeamCity\Git\vgdagpin\LocalDbMCP"
    
    if (Test-Path $mcpPath) {
        Write-Status "✓ Local MCP found at: $mcpPath" "Success"
        
        # Check for built index.js
        $distPath = Join-Path $mcpPath "dist\index.js"
        if (Test-Path $distPath) {
            Write-Status "✓ dist\index.js found (server is built)" "Success"
            
            # Check for config.json
            $configPath = Join-Path $mcpPath "config.json"
            if (Test-Path $configPath) {
                Write-Status "✓ config.json found" "Success"
                return $true
            }
            else {
                Write-Status "⚠ config.json not found. Copy from config.example.json" "Warning"
                Write-Status "  Run in LocalDbMCP directory: copy config.example.json config.json" "Warning"
                return $false
            }
        }
        else {
            Write-Status "⚠ dist\index.js not found. Project needs to be built." "Warning"
            Write-Status "  Run in LocalDbMCP directory: npm install && npm run build" "Warning"
            return $false
        }
    }
    else {
        Write-Status "✗ Local MCP not found at: $mcpPath" "Error"
        Write-Status "  Please ensure the path is correct" "Warning"
        return $false
    }
}

function Test-NodeInstalled {
    Write-Status "Checking Node.js installation..."
    
    try {
        $nodeVersion = node --version 2>$null
        $npmVersion = npm --version 2>$null
        
        if ($nodeVersion -and $npmVersion) {
            Write-Status "✓ Node.js $nodeVersion and npm $npmVersion installed" "Success"
            return $true
        }
        else {
            Write-Status "✗ Node.js not found. Install from https://nodejs.org/" "Error"
            return $false
        }
    }
    catch {
        Write-Status "✗ Node.js not found. Install from https://nodejs.org/" "Error"
        return $false
    }
}

function Show-Configuration {
    Write-Status "Current MCP Configuration:" "Info"
    
    $configPath = Join-Path $PSScriptRoot "config.json"
    
    if (Test-Path $configPath) {
        $config = Get-Content $configPath -Raw | ConvertFrom-Json
        $server = $config.mcpServers.'advocate-benefitconnect-db'
        
        Write-Host ""
        Write-Host "Server Name: advocate-benefitconnect-db" -ForegroundColor White
        Write-Host "Command: $($server.command) $($server.args -join ' ')" -ForegroundColor Gray
        Write-Host "Status: $(if ($server.disabled) { 'Disabled' } else { 'Enabled' })" -ForegroundColor $(if ($server.disabled) { 'Red' } else { 'Green' })
        Write-Host ""
        Write-Host "Allowed Operations:" -ForegroundColor White
        $server.alwaysAllow | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
        Write-Host ""
        
        Write-Status "Config file location: $configPath" "Info"
    }
    else {
        Write-Status "Configuration file not found at: $configPath" "Error"
    }
}

function Start-MCPServer {
    Write-Status "Starting Local MCP Server for Advocate BenefitConnect..." "Info"
    
    $mcpPath = "C:\TeamCity\Git\vgdagpin\LocalDbMCP"
    $distPath = Join-Path $mcpPath "dist\index.js"
    
    if (Test-Path $distPath) {
        Write-Status "Starting Node.js MCP server..." "Info"
        Write-Status "Working directory: $mcpPath" "Info"
        Write-Status "Entry point: $distPath" "Info"
        Write-Host ""
        
        # Change to MCP directory (so config.json is found)
        Push-Location $mcpPath
        
        try {
            & node $distPath
        }
        finally {
            Pop-Location
        }
    }
    else {
        Write-Status "✗ dist\index.js not found. Please build the project first." "Error"
        Write-Status "  Run these commands:" "Warning"
        Write-Host ""
        Write-Host "  cd C:\TeamCity\Git\vgdagpin\LocalDbMCP" -ForegroundColor Yellow
        Write-Host "  npm install" -ForegroundColor Yellow
        Write-Host "  npm run build" -ForegroundColor Yellow
        Write-Host ""
        exit 1
    }
}

# Main execution
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Advocate BenefitConnect - MCP Database Server Helper    " -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

switch ($Action) {
    "start" {
        $nodeOk = Test-NodeInstalled
        $mcpOk = Test-LocalMCPInstalled
        
        if ($nodeOk -and $mcpOk) {
            Write-Status "Prerequisites met - starting MCP server..." "Info"
            Write-Status "  (Use -Action test to verify MCP protocol connectivity)" "Info"
            Write-Host ""
            Start-MCPServer
        }
        else {
            Write-Status "Cannot start MCP server - prerequisites not met" "Error"
            exit 1
        }
    }
    
    "test" {
        $nodeOk = Test-NodeInstalled
        $mcpOk = Test-LocalMCPInstalled
        
        Write-Host ""
        if ($nodeOk -and $mcpOk) {
            Write-Status "✓ Prerequisites met - testing MCP protocol..." "Success"
            Write-Host ""
            
            $mcpOk = Test-MCPConnection
            
            Write-Host ""
            if ($mcpOk) {
                Write-Status "✓ LocalDbMCP is fully operational!" "Success"
                Write-Host ""
                Write-Host "To start the MCP server for Copilot, run:" -ForegroundColor Yellow
                Write-Host "  .\mcp-server.ps1 -Action start" -ForegroundColor White
                Write-Host ""
                Write-Host "Or use GitHub Copilot directly (server will auto-start)" -ForegroundColor Yellow
            }
            else {
                Write-Status "✗ MCP protocol test failed - check config.json and database settings" "Error"
                Write-Status "  Config: C:\TeamCity\Git\vgdagpin\LocalDbMCP\config.json" "Warning"
                exit 1
            }
        }
        else {
            Write-Status "✗ Prerequisites not met - cannot test MCP server" "Error"
            exit 1
        }
    }
    
    "config" {
        Show-Configuration
        
        Write-Host ""
        Write-Status "LocalDbMCP Configuration:" "Info"
        $configPath = "C:\TeamCity\Git\vgdagpin\LocalDbMCP\config.json"
        
        if (Test-Path $configPath) {
            Write-Host ""
            Get-Content $configPath | Write-Host -ForegroundColor Gray
            Write-Host ""
            Write-Status "Config file: $configPath" "Info"
        }
        else {
            Write-Status "⚠ LocalDbMCP config.json not found" "Warning"
            Write-Status "  Copy from: C:\TeamCity\Git\vgdagpin\LocalDbMCP\config.example.json" "Warning"
        }
    }
}

Write-Host ""
