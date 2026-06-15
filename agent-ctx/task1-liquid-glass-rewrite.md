# Task: Restore Liquid-Glass Design with Light/Dark Theme Toggle

## Summary
Rewrote 3 key files to restore the liquid-glass design system with light/dark theme toggle for the finance tracker app.

## Files Modified

### 1. `/home/z/my-project/src/app/globals.css`
- Replaced old dark-only space theme (space-bg, stars, glass-heavy, glass-pill, pill-press) with liquid-glass design system
- Added complete light theme (`:root`) with colors: background #f0f2f7, foreground #1a1a2e
- Added dark theme (`.dark`) with colors: background #0a0a12, foreground #ffffff
- Implemented all liquid-glass classes with light + dark variants:
  - `.liquid-glass` — main card with gradient, blur, border, shadow, ::before shine, ::after bottom line
  - `.liquid-glass-sm` — small elements (buttons, icons)
  - `.liquid-glass-btn` — blue action button
  - `.liquid-glass-hero` — large balance card with blue/purple gradient
  - `.liquid-glass-green` — income card
  - `.liquid-glass-red` — expense card
  - `.liquid-glass-blue` — tax/calculation card
  - `.liquid-glass-input` — form inputs
  - `.liquid-glass-dialog` — dialog/modal overlay
  - `.nav-bar` — fixed navbar with blur
  - `.transaction-row` — list items with hover
  - `.section-divider` — gradient divider
  - `.bg-ambient` — floating gradient blobs with animation
  - `.animate-fade-in-up` — entrance animation
- Added custom scrollbar styles for both light/dark
- Safe area support preserved

### 2. `/home/z/my-project/src/app/layout.tsx`
- Added Google Fonts preconnect for Inter
- Added inline script in `<head>` to check localStorage `finance_theme` and add `dark` class (prevents flash)
- Updated viewport themeColor to #f0f2f7
- Replaced `space-bg` + `stars` divs with `bg-ambient`
- Updated Toaster toast options for light theme compatibility
- Removed hardcoded `className="dark"` from html element (now dynamic)

### 3. `/home/z/my-project/src/app/page.tsx`
- **Removed**: Search/Eye/EyeOff icons, Separator import, styled-jsx, isBalanceHidden, searchQuery/showSearch states
- **Added**: Sun/Moon icons, isDark state with localStorage persistence (`finance_theme` key)
- **Added**: Theme toggle button in navbar
- **Changed**: Navbar to use `nav-bar` class with 3 icon-only buttons (theme, settings, add)
- **Changed**: All styling from glass-pill/glass-heavy/glass-accent to liquid-glass variants
- **Changed**: Balance hero card uses `liquid-glass-hero` with `text-gradient-blue`
- **Changed**: Income card uses `liquid-glass-green`, Expense card uses `liquid-glass-red`
- **Changed**: Net calculation uses `liquid-glass-blue` with `section-divider`
- **Changed**: Delete via query param: `fetch(/api/transactions?id=${deleteTarget}, {method:'DELETE'})`
- **Changed**: Unified `refreshData` function
- **Changed**: Removed useCallback/useMemo in favor of React Compiler auto-memoization
- **Changed**: Used `useState(() => loadPlatforms())` lazy initializer instead of useEffect
- **Changed**: Used `requestAnimationFrame` for data fetching effect to avoid lint issues
- **Changed**: All text colors use CSS variables (text-foreground, text-muted-foreground) for theme support
- **Changed**: Removed `[color-scheme:dark]` from date input
- StatCard and TransactionRow remain memo'd sub-components

### 4. `/home/z/my-project/src/hooks/use-mobile.ts` (bonus fix)
- Fixed `set-state-in-effect` lint error by using lazy initializer for useState

## Lint Status
- 0 errors, 1 warning (Google Fonts warning in layout.tsx - expected)
- Dev server compiles and runs correctly
- API routes work correctly (GET/POST/PUT/DELETE)
