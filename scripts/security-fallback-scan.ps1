param([switch]$History)
$ErrorActionPreference = 'Stop'
$pattern = 'PRIVATE KEY-----|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{50,}|sk-[A-Za-z0-9_-]{20,}|0x[a-fA-F0-9]{64}'

# Print paths and commit IDs only; never print matched source lines or secret values.
$paths = @(git grep -IlE $pattern -- . 2>$null)
"Working-tree candidate files: $($paths.Count)"
$paths | ForEach-Object { "PATH $_" }

if ($History) {
  $commits = @(git log --all --format='%H' -G $pattern -- . | Select-Object -Unique)
  "History candidate commits: $($commits.Count)"
  $commits | ForEach-Object { "COMMIT $_" }
}

if ($LASTEXITCODE -notin @(0, 1)) { exit $LASTEXITCODE }
