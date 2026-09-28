# Weblab desktop

From the dashboard, **Open file or folder** accepts a plain `.html` file or a website folder with a `package.json` dev script. For HTML, Weblab copies the file and its linked local web assets into a separate folder in Documents/Weblab, then edits that copy. The client's original stays untouched. Keep the assets beside the HTML file in the relative layout the page expects. Data files and files loaded dynamically by scripts may need to be added to the imported folder by hand.

For a Next.js or other app project, choose its folder. A live URL alone has no local source for Weblab to save edits to. For a ZIP export, unpack it first, then choose its HTML file or project folder. Images, PDFs, and design mockups can guide a new build, but they are not editable HTML.

## Work in more than one website

Drag a website folder from Finder onto the Weblab Dock icon or onto a Weblab window. If that window is editing another website, the dropped folder opens in a new window. The packaged Mac app accepts folder drops even when it is closed. A folder needs a `package.json` with a `dev` script.

On the dashboard, Command-click a site or right-click it and choose **Open in New Window**. Each window runs its own website. **Back** returns that window to the dashboard, while closing a window stops only its website. If a website is already open, Weblab brings its window forward.
