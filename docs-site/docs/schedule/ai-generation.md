---
id: ai-generation
title: AI Generation
---

import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

LabRota can automatically generate a weekly rota using AI. The engine assigns staff based on coverage requirements, skills, leave, and configured rules.

## Generating a rota

1. Navigate to the week you want to generate
2. Click **Generate** in the toolbar
3. Choose a generation strategy
4. Wait for the engine to finish — it usually takes 5–20 seconds

If a rota already exists for the week, generating again will replace it.

## What the engine optimises

The AI engine works differently depending on your lab's display mode.

<Tabs groupId="display-mode">
<TabItem value="by-shift" label="By Shift">

The engine fills each **shift** with the right number of staff for each day, then respects:

- Minimum and optimal headcount per shift
- Leave and unavailability blocks
- Consecutive shift limits and rest requirements
- Role balance (Lab vs Andrology) within each shift
- Staff skill certifications where technique coverage is tracked

The **punctions** (egg retrievals) forecast drives headcount targets — higher punction days get more staff assigned.

</TabItem>
<TabItem value="by-task" label="By Task">

The engine fills each **technique row** with certified staff, then respects:

- Minimum staff per technique per day (from Lab Config ratios)
- Leave and unavailability blocks
- Staff skill certifications — only certified staff are placed in a technique row
- Technique priority (e.g. ICSI before FIV if both compete for the same embryologist)
- Unassigned staff are placed in the **General** row

The **punctions** (egg retrievals) and **biopsies** forecast drives how many staff are needed in each technique row per day.

</TabItem>
</Tabs>

## Generation strategies

| Strategy | Speed | What it does |
|----------|-------|-------------|
| **Optimal** | Slower | Full AI optimisation — best coverage and skill balance |
| **Fast** | Faster | Rule-based engine — good results in seconds |
| **Hybrid** | Medium | AI reasoning with rule-based fallback |

For most weeks, **Optimal** gives the best rota. Use **Fast** when you need a quick starting point to edit manually.

## Regenerating a single day

Right-click (or long-press on mobile) any day column and choose **Regenerate day** to rerun the engine for that day only, without affecting the rest of the week.

## Manual edits after generation

After generating, you can:

- **Drag and drop** staff chips to move assignments between rows and days
- **Click a chip** to open the assignment editor (change row, add notes, set technique)
- **Click an empty cell** to add a new assignment manually
- **Delete** any assignment by opening it and clicking Remove

All manual edits are saved automatically.

## Undo / Redo

Use **Ctrl+Z** / **Ctrl+Y** (or the undo/redo buttons in the toolbar) to step back through your changes. The history clears when you navigate to a different week.
