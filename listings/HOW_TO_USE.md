# B&Q Listings – how to use (step by step)

Tool version 3.5.13. Read this once, top to bottom. Every step is numbered. You only need a mouse/finger and your product names.

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

The orange **Home** button (house icon, top left, on every screen) opens the main B&Q dashboard with the six cards. Your work is saved on this device first, so when you open Listings again you carry on where you left off. If it can't be saved (for example a private window), the tool asks before leaving. The square-grid button next to the gear goes back to this tool's own start screen (New listings / Fix existing).

### 1. Start screen
1. Choose **New listings** (products not on B&Q yet) or **Fix existing** (products already live that you want to improve).
2. New here? The small link **How to use – step by step** opens this guide.

### 2. Add
1. Type one product per row: **SKU**, **EAN**, **Product name**. Use **+ Add a row** for more.
2. For many products (20–30 or more at a time): in Excel, select the three columns (SKU, EAN, Name), press **Ctrl + C**, then in the tool click **Paste from Excel**, press **Ctrl + V** and click **Add these rows**.
3. Or drop your Excel or CSV file (columns SKU, EAN, Product name) on the grey box. You need SKU, EAN and Product name. **Optional columns: Main photo link, Other photo links** – web links only (https://), no photo files. Put all other links in one cell (separated by spaces, commas or Alt+Enter lines). A single **Image links** column also works (first link = main photo). No photo columns? Add the links later on Fill gaps.
4. **Red rows = the same SKU typed twice.** Both rows go red and **Next is blocked** until you fix one. This stops duplicate SKUs reaching B&Q.
5. **Amber = the same EAN on two different SKUs.** B&Q needs one EAN per product – each size, colour and pack has its own barcode. You can carry on to Sort, but both products are held back (*Needs: EAN – a different EAN … is also typed for …*) and not downloaded until one EAN is corrected.
   - **Empty EAN** (new products): the row is red and Next says *EAN missing on N rows. Every new product – each size, colour and pack – needs its own EAN.*
6. Finished with a list and already imported on B&Q? Click **Start a new list**. It only clears the list in the tool. Files you downloaded are not touched.
7. Click **Next →**.

### 3. Sort
The tool checks each EAN against your B&Q export and files.
1. **Already on B&Q – move to Fix existing** / **Not on B&Q yet – move to New listings**: click the move button if it is right.
2. A wrong check digit is shown in red with a button **Use correct check digit**.
   - **EAN found in the B&Q export = it is always the live product (Improve the live page),** whatever SKU you typed. A grey ℹ note shows it, e.g. *"Found on B&Q by EAN – B&Q product SKU is XMA-HAT-RED-012 (you typed XMA-HAT-RED-12, your offer SKU)"*. The file uses B&Q's **product SKU**. If the SKU you typed is also another B&Q product, a link lets you switch to that one.
   - **Only the SKU matches, the EAN is different:** an amber warning asks you to choose – **Improve the live B&Q product** (B&Q's EAN is used) or **It's a new product – keep my EAN**.
   - **"Please check category"** (amber): the live product looks like it is in the wrong B&Q category (e.g. Santa hats in Bunting). Tap **Change to …** (e.g. Christmas Headwear) or **Keep …**. Changing category on B&Q (Mirakl) means using that category's template – the download does this for you.
3. Click **Next →**.

### 4. Fill gaps
At the top of Fill gaps and Check a line says **What to do next**, e.g. *Confirm the category for 3 products…* or *Everything is ready – tap “Download all files”…*.

**Confirm category (new in 3.5.12) – the tool never uses a guessed category by itself.**
- Every **new** product, and every **live** product where the tool thinks B&Q has the wrong category, waits for you. Its card shows only the **Confirm category** box until you answer: the tool’s guess with how sure it is (**High confidence**, or **Please check – Medium/Low confidence**, or **Suggested change – please check**), the **top 3 other matches**, and a search over **all B&Q categories**.
- Tap **Use this category** (or one of the other matches, or search and tap one). Only then are the boxes, title, bullets and description filled for that category.
- **Category check list** (top of Fill gaps and Check): *Category check – N to confirm*. One line per product with the guess and confidence. Filter **All / High / Medium / Low**, tap **Use** or **Change** on a line, or **Confirm all shown (N)** to accept every guess in the current filter (e.g. tap **High**, check the list, then **Confirm all shown**).
- Until every product is confirmed, **Download is blocked**: the bottom button says **Needs: confirm category (N)** and the Check screen shows a red *Needs: confirm category* box with **Go to Category check**.
- **Live products that stay in their B&Q category need nothing** – no confirm step.
- Changing a category later (**Change category** on Fill gaps or Check) re-opens the confirm step for that product.
- **Category without an upload template:** a few B&Q categories are marked “DO NOT USE” by B&Q and have no upload template (e.g. *Play Sand*). The card says so (*B&Q has this product in X … but B&Q gives no upload template for that category*). Choose the nearest category from the guess or the search, or ask your B&Q contact.

**Warnings that stop repeat mistakes** (amber, on Fill gaps and Check):
- **Pack size** – e.g. *Pack size is 4 but the name says 6* – tap **Use 6**, or fix the name.
- **Weight units** – *5000 kg looks like grams* (tap **Use 5 kg**) or *0.4 g looks like kilograms* (tap **Use 400 g**).
- **Category you picked by hand doesn’t match the name** – *Check the category: nothing in the name … matches Hose Pipes*. If it is right, ignore it.
- Already there: the same SKU twice (Add blocks Next), an EAN already used on B&Q by another SKU, your offer SKU vs B&Q’s product SKU (Sort), and a missing weight (*Needs: weight*).

1. Each product card shows the category. Click **Looks right**, or **Change category** to pick another.
   - **Change the category yourself** (if the tool or B&Q has the wrong one) – works for new and live products:
     1. On the product card, tap **Change category** next to the category (on Check, tap **Change category** under the card – it takes you back here). If the card says **Please check category**, the button is in that note; in a *It looks like …* note, **Pick another** does the same.
     2. Tap one of the **Best matches**, or type part of a name in **Search all B&Q categories**, e.g. `christmas headwear` or `dog bed`. Every word you type must be in the name, so type more to narrow the list. Each line shows the full path, e.g. *Home / Christmas / Christmas Headwear*.
     3. Tap the right one. The card now uses that category's B&Q template: the required boxes are checked again, values that category does not allow are cleared, and the product type is picked from the name if it can be (otherwise it says **Needs: choose product type**).
     4. The card says *Category chosen by you: X (B&Q had Y)*. The download puts the product in that category's file. For a live product, B&Q (Mirakl) may keep showing the old Master category until B&Q's catalogue team updates it.
     5. Changed your mind? Tap **Change category** again; **Keep it** closes the list without changing anything.
2. Click **Next to fill** to jump straight to the next empty box. Only the boxes B&Q *requires* are asked. Usually that is the **weight** and anything the name doesn't say.
3. Grey/amber "close guess" values are suggestions. Read them, and change them if they are wrong.
4. **Photos are web links only.** B&Q's import only takes web links, so there is no photo upload and no photo preview in the tool.
   - Each photo link is listed as text (website / file name) with **Open** (checks the photo in a new tab), **Make main** and **×** (remove). Amber notes warn about Amazon links, iili.io links that may disappear and links that might not be a photo.
   - **Product with no photos yet:** the count line says *No main photo, add one.* (later, for example, *Photo links: 5 of 9 (main photo: yes). You can add 4 more.*). You get two boxes:
     - **Main photo link:** paste one `https://` link and click **Set main photo** (or press Enter). It becomes the main photo (`image_main_1`).
     - **Other photo links (up to 8):** paste all your other links at once – any mess is fine. The tool only takes links that **start with `https://` and end with `.jpg`, `.jpeg` or `.png`** (any case, e.g. `.JPG`) and ignores everything else in the box: labels, numbers like `1)`, words, commas, `http://` links, `.webp`/`.gif` links and links without those endings. Links can be on separate lines, separated by spaces, commas or semicolons, or stuck together with no gap. Order is kept, the same link twice is used once, and it shows a note such as *8 links found, 2 bits of text ignored → Photo 2 to 9.* Photo 2 to 9 are filled in order (`image_secondary_1` to `8`). Typed links are used when you leave the box or click **Use these links**.
   - The same rule applies to the **Main photo link** box, the **Update main / Update other photos** boxes and the photo columns of your Excel/CSV file. Only more than 8 other links, or two links in the Main photo box, give a red message. Links on Amazon or on iili.io get an amber warning, because they can stop working.
   - **Product that already has photos** (on B&Q, or copied from a sister SKU): the status line says, for example, *We have photos: main photo yes, 4 extra photos (5 of 9). You can add 4 more.* The two boxes start empty:
     - **Update main photo:** paste one link to replace your main photo (`image_main_1` only). You'll see *Main photo replaced.*
     - **Update other photos:** paste all other photo links at once (up to 8) to replace your existing extra photos (`image_secondary_1` to `8`). You'll see, for example, *Replaced 4 extra photos with 6 new.* Links you don't paste are dropped. To keep them and add more, click **Copy the current links into the box** first.
     - Each box has its own **Undo**, which brings back what was there before. If nothing in what you pasted can be used, nothing is replaced.
   - **Product already live on B&Q (Fix existing):** the tool reads the photos B&Q already has from your B&Q product export (built in). You see no preview, just the count line, for example *We have photos – Photos on B&Q: 5 of 9, main photo: yes. You can add 4 more.* and the two boxes **Update main photo** and **Update other photos**.
     - It never asks for a main photo for a live product and never holds it back for photos. To change only the title, bullets or description: edit them, then download – the photos stay as they are.
     - The file sends B&Q's own photo links back in the same places (`image_main_1`, `image_secondary_1` to `8`, gaps stay gaps), because an empty photo cell in a B&Q upload wipes that photo. Links you paste in the Update boxes replace them.
     - If your B&Q export has no photo links for a live product, the line says *Photos already on B&Q – kept.* Nothing is required and nothing is changed. If you remove every photo with ×, B&Q needs a main photo again.
     - Its other B&Q values come from the same export too: category, weight, brand, pack, product type, guarantee and the rest. They are filled in (marked *B&Q export*) and written back unchanged, so a title/description-only fix isn't held back for them and the upload doesn't blank them.
     - **Brand:** every file – fix and new – writes **OVOVO** as the brand (it is on B&Q's brand list in the 2 Nov 2026 export). A live product that B&Q has as *SuperGift.com*, *SuperGift* or *True Gift(s)* (any spelling) goes out as OVOVO; another brand B&Q already has for it is kept. The GPSR manufacturer name is written back as B&Q has it (only *True Gift(s)* there becomes OVOVO, as before). New in 3.5.12: the *Acquisition brand* list inside all 67 B&Q templates is refreshed from that export, so OVOVO is in the brand drop-down when you open a downloaded file in Excel. No brand name (OVOVO, SuperGift, True Gift) is ever put in the title, bullets, description or key feature – it is taken out of B&Q's live text too.
     - **Text is finished for you.** The title, bullets, description and key feature already on B&Q are kept, and anything missing or below the rules is added automatically, marked **Written automatically**. The title is cleaned (no brand, repeated words, capitals or trailing commas) and lengthened to 121–124 characters with real search words; bullets are topped up to 8; the description is extended to 150+ words; an empty key feature gets one (max 30 characters). The card lists what was added.
     - If you then edit a field below the rules, the card says exactly what to do, for example *Title is 111 characters – add 10 more, or press Auto-fix this product.* The **Auto-fix this product** button (on the card and in the box at the top) fills every gap at once and keeps what you typed.
     - The box at the top says what is left for you, for example *1 product needs a main photo link – everything else was filled in for you.* Normally that is only a main photo for a product with no photo on B&Q, or a weight B&Q doesn't have.
     - The built-in list is from the B&Q export of **2 Nov 2026** – the top of the screen shows *B&Q data: 2 Nov 2026*. If you changed photos in the B&Q portal after that, paste the current links in the Update boxes.
   - **Optional, for many products:** your Excel/CSV file on Add can also have the columns **Main photo link** and **Other photo links** (all other links in one cell; up to 8 are used). Those products arrive with the photos set, so they show **We have photos: …** and the Update boxes. A link the tool can’t use (e.g. http:// instead of https://) is shown in red and left out – fix it in the box.
   - **Tip:** use a photo host you control. On freeimage.host / iili.io, leave **Don't autodelete** selected (the default). Free hosts don't promise to keep files, so links can stop working. The tool never uploads photos for you.
5. **Variant Group ID** is filled automatically:
   - from your **All variant.xlsx** if you loaded it (blank if the SKU is not in it);
   - otherwise products with the same name in a category that allows variants get one group;
   - blank where B&Q does not allow variants.
6. **Add variant (new in 3.5.13)** – to make a new colour, size or measurement of a product without retyping it:
   1. On the product card, click **+ Add variant**.
   2. Choose what is different: **Colour**, **Size** or **Measurements**.
   3. Type the value of this product (for example *Large*, only asked the first time), the value of the new one (for example *Medium*), and the new SKU. The tool refuses an empty value, a value already used in the group, a SKU with spaces, and a SKU already in your list or already live on B&Q.
   4. **Variant Group code:** all products in the group share one code. It starts as the base SKU; you can change it in the form or later on any card of the group (it changes for all of them).
   5. Click **Create variant**. A new card appears under the product, marked *Variant of …*. It copies the category, answers and fields, but **not** the EAN, photos, weight or size – type its **own EAN** (box on the card), weight and photo. It is held back until you do.
   6. The value goes in each title (written for you) and in the template's **Colour / Colour group / Size** column where the category has one (drop-down values must match the list; the card says where the value goes). Measurements like *60 x 40 x 10 cm* also fill the size boxes.
   7. If the category **doesn't allow variants** on B&Q, the form says so clearly. You can still make the new product: it is then a separate product with **no** group code.
7. **Pack (new in 3.5.13)** – tick **Pack** (*several items sold as one listing*) at the top of *You add these* on the card and type how many are in the pack (N). Then:
   - the boxes change to **Whole pack total weight** and **Shipping package length / width / height** – type the totals of the whole pack as it is shipped (the separate Packed size boxes are hidden);
   - the file gets those totals, **Pack type = Pack** and **Pack quantity = N** (and **Number of pieces = N** where the template has it);
   - the title gets **Pack of N**;
   - postage: B&Q's templates have no postage column – the only weight sent is the whole-pack total weight, so use the shipped weight there.
8. **Mixed pack (new in 3.5.13)** – inside Pack, tick **Mixed pack** (*items of different sizes*). For each item type a label (e.g. *M*), how many, L × W × H in cm and, if you know it, the weight; **+ Add item** adds a line. Then:
   - bullet 2 and the end of the description get a line such as *Pack of 3: 1 x M (40 x 30 x 10cm), 2 x S (30 x 20 x 10cm)*;
   - the file still uses the **whole-pack totals** from the boxes above;
   - if you leave those totals empty, the tool fills them for you – size from the **largest item**, weight as the **sum of the item weights** (only when every item has a weight) – and marks them **Medium – please check** on the card and in *Please check* on Check. Type the real totals if you know them.
9. Click **Next →**.

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
6. **Fresher B&Q data** (photos, live text and values of your live products): the tool shows the date of its built-in data at the top (*B&Q data: 2 Nov 2026*). A newer B&Q product export is built in by your helper with `python3 work/v3510/refresh_bq_data.py <export.xlsx>` then `cd src && python3 build.py && python3 make_final.py` (this also refreshes the brand list in every template from the export's *ReferenceData* sheet), and published as a new version.

## F. If something goes wrong
1. A red box "Sorry – that didn't work" appears: nothing was sent anywhere. Try again. If it repeats, take a screenshot and send it.
2. A page that only shows "If you can see this, the tool isn't running" was opened in a preview. Open it in Chrome/Edge (Windows) or Safari via the web link (iPhone).
