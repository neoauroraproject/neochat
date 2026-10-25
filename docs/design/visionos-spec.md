# NeoChat — visionOS glass UI spec (implementation prompt)

> Generated with prompt-master for Claude Code. This is the source of truth for the client's look.
> 🎯 Target: Claude Code (Opus 5.5) · 💡 Locks every measurable value from the reference so the build matches on the first pass.

```xml
<context>
NeoChat client: React 18 + plain CSS in client/src (styles/*.css, app/*.tsx). Persian (RTL) default, English (LTR).
Reference: a visionOS messenger window floating over a warm, dim living room. Recreate it faithfully on desktop
and translate the same material language to phones. Keep all features, i18n keys, store and API untouched.
Apply apple-design: translucent layers convey hierarchy, never stack light glass on light glass, bright top edge
on materials, vibrancy (higher-contrast text) over glass, springs/ease-out for motion, feedback on pointer-down,
scroll-edge fades instead of hard dividers, prefers-reduced-motion/transparency/contrast fallbacks.
</context>

<task>
Restyle and restructure the client shell to match the reference exactly. Desktop and mobile share one token set.
</task>

<design_tokens>
Backdrop: bundled warm room image (public/scene.jpg), cover, plus admin-uploaded override. Dark theme default.
Text: primary rgba(255,255,255,.96); secondary .62; tertiary .42. Weight 600 for names, 500 for labels.
Window material: rgba(120,108,98,.30) + backdrop-filter blur(50px) saturate(160%); border 1px rgba(255,255,255,.18);
  inset 0 1px 0 rgba(255,255,255,.22) (light catching the top edge); shadow 0 40px 120px rgba(0,0,0,.45).
Card material (sits on the window): rgba(255,255,255,.07); border 1px rgba(255,255,255,.12). No blur (one blur layer only).
Control fill: rgba(255,255,255,.12); hover .16; pressed .22 + scale(.96). Field (search): rgba(0,0,0,.24), no border.
Accent: #0a84ff (badge, links, unread dot). Online dot: #30d158 with 2px ring of the surface color. End call: #ff3b30.
Radii: window 44, cards 32, rows 16, controls 12, pills 999. Motion: ease-out cubic-bezier(.23,1,.32,1);
spring cubic-bezier(.34,1.3,.64,1). Press 120ms; hover/background 150ms; panels 300ms; never transition: all.
Light theme: same layout; window rgba(255,250,245,.55); cards rgba(255,255,255,.45); text rgba(20,16,12,.92/.6/.4).
</design_tokens>

<desktop>
Viewport ≥ 1024px. Body = backdrop. Centered window max 1240×760, inset 32px from viewport edges.
Ornament (outside window, 18px gap, vertically centered on the window's inline-start side): vertical glass pill
  width 60, padding 8, gap 6, radius 999, window material. Buttons 44×44 circles, icon 22: Chats, Calls (video glyph),
  People, Settings; admin dashboard after a 1px divider. Active = control fill .20. Unread badge on Chats.
Window padding 24, gap 24, grid columns: 300px | minmax(320px, 400px) | 1fr.
 Column 1 — Sidebar card (card material, radius 32, padding 14):
   Profile row: avatar 44 · name 17/600 + chevron 16 · gear 22 at inline-end.
   Menu rows height 56, radius 16, gap 14: icon tile 40×40 radius 12 (control fill) + label 16/500; active row
   background rgba(255,255,255,.14); blue pill badge (24px high, 13/600) at inline-end.
   Items: Chats (all), Private, Groups, Channels, Archive (only if any).
   Section label "Rooms" 13/500 tertiary, then rooms list: thumb 40 radius 10, title 14.5/500 ellipsis,
   sub 12 secondary "N members", 8px accent dot if unread. Footer: sidebar ad then © line 11px tertiary.
 Column 2 — no card. Search field height 42, radius 14, field fill, icon 20, placeholder 16 secondary.
   Stories row: avatar 56, gap 14, green dot 12 if online, two-line centered first/last name 12.5 secondary.
   Chat rows height 62, radius 16, padding 8, gap 12, no separators: avatar 48 (+online dot) · name 15/600 ·
   one-line sub 13 secondary "preview · time" · trailing 16px read-receipt avatar (peer) or unread badge.
   Hover control fill .06; selected rgba(255,255,255,.12).
 Column 3 — Right card (card material, radius 32, overflow hidden): Conversation, Settings, Info, Welcome, or the
   active CALL PANEL (desktop calls render inside this card, not as an overlay).
   Card header row height 56: back arrow / title / add-user + more icons, icon buttons 40.
Call panel (reference right card): portrait 140×140 squircle radius 36%; name 28/700 tracking -0.02em; timer 18
  secondary tabular; control pill at bottom center: height 64, radius 999, padding 8, gap 8, control fill .14,
  5 buttons 48 circles (camera, mic, effects/flip, speaker, end red). Incoming: accept green + decline red 64px.
</desktop>

<mobile>
Viewport < 1024px... phones < 760px. Full-bleed backdrop with a full-screen window-material layer (no radius).
Screens are stacked; pushing a conversation slides it in from the inline-end with the parent drifting 28% back.
Top bar (floating, no strip): 44px glass circle (avatar → settings) at inline-start, title 17/600 centered,
  44px glass circle compose at inline-end. Below: search capsule 42 (field fill), stories, chat rows (desktop specs).
Bottom navigation (Telegram style, ICONS ONLY, NO LABELS): floating capsule centered, bottom 14px + safe-area,
  height 64, padding 6, radius 999, window material + shadow. 4 icon buttons 52×52 (Chats, Calls, People, Settings),
  icon 26, inactive secondary, active primary + filled glyph. A lens (rgba(255,255,255,.16), radius 999) sits
  behind the active icon and slides between tabs with the spring curve (420ms). Red badge on Chats.
  The capsule slides down and fades while a conversation is pushed.
Conversation: floating header capsules — back circle 44 · center capsule (name 16/600 + status 12) · avatar circle 44.
  Composer floating: + circle 44 · field capsule (min 44, radius 22, field fill) · mic/send circle 44 (send = accent).
Calls: full-screen, same panel as desktop (portrait, name, timer, control pill), draggable self-view in video.
</mobile>

<constraints>
MUST keep existing class hooks used by admin pages and modals; MUST keep i18n via t(); MUST keep RTL via logical
properties (inset-inline-*, margin-inline-*); MUST only animate transform/opacity (and background-color for hovers).
NEVER add text labels to the mobile bottom navigation. NEVER stack two blurred layers on the same pixel.
NEVER introduce new runtime dependencies or CDNs.
</constraints>

<done>
Headless screenshots at 1440×900 (desktop) and 390×844 (phone), dark and light, match the reference composition:
ornament pill, three-part window, sidebar card with icon tiles, stories row, chat rows, right card; phone shows the
floating icon-only capsule. `npx tsc --noEmit` passes and the Go binary builds.
</done>
```

This prompt drives an agentic tool with real system access. Review scope before reuse.
