---
id: overview
title: Schedule Overview
---

import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

The Schedule page is the main view in LabRota. It shows the weekly rota for your lab with all staff assignments.

## Views

Switch between views using the toolbar at the top:

- **Week** — the standard view showing 7 days across with rows and staff chips
- **Month** — a summary view showing published/draft/empty status for each week
- **Day** — a detailed view for a single day

## Reading the week view

How the grid is organised depends on the display mode configured for your lab.

<Tabs groupId="display-mode">
<TabItem value="by-shift" label="By Shift">

The grid has **shift rows** on the left and day columns across the top. Each cell shows which staff members are assigned to that shift on that day.

| Row | Meaning |
|-----|---------|
| Morning | Staff working the morning shift |
| Afternoon | Staff working the afternoon shift |
| On-call | Staff on-call that day |

- **Blue chip** = Lab embryologist
- **Green chip** = Andrology staff
- **Grey chip** = Admin or support staff
- **Leave indicator** = staff member is on approved leave that day

A coloured dot on a chip means the staff member has a technique assignment within that shift.

Drag a staff chip between shift rows to move someone to a different shift on the same day.

</TabItem>
<TabItem value="by-task" label="By Task">

The grid has **IVF technique rows** on the left and day columns across the top. Each row corresponds to one procedure or technique performed in the lab (e.g. ICSI, FIV, Biopsia, Vitrificación).

| Row | Meaning |
|-----|---------|
| ICSI | Staff performing ICSI procedures that day |
| FIV | Staff performing conventional IVF |
| Biopsia | Staff performing embryo biopsy |
| … | Any other technique defined in Lab Config |

- **Blue chip** = Lab embryologist certified in that technique
- **Green chip** = Andrology staff
- **Grey chip** = Admin or support staff
- **Leave indicator** = staff member is on approved leave that day

Only staff with the matching skill certification appear in a technique row. Unassigned staff appear in the **General** row at the top.

Drag a staff chip between technique rows to reassign them to a different procedure on the same day.

</TabItem>
</Tabs>

## Navigating weeks

Use the **← →** arrows in the toolbar to move between weeks. You can also click **Today** to jump back to the current week.

## Draft vs Published

Every rota is either **draft** or **published**:

- **Draft** — visible only to editors; staff cannot see it yet
- **Published** — visible to all staff who log in to view their schedule

Click **Publish** in the toolbar to make a draft rota available to the team. Once published, it can still be edited — changes take effect immediately.

## Week warnings

A warning icon appears on the toolbar if the current week has coverage issues or skill gaps. Click it to see a list of specific problems the engine detected.
