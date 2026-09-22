# Script PowerShell para resetar banco - rodar NO PC DO USUARIO

# Caminho do backend
$backendPath = "C:\Users\igor__\OneDrive\Documentos\CRM - SEGUROS\nexo-ia-backend"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🔄 RESETANDO BANCO DE DADOS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se está no diretório correto
if (!(Test-Path "$backendPath\package.json")) {
    Write-Host "❌ Erro: package.json não encontrado" -ForegroundColor Red
    exit 1
}

Write-Host "📁 Caminho: $backendPath" -ForegroundColor Yellow
Write-Host ""

# Criar arquivo SQL de reset
$resetSql = @"
ALTER TABLE IF EXISTS timeline_events DISABLE TRIGGER ALL;
ALTER TABLE IF EXISTS commissions DISABLE TRIGGER ALL;
ALTER TABLE IF EXISTS health_requests DISABLE TRIGGER ALL;
ALTER TABLE IF EXISTS endorsements DISABLE TRIGGER ALL;
ALTER TABLE IF EXISTS claims DISABLE TRIGGER ALL;
ALTER TABLE IF EXISTS renewals DISABLE TRIGGER ALL;
ALTER TABLE IF EXISTS deals DISABLE TRIGGER ALL;
ALTER TABLE IF EXISTS policies DISABLE TRIGGER ALL;
ALTER TABLE IF EXISTS pipeline_stages DISABLE TRIGGER ALL;
ALTER TABLE IF EXISTS pipelines DISABLE TRIGGER ALL;
ALTER TABLE IF EXISTS tasks DISABLE TRIGGER ALL;
ALTER TABLE IF EXISTS users DISABLE TRIGGER ALL;
ALTER TABLE IF EXISTS clients DISABLE TRIGGER ALL;
ALTER TABLE IF EXISTS companies DISABLE TRIGGER ALL;

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

ALTER TABLE IF EXISTS timeline_events ENABLE TRIGGER ALL;
ALTER TABLE IF EXISTS commissions ENABLE TRIGGER ALL;
ALTER TABLE IF EXISTS health_requests ENABLE TRIGGER ALL;
ALTER TABLE IF EXISTS endorsements ENABLE TRIGGER ALL;
ALTER TABLE IF EXISTS claims ENABLE TRIGGER ALL;
ALTER TABLE IF EXISTS renewals ENABLE TRIGGER ALL;
ALTER TABLE IF EXISTS deals ENABLE TRIGGER ALL;
ALTER TABLE IF EXISTS policies ENABLE TRIGGER ALL;
ALTER TABLE IF EXISTS pipeline_stages ENABLE TRIGGER ALL;
ALTER TABLE IF EXISTS pipelines ENABLE TRIGGER ALL;
ALTER TABLE IF EXISTS tasks ENABLE TRIGGER ALL;
ALTER TABLE IF EXISTS users ENABLE TRIGGER ALL;
ALTER TABLE IF EXISTS clients ENABLE TRIGGER ALL;
ALTER TABLE IF EXISTS companies ENABLE TRIGGER ALL;

SELECT 'RESET CONCLUÍDO!' as status;
"@

# Salvar SQL em arquivo temp
$sqlFile = "$env:TEMP\reset_nexo.sql"
$resetSql | Out-File -FilePath $sqlFile -Encoding UTF8

# Tentar via psql
Write-Host "1️⃣ Tentando via psql..." -ForegroundColor Cyan
$env:PGPASSWORD = "nexodev123"
$output = & psql -h localhost -U postgres -d nexo_ia_dev -f $sqlFile 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Banco resetado com sucesso!" -ForegroundColor Green
    Write-Host ""
    Write-Host "2️⃣ Aplicando migrações..." -ForegroundColor Cyan
    cd $backendPath
    npm run db:migrate 2>&1 | Select-Object -First 20
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "✅ SISTEMA PRONTO PARA TESTES!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "❌ Erro ao resetar: $output" -ForegroundColor Red
    exit 1
}

# Limpar arquivo temp
Remove-Item $sqlFile -Force -ErrorAction SilentlyContinue
