# LinkHub

LinkHub is a **buy-and-sell marketplace for South African buyers and sellers**. Anyone can post something they want to sell, and anyone can browse, search and contact the seller directly, through WhatsApp, Telegram or the chat built into LinkHub. There are no fees and no middleman: LinkHub only connects the two people.

It is a **website that also installs like an app** (a "PWA"). It has no server of its own that you have to run. The page is a set of plain files, and all the shared data (accounts, listings, photos, chats) lives in a hosted database service called **Supabase**.

---

## 1. What people can do

**Buyers**
- Browse and search listings, and filter by category.
- Ask **Carty**, the built-in assistant, to find things in plain language.
- Open a listing to see photos, price, location and details, and see more listings like it.
- Contact the seller (WhatsApp / Telegram link) or send an offer and chat inside LinkHub.
- Save listings to a cart, and see recently viewed listings.
- Rate a product and leave a comment, and rate a seller.
- Report a listing that looks wrong.

**Sellers**
- Create listings with photos (photos are shrunk in the browser before upload).
- Edit, delete, and mark listings as sold. Unsold listings expire after 62 days, and sold ones are removed 3 days after they are marked sold.
- Open a **store**: a public page with your logo, banner, description, opening hours, links and all your listings. You can pick an accent colour, font style, layout and an announcement, and feature up to 3 listings.
- See a **dashboard**: store visitors, listing views, contact taps, new chats and offers, sales and ratings.
- Get notifications when someone messages or makes an offer.

**Everyone**
- Create an account, change account settings, or delete the account.
- Install LinkHub on a phone or computer, and open it again with no internet.

**The site owner** additionally sees a **Reports** page listing reported listings.

---

## 2. The technology behind it

| Part | Technology | What it is used for |
|---|---|---|
| The pages you see | **HTML, CSS and JavaScript**, with no framework and no build step | Everything on screen. You edit the files and upload them. |
| Database | **Supabase**, which runs a **PostgreSQL** database | Listings, stores, chats, ratings, visits and more |
| Logins | **Supabase Auth** (email + password) | Sign up, sign in, sign out |
| Photos | **Supabase Storage** (two buckets: `listing-images` and `store-assets`) | Listing photos, store logos and banners |
| Live chat | **Supabase Realtime** | New messages appear straight away |
| Rules and safety | **Row Level Security (RLS)**, database triggers and functions, written in **SQL** | Who can read, write or change what |
| Scheduled cleanup | **pg_cron** (a Supabase extension) | Deletes chat messages older than 31 days |
| Carty's search | A **Supabase Edge Function** named `LinkHub-Carty` | Turns a plain-language request into search filters. See the note at the end. |
| App-like behaviour | **PWA**: `manifest.json` and a **service worker** (`sw.js`) | Install on the home screen, and open with no internet |
| Talking to the database | **The database connector** (`database-connector.js`) | See section 5 |
| Where the site lives | Any static web host. Right now it is served from **GitHub Pages** (`goldenkamangu.github.io`), and tested on your computer with **Live Server** | Just serves the files |
| Contact links | **WhatsApp** and **Telegram** web links | Opens the seller's chat app with a message |

Built-in browser features used: local storage (remembers theme, recent listings, chat history with Carty), the History API (Back button support), the Share sheet, browser notifications, and canvas (photo shrinking).

---

## 3. How it works, in one picture

```
   Person's phone or computer
   ┌────────────────────────────────────────────────┐
   │  index.html   ← the page (structure)           │
   │  style.css    ← how it looks                   │
   │  app.js       ← everything it does             │
   │      │                                         │
   │      └── uses ── database-connector.js         │
   │                   (the Supabase library)       │
   │  sw.js        ← saves files for offline use    │
   └───────────────────────┬────────────────────────┘
                           │ internet (HTTPS)
                           ▼
   ┌────────────────────────────────────────────────┐
   │ Supabase                                       │
   │   Auth · Database (PostgreSQL + rules)         │
   │   Storage (photos) · Realtime (live chat)      │
   │   Edge Function (Carty search)                 │
   └────────────────────────────────────────────────┘
```

1. The person opens the site. The host sends `index.html`, `style.css`, `app.js` and the other files. A loading screen shows while it starts (at least 2 seconds, and it can never spin forever: if the app can't start, it shows "You're offline" or "LinkHub couldn't load" with a Try again button).
2. `app.js` uses the database connector to ask Supabase for the listings, and draws them on the page.
3. When someone posts a listing, a photo, a message or a review, `app.js` sends it through the connector to Supabase, where the database checks the rules before saving it.
4. Chats use Realtime, so the other person sees a message at once. A slow background check runs as a backup.
5. `sw.js` keeps a copy of the app files. If the internet is off or very slow (over about 3.5 seconds), the saved copy is used.

**About the public key.** `app.js` contains the Supabase address (`SUPABASE_URL`) and a *public* key (`SUPABASE_ANON_KEY`). That key is meant to be visible; anyone can copy it from the page. It is safe **only because the database enforces the rules itself** (Row Level Security and the triggers in the SQL files). That is why the safety rules live in SQL and not in `app.js`: anything checked only in the page can be bypassed by someone calling the database directly.

---

## 4. The files

### The website
| File | What it does |
|---|---|
| `index.html` | The page itself: menus, the home page, the listing form, and every pop-up window (cart, chats, store, dashboard, account, terms and more). It also holds the loading screen and a small safety script that keeps that screen from getting stuck. |
| `style.css` | All the styling: colours, layout, phone and computer layouts, the pop-up windows, chat bubbles, reviews, dashboard and store designs. |
| `app.js` | All the behaviour. It is one big file, in roughly this order: |
| `database-connector.js` | The library that lets `app.js` talk to Supabase. Do not edit it. See section 5 and `DATABASE-CONNECTOR-README.md`. |
| `sw.js` | The service worker: keeps a copy of the app for offline use and falls back to it on a slow connection. |
| `manifest.json` | Tells phones how to install LinkHub: name, colours, icons. |
| `logo.svg`, `logo1.png`, `Logo2.png`, `icon-192.png`, `icon-512.png` | The logo and app icons. |

**What is inside `app.js`** (in order, roughly):
1. **Setup**: loads the connector, connects to Supabase, storage bucket names, the owner's email for the Reports button, icons, and references to page elements.
2. **Navigation**: the mobile menu, the bottom bar, and the top bar with the account menu on computers.
3. **Notifications and chats list**: watches for new messages and offers for the signed-in person.
4. **Cart, contact links and categories.**
5. **Accounts**: sign up, sign in, sign out, account settings, delete account.
6. **Creating and editing listings**: including photo shrinking and upload, marking sold, and deleting.
7. **Loading screen** timing.
8. **My Listings** window.
9. **The chat window**: messages, offers, live updates, and the "account deleted" notice.
10. **Terms and Conditions** window.
11. **Stores**: a seller's public store page, the "Explore businesses" grid, and the My Store editor.
12. **Admin reports** review.
13. **Photo viewer.**
14. **Loading and drawing listings**: clean-up of expired listings, listing cards, listing pop-up, deep links (`?listing=` and `?store=`).
15. **Search and Carty**: filters, the assistant chat, its history.
16. **Recently viewed and "You might also like".**
17. **Reviews and ratings**: product reviews with comments, seller ratings, the store design options and the dashboard.
18. **Windows and the Back button**: newest window on top, page scroll restored, Back closes windows, tap outside to close.
19. **Install prompt and service worker registration.**

### The database (SQL files)
Run these in the Supabase **SQL editor**, once each and in this order. Each one is safe to run again.

| Order | File | What it sets up |
|---|---|---|
| 1 | `messaging_v22.sql` | The chat table (`listing_messages`) that keeps a conversation readable when a listing or account is deleted, and the daily 31-day message cleanup |
| 2 | `messaging_v23.sql` | Chat safety (the database decides who sent what, so nothing can be forged) and the instant "the buyer/seller deleted their account" notice |
| 3 | `linkhub_v24_reviews_dashboard.sql` | Product reviews with comments, seller ratings, store design, store visit and contact-tap counting, the sales record, and the dashboard function |
| 4 | `LinkHub-business-upgrade.sql` | Business profile fields on stores (business type, tagline, website, WhatsApp, Instagram) and the rule that links must be real web links |

The very first tables (`listings`, `stores`, `offers`, `reports`, the photo buckets and the delete-account function) were created by earlier SQL that is not in this folder.

### Other documents
| File | What it is |
|---|---|
| `README.md` | This file. It replaces the older README, which described an early version. |
| `DATABASE-CONNECTOR-README.md` | Explains `database-connector.js` on its own. |
| `README-UX.md`, `UPGRADE-NOTES.md` | Earlier notes about design choices and upgrades. |

---

## 5. The database connector, in short

Your website cannot talk to the Supabase database by itself, because the database expects requests in a specific technical form. `database-connector.js` is the translator. `app.js` says "log this person in" or "get the listings", and the connector builds the real request, sends it, and hands back the answer.

It used to be downloaded from the internet every time the page opened. That meant the app could not start with no connection. It is now a file in your own folder, so the app can start offline once it has been opened before, and it can't change under you.

Full details are in `DATABASE-CONNECTOR-README.md`.

---

## 6. Data in the database

| Table or item | What it holds |
|---|---|
| `listings` | Every listing: title, price, photos, category, location, contact details, sold status, views |
| `stores` | Each seller's store: name, logo, banner, description, contact and business details |
| `store_designs` | Store colour, font, layout, announcement and featured listings |
| `listing_messages` | Chats, offers and "account deleted" notices between two people |
| `ratings` | Product ratings and comments (one per person per listing) |
| `seller_ratings` | Seller ratings and comments (one per person per seller) |
| `store_visits` | One row per visitor per store per day, for the dashboard |
| `contact_taps` | How many people tapped Contact on a listing |
| `sales_log` | A record of items marked sold, kept even after the listing is removed |
| `reports`, `offers` | Reported listings, and offers |
| Views `listing_rating_stats`, `seller_rating_stats` | Ready-made averages so the page does not download every rating |
| Functions | `store_dashboard` (dashboard numbers), `record_store_visit`, `record_contact_tap`, `increment_listing_view`, `delete_my_account` |
| Storage buckets | `listing-images`, `store-assets` |

---

## 7. Setting it up

1. Create a Supabase project. Turn on email sign-up under Authentication.
2. In `app.js`, set `SUPABASE_URL` and `SUPABASE_ANON_KEY` (Supabase → Project Settings → API), and set `OWNER_EMAIL` to the email that should see the Reports button.
3. Create the two storage buckets, `listing-images` and `store-assets`, and run the SQL files in the order above.
4. Upload **all** the website files to your host, keeping them in one folder. `database-connector.js` must sit next to `app.js`; without it the app cannot start.
5. Open the site once online, so the service worker can save the files for offline use.

To test on your computer, serve the folder with any local web server (for example VS Code's Live Server, or `python3 -m http.server 8000`) and open it in the browser. Opening `index.html` directly by double-clicking will not work, because the browser blocks modules from local files.

---

## 8. Good to know

- **Carty's AI search.** `app.js` sends Carty's requests to a Supabase Edge Function called `LinkHub-Carty`. The code of that function is not part of these files, so this README cannot say exactly which AI service it uses. The service worker's notes mention Groq, so check the function's code in your Supabase dashboard to confirm.
- **The Reports button** is only hidden in the page for other people. The page cannot really stop anyone, so make sure your database rules (in Supabase) also limit who can read and delete reports.
- **Ratings** can be left by anyone signed in (except on their own listing or store), because many deals happen on WhatsApp instead of inside LinkHub. Reviews from people who chatted with the seller inside LinkHub carry a "Chatted on LinkHub" badge.
- **Cart, recent listings, theme and Carty's chat history** are kept in the browser on that device. They are not shared across devices.
