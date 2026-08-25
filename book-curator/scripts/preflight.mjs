#!/usr/bin/env node
// 배포 전 점검: 카카오 단일 소스 보장, 퀴즈 제거, 시크릿 스캔, 환경변수 안내
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const errors = [];
const err = (message) => errors.push(message);

// 런타임 코드가 로컬 도서 파일이나 제거된 인증 기능을 다시 참조하지 못하게 막습니다.
const runtimeFiles = [
  "app.js",
  "index.html",
  "api/books.js",
  "api/recommend.js",
  "api/room.js",
  "api/bookclub.js",
  "lib/booksource.js",
  "lib/recommendation.js",
  "lib/llm.js",
  "lib/store.js",
];
const bannedPatterns = [
  [/books?\.json/i, "로컬 도서 JSON 참조"],
  [/quizzes?\.json/i, "로컬 퀴즈 JSON 참조"],
  [/[\/]api[\/]quiz|\/api\/quiz/i, "퀴즈 API 참조"],
  [/from\s+["']\.\/?(?:catalog|engine)\.js["']/i, "삭제된 로컬 카탈로그 참조"],
  [/BOOK_SOURCE|BOOKS_PROVIDER/, "도서 소스 전환 환경변수 참조"],
];
for (const name of runtimeFiles) {
  const path = join(ROOT, name);
  if (!existsSync(path)) {
    err(`필수 런타임 파일 누락: ${name}`);
    continue;
  }
  const text = readFileSync(path, "utf8");
  for (const [pattern, label] of bannedPatterns) {
    if (pattern.test(text)) err(`${name}: ${label}가 남아 있습니다.`);
  }
}
if (existsSync(join(ROOT, "api", "quiz.js"))) err("api/quiz.js가 남아 있습니다.");

const source = readFileSync(join(ROOT, "lib", "booksource.js"), "utf8");
if (!source.includes("dapi.kakao.com/v3/search/book")) err("카카오 도서 API 엔드포인트가 없습니다.");
if (!source.includes("KAKAO_REST_API_KEY")) err("카카오 REST API 키 환경변수 검사가 없습니다.");

// 저장소에 서버 키가 실수로 들어갔는지 확인합니다.
const secretPatterns = [
  [/sk-[A-Za-z0-9_-]{20,}/g, "OpenAI 형태 키"],
  [/eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/g, "JWT 형태 키"],
  [/KakaoAK\s+[A-Za-z0-9_-]{20,}/g, "카카오 인증 헤더 형태"],
];
const skipDirs = new Set(["node_modules", ".git", ".vercel", "stitch_custom_web_design_and_functionality"]);
const skipFiles = new Set([".env", ".env.local", "package-lock.json", "pnpm-lock.yaml"]);
function scan(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (!skipDirs.has(name)) scan(path);
      continue;
    }
    if (skipFiles.has(name) || stat.size > 1_000_000) continue;
    let text;
    try { text = readFileSync(path, "utf8"); } catch { continue; }
    for (const [pattern, label] of secretPatterns) {
      if (pattern.test(text)) err(`시크릿 의심: ${relative(ROOT, path)}에 ${label} 패턴 발견`);
      pattern.lastIndex = 0;
    }
  }
}
scan(ROOT);

const gitignore = existsSync(join(ROOT, ".gitignore")) ? readFileSync(join(ROOT, ".gitignore"), "utf8") : "";
if (!gitignore.split(/\r?\n/).some((line) => line.trim() === ".env")) err(".gitignore에 .env가 없습니다.");

const envState = ["KAKAO_REST_API_KEY", "SUPABASE_URL", "SUPABASE_SECRET_KEY", "OPENAI_API_KEY"]
  .map((key) => `  ${process.env[key] ? "●" : "○"} ${key}`)
  .join("\n");

console.log("카카오 단일 도서 소스 · 수동 진도 레이스 구조 검사 완료");
console.log(`환경변수 (값은 표시하지 않음):\n${envState}`);
if (errors.length) {
  console.error(`\n✗ 오류 ${errors.length}건:`);
  errors.forEach((message) => console.error(`  - ${message}`));
  process.exit(1);
}
console.log("\n✓ preflight 통과 — 제출/배포 가능 상태");
