# Mathemagic – zoznam úloh

Všetko, čo Lukáš zadal. Stav: ✅ hotové a overené v hre · 🟡 hotové, neoverené alebo čiastočne · ⬜ neurobené.
Nič z toho ešte nie je nahrané na server (čaká na „nahraj“).

## ⬜ Neurobené
1. **Zátvorky, zlomok (/), odmocnina (√)** do ruksaku (nové tlačidlá kalkulačky).
2. **Brány na presné číslo** – „otvor ma kúzlom za presne 12“.
3. **Vylepšiť ikonky.**
4. **Nahrať na server** (keď povieš „nahraj“).

## 🟡 Hotové, neoverené alebo čiastočne
6. **Mobil** – nič z nového neskúšané na telefóne.
8. **Salva znamienok a kritický zásah** – overené číslami (damage, krit ×2), vzhľad letu som v náhľade nezachytil.

## ✅ Hotové
- **Obchod = samostatná obrazovka** (Lukáš: interiér bez fakieľ, zvlášť screen): pri dverách sa otvorí, po odchode stojíš pred dverami.
- **Majster ako roguelite:** hordy prichádzajú zo 13–16 m a idú po tebe; veľkosť 2 + ⌊0,8·vlna⌋ + (zóna−1) (max 12), interval max(16, 38 − 2·vlna) s, druhy sa pritvrdzujú; každá 3. porazená horda = karta. V boji sa dá hýbať (WASD), bandy ťa zacítia z 10 m.
- **Kniha kúziel (Majster) namiesto ruksaku:** vľavo zápis kúziel (riadky) a 4 miesta na efekty, vpravo kalkulačka; ide aj z klávesnice (čísla, + - * /, Backspace, Enter).
- **Efekty pre Majstra (karty, len 4 miesta):** Plošný zásah, Otras zeme (omráči), Blesk (každé 2./3. kúzlo udrie 2 ďalších), Násobič, Kritický zásah; Reťaz, Oheň a ďalšie platia ďalej.
- **Mierenie palicou:** kúzelník sa otáča za myšou, ruka s palicou sa vystiera podľa vzdialenosti myši (palica mimo klobúka).
- **Ruksak = skutočná kalkulačka** (Calculate It): displej s kúzlami, klasická klávesnica 7 8 9 / 4 5 6 / 1 2 3 / 0, znamienka vpravo, □ ( ) √, C ⌫ =; nevlastnené klávesy zamknuté, viac kusov = odznak s počtom; po čísle sa dá len znamienko a naopak.
- **Majster na PC:** klik = vždy kúzlo (aj mimo súboja), kúzelník sa po kliku nehýbe, pohyb WASD / šípky.
- **Pokojnejšia palica:** chôdza a zosielanie zmiešané 50 : 50 s pokojným postojom.
- **Salva znamienok:** zo vzorca vyletí každé znamienko ako samostatný znak vo svojej farbe, krátko po sebe; damage pri dopade ako číslo. Kritický zásah ×2 = väčšie znamienka + „KRITICKÝ ×2“.
- **Karty pre Majstra:** Násobič (×1,5 / ×2) a Kritický zásah (18 / 30 %); karty Mráz a Zlatá ruka sa ponúkajú len Učňovi.
- **Kúzlo = matematické znamienko** (+ − × ÷) vo farbe živlu, natočené ku kamere, so stopou živlu (kamienky, kvapky, plamene, vír) – v hre aj v intre.
- **Ruksak = kalkulačka:** displej (každé kúzlo je riadok so vzorcom a výsledkom), tlačidlá (nájdené diely), C a =.
- **Viac kúziel (max 3)** – striedajú sa v súboji v poradí, displej ukazuje aktuálne a ďalšie; nové miesto na kúzlo z koristi alebo z obchodu.
- **Kombá:** zásahy do 2,5 s po sebe +15 % za každý; ľad + oheň = para ×2; zem + vzduch = výbuch ×1,5.
- **Lepšia palica** (obchod, max 3): kratšie nabíjanie.
- **Svetlo palice** nad klobúkom, nekýve sa s chôdzou; čarodejník sám od palice tieň nevrhá; v noci mesiac bez tieňov.
- Kratšia palica (menej prechádza cez klobúk).
- **Učeň:** × a ÷ od zóny 2 (vodcovia dávajú − × ÷ v poradí), rýchla odpoveď = dvojnásobný zásah.
- Súboj s kamerou bližšie.
- Režimy **Učeň** (vľavo, deň) a **Majster** (vpravo, noc): výber s plynulým prechodom deň ↔ noc podľa myši a paralaxou.
- **Úvod Majstra** (ako Magicraft): ruksak → 1 + 1 → strašiak na rozohriatie → truhlica s 2 → výmena → bandy. Overené celé.
- **Majster v súboji nepočíta:** klik = výstrel kúzla z ruksaku tam, kam mieriš (vedľa = dopadne na zem), nabíjanie podľa dĺžky vzorca, sila efektu a svetla podľa výsledku.
- Ruksak bez preblikávania, drag & drop, vybratý diel nechá prázdne políčko (vzorec sa nerozsype).
- Kúzlo už neletí cez klobúk; palica v noci vrhá tiene; tiene sa počítajú raz za snímok (výkon).
- Intro: čarodejník strieľa tam, kde je myš.
- Mŕtvy nepriateľ sa rozpadne na iskry (nejde pod zem).
- Znamienko kúzla v noci bez tmavého štvorca okolo.
- Intro ako živá scéna: čarodejník vľavo dookola zosiela 4 živly so znamienkami, logo vpravo; rovnaká scéna za menu; HUD skrytý.
- Výkon: svet rozdelený na 9 oblastí (kreslí sa len to, čo vidno), pevná zásoba svetiel (žiadne prekompilovanie pri kúzle), strop na počet pixelov. Snímok ~5–6 ms.
- Noc (Pokročilý) a deň (Základ); ohne pri táboroch; v noci bez tmavého lemu (stroke) okolo malých vecí; častice bez čierneho fľaku.
- Palica žiari vo farbe živlu (Pokročilý: prvé znamienko vzorca, Základ: zem).
- Do skál, stromov a kríkov sa nedá vojsť; 120 svetov otestovaných – všetky celé priechodné.
- Ruksak: začiatok 1 + 1, pevné čísla sa nikdy nemenia, nevypočítateľný vzorec je odmietnutý; kocka □ = náhodné číslo; mínus od vodcu rovno do ruksaku.
- Palica už pri chôdzi nejde cez klobúk (beh nahradený rýchlou chôdzou).
- Celý beh overený: bandy → kľúče → brána vodcu → vodca → odmena → zóna 2.
- Obchod (bývalá krčma) v tmavom režime.
- Klobúk a plášť tmavé, plášť veje; palica nesvieti na samotného čarodejníka.
- Čierna podľa jedného pravidla svetla; veci nestmavnú pri priblížení.
- Otvorený svet, bandy zo vzorca, nepriatelia menší.
- UI kit, karty s obrázkami z Gemini, nové UI v hre.
