$port = 8000
$siteDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\site-teste"))
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$port/")

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".tdf"  = "text/plain; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

Write-Host ""
Write-Host "🚀 Servidor local nativo (PowerShell) iniciado com sucesso!" -ForegroundColor Green
Write-Host "👉 Acesse no seu navegador: http://127.0.0.1:$port" -ForegroundColor Cyan
Write-Host "Para encerrar o servidor, feche esta janela ou aperte Ctrl + C." -ForegroundColor Yellow
Write-Host ""

try {
    $listener.Start()
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $req = $context.Request
        $res = $context.Response

        $urlPath = $req.Url.LocalPath
        if ($urlPath -eq "/") { $urlPath = "/index.html" }

        # Solve directory path safely
        $filePath = Join-Path $siteDir $urlPath
        $fullPath = [System.IO.Path]::GetFullPath($filePath)

        if (-not $fullPath.StartsWith($siteDir)) {
            $res.StatusCode = 403
            $res.Close()
            continue
        }

        if (Test-Path $fullPath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
            $mime = $mimeTypes[$ext]
            if ($null -eq $mime) { $mime = "application/octet-stream" }

            $res.ContentType = $mime
            $res.StatusCode = 200

            # Set CORS headers
            $res.Headers.Add("Access-Control-Allow-Origin", "*")

            $bytes = [System.IO.File]::ReadAllBytes($fullPath)
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $res.StatusCode = 404
            $utf8 = New-Object System.Text.UTF8Encoding
            $bytes = $utf8.GetBytes("404 Not Found: $urlPath")
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        $res.Close()
    }
} catch {
    Write-Host "Erro no servidor: $_" -ForegroundColor Red
} finally {
    $listener.Stop()
}
