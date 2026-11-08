# StudentHub + Supabase — setup guide

This is a starter project with a real Supabase Auth flow, private student data, a protected homework-generation Edge Function, and browser-side PDF export.

## What works after setup
- Email/password signup and login.
- Email verification (when enabled in Supabase Auth).
- Forgot-password email and password update flow.
- Student profile, education selection, saved resources and study tasks.
- Starter education/subject dropdowns and clearly labelled sample study content.
- AI answer generation through a Supabase Edge Function (requires an OpenAI API key configured privately).
- Two Free homework PDF generations per India calendar day; the second Free PDF gets a StudentHub watermark.
- Pro plan has a 50/day fair-use cap in this starter. Pro accounts must be assigned by an authorised admin until a payment provider is integrated.
- PDF export overlays generated answers on a PDF or image template in the browser.

## Important limitations
- Study notes/PYQs in this starter are sample placeholders. They are not a complete verified curriculum or official PYQ archive. Admin must upload and verify real content.
- The homework reader extracts selectable text from PDFs. Scanned/photo-only question PDFs need OCR, which is not included; paste the questions into the text area instead.
- The writing styles are basic typeset styles, not authentic handwriting fonts.
- PDF overlay is a starter layout. Long answers may need manual page-break/layout improvements; always preview and edit before printing.
- Payment processing is not enabled. ₹99/month is a proposed price only. Never trust a browser-side Pro flag. A real subscription needs a payment provider webhook that updates `profiles.plan` after verified payment. Since the project owner is under 18, involve a parent/guardian and follow provider age and account rules.
- Do not use this as an automatic assignment-submission service. Review the answers, correct errors and follow your teacher's rules.

## Part A — Create Supabase project
1. Open https://supabase.com and create a project.
2. In the project dashboard, open **Project Settings → API** (or the Connect dialog).
3. Copy the **Project URL** and the **Publishable key**. A legacy `anon` key can also be used.
4. Open `config.js` and replace:
   - `PASTE_YOUR_SUPABASE_PROJECT_URL_HERE`
   - `PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE`
5. Never paste a `service_role` or secret key into `config.js`, GitHub, or any browser file.

## Part B — Create database
1. In Supabase, open **SQL Editor → New query**.
2. Open `supabase/schema.sql` from this project.
3. Copy the entire SQL file into the editor and click **Run**.
4. Check that tables `profiles`, `saved_items`, `study_tasks`, and `homework_jobs` exist.
5. In **Authentication → URL Configuration**, add your published GitHub Pages URL to Site URL / Redirect URLs. Example: `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`.
6. For testing, you may temporarily turn off email confirmation in **Authentication → Providers → Email**. Before public launch, use email verification and configure an email provider with appropriate rate limits.

## Part C — Deploy the AI Edge Function
Recommended method using Supabase CLI on a computer:
1. Install the Supabase CLI and sign in.
2. In the project folder run `supabase login`.
3. Link the local folder to your Supabase project: `supabase link --project-ref YOUR_PROJECT_REF`.
4. Set the AI key as a server secret (never in GitHub):
   `supabase secrets set OPENAI_API_KEY=YOUR_AI_KEY`
5. Optional model setting:
   `supabase secrets set OPENAI_MODEL=gpt-4.1-mini`
6. Deploy:
   `supabase functions deploy generate-homework`
7. In Edge Function settings, keep JWT verification enabled. The function independently checks the logged-in user too.

If using the Supabase Dashboard editor instead of CLI, create an Edge Function named `generate-homework`, paste `supabase/functions/generate-homework/index.ts`, add `OPENAI_API_KEY` as a Function Secret, and deploy it.

## Part D — Publish the website on GitHub Pages
1. Put `index.html`, `style.css`, `config.js`, `app.js`, and the `supabase` folder in the root of your GitHub repository.
2. Commit changes.
3. In GitHub repository **Settings → Pages**, publish from the `main` branch and `/ (root)`.
4. Open the GitHub Pages URL.
5. Register a test account. Verify the email if confirmation is enabled, then log in.
6. Test profile save, planner tasks, resource selection and bookmarks.
7. Test AI homework only after the Edge Function and AI secret are deployed.

## Part E — Make an account an admin or Pro (manual testing only)
In Supabase SQL Editor, replace the email with the exact registered email:
```sql
-- Give an account admin access:
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'YOUR_EMAIL');

-- Give an account Pro access for testing:
update public.profiles
set plan = 'pro'
where id = (select id from auth.users where email = 'YOUR_EMAIL');

-- Return an account to Free:
update public.profiles
set plan = 'free'
where id = (select id from auth.users where email = 'YOUR_EMAIL');
```
Do not expose these SQL operations in the public website. In production, assign Pro only from a trusted payment webhook or authorised admin backend.

## Troubleshooting
- “Setup needed”: check `config.js` URL and publishable key.
- Signup email does not arrive: check Supabase Auth email settings and spam folder.
- Redirect URL error: add the exact GitHub Pages URL in Auth URL Configuration.
- AI not configured: set `OPENAI_API_KEY` as an Edge Function secret and redeploy if needed.
- Function returns 429: the daily homework limit has been reached.
- PDF has no extracted questions: the source may be scanned; paste the questions manually.
- Never share your AI key, Supabase secret key, passwords or recovery codes with anyone.
