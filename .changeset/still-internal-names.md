---
"@phantom/still": patch
---

Move the application to `apps/still` and use Still names for the stylesheet, UI selectors, transitions, and search component. Use domain names for app-level channel contracts and map Still explicitly to its existing production Worker and deploy branch. Cloudflare Builds must use `/apps/still` as its build root and watch the new app path.
