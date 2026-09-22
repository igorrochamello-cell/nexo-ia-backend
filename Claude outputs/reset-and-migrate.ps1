#!/usr/bin/env pwsh

# =====================================================
# RESET COMPLETO - PipeNexo
# Limpa todos os dados e aplica migrações
# =====================================================

$crmPath = "C:\Users\igor__\OneDrive\Documentos\CRM - SEGUROS\nexo-ia-backend"
$backendPath = $crmPath

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RESETANDO PIPENEXO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se está no diretório correto
if (!(Test-Path "$backendPath\package.json")) {
    Write-Host "❌ Erro: package.json não encontrado em $backendPath" -ForegroundColor Red
    Write-Host "Verifique o caminho e tente novamente." -ForegroundColor Red
    exit 1
}

Write-Host "📁 Backend path: $backendPath" -ForegroundColor Yellow

# 1. Resetar banco de dados (TRUNCATE all tables)
Write-Host ""
Write-Host "1️⃣  Limpando banco de dados..." -ForegroundColor Cyan
cd $backendPath

# Criar script SQL inline que trunca tudo
$resetSql = @"
TRUNCATE TABLE timeline_events RESTART IDENTITY CASCADE;
TRUNCATE TABLE commissions RESTART IDENTITY CASCADE;
TRUNCATE TABLE health_requests RESTART IDENTITY CASCADE;
TRUNCATE TABLE endorsements RESTART IDENTITY CASCADE;
TRUNCATE TABLE claims RESTART IDENTITY CASCADE;
TRUNCATE TABLE renewals RESTART IDENTITY CASCADE;
TRUNCATE TABLE deals RESTART IDENTITY CASCADE;
TRUNCATE TABLE policies RESTART IDENTITY CASCADE;
TRUNCATE TABLE pipeline_stages RESTART IDENTITY CASCADE;
TRUNCATE TABLE pipelines RESTART IDENTITY CASCADE;
TRUNCATE TABLE tasks RESTART IDENTITY CASCADE;
TRUNCATE TABLE users RESTART IDENTITY CASCADE;
TRUNCATE TABLE clients RESTART IDENTITY CASCADE;
TRUNCATE TABLE companies RESTART IDENTITY CASCADE;
TRUNCATE TABLE ia_usage_logs RESTART IDENTITY CASCADE;
"@

# Usar psql para executar o reset (se disponível)
$env:PGPASSWORD = "nexodev123"
$psqlResult = psql -h localhost -U postgres -d nexo_ia_dev -c "$resetSql" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Banco de dados limpo com sucesso!" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Não foi possível limpar via psql. Tentando via npm..." -ForegroundColor Yellow
    # Fallback: usar o script db:reset do npm (vai fazer seed também, mas tudo bem)
    npm run db:reset 2>&1 | Select-Object -First 20
}

Write-Host ""
Write-Host "2️⃣  Aplicando migrações..." -ForegroundColor Cyan
npm run db:migrate 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Migrações aplicadas!" -ForegroundColor Green
} else {
    Write-Host "   ❌ Erro ao aplicar migrações!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✅ SISTEMA RESETADO E PRONTO!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Status:" -ForegroundColor Cyan
Write-Host "   • Banco de dados: ZERADO" -ForegroundColor Green
Write-Host "   • Migrações: APLICADAS" -ForegroundColor Green
Write-Host "   • Próximo: Fazer login e testar as 4 features" -ForegroundColor Yellow
Write-Host ""
Write-Host "🚀 Para iniciar o backend:" -ForegroundColor Cyan
Write-Host "   npm run dev" -ForegroundColor Yellow
Write-Host ""
