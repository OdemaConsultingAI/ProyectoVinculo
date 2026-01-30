# Cambia "pick 415a577" por "edit 415a577" en el archivo de todo del rebase
$TodoPath = $args[0]
$content = Get-Content $TodoPath -Raw
$content = $content -replace 'pick 415a577', 'edit 415a577'
Set-Content $TodoPath $content -NoNewline
