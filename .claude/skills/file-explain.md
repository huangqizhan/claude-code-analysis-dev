---
name: file-explain
description: Explain a file using the loaded template
usage: /skill file-explain <path or topic>
aliases: file-explain, explain-file
tags: analysis, reading
triggers: explain this file, explain this module
examples: Explain src/index.tsx, Explain a file in detail
routePriority: 1
---

Explain this code clearly and concisely: {{target}}
