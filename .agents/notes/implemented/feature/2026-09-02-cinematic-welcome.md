---
title: Cinematic blank-session welcome
status: implemented
---

# Cinematic blank-session welcome

English | [中文](2026-09-02-cinematic-welcome.zh.md)

The first blank Buddy session in a browser now opens on a single-viewport video landing surface with responsive navigation, trust marks, localized hero copy, an animated metric footer, and a mobile menu. The page keeps the existing Conversation composer mounted for state continuity but collapses its rendered controls while the welcome surface is visible.

The AppFrame temporarily resolves its sidebar and details tracks to zero when the landing marker is present. Entering this state disables the ordinary column-width transition and immediately clears the resident hero stack's floating-sidebar translation, so reopening Welcome from an expanded conversation sidebar fills the very first painted frame instead of briefly preserving a sidebar-width black gutter or sliding in from the right. Their mounted subtrees are also hidden from interaction and the accessibility tree. Selecting Get Started records a versioned browser acknowledgement, dismisses the welcome layer, restores the normal three-column application shell, and focuses the resident composer. Later reloads initialize directly into the workspace without flashing the landing surface. The shared `UiConversation` welcome store lets the expanded sidebar brand clear that acknowledgement, open a blank Session, and show the landing surface again without removing existing Sessions. Active conversations and full-canvas Conversation views never enter the welcome state.

The display face serves the supplied H.264 background video from the Web public directory so the welcome image does not depend on customer network access. A packaged JPEG poster is both the video's loading frame and the background layer beneath it, so decode failure or autoplay delay retains the same composition instead of exposing a black canvas. The display type uses the supplied CDN font when available, with a packaged Geist Pixel Circle fallback. The reduced-motion path skips reveal and number animations.
