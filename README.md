# CESIUM

CESIUM is a quiet browser puzzle about discovering all 118 chemical elements on a 4×4 board. It began as **2048-lab**, an OpenAI Student Collective competition submission.

## Play

Open `index.html` in a current browser, or extract the repository ZIP and open it from the extracted folder. All game code, data, visuals, and procedural audio run locally. There are no runtime dependencies.

- Click an empty cell to create hydrogen. Drag tiles together to add their atomic numbers. A sum above 118 leaves both tiles in place.
- Select an occupied tile and then choose a destination to move or merge without dragging. Arrow keys move between cells, Enter or Space activates a cell, and Esc clears a selection.
- Hover to preview an element card or click to pin it. Right-click, long-press, or press Shift+F10 to store, delete, or inspect a tile.
- Open Collection for the periodic table, inventory, favourites, achievements, and discovery timeline. Retrieve stored elements into empty cells. Undo reverses board and inventory changes while keeping discoveries and achievements unlocked.
- The daily challenge uses a fixed starting board and a merge limit. Sandbox progress is stored separately. Complete the sandbox table to download a PNG certificate.

## Saves and the Windows launcher

Settings can export and import complete JSON saves. Automatic storage belongs to the browser and page origin. With `file://` the browser may treat each file path differently or deny storage. Export a JSON backup before moving the folder or changing browsers.

On Windows, run `start-game.bat` to host the game at `http://127.0.0.1:8765/` using Python 3. Keep its terminal open while playing. It opens the HTML file directly if Python 3 is unavailable. On macOS or Linux, run `python3 -m http.server 8765 --bind 127.0.0.1` from the project folder and open the same address. Use that exact address on subsequent visits for the same local save. A GitHub Pages deployment has its own origin and save. Export and import JSON to move progress among file, local server, and hosted copies.

Undo history is kept for up to 64 actions in the current session. Board, inventory, discoveries, settings, and challenge attempts are saved across reloads.

## Hosting and tests

For GitHub Pages, choose **Settings → Pages → Deploy from a branch → main / (root)**. Assets use relative paths, so the game can be hosted under a repository path. GitHub's **Code → Download ZIP** archive includes everything needed for offline play.

With Node.js 22 or newer, run `node --test` from the project folder. The dependency-free suite exercises the game rules, all 118 registry entries, save validation, and solvability of every daily challenge template.

## Element data

Game fusions are arithmetic. The element cards describe real elements and are bundled for offline use.

- Atomic numbers, symbols, and names follow the [IUPAC periodic table](https://iupac.org/what-we-do/periodic-table-of-elements/), including *caesium* in the element registry. Most weights use abridged values, following [CIAAW's standard atomic weights](https://ciaaw.org/abridged-atomic-weights.htm). A bracketed integer identifies a representative radioactive isotope by mass number for an element without a standard weight.
- Basic positional, phase, and configuration data were cross-referenced with [Periodic Table JSON](https://github.com/Bowserinator/Periodic-Table-JSON). [NIST atomic spectra](https://physics.nist.gov/PhysRefData/ASD/), the [Royal Society of Chemistry periodic table](https://www.rsc.org/periodic-table), and IUPAC are further references for element properties. The inspector marks calculated superheavy configurations as predicted and leaves unconfirmed bulk phases unknown.
- Colour families are a display convention. Groups 17 and 18 share their respective colours even when chemistry is uncertain, zinc-group metals are included in the transition block, and both 15-member f-block series occupy separate rows without individual group numbers. Selected room-temperature crystal structures and oxide examples are shown where listed.
