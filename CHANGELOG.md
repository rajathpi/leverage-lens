# What's new in Leverage Lens

Newest version first. Each version is also on the [Releases](../../releases) page with a zip to download.

## Not released yet

- The card now also shows on Avanza's buy and sell order page, so your numbers and your planned buy/sell prices stay in view while you place the order.
- Fixed: certificates without an underlying in Avanza's data (crypto trackers such as Valour THORChain) showed dashes. They now show the asset's name, "Bid vs last close" and the number of owners on Avanza.
- Crypto trackers (Valour and similar): the coin's live price from Binance (e.g. RUNE/USDT), what the tracker is worth right now given the coin's move since Avanza's last quote (useful on evenings and weekends), and **Plan a trade** in the coin's price: "buy when RUNE hits 0.50, sell at 0.70" gives the tracker price at each level and your result.
- Every 1× tracker with a quoted underlying (e.g. Valour Bitcoin on BTC/USD) also gets Plan a trade.
- Long underlying codes like "XXR-BTCUSD-SPOT" now show as their name ("BTC/USD").

## 0.1.2 — 27 Oct 2026

- Works in Firefox (128 or newer) as well as Chrome, Edge and Brave.
- Fixed: on BULL/BEAR pages, "Bid vs last close" and the 1 week / 1 month / 3 months numbers showed dashes after Avanza's market maker closed for the day.
- Added a privacy section to the README: the extension collects no data.

## 0.1.0 — 27 Oct 2026

First release.

- **Mini future and turbo pages:** live leverage, what 1 % in the underlying does to the mini, stop loss, financing level, distance to the stop and today's chart of the underlying.
- **Plan a trade:** type the level you want to buy and sell at, or the mini price, plus an amount. You get the mini price at each level (buy at the ask, sell at the bid), how many units you get and the result in % and SEK.
- **BULL/BEAR pages:** leverage, the underlying's move today times the leverage next to the actual bid, 1 week / 1 month / 3 months / since start, and the one-day move that would wipe it out.
- **Stock and index pages** (including Guld, OMXS30 and Nasdaq): every mini, turbo and BULL/BEAR, long and short. Filter by issuer (AVA or all) and type, sort by leverage, spread or most traded.
- Light and dark theme, and a button to tuck the card away.
