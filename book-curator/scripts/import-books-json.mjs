#!/usr/bin/env node
// 프로젝트 루트 books.json(기획 데이터)을 앱 카탈로그 형식으로 변환해 병합합니다.
// 기존 도서 ID와 퀴즈 연결은 유지하고, 제목+저자가 겹치지 않는 책만 추가합니다.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE = join(ROOT, "books.json");
const TARGET = join(ROOT, "lib", "data", "books.json");

const source = JSON.parse(readFileSync(SOURCE, "utf-8"));
const current = JSON.parse(readFileSync(TARGET, "utf-8"));

const genreMap = {
  "소설": "소설", "판타지": "소설", "휴먼": "소설", "액션": "소설", "가족": "소설", "성장": "소설",
  "자기계발": "자기계발", "실용": "자기계발",
  "에세이": "에세이", "여행": "에세이", "힐링": "에세이",
  "과학": "과학", "역사": "역사", "경제·경영": "경제경영", "경제경영": "경제경영",
  "인문": "인문", "철학": "인문", "사회": "인문", "예술": "인문",
};
const moodMap = {
  "힐링": "위로가 필요해", "감동": "위로가 필요해",
  "자극": "자극이 필요해",
  "집중": "몰입하고 싶어", "깊이 생각하고 싶음": "몰입하고 싶어",
  "가볍게 즐기고 싶음": "가볍게 쉬고 싶어",
  "실용": "성장하고 싶어",
};
const difficultyMap = { "가볍게": 2, "보통": 3, "깊이 읽기": 4 };
const norm = (value) => String(value || "").toLowerCase().replace(/[\s·:\-–—()\[\]『』《》"']/g, "");
const keyOf = (book) => `${norm(book.title)}|${norm(book.author)}`;
const seen = new Set(current.map(keyOf));
const added = [];
let skipped = 0;

for (const book of source) {
  const key = keyOf(book);
  if (!book.title || !book.author || seen.has(key)) { skipped += 1; continue; }
  const genres = [...new Set((book.genre || []).map((g) => genreMap[g]).filter(Boolean))];
  const moods = [...new Set((book.mood_tags || []).map((m) => moodMap[m]).filter(Boolean))];
  if (!genres.length || !moods.length || !difficultyMap[book.difficulty]) {
    throw new Error(`${book.id || book.title}: 장르·기분·난이도 변환값을 확인하세요.`);
  }
  const id = `bk_${String(current.length + added.length + 1).padStart(3, "0")}`;
  added.push({
    id,
    title: book.title.trim(),
    author: book.author.trim(),
    genres,
    pages: Number(book.pages),
    difficulty: difficultyMap[book.difficulty],
    mood_tags: moods,
    themes: [...new Set([...(book.genre || []), ...(book.mood_tags || [])])].slice(0, 5),
    series_next: null,
    description: book.description || "",
  });
  seen.add(key);
}

writeFileSync(TARGET, `${JSON.stringify([...current, ...added], null, 2)}\n`, "utf-8");
console.log(`기존 ${current.length}권 유지 · 신규 ${added.length}권 추가 · 중복/누락 ${skipped}권 제외 · 총 ${current.length + added.length}권`);
