# Site favicon (experimental)

Gets each site's icon from the site itself, with no favicon service in between.

It reads the icon links on the site's homepage and picks the PNG or ICO closest to 64px. If the page lists none, it uses `/favicon.ico`. Found icons are remembered for 24 hours, so a homepage isn't fetched on every search.

## Settings

- **Timeout (ms)**: how long to wait for the homepage, 1000 to 10000.
- **Remember found icons (hours)**: how long to reuse a found icon, 1 to 720.

## Privacy

No favicon service sees anything. Instead, every site in your results sees your server fetch its homepage and icon, including sites nobody clicks. The requests come from your server's IP, or from the proxy or transport you set for this provider. On a busy public instance that adds up. Your visitors are never exposed.

## Why experimental

Many homepages are slow, huge or behind bot checks, so this misses more often than the other providers. Keep one of them below it.
