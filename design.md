
# Mobile Design System

## 0. Design Philosophy

Design for:

- clarity
- calmness
- hierarchy
- direct manipulation
- platform familiarity
- minimal cognitive load

The interface should feel:

- premium
- quiet
- responsive
- intentional
- native

Avoid:

- excessive cards
- excessive borders
- excessive shadows
- decorative gradients
- unnecessary animations
- dense dashboards
- tiny controls
- modal-heavy flows
- desktop UI squeezed onto mobile

Rule:

> Content first. Controls second. Decoration last.

Every visual element must have a purpose.

---

# 1. Platform Strategy

Design mobile-first.

Use platform conventions instead of inventing custom patterns.

### iOS

Prefer:

- NavigationStack
- native navigation bars
- sheets
- bottom sheets
- tab bars
- swipe-back navigation
- SF Symbols
- Dynamic Type
- system materials
- safe-area aware layouts

### Android

Prefer:

- Material 3 principles
- edge-to-edge layouts
- NavigationBar
- TopAppBar
- ModalBottomSheet
- native ripple / state feedback
- dynamic color where appropriate

Do not force iOS patterns onto Android or Android patterns onto iOS.

The product should share:

- information architecture
- content hierarchy
- design tokens
- interaction principles

But may differ in:

- navigation
- dialogs
- menus
- gestures
- typography
- system components

---

# 2. Visual Language

## Overall

Use a restrained visual system.

Primary visual hierarchy:

1. Content
2. Primary action
3. Secondary information
4. Supporting controls
5. Decoration

Do not use color to compensate for weak hierarchy.

Use:

- typography
- spacing
- scale
- weight
- alignment
- grouping

before using color.

---

# 3. Layout

Use an 8pt spacing system.

Preferred spacing:

4  — micro spacing
8  — related elements
12 — compact grouping
16 — standard padding
20 — section spacing
24 — major grouping
32 — major section
40+
     — visual separation

Default horizontal page padding:

16–20pt.

Use safe-area insets.

Never hard-code the status-bar or home-indicator area.

Content should remain usable on:

- small phones
- large phones
- landscape
- Dynamic Type
- accessibility text sizes

---

# 4. Touch Targets

Interactive elements should have a sufficiently large hit area.

iOS:

- target approximately 44×44pt or larger

Android:

- target at least 48×48dp

The visual icon can be smaller than the hit area.

Do not create tiny clickable icons simply because the icon itself is 20–24px.

Increase the invisible hit area instead.

Avoid adjacent controls whose touch regions overlap.

---

# 5. Typography

Typography creates hierarchy.

Prefer the system font.

iOS:
SF Pro / SF Symbols

Android:
Roboto / platform typography

Recommended hierarchy:

Display
Large Title
Title
Headline
Body
Secondary
Caption

Body text should generally be comfortable to read rather than maximally compact.

Avoid:

- all-caps UI
- excessive bold text
- too many font sizes
- decorative fonts
- extremely thin text

Support Dynamic Type / system font scaling.

Never design around a single fixed font size.

Text must remain usable when accessibility font size is increased.

---

# 6. Color

Use semantic colors rather than hard-coded colors.

Define:

background
surface
elevatedSurface
primary
secondary
tertiary
accent
success
warning
error
separator

Support:

Light Mode
Dark Mode
High Contrast

Color should communicate meaning.

Do not use:

- gradients everywhere
- saturated backgrounds
- multiple accent colors
- colored borders for every component

Prefer mostly neutral surfaces with one strong accent.

---

# 7. Surfaces

Use depth sparingly.

Preferred hierarchy:

background
→ grouped surface
→ elevated surface
→ floating element

Use one of:

- spacing
- subtle material
- shadow
- tonal contrast

to establish hierarchy.

Do not combine all four.

Avoid the "everything is a card" design.

Cards should represent meaningful grouping, not simply wrap every component.

---

# 8. Corner Radius

Use a small set of radii.

small:
8

medium:
12

large:
16

pill:
999

Use radius consistently.

Do not randomly mix:
6 / 10 / 14 / 18 / 22 / 28.

Large radius should be reserved for:

- sheets
- prominent containers
- large media
- floating surfaces

---

# 9. Navigation

Use the simplest navigation model that matches the information architecture.

Prefer:

Tab Bar
→ top-level destinations

Navigation Stack
→ hierarchical content

Sheet
→ temporary task

Bottom Sheet
→ contextual selection / action

Full-screen flow
→ focused task

Avoid deep navigation.

Target:

Most common tasks should require
no more than 2–3 navigation steps.

---

# 10. Primary Actions

Every screen should have an obvious primary action when one exists.

Primary action should be:

- visually dominant
- easy to reach
- predictable
- consistent

Do not create multiple competing primary buttons.

Prefer one:

Primary

and several:

Secondary / Tertiary

---

# 11. Buttons

Button hierarchy:

Primary
Secondary
Tertiary
Destructive

Primary buttons should be visually obvious.

Secondary buttons should not compete with the primary action.

Text-only actions are appropriate when the action is low emphasis.

Icon-only buttons require:

- recognizable icon
- accessible label
- sufficiently large hit area

Never use an unfamiliar icon when text would be clearer.

---

# 12. Lists

Lists should feel lightweight.

Prefer:

icon + title
        supporting text
        trailing value/action

rather than boxed cards.

Use separators only when they improve scanability.

Group related rows using:

- spacing
- section headers
- subtle backgrounds

Avoid heavy borders.

---

# 13. Forms

Forms should minimize cognitive load.

Prefer:

Label
Input
Supporting information

rather than:

Label + placeholder only.

Placeholder text is not a replacement for a label.

Validate as close to the source as possible.

Errors should explain:

what happened
why it happened
how to fix it

Avoid generic:

"Invalid input"

Prefer:

"Password must contain at least 8 characters."

---

# 14. Sheets / Modals

Use modals only when the user must focus on a task.

Prefer sheets for:

- selection
- filters
- contextual actions
- short forms

Avoid modal dialogs for ordinary navigation.

Do not stack modals.

Avoid:

Modal
→ Modal
→ Modal

Whenever possible, turn the flow into a normal navigation hierarchy.

---

# 15. Feedback

Every meaningful interaction should have appropriate feedback.

Use:

pressed state
loading state
success state
error state
empty state

Feedback should be:

fast
subtle
informative

Avoid gratuitous animations.

Never animate merely because something can animate.

---

# 16. Motion

Motion should explain:

- where something came from
- where it went
- what changed
- what is interactive

Prefer:

fade
slide
scale
shared-element transitions

Keep animations short and responsive.

Avoid:

- bouncing UI
- excessive parallax
- decorative particles
- long transitions

Respect reduced-motion settings.

---

# 17. Gestures

Use gestures to accelerate common actions.

Good:

swipe back
pull to refresh
swipe actions
drag
long press where appropriate

Do not make essential functionality gesture-only.

If an action is important:

provide a visible alternative.

---

# 18. Loading

Avoid unnecessary spinners.

Prefer:

skeleton
progressive rendering
optimistic updates

For short operations:

show immediate feedback.

For long operations:

show meaningful progress.

Never freeze the interface without explanation.

---

# 19. Empty States

Empty states should answer:

1. What is empty?
2. Why is it empty?
3. What can I do?

Example:

No saved items yet

Save something to find it here later.

[Explore items]

Avoid decorative empty-state illustrations unless they add meaning.

---

# 20. Error States

Errors should be calm and actionable.

Structure:

What happened

Why it happened, if useful

What the user can do

[Retry]

Avoid:

Something went wrong!!!

Do not use red for the entire screen.

Use red only where it communicates an error.

---

# 21. Accessibility

Accessibility is a first-class requirement.

Support:

- Dynamic Type
- screen readers
- sufficient contrast
- reduced motion
- larger text
- semantic labels
- keyboard / switch access where applicable

Minimum touch target:

iOS: approximately 44×44pt
Android: 48×48dp

Do not rely solely on color to communicate state.

Important information must remain understandable without color.

---

# 22. Responsive Behavior

Do not assume one screen size.

Design for:

small phone
standard phone
large phone
tablet
landscape

Prefer adaptive layouts over device-specific coordinates.

Avoid:

absolute positioning
fixed heights
screen-size hacks

Content should determine height whenever possible.

---

# 23. Component Rules

Build components from reusable primitives.

Core primitives:

Text
Icon
Button
Image
Divider
Spacer
Surface
Input
ListItem
Sheet
Toast
Banner

Compose larger components from primitives.

Do not create one-off styling when an existing component can be reused.

---

# 24. States

Every interactive component must consider:

default
pressed
focused
disabled
loading
selected
error
success

Do not design only the happy path.

---

# 25. Icons

Prefer platform-native icons.

iOS:
SF Symbols

Android:
Material Symbols / platform-appropriate icons

Icons should be:

simple
recognizable
consistent
optically balanced

Never mix multiple icon styles.

Do not use emojis as UI icons.

---

# 26. Images

Images should have intentional aspect ratios.

Prefer:

1:1
4:3
16:9

Avoid arbitrary image dimensions.

Use clipping and corner radius consistently.

Do not distort images.

Use placeholders while loading.

---

# 27. Content Density

Mobile is not desktop in a smaller viewport.

Reduce:

columns
controls
metadata
secondary actions

Increase:

whitespace
hierarchy
tap area
content focus

If a screen feels crowded:

remove information before shrinking everything.

---

# 28. Design Tokens

All visual values should come from tokens.

Example:

spacing.xs = 4
spacing.sm = 8
spacing.md = 12
spacing.lg = 16
spacing.xl = 24
spacing.xxl = 32

radius.sm = 8
radius.md = 12
radius.lg = 16
radius.pill = 999

Do not scatter raw values throughout the codebase.

---

# 29. Anti-Patterns

Never introduce these without a strong reason:

- desktop-style sidebars on phones
- excessive cards
- excessive borders
- excessive shadows
- tiny icon buttons
- huge hero sections
- unnecessary gradients
- excessive glassmorphism
- modal chains
- hamburger menus for primary navigation
- gesture-only important actions
- text inside images
- fixed screen heights
- absolute-positioned UI
- arbitrary pixel values
- inconsistent corner radii
- five different button styles

---

# 30. Quality Bar

Before considering a screen complete, verify:

### Hierarchy

Can the user identify the most important thing within 1 second?

### Navigation

Is the next action obvious?

### Touch

Can every important control be comfortably tapped?

### Typography

Does the layout survive larger text?

### Accessibility

Does the UI work without relying on color?

### Dark Mode

Does the hierarchy still work?

### Motion

Does animation explain something?

### Density

Does the screen feel calm rather than crowded?

### Consistency

Does it look like the same product?

### Platform

Does it feel native on the target OS?

---

# 31. Golden Rule

Do less.

Remove anything that does not improve:

- understanding
- navigation
- interaction
- feedback
- trust

The best mobile UI is not the one with the most polished components.

It is the one where the user rarely has to think about the interface.
