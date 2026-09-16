# Bezpečnostní kontrola před webovým pilotem

Datum: 2026-09-16. Rozsah: frontend React, FastAPI, HTTP/WebSocket rozhraní,
verzované soubory a instalované JS/Python závislosti. Kombinace manuálního
code review a automatizovaných regresních testů. Nejde o penetrační test
nasazené infrastruktury ani o záruku nepřítomnosti zranitelností.
Desktop/Rust integrace není cílem tohoto webového auditu.

## Závěr

Základ autorizace a ochrany relací je implementovaný. **Veřejný provoz ještě
není schválený touto kontrolou:** níže uvedené podmínky nasazení zůstávají otevřené.
Pro uzavřený pilot lze pokračovat výběrem hostingu a konfigurací omezeného provozu.
Provider ani placená služba se v rámci kontroly nepřipojovaly.

## Výsledky podle oblastí

| Oblast | Zjištění a důkaz | Zbývá |
| --- | --- | --- |
| Identita | Argon2id; sjednocená chyba pro neznámý účet/chybné heslo; společný limit login/register. `test_api.py`, `test_rate_limit.py`. | MFA, ověření e-mailu, reset hesla nejsou implementované. Registrace prozrazuje existenci e-mailu přes 409. |
| Oprávnění | Členství kontrolováno pro HTTP i WS; cizí tým vrací 404; správu rolí provádí vlastník. Revokace se kontroluje také před WS broadcastem. | Všechny místnosti jsou dostupné celému týmu; soukromé místnosti nejsou součástí modelu. |
| Relace | Náhodné 256bit bearer tokeny; v DB pouze SHA-256; expirace a okamžité HTTP odhlášení. Web token nepersistuje do browser storage. | Chybí přehled/odvolání všech relací; idle WS revokace se kontroluje periodicky. |
| Vstupy | Pydantic omezuje délky a zakazuje extra pole; SQLAlchemy používá parametry. Nové HTTP limity před parsováním JSON. | DB kvóty doplněny následnou úpravou níže; seznamy nemají stránkování. |
| XSS | React vykresluje hodnoty jako text; regresní test škodlivého názvu/cesty v Conflict Radar. V kontrolovaném src není `dangerouslySetInnerHTML` ani eval. | Webovou CSP musí nastavit hosting; Tauri CSP se na web nevztahuje. |
| Upload | Aplikace nemá endpoint pro upload souborů; sdílí pouze metadata. | Antivirový scanner teď nemá vstup, na kterém by pracoval. Přehodnotit při zavedení uploadu. |
| API a WS | Bearer autorizace všech soukromých HTTP tras, přesné CORS/WS origins; WS limity zpráv a velikosti, kontrola privátních polí. | Edge limit souběhu, handshake a provozu; žádný distribuovaný rate limiter. |
| Přenos | Frontend odmítá ne-loopback HTTP API. API přidává no-store, nosniff, no-referrer a DENY pro framing. | Skutečné TLS, HTTPS redirect, HSTS a hlavičky frontendových odpovědí ověřit až na doméně. |
| Uložená data | Hesla se hashují, session/invite tokeny se neukládají otevřeně. | E-maily a názvy jsou v DB čitelné; šifrování disku/záloh, TLS DB a přístupy určuje provider. |
| Secrets | detect-secrets: ve verzovaných souborech pouze vývojové/testovací hodnoty a Git hashe; auditovaná `.secrets.baseline`. | Celá Git historie nebyla skenována; baseline není povolení přidávat reálné klíče. |
| Závislosti | `npm audit`: 0 známých zranitelností; `pip-audit` nad backend/.venv: žádné známé zranitelnosti. | Výsledek platí k okamžiku skenu, pravidelně opakovat. Rust závislosti mimo rozsah. |
| Logy | Nové pevné události registrace/login/logout a rate limitu neobsahují email, heslo ani token; ověřeno testem. | INFO logger explicitně zapnout v hostingu; sběr, retence, alarmy a audit změn oprávnění ještě chybí. |

## Opravené nálezy

- HTTP tělo dříve nemělo aplikační limit. Nově nejvýše 16 KiB a 10 sekund na
  načtení před JSON parsováním, včetně chunked přenosu a nepravdivého Content-Length.
  To neomezuje počet souběžných spojení; limit na proxy je stále nutný.
- Mimo autentizaci nebyl HTTP rate limit. Nově 120 požadavků/min/IP na proces,
  včetně health a neplatných požadavků, se stavem 429 a Retry-After.
  Auth má navíc původní limit 20/min/IP. Sdílená NAT IP může limit vyčerpat společně.
- Veřejnou registraci nešlo uzavřít konfigurací. Nově
  `DIGITA_REGISTRATION_ENABLED=false` zakáže tvorbu účtů bez změny existujících loginů.
- WS validace cest nepokrývala traversal se zpětnými lomítky a řídicí znaky.
  Nově jsou odmítány; nejde o prokázané čtení souborů, backend cesty neotevírá.
- Chyběly automatické bezpečnostní kontroly v CI a základní auth audit události.

## Podmínky před připojením veřejné domény

1. Nasadit jeden backend proces/worker. Live rooms i rate limit jsou v paměti;
   více procesů by rozdělilo stav a násobilo limity. Restarty jejich stav resetují.
2. Zapnout HTTPS/WSS, přesné frontend origins, důvěru pouze konkrétním proxy IP,
   limity těla/timeoutů/souběhu a WS frame limit 65536 na serveru/proxy.
   Klientské X-Forwarded-For nesmí umožnit podvrhnout IP. Nechat DB neveřejnou,
   vynutit ověřované TLS spojení k vzdálené DB a použít neveřejné heslo.
3. Na frontend hostingu nastavit a ověřit CSP s konkrétními HTTP/WS origins,
   frame-ancestors 'none', object-src 'none', base-uri 'self', nosniff,
   Referrer-Policy, Permissions-Policy a HSTS po zprovoznění HTTPS.
   Otestovat přihlášení, audio i WS s výslednou CSP; univerzální policy zde není nasazena.
4. Pro pilot po onboardingu uzavřít registrace (případně zavést allowlist).
   Bez ověření e-mailu jej nepoužívat jako důkaz identity nebo příslušnosti k organizaci.
   U provider účtů s administrativním přístupem zapnout MFA; aplikační MFA zhodnotit
   před rozšířením pilotu, nejde o již existující funkci aplikace.
5. Nastavit pilotní kvóty podle kapacity providera (implementovány následnou úpravou
   níže včetně úklidu expirací). Doplnit limit souběžných WS spojení na účet/IP.
   Per-minute limiter sám nezastaví postupné zaplnění free-tier databáze
   ani distribuované zahlcení. Nastavit dostupné hard limity/rozpočtové alarmy providera.
6. Nakonfigurovat bezpečné logy a retenci, monitoring 401/403/429/5xx a kapacity.
   Nelogovat request body, Authorization, WS auth rámce ani citlivé query parametry;
   defaultní access log může URL obsahovat. Ověřit zálohu a obnovu DB.
7. Na skutečném stagingu spustit testy v PostgreSQL a prohlížeči, zkontrolovat
   výsledné hlavičky, TLS, CORS, proxy IP a chování při dosažení free-tier limitů.

## Opakování kontrol

Workflow `.github/workflows/security.yml` běží pro PR, push na main/master,
ručně a jednou týdně. Má read-only oprávnění a 15min limit. Provádí locked instalace,
regresní testy, lint, build, prohlížečové testy, dependency a secret scan.
Auditovací nástroje potřebují síť; nedostupná databáze zranitelností není čistý výsledek.
CI nebylo na GitHubu spuštěno v rámci této lokální kontroly.

Lokálně:

```sh
npm ci
npm audit --audit-level=low
npm test
npm run build
cd backend
uv sync --locked
uv run pytest -q
uv run ruff check .
uv run ruff format --check .
cd ..
uv tool run pip-audit --path backend/.venv/lib/python3.12/site-packages --progress-spinner off
git ls-files -z | xargs -0 uv tool run --from detect-secrets==1.5.0 detect-secrets-hook --baseline .secrets.baseline
npm run test:e2e
```

Nové nálezy secrets ručně prověřit; nepřegenerovávat baseline slepě.
Publikovaný skutečný klíč nejdřív odvolat/rotovat, pouhé smazání nestačí.
Nové soubory musí být verzované, aby je CI scanner zahrnul.

Lokální validace: 69 backendových testů (SQLite), 22 frontendových testů,
produkční build a Ruff prošly. Backend má dvě deprecation warnings z testovacího
klienta/AnyIO. PostgreSQL se v tomto běhu netestovalo.

Prohlížeč: všechny 3 E2E testy prošly sériově s limitem 90 sekund. První paralelní
běh měl timeout při screenshotu; spolupráce účtů prošla v obou bězích. CI proto
spouští E2E sériově. Secret hook proti zkontrolované baseline prošel.

## Následná úprava: kvóty a úklid pilotu

Implementován limit 50 účtů, 3 vlastněných / 5 celkových týmů na uživatele,
10 členů / 5 místností / 10 platných pozvánek na tým a 5 relací na uživatele.
Konfigurace a chování při překročení jsou v backend/README.md. Vytváření dat
se serializuje databázovým zámkem; souběžné požadavky nemohou překročit kvótu.
Expirace se uklízejí při startu, každou hodinu a volitelně samostatným CLI.
Aktivní uživatelská data se automaticky nemažou. Infrastrukturní ochrany a
WS limity před autentizací z původního auditu zůstávají otevřené.

Validace následné úpravy: 78 testů na SQLite a 78 na izolovaném PostgreSQL 18.6
(UTF-8), Ruff a kontrola diffu prošly. CI nově opakuje backendovou sadu také
na PostgreSQL 17 podle vývojového Compose; GitHub workflow zde nebyl spuštěn.
