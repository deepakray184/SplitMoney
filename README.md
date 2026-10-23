# SplitMoney

A responsive trip expense sharing app. With Supabase configured, people can create accounts, start shared groups, invite friends with a join link, record expenses, and see balances update across devices.

## Enable accounts and shared groups

1. Create a Supabase project.
2. In **Project Settings → API**, copy the Project URL and the public publishable/anon key into `url` and `anonKey` in `supabase-config.js`. These client values are intended to be public. Never use the `service_role` key in this site.
3. Open the Supabase **SQL Editor**, paste in `supabase-schema.sql`, and run it. This creates the tables, row-level security policies, profile trigger, and secure invite-link functions.
4. In Supabase **Authentication → URL Configuration**, set the site URL to `https://deepakray184.github.io/SplitMoney/` and add it to the redirect URL allow list. For local testing, also allow your local origin.
5. Commit and publish `supabase-config.js` with the two public values. Since GitHub Pages is public, anyone can see the anon key; access is controlled by Supabase Auth and the included row-level policies.
6. Open the site, sign up, create a group, and use **Invite** to copy a link. Invitees sign up or sign in before joining.

Supabase email confirmation may need to be disabled for a quick demo or configured with an email provider for public use. If confirmation is enabled, invitees return to the invite URL from their confirmation email and then sign in.

## Local demo

Without Supabase configuration, the page remains a browser-only demo and shows setup instructions under **Sign up / sign in**. Demo groups and expenses are saved in local storage and are not shared across devices.

## Run locally

Open `index.html` in a modern browser. No build step is needed; the Supabase client loads from jsDelivr when the cloud configuration is enabled.
