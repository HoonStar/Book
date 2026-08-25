// BookClub UI·인증·완독 레이스 연결의 필수 안전장치 회귀 테스트
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const api = readFileSync(new URL("../api/bookclub.js", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase_bookclub_setup.sql", import.meta.url), "utf8");

let pass = 0;
let fail = 0;
const ok = (condition, name) => {
  condition ? pass++ : (fail++, console.error("  ✗", name));
  if (condition) console.log("  ✓", name);
};

ok(html.includes('id="bookclubScreen"') && html.includes('id="authModal"'), "BookClub 화면과 로그인 모달 제공");
ok(html.includes('id="raceClubSelect"'), "레이스 생성 시 BookClub 연결 선택 제공");
ok(app.includes('action: "join"') && app.includes("active_race_code"), "초대 코드로 BookClub과 연결 레이스 함께 참여");
ok(app.includes('action: "link_race"'), "기존 완독 레이스를 BookClub에 연결 가능");
ok(api.includes("db.auth.getUser(token)"), "서버에서 Supabase access token 검증");
ok(api.includes("mine: vote.user_id === user.id") && !app.includes("vote.user_id === clubState.user.id"), "투표자 UUID를 브라우저에 노출하지 않음");
ok(schema.includes("enable row level security") && schema.includes("revoke all on table"), "북클럽 테이블 RLS 및 브라우저 직접 권한 차단");
ok(schema.includes("club_votes_book_club_idx") && schema.includes("club_book_id, club_id"), "복합 외래키 인덱스 구성");

console.log(`\nBookClub 결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
