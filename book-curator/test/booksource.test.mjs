// test/booksource.test.mjs — 외부 API 어댑터 정규화·병합·폴백 검증 (네트워크 불필요)
import { normalizeKakao, normalizeAladin, pickIsbn13, mergeExternal, matchCatalog, searchUnified, activeSource } from "../lib/booksource.js";

let pass = 0, fail = 0;
const ok = (cond, name) => { cond ? pass++ : (fail++, console.error("  ✗", name)); if (cond) console.log("  ✓", name); };

// 1) 카카오 응답 정규화 (실제 응답 형태의 픽스처)
{
  const doc = { title: "아몬드", authors: ["손원평"], isbn: "8954651134 9788954651134", thumbnail: "https://img/almond.jpg", publisher: "창비" };
  const n = normalizeKakao(doc);
  ok(n.isbn === "9788954651134" && n.author === "손원평" && n.pages === null, "카카오 정규화: ISBN13 추출·저자 결합·쪽수 null");
}

// 2) 알라딘 응답 정규화
{
  const it = { title: "불편한 편의점", author: "김호연 (지은이)", isbn13: "9791161571188", cover: "https://img/store.jpg", publisher: "나무옆의자", subInfo: { itemPage: 268 } };
  const n = normalizeAladin(it);
  ok(n.author === "김호연" && n.isbn === "9791161571188" && n.pages === 268, "알라딘 정규화: (지은이) 제거·isbn13·itemPage");
}
ok(pickIsbn13("8996991341 9788996991342") === "9788996991342", "ISBN 문자열에서 13자리만 추출");

// 3) 카탈로그 매칭: 제목+저자 근사 매칭 (ISBN 없이도)
{
  const m = matchCatalog({ title: "달러구트 꿈 백화점", author: "이미예" });
  ok(m?.id === "bk_003", "외부 결과 ↔ 카탈로그 제목·저자 매칭 (bk_003)");
  const none = matchCatalog({ title: "존재하지 않는 책 제목", author: "아무개" });
  ok(none === null, "미등록 도서는 매칭 안 됨");
}

// 4) 병합: 카탈로그 매칭이 앞에, 외부 전용은 external 플래그
{
  const ext = [
    { title: "아몬드", author: "손원평", isbn: null, cover: "c1" },
    { title: "완전히 새로운 외부 책", author: "신간작가", isbn: "9790000000001", cover: "c2" },
  ];
  const merged = mergeExternal(ext, [], 8);
  ok(merged[0].id === "bk_002" && merged[0].hasQuiz === true && merged[0].cover === "c1", "매칭된 외부 결과 → 카탈로그 id·퀴즈 가능·표지 유지");
  ok(merged[1].external === true && merged[1].isbn === "9790000000001", "미등록 외부 결과 → external 플래그");
}

// 5) 소스 전환·폴백: 키 없이 kakao 지정 → 로컬 폴백 + 안내
{
  ok(activeSource() === "local", "기본 소스는 local");
  process.env.BOOK_SOURCE = "kakao"; delete process.env.KAKAO_REST_API_KEY;
  const r = await searchUnified("아몬드", 8);
  ok(r.source === "local" && r.notice && r.results[0]?.id === "bk_002", "kakao 키 없음 → 로컬 폴백 + notice");
  process.env.BOOK_SOURCE = "local";
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
