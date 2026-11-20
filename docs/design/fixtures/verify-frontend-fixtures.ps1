param([string]$FixturePath = (Join-Path $PSScriptRoot 'frontend-cases.json'))

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Check([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

function Read-Date([object]$Value) {
    # Keep the original ISO-8601 offset. A runtime that already materialised the JSON string as a
    # DateTime must not have its instant reinterpreted in the local zone.
    if ($Value -is [DateTimeOffset]) { return $Value }
    if ($Value -is [DateTime]) {
        if ($Value.Kind -eq [DateTimeKind]::Unspecified) {
            return [DateTimeOffset]::new($Value, [TimeSpan]::Zero)
        }
        return [DateTimeOffset]::new($Value)
    }
    [DateTimeOffset]::Parse([string]$Value, [Globalization.CultureInfo]::InvariantCulture)
}

# Windows PowerShell 5.1 keeps JSON date strings as strings; PowerShell 7 may convert ISO-8601
# strings to System.DateTime while parsing, which drops the original offset and makes the F15
# Shanghai-time assertion fail (task 20261118-24). Ask for raw strings when the runtime exposes
# ConvertFrom-Json -DateKind (PowerShell 7.5+); otherwise fall back to the runtime default and let
# Read-Date keep the instant offset where it still can.
$convertFromJsonCommand = Get-Command ConvertFrom-Json
$jsonOptions = @{}
if ($convertFromJsonCommand.Parameters.ContainsKey('DateKind')) {
    $jsonOptions['DateKind'] = 'String'
}
$dateKindMode = if ($jsonOptions.ContainsKey('DateKind')) { 'string' } else { 'runtime-default' }

$fixture = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $FixturePath).Path) | ConvertFrom-Json @jsonOptions
$scenarioIds = @($fixture.scenarios.PSObject.Properties.Name)
$expectedScenarioIds = @(1..16 | ForEach-Object { 'F{0:D2}' -f $_ })
Assert-Check ($fixture.metadata.synthetic -and -not $fixture.metadata.isRealRailEvidence) 'Fixtures must be explicitly synthetic.'
Assert-Check ($fixture.metadata.mapMode -eq 'SCHEMATIC_TEST_ONLY') 'Real-map mode is forbidden in these fixtures.'
Assert-Check (-not (Compare-Object $expectedScenarioIds $scenarioIds)) 'Expected F01-F16 exactly.'

$nodes = @($fixture.base.nodes)
$nodeIds = @($nodes | ForEach-Object { $_.id })
$stationIds = @($fixture.base.stations | ForEach-Object { $_.id })
$pathIds = @($fixture.base.mapPaths | ForEach-Object { $_.id })
Assert-Check ($nodes.Count -eq 12 -and ($nodeIds | Sort-Object -Unique).Count -eq 12) 'Expected 12 unique route nodes.'
Assert-Check ($stationIds.Count -eq ($stationIds | Sort-Object -Unique).Count) 'Station IDs must be unique.'
foreach ($node in $nodes) {
    Assert-Check ($stationIds -contains $node.arrivalStationId -and $stationIds -contains $node.departureStationId) 'Unresolved station reference.'
}
foreach ($nodeId in $fixture.scenarios.F04.nodeIds) {
    Assert-Check ($nodeIds -contains $nodeId) 'Unresolved long-route node.'
}
Assert-Check (@($nodes | Where-Object { $null -ne $_.stayDays }).Count -eq 10) 'Expected 10 intermediate stay nodes.'
Assert-Check (@($nodes | Where-Object { $null -ne $_.stayDays -and $_.stayDays -ne 1 }).Count -eq 0) 'Default fixture stay must be one day.'
foreach ($path in $fixture.base.mapPaths) {
    Assert-Check (-not $path.isRealRailGeometry -and $path.coordinateSystem -eq 'fixture-normalized') 'Schematic paths cannot be real rail evidence.'
    foreach ($point in $path.points) {
        Assert-Check ($point.Count -eq 2 -and $point[0] -ge 0 -and $point[0] -le 1 -and $point[1] -ge 0 -and $point[1] -le 1) 'Invalid schematic point.'
    }
}
foreach ($candidate in $fixture.scenarios.F03.candidates) {
    Assert-Check ($null -eq $candidate.geometryRef -or $pathIds -contains $candidate.geometryRef) 'Unresolved candidate path.'
}
$candidateIds = @($fixture.scenarios.F03.candidates | ForEach-Object { $_.id })
Assert-Check (($candidateIds -join ',') -eq ($fixture.scenarios.F03.responseOrder -join ',')) 'Candidate fixture order drifted.'

$crossDay = $fixture.scenarios.F02
$legs = @($crossDay.legs)
$totalMinutes = ((Read-Date $legs[-1].arrival) - (Read-Date $legs[0].departure)).TotalMinutes
Assert-Check ($totalMinutes -eq $crossDay.expected.totalMinutes) 'Cross-day total duration mismatch.'
$nextDate = (Read-Date $legs[0].arrival).Date.AddDays($crossDay.stayDays).ToString('yyyy-MM-dd')
Assert-Check ($nextDate -eq $crossDay.expected.nextEarliestDepartureDate) 'Natural-day stay mismatch.'
Assert-Check ((Read-Date $legs[1].departure).Date -ge [DateTime]::ParseExact($nextDate, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)) 'Next departure precedes the allowed natural day.'
[decimal]$knownTotal = 0
$missingPrices = 0
foreach ($leg in $legs) {
    Assert-Check ($stationIds -contains $leg.fromStationId -and $stationIds -contains $leg.toStationId) 'Unresolved leg station.'
    if ($null -eq $leg.historicalPrice) { $missingPrices++; continue }
    Assert-Check ($leg.historicalPrice -is [string] -and $leg.historicalPrice -match '^\d+\.\d{2}$') 'Prices must be two-decimal strings or null.'
    $knownTotal += [decimal]::Parse($leg.historicalPrice, [Globalization.CultureInfo]::InvariantCulture)
}
Assert-Check ($knownTotal -eq [decimal]$crossDay.expected.knownTotal -and $missingPrices -eq $crossDay.expected.missingPriceLegs -and $null -eq $crossDay.expected.completeTotal) 'Missing-price fixture must not become a complete total.'

foreach ($replay in $fixture.scenarios.F16.cases) {
    $d0 = Read-Date ($replay.D0 + 'T00:00:00+08:00')
    $r0 = Read-Date ($replay.R0 + 'T00:00:00+08:00')
    Assert-Check (($d0 - $r0).TotalDays -eq $replay.offsetDays) 'Replay day shift mismatch.'
    $parts = @($replay.rawTime.Split(':') | ForEach-Object { [int]$_ })
    $seconds = $parts[0] * 3600 + $parts[1] * 60 + $parts[2]
    $reference = (Read-Date ($replay.referenceServiceDate + 'T00:00:00+08:00')).AddSeconds($seconds)
    Assert-Check ($reference -eq (Read-Date $replay.expectedReference)) 'GTFS accumulated time mismatch.'
    Assert-Check ($reference.AddDays($replay.offsetDays) -eq (Read-Date $replay.expectedJourney)) 'Replay displayed date mismatch.'
}
$instant = (Read-Date $fixture.scenarios.F15.offsetExample.instant).ToOffset([TimeSpan]::FromHours(8)).ToString('yyyy-MM-dd HH:mm')
Assert-Check ($instant -eq $fixture.scenarios.F15.offsetExample.expectedDisplay) 'Shanghai time display mismatch.'
Assert-Check ($fixture.scenarios.F12.invalidRenameTitle.Length -eq 41) 'Long-title boundary fixture drifted.'
Assert-Check ($fixture.scenarios.F10.expected.revision -gt $fixture.scenarios.F10.expected.savedRevision -and $fixture.scenarios.F10.expected.dirty) 'Save-during-edit fixture must remain dirty.'

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$spec = [IO.File]::ReadAllText((Join-Path $repoRoot 'docs/design/frontend-spec.md'))
$handoff = [IO.File]::ReadAllText((Join-Path $repoRoot 'handoff/20261116-22-frontend.md'))
$ledger = [IO.File]::ReadAllText((Join-Path $repoRoot 'tasks/20261116-tasks.md'))
$checks = @([regex]::Matches($spec, '(?m)^\| (FE-\d{2}) \|[^\r\n]*'))
$checkIds = @($checks | ForEach-Object { $_.Groups[1].Value })
Assert-Check ($checks.Count -eq 29 -and ($checkIds | Sort-Object -Unique).Count -eq 29) 'Expected 29 unique FE rows.'
Assert-Check (-not (Compare-Object @(1..29 | ForEach-Object { 'FE-{0:D2}' -f $_ }) $checkIds)) 'FE numbering mismatch.'
foreach ($check in $checks) {
    $fixtureRefs = @([regex]::Matches($check.Value, '\bF\d{2}\b'))
    Assert-Check ($fixtureRefs.Count -gt 0) 'Each FE row needs a fixture.'
    foreach ($fixtureRef in $fixtureRefs) { Assert-Check ($scenarioIds -contains $fixtureRef.Value) 'Unknown fixture in FE row.' }
    $taskRefs = @([regex]::Matches($check.Value, '#(20261116-\d{2})'))
    Assert-Check ($taskRefs.Count -gt 0) 'Each FE row needs an implementation task.'
    foreach ($taskRef in $taskRefs) { Assert-Check ($ledger.Contains(('id="{0}"' -f $taskRef.Groups[1].Value))) 'Unknown task anchor.' }
}
foreach ($errorVariant in $fixture.scenarios.F13.variants) {
    Assert-Check ($handoff.Contains(('`{0}`' -f $errorVariant.uiCode))) 'Fixture error lacks a documented mapping.'
}
foreach ($token in @('--font-size-body','--space-4','--radius-panel','--shadow-panel','--z-modal','--motion-panel')) {
    Assert-Check ($spec.Contains($token + ':')) 'Required non-color token missing.'
}
Write-Output 'PASS: 16 scenarios; 12 nodes; references; date/price/replay arithmetic; 29 FE mappings; error codes and tokens.'
Write-Output ('Runtime: PowerShell {0}; JSON dates: {1}.' -f $PSVersionTable.PSVersion, $dateKindMode)
Write-Output 'Static fixture checks only. Browser, server authorization/concurrency, and real-map validation remain separate.'
