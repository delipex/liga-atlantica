<#
.SYNOPSIS
    Processa os resultados de um torneio da Liga Atlântica e atualiza o ranking CSV.
.DESCRIPTION
    Este script lê o ranking atual de 'planilha/Ranking_Atualizado_Final.csv',
    processa os colocados de um arquivo de texto 'planilha/torneio.txt',
    calcula os pontos, atualiza pódios e médias de colocação,
    e salva o resultado de volta com codificação UTF-8 com BOM e delimitador ';'.
.PARAMETER Dobrado
    Chave para indicar se o torneio vale pontuação dobrada (ex: League Challenge ou CUP).
#>
param (
    [switch]$Dobrado
)

$RankingFile = Join-Path $PSScriptRoot "Ranking_Atualizado_Final.csv"
$TournamentFile = Join-Path $PSScriptRoot "torneio.txt"

# 1. Verificar arquivos necessários
if (-not (Test-Path $RankingFile)) {
    Write-Error "Arquivo de ranking não encontrado em: $RankingFile"
    exit 1
}

if (-not (Test-Path $TournamentFile)) {
    # Criar um arquivo de exemplo se não existir
    @("1;Gabriel Seixas", "2;Carlos Júnior", "3;Lucas Costa", "4;Antônio Neto") | Out-File -FilePath $TournamentFile -Encoding utf8
    Write-Host "[AVISO] Arquivo 'planilha/torneio.txt' não encontrado. Criamos um modelo de exemplo."
    Write-Host "Por favor, edite 'planilha/torneio.txt' com os resultados e execute o script novamente."
    exit 0
}

# 2. Funções auxiliares de normalização e busca
function Remove-Diacritics {
    param([string]$string)
    if ([string]::IsNullOrEmpty($string)) { return "" }
    $normalized = $string.Normalize([System.Text.NormalizationForm]::FormD)
    $sb = New-Object System.Text.StringBuilder
    foreach ($char in $normalized.ToCharArray()) {
        if ([System.Globalization.CharUnicodeInfo]::GetUnicodeCategory($char) -ne [System.Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$sb.Append($char)
        }
    }
    return $sb.ToString().ToLower().Trim()
}

function Normalize-Name {
    param([string]$name)
    if ([string]::IsNullOrEmpty($name)) { return "" }
    $words = $name.Trim().Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)
    $normalizedWords = @()
    
    for ($i = 0; $i -lt $words.Length; $i++) {
        $word = $words[$i]
        $lowerWord = $word.ToLower()
        
        # Manter preposições comuns em minúsculas
        if ($i -gt 0 -and $i -lt ($words.Length - 1) -and @("de", "da", "do", "dos", "das") -contains $lowerWord) {
            $normalizedWords += $lowerWord
        } else {
            # Iniciais maiúsculas
            $capWord = $word.Substring(0,1).ToUpper() + $word.Substring(1).ToLower()
            
            # Correções específicas de acentuação do padrão da Liga
            if ($capWord -eq "Joao") { $capWord = "João" }
            elseif ($capWord -eq "Vitor") { $capWord = "Vitor" }
            elseif ($capWord -eq "Junior") { $capWord = "Júnior" }
            elseif ($capWord -eq "Antonio") { $capWord = "Antônio" }
            elseif ($capWord -eq "Correa") { $capWord = "Corrêa" }
            elseif ($capWord -eq "Moises") { $capWord = "Moisés" }
            elseif ($capWord -eq "Massao") { $capWord = "Massão" }
            
            $normalizedWords += $capWord
        }
    }
    return ($normalizedWords -join " ")
}

function Find-Player {
    param(
        [string]$tourName,
        $rankingList
    )
    $normTour = Remove-Diacritics $tourName
    
    # Mapeamento manual histórico da liga
    if ($normTour -eq "caio r") { $normTour = "caio rios" }
    if ($normTour -eq "carlos morais") { $normTour = "carlos henrique morais" }
    
    # 1. Busca exata (desconsiderando acentos/capitalização)
    foreach ($p in $rankingList) {
        $normRank = Remove-Diacritics $p.Jogador
        if ($normTour -eq $normRank) {
            return $p
        }
    }
    
    # 2. Busca parcial (Ex: "Caio R" vs "Caio Rios")
    $tourParts = $normTour.Split(" ")
    if ($tourParts.Length -eq 2 -and $tourParts[1].Length -eq 1) {
        foreach ($p in $rankingList) {
            $rankParts = (Remove-Diacritics $p.Jogador).Split(" ")
            if ($rankParts.Length -ge 2) {
                if ($tourParts[0] -eq $rankParts[0] -and $tourParts[1] -eq $rankParts[1].Substring(0,1)) {
                    return $p
                }
            }
        }
    }
    return $null
}

function Get-PointsByPlacement {
    param(
        [int]$position,
        [bool]$isDouble
    )
    $pts = 0
    if ($position -eq 1) { $pts = 50 }
    elseif ($position -eq 2) { $pts = 40 }
    elseif ($position -ge 3 -and $position -le 4) { $pts = 30 }
    elseif ($position -ge 5 -and $position -le 8) { $pts = 20 }
    elseif ($position -ge 9 -and $position -le 16) { $pts = 15 }
    elseif ($position -ge 17 -and $position -le 32) { $pts = 5 }
    
    if ($isDouble) { return $pts * 2 }
    return $pts
}

# 3. Ler base de dados atual (CSV)
Write-Host "Carregando o ranking atual de: $RankingFile..."
# Importar CSV tratando codificações UTF-8 de forma adequada
$csvContent = Get-Content -Path $RankingFile -Encoding UTF8
$ranking = ConvertFrom-Csv -InputObject ($csvContent -join "`r`n") -Delimiter ';'

# 4. Ler novos resultados do torneio
Write-Host "Lendo resultados do torneio de: $TournamentFile..."
$standingsLines = Get-Content -Path $TournamentFile -Encoding UTF8
$tournamentResults = @()
$lineCount = 1

foreach ($line in $standingsLines) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    
    $pos = $lineCount
    $name = $line.Trim()
    
    # Se a linha estiver no formato: Posição;Jogador
    if ($line -like "*;*") {
        $parts = $line.Split(";")
        if ([int]::TryParse($parts[0].Trim(), [ref]$parsedPos)) {
            $pos = $parsedPos
            $name = $parts[1].Trim()
        }
    }
    
    $tournamentResults += [PSCustomObject]@{
        Posicao = $pos
        Nome    = Normalize-Name $name
    }
    $lineCount++
}

Write-Host "Processando $($tournamentResults.Count) colocações (Pontuação Dobrada: $Dobrado)..."

# 5. Atualizar ou adicionar jogadores
$novosJogadoresCount = 0
foreach ($res in $tournamentResults) {
    $pontosGanhos = Get-PointsByPlacement -position $res.Posicao -isDouble $Dobrado
    $podioGanho = if ($res.Posicao -le 4) { 1 } else { 0 }  # Top 4 é pódio no padrão do site
    
    $jogador = Find-Player -tourName $res.Nome -rankingList $ranking
    
    if ($jogador -ne $null) {
        # Atualiza jogador existente
        $ptsAntigos = if ([int]::TryParse($jogador.Pontos, [ref]$val)) { $val } else { 0 }
        $podiosAntigos = if ([int]::TryParse($jogador.Podio, [ref]$val)) { $val } else { 0 }
        $partAntigas = if ([int]::TryParse($jogador.Participacoes, [ref]$val)) { $val } else { 0 }
        if ($partAntigas -eq 0) { $partAntigas = 1 }
        
        $partNovas = $partAntigas + 1
        
        # Média de colocação ponderada
        $mediaAntiga = if ([double]::TryParse($jogador.MediaColocacao.Replace(",", "."), [ref]$valDouble)) { $valDouble } else { 0.0 }
        $novaMedia = if ($mediaAntiga -gt 0) { (($mediaAntiga * $partAntigas) + $res.Posicao) / $partNovas } else { $res.Posicao }
        
        # Histórico de colocações
        $histAntigo = $jogador.HistoricoColocacoes
        $novoHist = if ([string]::IsNullOrEmpty($histAntigo)) { $res.Posicao.ToString() } else { "$histAntigo;$($res.Posicao)" }
        
        $jogador.Pontos = ($ptsAntigos + $pontosGanhos).ToString()
        $jogador.Podio = ($podiosAntigos + $podioGanho).ToString()
        $jogador.MediaColocacao = [string]::Format("{0:F2}", $novaMedia).Replace(".", ",")
        $jogador.Participacoes = $partNovas.ToString()
        $jogador.HistoricoColocacoes = $novoHist
        
        Write-Host "- $($jogador.Jogador) ($($res.Posicao)º): +$pontosGanhos PTS (Novo Total: $($jogador.Pontos) PTS)"
    } else {
        # Adiciona novo jogador
        $novo = [PSCustomObject]@{
            Pos                 = ""
            Jogador             = $res.Nome
            Categoria           = "ME" # Padrão Master
            Pontos              = $pontosGanhos.ToString()
            Vitorias            = "0"
            Empates             = "0"
            Derrotas            = "0"
            Podio               = $podioGanho.ToString()
            MediaColocacao      = [string]::Format("{0:F2}", [double]$res.Posicao).Replace(".", ",")
            Deck                = "Outros"
            TipoEnergia         = "colorless"
            Participacoes       = "1"
            HistoricoColocacoes = $res.Posicao.ToString()
        }
        $ranking += $novo
        $novosJogadoresCount++
        Write-Host "- [NOVO JOGADOR] $($res.Nome) ($($res.Posicao)º): +$pontosGanhos PTS"
    }
}

# Preencher membros faltantes para evitar erros no select/export
foreach ($j in $ranking) {
    if ($null -eq $j.Categoria) { $j | Add-Member -MemberType NoteProperty -Name "Categoria" -Value "ME" -Force }
    if ($null -eq $j.Vitorias) { $j | Add-Member -MemberType NoteProperty -Name "Vitorias" -Value "0" -Force }
    if ($null -eq $j.Empates) { $j | Add-Member -MemberType NoteProperty -Name "Empates" -Value "0" -Force }
    if ($null -eq $j.Derrotas) { $j | Add-Member -MemberType NoteProperty -Name "Derrotas" -Value "0" -Force }
    if ($null -eq $j.Participacoes) { $j | Add-Member -MemberType NoteProperty -Name "Participacoes" -Value "1" -Force }
    if ($null -eq $j.HistoricoColocacoes) { $j | Add-Member -MemberType NoteProperty -Name "HistoricoColocacoes" -Value "" -Force }
    if ($null -eq $j.Deck) { $j | Add-Member -MemberType NoteProperty -Name "Deck" -Value "Outros" -Force }
    if ($null -eq $j.TipoEnergia) { $j | Add-Member -MemberType NoteProperty -Name "TipoEnergia" -Value "colorless" -Force }
}

# 6. Reordenar e recalcular posições
# Converter pontos para inteiro para ordenação correta
$rankingSorted = $ranking | Sort-Object @{Expression={[int]$_.Pontos}; Descending=$true}, @{Expression={[int]$_.Podio}; Descending=$true}, Jogador

$posCounter = 1
foreach ($j in $rankingSorted) {
    $j.Pos = $posCounter.ToString()
    $posCounter++
}

# 7. Salvar de volta em CSV com UTF-8 BOM e delimitador ';'
Write-Host "Salvando ranking atualizado de volta no arquivo..."
$csvOut = $rankingSorted | Select-Object Pos, Jogador, Categoria, Pontos, Vitorias, Empates, Derrotas, Podio, MediaColocacao, Deck, TipoEnergia, Participacoes, HistoricoColocacoes | ConvertTo-Csv -NoTypeInformation -Delimiter ';'
# Remover as aspas extras geradas pelo ConvertTo-Csv para manter compatibilidade exata
$csvOutClean = @()
$csvOutClean += "Pos;Jogador;Categoria;Pontos;Vitorias;Empates;Derrotas;Podio;MediaColocacao;Deck;TipoEnergia;Participacoes;HistoricoColocacoes" # Cabeçalho
for ($i = 1; $i -lt $csvOut.Length; $i++) {
    # Remover aspas do início e fim de cada campo
    $lineClean = $csvOut[$i] -replace '"', ''
    $csvOutClean += $lineClean
}

[System.IO.File]::WriteAllLines($RankingFile, $csvOutClean, [System.Text.Encoding]::UTF8)

Write-Host "[SUCESSO] Ranking atualizado com sucesso em: $RankingFile"
Write-Host "Total de jogadores cadastrados: $($rankingSorted.Count) ($novosJogadoresCount novos adicionados)"
