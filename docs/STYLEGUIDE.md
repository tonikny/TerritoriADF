# Llibre d'estil

Sistema visual de TerritoriADF: què hi ha, per què i com s'usa. La font de veritat
és el codi; aquest document l'explica i no el substitueix.

- **Tokens i base**: `front/src/styles/index.css`
- **Classes compostes** (botons, inputs, quadres, popups): `front/src/styles/uiStyles.ts`
- **Icones**: `front/src/shared/ui/Glyphs.tsx` i `front/src/utils/incidenciaConstants.ts`
- **Regla d'icones**: [`ARCHITECTURE.md`](ARCHITECTURE.md) § 2.3

## 1. Principis

1. **Marca del logo**: verd `#014a1e` i groc `#fed401`. **Cap blau**: ni `#007bff`
   ni utilitats `blue-*`; tampoc a les capes del mapa.
2. **Paper càlid**: fons `#f3f1e6`, targetes blanques, vora d'1 px. L'ombra és
   només per al que flota.
3. **Llegibilitat abans que densitat**: res per sota de 14 px (dues excepcions
   deliberades, § 3). Cos a 500: el 400 de Barlow s'aprima massa a l'exterior.
4. **Tot en `rem`**: «Mida de text» (90–130 %) ha de fer créixer la UI sencera,
   inclosa la barra del bottom sheet.
5. **Mòbil primer**: 393 px és l'amplada de referència; l'escriptori és una
   adaptació a partir de `56rem` (`tb:`).

## 2. Color

Tots viuen a `@theme` d'`index.css` i es fan servir com a utilitats (`bg-primary`,
`text-muted`, `border-soft`…). Mai un color literal en un component.

| Token           | Valor     | Ús                                                    |
| --------------- | --------- | ----------------------------------------------------- |
| `canvas` / `bg` | `#f3f1e6` | fons de pàgina i del panell lateral                   |
| `surface`       | `#ffffff` | targetes, fulls, botons blancs                        |
| `ink`           | `#16241b` | text principal                                        |
| `muted`         | `#47544d` | text secundari, metadades                             |
| `faint`         | `#8a948c` | text terciari                                         |
| `border`        | `#d9d6c6` | vores suaus, separadors                               |
| `border-strong` | `#8f9384` | vora de controls i targetes                           |
| `soft`          | `#eae7d9` | fons suau, `hover` de botons i files                  |
| `primary`       | `#014a1e` | acció, enllaç, pestanya activa                        |
| `primary-hover` | `#013715` | `hover` del verd                                      |
| `accent`        | `#fed401` | senyal: barra de pestanyes, comptadors, cel·la activa |
| `alert`         | `#b3261e` | error, fora de servei, esborrar                       |
| `warn`          | `#9a5b00` | conflicte, revisió, pendent                           |
| `ok`            | `#1f7a4d` | operatiu, sincronitzat, resolt                        |

- **El groc no és text sobre blanc**: només farciment, amb `text-ink` a sobre (o
  `bg-primary` quan el groc és el text, com a la pestanya activa).
- **Estats**: sempre `ok` / `warn` / `alert`, amb el patró `bg-X/10` +
  `border-X/30` + `text-X` per als avisos i `text-X` sol per al text.
- **Prohibit**: colors de la paleta de Tailwind (`red-*`, `orange-*`, `gray-*`,
  `neutral-*`…). Si falta un to, s'afegeix un token, no una utilitat.

## 3. Tipografia

Barlow 400/500/600 per a la UI i IBM Plex Mono 400/500 per a dades. Cos 16 px a
500; els títols, a 600.

| Token              | Mida / línia | Pes | Ús                                           |
| ------------------ | ------------ | --- | -------------------------------------------- |
| `text-[0.8125rem]` | 13 / —       | 600 | **només** etiquetes de la barra de pestanyes |
| `text-xs`          | 14 / 20      | 600 | etiquetes, comptadors, metadades             |
| `text-sm`          | 15 / 21      | 500 | text de formularis i files                   |
| `text-base`        | 16 / 24      | 500 | cos i títols de secció                       |
| `text-lg`          | 18 / 24      | 600 | títols de pantalla                           |
| `text-xl`          | 21 / 26      | 600 | títols grans                                 |
| `text-2xl`         | 26 / 31      | 600 | xifres destacades                            |

- Els títols de secció (`panel-title`, `CollapsibleSection`, capçaleres de node i
  de llista) fan `text-base font-semibold`.
- **No** `text-[…]` per a text: només per a emojis i icones de domini
  (`text-[1.3rem]`, `text-[2.5rem]`).
- Excepcions a la regla de 14 px: etiquetes de pestanya (13 px, si no no hi
  caben les sis) i escala/atribució del mapa (10–12 px, chrome del motor).

## 4. Espai, ràdios i elevació

- **Ràdios**: `rounded-md` (8 px) per a botons, inputs i controls; `rounded-lg`
  (10 px) per a quadres, targetes i llistes; `rounded-xl` (14 px) per al full i
  el panell lateral; `rounded-full` per a barres de progrés i comptadors;
  `rounded-t-lg` a la cel·la activa de la barra.
- **Padding de control**: 10 px horitzontals (`px-2.5`) i 4 px verticals; tots
  els botons i inputs el comparteixen (`buttonPx` a `uiStyles.ts`).
- **Files**: `px-3 py-2` (llista) o `px-3 py-2.5` (llista amb dues línies).
  Seccions: `p-3` dins d'un quadre, `p-4` a la pàgina.
- **Alçada de control**: 32 px (`min-h-8`) per a tot: botons, inputs, selects i
  capçaleres d'acordió. Els quadrats de mapa fan 34 px (`w-8.5 h-8.5`).
- **Elevació** (tokens `shadow-*`): `shadow-control` per a controls i targetes,
  `shadow-panel` per a popups i menús, `shadow-chrome` per a barres fixes i
  `shadow-sheet` per al full. No s'inventen ombres amb `shadow-[…]`.

## 5. Icones

Dues famílies que no es barregen (detall a [`ARCHITECTURE.md`](ARCHITECTURE.md) § 2.3):

- **Domini**: emojis amb significat (tipus d'incidència, prioritat, estat,
  plataforma). Surten de les constants i es pinten igual a totes les vistes.
- **Acció**: SVG de `Glyphs.tsx` (24×24, `currentColor`, traç rodó):
  - `ActionGlyph` → 18 px, traç 2,2, dins de botons.
  - `TabGlyph` → 23 px, traç 2,2, barra de pestanyes.
  - `Glyph` → 20 px, traç 2, controls de mapa i capçaleres.

Mai un emoji en un botó d'acció ni un `<svg>` escrit a mà dins d'un component.

## 6. Components

### Botons (`uiStyles.ts`)

| Classe                 | Alçada | Ús                                      |
| ---------------------- | ------ | --------------------------------------- |
| `primaryButtonClass`   | 32     | acció principal                         |
| `dangerButtonClass`    | 32     | esborrar (ple, `w-full`)                |
| `filledButtonClass`    | 32     | ple amb fons triat (`bg-ok`, `bg-warn`) |
| `secondaryButtonClass` | 32     | acció secundària blanca                 |

| `secondaryTightClass` | 32 | icona + text a 2 px («↓ OSM») |
| `secondaryRowClass` | 32 | com l'anterior, text de 14 px (files) |
| `iconButtonClass` | 32 | només icona, quadrat |
| `floatingButtonClass` | 34 | control flotant sobre el mapa |

- Totes comparteixen 10 px de padding horitzontal. **No** s'hi afegeixen `px-*`,
  `py-*`, `gap-*` ni `text-*` al consumidor: en un xoc guanya l'utilitat que surt
  més tard al CSS, no la que s'escriu més a prop. Si cal una variant, s'afegeix a
  `uiStyles.ts`.

### Inputs i selects

`inputClass` (32 px, `px-2.5`, `text-base` perquè iOS no faci zoom),
`selectClass` i `compactSelectClass` (15 px, per a files etiqueta + control).

### Quadres i llistes

`rounded-lg` + `border border-border-strong` + `shadow-control` per als quadres;
`divide-y divide-soft` per a llistes dins d'un quadre; `border-soft` per als
separadors de files. Els comptadors són `rounded-full bg-accent text-ink text-xs`.

### Barra de pestanyes i bottom sheet

- La barra va sobre `accent`; la pestanya activa **inverteix** els colors
  (`bg-primary text-accent`, `rounded-t-lg`; la primera cel·la només arrodoneix
  la dreta perquè l'esquerra la retalla el panell).
- `--sheet-bar-h` és l'única font de l'alçada de la barra tancada
  (`calc(16px + 2.75rem)`) i la fan servir el full, els controls del mapa i els
  adaptadors de Leaflet i MapLibre. En JS, `tabBarHeight()` de
  `front/src/components/layout/metrics.ts` replica la fórmula.
- El full s'ancora a tancat, 60 % i 95 % de la finestra; els ancoratges es
  calculen una vegada per arrossegament.

### Controls de mapa

Botons blancs de 34 px amb `shadow-control` dins de `controlContainerClass`
(`z-990`), i el zoom i l'atribució a `bottom: var(--sheet-bar-h)` quan el full és
tancat. El menú de capes viu en un portal a `document.body` amb `z-1100` perquè
quedi per sobre del full.

## 7. Capes (`z-index`)

| Capa        | Valor                                       | Element |
| ----------- | ------------------------------------------- | ------- |
| 900         | atribució del mapa                          |
| 990         | controls del mapa (`controlContainerClass`) |
| 1000        | bottom sheet                                |
| 1040 / 1050 | avís d'ADF (bloqueig / targeta)             |
| 1100        | menú de capes                               |
| 2000        | popups del mapa                             |
| 6000        | modals                                      |

Un `z-index` nou ha d'entrar en aquesta escala i no pot quedar dins d'un context
d'apilament que l'atrapi (per això el menú de capes és un portal).

## 8. Accessibilitat i mòbil

- Controls de 32 px i pestanyes de 44 px: prou grans per al dit.
- Focus visible sempre: halo blanc + anell verd (`--focus-halo`, `--focus-ring`).
- Contrast: groc només amb tinta a sobre; text `muted` sobre paper, no `faint`.
- Les animacions respecten `prefers-reduced-motion`.
- La UI es prova a 90 %, 100 %, 115 % i 130 % de «Mida de text», i a 393 px
  d'ample: res no pot quedar retallat ni tapar els controls del mapa.

## 9. Com afegir una peça nova

1. Mira si ja existeix una variant a `uiStyles.ts`; si no, afegeix-la allà
   (una classe, un comentari d'ús).
2. Fes servir els tokens de color i les mides de la taula; res de valors
   literals.
3. Tria la icona: domini (emoji) si és vocabulari, acció (`Glyphs.tsx`) si fa
   alguna cosa.
4. Comprova els tres estats visuals: normal, `hover`/actiu i desactivat.
5. Passa `npm run typecheck`, `npm run lint`, `npm run build -w front` i mira-ho
   al navegador a 393 px amb «Molt gran».
