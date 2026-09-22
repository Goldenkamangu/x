# database-connector.js

## In one sentence

`database-connector.js` is the code that lets LinkHub talk to its database. It is a saved copy of the official **Supabase JavaScript library** (version 2.116.0).

## What it does

Your website cannot talk to the Supabase database directly. The database only understands requests in a specific technical form. This file is the **translator**:

1. Someone taps something in LinkHub, for example "Login".
2. `app.js` says, in plain terms: "log this person in".
3. `database-connector.js` builds the proper request, sends it to Supabase, and hands the answer back.
4. `app.js` shows "Welcome back", or "wrong password".

In LinkHub it handles:
- **Logging in and out**, and keeping you signed in
- **Listings**: loading, saving, editing and deleting
- **Photos**: uploading to storage
- **Chats, reviews, ratings and dashboard numbers**: reading and saving them
- **Live updates**: new chat messages appearing straight away

## What it does not do

- It holds **no data and no passwords**. Your Supabase address and public key are in `app.js`.
- It **never changes your Supabase project** (no tables, no settings).
- It is **not SQL**. SQL files end in `.sql` and are pasted into the Supabase SQL editor. This is a JavaScript file that lives in your website folder.
- You never run it or open it yourself. `app.js` loads it automatically.

## Why it is its own file

**Why a separate file instead of pasting it into `app.js`**
- The library is about 220 KB and almost never changes. `app.js` is about 300 KB and changes often. Kept apart, the browser saves the library once and only downloads `app.js` again when you update it.
- `app.js` stays readable. Pasting the library in would bury your own code in a huge block nobody can read.
- You can replace the library on its own without touching `app.js`.

**Why your own copy instead of downloading it from the internet each time**
- **It works offline.** Before, `app.js` downloaded the library from a website every time the page opened. With no internet the download failed, the app could not start, and the loading screen never went away. Now the file is in your folder, and the service worker saves it, so the app can start with no connection once it has been opened online before.
- **It cannot change under you.** The old download link always fetched the newest version. If Supabase released a change that broke something, your site could break without any edit from you. Your copy stays at version 2.116.0.
- **No outside dependency.** If that download site is down, or blocked on someone's network, LinkHub still loads.
- **Slightly faster**, because it needs no extra trip to another website.

## Rules for using it

1. **Keep it in the same folder as `app.js`.** `app.js` loads it from `./database-connector.js`. If the file is missing, the app cannot start, and the loading screen will show "LinkHub couldn't load".
2. **Do not edit it.** It is machine-compressed code. There is nothing in it to change.
3. **Upload it every time you upload the website files**, or at least the first time. It only needs uploading again if you replace it.

## Updating it later

The library is rarely worth updating. If you want a newer version:

1. On a computer with Node.js, make an empty folder and run:
   ```
   npm init -y
   npm install @supabase/supabase-js esbuild
   echo "export { createClient } from '@supabase/supabase-js'" > entry.js
   npx esbuild entry.js --bundle --format=esm --minify --platform=browser --target=es2020 --legal-comments=none --outfile=body.js
   ```
2. Put the comment block from the top of the current `database-connector.js` in front of `body.js`, update the version number in it, and save the result as `database-connector.js`.
3. Replace the old file, then test signing in, loading listings, uploading a photo and sending a chat message.

Or ask for a fresh copy to be made for you.

## Licences

This file bundles open-source packages: `@supabase/*` and `iceberg-js` (MIT licence) and `tslib` (0BSD licence). Source: https://github.com/supabase/supabase-js
