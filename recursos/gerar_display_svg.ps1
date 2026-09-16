# Configurações do Display (Medidas em Milímetros)
$WIDTH = 280.0
$HEIGHT = 120.0
$TOKEN_DIAMETER = 51.0  # 50mm do token + 1mm de folga
$CORNER_RADIUS = 10.0
$SCREW_HOLE_DIAMETER = 4.5  # Folga para parafusos prolongadores de 4mm
$SCREW_OFFSET = 10.0  # Distância dos furos de canto até as bordas
$NUM_TOKENS = 4

# Cores padrão para máquinas de corte a laser (LightBurn / CorelDRAW)
$COLOR_CUT = "#FF0000"       # Vermelho = Linha de Corte
$COLOR_ENGRAVE = "#0000FF"   # Azul = Linha de Gravação
$COLOR_UV = "#000000"        # Preto = Impressão UV
$STROKE_WIDTH = "0.1"        # Espessura fina para reconhecimento do laser (hairline)

$OutputDir = Join-Path $PSScriptRoot "hall_da_fama"
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

function Get-TokenCenters {
    $remaining_space = $WIDTH - ($NUM_TOKENS * $TOKEN_DIAMETER)
    $spacing = $remaining_space / ($NUM_TOKENS + 1)
    
    $centers = @()
    $current_x = $spacing + ($TOKEN_DIAMETER / 2.0)
    $centerY = $HEIGHT / 2.0
    for ($i = 0; $i -lt $NUM_TOKENS; $i++) {
        $centers += , @($current_x, $centerY)
        $current_x += ($TOKEN_DIAMETER + $spacing)
    }
    return , $centers
}

function Save-Svg {
    param (
        [string]$Filename,
        [string]$Content
    )
    $Path = Join-Path $OutputDir $Filename
    # Salva com codificação UTF-8 simples
    $Utf8NoBom = New-Object System.Text.UTF8Encoding $False
    [System.IO.File]::WriteAllText($Path, $Content, $Utf8NoBom)
    Write-Host "Salvo: $Path"
}

# 1. Camada 1: Fundo
$centers = Get-TokenCenters
$labels = @("Campeão Geral", "Assiduidade", "Versatilidade", "Consolação")

$svg1 = @()
$svg1 += "<?xml version='1.0' encoding='utf-8'?>"
$svg1 += "<svg width=`"${WIDTH}mm`" height=`"${HEIGHT}mm`" viewBox=`"0 0 $WIDTH $HEIGHT`" xmlns=`"http://www.w3.org/2000/svg`">"
# Borda externa
$svg1 += "  <rect x=`"0`" y=`"0`" width=`"$WIDTH`" height=`"$HEIGHT`" rx=`"$CORNER_RADIUS`" ry=`"$CORNER_RADIUS`" fill=`"none`" stroke=`"$COLOR_CUT`" stroke-width=`"$STROKE_WIDTH`" />"
# Furos dos cantos
$coords = @(
    @($SCREW_OFFSET, $SCREW_OFFSET),
    @(($WIDTH - $SCREW_OFFSET), $SCREW_OFFSET),
    @($SCREW_OFFSET, ($HEIGHT - $SCREW_OFFSET)),
    @(($WIDTH - $SCREW_OFFSET), ($HEIGHT - $SCREW_OFFSET))
)
foreach ($coord in $coords) {
    $cx = $coord[0]
    $cy = $coord[1]
    $r = $SCREW_HOLE_DIAMETER / 2.0
    $svg1 += "  <circle cx=`"$cx`" cy=`"$cy`" r=`"$r`" fill=`"none`" stroke=`"$COLOR_CUT`" stroke-width=`"$STROKE_WIDTH`" />"
}
# Título
$titleX = $WIDTH / 2.0
$svg1 += "  <text x=`"$titleX`" y=`"28`" font-family=`"sans-serif`" font-size=`"7.5`" font-weight=`"bold`" fill=`"$COLOR_UV`" text-anchor=`"middle`">ATLÂNTICA +MAIS - 4ª TEMPORADA</text>"
# Círculos guias e conquistas
for ($i = 0; $i -lt $NUM_TOKENS; $i++) {
    $center = $centers[$i]
    $cx = $center[0]
    $cy = $center[1]
    $r = ($TOKEN_DIAMETER - 1.0) / 2.0
    $label = $labels[$i].ToUpper()
    $textY = $cy + ($TOKEN_DIAMETER / 2.0) + 12.0
    
    $svg1 += "  <circle cx=`"$cx`" cy=`"$cy`" r=`"$r`" fill=`"none`" stroke=`"$COLOR_ENGRAVE`" stroke-width=`"0.2`" stroke-dasharray=`"2,2`" />"
    $svg1 += "  <text x=`"$cx`" y=`"$textY`" font-family=`"sans-serif`" font-size=`"5.5`" font-weight=`"500`" fill=`"$COLOR_UV`" text-anchor=`"middle`">$label</text>"
}
$svg1 += "</svg>"
Save-Svg "camada_1_fundo.svg" ($svg1 -join "`r`n")

# 2. Camada 2: Berço
$svg2 = @()
$svg2 += "<?xml version='1.0' encoding='utf-8'?>"
$svg2 += "<svg width=`"${WIDTH}mm`" height=`"${HEIGHT}mm`" viewBox=`"0 0 $WIDTH $HEIGHT`" xmlns=`"http://www.w3.org/2000/svg`">"
# Borda externa
$svg2 += "  <rect x=`"0`" y=`"0`" width=`"$WIDTH`" height=`"$HEIGHT`" rx=`"$CORNER_RADIUS`" ry=`"$CORNER_RADIUS`" fill=`"none`" stroke=`"$COLOR_CUT`" stroke-width=`"$STROKE_WIDTH`" />"
# Furos dos cantos
foreach ($coord in $coords) {
    $cx = $coord[0]
    $cy = $coord[1]
    $r = $SCREW_HOLE_DIAMETER / 2.0
    $svg2 += "  <circle cx=`"$cx`" cy=`"$cy`" r=`"$r`" fill=`"none`" stroke=`"$COLOR_CUT`" stroke-width=`"$STROKE_WIDTH`" />"
}
# Nichos do token (furos de corte)
foreach ($center in $centers) {
    $cx = $center[0]
    $cy = $center[1]
    $r = $TOKEN_DIAMETER / 2.0
    $svg2 += "  <circle cx=`"$cx`" cy=`"$cy`" r=`"$r`" fill=`"none`" stroke=`"$COLOR_CUT`" stroke-width=`"$STROKE_WIDTH`" />"
}
$svg2 += "</svg>"
Save-Svg "camada_2_berco.svg" ($svg2 -join "`r`n")

# 3. Camada 3: Tampa
$svg3 = @()
$svg3 += "<?xml version='1.0' encoding='utf-8'?>"
$svg3 += "<svg width=`"$WIDTH`"mm`" height=`"$HEIGHT`"mm`" viewBox=`"0 0 $WIDTH $HEIGHT`" xmlns=`"http://www.w3.org/2000/svg`">"
# Borda externa
$svg3 += "  <rect x=`"0`" y=`"0`" width=`"$WIDTH`" height=`"$HEIGHT`" rx=`"$CORNER_RADIUS`" ry=`"$CORNER_RADIUS`" fill=`"none`" stroke=`"$COLOR_CUT`" stroke-width=`"$STROKE_WIDTH`" />"
# Furos dos cantos
foreach ($coord in $coords) {
    $cx = $coord[0]
    $cy = $coord[1]
    $r = $SCREW_HOLE_DIAMETER / 2.0
    $svg3 += "  <circle cx=`"$cx`" cy=`"$cy`" r=`"$r`" fill=`"none`" stroke=`"$COLOR_CUT`" stroke-width=`"$STROKE_WIDTH`" />"
}
$svg3 += "</svg>"
Save-Svg "camada_3_tampa.svg" ($svg3 -join "`r`n")

# 4. Base de Apoio
$base_w = 300.0
$base_h = 50.0
$slot_w = 280.2
$slot_h = 8.2

$svgBase = @()
$svgBase += "<?xml version='1.0' encoding='utf-8'?>"
$svgBase += "<svg width=`"${base_w}mm`" height=`"${base_h}mm`" viewBox=`"0 0 $base_w $base_h`" xmlns=`"http://www.w3.org/2000/svg`">"
# Borda externa
$svgBase += "  <rect x=`"0`" y=`"0`" width=`"$base_w`" height=`"$base_h`" rx=`"5`" ry=`"5`" fill=`"none`" stroke=`"$COLOR_CUT`" stroke-width=`"$STROKE_WIDTH`" />"
# Rasgo central
$slotX = ($base_w - $slot_w) / 2.0
$slotY = ($base_h - $slot_h) / 2.0
$svgBase += "  <rect x=`"$slotX`" y=`"$slotY`" width=`"$slot_w`" height=`"$slot_h`" rx=`"1`" ry=`"1`" fill=`"none`" stroke=`"$COLOR_CUT`" stroke-width=`"$STROKE_WIDTH`" />"
$svgBase += "</svg>"
Save-Svg "base_apoio.svg" ($svgBase -join "`r`n")

Write-Host "Processo concluído com sucesso!"
