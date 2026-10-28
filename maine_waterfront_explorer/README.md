# Maine Waterfront Explorer — GitHub Pages edition

A static version of the original `maine_waterfront_explorer.html`, separated into smaller files. No npm, Node, build step, server backend, API key, or hosting service beyond GitHub Pages is required.

## Publish it on GitHub Pages

1. Unzip `maine_waterfront_explorer_github.zip` on your computer.
2. In your GitHub repository, use **Add file → Upload files** and upload the **contents of the extracted folder** (not the ZIP itself). All the `.js`, `.css` and `.html` files go at the **repository root**, alongside `index.html`.
3. Commit the upload.
4. Under your repository's **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
5. Visit `https://YOUR-USERNAME.github.io/YOUR-REPO/` when GitHub Pages reports that deployment has completed.

Don't open the individual data JavaScript files in GitHub and expect them to be web pages. Open the Pages URL, which loads `index.html` and all companion files.

You can also double-click `index.html` locally. The data loads via JavaScript files without a `fetch()` request, so a local development server is optional.

## File layout

- `index.html`: small HTML shell and script references; GitHub Pages entry point.
- `style.css`: original styling, including light/dark themes and responsive layout.
- `app.js`: original interactive application logic.
- `data-core.js`: codebook, interviews, maps, topics, and other metadata.
- `data-passages-01.js` through `data-passages-07.js`: all 6,838 interview passages, in original order.
- `data-search-index.js`, `data-search-eq.js`, `data-search-wq.js`: all original keyword and embedding search data.

**Important:** Don't rename or omit any of these files. The `index.html` file loads them in order. No modifications have been made to the dataset's values or the app's logic.
