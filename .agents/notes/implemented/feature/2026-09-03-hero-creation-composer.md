# Agent Note: Hero creation composer

Status: implemented

English | [中文](2026-09-03-hero-creation-composer.zh.md)

## Problem

After the cinematic welcome hands control to a blank session, the first real interaction needs to remain visually stable over the animated canvas. A hero-specific oversized light capsule made that state feel disconnected from the dark application chrome and introduced a second composer appearance that did not persist after the first message.

## Decision

The `hero` InputBar variant reuses the original fixed dark composer surface with a 132px blank-session resting height, 22px corners, token-owned material, compact controls, and blue circular send action. The added vertical room belongs only to the full-canvas blank session; active conversations keep the original 94px dock. It retains the resident Lexical editor and all existing workspace, agent preset, command, permission, plan, model, context, and submit controls. Long drafts and attachments can still expand the functional surface, but focus and blur do not switch it between compact and oversized visual modes.

The workspace and agent-preset row keeps its restrained entrance reveal, while the composer itself mounts without hero-specific fade, scale, ambient glow, light material, or control-size overrides. The real adjudicating and submitting machine states continue to animate a traveling border highlight and replace the send arrow with a slow rotating loader; no simulated timer or parallel draft state is introduced. `prefers-reduced-motion` removes loading and motion transitions. The first prompt and the docked composer used after a message therefore share one visual system.

The dark surface adds a dependency-free interaction layer inspired by React Bits' Border Glow, Spotlight Card, and Glare Hover patterns. Pointer movement writes two CSS variables directly on the card, positioning a masked ice-blue edge light without entering React state or changing the composer's geometry. Focus strengthens the same light without scaling or moving the surface; the hero variant uses the stronger treatment while active-conversation composers use roughly half its intensity. When a draft first makes Send actionable, its button plays one short highlight sweep, and hover can replay a restrained diagonal glint. The existing submitting border and loader take visual priority, and reduced-motion mode keeps only stable, non-animated state feedback.

The composer surface further adopts a restrained near-black glass material across both blank and active conversations. Layered translucent black and navy gradients allow the surface behind it to remain faintly visible, while a cool upper-right refraction, an inset top highlight, a lower-edge falloff, and deep soft shadows describe acrylic thickness. Native backdrop blur and saturation are progressive enhancements; the layered fill remains readable when either filter is unavailable. Focus only adjusts border luminance and shadow depth, so the hero stays at 132 pixels and the active dock stays at 94 pixels without shifting. Draft state no longer replaces the glass with the old opaque fill. Secondary controls use a quiet translucent fill within the same sheet instead of appearing as separate opaque cards.

After the welcome handoff, the blank-session canvas uses the reference site's original locally packaged video as the color and luminance source for a WebGL2 ASCII field. Its exact ten-pixel character grid, bold monospace atlas, video-color output, shader field constants, smoothed pointer displacement, sixty-percent canvas opacity, vertical mask, and content-relative central dark scrim reproduce the reference hero rather than reinterpreting it. Rendering is capped at 1.5 device-pixel ratio and pauses outside the visible page or viewport. Unsupported WebGL2, reduced-motion preferences, and shader initialization failures retain a video fallback instead of leaving the workspace blank.

During that blank-session phase, the conversation column spans the complete frame and the existing sidebar becomes a twelve-pixel-inset overlay. It starts as the compact rail so it does not cover the centered creation composer, and a person can expand it for the rest of that blank-session phase without the default being reapplied. Its real expanded, collapsed, and resize widths still come from the layout store. A deep-blue task-card material connects it to the cinematic welcome and animated ASCII canvas: inside the card, a near-black lower-left plane grades diagonally into navy at the upper-right, while the borderless forty-four-pixel rounded shell is defined only by its acrylic material and deep shadow. Footer utilities remain on that same uninterrupted acrylic plane; spacing separates them from the session browser, and their hover feedback is a quiet neutral mist rather than another blue card. Its inherited label, active, button, and navigation tokens are locally tuned for that dark material. When expanded, its live width publishes a left clearance that centers and caps the composer within the remaining visible region; collapsing it smoothly returns the composer to the full-frame center while the ASCII background always remains full bleed. The workspace and Agent-preset selectors share one compact translucent tool group above the composer, with matched geometry, blue icon accents, restrained hover and focus feedback, and chevrons that turn when their existing menus open. Active conversations retain the normal three-column layout and reuse the identical inset task-card shell.

## Alternatives considered

**Restyle every composer.** Rejected because an active conversation needs a compact dock that preserves transcript space; the large creation surface is appropriate only before the first message.

**Rebuild the reference control list with decorative attachment, idea, design, wireframe, and microphone buttons.** Rejected because inactive replicas imply capabilities the platform does not provide and displace the real permission, plan, model, and submit controls.

**Replace the composer with a welcome-only mock component.** Rejected because remounting a parallel input would split draft, editor, attachment, command-menu, and accessibility state from the production composer.

**Add Three.js and React Three Fiber for the background plane.** Rejected because this effect needs one full-screen triangle and two textures; direct WebGL2 preserves the reference technique without adding a second rendering framework to the customer package.

## Consequences

The first prompt now uses the application's original fixed dark composer over the cinematic field, while remaining the same functional composer underneath. This removes the one-off light capsule and its focus glow without changing the background or workspace controls. The background remains inside the conversation column, which spans behind the floating sidebar during the blank-session phase; it does not capture pointer events and unmounts after the first message, so active chat and the full-canvas prototype remain unaffected. The original local H.264 asset and video fallback keep the same source archive usable on supported Windows browsers even when GPU rendering is unavailable.
