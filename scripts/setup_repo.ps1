<#
.SYNOPSIS
  初回だけ使う：このフォルダをビルド・テストし、GitHub の空のリポジトリに push します。
  Windows PowerShell 5.1 で動作します（PowerShell 7 でも可）。

.EXAMPLE
  リポジトリのフォルダで次を実行します。
  powershell -ExecutionPolicy Bypass -File scripts\setup_repo.ps1 -Remote https://github.com/ユーザー名/リポジトリ名.git
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Remote
)

# 外部コマンド（git など）は進捗を標準エラーに出すため、エラーでは止めず終了コードで判定する
$ErrorActionPreference = 'Continue'
# 注意: [Console]::OutputEncoding を UTF-8 に変えると、古いコンソールで書き込みエラー 0x1F になるため変更しない。

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Fail([string]$Message) {
    Write-Host ""
    Write-Host "エラー: $Message" -ForegroundColor Red
    exit 1
}

function Run([string]$Title, [string]$Exe, [string[]]$Arguments) {
    Write-Host "== $Title" -ForegroundColor Cyan
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { Fail "$Title に失敗しました（終了コード $LASTEXITCODE）" }
}

function Test-Command([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

# ---- 必要なツールの確認 -------------------------------------------------
if (-not (Test-Command 'git'))  { Fail 'git が見つかりません。https://git-scm.com/ からインストールしてください。' }
if (-not (Test-Command 'node')) { Fail 'Node.js が見つかりません。https://nodejs.org/ から LTS 版をインストールしてください。' }

# Python 3 を探す（py -3 → python → python3）。Microsoft Store の仮の python.exe は除外される
$PyExe = $null; $PyPre = @()
foreach ($cand in @(@('py', '-3'), @('python'), @('python3'))) {
    $exe = $cand[0]; $pre = @($cand | Select-Object -Skip 1)
    if (-not (Test-Command $exe)) { continue }
    $ver = & $exe @pre --version 2>$null
    if ($LASTEXITCODE -eq 0 -and "$ver" -match 'Python 3') { $PyExe = $exe; $PyPre = $pre; break }
}
if (-not $PyExe) { Fail 'Python 3 が見つかりません。https://www.python.org/ からインストールしてください（インストール時に「Add python.exe to PATH」にチェック）。' }
Write-Host ("Python: {0} {1}" -f $PyExe, ($PyPre -join ' '))

# git のユーザー名とメールアドレス
$gitName = (& git config user.name) | Out-String
$gitMail = (& git config user.email) | Out-String
if (-not $gitName.Trim() -or -not $gitMail.Trim()) {
    Fail ('git のユーザー名かメールアドレスが未設定です。次を実行してからやり直してください。' + "`n" +
          '  git config --global user.name  "あなたの名前"' + "`n" +
          '  git config --global user.email "GitHub に登録したメールアドレス"')
}

# ---- ビルドとテスト -----------------------------------------------------
Run 'ビルド'               $PyExe  ($PyPre + @((Join-Path 'scripts' 'build.py')))
Run 'ビルド結果の確認'     'node'  @((Join-Path 'tests' 'check_html.js'))
Run '正しさのテスト（短縮版）' 'node' @((Join-Path 'tests' 'verify.js'), '--quick')

# ---- git の初期化と push ------------------------------------------------
if (-not (Test-Path '.git')) {
    & git init -b main
    if ($LASTEXITCODE -ne 0) {
        # 古い git（2.28 未満）は -b に対応していない
        Run 'git init' 'git' @('init')
        Run 'main ブランチの作成' 'git' @('checkout', '-b', 'main')
    }
} else {
    Write-Host '== .git は既にあるので git init は省略します' -ForegroundColor Cyan
}

Run 'ファイルの追加' 'git' @('add', '.')
& git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    Run 'コミット' 'git' @('commit', '-m', '駅レーダー圏マップ: 初回コミット')
} else {
    Write-Host '== コミットする変更はありません' -ForegroundColor Cyan
}

$existing = (& git remote) -split "`r?`n"
if ($existing -contains 'origin') {
    Run 'リモートの更新' 'git' @('remote', 'set-url', 'origin', $Remote)
} else {
    Run 'リモートの登録' 'git' @('remote', 'add', 'origin', $Remote)
}
Run 'GitHub への push' 'git' @('push', '-u', 'origin', 'main')

Write-Host ""
Write-Host 'push しました。' -ForegroundColor Green
Write-Host '1. GitHub のリポジトリで Settings → Pages → Source を「GitHub Actions」にしてください。'
Write-Host '2. Actions の実行が終わると https://<ユーザー名>.github.io/<リポジトリ名>/ で公開されます。'
Write-Host '3. このフォルダで Claude Code を起動し、HANDOFF.md の引継プロンプトを貼り付けてください。'
