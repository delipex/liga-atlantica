import os
import xml.etree.ElementTree as ET

# Configurações do Display (Medidas em Milímetros)
WIDTH = 280.0
HEIGHT = 120.0
TOKEN_DIAMETER = 51.0  # 50mm do token + 1mm de folga
CORNER_RADIUS = 10.0
SCREW_HOLE_DIAMETER = 4.5  # Folga para parafusos prolongadores de 4mm
SCREW_OFFSET = 10.0  # Distância dos furos de canto até as bordas
NUM_TOKENS = 4

# Cores padrão para máquinas de corte a laser (LightBurn / CorelDRAW)
COLOR_CUT = "#FF0000"       # Vermelho = Linha de Corte
COLOR_ENGRAVE = "#0000FF"   # Azul = Linha de Gravação
COLOR_UV = "#000000"        # Preto = Impressão UV
STROKE_WIDTH = "0.1"        # Espessura fina para reconhecimento do laser (hairline)

def create_base_svg(width, height):
    """Cria a estrutura inicial do SVG com dimensões em mm para manter a escala."""
    svg = ET.Element("svg", {
        "width": f"{width}mm",
        "height": f"{height}mm",
        "viewBox": f"0 0 {width} {height}",
        "xmlns": "http://www.w3.org/2000/svg"
    })
    return svg

def add_screw_holes(parent):
    """Adiciona furos para os parafusos nos 4 cantos."""
    coords = [
        (SCREW_OFFSET, SCREW_OFFSET),
        (WIDTH - SCREW_OFFSET, SCREW_OFFSET),
        (SCREW_OFFSET, HEIGHT - SCREW_OFFSET),
        (WIDTH - SCREW_OFFSET, HEIGHT - SCREW_OFFSET)
    ]
    for cx, cy in coords:
        ET.SubElement(parent, "circle", {
            "cx": f"{cx}",
            "cy": f"{cy}",
            "r": f"{SCREW_HOLE_DIAMETER / 2.0}",
            "fill": "none",
            "stroke": COLOR_CUT,
            "stroke-width": STROKE_WIDTH
        })

def add_outer_contour(parent):
    """Adiciona a borda externa retangular com cantos arredondados."""
    ET.SubElement(parent, "rect", {
        "x": "0",
        "y": "0",
        "width": f"{WIDTH}",
        "height": f"{HEIGHT}",
        "rx": f"{CORNER_RADIUS}",
        "ry": f"{CORNER_RADIUS}",
        "fill": "none",
        "stroke": COLOR_CUT,
        "stroke-width": STROKE_WIDTH
    })

def get_token_centers():
    """Calcula os centros horizontais dos tokens distribuídos igualmente."""
    remaining_space = WIDTH - (NUM_TOKENS * TOKEN_DIAMETER)
    spacing = remaining_space / (NUM_TOKENS + 1)
    
    centers = []
    current_x = spacing + (TOKEN_DIAMETER / 2.0)
    for _ in range(NUM_TOKENS):
        centers.append((current_x, HEIGHT / 2.0))
        current_x += TOKEN_DIAMETER + spacing
    return centers

def save_svg(svg_element, filepath):
    """Salva o elemento XML formatado em um arquivo."""
    tree = ET.ElementTree(svg_element)
    # Formatação com recuos para melhor leitura humana
    ET.indent(tree, space="  ", level=0)
    with open(filepath, "wb") as f:
        tree.write(f, encoding="utf-8", xml_declaration=True)
    print(f"Salvo: {filepath}")

def generate_layer_1_fundo(output_dir):
    """Gera a Camada 1 (Base/Fundo) em Acrílico Preto."""
    svg = create_base_svg(WIDTH, HEIGHT)
    
    # Borda e Furos de Fixação (Corte)
    add_outer_contour(svg)
    add_screw_holes(svg)
    
    # Elementos de Marcação e Texto (Impressão UV / Gravação)
    centers = get_token_centers()
    labels = ["Campeão Geral", "Assiduidade", "Versatilidade", "Consolação"]
    
    # Título no topo
    ET.SubElement(svg, "text", {
        "x": f"{WIDTH / 2.0}",
        "y": "28",
        "font-family": "sans-serif",
        "font-size": "7.5",
        "font-weight": "bold",
        "fill": COLOR_UV,
        "text-anchor": "middle"
    }).text = "ATLÂNTICA +MAIS - 4ª TEMPORADA"
    
    # Círculos pontilhados apenas para indicar o alinhamento visual dos tokens na impressão
    for i, (cx, cy) in enumerate(centers):
        # Círculo guia pontilhado
        ET.SubElement(svg, "circle", {
            "cx": f"{cx}",
            "cy": f"{cy}",
            "r": f"{(TOKEN_DIAMETER - 1.0) / 2.0}",
            "fill": "none",
            "stroke": COLOR_ENGRAVE,
            "stroke-width": "0.2",
            "stroke-dasharray": "2,2"
        })
        
        # Nome da conquista sob cada nicho
        ET.SubElement(svg, "text", {
            "x": f"{cx}",
            "y": f"{cy + (TOKEN_DIAMETER / 2.0) + 12.0}",
            "font-family": "sans-serif",
            "font-size": "5.5",
            "font-weight": "500",
            "fill": COLOR_UV,
            "text-anchor": "middle"
        }).text = labels[i].upper()
        
    save_svg(svg, os.path.join(output_dir, "camada_1_fundo.svg"))

def generate_layer_2_berco(output_dir):
    """Gera a Camada 2 (Berço) em Acrílico Transparente 3mm com furos para encaixar os tokens."""
    svg = create_base_svg(WIDTH, HEIGHT)
    
    # Borda externa e Furos de Fixação (Corte)
    add_outer_contour(svg)
    add_screw_holes(svg)
    
    # Furos dos Nichos de Token (Corte)
    centers = get_token_centers()
    for cx, cy in centers:
        ET.SubElement(svg, "circle", {
            "cx": f"{cx}",
            "cy": f"{cy}",
            "r": f"{TOKEN_DIAMETER / 2.0}",
            "fill": "none",
            "stroke": COLOR_CUT,
            "stroke-width": STROKE_WIDTH
        })
        
    save_svg(svg, os.path.join(output_dir, "camada_2_berco.svg"))

def generate_layer_3_tampa(output_dir):
    """Gera a Camada 3 (Tampa Protetora) em Acrílico Transparente 2mm/3mm."""
    svg = create_base_svg(WIDTH, HEIGHT)
    
    # Borda externa e Furos de Fixação (Corte)
    add_outer_contour(svg)
    add_screw_holes(svg)
    
    save_svg(svg, os.path.join(output_dir, "camada_3_tampa.svg"))

def generate_base_apoio(output_dir):
    """Gera o vetor da Base de Apoio Vertical em Acrílico de 8mm."""
    base_w = 300.0  # Aumentado para 300mm para evitar que o rasgo de 280mm corte a base ao meio
    base_h = 50.0
    slot_w = 280.2  # Largura do display (280mm) + 0.2mm de folga
    slot_h = 8.2  # 3mm fundo + 3mm berço + 2mm tampa + 0.2mm de folga para encaixar
    
    svg = create_base_svg(base_w, base_h)
    
    # Retângulo externo da Base (Corte)
    ET.SubElement(svg, "rect", {
        "x": "0",
        "y": "0",
        "width": f"{base_w}",
        "height": f"{base_h}",
        "rx": "5",
        "ry": "5",
        "fill": "none",
        "stroke": COLOR_CUT,
        "stroke-width": STROKE_WIDTH
    })
    
    # Rasgo central para encaixe (Corte)
    ET.SubElement(svg, "rect", {
        "x": f"{(base_w - slot_w) / 2.0}",
        "y": f"{(base_h - slot_h) / 2.0}",
        "width": f"{slot_w}",
        "height": f"{slot_h}",
        "rx": "1",
        "ry": "1",
        "fill": "none",
        "stroke": COLOR_CUT,
        "stroke-width": STROKE_WIDTH
    })
    
    save_svg(svg, os.path.join(output_dir, "base_apoio.svg"))

def main():
    output_dir = "d:\\DELIPE\\LigaAtlântica\\recursos\\hall_da_fama"
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    print(f"Iniciando a geracao de vetores para o Display Premium em: {output_dir}")
    generate_layer_1_fundo(output_dir)
    generate_layer_2_berco(output_dir)
    generate_layer_3_tampa(output_dir)
    generate_base_apoio(output_dir)
    print("Processo concluido! Todos os arquivos SVG de corte a laser foram criados com sucesso.")

if __name__ == "__main__":
    main()
