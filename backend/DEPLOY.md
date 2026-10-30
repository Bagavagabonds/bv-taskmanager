# Deploying the backend (Apps Script)

`Code.gs` + `appsscript.json` run as a web app bound to the task sheet, owned by cam@bagavagabonds.com.
Check the rules locally with `node backend/test.mjs` (uses `fake-gas.js`, which is never deployed).

## A. Test copy first (no effect on the crew)
1. Open the task sheet → **File → Make a copy** → name it `BV Tasks TEST`. Don't share it.
2. In the copy: **Extensions → Apps Script**.
3. Project Settings (gear) → tick **Show "appsscript.json" manifest file**. Replace its contents with `appsscript.json`.
4. Replace `Code.gs` with this repo's `backend/Code.gs`. Save.
5. **Deploy → New deployment → Web app**. Execute as: **Me**. Who has access: **Anyone**. Deploy and approve the permissions (sheet, send mail, external requests, Drive, triggers).
   - If "Anyone" isn't offered, the BV Workspace admin blocks public web apps. Stop and tell Claude.
6. Copy the **Web app URL** (`https://script.google.com/macros/s/…/exec`).
7. Build the test page: `node build.mjs next <that URL>`, commit `next/`, push. Then open `https://bagavagabonds.github.io/bv-taskmanager/next/` (title says [TEST]) and run through sign-in, create, accept, start, done, comment, delete, and an admin change. Check the copy's Tasks, Config and Audit tabs.

## B. Real sheet
1. On the real sheet, repeat A.2–A.6. Note this URL.
2. In the editor, select `setup` and click **Run** once. It installs the 2 am nightly backup (Drive folder "BV Task Board backups", kept 30 days) and makes the first backup.
3. Put the URL in `PROD_API` in `build.mjs`, run `node build.mjs`, commit, push. **Crew effect:** everyone signs in once more; emails now come from "BV Task Board".
4. Delete `next/` (and the test copy) once the live app is confirmed.
5. After a day of clean running: sheet **Share** → remove the crew (keep yourself). Hide nothing else; the app no longer needs them on it.

## Updating the backend later
Edit `Code.gs` → `node backend/test.mjs` → paste into the editor → **Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy**. The URL stays the same. (A *new* deployment gets a new URL.)

## Rollback
Revert the front-end commit and push, then re-share the sheet with the crew. The sheet layout never changed.
