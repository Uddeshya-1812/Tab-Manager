# Tab Manager

A simple Chrome Extension to manage your tabs, group them by domain, close duplicates, and automatically hibernate inactive tabs to save memory.

## Features

- **Active Tab Management**: View, switch, and close all open tabs from the popup.
- **Group by Domain**: Automatically organize your loose tabs into Chrome Tab Groups based on their domains (e.g., all `github.com` tabs get grouped together).
- **Close Duplicates**: Instantly find and close any duplicate tabs that share the exact same URL.
- **Auto-Hibernation**: A background service worker tracks your activity. If a group or a loose tab sits untouched for a set period (default 6 mins), it automatically closes the tabs and dumps them to your local hard drive to free up RAM.
- **Safe Storage Cap**: Implements an 1 MB hard limit on saved data. If you hit the limit, you get a clean UI warning allowing you to manually or automatically clear the oldest data.
- **Import/Export JSON**: Export your saved groups as JSON files to back them up or share them. You can easily import them back into the extension anytime.

## Tech Stack
- Vanilla JavaScript (ES6+)
- HTML5 & CSS3 Variables (No heavy frameworks like React)
- Chrome Extension APIs (`tabs`, `tabGroups`, `storage`, `alarms`, `runtime`)
- Manifest V3 Architecture (Zero idle memory overhead)

## How to Install (Developer Mode)

1. Open Google Chrome.
2. Go to `chrome://extensions/` in your address bar.
3. In the top right corner, toggle **Developer mode** to ON.
4. Click on the **Load unpacked** button in the top left.
5. Select the `tab manager` folder (this folder containing the `manifest.json` file).
6. The extension will be loaded and you will see its icon in your extensions toolbar. Pin it for easy access!
