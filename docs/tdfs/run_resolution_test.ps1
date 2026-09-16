# Script simplificado de analise de resolucao de nomes

# 1. Carrega dados da planilha (cache)
$dbPlayers = @()
$csvPath = "C:\Users\felipe.damasceno\.gemini\antigravity\brain\a29f70ef-7243-4c76-b5f7-cac97365340f\.system_generated\steps\5778\content.md"
$lines = Get-Content $csvPath
$inCsv = $false
foreach ($line in $lines) {
    if ($line.StartsWith("ID,Jogador")) {
        $inCsv = $true
        continue
    }
    if ($inCsv -and $line.Trim() -ne "" -and -not $line.StartsWith("---")) {
        $parts = $line.Split(",")
        $dbPlayers += @{
            ID = $parts[0].Trim()
            Jogador = $parts[1].Trim()
            Categoria = $parts[2].Trim()
        }
    }
}

# Funcao de normalizacao
function Normalize-PlayerName ([string]$name) {
    if ($null -eq $name -or $name -eq "") { return "" }
    $normalized = $name.Normalize([System.Text.NormalizationForm]::FormD)
    $sb = New-Object System.Text.StringBuilder
    foreach ($char in $normalized.ToCharArray()) {
        if ([System.Globalization.CharUnicodeInfo]::GetUnicodeCategory($char) -ne [System.Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$sb.Append($char)
        }
    }
    return $sb.ToString().ToLower().Trim() -replace '\s+', ' '
}

function Run-Analysis ($filePath, $label) {
    Write-Host "========================================="
    Write-Host "Analise de Importacao: $label"
    Write-Host "========================================="
    
    if (-not $filePath -or -not (Test-Path $filePath)) {
        Write-Host "Arquivo nao encontrado!"
        return
    }
    
    [xml]$xml = Get-Content $filePath
    
    # 1. Carrega jogadores do TDF
    $tourneyPlayers = @{}
    foreach ($p in $xml.tournament.players.player) {
        $tourneyPlayers[$p.userid] = @{
            Name = "$($p.firstname) $($p.lastname)".Trim()
            Birthdate = $p.birthdate
        }
    }
    
    # 2. Inicializa stats
    $statsMap = @{}
    foreach ($id in $tourneyPlayers.Keys) {
        $statsMap[$id] = @{ v = 0; e = 0; d = 0 }
    }
    
    # 3. Calcula rodadas (incluindo Byes)
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
    
    # 4. Processa classificacao por Pods do TDF
    $stagePlayers = @()
    if ($xml.tournament.standings -and $xml.tournament.standings.pod) {
        foreach ($pod in $xml.tournament.standings.pod) {
            $catCode = $pod.category
            $type = $pod.type
            
            $categoryLabel = "MASTER"
            if ($catCode -eq "1" -or $catCode -eq "11") { $categoryLabel = "SENIOR" }
            elseif ($catCode -eq "0" -or $catCode -eq "12") { $categoryLabel = "JUNIOR" }
            
            foreach ($playerNode in $pod.player) {
                $id = $playerNode.id
                $place = [int]$playerNode.place
                
                $pInfo = $tourneyPlayers[$id]
                $rawName = if ($pInfo) { $pInfo.Name } else { "Jogador $id" }
                
                $pStats = $statsMap[$id]
                $v = if ($pStats) { $pStats.v } else { 0 }
                $e = if ($pStats) { $pStats.e } else { 0 }
                $d = if ($pStats) { $pStats.d } else { 0 }
                $points = $v * 3 + $e
                
                $stagePlayers += @{
                    Pos = $place
                    ID = $id
                    Jogador = $rawName
                    Categoria = $categoryLabel
                    Pontos = $points
                    V = $v
                    E = $e
                    D = $d
                    Podio = if ($place -le 4 -and $type -ne "dnf") { 1 } else { 0 }
                    MediaColocacao = $place
                }
            }
        }
    }
    
    # Ordena conforme consolidador do site
    $stagePlayers = $stagePlayers | Sort-Object Pontos, V, E -Descending
    for ($i = 0; $i -lt $stagePlayers.Length; $i++) {
        $stagePlayers[$i].Pos = $i + 1
    }
    
    # 5. Resolve nomes
    Write-Host "RESOLUCAO DE NOMES (Painel Admin):"
    foreach ($sp in $stagePlayers) {
        $rawName = $sp.Jogador
        $id = $sp.ID
        $normName = Normalize-PlayerName $rawName
        
        $matchedPlayer = $null
        
        # 1. Match por ID
        if ($id -and $id -ne "") {
            $matchedPlayer = $dbPlayers | Where-Object { $_.ID -eq $id }
        }
        
        if ($matchedPlayer) {
            Write-Host "  [OK - ID Match] '$rawName' (ID $id) -> Planilha: '$($matchedPlayer.Jogador)'"
        } else {
            # 2. Match por Nome Exato Normalizado
            $matchedPlayer = $dbPlayers | Where-Object { (Normalize-PlayerName $_.Jogador) -eq $normName }
            if ($matchedPlayer) {
                Write-Host "  [OK - Nome Match] '$rawName' (ID $id) -> Planilha: '$($matchedPlayer.Jogador)'"
            } else {
                # 3. Match Parcial de Iniciais/Primeiro Nome
                $parts = $normName.Split(" ")
                $firstName = $parts[0]
                $matchCandidates = $dbPlayers | Where-Object { (Normalize-PlayerName $_.Jogador).StartsWith($firstName) }
                
                if ($matchCandidates) {
                    $candNames = ($matchCandidates | ForEach-Object { $_.Jogador }) -join ", "
                    Write-Host "  [?] Vincular '$rawName' (ID $id) com: $candNames ?"
                } else {
                    Write-Host "  [NOVO] Registrar '$rawName' (ID $id) como novo jogador."
                }
            }
        }
    }
    
    Write-Host ""
    Write-Host "PRE-VISUALIZACAO DA TABELA DO SITE:"
    $mask = "{0,-4} | {1,-26} | {2,-8} | {3,-8} | {4,-10} | {5,-6} | {6,-6}"
    Write-Host ([string]::Format($mask, "Pos", "Jogador", "Cat", "Pontos", "V-E-D", "Podio", "Media"))
    Write-Host ("-" * 78)
    foreach ($sp in $stagePlayers) {
        $ved = "$($sp.V)V-$($sp.E)E-$($sp.D)D"
        Write-Host ([string]::Format($mask, $sp.Pos, $sp.Jogador, $sp.Categoria, "$($sp.Pontos) PTS", $ved, $sp.Podio, "$($sp.MediaColocacao)º"))
    }
    Write-Host ""
}

$file8 = Get-ChildItem -Filter "*#8.tdf" | Select-Object -First 1 -ExpandProperty FullName
$file9 = Get-ChildItem -Filter "*#9.tdf" | Select-Object -First 1 -ExpandProperty FullName

Run-Analysis $file8 "Etapa 8"
Run-Analysis $file9 "Etapa 9"
