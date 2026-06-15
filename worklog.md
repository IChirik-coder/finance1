# Worklog

---
Task ID: 1
Agent: main
Task: Fix console error: script tag in React component

Work Log:
- Identified `<script dangerouslySetInnerHTML>` in layout.tsx `<head>` causing React 19 hydration error
- Replaced raw `<script>` with Next.js `<Script>` component from `next/script`
- Moved `<Script>` from `<head>` into `<body>` as required by Next.js 16
- Used `strategy="beforeInteractive"` for theme flash prevention

Stage Summary:
- Script tag error resolved
- Theme init script still works via Next.js Script component

---
Task ID: 2
Agent: main
Task: Fix hydration mismatch: server/client theme icon difference

Work Log:
- Diagnosed root cause: `isDark` useState lazy initializer returned different values on server (true) vs client (reads localStorage, could be false/light)
- Server rendered Sun icon (isDark=true), client rendered Moon icon (isDark=false when theme=light)
- Added `mounted` state to defer client-specific rendering until after hydration
- Changed `isDark` initialization from lazy initializer with `typeof window` check to simple `useState(true)` SSR default
- Moved localStorage reading to `useEffect([], [])` which only runs on client after mount
- Added `suppressHydrationWarning` on theme toggle button as extra safety
- Also fixed `platforms` state: changed from `loadPlatforms()` lazy init (which reads localStorage) to `DEFAULT_PLATFORMS` constant, then loads custom platforms in mount effect

Stage Summary:
- Hydration mismatch fully resolved
- Both theme icon and platforms now use SSR-safe defaults, then update on client mount
- Theme flash prevention still works via the `<Script>` in layout.tsx

---
Task ID: 1
Agent: main
Task: Reverse transaction order (newest first) + Fix optimistic updates

Work Log:
- Changed API orderBy from `{ date: 'desc' }` to `[{ date: 'desc' }, { createdAt: 'desc' }]` so newest-added transactions appear first within same-day groups
- Added full optimistic update for handleAddSubmit: creates temporary transaction object, prepends to transactions array, updates monthHistory, then forceRefreshes in background
- Added full optimistic update for handleEditSubmit: creates updated transaction object, replaces in transactions array immediately (all derived values like balance, tax, expense ratio auto-recalculate), then forceRefreshes in background
- Both add and edit now show toast BEFORE server confirms (instant feedback), with error rollback via forceRefresh
- Delete already had optimistic updates from previous session

Stage Summary:
- Transactions now display newest-first within each day group
- All mutations (add, edit, delete) now update UI instantly with optimistic updates
- Server confirmation via forceRefresh() happens in background for data consistency
