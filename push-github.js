/**
 * ATLANTIS AI - Trình tự động cài đặt Git & đẩy dự án lên GitHub
 * Chạy trên Node.js để không bị lỗi bảng mã UTF-8 của Windows cmd.exe
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

function findGitExecutable() {
  try {
    execSync('git --version', { stdio: 'ignore' });
    return 'git';
  } catch (_) {}

  const candidates = [
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files\\Git\\bin\\git.exe',
    'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'cmd', 'git.exe')
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return `"${p}"`;
  }
  return null;
}

function runGit(gitCmd, argsStr) {
  return execSync(`${gitCmd} ${argsStr}`, { stdio: 'inherit', cwd: __dirname });
}

function askQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve((ans || '').trim());
    })
  );
}

async function main() {
  console.log('====================================================================');
  console.log('  ATLANTIS AI - CONG CU TU DONG DAY DU AN LEN GITHUB');
  console.log('====================================================================\n');

  let gitCmd = findGitExecutable();

  if (!gitCmd) {
    console.log('[!] May tinh chua cai Git. Dang tu dong tai va cai dat Git for Windows...');
    console.log('    (Vui long bam "Yes" neu hop thoai quyen Admin hien len)\n');
    try {
      execSync(
        'winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements',
        { stdio: 'inherit' }
      );
    } catch (_) {}
    gitCmd = findGitExecutable();
  }

  if (!gitCmd) {
    console.log('\n[!] Chua tim thay Git sau khi cai. Ban hay tai Git tai: https://git-scm.com/download/win');
    process.exit(1);
  }

  console.log(`[OK] Da tim thay Git: ${gitCmd}\n`);

  if (!fs.existsSync(path.join(__dirname, '.git'))) {
    console.log('-> Dang khoi tao kho luu tru Git (.git)...');
    runGit(gitCmd, 'init');
  }

  // Đảm bảo đã có user.name và user.email để git commit không báo lỗi trên máy mới cài Git
  try {
    execSync(`${gitCmd} config user.name`, { stdio: 'ignore', cwd: __dirname });
  } catch (_) {
    runGit(gitCmd, 'config user.name "Atlantis Developer"');
  }
  try {
    execSync(`${gitCmd} config user.email`, { stdio: 'ignore', cwd: __dirname });
  } catch (_) {
    runGit(gitCmd, 'config user.email "atlantis@users.noreply.github.com"');
  }

  runGit(gitCmd, 'branch -M main');
  console.log('-> Dang dong goi cac file an toan (theo .gitignore)...');
  runGit(gitCmd, 'add .');

  try {
    runGit(gitCmd, 'commit -m "Release ATLANTIS AI Flood Avoidance Web & Android APK v3.8"');
  } catch (_) {
    console.log('-> (Cac file da duoc commit truoc do)');
  }

  let repoUrl = '';
  try {
    repoUrl = execSync(`${gitCmd} remote get-url origin`, { encoding: 'utf8', cwd: __dirname }).trim();
  } catch (_) {}

  if (!repoUrl) {
    console.log('\n--------------------------------------------------------------------');
    console.log('Buoc 1: Mo trinh duyet vao https://github.com/new');
    console.log('Buoc 2: Dat ten Repository (vi du: floodavoid) -> chon Public -> bam Create repository');
    console.log('--------------------------------------------------------------------\n');

    repoUrl = await askQuestion(
      'Dan duong dan GitHub Repo cua ban vao day (VD: https://github.com/ten-ban/floodavoid.git): '
    );
  } else {
    console.log(`-> Dang su dung GitHub Repo da cau hinh: ${repoUrl}`);
  }

  if (!repoUrl) {
    console.log('\n[!] Ban chua nhap duong dan Repo. Hay chay lai PUSH-TO-GITHUB.bat khi da co link!');
    process.exit(0);
  }

  try {
    execSync(`${gitCmd} remote remove origin`, { stdio: 'ignore', cwd: __dirname });
  } catch (_) {}

  runGit(gitCmd, `remote add origin "${repoUrl}"`);
  console.log('\n-> Dang day ma nguon len GitHub...');
  runGit(gitCmd, 'push -u origin main --force');

  console.log('\n====================================================================');
  console.log('  THANH CONG! Ma nguon va file ATLANTIS-AI.apk da len GitHub!');
  console.log('  Hay vao Settings -> Pages tren GitHub, chon nhanh "main" -> Save');
  console.log('====================================================================');
}

main().catch((err) => {
  console.error('\n[Loi]:', err.message || err);
});
