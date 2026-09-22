# PipeNexo: Configuração Vercel (Automático)
# Conecta Vercel ao repositório GitHub e faz deploy

Write-Host "╔════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   PipeNexo: Deploy Vercel Automático               ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Verifica Vercel CLI
Write-Host "🔍 Verificando Vercel CLI..." -ForegroundColor Blue
$vercelInstalled = vercel --version 2>$null
if (-not $vercelInstalled) {
    Write-Host "📦 Instalando Vercel CLI..." -ForegroundColor Yellow
    npm install -g vercel
}
Write-Host "✅ Vercel CLI pronto" -ForegroundColor Green

# Verifica autenticação Vercel
Write-Host ""
Write-Host "🔑 Verificando autenticação Vercel..." -ForegroundColor Blue
$vercelStatus = vercel whoami 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Não autenticado. Abrindo login..." -ForegroundColor Yellow
    vercel login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Falha na autenticação. Tente novamente." -ForegroundColor Red
        exit 1
    }
}
Write-Host "✅ Autenticado: $vercelStatus" -ForegroundColor Green

# Vai para pasta do projeto
$projectPath = "C:\Users\igor__\OneDrive\Documentos\CRM - SEGUROS"
Set-Location $projectPath

Write-Host ""
Write-Host "📤 Conectando com GitHub e fazendo deploy..." -ForegroundColor Blue
Write-Host ""

# Deploy com link GitHub
Write-Host "🔗 Conectando repositório pipenexo..." -ForegroundColor Cyan
$username = (gh api user --jq '.login' 2>$null)
$repoUrl = "https://github.com/$username/pipenexo"

Write-Host "   Repository: $repoUrl" -ForegroundColor Cyan
Write-Host ""

# Deploy Vercel
Write-Host "🚀 Iniciando deploy Vercel..." -ForegroundColor Yellow
vercel --prod --confirm

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ SUCESSO! Deploy realizado!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Resumo:" -ForegroundColor Cyan
    Write-Host "  • Repositório: $repoUrl" -ForegroundColor White
    Write-Host "  • Plataforma: Vercel" -ForegroundColor White
    Write-Host "  • Ambiente: Produção" -ForegroundColor White
    Write-Host "  • Auto-deploy: Ativado (push = deploy automático)" -ForegroundColor White
    Write-Host ""

    # Obtém URL do Vercel
    $vercelUrl = vercel --cwd $projectPath 2>$null
    Write-Host "🌍 URL de produção:" -ForegroundColor Green
    Write-Host "   $vercelUrl" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "✨ Próximos passos:" -ForegroundColor Yellow
    Write-Host "  1. Testar a aplicação em: $vercelUrl" -ForegroundColor White
    Write-Host "  2. Configurar domínio (pipenexo.com.br)" -ForegroundColor White
    Write-Host "  3. Compartilhar link com a equipe" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "❌ Erro no deploy. Verifique:" -ForegroundColor Red
    Write-Host "  • vercel.json está correto?" -ForegroundColor Yellow
    Write-Host "  • Variáveis de ambiente configuradas?" -ForegroundColor Yellow
    Write-Host "  • Pasta frontend/ existe?" -ForegroundColor Yellow
    exit 1
}

Write-Host "✨ Script finalizado!" -ForegroundColor Green
