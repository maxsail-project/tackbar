# Admin UX/UI Guidelines

## Purpose

This document defines the UX/UI conventions for TackBar Admin.

It is the source of truth for:

- Admin information hierarchy;
- interaction semantics;
- cross-entity navigation;
- list/detail behavior;
- traceability presentation;
- action presentation;
- status presentation;
- responsive layout;
- visual consistency across Admin sections.

These rules apply to:

- Ingestions;
- Activities;
- Sailors;
- Sessions;
- future Admin entities unless explicitly documented otherwise.

The goal is not to create a generic design system. The goal is to keep TackBar Admin operationally clear, consistent and easy to use on tablet and mobile.

---

## Core principles

Admin should make it easy to:

```text
find the correct entity
→ understand its operational state
→ follow its relationships
→ perform maintenance actions
→ inspect deeper evidence only when needed
```

Prefer clarity over density.

Prefer one reusable interaction pattern over entity-specific UI inventions.

Do not expose technical detail merely because it exists.

Do not make read-only information look interactive.

Do not make navigation look like a maintenance action.

---

## Admin navigation model

The top-level Admin order is:

```text
INGESTIONS → ACTIVITIES → SAILORS → SESSIONS
```

Each primary entity belongs to exactly one top-level Admin section.

### Entity ownership rule

A full entity detail must always open in that entity's own section.

Examples:

```text
Ingestion → Activity  => Activities
Ingestion → Sailor    => Sailors
Ingestion → Session   => Sessions

Activity → Ingestion  => Ingestions
Activity → Sailor     => Sailors
Activity → Session    => Sessions

Sailor → Activity     => Activities
Sailor → Session      => Sessions

Session → Activity    => Activities
Session → Sailor      => Sailors
```

Do not embed the full detail of another primary entity inside the current section.

Cross-entity relationships should navigate.

---

## Entity list and detail pattern

Primary Admin sections use the same interaction model:

```text
single-column compact entity list
        ↓
select one entity
        ↓
one full-width expanded detail
```

Rules:

- one entity per row;
- collapsed rows remain compact and scan-oriented;
- at most one entity is expanded at a time within a section;
- expanded detail uses the full available Admin width;
- opening another entity closes the previous expanded detail;
- do not use a persistent side panel merely to preserve the entity list;
- do not reintroduce a two-column outer card grid on wider screens.

Responsive breakpoints may change the composition inside the expanded detail, but not this outer interaction model.

---

## Information hierarchy

Admin follows progressive disclosure.

Default hierarchy:

```text
SUMMARY
↓
OPERATIONAL DETAIL
↓
ADVANCED
↓
DIAGNOSTIC JSON
```

Not every entity must use all four levels.

### Summary

The summary supports fast scanning and triage.

It should contain only the minimum information required to:

- identify the entity;
- understand its high-level current state;
- distinguish it from neighboring records.

Do not place dense metadata, raw IDs, technical diagnostics or maintenance controls in the summary unless required for normal identification.

### Operational detail

Operational detail contains the information required for routine Admin work.

Typical content includes:

- lifecycle state;
- relationships;
- traceability;
- source/context;
- current access state;
- maintenance-relevant facts;
- semantic actions.

Operators should not need raw JSON to answer normal operational questions.

### Advanced

Advanced is optional.

Use it for lower-frequency technical evidence that is useful for investigation but not required for normal Admin operation.

Typical content includes:

- full identifiers;
- hashes;
- technical traceability;
- lower-frequency timestamps;
- source-specific technical metadata;
- technical track metadata;
- other denser diagnostic context.

Do not place routine operational information in Advanced merely to reduce UI work.

#### Technical traceability

When exact identifiers are useful for investigation, expose them in a compact `TECHNICAL TRACEABILITY` group inside Advanced.

Prefer this hierarchy:

```text
TRACEABILITY
human-readable entity identity and navigation

ADVANCED
TECHNICAL TRACEABILITY
exact IDs and lower-frequency technical relationships

DIAGNOSTIC JSON
deepest structured evidence
```

Operational TRACEABILITY should prefer human-readable identity.

Examples:

- Sailor → name, then email, then compact ID as final fallback;
- Activity → sailing date and time/interval;
- Session → sailing date and interval;
- Source Ingestion → attachment/filename and useful temporal context where available.

Full UUIDs should not be the primary operational identity when a meaningful human-readable representation exists.

Technical Traceability may include, where relevant:

- Sailor ID;
- Activity ID;
- Session ID;
- Source Ingestion ID;
- Default Boat ID;
- exact related-entity identifiers useful for investigation.

When a relationship is ambiguous, Advanced may expose the related candidate identifiers as diagnostic evidence, provided that:

- the ambiguity is explicit;
- no candidate is presented as authoritative;
- normal operational TRACEABILITY does not guess or silently select a target.

#### Technical track detail

For an Activity, Advanced may expose technical information about the canonical normalized track when useful for operational investigation.

Suitable information includes:

- sample count;
- duration;
- approximate/effective sample frequency;
- available telemetry channels such as SOG, COG, HDG, HEEL and TRIM.

This is technical track evidence, not a second analytics surface.

Do not add analytical summaries such as average, minimum, maximum or performance metrics merely because the raw telemetry exists unless a separate requirement explicitly promotes them.

### Diagnostic JSON

Diagnostic JSON is the deepest evidence layer.

It must:

- remain read-only;
- remain Admin-only;
- be obtained through backend Admin APIs;
- avoid unnecessary secrets;
- never become a persistence editor;
- never substitute for an incomplete operational UI.

If operators repeatedly need JSON to answer a normal operational question, promote the relevant information to an earlier layer.

---

## Interaction grammar

Every visible Admin element should have a clear semantic role.

The primary roles are:

```text
DATA
RELATION
ACTION
STATUS
DISCLOSURE
```

These roles must remain visually distinguishable.

The semantic role of an element is more important than the entity in which it appears.

A Sailor relation, Activity relation, Session relation or Ingestion relation should therefore use the same interaction language when they perform the same kind of navigation.

---

## Data

Data is read-only information.

Examples:

- dates;
- times;
- duration;
- counts;
- source/provider;
- device;
- filename;
- Sail number;
- creation timestamps;
- expiry timestamps;
- IDs when shown in Advanced;
- hashes.

Data must not look clickable.

Use:

- text;
- definition lists;
- compact fact blocks;
- tables or structured rows where appropriate.

Avoid:

- button-like borders;
- hover states;
- chevrons;
- focus affordances;
- raised cards that imply interaction.

A boxed value is acceptable only when the visual treatment clearly communicates "fact", not "control".

---

## Relations

Relations connect one TackBar entity to another.

Examples:

- Ingestion → Activity;
- Activity → Sailor;
- Activity → Session;
- Activity → Ingestion;
- Sailor → Activity;
- Sailor → Session;
- Session → Activity;
- Session → Sailor.

Relations must use one consistent Admin visual pattern.

A relation should:

- clearly look navigable;
- identify the relation type;
- show a human-readable value when available;
- allow a compact ID fallback when necessary;
- use the same hover/focus behavior everywhere;
- navigate to the owning Admin section.

A relation should not look like a destructive or maintenance button.

Prefer a reusable relation-row/component over ad hoc inline links or entity-specific implementations.

### Relation availability

When a relation is unavailable:

- show a non-clickable unavailable state;
- do not render a disabled-looking button unless it is truly a disabled control;
- do not guess an entity relationship.

When a relation is ambiguous:

- show the ambiguity explicitly;
- do not silently select one target.

---

## Actions

Actions perform an operation.

Examples:

- Copy link;
- Open session;
- Renew;
- Regenerate;
- Revoke;
- Reprocess;
- Discard;
- Restore;
- Recalculate maneuvers;
- Resend email.

Actions use buttons or action links.

They must be visually distinct from entity relations.

### Action hierarchy

Use visual emphasis proportionately:

- normal operation;
- secondary operation;
- destructive/security-sensitive operation.

Destructive or security-sensitive actions should retain explicit warning treatment and confirmation where already required.

Do not use button styling for read-only facts.

---

## Open versus navigate

Opening a product/runtime surface and navigating inside Admin are different semantics.

For example:

```text
Activity → Sailor
= Admin relation/navigation

Open session
= action that opens Viewer/runtime access
```

These should not share the same visual treatment unless there is a strong reason.

Cross-entity Admin navigation should use the relation pattern.

Opening a Viewer, personal page, temporary share or another runtime surface should use the action pattern.

---

## Status

Status is represented using badges or compact status text.

Examples:

- ACTIVE;
- EXPIRED;
- CURRENT;
- STALE;
- MISSING;
- SHAREABLE;
- NOT SHARED;
- AVAILABLE;
- UNAVAILABLE;
- VALID;
- PROCESSED;
- FAILED.

A badge communicates state.

A badge must not be used as:

- a button;
- a navigation control;
- a substitute for an action.

Status colors and styles should be reused consistently.

Do not invent a new status color for every entity when an existing semantic category applies.

The same word should carry the same semantic meaning wherever practical.

For example, `ACTIVE` must not mean Session lifetime in one place and capability state in another without sufficient surrounding context.

---

## Disclosure controls

Disclosure reveals more information without changing domain state.

Examples:

- expand entity detail;
- Advanced;
- Diagnostic JSON;
- active temporary share detail.

Disclosure must not look like a maintenance operation.

Use consistent disclosure affordances such as:

- row expansion;
- `<details>/<summary>`;
- chevrons where appropriate.

Do not use disclosure when navigation to another entity is the correct semantic action.

---

## Traceability

Traceability expresses relationships between TackBar entities and operational provenance.

Use traceability for entity-to-entity relationships.

For example:

```text
Activity
→ Sailor
→ Session
→ Ingestion
```

Traceability should not be mixed with unrelated source metadata.

### Activity example

```text
TRACEABILITY

Sailor
Session
Source Ingestion
Boat context
```

### Session example

```text
MEMBERSHIP / TRACEABILITY

Activity
Owning Sailor
Current shareability
```

When relation semantics exist, reuse the common relation pattern.

Traceability information should answer questions such as:

- where did this entity come from?
- what other TackBar entity owns or contains it?
- what entity should an operator inspect next?

---

## Source

Use `SOURCE` for origin metadata, not TackBar entity relationships.

Examples:

- provider/source;
- device;
- original filename;
- source-specific metadata.

Do not place the Ingestion relation inside `SOURCE` when Ingestion is being represented as a TackBar traceability entity.

For example:

```text
TRACEABILITY
Source Ingestion → navigable Ingestion entity

SOURCE
Provider/source
Device
Original filename
```

---

## Section naming

Use the same section name when the same semantic concept appears across Admin.

Preferred vocabulary includes:

- CURRENT STATE;
- CONSENT;
- CONSENT TIMELINE;
- PERSONAL TACKBAR;
- TRACK;
- TRACEABILITY;
- SOURCE;
- MEMBERSHIP / TRACEABILITY;
- SESSION ACCESS;
- TEMPORARY QR ACCESS;
- COMMUNICATION;
- LIFETIME;
- MAINTENANCE;
- MANEUVERS;
- ADVANCED;
- DIAGNOSTIC JSON.

Use `SESSION ACCESS` for the Session's original capability.

Use `TEMPORARY QR ACCESS` for temporary QR-based access delegation to that same Session.

Do not use `SHARED ACCESS` when it would blur these two different access mechanisms.

Do not introduce alternate labels for an existing concept without a product reason.

Entity-specific sections are allowed when they represent genuinely different concepts.

Consistency does not require every entity to contain exactly the same sections.

---

## Layout rules

### Outer layout

Primary entity lists are always single-column.

Do not change the outer entity list into multiple columns simply because more horizontal space is available.

### Expanded detail

Expanded detail may use internal columns.

The number of columns must depend on content, not on arbitrary entity-specific styling.

Use multiple columns when:

- groups are independent;
- values are short;
- the layout improves scanning;
- no block becomes cramped.

Use full-width sections when:

- content is relational;
- text is long;
- history/timeline is involved;
- tables/lists need horizontal space;
- maintenance actions need room;
- diagnostics are shown.

### Avoid empty space

Do not force two-column layouts when one column has little or no content.

Avoid large blank areas created by fixed grids.

Prefer natural content flow and full-width sections where appropriate.

A two-column layout should provide a clear readability advantage over a single-column layout.

---

## Fact layout

Read-only facts should use a consistent pattern.

For short independent facts, a definition-list grid is appropriate.

Example:

```text
Created        Sep 16, 2026
Expires        Nov 15, 2026
Remaining      33 days
```

Use one or two columns depending on available width.

Do not make each fact appear as an independent button/card unless the design clearly communicates non-interactivity.

### Column consistency

Equivalent groups should use equivalent layout rules.

Do not render one set of three short facts in two columns and another equivalent set in one column without a content or responsive reason.

The grid should adapt predictably based on:

- available width;
- number of facts;
- expected value length;
- semantic grouping.

---

## Relationship layout

Entity relations should use the same reusable pattern.

Example:

```text
Sailor            Mariano Arroyo          ›
Session           Sep 16 · 11:45–16:11    ›
Source Ingestion  Sep 16 · track.csv       ›
```

The relation component should remain recognizable across Ingestions, Activities, Sailors and Sessions.

Avoid mixing:

- inline text link in one screen;
- bordered button in another;
- nested card in another;
- ordinary text with only a subtle hover effect elsewhere.

Where the target has a meaningful human-readable identity, show it instead of making the UUID the primary value.

---

## Membership layout

Membership is a relationship and should follow the same interaction principles as traceability.

For Session membership, a suitable row is:

```text
Activity a4c643…   Mariano Arroyo   SHAREABLE   ›
Activity 74df21…   Leandro A.       NOT SHARED  ›
```

The row should make clear:

- the Activity is the technical Session member;
- the Sailor owns the Activity;
- shareability is current visibility state;
- `NOT SHARED` does not remove Session membership.

If Activity and Sailor are independently navigable, their interactive affordances must remain understandable and must not resemble maintenance actions.

---

## Maintenance layout

Maintenance actions should be grouped under a dedicated section when the entity has several operational actions.

Example:

```text
MAINTENANCE

Renew Session
90 days
[ Renew ]

[ Regenerate capability ]
[ Revoke capability ]
```

Maintenance should not compete visually with normal entity relations or read-only facts.

Maintenance controls should generally appear after the facts needed to understand their consequences.

---

## Session access layout

For Session Admin detail, distinguish the Session's original capability from temporary QR-based access delegation.

Use two sections with equivalent operational weight:

```text
SESSION ACCESS

Original capability
Active

[ Copy link ] [ Open session ]


TEMPORARY QR ACCESS

1 active · 2 expired · 0 unavailable

Active temporary share
Expires Oct 15 · 09:20
47h remaining

[ Copy temporary link ] [ Open temporary share ]
```

`SESSION ACCESS` represents the Session's original capability.

`TEMPORARY QR ACCESS` represents temporary access delegation to the same Session.

A temporary QR share:

- is not a separate Session;
- must not be described as a "Temporary Session";
- does not change Session membership;
- does not replace the original capability.

Keep current access state and usable Copy/Open actions inside their respective access sections.

`Regenerate` and `Revoke` belong in `MAINTENANCE`, not mixed with routine Copy/Open access actions.

Historical expired or unavailable temporary shares should remain summarized in normal operational detail unless deeper investigation is required.

---

## Responsive behavior

Admin has one information architecture across mobile, tablet and desktop.

Responsive behavior may change:

- stacking;
- number of internal columns;
- wrapping;
- visibility of secondary labels;
- disclosure defaults.

Responsive behavior must not change:

- semantic role;
- navigation behavior;
- entity ownership;
- status meaning;
- action meaning;
- information hierarchy.

### Mobile

Prefer:

- vertical stacking;
- compact relation rows;
- full-width controls where necessary;
- progressive disclosure;
- no horizontally cramped multi-column grids.

Avoid presenting three or four narrow columns merely because the desktop layout uses them.

### Tablet / desktop

May use:

- two or three internal columns for compact independent facts;
- wider relation rows;
- full-width history or relational sections.

Do not reintroduce side-by-side primary entity cards.

---

## Spacing and rhythm

Use a consistent vertical rhythm across all Admin sections.

Keep consistent:

- section heading spacing;
- section padding;
- relation-row gap;
- action-group gap;
- fact-grid gap;
- divider usage;
- Advanced/Diagnostic spacing.

Avoid entity-specific spacing unless the content requires it.

Sections with equivalent semantic weight should feel visually equivalent.

### Blank space

Whitespace should communicate hierarchy, not appear accidentally because of rigid grid structures.

Avoid:

- large unused halves of a two-column section;
- excessive vertical gaps between a heading and its first fact;
- different padding for semantically equivalent blocks;
- empty columns caused by odd numbers of fields when a more natural layout is available.

Whitespace should make scanning easier, not make the Admin appear fragmented.

---

## Typography

Use typography to express hierarchy, not decoration.

Recommended levels:

```text
Page title
Entity summary title
Section heading
Field label
Field value
Secondary metadata
```

Section headings should use one consistent style across Admin.

Field labels and values should use consistent relative emphasis.

Do not rely on font weight alone to indicate interactivity.

Do not use typography that makes ordinary data resemble a clickable control.

---

## IDs

Prefer human-readable identity in operational views.

Examples:

- Sailor name/email;
- sailing date/time;
- attachment name;
- Session sailing interval.

Use compact IDs only when necessary.

Full UUIDs belong primarily in:

- Advanced;
- Diagnostic JSON.

An ID should not become the primary visual identity when a meaningful human-readable representation exists.

---

## Dates and times

Dates and times are data unless explicitly part of a disclosure/navigation control.

They must not visually resemble buttons.

Use consistent formatting within Admin.

Sailing time should be distinguished from technical timestamps such as:

- `created_at`;
- `received_at`;
- `expires_at`;
- processing timestamps.

### Sailing context

When sailing date/time identifies an Activity or Session, it may be visually prominent.

Prominence does not imply interactivity.

A prominent sailing interval must still look like a heading or fact, not a button.

---

## Counts

Counts are informational unless intentionally used as filters or navigation.

Examples:

- Activities;
- Sailors;
- samples;
- shareable Activities;
- temporary share counts.

Do not style plain counts as interactive controls.

Counts may appear in compact summaries when they materially help identify or triage the entity.

---

## Empty and unavailable states

Use clear, semantic language.

Preferred examples:

- `Unavailable`;
- `Not available`;
- `No related Ingestion`;
- `No Sessions recorded`;
- `No temporary QR shares`.

Avoid placeholder controls that look disabled when the concept is simply absent.

Unavailable relations should not expose an interaction affordance.

---

## Consistency before invention

Before adding a new Admin UI pattern, first check whether an existing Admin component or pattern already represents the same semantic role.

Reuse it unless the requirement explicitly needs different behavior.

Examples:

- use the common relation pattern for entity navigation;
- use the common badge pattern for status;
- use the common action group for maintenance;
- use the common Advanced/Diagnostic pattern for technical evidence;
- use the common compact-summary pattern for expandable primary entities.

Do not create a second visual implementation of the same semantic role merely because the entity is different.

If the existing shared pattern is inadequate, improve the shared pattern where practical rather than creating a local exception.

---

## Shared components and CSS

Admin semantic consistency should be reflected in implementation structure where practical.

Prefer reusable components/classes for common semantic roles such as:

- entity summary;
- entity relation;
- fact grid;
- status badge;
- action group;
- maintenance section;
- Advanced disclosure;
- Diagnostic JSON.

Do not create abstraction solely for abstraction's sake.

A shared component is justified when it helps preserve the semantic consistency defined by this guide.

CSS class names should preferably describe semantic roles rather than individual pages when the styling is intended to be shared.

---

## Accessibility and affordance

Interactive elements must be recognizable as interactive.

Non-interactive elements must not imply interaction.

All interactive elements should have:

- keyboard accessibility;
- visible focus state;
- appropriate hover state;
- appropriate disabled behavior;
- sufficient target size for tablet/mobile use.

Do not rely exclusively on color to communicate state.

Relations, actions and disclosure controls must remain distinguishable without depending solely on hover behavior, since TackBar Admin is tablet-first.

---

## Touch-first considerations

TackBar Admin must work well on touch devices.

Avoid interaction patterns that depend on:

- hover;
- tiny inline targets;
- precise pointer positioning;
- multiple adjacent small text links.

Relation rows and actions should have practical touch targets.

Compact does not mean difficult to tap.

---

## Admin UI review checklist

Use this checklist when implementing or reviewing Admin UI changes.

### Structure

- [ ] Is the entity shown in its owning Admin section?
- [ ] Does the section follow compact list → one expanded detail?
- [ ] Is at most one entity expanded?
- [ ] Is JSON the deepest evidence layer?

### Semantics

- [ ] Is every visible element clearly Data, Relation, Action, Status or Disclosure?
- [ ] Does any read-only fact look clickable?
- [ ] Does any relation look like a maintenance action?
- [ ] Does any action look like ordinary navigation?
- [ ] Are badges used only for state?
- [ ] Are dates/times visually identifiable as data rather than controls?

### Navigation

- [ ] Do related entities navigate to their own sections?
- [ ] Are relation patterns consistent with the rest of Admin?
- [ ] Are unavailable/ambiguous relations represented without guessing?
- [ ] Are full foreign-entity details avoided inside the current section?

### Layout

- [ ] Is the outer entity list single-column?
- [ ] Are internal columns justified by content?
- [ ] Are there avoidable blank areas?
- [ ] Are long/relational blocks given enough width?
- [ ] Is spacing consistent with other Admin sections?
- [ ] Are equivalent fact groups laid out consistently?

### Responsive

- [ ] Does mobile preserve the same semantics?
- [ ] Does tablet/desktop change composition rather than information meaning?
- [ ] Are controls usable with touch?
- [ ] Are relation rows readable without horizontal crowding?
- [ ] Does any important affordance depend only on hover?

### Operational clarity

- [ ] Can normal Admin questions be answered without JSON?
- [ ] Are maintenance actions clearly separated from facts?
- [ ] Is technical metadata kept out of the summary unless necessary?
- [ ] Are human-readable identifiers preferred over raw UUIDs?
- [ ] Does status terminology have an unambiguous meaning?

### Consistency

- [ ] Was an existing Admin semantic component/pattern reused where applicable?
- [ ] Has a new pattern been introduced for a role that already has a pattern?
- [ ] Do equivalent sections across entities use equivalent spacing and typography?
- [ ] Are links, buttons, relations and disclosures visually distinguishable?

---

## Implementation guidance for coding agents

When implementing Admin UI changes:

1. Read this document before coding.
2. Inspect existing Admin components and styles.
3. Identify the semantic role of each affected element: Data, Relation, Action, Status or Disclosure.
4. Reuse existing semantic patterns where they satisfy this guide.
5. Do not introduce a new interaction pattern for an existing semantic role without explicit justification.
6. Preserve existing domain and backend semantics unless the promoted Issue explicitly changes them.
7. Keep cross-entity navigation aligned with the owning-section rule.
8. Add or update focused regression tests when behavior or navigation changes.
9. For visual-only consistency changes, use proportionate validation rather than automatically running the complete regression suite.
10. Validate relevant responsive behavior when layout or interaction affordance changes.
11. Report any inconsistency between this guide and a promoted Issue before implementation.

This guide defines Admin UX/UI conventions.

It does not override explicit product, domain, consent, persistence, ingestion, capability, Session, Activity or Viewer requirements.

If an explicit promoted Issue intentionally requires different Admin behavior, reconcile the conflict before implementation rather than silently choosing one interpretation.
