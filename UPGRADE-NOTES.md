# LinkHub dashboard + business creation upgrade

The dashboard graphics use the existing `store_dashboard(p_days)` RPC from your LinkHub v24 SQL. The supplied SQL already returns visitors, listing views, contact taps, chats, offers, sales and ratings, so the new charts do not require replacing that RPC.

The included `LinkHub-business-upgrade.sql` is an additive migration for the new business profile fields: business type, tagline, website, WhatsApp and Instagram, plus an optional theme field for store designs.
