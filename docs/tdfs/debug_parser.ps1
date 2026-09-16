$file8 = Get-ChildItem $PSScriptRoot -Filter "*#8.tdf" | Select-Object -First 1 -ExpandProperty FullName
$file9 = Get-ChildItem $PSScriptRoot -Filter "*#9.tdf" | Select-Object -First 1 -ExpandProperty FullName

function Test-File ($filePath, $name) {
    if (-not $filePath -or -not (Test-Path $filePath)) {
        Write-Host "Arquivo $name nao encontrado!" -ForegroundColor Red
        return
    }
    
    [xml]$xml = Get-Content $filePath
    
    $players = @{}
    foreach ($p in $xml.tournament.players.player) {
        $players[$p.userid] = "$($p.firstname) $($p.lastname)"
    }
    
    $statsMap = @{}
    foreach ($id in $players.Keys) {
        $statsMap[$id] = @{ v = 0; e = 0; d = 0 }
    }
    
    # Check rounds
    if ($xml.tournament.pods -and $xml.tournament.pods.pod) {
        foreach ($pod in $xml.tournament.pods.pod) {
            if ($pod.rounds -and $pod.rounds.round) {
                foreach ($round in $pod.rounds.round) {
                    if ($round.matches -and $round.matches.match) {
                        foreach ($match in $round.matches.match) {
                            $outcome = [int]$match.outcome
                            $p1 = $match.player1.userid
                            $p2 = $match.player2.userid
                            
                            if ($p1 -and $p2) {
                                if ($outcome -eq 1) {
                                    $statsMap[$p1].v++
                                    $statsMap[$p2].d++
                                } elseif ($outcome -eq 2) {
                                    $statsMap[$p1].d++
                                    $statsMap[$p2].v++
                                } else {
                                    $statsMap[$p1].e++
                                    $statsMap[$p2].e++
                                }
                            } elseif ($p1 -and !$p2) {
                                $statsMap[$p1].v++
                            } else {
                                $spid = $match.player.userid
                                if ($spid) {
                                    if ($statsMap[$spid] -eq $null) {
                                        $statsMap[$spid] = @{ v = 0; e = 0; d = 0 }
                                    }
                                    if ($outcome -eq 5) {
                                        $statsMap[$spid].v++
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    Write-Host "=== Relatorio do Torneio: $name ($filePath) ===" -ForegroundColor Green
    if ($xml.tournament.standings -and $xml.tournament.standings.pod) {
        foreach ($pod in $xml.tournament.standings.pod) {
            $cat = $pod.category
            $type = $pod.type
            Write-Host "Pod Category: $cat | Type: $type" -ForegroundColor Cyan
            foreach ($player in $pod.player) {
                $id = $player.id
                $place = $player.place
                $name = $players[$id]
                if (-not $name) {
                    $name = "ID $id (Nao encontrado na lista de players!)"
                }
                $stats = $statsMap[$id]
                if ($stats) {
                    $pts = $stats.v * 3 + $stats.e
                    Write-Host "  Rank $place`: $name - $pts PTS ($($stats.v)V - $($stats.e)E - $($stats.d)D)"
                } else {
                    Write-Host "  Rank $place`: $name - ID $id (Sem partidas registradas no pod!)" -ForegroundColor Yellow
                }
            }
        }
    }
    Write-Host ""
}

Test-File $file8 "T5 #8"
Test-File $file9 "T5 #9"
