---
id: lab-config
title: Lab Configuration
---

import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

The **Lab** page is where editors configure the technical parameters that drive the AI scheduling engine.

## Display mode

The most important setting. It controls how the schedule grid is organised for your entire lab.

<Tabs groupId="display-mode">
  <TabItem value="by-shift" label="By Shift">

**By shift** organises the grid with one row per shift time (e.g. Morning, Afternoon, On-call). Staff are assigned to a shift for the whole day, and any technique tracking is secondary within that shift.

Choose **By shift** if your lab:
- Has fixed shift patterns (morning/afternoon/overnight)
- Schedules staff to a time block first, then tracks techniques separately
- Is primarily concerned with headcount and shift coverage

  </TabItem>
  <TabItem value="by-task" label="By Task">

**By task** organises the grid with one row per IVF technique or procedure (e.g. ICSI, FIV, Biopsia, Vitrificación). Staff are assigned directly to the procedure they will perform that day.

Choose **By task** if your lab:
- Assigns embryologists to specific techniques each day rather than time shifts
- Wants the rota to show at a glance who is doing what procedure
- Uses skill certifications to control who can perform each technique

  </TabItem>
</Tabs>

:::caution
Changing the display mode after you have existing rotas will not delete any data, but the grid layout will change and existing assignments may appear under different rows. It is best to set this before generating your first rota.
:::

## Shift types

<Tabs groupId="display-mode">
  <TabItem value="by-shift" label="By Shift">

Define the shifts your lab uses (morning, afternoon, on-call, etc.) with their start and end times and the days they are active. The engine only schedules staff into active shifts.

  </TabItem>
  <TabItem value="by-task" label="By Task">

Shift types are not used as the primary grid rows in By Task mode, but you can still define them to track working hours and generate accurate rest period warnings. Staff working hours are recorded even if the grid shows techniques.

  </TabItem>
</Tabs>

## Techniques (Técnicas)

List the IVF techniques performed in your lab. Staff can then be certified in these techniques via their Skills profile.

<Tabs groupId="display-mode">
  <TabItem value="by-shift" label="By Shift">

Techniques appear as secondary information on staff chips. The engine tracks which techniques are covered each day and raises a warning if a required technique has no certified staff assigned.

  </TabItem>
  <TabItem value="by-task" label="By Task">

Techniques become the **rows** of the schedule grid. Each technique you add here becomes a dedicated row that the AI engine fills with certified staff. Make sure every technique has at least one staff member certified in it, or the engine will leave that row empty.

  </TabItem>
</Tabs>

## Departments

If your lab has multiple departments (e.g. Lab, Andrology, Genetics), define them here. Department filters let you view the rota for one department at a time.

## Coverage ratios

Set the **minimum** and **optimal** staff-to-procedure ratios. The engine will warn if a generated day falls below the minimum and will aim to reach the optimal ratio when possible.

## Punctions (procedure load)

Enter the expected number of egg retrievals (punciones) per day. The engine uses these to calculate how many staff are needed each day and adjusts recommendations accordingly. You can edit actual punctions directly on the week view.
