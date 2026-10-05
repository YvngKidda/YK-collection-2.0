# YK Collection → Supabase: setup guide

## Files

Put these in your repo root (same folder as `styles.css`):

| File | What to do |
|---|---|
| `index.html` | **Replace** the old one |
| `script.js` | **Replace** (storefront + shared UI, all Cloudinary code gone) |
| `admin.js` | **New** (admin panel: login, photo upload, products) |
| `supabase-config.js` | **New** (your Supabase URL + key go here) |
| `supabase-additions.css` | **New** (styles for the photo picker) |
| `supabase-schema.sql` | Run it in Supabase (step 2). Keep a copy in the repo for reference |
| `supabase-migration-2.sql` | Run it once in Supabase before using the 360° view (adds the 360° columns) |
| `favicon.ico` | **New**, goes in the repo root next to `index.html` (the browser-tab icon on computers) |
| `styles.css` | Unchanged |

Updating later: upload a file with the same name and folder and it replaces the old one. No need to delete first. If the old version still shows, hard-refresh (Ctrl+Shift+R on a computer).

---

## 1. Create the Supabase project
supabase.com → **New project**. Save the database password somewhere safe (you won't need it in the site). Pick the region closest to Nigeria.

## 2. Create tables, security rules and the image bucket
Dashboard → **SQL Editor → New query** → paste all of `supabase-schema.sql` → **Run**.

Check: **Table Editor** shows `products`, `reviews`, `feedback`, `settings`, `admins`. **Storage** shows a public bucket `product-images`.

## 3. Create your admin login
1. **Authentication → Users → Add user → Create new user.** Use your email and a **brand-new strong password**. Tick **Auto Confirm User**.
2. **SQL Editor → New query**, run this with your real email:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'YOUR_EMAIL_HERE';
   ```
3. Recommended: in Authentication settings, switch **off** "Allow new users to sign up" (the menu wording may differ slightly). The site is already safe without this, because only ids in `public.admins` can write. This just closes the door further.

## 4. Connect the site
**Project Settings → API Keys** (or the **Connect** button). Copy the **Project URL** and the **publishable key** (`sb_publishable_…`) into `supabase-config.js`. The older `anon` key also works, but Supabase is retiring it by the end of 2026.

## 5. Deploy
Commit and push to GitHub. Vercel redeploys automatically.

## 6. Test it
1. On your phone, open the site and tap the "© 2026 YK Collection" footer text **5 times quickly**. Log in with the email and password from step 3.
2. **Add New Product → Choose photos from gallery.** Your photo gallery opens. Pick one or several. Thumbnails appear (the first is the cover). Fill the form and tap **Add Product**.
3. Open the site on another device. The product should be there. Leave a review and it should show up.
4. Prove the lock works: in a normal visitor tab (not logged in), open the browser console and run
   `sb.from('products').insert({title:'x',price:1}).then(console.log)`
   You should get an error containing *row-level security*. That is the database refusing a stranger.

---

## Where the API keys go (Vercel)

- **Project URL + publishable key → `supabase-config.js`, committed to GitHub.** These two values are designed to be public. They ship to every visitor's browser no matter what you do. Your data is protected by the Row Level Security rules in the SQL file, not by hiding the key.
- **Vercel environment variables can't reach this site.** It's plain HTML/JS with no build step, so Vercel has nothing to inject them into.
- **Never put these in the repo, in Vercel, or in any browser file:** the **secret key** (`sb_secret_…`), the old **service_role** key, or the database password. They bypass all security.
- **Optional (only if you want to rotate keys without editing code):** rename `supabase-config.js` to `supabase-config.template.js`, replace the two values with `__SUPABASE_URL__` and `__SUPABASE_KEY__`, add this `build-config.js`, then in Vercel set **Build Command** to `node build-config.js` and add env vars `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`:
  ```js
  const fs = require('fs');
  const t = fs.readFileSync('supabase-config.template.js', 'utf8')
    .replace('__SUPABASE_URL__', process.env.SUPABASE_URL)
    .replace('__SUPABASE_KEY__', process.env.SUPABASE_PUBLISHABLE_KEY);
  fs.writeFileSync('supabase-config.js', t);
  ```
  The values still end up in the browser. This only makes them easier to change.

## The mobile gallery input

```html
<input type="file" id="aPhotoInput" accept="image/*" multiple hidden
       onchange="handlePhotoPick(this,'add')">
<label for="aPhotoInput" class="photo-pick-btn">Choose photos from gallery</label>
```

- `accept="image/*"` makes phones open the photo gallery/picker. `multiple` allows several photos at once.
- **Don't add `capture`.** That forces the camera and skips the gallery.
- The label triggers the hidden input, which is the most reliable way on iPhone and Android.

`handlePhotoPick` (in `admin.js`) shrinks each photo to a ~300 KB JPEG, uploads it to `product-images`, gets the public URL, and keeps it with the product. The URLs are saved in `products.images` when you tap **Add Product** or **Save Changes**.

## What the security rules do

| Who | Products | Reviews | Feedback / contact | Photos |
|---|---|---|---|---|
| Any visitor | read | read + post | send only | view |
| You (admin) | add / edit / delete | + delete | read + delete | upload / delete |

## Limits to know about
Supabase's **free plan** includes 1 GB of file storage and 500 MB of database. It **pauses a project after a week with no activity**, and you restore it manually from the dashboard. A store people visit weekly won't hit this. For a store that can go quiet, the Pro plan doesn't pause.

## If something goes wrong

| You see | Fix |
|---|---|
| "Store not connected yet" | Keys not filled in `supabase-config.js` |
| "Not allowed — log in as admin again" | Step 3.2 not run, or a different email than your login |
| "Email not confirmed" | The user was created without **Auto Confirm User** |
| No products after login | Check the schema ran with no errors. Open the browser console (F12) for details |
