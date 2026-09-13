param(
    [string]$OutputDirectory = 'release'
)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $OutputDirectory))
if (-not $outputRoot.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The release output directory must be inside the project folder.'
}
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$version = $package.version -replace '-beta$', 'beta'
if ($version -notmatch '^\d+\.\d+\.\d+[a-zA-Z0-9.-]*$') { throw 'Invalid release version.' }
$name = "YouTubeSeerr-$version"
$stage = Join-Path $outputRoot $name
$archive = Join-Path $outputRoot "$name.zip"
$checksum = Join-Path $outputRoot 'SHA256SUMS.txt'
$notes = Join-Path $outputRoot 'RELEASE-NOTES.md'
foreach ($target in @($stage, $archive, $checksum, $notes)) {
    if (Test-Path -LiteralPath $target) { throw "Output already exists: $target. Choose a new -OutputDirectory." }
}

Push-Location -LiteralPath $projectRoot
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed; release was not packaged.' }

    # Only these project files are eligible for publication. Never copy the working directory wholesale.
    $files = @(
        '.dockerignore', '.env.example', '.gitattributes', '.gitignore', '.prettierrc.json',
        'compile.bat', 'compile.sh', 'DESIGN.md', 'docker-compose.yml', 'Dockerfile',
        'index.html', 'LICENSE', 'package.json', 'package-lock.json', 'playwright.config.ts',
        'README.md', 'RELEASE-NOTES.md', 'START-HERE.md', 'tsconfig.json',
        'tsconfig.server.json', 'VALIDATION.md', 'vite.config.ts'
    )
    $directories = @('.github', 'scripts', 'server', 'src', 'tests', 'dist')
    $null = New-Item -ItemType Directory -Path $stage -Force
    foreach ($file in $files) {
        Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $stage $file)
    }
    foreach ($directory in $directories) {
        Copy-Item -LiteralPath (Join-Path $projectRoot $directory) -Destination (Join-Path $stage $directory) -Recurse
    }
    foreach ($required in @('dist/server/index.js', 'dist/server/worker-entry.js', 'dist/client/index.html')) {
        if (-not (Test-Path -LiteralPath (Join-Path $stage $required) -PathType Leaf)) {
            throw "Compiled output missing: $required"
        }
    }

    # Compress-Archive omits hidden files on some systems; explicitly write every file instead.
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::Open($archive, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($file in Get-ChildItem -LiteralPath $stage -File -Recurse -Force | Sort-Object FullName) {
            $relative = $file.FullName.Substring($stage.Length + 1).Replace('\', '/')
            if ($relative -match '(^|/)(node_modules|config|downloads|media|test-results|\.tools|\.git|release)(/|$)' -or
                $file.Name -match '(^\.env$|^\.env\.(?!example$)|\.(db|sqlite|sqlite3|key|log)$|^cookies.*\.txt$)') {
                throw "Unexpected private or generated file in release: $relative"
            }
            # Shell scripts must retain Unix line endings after a Windows checkout.
            if ($file.Extension -eq '.sh') {
                $content = [System.IO.File]::ReadAllText($file.FullName).Replace("`r`n", "`n")
                [System.IO.File]::WriteAllText($file.FullName, $content, (New-Object System.Text.UTF8Encoding($false)))
            }
            $entry = [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zip, $file.FullName, "$name/$relative", [System.IO.Compression.CompressionLevel]::Optimal
            )
            if ($file.Extension -eq '.sh') { $entry.ExternalAttributes = 0x81ED0000 -as [int] }
        }
    } finally {
        $zip.Dispose()
    }
    $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    [System.IO.File]::WriteAllText($checksum, "$hash  $name.zip`n", (New-Object System.Text.UTF8Encoding($false)))
    Copy-Item -LiteralPath (Join-Path $projectRoot 'RELEASE-NOTES.md') -Destination $notes
    Write-Host "Release ready: $archive"
    Write-Host "SHA256: $hash"
} finally {
    Pop-Location
}
