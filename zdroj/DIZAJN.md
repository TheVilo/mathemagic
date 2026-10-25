# Mathemagic – herný dizajn (hordovka roguelike)

Stav 25. 10. 2026. Inšpirácie: Vampire Survivors (hordy, kryštály, zberačky), Brotato (vlny, obchod, ekonomika), Magicraft (palice so slotmi a manou). Cieľ: každé rozhodnutie je matematické, hra graduje, ale dá sa prejsť.

## 1. Jadro hry (čo robí hráč)
- **Hýbe sa a uhýba** (dash). Streľba je automatická – ako vo Vampire Survivors.
- **Rozhoduje pri úrovni a u obchodníka**: čo vloží do palice a v akom poradí. Tu je matematika.
- **Prežije zónu** (10 hôrd → vodca zóny) a postúpi do ďalšieho prostredia (Les → Hory → Dungeon → Sopka).

## 2. Palica = kalkulačka (návrh na prerobenie, podľa Magicraftu)
Dnes: hráč vyťukáva vzorec z jednotlivých čísel a znamienok → zdĺhavé, prichádzajú „dve čísla“, nie je jasné prečo mínus.

**Návrh – palica so slotmi (moduly):**
- Palica má **rad slotov** (2 až 6 podľa palice), **energiu** (max) a **dobíjanie**.
- **1. slot = základné číslo** (napr. 3). Ďalšie sloty = **operácie** ako karty: `+3`, `×2`, `−2`, `÷2`, `²`, `√`.
- Kalkulačka počíta **zľava doprava, krok za krokom** (ako obyčajná kalkulačka): 3 → +4 → ×2 = 14, ale 3 → ×2 → +4 = 10. **Poradie je hádanka.**
- Každý modul má **číslo aj živel**:
  - `+n` zem – omráči
  - `−n` oheň – odčítané číslo dohorí (nič sa nestratí)
  - `×n` vzduch – odhodí (väčší činiteľ = ďalej)
  - `÷n` voda – rozdelí na n kvapiek
  - `²`, `³`, `!` legendárne – obrovské číslo, drahé na energiu
- **Energia** = súčet cien modulov (+ − 1, × ÷ 2, ² 4, ³ 6, ! 8). Silná palica sa dobíja dlhšie → treba voliť.
- **Viac palíc (Brotato/Magicraft)**: 1 → 2 → 3 palice. Každá strieľa sama so svojím vzorcom a energiou. Komba medzi palicami (rovnaký výsledok ×2, násobok ×1,5) ostávajú.
- Moduly sa dajú **vylepšiť**: dva rovnaké `+3` → `+6` (ako spájanie v Brotate).

## 3. Úroveň a skúsenosti (Vampire Survivors)
- Kryštály z nepriateľov = skúsenosti. Krivka rastie kvadraticky (VS ~8·n²); u nás `8 · 1,45^(L−1)` – overiť, aby úroveň chodila každých ~25–40 s na začiatku a ~60 s neskôr.
- Pri úrovni **3 karty** (zmiešané): nový modul, vylepšenie modulu, karta (pasívny efekt), vzácne palica. Vzácnosti Bežná/Vzácna/Epická/Legendárna.

## 4. Zberačky (Vampire Survivors)
- **Srdce** (lieči 1): 1,2 % z nepriateľa, len keď nemáš plné. ✅ hotové
- **Magnet** (pritiahne všetky kryštály): 0,6 %, vodca hordy vždy. ✅ hotové
- Návrh: **truhlica** z vodcu hordy (náhodný modul), **bomba** (vybuchne na obrazovke) – neskôr.

## 5. Ekonomika (Brotato)
- Mince vzácne: 6 % z nepriateľa, násobok 5 → 35 %; vodca hordy 8 + 2·zóna, vodca zóny 12 + 4·zóna. ✅
- Obchodník 2× za zónu, 3 veci + služba, ceny ako príklady, ceny rastú ×(1 + 0,25·(zóna−1)), zamiešanie 2,3,4…, gumovanie, zámok, úrok 1/10 (max 5). ✅
- Cieľ: za zónu kúpiš **2–3 veci**, nie všetko.

## 6. Gradácia (dá sa prejsť)
- Život nepriateľov ×1,24 za hordu, ×3,3 za zónu; rýchlosť +3,5 % za hordu, +8 % za zónu; hordy častejšie. ✅
- Simulácia (`scena3d/sim-energia.mjs`): ťažko len pred vodcom zóny a vo finále. Pri každej zmene rovnováhy spustiť simuláciu.
- Návrh: **deň/noc** – deň pokojný (menej nepriateľov, zbieranie, obchod), noc ťažká (dvojité hordy).

## 7. Vzhľad (Glagstone)
- 1-bit: čierna + kostená biela, farebné len kúzla (znamienka + − × ÷). Noc v Majstrovi, deň v Učňovi. ✅
- Postavy tmavé s bielym obrysom. Ďalej: postavy v plnom rozlíšení, noví nepriatelia cez img2threejs.

## Poradie práce (návrh)
1. Palica so slotmi (bod 2) – jadro hry.
2. Deň/noc + väčšia mapa.
3. Noví nepriatelia (rýchli malí, pomalí veľkí, strelci) – img2threejs.
4. Trvalý postup medzi behmi (odomykanie palíc a modulov).
