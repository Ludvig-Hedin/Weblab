# Weblab desktop

From the dashboard, **Open file or folder** accepts a plain `.html` file or a website folder with a `package.json` dev script. For HTML, Weblab copies the file and its linked local web assets into a separate folder in Documents/Weblab, then edits that copy. The client's original stays untouched. Keep the assets beside the HTML file in the relative layout the page expects. Data files and files loaded dynamically by scripts may need to be added to the imported folder by hand.

For a Next.js or other app project, choose its folder. A live URL alone has no local source for Weblab to save edits to. For a ZIP export, unpack it first, then choose its HTML file or project folder. Images, PDFs, and design mockups can guide a new build, but they are not editable HTML.

## Work in more than one website

Drag a website folder from Finder onto the Weblab Dock icon or onto a Weblab window. If that window is editing another website, the dropped folder opens in a new window. The packaged Mac app accepts folder drops even when it is closed. A folder needs a `package.json` with a `dev` script.

On the dashboard, Command-click a site or right-click it and choose **Open in New Window**. Each window runs its own website. **Back** returns that window to the dashboard, while closing a window stops only its website. If a website is already open, Weblab brings its window forward.


Sites can be grouped in folder cards alongside ungrouped sites. Each card shows previews and a site count. Open it to see its sites, then use Sites above the grid to return. These folders only change the list; they do not move files on disk. Show details shows the full editing location and lets you locate a moved folder. New sites use checked macOS bookmarks where available. Existing sites need one explicit folder confirmation. A copied folder is never silently treated as the old project.

Close a site before moving it in Finder. Reopening can recover a checked same-volume move; otherwise use Locate folder and confirm both locations. Relinking is blocked while any window still uses the site. The editor refuses new work when its root changes and attempts to cancel running agents, but cannot undo a command already executing or repair another tool's absolute paths. Keep Git linked-worktree pointers valid with your Git tool; Weblab does not repair them automatically.
