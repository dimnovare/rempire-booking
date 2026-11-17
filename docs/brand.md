# Brand: logos, fonts, colours

*17.11.2026. Dim chose rempire.ee's look for booking (decisions page,
`look`). Dim approved mock draft 1's look the same day.*

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

## Colours (from rempire.ee's CSS)

| Token | Value | Use |
|---|---|---|
| ink | `#000` | page |
| fg | `#fff` | text |
| lime | `#e9fc53` | the current choice and the next step; rempire.ee's accent |
| lines | `#262624`, `#3b3c36` | rules and outlines |

Square edges, uppercase headings with wide letter-spacing, lime outlined
tags, a 2 px lime rule on the left of quoted text. All from rempire.ee.
