# Weblab Wireframes Feature Spec

## Goal
Add a Relume-style AI wireframing workflow to Weblab that lets users generate a sitemap, convert it into editable wireframes, apply a style guide, and then turn wireframes into designed pages using existing Weblab UI blocks.

## Product Flow
1. User creates a project.
2. User enters a short brief:
   - company/product name
   - industry
   - target audience
   - offer/value proposition
   - required pages
   - tone/style
   - optional references
3. AI generates a sitemap:
   - pages
   - page hierarchy
   - sections per page
   - section title
   - section purpose
   - suggested block type
4. User edits sitemap manually.
5. User clicks “Generate Wireframes”.
6. AI maps every sitemap section to an existing shadcn/Watermelon block.
7. AI fills blocks with structured copy.
8. User can:
   - regenerate page
   - regenerate section
   - add section
   - delete section
   - reorder sections
   - edit copy inline
   - swap block variant
9. User moves to Style Guide.
10. User picks or generates colors, typography, buttons, cards, image style.
11. User clicks “Apply Design”.
12. Weblab converts wireframes into styled design pages.
13. Later export/build flow uses the existing Weblab project/code generation pipeline.

## Core Principle
The sitemap is the source of truth.

Every wireframe section must be linked to a sitemap section.
Deleting or reordering sitemap sections updates wireframes.
Deleting or reordering wireframe sections updates the sitemap.

## Data Model

### Project
- id
- name
- brief
- activeMode: sitemap | wireframe | styleGuide | design
- createdAt
- updatedAt

### SitemapPage
- id
- projectId
- title
- slug
- description
- order
- parentPageId nullable
- sections[]

### SitemapSection
- id
- pageId
- title
- description
- intent
- suggestedBlockType
- order
- linkedWireframeSectionId nullable

### WireframePage
- id
- projectId
- sitemapPageId
- title
- slug
- sections[]

### WireframeSection
- id
- wireframePageId
- sitemapSectionId
- blockId
- blockVariantId
- blockCategory
- contentJson
- order

### StyleGuide
- id
- projectId
- conceptName
- colors
- typography
- radius
- spacing
- buttonStyle
- cardStyle
- imageStyle
- isActive

## AI Responsibilities

### Sitemap generation
Input:
- user brief
- project type
- desired page count
- optional competitor/reference notes

Output strict JSON:
- pages
- slugs
- sections
- section descriptions
- suggested block categories

Rules:
- no generic filler
- no duplicate sections unless intentional
- every page must have navbar and footer
- homepage must have hero, proof/value, CTA
- use practical B2B/B2C landing page structure

### Wireframe generation
Input:
- sitemap JSON
- available block registry
- project brief

Output strict JSON:
- page wireframes
- selected block IDs
- filled copy fields
- image placeholder intent
- CTA labels
- links

Rules:
- only use blocks that exist in the repo
- never hallucinate block names
- fallback to generic section shell only if no matching block exists
- copy must be specific to the brief
- keep wireframes grayscale/unbranded

### Style guide generation
Input:
- project brief
- wireframes
- optional brand preferences

Output:
- 2–4 style concepts
- colors
- fonts
- button style
- card style
- image direction
- short rationale

Rules:
- use existing design token system where possible
- avoid hardcoded brand strings
- never overwrite user edits without confirmation

## Block Registry
Create a central block registry for all shadcn/Watermelon blocks.

Each block must expose:
- id
- name
- category
- tags
- supported content fields
- preview component
- render component
- allowed variants
- recommended use cases

Example categories:
- navbar
- hero
- logo cloud
- feature grid
- split feature
- process
- pricing
- testimonials
- stats
- FAQ
- blog list
- article
- CTA
- footer

## UI Requirements

### Top Mode Switcher
Modes:
- Sitemap
- Wireframe
- Style Guide
- Design

### Sitemap View
- zoomable canvas
- project root node
- page cards
- section cards inside pages
- add/delete/reorder pages
- add/delete/reorder sections
- section prompt editing
- “Generate Wireframes” CTA

### Wireframe View
- zoomable canvas
- one frame per page
- grayscale page previews
- section-level hover controls
- add section
- regenerate section
- swap block
- edit copy
- drag reorder
- responsive preview toggle

### Style Guide View
- left panel: colors, typography, UI styling
- right panel: live page preview
- generate/shuffle concept
- apply concept to all pages
- preserve structure

### Design View
- styled pages using active style guide
- real images or image placeholders
- editable components
- export/build handoff

## MVP Scope
Build:
- project brief form
- sitemap generation
- sitemap editor
- block registry
- sitemap-to-wireframe generation
- wireframe canvas
- basic section edit/swap/regenerate
- one style guide concept
- apply style guide to wireframes

Skip for MVP:
- comments
- multiplayer
- Figma export
- Webflow export
- advanced image generation
- billing limits
- version history

## Edge Cases
- AI returns invalid JSON
- selected block no longer exists
- user deletes linked sitemap section
- page has no sections
- duplicated slugs
- long copy overflows block
- style guide breaks contrast
- project has 20+ pages
- user edits wireframe then regenerates sitemap

## Success Criteria
- User can go from brief to sitemap in under 30 seconds.
- User can generate wireframes from sitemap without manual setup.
- Every wireframe section maps to a real repo block.
- Generated copy is editable.
- Generated pages remain stable after refresh.
- No fake/hallucinated blocks.
- Typecheck passes.