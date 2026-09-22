# PipeNexo: GitHub Cleanup + Git Push (Automático)
# Script que deleta repos antigos e faz push para GitHub

Write-Host "╔════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   PipeNexo: Limpeza GitHub + Push Automático       ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Navega para a pasta do projeto
$projectPath = "C:\Users\igor__\OneDrive\Documentos\CRM - SEGUROS"
Write-Host "📁 Pasta do projeto: $projectPath" -ForegroundColor Yellow

# Verifica se GitHub CLI está instalado
Write-Host ""
Write-Host "🔍 Verificando GitHub CLI..." -ForegroundColor Blue
$ghInstalled = gh --version 2>$null
if (-not $ghInstalled) {
    Write-Host "❌ GitHub CLI não instalado. Faça download em: https://cli.github.com/" -ForegroundColor Red
    exit 1
}
Write-Host "✅ GitHub CLI encontrado" -ForegroundColor Green

# Verifica autenticação GitHub
Write-Host ""
Write-Host "🔑 Verificando autenticação GitHub..." -ForegroundColor Blue
gh auth status 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Não autenticado. Abrindo login..." -ForegroundColor Yellow
    gh auth login --web
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Falha na autenticação. Tente novamente." -ForegroundColor Red
        exit 1
    }
}
Write-Host "✅ Autenticado com sucesso" -ForegroundColor Green

# Obter username do GitHub
$username = gh api user --jq '.login' 2>$null
Write-Host "👤 Usuário: $username" -ForegroundColor Cyan

# Lista de repositórios a deletar
$reposToDelete = @("Nexo", "NEXO.", "sistemacota-o")

Write-Host ""
Write-Host "🗑️  Deletando repositórios antigos..." -ForegroundColor Red
Write-Host ""

foreach ($repo in $reposToDelete) {
    Write-Host "  Deletando: $repo..." -ForegroundColor Yellow
    $fullRepoName = "$username/$repo"

    # Deleta o repo usando GitHub CLI
    gh repo delete $fullRepoName --confirm 2>$null

    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Deletado: $repo" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Não encontrado ou erro: $repo (pulando...)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "📤 Configurando Git e fazendo push..." -ForegroundColor Blue
Write-Host ""

# Vai para a pasta do projeto
Set-Location $projectPath

# Verifica se é um repositório git
if (-not (Test-Path ".git")) {
    Write-Host "❌ Não é um repositório git. Execute 'git init' primeiro." -ForegroundColor Red
    exit 1
}

# Configura remote
$remoteUrl = "https://github.com/$username/pipenexo.git"
Write-Host "🔗 Remote URL: $remoteUrl" -ForegroundColor Cyan

# Remove remote antigo se existir
git remote remove origin 2>$null

# Adiciona novo remote
git remote add origin $remoteUrl
Write-Host "✅ Remote 'origin' configurado" -ForegroundColor Green

# Muda branch para main
git branch -M main 2>$null
Write-Host "✅ Branch renomeado para 'main'" -ForegroundColor Green

# Faz o push
Write-Host ""
Write-Host "📤 Enviando código para GitHub..." -ForegroundColor Blue
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ SUCESSO! Código enviado para GitHub" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Resumo:" -ForegroundColor Cyan
    Write-Host "  • Repositórios deletados: $($reposToDelete.Count)"
    Write-Host "  • Novo repositório: pipenexo"
    Write-Host "  • URL: https://github.com/$username/pipenexo"
    Write-Host "  • Branch: main"
    Write-Host ""
    Write-Host "🚀 Próximos passos:" -ForegroundColor Yellow
    Write-Host "  1. Conectar Vercel ao repositório"
    Write-Host "  2. Configurar variáveis de ambiente"
    Write-Host "  3. Fazer deploy"
} else {
    Write-Host "❌ Erro ao fazer push. Tente manualmente:" -ForegroundColor Red
    Write-Host "  git push -u origin main" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "✨ Script finalizado!" -ForegroundColor Green
