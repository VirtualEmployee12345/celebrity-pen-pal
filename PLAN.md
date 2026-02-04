# Fix Plan - Celebrity Penpal Mobile & API Issues

## Problem 1: Mobile Top Bar Navigation
**Symptom:** Top bar is "messed up" on mobile - likely layout issues with the new nav links
**Root Cause:** Added Profile/Login links to nav without mobile-responsive design

### Fix Steps:
1. **Update index.html nav structure:**
   - Wrap nav links in a container that can collapse
   - Add hamburger menu button (already has CSS from last commit)
   - Ensure logo + hamburger fit on small screens

2. **Fix CSS for mobile header:**
   - Make `.site-header` flex-wrap or use grid
   - Hide `.main-nav` links on mobile (show hamburger instead)
   - Ensure `.logo-text` doesn't overflow on small screens
   - Add `@media (max-width: 768px)` breakpoint for nav

3. **Add hamburger JavaScript:**
   - Toggle mobile menu visibility
   - Close menu when clicking outside or on a link

## Problem 2: Featured Stars 500 Error (STILL BROKEN)
**Symptom:** "Oops! Something went wrong" - API returns 500
**Root Cause Analysis:**
- Previous "simplification" removed the token logic entirely but may have broken something else
- Database on Render might be different from local (disk persistence issue)
- Need to check if celebrities table actually exists and has data on Render

### Debug Steps:
1. **Add emergency debugging to /api/celebrities:**
   - Log the exact SQL query being executed
   - Log database connection status
   - Try a simple query first (SELECT 1)
   - Try counting celebrities separately

2. **Test different query approaches:**
   - Try: `SELECT * FROM celebrities LIMIT 20` (simplest possible)
   - If that fails, table doesn't exist or is corrupted
   - Check if seed function is running on Render

3. **Check Render disk setup:**
   - Verify data directory is writable
   - Database file should persist between deploys

### Fix Strategy:
- If table empty: Force re-seed on every startup (temporary fix)
- If table missing: Add CREATE TABLE IF NOT EXISTS fallback
- If query syntax error: Fix SQL syntax

## Implementation Priority:
1. First fix the API (stars not loading = site unusable)
2. Then fix mobile nav (cosmetic but important)

## Files to Modify:
- `server.js` - API debugging and fixes
- `public/index.html` - Nav structure
- `public/style.css` - Mobile nav styles
- `public/app.js` - Hamburger menu logic

## Testing Criteria:
- [ ] /api/celebrities returns 200 with JSON array
- [ ] Featured stars display on homepage
- [ ] Mobile header shows hamburger menu
- [ ] Mobile menu opens/closes properly
- [ ] All nav links work on mobile
