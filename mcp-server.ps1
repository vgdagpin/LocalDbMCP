# Advocate BenefitConnect MCP Server Helper
# Manages the Model Context Protocol local database server connection

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("start", "test", "config")]
    [string]$Action = "test",
    
    [Parameter(Mandatory=$false)]
    [string]$ConnectionString = "",

    [Parameter(Mandatory=$false)]
    [string[]]$AllowedTablePatterns = @(),

    [Parameter(Mandatory=$false)]
    [string[]]$ExcludedTablePatterns = @()
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
    param(
        [string]$ConnectionString = "",
        [string[]]$AllowedTablePatterns = @(),
        [string[]]$ExcludedTablePatterns = @()
    )
    
    Write-Status "Testing MCP server database connectivity..." "Info"
    
    $mcpPath = $PSScriptRoot
    $distPath = Join-Path $mcpPath "dist\index.js"
    
    if (-not (Test-Path $distPath)) {
        Write-Status "✗ MCP server not built. Run: npm run build" "Error"
        return $false
    }
    
    if ($ConnectionString) {
        $env:MCP_CONNECTION_STRING = $ConnectionString
        Write-Status "Using provided connection string" "Info"
    }
    if ($AllowedTablePatterns.Count -gt 0) {
        $env:MCP_ALLOWED_PATTERNS = $AllowedTablePatterns -join ','
        Write-Status "Allowed patterns: $($env:MCP_ALLOWED_PATTERNS)" "Info"
    }
    if ($ExcludedTablePatterns.Count -gt 0) {
        $env:MCP_EXCLUDED_PATTERNS = $ExcludedTablePatterns -join ','
        Write-Status "Excluded patterns: $($env:MCP_EXCLUDED_PATTERNS)" "Info"
    }
    
    $stderrFile = "$env:TEMP\mcp-test-err-$([System.Guid]::NewGuid()).txt"
    $stdoutFile = "$env:TEMP\mcp-test-out-$([System.Guid]::NewGuid()).txt"
    
    Push-Location $mcpPath
    $process = $null
    try {
        $process = Start-Process -FilePath "node" -ArgumentList $distPath `
            -NoNewWindow -PassThru `
            -RedirectStandardOutput $stdoutFile `
            -RedirectStandardError  $stderrFile
        
        Write-Status "Waiting for database connection (up to 60s for interactive auth)..." "Info"
        
        $timeout = 60
        $elapsed = 0
        $result  = $null
        
        while ($elapsed -lt $timeout -and $null -eq $result) {
            Start-Sleep -Seconds 2
            $elapsed += 2
            
            if (Test-Path $stderrFile) {
                $err = Get-Content $stderrFile -Raw -ErrorAction SilentlyContinue
                if ($err -match [regex]::Escape("✓ Database connection successful")) {
                    $result = $true
                    $dbMatch = [regex]::Match($err, "connected to: (.+)")
                    if ($dbMatch.Success) {
                        Write-Status "✓ Connected to: $($dbMatch.Groups[1].Value.Trim())" "Success"
                    } else {
                        Write-Status "✓ Database connection successful" "Success"
                    }
                } elseif ($err -match [regex]::Escape("✗ Database connection failed")) {
                    $result = $false
                    $errMatch = [regex]::Match($err, "failed: (.+)")
                    if ($errMatch.Success) {
                        Write-Status "✗ $($errMatch.Groups[1].Value.Trim())" "Error"
                    } else {
                        Write-Status "✗ Database connection failed" "Error"
                    }
                }
            }
        }
        
        if ($null -eq $result) {
            Write-Status "✗ Connection timed out after ${timeout}s" "Error"
            $result = $false
        }
        
        return $result
    }
    finally {
        if ($null -ne $process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
        Pop-Location
        if ($ConnectionString) {
            Remove-Item Env:\MCP_CONNECTION_STRING -ErrorAction SilentlyContinue
        }
        if ($AllowedTablePatterns.Count -gt 0) {
            Remove-Item Env:\MCP_ALLOWED_PATTERNS -ErrorAction SilentlyContinue
        }
        if ($ExcludedTablePatterns.Count -gt 0) {
            Remove-Item Env:\MCP_EXCLUDED_PATTERNS -ErrorAction SilentlyContinue
        }
        Remove-Item -Path $stderrFile, $stdoutFile -ErrorAction SilentlyContinue
    }
}

function Test-LocalMCPInstalled {
    param([string[]]$AllowedTablePatterns = @())

    Write-Status "Checking Local MCP installation..."
    
    $mcpPath = $PSScriptRoot
    
    if (Test-Path $mcpPath) {
        Write-Status "✓ Local MCP found at: $mcpPath" "Success"
        
        # Check for built index.js
        $distPath = Join-Path $mcpPath "dist\index.js"
        if (Test-Path $distPath) {
            Write-Status "✓ dist\index.js found (server is built)" "Success"
            
            # Check for config.json — optional if patterns are provided via CLI
            $configPath = Join-Path $mcpPath "config.json"
            if (Test-Path $configPath) {
                Write-Status "✓ config.json found" "Success"
            }
            elseif ($AllowedTablePatterns.Count -gt 0) {
                Write-Status "⚠ config.json not found — using CLI-provided patterns" "Warning"
            }
            else {
                Write-Status "⚠ config.json not found. Copy from config.example.json" "Warning"
                Write-Status "  Run in LocalDbMCP directory: copy config.example.json config.json" "Warning"
                Write-Status "  Or pass -AllowedTablePatterns to skip config.json entirely" "Warning"
                return $false
            }
            return $true
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
    param(
        [string]$ConnectionString = "",
        [string[]]$AllowedTablePatterns = @(),
        [string[]]$ExcludedTablePatterns = @()
    )
    
    Write-Status "Starting Local MCP Server for Advocate BenefitConnect..." "Info"
    
    $mcpPath = $PSScriptRoot
    $distPath = Join-Path $mcpPath "dist\index.js"
    
    if (Test-Path $distPath) {
        if ($ConnectionString) {
            $env:MCP_CONNECTION_STRING = $ConnectionString
            Write-Status "Using provided connection string" "Info"
        }
        if ($AllowedTablePatterns.Count -gt 0) {
            $env:MCP_ALLOWED_PATTERNS = $AllowedTablePatterns -join ','
            Write-Status "Allowed patterns: $($env:MCP_ALLOWED_PATTERNS)" "Info"
        }
        if ($ExcludedTablePatterns.Count -gt 0) {
            $env:MCP_EXCLUDED_PATTERNS = $ExcludedTablePatterns -join ','
            Write-Status "Excluded patterns: $($env:MCP_EXCLUDED_PATTERNS)" "Info"
        }
        Write-Status "Starting Node.js MCP server..." "Info"
        Write-Status "Working directory: $mcpPath" "Info"
        Write-Status "Entry point: $distPath" "Info"
        Write-Host ""
        
        # Change to MCP directory (so config.json is found if present)
        Push-Location $mcpPath
        
        try {
            & node $distPath
        }
        finally {
            Pop-Location
            if ($ConnectionString) {
                Remove-Item Env:\MCP_CONNECTION_STRING -ErrorAction SilentlyContinue
            }
            if ($AllowedTablePatterns.Count -gt 0) {
                Remove-Item Env:\MCP_ALLOWED_PATTERNS -ErrorAction SilentlyContinue
            }
            if ($ExcludedTablePatterns.Count -gt 0) {
                Remove-Item Env:\MCP_EXCLUDED_PATTERNS -ErrorAction SilentlyContinue
            }
        }
    }
    else {
        Write-Status "✗ dist\index.js not found. Please build the project first." "Error"
        Write-Status "  Run these commands:" "Warning"
        Write-Host ""
        Write-Host "  cd $PSScriptRoot" -ForegroundColor Yellow
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
        $mcpOk = Test-LocalMCPInstalled -AllowedTablePatterns $AllowedTablePatterns
        
        if ($nodeOk -and $mcpOk) {
            Write-Status "Prerequisites met - starting MCP server..." "Info"
            Write-Status "  (Use -Action test to verify MCP protocol connectivity)" "Info"
            Write-Host ""
            Start-MCPServer -ConnectionString $ConnectionString -AllowedTablePatterns $AllowedTablePatterns -ExcludedTablePatterns $ExcludedTablePatterns
        }
        else {
            Write-Status "Cannot start MCP server - prerequisites not met" "Error"
            exit 1
        }
    }
    
    "test" {
        $nodeOk = Test-NodeInstalled
        $mcpOk = Test-LocalMCPInstalled -AllowedTablePatterns $AllowedTablePatterns
        
        Write-Host ""
        if ($nodeOk -and $mcpOk) {
            Write-Status "✓ Prerequisites met - testing MCP protocol..." "Success"
            Write-Host ""
            
            $mcpOk = Test-MCPConnection -ConnectionString $ConnectionString -AllowedTablePatterns $AllowedTablePatterns -ExcludedTablePatterns $ExcludedTablePatterns
            
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
                Write-Status "  Config: $(Join-Path $PSScriptRoot 'config.json')" "Warning"
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
        $configPath = Join-Path $PSScriptRoot "config.json"
        
        if (Test-Path $configPath) {
            Write-Host ""
            Get-Content $configPath | Write-Host -ForegroundColor Gray
            Write-Host ""
            Write-Status "Config file: $configPath" "Info"
        }
        else {
            Write-Status "⚠ LocalDbMCP config.json not found" "Warning"
            Write-Status "  Copy from: $(Join-Path $PSScriptRoot 'config.example.json')" "Warning"
        }
    }
}

Write-Host ""
