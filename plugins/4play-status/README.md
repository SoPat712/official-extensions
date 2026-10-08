# 4play status

Type `!4play` or `!fourplay` to see a live status card for the lolcat 4play transport. It shows the connection state, warmed sessions with time left until they expire, blocked origins with their cooldowns, how many containers are in use, open captcha tabs and the background warmup schedule.

By default only admins see the card. Anyone can run the bang, but the status and clear controls only unlock for users logged into the settings panel. The plugin settings let you change that. Keep `admin`, use `open` on a trusted local instance, or use `locked` to turn the status API off on a public one.

## Controls

- **Refresh** reads the latest status again.
- **Test 4play** fetches `https://example.com` through the selected transport and shows the result on the card. It also wakes up a transport that hasn't served a fetch yet.
- **Clear all sessions** deletes every warmed session and cookie jar and retires the pooled containers.
- The **x** on a row clears just that origin's session.

Clears go through a control channel, and the transport picks them up within a few seconds. The card refreshes once the request finishes.

## Transport detection

The "4play transport" setting is a dropdown of the installed transports, so you never type a name. The card reads the list from `/api/extensions?type=transports` each time it loads and caches it across restarts. Before the card has run for the first time, the plugin scans the transports folder next to it instead.

It picks the first installed transport whose name mentions 4play, which is right on a normal install and on forks. Choose another one if you run a third-party 4play transport or renamed yours to something without 4play in it.

The app only gives a transport its cache handle on the transport's first fetch. After a restart the card shows "asleep" until a search goes through the transport. Press "Test 4play" to wake it.

## Requirements

- The lolcat 4play transport, installed and connected.
- For sessions that are always ready, set the transport's "Background warmup interval".

## Settings

- **Status view access.** `admin` needs a valid settings session. `open` skips the session check, so anyone who can run the bang can view and clear 4play status. `locked` turns the status API off for everyone.
- **4play transport.** A dropdown of installed transports, set to the first one whose name mentions 4play.
- **Firefox browser link.** A URL that opens the Firefox running the 4play extension. With it set, the card shows an "Open Firefox" button and a link on every captcha that needs you.
