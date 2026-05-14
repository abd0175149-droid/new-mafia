$file = "c:\Projects\new mafia\unified-mafia\frontend\src\hooks\useGameConfig.ts"
$bytes = [System.IO.File]::ReadAllBytes($file)

# Find and remove the extra \r (0x5C 0x72) before a normal \r\n
$content = [System.Text.Encoding]::UTF8.GetString($bytes)
$content = $content.Replace(";\r`r`n", ";`r`n")

# Simpler: just replace the problematic line entirely
$lines = [System.IO.File]::ReadAllLines($file)
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match '\\r$') {
        $lines[$i] = $lines[$i] -replace '\\r$', ''
    }
}
[System.IO.File]::WriteAllLines($file, $lines)
Write-Host "Fixed"
