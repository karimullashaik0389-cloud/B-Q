# B&Q Listings – how to use (step by step)

Tool version 3.5.7. Read this once, top to bottom. Every step is numbered. You only need a mouse/finger and your product names.

**What the tool does:** you give it SKU, EAN and product name. It writes the B&Q title (121–124 characters), 8 bullets, a 150+ word description and the key feature. It also fills the category and attributes, then gives you **one B&Q file per category**. Then **you** import those files on the B&Q portal yourself.

**What it never does:** it never changes anything on B&Q, never uploads your photos anywhere and never fills price, stock, lead time or logistic class. Those go in your own price/stock file.

---

## A. Open the tool

### On Windows (normal way – website)
1. Open **Google Chrome** or **Microsoft Edge**.
2. Go to **https://karimullashaik0389-cloud.github.io/B-Q/listings/**
3. Bookmark it (press **Ctrl + D**) so next time it is one click.

### On Windows (offline, no internet needed for the tool itself)
1. On the GitHub page of the **B-Q** repo, click the green **Code** button › **Download ZIP**.
2. Right-click the ZIP › **Extract All…** › choose a simple place, e.g. `C:\BQ`. **Keep the folders as they are** (`listings`, `listings\templates`, `downloads`).
3. Open the `downloads` folder and double-click **Start_BQ_Listings.bat**.
   - It opens the tool in Chrome (or Edge if Chrome isn't installed) in its own window. That window can read the B&Q templates from the `listings\templates` folder.
   - If Windows shows "Windows protected your PC", click **More info** › **Run anyway** (the .bat only opens your browser).
4. If you open the HTML file some other way (double-clicking it), the tool still works. At the last step it will ask you to **Choose template** once per category from `listings\templates`.

### On iPhone
1. Open **Safari**.
2. Go to **https://karimullashaik0389-cloud.github.io/B-Q/listings/phone/**
3. Tap **Share** (square with arrow) › **Add to Home Screen** › **Add**. From now on, open it from the orange icon.

> Your list is saved on the device you use. If you close the page and open it again, you see "Carried on where you left off – N products". The phone and the computer do **not** share lists.

---

## B. The screens (in order)

Along the top you see the steps **Add › Sort › Fill gaps › Check**. Every screen has **Back** at the top **and** at the bottom. Going back never loses what you typed.

### 1. Start screen
1. Choose **New listings** (products not on B&Q yet) or **Fix existing** (products already live that you want to improve).
2. New here? The small link **How to use – step by step** opens this guide.

### 2. Add
1. Type one product per row: **SKU**, **EAN**, **Product name**. Use **+ Add a row** for more.
2. For many products (20–30 or more at a time): in Excel, select the three columns (SKU, EAN, Name), press **Ctrl + C**, then in the tool click **Paste from Excel**, press **Ctrl + V** and click **Add these rows**.
3. Or drop your Excel or CSV file (columns SKU, EAN, Product name) on the grey box. The Add step takes only SKU, EAN and Product name – photos come later, as web links on Fill gaps.
4. **Red rows = the same SKU typed twice.** Both rows go red and **Next is blocked** until you fix one. This stops duplicate SKUs reaching B&Q.
5. **Amber = the same EAN on two different SKUs.** This is only a warning. Check it is meant (e.g. pack sizes), then carry on.
6. Finished with a list and already imported on B&Q? Click **Start a new list**. It only clears the list in the tool. Files you downloaded are not touched.
7. Click **Next →**.

### 3. Sort
The tool checks each EAN against your B&Q export and files.
1. **Already on B&Q – move to Fix existing** / **Not on B&Q yet – move to New listings**: click the move button if it is right.
2. A wrong check digit is shown in red with a button **Use correct check digit**.
3. Click **Next →**.

### 4. Fill gaps
1. Each product card shows the category the tool picked. Click **Looks right**, or **Change** to pick another.
2. Click **Next to fill** to jump straight to the next empty box. Only the boxes B&Q *requires* are asked. Usually that is the **weight** and anything the name doesn't say.
3. Grey/amber "close guess" values are suggestions. Read them, and change them if they are wrong.
4. **Photos are web links only.** B&Q's import only takes web links, so there is no photo upload and no photo preview in the tool.
   - Each photo link is listed as text (website / file name) with **Open** (checks the photo in a new tab), **Make main** and **×** (remove). Amber notes warn about Amazon links, iili.io links that may disappear and links that might not be a photo.
   - **Product with no photos yet:** the count line says *No main photo, add one.* (later, for example, *Photo links: 5 of 9 (main photo: yes). You can add 4 more.*). You get two boxes:
     - **Main photo link:** paste one `https://` link and click **Set main photo** (or press Enter). It becomes the main photo (`image_main_1`).
     - **Other photo links (up to 8):** paste all your other links at once. They can be on separate lines, copied straight from an Excel column, separated by spaces, commas, semicolons, tabs or `|`, or even stuck together with no gap. The tool splits them, shows *Found N links* and fills Photo 2 to 9 in order (`image_secondary_1` to `8`). Links with commas or `?v=1&x=2` in them stay whole. Typed links are used when you leave the box or click **Use these links**.
   - Refused with a red message: links that don't start with `https://` (including `http://`), plain text, and any links after the 8th. The same link twice is skipped. A link that doesn't end in `.jpg`, `.png`, `.webp` or `.gif` is kept with an amber "check this link opens a photo" note. Links on Amazon or on iili.io get an amber warning too, because they can stop working.
   - **Product that already has photos** (on B&Q, or copied from a sister SKU): the status line says, for example, *We have photos: main photo yes, 4 extra photos (5 of 9). You can add 4 more.* The two boxes start empty:
     - **Update main photo:** paste one link to replace your main photo (`image_main_1` only). You'll see *Main photo replaced.*
     - **Update other photos:** paste all other photo links at once (up to 8) to replace your existing extra photos (`image_secondary_1` to `8`). You'll see, for example, *Replaced 4 extra photos with 6 new.* Links you don't paste are dropped. To keep them and add more, click **Copy the current links into the box** first.
     - Each box has its own **Undo**, which brings back what was there before. If nothing in what you pasted can be used, nothing is replaced.
   - **Optional, for many products:** your Excel/CSV file on Add can also have the columns **Main photo link** and **Other photo links** (all other links in one cell). They fill the two boxes for you.
   - **Tip:** use a photo host you control. On freeimage.host / iili.io, leave **Don't autodelete** selected (the default). Free hosts don't promise to keep files, so links can stop working. The tool never uploads photos for you.
5. **Variant Group ID** is filled automatically:
   - from your **All variant.xlsx** if you loaded it (blank if the SKU is not in it);
   - otherwise products with the same name in a category that allows variants get one group;
   - blank where B&Q does not allow variants.
6. Click **Next →**.

### 5. Check and download
1. Each card shows the title with its length (must be **121–124**), the **8 bullets**, the description word count (**150+**) and the **Key feature** (max **30** characters). Green = OK, red = fix.
2. You can edit any text directly. The counters update as you type.
3. The box at the top lists anything still missing. Click a chip to jump to it.
4. **Fix existing only – "Are you using a new EAN for B&Q?"** appears on a card when the EAN you typed differs from the one B&Q has for that SKU.
   - **Yes** = you are changing to a new EAN on purpose. Your new EAN goes in the file, with no warning.
   - **No** = the tool keeps B&Q's EAN in the file and shows an amber warning saying so.
   - Not answered yet = B&Q's EAN stays in the file (a small grey line says so); no warning.
5. Click **Download all files**. You get **one file per B&Q category**, e.g. `new_animal_beds_2026-11-02.xlsx`.
   - Offline/file mode only: if a category says **Choose template**, click it and pick that file from `listings\templates` once.
6. Where the files go:
   - Windows: the **Downloads** folder.
   - iPhone: Safari asks **Download?** › tap **Download**. The files are in the **Files** app › **Downloads**. If only one file appears, tap each category's own **Download** button.

---

## C. Import on B&Q (you do this yourself)
1. Log in to the **B&Q / Kingfisher seller portal (Mirakl)**.
2. Go to the product import page (in Mirakl this is under **Catalog / Products › Import** – the exact menu name can differ on your account).
3. Upload **one downloaded file at a time** and wait for the import report.
4. If B&Q rejects a line, open the report, fix that product in the tool (**Fix existing**) and download again.
5. Price, stock, lead time and logistic class are **blank on purpose**. Set them with your usual offer/price file.

The tool never imports, deletes or changes anything on B&Q.

---

## D. Settings (gear icon, top right)
1. **Variant groups** – choose your **All variant.xlsx** (or your B&Q folder once) so Variant Group IDs come from your list.
2. **Gemini (optional)** – if you want AI-polished text, paste your free Gemini key here. It is saved **only in this browser on this device** (never in the files or on GitHub). Only public product facts are sent. With no key, the tool uses its own text.
3. **Dark mode** – moon/sun button. The look stays the same, only darker.
4. **Help** – **Open the step-by-step guide** opens this page. Here you can also see the tool version.

---

## E. Updating to a new version
1. A new version is a new set of files (`listings/index.html`, `listings/phone/index.html`, `listings/templates/`, `downloads/`).
2. Website: replace the files in your B-Q GitHub repo yourself (upload/commit). The website updates in a few minutes. Press **Ctrl + F5** once to reload.
3. Offline: download the ZIP again and replace your `C:\BQ` folder.
4. Your saved list, Gemini key and settings stay in the browser. They are not in the files, so replacing files does not delete them.
5. Check the version under **Settings › Help**.

## F. If something goes wrong
1. A red box "Sorry – that didn't work" appears: nothing was sent anywhere. Try again. If it repeats, take a screenshot and send it.
2. A page that only shows "If you can see this, the tool isn't running" was opened in a preview. Open it in Chrome/Edge (Windows) or Safari via the web link (iPhone).
