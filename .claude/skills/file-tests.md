---
name: file-tests
description: Generate tests using the loaded template
usage: /skill file-tests <feature or file>
aliases: file-tests, test-file
tags: testing
triggers: write tests for this file, write tests for this module
examples: Write tests for src/skills/router.ts, Write focused tests for a new feature
routePriority: 1
---

Write focused tests for: {{args}}
