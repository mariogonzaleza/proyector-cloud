param([int]$Port = 5522)

Add-Type -AssemblyName System.Net.HttpListener -ErrorAction SilentlyContinue

$root = $PSScriptRoot
$startedAt = Get-Date
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "Serving $root on http://localhost:$Port/ (iniciado $startedAt)"
Write-Output "Verifica en cualquier momento: http://localhost:$Port/__status"

$mime = @{
    ".html" = "text/html"
    ".js"   = "text/javascript"
    ".jsx"  = "text/javascript"
    ".json" = "application/json"
    ".css"  = "text/css"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".ico"  = "image/x-icon"
}

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response
    try {
        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        # Nunca cachear nada: evita que el navegador (o un servidor viejo que quedó vivo)
        # muestre una versión vieja del código sin que se note.
        $response.Headers.Add("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        $response.Headers.Add("Pragma", "no-cache")
        $path = $request.Url.AbsolutePath

        if ($path -eq "/__status") {
            $response.ContentType = "application/json"
            $status = @{ root = $root; startedAt = "$startedAt"; now = "$(Get-Date)" } | ConvertTo-Json
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($status)
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            if ($path -eq "/") { $path = "/index.html" }
            $filePath = Join-Path $root ($path.TrimStart("/"))
            $filePath = [System.IO.Path]::GetFullPath($filePath)

            if (-not $filePath.StartsWith($root)) {
                $response.StatusCode = 403
            } elseif (Test-Path $filePath -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                $contentType = $mime[$ext]
                if (-not $contentType) { $contentType = "application/octet-stream" }
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentType = $contentType
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
                $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
                $response.OutputStream.Write($notFound, 0, $notFound.Length)
            }
        }
    } catch {
        $response.StatusCode = 500
    } finally {
        $response.OutputStream.Close()
    }
}
