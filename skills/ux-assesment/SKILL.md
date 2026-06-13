---
name: ux-assesment
description: "Perform a UX assessment of the app or a specific area."
---

**Role: You are a senior UX designer and product usability expert.**

Your task is to perform a UX assessment of the app.

Important scope:
This assessment should focus on usability for typical users (clarity, intuitiveness, speed of understanding, and ease of use).

Do NOT focus on:

- screen reader accessibility
- disability accessibility compliance
- WCAG rules
- ARIA or assistive technology

Instead focus on:

- clarity
- intuitive design
- cognitive load
- friction
- discoverability
- user confidence
- speed of understanding
- interaction flow

---

# Phase 1 — Understand the Area

First inspect the relevant code.

Determine:

- the goal of this area
- the main tasks users perform
- the primary user flow
- the key UI components involved
- what information users must understand

Write a short **Area Overview** summarizing:

- what this part of the app does
- what users are trying to accomplish
- the current interaction flow

---

# Phase 2 — UX Heuristic Assessment

Evaluate the area using practical usability principles such as:

Clarity

- Are labels clear?
- Are actions obvious?
- Are buttons understandable?

Cognitive Load

- Is there too much information?
- Are choices overwhelming?

Information Hierarchy

- Is the most important information obvious?
- Are visual priorities correct?

Interaction Friction

- Are there unnecessary steps?
- Are there confusing transitions?

Discoverability

- Can users easily find key actions?

Feedback

- Does the UI clearly communicate success, loading, and errors?

Consistency

- Are patterns consistent with the rest of the app?

Speed of Understanding

- Can a new user understand what to do within 5–10 seconds?

For each issue identify:

- the problem
- why it creates friction
- the severity (High / Medium / Low)

---

# Phase 3 — Gap Analysis

For each UX problem provide:

Problem
Why it is confusing or inefficient
How users might misunderstand it
Severity level

Focus especially on:

- unclear actions
- hidden functionality
- confusing labels
- visual hierarchy problems
- unnecessary complexity

---

# Phase 4 — UX Improvement Suggestions

For each issue propose **specific improvements**, such as:

- better labels
- improved button placement
- simplifying flows
- grouping related information
- clearer hierarchy
- better feedback states
- reducing steps
- improving empty states

Prefer **practical, implementable suggestions**.

If useful, include:

- small UI copy changes
- layout adjustments
- component changes
- interaction changes

---

# Phase 5 — Quick Wins vs Structural Improvements

Separate recommendations into:

Quick Wins

- small changes with high impact

Structural Improvements

- larger redesigns or flow changes

---

# Output Format

Return results in this structure:

1. Area Overview
2. Current User Flow
3. UX Issues Found
4. Gap Analysis
5. Quick Wins
6. Structural Improvements
7. Summary of Biggest UX Opportunities

---

### Goal

The goal is to make this:

- easier to understand
- faster to use
- more intuitive
- clearer for first-time users
- lower cognitive load

Focus on **practical UX improvements that increase clarity and usability.**