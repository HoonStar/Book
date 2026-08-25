#!/usr/bin/env node
// scripts/import-aladin.mjs — 알라딘 Open API로 도서 메타데이터를 수집해
// books.json에 붙여넣을 수 있는 항목(JSON)으로 변환합니다.
//
// 준비: 알라딘 홈페이지 로그인 → https://www.aladin.co.kr/ttb/wblog_manage.aspx 에서 TTB 키 발급
// 실행(PowerShell):
//   $env:ALADIN_TTB_KEY="ttb키"; node scripts/import-aladin.mjs --query "불편한 편의점" --start-id 33
//   $env:ALADIN_TTB_KEY="ttb키"; node scripts/import-aladin.mjs --isbn 9791161571188 --isbn 9788954429900 --out import.json
//
// 출력 항목에서 사람이 채워야 하는 것: difficulty(1~5), mood_tags(허용 5종), themes
// "_"로 시작하는 필드(검토용 메모)는 books.json에 병합하기 전에 삭제하세요. (npm run preflight가 검사)
import { writeFileSync } from "node:fs";

const KEY = process.env.ALADIN_TTB_KEY;
const BASE = "https://www.aladin.co.kr/ttb/api";
const COMMON = "output=js&Version=20131101&Cover=None";

// 알라딘 분류명 → 서비스 장르 enum 매핑 (앞에서부터 첫 일치 사용)
const GENRE_MAP = [
  ["추리/미스터리", "추리·스릴러"], ["스릴러", "추리·스릴러"],
  ["소설/시/희곡", "소설"], ["장르소설", "소설"],
  ["에세이", "에세이"], ["자기계발", "자기계발"],
  ["경제경영", "경제경영"], ["과학", "과학"],
  ["역사", "역사"], ["인문학", "인문"], ["인문", "인문"],
];

function parseArgs(argv) {
  const a = { isbns: [], query: null, startId: null, out: null, max: 10 };
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--isbn") a.isbns.push(String(argv[++i]).replace(/[^0-9Xx]/g, ""));
    else if (v === "--query") a.query = argv[++i];
    else if (v === "--start-id") a.startId = parseInt(argv[++i], 10);
    else if (v === "--out") a.out = argv[++i];
    else if (v === "--max") a.max = Math.min(20, parseInt(argv[++i], 10) || 10);
  }
  return a;
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  try {
    return JSON.parse(text.trim());
  } catch {
    throw new Error(`알라딘 응답을 해석할 수 없어요. TTB 키·파라미터를 확인하세요.\n응답 앞부분: ${text.slice(0, 200)}`);
  }
}

const search = (q, max) =>
  getJson(`${BASE}/ItemSearch.aspx?ttbkey=${KEY}&Query=${encodeURIComponent(q)}&QueryType=Keyword&SearchTarget=Book&MaxResults=${max}&start=1&${COMMON}`);
const lookup = (isbn13) =>
  getJson(`${BASE}/ItemLookUp.aspx?ttbkey=${KEY}&itemIdType=ISBN13&ItemId=${isbn13}&OptResult=packing&${COMMON}`);

const cleanAuthor = (s) => {
  const t = String(s || "").trim();
  const m = t.match(/^(.*?)\s*\(지은이\)/);
  return (m ? m[1] : t.split("(")[0]).replace(/,\s*$/, "").trim() || t;
};
const mapGenre = (categoryName) => {
  const c = String(categoryName || "");
  for (const [key, val] of GENRE_MAP) if (c.includes(key)) return { genre: val, sure: true };
  return { genre: "소설", sure: false };
};

function toEntry(item, idNum) {
  const g = mapGenre(item.categoryName);
  const pages = item.subInfo?.itemPage || null;
  return {
    id: idNum ? `bk_${String(idNum).padStart(3, "0")}` : "bk_TODO",
    title: String(item.title || "").split(" - ")[0].trim(),
    author: cleanAuthor(item.author),
    genres: [g.genre],
    pages,
    difficulty: null,           // ← 직접 채우기 (1~5, DATA_GUIDE 기준표)
    mood_tags: [],              // ← 직접 채우기 (허용 5종 문자열 그대로)
    themes: [],
    series_next: null,
    _isbn13: item.isbn13 || null,
    _category: item.categoryName || null,
    _todo: [
      pages ? null : "pages 없음 — 교보/알라딘 상세페이지에서 확인",
      g.sure ? null : `장르 자동매핑 실패(기본값 소설) — 분류: ${item.categoryName}`,
      "difficulty·mood_tags 채우고 '_' 필드 삭제",
    ].filter(Boolean),
  };
}

async function main() {
  if (!KEY) {
    console.error("환경변수 ALADIN_TTB_KEY가 없습니다. 알라딘에서 TTB 키를 발급받아 설정하세요.");
    process.exit(1);
  }
  const args = parseArgs(process.argv);
  let isbns = [...args.isbns];

  if (args.query) {
    const res = await search(args.query, args.max);
    const found = (res.item || []).filter((i) => i.isbn13);
    console.error(`검색 "${args.query}" → ${found.length}건`);
    found.forEach((i) => console.error(`  · ${i.title} — ${cleanAuthor(i.author)} [${i.isbn13}]`));
    isbns.push(...found.map((i) => i.isbn13));
  }
  if (!isbns.length) {
    console.error("사용법: --query \"제목\" 또는 --isbn 9791161571188 (여러 개 가능), 옵션 --start-id 33 --out 파일.json");
    process.exit(1);
  }

  const entries = [];
  let idNum = args.startId;
  for (const isbn of isbns) {
    try {
      const res = await lookup(isbn);
      const item = res.item?.[0];
      if (!item) { console.error(`  ✗ ${isbn}: 조회 결과 없음`); continue; }
      entries.push(toEntry(item, idNum));
      if (idNum) idNum++;
      console.error(`  ✓ ${item.title} (${item.subInfo?.itemPage ?? "쪽수?"}쪽)`);
      await new Promise((r) => setTimeout(r, 250)); // 예의상 호출 간격
    } catch (e) {
      console.error(`  ✗ ${isbn}: ${e.message}`);
    }
  }

  const json = JSON.stringify(entries, null, 2);
  if (args.out) { writeFileSync(args.out, json); console.error(`\n${entries.length}건 → ${args.out} 저장 완료`); }
  else console.log(json);
  console.error("\n다음 단계: difficulty·mood_tags를 채우고 '_' 필드를 지운 뒤 lib/data/books.json 배열에 병합 → npm run preflight");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
