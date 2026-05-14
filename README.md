# Tab Manager

A simple and efficient Chrome Extension to manage your browser tabs, group them by domain, close duplicates, and automatically hibernate inactive tabs to save your computer's memory. 

## Features

- **Active Tab Management**: View, switch, and individually close open tabs and Chrome Tab Groups directly from the popup.
- **Group by Domain**: Automatically organize your loose tabs into Chrome Tab Groups based on their domains (e.g., all `github.com` tabs get grouped together).
- **Close Duplicates**: Instantly find and close any duplicate tabs that share the exact same URL.
- **Manual Hibernation**: Click the hibernate button next to any Active Group in the popup to instantly close it and save it.
- **Saved Groups**: View all your hibernated groups. You can restore them, export them as JSON files to back them up, or import JSON backups from another computer.
- **Storage Limits**: Implements a strict 1 MB limit on saved data to prevent browser slowdowns. If you hit the limit, a warning appears allowing you to manually remove data or auto-remove the oldest groups.

## How it Works Under the Hood

- **No Heavy Frameworks**: Built using Vanilla HTML, CSS, and JavaScript to keep the extension as lightweight as possible.
- **Manifest V3 Service Workers**: The background script shuts down completely when you aren't using it, meaning it uses zero memory while idle. It only wakes up briefly every 5 minutes to check for inactive tabs.
- **Memory Leak Prevention**: Listens for when you close tabs and immediately deletes their tracking data so the extension doesn't slow down over months of use.
- **Data Optimization**: Automatically strips heavy image data from website icons before saving tabs to storage, which lets you save thousands of tabs within the 1 MB limit.

## Tech Stack
- Vanilla JavaScript (ES6+)
- HTML5 & CSS3
- Chrome Extension APIs (`tabs`, `tabGroups`, `storage`)
