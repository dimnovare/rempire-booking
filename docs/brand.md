# Brand: logos, fonts, colours

*17.11.2026. Dim chose rempire.ee's look for booking (decisions page,
`look`). Dim approved mock draft 1's look the same day.*

*19.11.2026: the client booking pages changed to the look of REMPIRE's
Altegio widget (Renat; `docs/kickoff.md`, decision 23). See «Booking look»
at the end. The fonts and colours below still describe rempire.ee and the
marks.*

## Which logo where

REMPIRE has three marks. Booking uses the first.

| Mark | Looks like | Used on | Source |
|---|---|---|---|
| **rempire.ee logo** | Thin «REMPIRE», a small ring above the M | rempire.ee header; **booking** | `public/brand/rempire-logo.svg` (takes CSS `color` when inlined) and `rempire-logo-white.svg` (for `<img>`). Redrawn as strokes from Dim's PNG `rempire-logo-white.png` (436×105), which stays as the reference. |
| **Hair and tattoo** | «REMPIRE» in Korolev Bold, «HAIR AND TATTOO» under it | salon signage, socials | Dropbox «LOGO»: `REM logo-01.png`, `REM logo-02.png`, `REM logo.ai` |
| **Tower** | The tower drawing; badge «REMPIRE TOWER · est 2018 · 666 ways»; lockup with «Leave in such a way where death is not the end» | rempireshop.com | shop `public/brand/` (`rempire-tower.svg`, `rempire-badge-*.svg`, `rempire-lockup-*.svg`); Dropbox `assets/SVG` holds the same four |

- The Dropbox folder «LOGO» was shared by the designer. Dim has the link.
  It also holds banners, a hoodie PDF and building photos.
- **Tower rules** (shop `docs/design/DESIGN-HANDOFF-README.md`): never
  redraw it; recolour only, through `currentColor` or a CSS mask. Booking
  has a copy: `public/brand/rempire-tower.svg`.
- **The SVG redraw** (17.11.2026, Dim asked for better quality): the PNG at
  3× under the SVG lines up stroke for stroke. If the designer has the
  original vector, it replaces the redraw.

## Fonts

| Font | Used for | Where it is | Web use |
|---|---|---|---|
| Akrobat ExtraBold | rempire.ee headings; booking headings | rempire.ee loads it from fonts.cdnfonts.com | Fontfabric's free font. Check the licence once, then self-host it. |
| Questrial | rempire.ee and booking body text | Google Fonts | Open Font License. Self-host it, no Google CDN in production (as in the shop). |
| Korolev Bold | the word REMPIRE in the hair-and-tattoo and tower marks | shop `public/fonts/KorolevBold.otf`; the same file is in Dropbox `assets/Fonts` | **Web use confirmed** (Dim, 17.11.2026). Self-host it as woff2 when booking needs it. |
| Vodka Brush | the script lines on the tower marks («est 2018», the slogan) | Dropbox `assets/Fonts` only | Not needed for booking. |
| Oswald Medium, Golos Text, PT Mono | the barbers' invoice PDF (Phase C): headings, text, numbers. All three have Cyrillic and the Estonian letters | `src/app/fonts/*.ttf`, embedded into each PDF | Open Font License. Used only inside PDFs, never loaded by the web pages. |

## Colours (from rempire.ee's CSS)

| Token | Value | Use |
|---|---|---|
| ink | `#000` | page |
| fg | `#fff` | text |
| lime | `#e9fc53` | the current choice and the next step; rempire.ee's accent |
| lines | `#262624`, `#3b3c36` | rules and outlines |

Square edges, uppercase headings with wide letter-spacing, lime outlined
tags, a 2 px lime rule on the left of quoted text. All from rempire.ee.

## Booking look (the client pages, 19.11.2026)

Measured on the live Altegio widget at 375 px (`b353848.alteg.io`), then
written as tokens in `src/app/globals.css`. The admin and the barber app
have their own tokens, after Altegio's admin (`docs/reference-looks.md`):
a dark frame, light pages, yellow for the main action.

| Token | Value | Use |
|---|---|---|
| ink | `#262626` | text |
| ink-2 | the ink at 66 % | second lines, labels (Altegio: 60 %; ours passes 4.5:1 on white) |
| ground | `#f2f2f2` | the page under the white blocks |
| surface | `#fff` | the column and the blocks |
| primary | `#060f07` | buttons, the picked day and time, ticks |
| fill | the ink at 7 % | time pills, icon discs, the second button |
| line / edge | the ink at 15 % / 20 % | rules / outlines of fields, radios and tick boxes |
| star | `#f8bc3a` | ratings |
| danger | `#b3261e` | «cancel», errors |

- **Font:** Inter, 400 for text, 500 for prices and pills, 700 for titles
  (24/28 and 20/24). Text 16/24, second lines 14/20, labels 12/16.
- **Shapes:** blocks 24 px corners with 8 px between them; buttons 50 px
  high with 16 px corners; fields 50 px with 12 px corners; pills fully
  round; tick boxes 6 px.
- **Layout:** 16 px gutters; a 64 px header; one 600 px column, centred, at
  every width.
- **The mark:** the thin REMPIRE in white on a dark disc (80 px on the first
  step, 48 px in the header), as the widget shows the salon's picture.
- **Touch:** day cells and pills are 44 px high (Altegio: 40), so a thumb
  does not miss.
