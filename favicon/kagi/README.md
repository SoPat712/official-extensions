# Kagi Favicons

Gets icons from the favicon proxy Kagi News uses:

```
https://news.kagi.com/api/favicon-proxy?domain=<host>&quality=fast
```

No Kagi account needed. SearXNG uses the same endpoint.

This isn't a documented API, so Kagi can change or close it at any time. Keep another provider below this one.

## Settings

- **Quality**: `fast` (default) or `best`. `best` finds more icons but sometimes returns SVGs, which degoog skips and passes to the next provider.

## Privacy

Kagi sees every domain in your results. The requests come from your server's IP, or from the proxy or transport you set for this provider. Your visitors and their queries never reach Kagi, but a burst of domains arriving together still hints at what someone searched.
