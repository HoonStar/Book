---
name: Sonic Noir
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#ebbbb4'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#b18780'
  outline-variant: '#603e39'
  surface-tint: '#ffb4a8'
  primary: '#ffb4a8'
  on-primary: '#690100'
  primary-container: '#ff5540'
  on-primary-container: '#5c0000'
  inverse-primary: '#c00100'
  secondary: '#afc6ff'
  on-secondary: '#002d6d'
  secondary-container: '#005dd2'
  on-secondary-container: '#d6e0ff'
  tertiary: '#cdbdff'
  on-tertiary: '#370096'
  tertiary-container: '#9a7bff'
  on-tertiary-container: '#2f0084'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad4'
  primary-fixed-dim: '#ffb4a8'
  on-primary-fixed: '#410000'
  on-primary-fixed-variant: '#930100'
  secondary-fixed: '#d9e2ff'
  secondary-fixed-dim: '#afc6ff'
  on-secondary-fixed: '#001944'
  on-secondary-fixed-variant: '#004299'
  tertiary-fixed: '#e8deff'
  tertiary-fixed-dim: '#cdbdff'
  on-tertiary-fixed: '#20005f'
  on-tertiary-fixed-variant: '#4f00d0'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
  surface-charcoal: '#1A1A1A'
  glass-border: rgba(255, 255, 255, 0.08)
  active-gradient: 'linear-gradient(135deg, #FF0000 0%, #7C4DFF 100%)'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 48px
  stack-sm: 8px
  stack-md: 24px
  stack-lg: 48px
---

## Brand & Style
The design system is centered on a "Cinematic Immersion" aesthetic, prioritizing content through deep-space backgrounds and high-fidelity interactive elements. The brand personality is sophisticated, rhythmic, and emotionally resonant, designed to make music discovery feel like a premium curated experience.

The visual style leverages **Glassmorphism** and **Minimalism**. By using semi-transparent layers over deep charcoal bases, the UI achieves a sense of depth and hierarchy without visual clutter. Transitions should be fluid and eased, mimicking the rhythmic nature of audio. The target audience is discerning listeners who value a focused, high-end environment for music exploration.

## Colors
The palette is rooted in a "Pure Dark" philosophy. The base neutral is a deep `#0F0F0F` to ensure perfect black levels on OLED screens, while `#1A1A1A` is used for surface containers to create subtle separation. 

The primary color (YouTube Red) is reserved for high-impact actions and playback indicators. A secondary blue and tertiary purple are used to create sophisticated gradients for "Now Playing" states and personalized recommendation cards, providing a vibrant contrast to the monochromatic foundation. Text defaults to high-opacity white for maximum legibility against the dark background.

## Typography
Inter is utilized for its exceptional legibility and neutral, modern character. The scale is designed to be "Display-Heavy," using tight letter spacing and heavy weights for album titles and artist names to create a bold, editorial feel. 

For mobile, the display sizes scale down significantly to preserve the "sleek" aesthetic without causing excessive horizontal scrolling. `label-caps` is specifically intended for metadata (e.g., GENRE, RELEASE DATE) to provide a structured, organized look to dense music data.

## Layout & Spacing
This design system employs a **Fluid Grid** model with a mobile-first priority. On mobile devices, a 4-column grid is used with 16px margins. This scales to a 12-column grid on desktop with generous 48px margins to allow the content to breathe.

The spacing rhythm is strictly based on a 4px baseline. Vertical "stacks" are used to group related content: 8px for metadata-to-title relationships, 24px for section headers-to-content, and 48px between major content blocks. This creates a clear visual hierarchy that feels organized yet airy.

## Elevation & Depth
Depth is expressed through **Tonal Layers** and **Glassmorphism**. Shadows are avoided in favor of subtle inner glows and backdrop blurs. 

1.  **Level 0 (Base):** `#0F0F0F` - The main background.
2.  **Level 1 (Surface):** `#1A1A1A` - Cards and navigation bars.
3.  **Level 2 (Overlay):** Semi-transparent white (4-8%) with a 20px backdrop blur - Used for floating players and modal overlays.

Interactive elements should feature a "rim light" effect—a 1px solid border at 8% opacity—to define edges against the dark background without adding visual weight.

## Shapes
A `Rounded` (0.5rem) language is used to strike a balance between professional precision and approachable warmth. 

- **Cards & Inputs:** 0.5rem (base roundedness).
- **Play Buttons & Avatars:** Fully circular (pill-shaped) to distinguish them as high-priority interactive or identity elements.
- **Modals & Bottom Sheets:** 1.5rem (`rounded-xl`) on top corners to provide a soft, protective feel when content is layered.

## Components
- **Buttons:** Primary buttons use the `active-gradient` or solid `#FF0000`. Secondary buttons are "ghost" style with the `glass-border`.
- **Music Cards:** Aspect ratio is strictly 1:1 for album art. Title and Artist metadata are stacked below with 8px spacing. On hover, cards should subtly scale (1.02x) and increase the intensity of the rim light.
- **Inputs:** Search bars use the Level 1 Surface color with a 1px border that glows slightly when focused.
- **Chips:** Used for genre filtering. They should be pill-shaped with a dark charcoal fill and transition to a white fill with black text when selected.
- **Progress Bars:** Seek bars use a thin 4px track. The "played" portion should be a vibrant gradient, while the "unplayed" portion remains a low-opacity gray.
- **Lists:** List items in tracklists should have a subtle hover state (`#FFFFFF` at 4% opacity) and include a "Three-dot" more menu that is only visible on hover or active state.