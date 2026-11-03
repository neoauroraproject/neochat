# NeoChat — dashboard UI spec

The client follows a clean white dashboard reference: an icon rail, a list column with the signed-in
person on top, a gray conversation panel and a "Shared files" column. Values below were measured from
the reference at its 1440×900 frame (the shot was 840 px wide, so 1 px there ≈ 1.905 px here) and are
estimates, not exported tokens.

## Tokens (`client/src/styles/base.css`)

| Token           | Light                                                                                                       | Use                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `--accent`      | `#00a388` (admin can override)                                                                              | send tile, active tab/rail, ticks, online dot, links, mentions |
| `--accent-soft` | accent 12% on white                                                                                         | rail active tile, "All files" tile, `+` button                 |
| `--accent-tint` | accent 12% on the panel gray                                                                                | active "Messages" tab                                          |
| `--accent-pill` | accent 24% on white                                                                                         | "available" status pill                                        |
| `--page`        | `#dcdfe6`                                                                                                   | page around the card                                           |
| `--surface`     | `#ffffff`                                                                                                   | card, rail, list and files columns, incoming bubbles, composer |
| `--panel`       | `#edf0f5`                                                                                                   | conversation panel                                             |
| `--field`       | `#f0f3f7`                                                                                                   | search                                                         |
| `--soft`        | `#f0f1f3`                                                                                                   | square header buttons                                          |
| `--row-active`  | `#f7f7f9`                                                                                                   | selected chat row                                              |
| `--bubble-out`  | `#d1d4e5`, ink `#121526`                                                                                    | outgoing bubbles                                               |
| Text            | `#15172a` · `#8a8d96` · `#a6a9b1` · labels `#5c5d63`                                                        |                                                                |
| File types      | docs `#dfe1fa`/`#5d6ee8`, photos `#f1ecd2`/`#bea45c`, movies `#e3f6f5`/`#3eafb4`, other `#fde0db`/`#d26656` | tile / glyph                                                   |

Dark mode keeps the same structure in deep slate (`--surface #17191e`, `--panel #1e2128`); the reference has
no dark frame. Avatars without a photo are pastel tiles with initials in a deeper shade of the same hue.

Type: Figtree (bundled, `assets/Figtree.woff2`, OFL) for Latin, Vazirmatn for Persian; zero-width joiners stay
on Vazirmatn so Persian words keep joining.

## Desktop (> 760 px)

- Page padding grows from 0 at 1180 px to 48 px; the card is 22 px round with a soft shadow.
- Columns: rail 92 · list 340 · chat (flexible) · files 344. Below 1280 px the files column becomes a
  slide-over (folder button in the chat header) and the rail/list shrink to 84/316, then 76/292 under 1024 px.
- **Rail**: brand mark at the top (admin logo if uploaded), section icons centered vertically at 64 px pitch,
  active = 55 px soft tile, 13 px radius, plus a 3 px accent bar on the column edge; avatar at the bottom.
- **Column header** (`ColHead`): 101 px tall incl. the hairline, 38 px square button (10 px radius), title 24 px
  semibold (20 px in the files column).
- **Me block**: 104 px avatar with a 12 px online dot on the 45° edge, gear top-end, name 22 px, status pill
  28 px (opens Settings / Admin / Log out).
- Search 46 px, 12 px radius, icon at the end. "Last chats" 13.5 px with a 32 px `+` tile and a folder menu.
- **Rows**: 76 px, 11 px radius, avatar 40, name 15 px semibold + time 11.5 px on one line, preview 12.5 px
  with the unread badge/ticks below.
- **Conversation panel**: inset 15 px top/bottom, 15 px radius. Frosted 63 px header: title 18 px, status for
  direct chats, `Messages / Participants` tabs (36 px, 9 px radius) for groups, square call buttons for DMs.
- Messages: a "Name, time" meta line (10.5 px) above each run, avatar 30 px at the run's end for groups,
  bubbles 15 × 18 px padding, 15 px radius, 14 px/20 px medium text. Outgoing bubbles always, and the last
  incoming bubble of a run, get a small flared corner by the sender. Mentions are accent-colored.
- Typing row above the composer: 30 px white dot-bubble + "Name is typing".
- Composer: one white bar, 63 px tall, 15 px radius; emoji/attach/mic in gray; 50 × 47 px accent send tile.
- **Shared files**: 104 px chat avatar, title 22 px, members line; two 95 px tiles (All files with a folder and a
  dot, All links) at 15 px gap; "File type" rows 64 px with 48 px pastel tiles (13 px radius). Each row opens a
  list (photo/video grid or file and link rows). Data from `GET /api/chats/{id}/shared` (totals per type) and
  `?type=photos|movies|documents|other|links` (newest 60).

## Phones (≤ 760 px)

Same palette full-bleed: white list screens with the folder tabs and stories, the gray conversation panel
with in-bubble times, and a floating white tab capsule with an accent-soft lens.
