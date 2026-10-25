# NeoChat UI/UX Constitution

## Desktop Experience Standard

NeoChat Desktop is intentionally designed around the usability principles and interaction patterns of Telegram Desktop.

The objective is to provide users with an immediately familiar experience while maintaining NeoChat's own visual identity.

---

## Primary Design Reference

Telegram Desktop is the primary interaction reference.

- Do not redesign the workflow
- Do not invent new layouts
- Do not imitate Discord
- Do not imitate Slack
- Do not imitate Microsoft Teams

Desktop usability must feel extremely familiar to Telegram Desktop users.

---

## General Layout

Use a classic three-column desktop layout:

```text
Sidebar → Chat List → Conversation Area → Optional Right Information Panel
```

The proportions should closely resemble Telegram Desktop.

Resizable panels are required.

---

## Sidebar

The sidebar should include:

- Profile
- Search
- Folders
- Settings
- Archived Chats
- Unread Counters
- Smooth hover states
- Keyboard navigation
- Collapsible mode

---

## Chat List

The chat list must support:

- Avatar, Title, Last Message, Typing Indicator
- Unread Badge, Mute Icon, Pin Icon
- Verified Badge (future)
- Selection / Hover / Context Menu
- Drag & Drop Reordering
- Animated Updates
- Virtual Scrolling

---

## Chat Header

Include:

- Avatar, Chat Name, Online Status, Typing Status
- Call Buttons, Search Button, Menu
- Pinned Message Banner

---

## Message Area

Requirements:

- Message Bubble, Reply/Forward Preview, Edited Label
- Timestamp, Read/Delivery Status
- Grouped Messages, Date Separators, Unread Marker
- Context Menu, Selection Mode, Emoji Reactions
- Message Highlight Animation
- Smooth Scroll, Infinite Scroll, Virtualization

---

## Message Composer

Implement:

- Growing Textarea, Emoji Picker, File Upload, Voice Recording, Send
- Keyboard Shortcuts, Reply Preview, Edit Mode
- Drag & Drop, Clipboard Paste, Typing Animation

---

## Right Panel

Support:

- Shared Media, Files, Links, Members
- Pinned Messages, Group Information, Permissions
- Search Results

---

## Animations

Subtle only. Target 150–250ms, ease-in-out, hardware accelerated, native feeling.

Avoid exaggerated motion.

---

## Design System

- Rounded corners similar to Telegram Desktop
- Consistent spacing, minimal borders, soft shadows
- High readability, large click targets, clear hierarchy

---

## Typography

Readable font stack, comfortable line height, excellent message readability, monospace support, RTL and LTR.

---

## Themes

Dark, Light, System, Custom Theme Engine, Accent Colors, Wallpaper Support, Blur Effects (optional).

---

## Chat Experience

Instant navigation, immediate message appearance, optimistic UI, smooth scrolling, no visible lag, no unnecessary loading indicators.

---

## Keyboard Shortcuts

Search, Jump Chats, Reply, Edit, Delete, Archive, Mute, Navigate, ESC behavior.

---

## Responsiveness

Desktop First. Tablet supported. Mobile browser supported. Never compromise desktop UX.

---

## Do Not

- Redesign Telegram's interaction model
- Invent experimental layouts
- Overload the interface
- Hide frequently used actions
- Prioritize aesthetics over usability

---

## Final Principle

If a Telegram Desktop user starts using NeoChat, they should immediately know where everything is, while clearly recognizing NeoChat as its own product through branding, colors, icons, typography, and visual identity.
