# Script de prueba para validaciones
Write-Host "🧪 Probando validaciones del servidor..." -ForegroundColor Cyan
Write-Host ""

# Test 1: Registro con email inválido
Write-Host "Test 1: Registro con email inválido (debe fallar)" -ForegroundColor Yellow
$body1 = @{
    email = "email-invalido"
    password = "password123"
    nombre = "Test"
} | ConvertTo-Json

try {
    $response1 = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/register" `
        -Method POST `
        -Body $body1 `
        -ContentType "application/json" `
        -UseBasicParsing `
        -ErrorAction Stop
    Write-Host "❌ ERROR: Debería haber fallado" -ForegroundColor Red
} catch {
    $errorResponse = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Host "✅ Correcto: Validación funcionando" -ForegroundColor Green
    Write-Host "   Error: $($errorResponse.error)" -ForegroundColor Gray
}
Write-Host ""

# Test 2: Registro con contraseña corta
Write-Host "Test 2: Registro con contraseña corta (debe fallar)" -ForegroundColor Yellow
$body2 = @{
    email = "test@example.com"
    password = "123"
    nombre = "Test"
} | ConvertTo-Json

try {
    $response2 = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/register" `
        -Method POST `
        -Body $body2 `
        -ContentType "application/json" `
        -UseBasicParsing `
        -ErrorAction Stop
    Write-Host "❌ ERROR: Debería haber fallado" -ForegroundColor Red
} catch {
    $errorResponse = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Host "✅ Correcto: Validación funcionando" -ForegroundColor Green
    Write-Host "   Error: $($errorResponse.error)" -ForegroundColor Gray
}
Write-Host ""

# Test 3: Registro con contraseña sin números
Write-Host "Test 3: Registro con contraseña sin números (debe fallar)" -ForegroundColor Yellow
$body3 = @{
    email = "test@example.com"
    password = "password"
    nombre = "Test"
} | ConvertTo-Json

try {
    $response3 = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/register" `
        -Method POST `
        -Body $body3 `
        -ContentType "application/json" `
        -UseBasicParsing `
        -ErrorAction Stop
    Write-Host "❌ ERROR: Debería haber fallado" -ForegroundColor Red
} catch {
    $errorResponse = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Host "✅ Correcto: Validación funcionando" -ForegroundColor Green
    Write-Host "   Error: $($errorResponse.error)" -ForegroundColor Gray
}
Write-Host ""

# Test 4: Login con email inválido
Write-Host "Test 4: Login con email inválido (debe fallar)" -ForegroundColor Yellow
$body4 = @{
    email = "not-an-email"
    password = "password123"
} | ConvertTo-Json

try {
    $response4 = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/login" `
        -Method POST `
        -Body $body4 `
        -ContentType "application/json" `
        -UseBasicParsing `
        -ErrorAction Stop
    Write-Host "❌ ERROR: Debería haber fallado" -ForegroundColor Red
} catch {
    $errorResponse = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Host "✅ Correcto: Validación funcionando" -ForegroundColor Green
    Write-Host "   Error: $($errorResponse.error)" -ForegroundColor Gray
}
Write-Host ""

# Test 5: Verificar headers de seguridad (Helmet)
Write-Host "Test 5: Verificar headers de seguridad (Helmet)" -ForegroundColor Yellow
try {
    $response5 = Invoke-WebRequest -Uri "http://localhost:3000/" `
        -UseBasicParsing `
        -ErrorAction Stop
    
    $headers = $response5.Headers
    Write-Host "✅ Headers recibidos:" -ForegroundColor Green
    if ($headers.'X-Content-Type-Options') {
        Write-Host "   ✅ X-Content-Type-Options: $($headers.'X-Content-Type-Options')" -ForegroundColor Gray
    }
    if ($headers.'X-Frame-Options') {
        Write-Host "   ✅ X-Frame-Options: $($headers.'X-Frame-Options')" -ForegroundColor Gray
    }
    if ($headers.'X-XSS-Protection') {
        Write-Host "   ✅ X-XSS-Protection: $($headers.'X-XSS-Protection')" -ForegroundColor Gray
    }
} catch {
    Write-Host "⚠️  No se pudieron verificar headers" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "✨ Pruebas completadas!" -ForegroundColor Cyan
