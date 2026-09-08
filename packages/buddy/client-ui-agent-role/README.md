---
description: "Grouped professional-role selector for the Buddy new-session workspace."
kind: "package"
---

# @sospink/dsh-buddy-client-ui-agent-role

English | [中文](README.zh.md)

## Summary

This browser package mounts the Agent Role Remote and fills `conversation.hero.agentRole`. The compact dark-glass selector sits beside Workspace and Agent preset on the blank-session canvas. Its menu groups roles under Product, Technology, and Quality and gives each choice a concise capability description.

A pick can be staged before a workspace creates the receiving session. Once a blank session is available it is committed to the Host; existing session projections restore the visible choice after reload. Started sessions are never rewritten.

## Known Limitations

- The selector appears only on the blank-session Hero; active conversations expose the durable identity through their behavior rather than an editable control.
- Role management and custom-role authoring are not included.
